import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { to, message, contactId } = await request.json();

    if (!to || !message) {
      return NextResponse.json(
        { error: 'Phone number and message are required' },
        { status: 400 }
      );
    }

    // Enviar mensaje a WhatsApp API
    const whatsappResponse = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: message }
        })
      }
    );

    if (!whatsappResponse.ok) {
      const errorData = await whatsappResponse.json();
      throw new Error(`WhatsApp API error: ${JSON.stringify(errorData)}`);
    }

    const whatsappData = await whatsappResponse.json();
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

    return NextResponse.json({ 
      success: true, 
      message: savedMessage,
      whatsappMessageId: messageId 
    });
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}