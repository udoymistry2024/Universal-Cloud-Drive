import React, { useState, useRef, useCallback } from 'react'
import { Plus, HardDrive, Star, Trash2, FolderPlus, FolderUp, UploadCloud, Database } from 'lucide-react'

import { useDrive } from '../context/DriveContext'
import { useAuth } from '../context/AuthContext'
import { useClickOutside } from '../hooks/useClickOutside'
import { formatBytes } from '../lib/fileUtils'
import { BrandLogo } from './BrandLogo'

export const Sidebar = ({ isOpen, onClose, onOpenNewFolder, onRequestSpace }) => {
  const { activeTab = 'my_drive', setActiveTab, uploadFiles, navigateToFolder } = useDrive() || {}
  const { user } = useAuth()
  const [showNewMenu, setShowNewMenu] = useState(false)
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)

  const usedBytes = user?.used_storage || 0
  const limitBytes = user?.storage_limit || 32212254720 // 30 GB default
  const percentage = Math.min(100, Math.round((usedBytes / limitBytes) * 100))

  const newMenuRef = useClickOutside(useCallback(() => setShowNewMenu(false), []))

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles?.(e.target.files)
      setShowNewMenu(false)
      onClose?.()
    }
  }

  const handleFolderChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles?.(e.target.files)
      setShowNewMenu(false)
      onClose?.()
    }
  }


  const handleNavClick = (tab) => {
    setActiveTab(tab)
    if (tab === 'my_drive') navigateToFolder(null)
    if (window.innerWidth < 768) onClose?.()
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50 md:z-auto
          w-64 md:w-56 lg:w-60 h-screen md:h-[calc(100vh-3.5rem)]
          p-3 flex flex-col
          bg-slate-950/20 backdrop-blur-md border-r border-cyan-500/20
          select-none overflow-y-auto transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Top section — grows to fill available space */}
        <div className="flex-1 space-y-4">
          {/* Mobile Sidebar Branding Header */}
          <div className="md:hidden px-2 pt-1 pb-3 border-b border-ucd-border/50 mb-3">
            <BrandLogo size="md" />
          </div>

          {/* New Button */}
          <div className="relative" ref={newMenuRef}>
            <button
              onClick={() => setShowNewMenu((v) => !v)}
              className="flex items-center space-x-2.5 px-4 py-3 w-full bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 text-white font-semibold text-sm rounded-xl shadow-glow-btn hover:shadow-glow-lg transition-all duration-200"
            >
              <Plus className="w-5 h-5" />
              <span>New</span>
            </button>

            {showNewMenu && (
              <div className="absolute left-0 mt-2 w-52 bg-ucd-surface border border-ucd-border rounded-xl shadow-2xl p-1.5 z-40">
                <button
                  onClick={() => { fileInputRef.current?.click(); setShowNewMenu(false) }}
                  className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-ucd-text hover:bg-ucd-accent/10 hover:text-ucd-accent rounded-lg transition-colors"
                >
                  <UploadCloud className="w-4 h-4 text-ucd-accent" />
                  <span>File Upload</span>
                </button>

                <button
                  onClick={() => { folderInputRef.current?.click(); setShowNewMenu(false) }}
                  className="hidden md:flex w-full items-center space-x-3 px-3 py-2.5 text-sm text-ucd-text hover:bg-ucd-accent/10 hover:text-ucd-accent rounded-lg transition-colors border-t border-ucd-border/40 mt-1 pt-2.5"
                >
                  <FolderUp className="w-4 h-4 text-emerald-400" />
                  <span>Folder Upload</span>
                </button>

                <button
                  onClick={() => { onOpenNewFolder(); setShowNewMenu(false) }}
                  className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-ucd-text hover:bg-ucd-accent/10 hover:text-ucd-accent rounded-lg transition-colors border-t border-ucd-border/40 mt-1 pt-2.5"
                >
                  <FolderPlus className="w-4 h-4 text-amber-400" />
                  <span>New Folder</span>
                </button>
              </div>
            )}

            <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple className="hidden" />
            <input type="file" ref={folderInputRef} onChange={handleFolderChange} webkitdirectory="true" directory="true" multiple className="hidden" />

          </div>

          {/* Navigation */}
          <nav className="space-y-0.5">
            {[
              { key: 'my_drive', label: 'My Drive', icon: HardDrive },
              { key: 'starred',  label: 'Starred',  icon: Star },
              { key: 'trash',    label: 'Trash',     icon: Trash2 },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => handleNavClick(key)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === key
                    ? 'bg-ucd-accent/10 text-ucd-accent border border-ucd-accent/20 shadow-glow'
                    : 'text-ucd-muted hover:text-ucd-text hover:bg-ucd-surface border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Storage indicator & Progress bar */}
        <div className="p-3.5 bg-gradient-to-br from-ucd-surface to-ucd-hover rounded-xl border border-ucd-border relative overflow-hidden mt-4 shadow-sm">
          <div className="absolute -top-6 -right-6 w-20 h-20 bg-ucd-accent/5 rounded-full blur-2xl" />
          <div className="flex items-center space-x-2 text-ucd-accent font-semibold text-[10px] uppercase tracking-widest mb-1.5 relative">
            <Database className="w-3.5 h-3.5" />
            <span>Storage Space</span>
          </div>
          <p className="text-xs font-bold text-ucd-text relative truncate">
            {formatBytes(usedBytes)} of {formatBytes(limitBytes)} Used
          </p>
          
          {/* Progress bar */}
          <div className="w-full bg-ucd-bg h-2 rounded-full overflow-hidden border border-ucd-border/50 mt-2 relative">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                percentage >= 90
                  ? 'bg-rose-500'
                  : percentage >= 75
                  ? 'bg-amber-400'
                  : 'bg-gradient-to-r from-ucd-accent to-ucd-royal'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-ucd-dim mt-1 relative font-medium">
            <span>{percentage}% used</span>
            <span>{formatBytes(Math.max(0, limitBytes - usedBytes))} free</span>
          </div>

          <button
            onClick={() => { onRequestSpace?.(); if (window.innerWidth < 768) onClose?.() }}
            className="text-xs text-sky-400 hover:underline cursor-pointer transition-colors mt-2.5 text-left block font-medium"
          >
            Request More Space
          </button>
        </div>

        {/* Copyright Footer */}
        <div className="pt-3 border-t border-ucd-border mt-3">
          <p className="text-[9px] text-slate-500 leading-relaxed text-center">
            &copy; 2026 Universal Cloud Drive.
            <br />
            Developed by <span className="text-slate-400 font-medium">Udoy Mistry</span>.
            <br />
            All rights reserved.
          </p>
        </div>
      </aside>
    </>
  )
}
