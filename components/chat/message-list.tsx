"use client"

import { useEffect, useRef, useState } from "react"
import { Check, CheckCheck, Play, Pause } from "lucide-react"
import type { MessageDisplay, MessageStatus } from "@/types"

interface MessageListProps {
  messages: MessageDisplay[]
}

function MessageStatusIcon({ status }: { status: MessageStatus }) {
  if (status === "sent") return <Check className="w-4 h-4 text-[#667781]" />
  if (status === "delivered") return <CheckCheck className="w-4 h-4 text-[#667781]" />
  if (status === "read") return <CheckCheck className="w-4 h-4 text-[#53bdeb]" />
  return null
}

function AudioPlayer({ src, fileName }: { src: string; fileName?: string }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  const togglePlay = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  return (
    <div className="flex items-center space-x-2 min-w-[200px]">
      <button
        onClick={togglePlay}
        className="p-2 bg-[#25d366] hover:bg-[#20bd5a] text-white rounded-full transition-colors"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>

      <div className="flex-1">
        <div className="h-1 bg-gray-300 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#25d366] transition-all"
            style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-[#667781] mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />
    </div>
  )
}

export function MessageList({ messages }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-[#efeae2] relative">
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fillRule='evenodd'%3E%3Cg fill='%23000000' fillOpacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <div className="max-w-4xl mx-auto space-y-2 relative z-10">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-md rounded-lg shadow-sm ${
                msg.fromMe ? "bg-[#d9fdd3] rounded-br-none" : "bg-white rounded-bl-none"
              }`}
            >
              {msg.type === "image" && msg.fileUrl && (
                <div className="relative">
                  <img
                    src={msg.fileUrl || "/placeholder.svg"}
                    alt={msg.fileName || "Image"}
                    className="rounded-t-lg max-w-full h-auto max-h-[300px] object-cover"
                  />
                  {msg.text && msg.text !== msg.fileName && (
                    <div className="px-4 py-2">
                      <p className="text-sm text-[#111b21] break-words">{msg.text}</p>
                    </div>
                  )}
                </div>
              )}

              {msg.type === "audio" && msg.fileUrl && (
                <div className="px-4 py-3">
                  <AudioPlayer src={msg.fileUrl} fileName={msg.fileName} />
                  {msg.text && msg.text !== msg.fileName && (
                    <p className="text-sm text-[#111b21] break-words mt-2">{msg.text}</p>
                  )}
                </div>
              )}

              {(!msg.type || msg.type === "text") && (
                <div className="px-4 py-2">
                  <p className="text-sm text-[#111b21] break-words">{msg.text}</p>
                </div>
              )}

              <div className="flex items-center justify-end px-4 pb-2 space-x-1">
                <span className="text-xs text-[#667781]">{formatTime(msg.timestamp)}</span>
                {msg.fromMe && <MessageStatusIcon status={msg.status} />}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
