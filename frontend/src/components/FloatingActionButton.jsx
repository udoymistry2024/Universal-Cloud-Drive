import React, { useState, useRef, useCallback } from 'react'
import { Plus, UploadCloud, FolderPlus, FolderUp, RotateCw } from 'lucide-react'
import { useDrive } from '../context/DriveContext'
import { useClickOutside } from '../hooks/useClickOutside'

export const FloatingActionButton = ({ onOpenNewFolder }) => {
  const { uploadFiles } = useDrive()
  const [isOpen, setIsOpen] = useState(false)
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)

  const containerRef = useClickOutside(useCallback(() => setIsOpen(false), []))

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files)
      setIsOpen(false)
    }
  }

  const handleFolderChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files)
      setIsOpen(false)
    }
  }

  const handleRefresh = () => {
    window.location.reload()
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center space-y-2.5 select-none" ref={containerRef}>
      {/* Floating Menu Popup - Positioned right above the (+) button */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 w-52 bg-ucd-surface/95 backdrop-blur-xl border border-ucd-border rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <button
            onClick={() => { fileInputRef.current?.click(); setIsOpen(false) }}
            className="w-full flex items-center space-x-3 px-3.5 py-3 text-xs md:text-sm text-ucd-text hover:bg-ucd-accent/10 hover:text-ucd-accent rounded-xl transition-colors font-medium"
          >
            <UploadCloud className="w-4 h-4 text-ucd-accent" />
            <span>File Upload</span>
          </button>

          <button
            onClick={() => { folderInputRef.current?.click(); setIsOpen(false) }}
            className="hidden md:flex w-full items-center space-x-3 px-3.5 py-3 text-xs md:text-sm text-ucd-text hover:bg-ucd-accent/10 hover:text-ucd-accent rounded-xl transition-colors font-medium border-t border-ucd-border/40 mt-1 pt-3"
          >
            <FolderUp className="w-4 h-4 text-emerald-400" />
            <span>Folder Upload</span>
          </button>


          <button
            onClick={() => { onOpenNewFolder(); setIsOpen(false) }}
            className="w-full flex items-center space-x-3 px-3.5 py-3 text-xs md:text-sm text-ucd-text hover:bg-ucd-accent/10 hover:text-ucd-accent rounded-xl transition-colors font-medium border-t border-ucd-border/40 mt-1 pt-3"
          >
            <FolderPlus className="w-4 h-4 text-amber-400" />
            <span>New Folder</span>
          </button>
        </div>
      )}

      {/* Floating Refresh Button — Hidden when menu is open */}
      {!isOpen && (
        <button
          onClick={handleRefresh}
          title="Reload Page"
          aria-label="Reload Page"
          className="w-10 h-10 rounded-full bg-ucd-surface/90 backdrop-blur-md border border-ucd-border hover:border-ucd-accent/40 text-ucd-accent hover:text-white hover:bg-ucd-accent/20 shadow-md flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 group"
        >
          <RotateCw className="w-4 h-4 transition-transform duration-500 group-hover:rotate-180" />
        </button>
      )}

      {/* Main Floating Round (+) Action Button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Create new folder or upload file"
        className={`w-14 h-14 rounded-full bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 text-white shadow-glow-lg flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 ${
          isOpen ? 'rotate-45 shadow-glow-lg' : ''
        }`}
      >
        <Plus className="w-7 h-7 stroke-[2.5]" />
      </button>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        className="hidden"
      />

      <input
        type="file"
        ref={folderInputRef}
        onChange={handleFolderChange}
        webkitdirectory="true"
        directory="true"
        multiple
        className="hidden"
      />
    </div>
  )
}


