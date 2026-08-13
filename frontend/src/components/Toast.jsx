import React from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

export const Toast = ({ toast, onClose }) => {
  if (!toast) return null

  const isError = toast.type === 'error'
  const isInfo = toast.type === 'info'

  return (
    <div className="fixed top-16 right-4 z-50 animate-in fade-in slide-in-from-top-4 duration-300 max-w-[calc(100vw-2rem)] sm:max-w-md">
      <div
        className={`flex items-start space-x-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md w-full ${
          isError
            ? 'bg-slate-900/95 border-rose-500/30 text-rose-400 shadow-rose-950/50'
            : isInfo
            ? 'bg-slate-900/95 border-emerald-400/30 text-emerald-400 shadow-emerald-950/50'
            : 'bg-slate-900/95 border-sky-400/30 text-sky-400 shadow-sky-950/50'
        }`}
      >
        {isError ? (
          <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
        ) : isInfo ? (
          <Info className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
        )}
        <p className="text-xs font-medium text-ucd-text leading-relaxed flex-1 min-w-0 break-all break-words">{toast.message}</p>
        <button
          onClick={onClose}
          className="text-ucd-dim hover:text-ucd-text transition-colors p-0.5 rounded-lg"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
