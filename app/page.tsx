// app/page.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, Phone, Search, MoreVertical, Check, CheckCheck, Menu, X } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function WhatsAppCRM() {
  type Contact = {
    id: string | number;
    phone: string;
    name: string;
    lastMessage: string;
    timestamp: Date;
    unread: number;
    avatar: string;
  };

  type Message = {
    id: string | number;
    text: string;
    fromMe: boolean;
    timestamp: Date;
    status?: string | null;
  };

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Record<string | number, Message[]>>({});
  const [messageInput, setMessageInput] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Cargar contactos desde Supabase
  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('last_message_at', { ascending: false });

    if (data) {
      setContacts(data.map(c => ({
        id: c.id,
        phone: c.phone,
        name: c.name || c.phone,
        lastMessage: c.last_message || '',
        timestamp: new Date(c.last_message_at || c.created_at),
        unread: 0,
        avatar: (c.name || c.phone).substring(0, 2).toUpperCase()
      })));
    }
  };

  // Cargar mensajes del contacto seleccionado
  useEffect(() => {
    if (!selectedContact) return;

    loadMessages(selectedContact.id);
  }, [selectedContact]);

  const loadMessages = async (contactId: string | number) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('timestamp', { ascending: true });

    if (data) {
      setMessages(prev => ({
        ...prev,
        [contactId]: data.map(m => ({
          id: m.id,
          text: m.text,
          fromMe: m.from_me,
          timestamp: new Date(m.timestamp),
          status: m.status
        }))
      }));
    }
  };

  // Suscribirse a cambios en tiempo real
  useEffect(() => {
    const messagesChannel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          const newMessage = payload.new;
          
          setMessages(prev => ({
            ...prev,
            [newMessage.contact_id]: [
              ...(prev[newMessage.contact_id] || []),
              {
                id: newMessage.id,
                text: newMessage.text,
                fromMe: newMessage.from_me,
                timestamp: new Date(newMessage.timestamp),
                status: newMessage.status
              }
            ]
          }));

          // Recargar contactos para actualizar último mensaje
          loadContacts();
        }
      )
      .subscribe();

    const contactsChannel = supabase
      .channel('contacts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contacts'
        },
        () => {
          loadContacts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(contactsChannel);
    };
  }, []);

  // Scroll al final
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedContact]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedContact) return;

    const messageText = messageInput;
    setMessageInput('');

    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedContact.phone,
          message: messageText,
          contactId: selectedContact.id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      // El mensaje se agregará automáticamente vía Realtime
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Error al enviar mensaje');
    }
  };

  const formatTime = (date: Date | string) => {
    return new Date(date).toLocaleTimeString('es-AR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatDate = (date: Date | string) => {
    const today = new Date();
    const msgDate = new Date(date);
    
    if (msgDate.toDateString() === today.toDateString()) {
      return formatTime(date);
    }
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (msgDate.toDateString() === yesterday.toDateString()) {
      return 'Ayer';
    }
    
    return msgDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  };

  const MessageStatus = ({ status }: { status: string | null | undefined }) => {
    if (status === 'sent') return <Check className="w-4 h-4 text-gray-400" />;
    if (status === 'delivered') return <CheckCheck className="w-4 h-4 text-gray-400" />;
    if (status === 'read') return <CheckCheck className="w-4 h-4 text-blue-500" />;
    return null;
  };

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar - Lista de contactos */}
      <div className={`${isSidebarOpen ? 'w-full md:w-96' : 'w-0'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 overflow-hidden md:relative absolute z-10 h-full`}>
        <div className="bg-gray-50 p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-gray-800">Mensajes</h1>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden p-2 hover:bg-gray-200 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar o iniciar un chat"
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredContacts.map(contact => (
            <div
              key={contact.id}
              onClick={() => {
                setSelectedContact(contact);
                setIsSidebarOpen(false);
              }}
              className={`flex items-center p-4 cursor-pointer hover:bg-gray-50 border-b border-gray-100 ${
                selectedContact?.id === contact.id ? 'bg-gray-100' : ''
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-white font-semibold mr-3 flex-shrink-0">
                {contact.avatar}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-gray-900 truncate">{contact.name}</h3>
                  <span className="text-xs text-gray-500 ml-2">{formatDate(contact.timestamp)}</span>
                </div>
                <p className="text-sm text-gray-600 truncate">{contact.lastMessage}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat principal */}
      <div className="flex-1 flex flex-col">
        {selectedContact ? (
          <>
            <div className="bg-gray-50 p-4 border-b border-gray-200 flex items-center">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden mr-3 p-2 hover:bg-gray-200 rounded-full"
              >
                <Menu className="w-5 h-5" />
              </button>
              
              <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-white font-semibold mr-3">
                {selectedContact.avatar}
              </div>
              
              <div className="flex-1">
                <h2 className="font-semibold text-gray-900">{selectedContact.name}</h2>
                <p className="text-sm text-gray-500">{selectedContact.phone}</p>
              </div>

              <button className="p-2 hover:bg-gray-200 rounded-full mr-2">
                <Phone className="w-5 h-5 text-gray-600" />
              </button>
              <button className="p-2 hover:bg-gray-200 rounded-full">
                <MoreVertical className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-[#e5ddd5]">
              <div className="max-w-4xl mx-auto space-y-2">
                {(messages[selectedContact.id] || []).map(msg => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-md px-4 py-2 rounded-lg shadow ${
                        msg.fromMe
                          ? 'bg-green-100 text-gray-900'
                          : 'bg-white text-gray-900'
                      }`}
                    >
                      <p className="text-sm break-words">{msg.text}</p>
                      <div className="flex items-center justify-end mt-1 space-x-1">
                        <span className="text-xs text-gray-500">{formatTime(msg.timestamp)}</span>
                        {msg.fromMe && <MessageStatus status={msg.status} />}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="bg-gray-50 p-4 border-t border-gray-200">
              <div className="flex items-center space-x-2 max-w-4xl mx-auto">
                <input
                  type="text"
                  placeholder="Escribe un mensaje"
                  className="flex-1 px-4 py-3 bg-white border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button
                  onClick={handleSendMessage}
                  className="p-3 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors disabled:opacity-50"
                  disabled={!messageInput.trim()}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <h2 className="text-3xl font-light text-gray-800 mb-2">WhatsApp CRM</h2>
              <p className="text-gray-500">Selecciona un chat para empezar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}