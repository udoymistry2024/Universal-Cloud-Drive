import React from 'react'
import { AlertTriangle, X, Loader2 } from 'lucide-react'

export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmText = "Delete",
  confirmStyle = "danger",
  loading = false
}) => {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-ucd-surface border border-ucd-border rounded-2xl shadow-glow-lg w-full max-w-sm p-5 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Glow Accent Line */}
        <div className={`h-1 w-full absolute top-0 left-0 ${confirmStyle === 'danger' ? 'bg-gradient-to-r from-rose-500 to-amber-500' : 'bg-gradient-to-r from-ucd-accent to-ucd-royal'}`} />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ucd-dim hover:text-ucd-text transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start space-x-3.5 mb-4 mt-1">
          <div className={`p-3 rounded-2xl flex-shrink-0 ${confirmStyle === 'danger' ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400' : 'bg-ucd-accent/10 border border-ucd-accent/20 text-ucd-accent'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-ucd-text tracking-tight">{title}</h3>
            <p className="text-xs text-ucd-dim mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-3 pt-3 border-t border-ucd-border/50 mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-ucd-muted hover:text-ucd-text hover:bg-ucd-hover rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-5 py-2 text-xs font-semibold text-white rounded-xl shadow-md transition-all flex items-center space-x-1.5 ${
              confirmStyle === 'danger'
                ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 shadow-rose-900/30'
                : 'bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500'
            } disabled:opacity-50`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{loading ? 'Processing...' : confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
