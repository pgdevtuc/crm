import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SendMessageRequest, SendMessageResponse, Message } from '@/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface WhatsAppSendPayload {
  messaging_product: string;
  to: string;
  type: string;
  text: {
    body: string;
  };
}

interface WhatsAppSendResponse {
  messaging_product: string;
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const { to, message, contactId } = await request.json() as SendMessageRequest;

    if (!to || !message) {
      return NextResponse.json(
        { error: 'Phone number and message are required' },
        { status: 400 }
      );
    }

    // Enviar mensaje a WhatsApp API
    const whatsappPayload: WhatsAppSendPayload = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: message }
    };

    const whatsappResponse = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(whatsappPayload)
      }
    );

    if (!whatsappResponse.ok) {
      const errorData = await whatsappResponse.json();
      throw new Error(`WhatsApp API error: ${JSON.stringify(errorData)}`);
    }

    const whatsappData = await whatsappResponse.json() as WhatsAppSendResponse;
    const messageId = whatsappData.messages[0].id;

    // Guardar mensaje en Supabase
    const { data: savedMessage, error } = await supabase
      .from('messages')
      .insert({
        contact_id: contactId,
        whatsapp_message_id: messageId,
        text: message,
        from_me: true,
        status: 'sent',
        timestamp: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Actualizar contacto
    await supabase
      .from('contacts')
      .update({
        last_message: message,
        last_message_at: new Date().toISOString()
      })
      .eq('id', contactId);

    const response: SendMessageResponse = {
      success: true,
      message: savedMessage as Message,
      whatsappMessageId: messageId
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error sending message:', error);
    const errorResponse: SendMessageResponse = {
      success: false,
      error: 'Failed to send message'
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}