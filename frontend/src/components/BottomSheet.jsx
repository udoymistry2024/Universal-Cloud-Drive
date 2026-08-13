import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'

/**
 * BottomSheet — Mobile-optimized slide-up action sheet.
 * Replaces small dropdown menus with large, touch-friendly buttons on mobile.
 */
export const BottomSheet = ({ isOpen, onClose, title, icon, children }) => {
  const [visible, setVisible] = useState(false)
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setVisible(true)
      // Trigger slide-up animation after mount
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateIn(true))
      })
    } else {
      setAnimateIn(false)
      const timer = setTimeout(() => setVisible(false), 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[100] md:hidden" onClick={onClose}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          animateIn ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-ucd-surface border-t border-ucd-border rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out ${
          animateIn ? 'translate-y-0' : 'translate-y-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-ucd-dim/30 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-ucd-border">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            {icon && <div className="shrink-0">{icon}</div>}
            <h3 className="font-semibold text-sm text-ucd-text truncate">{title || 'Actions'}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-ucd-dim hover:text-ucd-text rounded-xl hover:bg-ucd-bg/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Items */}
        <div className="p-3 pb-8 space-y-1 max-h-[60vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * BottomSheetItem — A single action row inside the BottomSheet.
 * Large 48px touch target for mobile usability.
 */
export const BottomSheetItem = ({ icon, label, onClick, variant = 'default', href, download }) => {
  const colorClass = variant === 'danger'
    ? 'text-ucd-rose hover:bg-ucd-rose/10'
    : variant === 'accent'
    ? 'text-ucd-accent hover:bg-ucd-accent/10'
    : 'text-ucd-text hover:bg-ucd-surface'

  if (href) {
    return (
      <a
        href={href}
        download={download}
        onClick={onClick}
        className={`w-full flex items-center space-x-4 px-4 py-3.5 rounded-xl transition-colors ${colorClass}`}
      >
        <span className="shrink-0">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </a>
    )
  }

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-4 px-4 py-3.5 rounded-xl transition-colors ${colorClass}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}
