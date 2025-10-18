export interface Contact {
  id: number;
  phone: string;
  name: string;
  avatar_url?: string;
  last_message?: string;
  last_message_at?: string;
  created_at: string;
}

export interface ContactDisplay {
  id: number;
  phone: string;
  name: string;
  lastMessage: string;
  timestamp: Date;
  unread: number;
  avatar: string;
}

export interface Message {
  id: number;
  contact_id: number;
  whatsapp_message_id?: string;
  text: string;
  from_me: boolean;
  status: MessageStatus;
  timestamp: string;
  created_at: string;
}

export interface MessageDisplay {
  id: number;
  text: string;
  fromMe: boolean;
  timestamp: Date;
  status: MessageStatus;
}

export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'received';

export interface SendMessageRequest {
  to: string;
  message: string;
  contactId: number;
}

export interface SendMessageResponse {
  success: boolean;
  message?: Message;
  whatsappMessageId?: string;
  error?: string;
}