"use client"
import { Search, LogOut, X, CameraIcon, Mic } from "lucide-react"
import type { ContactDisplay } from "@/types"

interface ContactListProps {
  contacts: ContactDisplay[]
  selectedContact: ContactDisplay | null
  searchTerm: string
  isSidebarOpen: boolean
  onSelectContact: (contact: ContactDisplay) => void
  onSearchChange: (term: string) => void
  onCloseSidebar: () => void
  onLogout: () => void
}

export function ContactList({
  contacts,
  selectedContact,
  searchTerm,
  isSidebarOpen,
  onSelectContact,
  onSearchChange,
  onCloseSidebar,
  onLogout,
}: ContactListProps) {
  const formatDate = (date: Date): string => {
    const today = new Date()
    const msgDate = new Date(date)

    if (msgDate.toDateString() === today.toDateString()) {
      return msgDate.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    }

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (msgDate.toDateString() === yesterday.toDateString()) {
      return "Ayer"
    }

    return msgDate.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })
  }

  return (
    <div
      className={`${isSidebarOpen ? "w-full md:w-96" : "w-0"} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 overflow-hidden md:relative absolute z-10 h-full`}
    >
      <div className="bg-[#f0f2f5] p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-[#111b21]">Mensajes</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={onLogout}
              className="p-2 hover:bg-[#d9dbd9] rounded-full transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5 text-[#54656f]" />
            </button>
            <button
              onClick={onCloseSidebar}
              className="md:hidden p-2 hover:bg-[#d9dbd9] rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-[#54656f]" />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#54656f]" />
          <input
            type="text"
            placeholder="Buscar o iniciar un chat"
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#25d366]"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            onClick={() => onSelectContact(contact)}
            className={`flex items-center p-4 cursor-pointer hover:bg-[#f5f6f6] border-b border-[#e9edef] transition-colors ${selectedContact?.id === contact.id ? "bg-[#f0f2f5]" : ""
              }`}
          >
            <div className="w-12 h-12 rounded-full bg-[#d9d9d9] flex items-center justify-center text-[#54656f] font-semibold mr-3 flex-shrink-0">
              {contact.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-[#111b21] truncate">{contact.name}</h3>
                <span className="text-xs text-[#667781] ml-2">{formatDate(contact.timestamp)}</span>
              </div>
              <div className="text-sm text-[#667781] truncate">
                {contact.lastMessage === '[image]' ? (
                  <span className="inline-flex items-center gap-1">
                    <CameraIcon className="w-4 h-4" aria-hidden="true" />
                    <span>imagen</span>
                  </span>
                ) : contact.lastMessage === '[audio]' ? (
                  <span className="inline-flex items-center gap-1">
                    <Mic className="w-4 h-4" aria-hidden="true" />
                    <span>audio</span>
                  </span>
                ) : (
                  <span className="truncate inline-block max-w-full align-bottom">
                    {contact.lastMessage}
                  </span>
                )}
              </div>

            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
