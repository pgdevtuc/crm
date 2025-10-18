"use client"

import { useState, useEffect } from "react"
import type { User, RealtimeChannel } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { LoginForm } from "@/components/auth/login-form"
import { ContactList } from "@/components/chat/contact-list"
import { ChatHeader } from "@/components/chat/chat-header"
import { MessageList } from "@/components/chat/message-list"
import { MessageInput } from "@/components/chat/message-input"
import { EmptyState } from "@/components/chat/empty-state"
import type { Contact, ContactDisplay, Message, MessageDisplay } from "@/types"

export default function WhatsAppCRM() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [contacts, setContacts] = useState<ContactDisplay[]>([])
  const [selectedContact, setSelectedContact] = useState<ContactDisplay | null>(null)
  const [messages, setMessages] = useState<Record<number, MessageDisplay[]>>({})
  const [searchTerm, setSearchTerm] = useState<string>("")
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true)

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSelectedContact(null)
    setContacts([])
    setMessages({})
  }

  // Load contacts
  useEffect(() => {
    if (user) {
      loadContacts()
    }
  }, [user])

  const loadContacts = async () => {
    const { data, error } = await supabase.from("contacts").select("*").order("last_message_at", { ascending: false })

    if (error) {
      console.error("Error loading contacts:", error)
      return
    }

    if (data) {
      const contactsData = data as Contact[]
      setContacts(
        contactsData.map((c) => ({
          id: c.id,
          phone: c.phone,
          name: c.name || c.phone,
          lastMessage: c.last_message || "",
          timestamp: new Date(c.last_message_at || c.created_at),
          unread: 0,
          avatar: (c.name || c.phone).substring(0, 2).toUpperCase(),
          ai_enabled: c.ai_enabled || false,
        })),
      )
    }
  }

  // Load messages
  useEffect(() => {
    if (!selectedContact || !user) return
    loadMessages(selectedContact.id)
  }, [selectedContact, user])

  const loadMessages = async (contactId: number) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("contact_id", contactId)
      .order("timestamp", { ascending: true })

    if (error) {
      console.error("Error loading messages:", error)
      return
    }

    if (data) {
      const messagesData = data as Message[]
      setMessages((prev) => ({
        ...prev,
        [contactId]: messagesData.map((m) => ({
          id: m.id,
          text: m.text,
          fromMe: m.from_me,
          timestamp: new Date(m.timestamp),
          status: m.status,
          type: m.type || "text",
          fileUrl: m.file_url,
          fileName: m.file_name,
        })),
      }))
    }
  }

  // Realtime
  useEffect(() => {
    if (!user) return

    const messagesChannel: RealtimeChannel = supabase
      .channel("messages-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMessage = payload.new as Message

          setMessages((prev) => ({
            ...prev,
            [newMessage.contact_id]: [
              ...(prev[newMessage.contact_id] || []),
              {
                id: newMessage.id,
                text: newMessage.text,
                fromMe: newMessage.from_me,
                timestamp: new Date(newMessage.timestamp),
                status: newMessage.status,
                type: newMessage.type || "text",
                fileUrl: newMessage.file_url,
                fileName: newMessage.file_name,
              },
            ],
          }))

          loadContacts()
        },
      )
      .subscribe()

    const contactsChannel: RealtimeChannel = supabase
      .channel("contacts-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contacts",
        },
        () => {
          loadContacts()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(messagesChannel)
      supabase.removeChannel(contactsChannel)
    }
  }, [user])

  const handleSendMessage = async (
    messageText: string,
    file?: { url: string; fileName: string; type: "image" | "audio" },
  ) => {
    if (!selectedContact) return

    try {
      const requestBody: any = {
        to: selectedContact.phone,
        message: messageText,
        contactId: selectedContact.id,
      }

      // Add file data if present
      if (file) {
        requestBody.type = file.type
        requestBody.fileUrl = file.url
        requestBody.fileName = file.fileName
      }

      const response = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error("Failed to send message")
      }
    } catch (error) {
      console.error("Error sending message:", error)
      alert("Error al enviar mensaje")
    }
  }

  const handleSelectContact = (contact: ContactDisplay) => {
    setSelectedContact(contact)
    setIsSidebarOpen(false)
  }

  const handleBack = () => {
    setSelectedContact(null)
    setIsSidebarOpen(true)
  }

  const handleToggleAI = (enabled: boolean) => {
    if (selectedContact) {
      setSelectedContact({ ...selectedContact, ai_enabled: enabled })
      setContacts(contacts.map((c) => (c.id === selectedContact.id ? { ...c, ai_enabled: enabled } : c)))
    }
  }

  const filteredContacts = contacts.filter(
    (c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm),
  )

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#25d366]"></div>
      </div>
    )
  }

  if (!user) {
    return <LoginForm />
  }

  return (
    <div className="flex h-screen bg-[#f0f2f5]">
      <ContactList
        contacts={filteredContacts}
        selectedContact={selectedContact}
        searchTerm={searchTerm}
        isSidebarOpen={isSidebarOpen}
        onSelectContact={handleSelectContact}
        onSearchChange={setSearchTerm}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col">
        {selectedContact ? (
          <>
            <ChatHeader
              contact={selectedContact}
              onOpenSidebar={() => setIsSidebarOpen(true)}
              onBack={handleBack}
              onToggleAI={handleToggleAI}
            />
            <MessageList messages={messages[selectedContact.id] || []} />
            <MessageInput onSendMessage={handleSendMessage} contactId={selectedContact.id} />
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}
