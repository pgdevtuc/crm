"use client"

import React from "react"
import { Menu, Phone, MoreVertical, ArrowLeft, Bot } from "lucide-react"
import type { ContactDisplay } from "@/types"

interface ChatHeaderProps {
  contact: ContactDisplay
  onOpenSidebar: () => void
  onBack: () => void
  onToggleAI: (enabled: boolean) => void
}

export function ChatHeader({ contact, onOpenSidebar, onBack, onToggleAI }: ChatHeaderProps) {
  const [ai_enabled, setai_enabled] = React.useState(contact.ai_enabled || false)
  const [isTogglingAI, setIsTogglingAI] = React.useState(false)

  const handleAIToggle = async () => {
    const newValue = !ai_enabled
    setIsTogglingAI(true)

    try {
      const response = await fetch("/api/contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: contact.id,
          ai_enabled: newValue,
        }),
      })

      if (!response.ok) throw new Error("Failed to update AI setting")

      setai_enabled(newValue)
      onToggleAI(newValue)
    } catch (error) {
      console.error("Error toggling AI:", error)
      alert("Error al cambiar configuración de IA")
    } finally {
      setIsTogglingAI(false)
    }
  }

  return (
    <div className="bg-[#f0f2f5] p-4 border-b border-gray-200 flex items-center">
      <button onClick={onBack} className="mr-3 p-2 hover:bg-[#d9dbd9] rounded-full transition-colors">
        <ArrowLeft className="w-5 h-5 text-[#54656f]" />
      </button>

      <button onClick={onOpenSidebar} className="md:hidden mr-3 p-2 hover:bg-[#d9dbd9] rounded-full transition-colors">
        <Menu className="w-5 h-5 text-[#54656f]" />
      </button>

      <div className="w-10 h-10 rounded-full bg-[#d9d9d9] flex items-center justify-center text-[#54656f] font-semibold mr-3">
        {contact.avatar}
      </div>

      <div className="flex-1">
        <h2 className="font-semibold text-[#111b21]">{contact.name}</h2>
        <p className="text-sm text-[#667781]">{contact.phone}</p>
      </div>
      <button
        onClick={handleAIToggle}
        disabled={isTogglingAI}
        className={`p-2 rounded-full mr-2 transition-colors cursor-pointer ${
          ai_enabled ? "bg-[#25d366] text-white hover:bg-[#20bd5a]" : "bg-[#d9dbd9] text-[#54656f] hover:bg-[#c4c6c5]"
        } ${isTogglingAI ? "opacity-50 cursor-not-allowed" : ""}`}
        title={ai_enabled ? "IA Activada" : "IA Desactivada"}
      >
        <Bot className="w-5 h-5" />
      </button>

      <button className="p-2 hover:bg-[#d9dbd9] rounded-full mr-2 transition-colors" title="Llamar">
        <Phone className="w-5 h-5 text-[#54656f]" />
      </button>
      <button className="p-2 hover:bg-[#d9dbd9] rounded-full transition-colors">
        <MoreVertical className="w-5 h-5 text-[#54656f]" />
      </button>
    </div>
  )
}
