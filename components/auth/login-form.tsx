"use client"

import type React from "react"
import { useState } from "react"
import { supabase } from "@/lib/supabase"

export function LoginForm() {
  const [email, setEmail] = useState<string>("")
  const [password, setPassword] = useState<string>("")

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
    } catch (error) {
      const err = error as Error
      alert("Error: " + err.message)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[#f0f2f5]">
      <div className="bg-white p-8 rounded-lg shadow-lg w-96">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-semibold text-[#075e54]">WhatsApp CRM</h1>
          <p className="text-sm text-gray-600 mt-2">Gestiona tus mensajes profesionalmente</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#25d366] focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#25d366] focus:border-transparent"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-[#25d366] text-white py-3 rounded-lg hover:bg-[#20bd5a] transition-colors font-medium"
          >
            Iniciar Sesión
          </button>
        </form>
      </div>
    </div>
  )
}
