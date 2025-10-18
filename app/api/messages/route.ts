import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type MediaKind = 'image' | 'audio' | 'video' | 'document' | 'sticker';

interface BaseMsg {
  from: string;
  id: string;
  timestamp: string; // epoch seconds (string)
  type: string;
  text?: { body: string };
}

type IncomingMessage =
  | (BaseMsg & { type: 'text'; text: { body: string } })
  | (BaseMsg & { type: 'image'; image: { id: string; mime_type?: string; url?: string; caption?: string } })
  | (BaseMsg & { type: 'audio'; audio: { id: string; mime_type?: string; voice?: boolean; url?: string } })
  | (BaseMsg & { type: 'video'; video: { id: string; mime_type?: string; url?: string; caption?: string } })
  | (BaseMsg & { type: 'document'; document: { id: string; mime_type?: string; filename?: string; url?: string } })
  | (BaseMsg & { type: 'sticker'; sticker: { id: string; mime_type?: string; animated?: boolean; url?: string } });

interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: { display_phone_number: string; phone_number_id: string };
      contacts?: Array<{ profile: { name: string }; wa_id: string }>;
      messages?: IncomingMessage[];
    };
    field: string;
  }>;
}

interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppWebhookEntry[];
}

// --- Utilidades ---
function getMediaField(msg: IncomingMessage): { kind: MediaKind; media: { id: string; url?: string; mime_type?: string } } | null {
  switch (msg.type) {
    case 'image': return { kind: 'image', media: msg.image };
    case 'audio': return { kind: 'audio', media: msg.audio };
    case 'video': return { kind: 'video', media: msg.video };
    case 'document': return { kind: 'document', media: msg.document };
    case 'sticker': return { kind: 'sticker', media: msg.sticker };
    default: return null;
  }
}

function extFromMime(mime?: string, fallback: string = 'bin') {
  if (!mime) return fallback;
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/mpeg': 'mp3',
    'video/mp4': 'mp4',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
  };
  return map[mime] || fallback;
}

async function resolveMediaUrl(mediaId: string): Promise<{ url: string; mime?: string }> {
  const res = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Graph /{media-id} failed: ${res.status} ${txt}`);
  }
  const js = await res.json(); // { url, mime_type, id }
  return { url: js.url, mime: js.mime_type };
}

async function downloadMedia(url: string): Promise<{ bytes: ArrayBuffer; contentType?: string }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Download failed: ${res.status} ${txt}`);
  }
  const contentType = res.headers.get('content-type') || undefined;
  const bytes = await res.arrayBuffer();
  return { bytes, contentType };
}

async function uploadToSupabase(bytes: ArrayBuffer, path: string, contentType?: string) {
  // Next.js runtime soporta Blob; Supabase acepta Blob/File en server
  const blob = new Blob([bytes], { type: contentType || 'application/octet-stream' });
  const { data, error } = await supabase.storage.from('chat-media').upload(path, blob, {
    contentType: contentType || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;
  const { data: pub } = supabase.storage.from('chat-media').getPublicUrl(path);
  return { publicUrl: pub.publicUrl };
}

// --- Verificación del webhook (GET) ---
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// --- Recepción de mensajes (POST) ---
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as WhatsAppWebhookPayload;

    const firstEntry = body.entry?.[0];
    const change = firstEntry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages ?? [];
    const contactName = value?.contacts?.[0]?.profile?.name || 'Unknown';
    const from = messages[0]?.from;

    if (!messages.length || !from) {
      return NextResponse.json({ success: true }); // nada que procesar
    }

    // Buscar o crear contacto
    let { data: contact } = await supabase.from('contacts').select('*').eq('phone', from).single();
    if (!contact) {
      const { data: newContact } = await supabase
        .from('contacts')
        .insert({ phone: from, name: contactName, created_at: new Date().toISOString() })
        .select()
        .single();
      contact = newContact;
    }
    if (!contact) throw new Error('Failed to create or find contact');

    const msg = messages[0];
    const msgId = msg.id;
    const timestampIso = new Date(parseInt(msg.timestamp, 10) * 1000).toISOString();
    const textBody = msg.type === 'text' ? msg.text.body : (msg as any)?.[msg.type]?.caption || '';

    let fileUrl: string | null = null;
    let savedFileName: string | null = null;
    let type = msg.type;

    // Si es media, resuelve y descarga
    const mediaInfo = getMediaField(msg);
    if (mediaInfo) {
      const { kind, media } = mediaInfo;

      // 1) obtener URL temporal (usa la del webhook si viene, si no, resuelve por /{media-id})
      let mediaUrl = media.url;
      let mime = media.mime_type;
      if (!mediaUrl) {
        const resolved = await resolveMediaUrl(media.id);
        mediaUrl = resolved.url;
        mime = mime || resolved.mime;
      }

      // 2) descargar binario
      const { bytes, contentType } = await downloadMedia(mediaUrl!);
      const finalMime = contentType || mime || 'application/octet-stream';
      const ext = extFromMime(finalMime, kind === 'image' ? 'jpg' : kind === 'audio' ? 'ogg' : 'bin');

      // 3) subir a Supabase
      const fileName = `${msgId}.${ext}`;
      const filePath = `${contact.id}/${fileName}`;
      const { publicUrl } = await uploadToSupabase(bytes, filePath, finalMime);

      fileUrl = publicUrl;
      savedFileName = fileName;
      type = kind; // normalizamos el tipo
    }

    // Guardar mensaje
    await supabase.from('messages').insert({
      contact_id: contact.id,
      whatsapp_message_id: msgId,
      text: textBody,
      from_me: false,
      status: 'received',
      type,
      file_url: fileUrl,
      file_name: savedFileName,
      timestamp: timestampIso,
    });

    // Actualizar contacto
    await supabase.from('contacts').update({
      last_message: textBody || (mediaInfo ? `[${type}]` : ''),
      last_message_at: timestampIso,
    }).eq('id', contact.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error processing webhook:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
