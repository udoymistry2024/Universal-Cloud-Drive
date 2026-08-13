import React, { useState } from 'react'
import { HardDriveUpload, X, AlertCircle, Send, Lock } from 'lucide-react'
import { requestStorageApi } from '../lib/api'
import { useDrive } from '../context/DriveContext'
import { useAuth } from '../context/AuthContext'

export const RequestStorageModal = ({ isOpen, onClose }) => {
  const { showToast } = useDrive()
  const { user } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!fullName.trim() || !email.trim() || !reason.trim()) {
      setError("Please fill out all fields in the form.")
      return
    }

    setError('')
    setLoading(true)
    try {
      const res = await requestStorageApi(fullName.trim(), email.trim(), reason.trim())
      showToast(res.message || "Your application has been submitted successfully to the administrator!", "success")
      setFullName('')
      setEmail('')
      setReason('')
      onClose()
    } catch (err) {
      console.error("Error submitting storage request:", err)
      const errorMsg = err.response?.data?.detail || err.message || "Failed to submit request."
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-ucd-surface border border-ucd-border rounded-2xl shadow-2xl w-full max-w-md p-5 md:p-6 relative select-none animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={() => { setError(''); onClose() }}
          className="absolute top-4 right-4 text-ucd-dim hover:text-ucd-accent transition-colors p-1 rounded-lg hover:bg-ucd-accent/10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-5">
          <div className="p-3 bg-sky-400/10 rounded-xl border border-sky-400/20 text-sky-400">
            <HardDriveUpload className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-ucd-text">Request Storage Upgrade</h3>
            <p className="text-xs text-ucd-dim">Submit an application to upgrade your Telegram cloud quota</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-2.5 text-xs text-rose-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Read-Only Locked Telegram Username Field */}
          <div>
            <label className="block text-xs font-semibold text-ucd-muted mb-1.5 flex items-center justify-between">
              <span>Telegram Username</span>
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Locked
              </span>
            </label>
            <input
              type="text"
              readOnly
              disabled
              value={user?.telegram_username ? `@${user.telegram_username}` : '@user'}
              className="w-full px-3.5 py-2.5 bg-slate-800/50 cursor-not-allowed text-slate-400 border border-ucd-border/60 rounded-xl text-sm font-medium select-none outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ucd-muted mb-1.5">Full Name</label>
            <input
              type="text"
              placeholder="e.g. Udoy Mistry"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); setError('') }}
              autoFocus
              className="w-full px-3.5 py-2.5 bg-ucd-bg border border-ucd-border rounded-xl outline-none focus:border-ucd-accent/50 focus:ring-1 focus:ring-ucd-accent/20 text-sm text-ucd-text placeholder:text-ucd-dim"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ucd-muted mb-1.5">Email Address</label>
            <input
              type="email"
              placeholder="e.g. udoy@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError('') }}
              className="w-full px-3.5 py-2.5 bg-ucd-bg border border-ucd-border rounded-xl outline-none focus:border-ucd-accent/50 focus:ring-1 focus:ring-ucd-accent/20 text-sm text-ucd-text placeholder:text-ucd-dim"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ucd-muted mb-1.5">Reason for Upgrade</label>
            <textarea
              rows={3}
              placeholder="Explain why you need additional cloud storage space..."
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError('') }}
              className="w-full px-3.5 py-2.5 bg-ucd-bg border border-ucd-border rounded-xl outline-none focus:border-ucd-accent/50 focus:ring-1 focus:ring-ucd-accent/20 text-sm text-ucd-text placeholder:text-ucd-dim resize-none"
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={() => { setError(''); onClose() }}
              className="px-4 py-2.5 text-sm text-ucd-muted hover:text-ucd-text hover:bg-ucd-hover rounded-xl transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !fullName.trim() || !email.trim() || !reason.trim()}
              className="flex items-center space-x-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 disabled:opacity-40 rounded-xl shadow-glow-btn transition-all"
            >
              <Send className="w-4 h-4" />
              <span>{loading ? 'Submitting...' : 'Submit Application'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
