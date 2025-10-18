"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Send, Paperclip, X, Mic } from "lucide-react"

interface MessageInputProps {
  onSendMessage: (message: string, file?: { url: string; fileName: string; type: "image" | "audio" }) => void
  contactId?: number
}

export function MessageInput({ onSendMessage, contactId }: MessageInputProps) {
  const [messageInput, setMessageInput] = useState<string>("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const isImage = file.type.startsWith("image/")
    const isAudio = file.type.startsWith("audio/")

    if (!isImage && !isAudio) {
      alert("Solo se permiten imágenes y archivos de audio")
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert("El archivo es demasiado grande. Máximo 10MB")
      return
    }

    setSelectedFile(file)

    // Create preview for images
    if (isImage) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setFilePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    } else {
      setFilePreview(null)
    }
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    setFilePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleSend = async () => {
    if (!messageInput.trim() && !selectedFile) return
    if (!contactId) return

    setIsUploading(true)

    try {
      if (selectedFile) {
        // Upload file first
        const formData = new FormData()
        formData.append("file", selectedFile)
        formData.append("contactId", contactId.toString())
        formData.append("type", selectedFile.type.startsWith("image/") ? "image" : "audio")

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        })

        if (!response.ok) {
          throw new Error("Failed to upload file")
        }

        const { url, fileName, type } = await response.json()

        // Send message with file
        onSendMessage(messageInput || fileName, { url, fileName, type })
        handleRemoveFile()
      } else {
        // Send text message
        onSendMessage(messageInput)
      }

      setMessageInput("")
    } catch (error) {
      console.error("Error sending message:", error)
      alert("Error al enviar el mensaje")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="bg-[#f0f2f5] p-4 border-t border-gray-200">
      {/* File preview */}
      {selectedFile && (
        <div className="max-w-4xl mx-auto mb-2 bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {filePreview ? (
                <img src={filePreview || "/placeholder.svg"} alt="Preview" className="w-16 h-16 object-cover rounded" />
              ) : (
                <div className="w-16 h-16 bg-[#25d366] rounded flex items-center justify-center">
                  <Mic className="w-8 h-8 text-white" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-[#111b21]">{selectedFile.name}</p>
                <p className="text-xs text-[#667781]">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            <button
              onClick={handleRemoveFile}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              disabled={isUploading}
            >
              <X className="w-5 h-5 text-[#667781]" />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center space-x-2 max-w-4xl mx-auto">
        <input ref={fileInputRef} type="file" accept="image/*,audio/*" onChange={handleFileSelect} className="hidden" />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-3 text-[#667781] hover:bg-white rounded-full transition-colors"
          disabled={isUploading}
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <input
          type="text"
          placeholder="Escribe un mensaje"
          className="flex-1 px-4 py-3 bg-white border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[#25d366] text-[#111b21]"
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && !isUploading && handleSend()}
          disabled={isUploading}
        />

        <button
          onClick={handleSend}
          className="p-3 bg-[#25d366] hover:bg-[#20bd5a] text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={(!messageInput.trim() && !selectedFile) || isUploading}
        >
          {isUploading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  )
}
