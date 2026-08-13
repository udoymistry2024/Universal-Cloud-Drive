import React, { useState } from 'react'
import { FolderPlus, X, AlertCircle } from 'lucide-react'
import { createFolder } from '../lib/api'
import { useDrive } from '../context/DriveContext'

export const NewFolderModal = ({ isOpen, onClose }) => {
  const { currentFolder, refreshContent, addFolderLocally } = useDrive()
  const [folderName, setFolderName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!folderName.trim()) return

    setError('')
    setLoading(true)
    try {
      const createdFolder = await createFolder(folderName.trim(), currentFolder?.id)
      if (createdFolder) {
        addFolderLocally(createdFolder)
      }
      await refreshContent()
      setFolderName('')
      onClose()
    } catch (err) {
      console.error("Error creating folder:", err)
      const errorMsg = err.response?.data?.detail || err.message || "Failed to create folder."
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-ucd-surface border border-ucd-border rounded-2xl shadow-2xl w-full max-w-md p-5 relative">
        <button
          onClick={() => { setError(''); setFolderName(''); onClose() }}
          className="absolute top-4 right-4 text-ucd-dim hover:text-ucd-accent transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2.5 bg-amber-400/10 rounded-xl border border-amber-400/20">
            <FolderPlus className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-base text-ucd-text">New Folder</h3>
            <p className="text-xs text-ucd-dim">Create folder in {currentFolder ? currentFolder.name : 'My Drive'}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-2 text-xs text-rose-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Folder name"
            value={folderName}
            onChange={(e) => { setFolderName(e.target.value); setError('') }}
            autoFocus
            className="w-full px-3 py-2.5 bg-ucd-bg border border-ucd-border rounded-xl outline-none focus:border-ucd-accent/50 focus:ring-1 focus:ring-ucd-accent/20 text-sm text-ucd-text placeholder:text-ucd-dim"
          />
          <div className="flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={() => { setError(''); setFolderName(''); onClose() }}
              className="px-4 py-2 text-sm text-ucd-muted hover:text-ucd-text hover:bg-ucd-hover rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !folderName.trim()}
              className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 disabled:opacity-40 rounded-xl shadow-glow-btn transition-all"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
