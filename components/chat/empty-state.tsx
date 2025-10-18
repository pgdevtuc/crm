"use client"

export function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#f0f2f5]">
      <div className="text-center">
        <div className="w-64 h-64 mx-auto mb-8 opacity-20">
          <svg viewBox="0 0 303 172" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M151.5 0C67.9 0 0 67.9 0 151.5S67.9 303 151.5 303 303 235.1 303 151.5 235.1 0 151.5 0zm0 276.9c-69.3 0-125.4-56.1-125.4-125.4S82.2 26.1 151.5 26.1s125.4 56.1 125.4 125.4-56.1 125.4-125.4 125.4z"
              fill="#DFE5E7"
            />
            <path
              d="M151.5 48.2c-57.1 0-103.3 46.2-103.3 103.3s46.2 103.3 103.3 103.3 103.3-46.2 103.3-103.3-46.2-103.3-103.3-103.3zm0 180.5c-42.6 0-77.2-34.6-77.2-77.2s34.6-77.2 77.2-77.2 77.2 34.6 77.2 77.2-34.6 77.2-77.2 77.2z"
              fill="#DFE5E7"
            />
          </svg>
        </div>
        <h2 className="text-3xl font-light text-[#41525d] mb-2">WhatsApp CRM</h2>
        <p className="text-[#667781]">Selecciona un chat para empezar a conversar</p>
      </div>
    </div>
  )
}
