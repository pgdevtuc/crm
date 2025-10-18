import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Contact, Message } from '@/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        profile: {
          name: string;
        };
        wa_id: string;
      }>;
      messages?: Array<{
        from: string;
        id: string;
        timestamp: string;
        text?: {
          body: string;
        };
        type: string;
      }>;
    };
    field: string;
  }>;
}

interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppWebhookEntry[];
}

// Verificación del webhook (GET)
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

// Recibir mensajes (POST)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as WhatsAppWebhookPayload;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ success: true });
    }

    const message = messages[0];
    const from = message.from;
    const messageText = message.text?.body || '';
    const messageId = message.id;
    const timestamp = message.timestamp;

    // Buscar o crear contacto
    let { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('phone', from)
      .single();

    if (contactError || !contact) {
      const { data: newContact } = await supabase
        .from('contacts')
        .insert({
          phone: from,
          name: from,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      contact = newContact as Contact;
    }

    if (!contact) {
      throw new Error('Failed to create or find contact');
    }

    // Guardar mensaje
    await supabase
      .from('messages')
      .insert({
        contact_id: contact.id,
        whatsapp_message_id: messageId,
        text: messageText,
        from_me: false,
        status: 'received',
        timestamp: new Date(parseInt(timestamp) * 1000).toISOString()
      });

    // Actualizar último mensaje del contacto
    await supabase
      .from('contacts')
      .update({
        last_message: messageText,
        last_message_at: new Date(parseInt(timestamp) * 1000).toISOString()
      })
      .eq('id', contact.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}