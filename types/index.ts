export interface Contact {
  id: number;
  phone: string;
  name: string;
  avatar_url?: string;
  last_message?: string;
  last_message_at?: string;
  created_at: string;
  ai_enabled?: boolean
}

export interface ContactDisplay {
  id: number;
  phone: string;
  name: string;
  lastMessage: string;
  timestamp: Date;
  unread: number;
  avatar: string;
  ai_enabled?: boolean
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
  type?: "text" | "image" | "audio"
  file_url?: string
  file_name?: string
}

export interface MessageDisplay {
  id: number;
  text: string;
  fromMe: boolean;
  timestamp: Date;
  status: MessageStatus;
  type?: "text" | "image" | "audio"
  fileUrl?: string
  fileName?: string
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


export interface UploadFileRequest {
  file: File
  contactId: number
  type: "image" | "audio"
}