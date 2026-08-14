import React, { useState, useEffect, useCallback } from 'react'

import { FileText, Image, Film, Music, FileArchive, FileCode, Star, Download, Trash2, RotateCcw, MoreVertical, Eye, File, Share2, Copy, Scissors, Check } from 'lucide-react'
import { formatBytes, formatDate, getFileCategory, copyToClipboard } from '../lib/fileUtils'
import { updateFile, deleteFile, getDownloadUrl, getStreamUrl, getThumbnailUrl, shareFile } from '../lib/api'

import { useDrive } from '../context/DriveContext'
import { useClickOutside } from '../hooks/useClickOutside'
import { useLongPress } from '../hooks/useLongPress'
import { ConfirmModal } from './ConfirmModal'
import { BottomSheet, BottomSheetItem } from './BottomSheet'
import { VideoThumbnail } from './VideoThumbnail'

const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768

export const FileCard = ({ file, index = 0, onPreview }) => {
  const { viewMode = 'grid', refreshContent, removeFileLocally, toggleStarLocally, showToast, activeTab = 'my_drive', copyItem, cutItem, selectionMode = false, toggleSelectItem, enterSelectionMode, isItemSelected, activeMenuId, setActiveMenuId } = useDrive() || {}

  const isAboveTheFold = index < 12
  const fileId = file?.id
  const showMenu = activeMenuId === fileId

  const [showBottomSheet, setShowBottomSheet] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [vidError, setVidError] = useState(false)

  // Auto-recovery: when user brings browser tab back into focus/visibility, reset thumbnail error flags
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setImgError(false)
        setVidError(false)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
    }
  }, [])



  const menuRef = useClickOutside(useCallback(() => {
    if (activeMenuId === fileId) {
      setActiveMenuId(null)
    }
  }, [activeMenuId, fileId, setActiveMenuId]))

  // Guard: Return null if file object is invalid
  if (!file || typeof file !== 'object') return null

  const fileName = file?.name || 'Untitled File'
  const fileSize = file?.size || 0
  const fileMime = file?.mime_type || ''
  const isStarred = Boolean(file?.is_starred)
  const isSelected = typeof isItemSelected === 'function' ? isItemSelected(fileId, 'file') : false


  const downloadUrl = fileId ? getDownloadUrl(fileId) : ''
  const streamUrl = fileId ? getStreamUrl(fileId) : ''
  const thumbnailUrl = fileId ? getThumbnailUrl(fileId) : ''


  const category = getFileCategory(fileMime, fileName)

  const iconColors = {
    image: 'text-purple-400',
    video: 'text-rose-400',
    audio: 'text-emerald-400',
    pdf: 'text-red-400',
    archive: 'text-amber-400',
    text: 'text-sky-400',
    document: 'text-slate-400',
  }

  const renderIcon = (extraClass = "w-6 h-6") => {
    const color = iconColors[category] || iconColors.document
    const icons = { image: Image, video: Film, audio: Music, pdf: FileText, archive: FileArchive, text: FileCode, document: File }
    const Icon = icons[category] || File
    return <Icon className={`${extraClass} ${color}`} />
  }

  const toggleStar = async (e) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    if (!fileId) return
    toggleStarLocally?.(fileId, 'file')
    try {
      await updateFile(fileId, { is_starred: !isStarred })
    } catch (err) {
      toggleStarLocally?.(fileId, 'file')
    }
  }


  const handleSoftDelete = async (e) => {
    e?.stopPropagation?.()
    if (!fileId) return
    removeFileLocally(fileId)
    try {
      await updateFile(fileId, { is_trash: true })
      showToast(`File "${fileName}" moved to Trash.`, 'success')
      await refreshContent()
    } catch (err) {
      showToast("Failed to move file to Trash.", 'error')
      await refreshContent()
    }
  }

  const handleRestore = async (e) => {
    e?.stopPropagation?.()
    if (!fileId) return
    removeFileLocally(fileId)
    try {
      await updateFile(fileId, { is_trash: false })
      showToast(`File "${fileName}" restored.`, 'success')
      await refreshContent()
    } catch (err) {
      showToast("Failed to restore file.", 'error')
      await refreshContent()
    }
  }

  const handleConfirmPermanentDelete = async () => {
    if (!fileId) return
    setDeleting(true)
    try {
      removeFileLocally(fileId)
      await deleteFile(fileId)
      showToast(`File "${fileName}" permanently deleted.`, 'success')
      await refreshContent()
    } catch (err) {
      console.error("Failed to delete file:", err)
      const errorMsg = err.response?.data?.detail || err.message || "Failed to delete file."
      showToast(errorMsg, 'error')
      await refreshContent()
    } finally {
      setDeleting(false)
      setShowDeleteModal(false)
    }
  }

  const handleShare = async (e) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    if (typeof setActiveMenuId === 'function') setActiveMenuId(null)
    setShowBottomSheet(false)
    if (!fileId) return
    try {
      const shareData = await shareFile(fileId)
      const fullUrl = `${window.location.origin}${shareData.share_path}`
      const copied = await copyToClipboard(fullUrl)
      if (copied) {
        showToast("Shareable file link copied to clipboard!", 'info')
      } else {
        window.prompt("Shareable File Link (Ctrl+C to copy):", fullUrl)
      }
    } catch (err) {
      console.error("Share error:", err)
      showToast("Failed to generate share link.", 'error')
    }
  }

  // Click handler: Selection mode OR preview
  const handleCardClick = (e) => {
    if (selectionMode) {
      e?.preventDefault?.()
      e?.stopPropagation?.()
      toggleSelectItem(file, 'file')
      return
    }
    // Ctrl/Meta + Click for multi-select (desktop)
    if (e?.ctrlKey || e?.metaKey) {
      e?.preventDefault?.()
      e?.stopPropagation?.()
      enterSelectionMode(file, 'file')
      return
    }
    // In Trash tab, prevent preview on card click
    if (activeTab === 'trash') {
      return
    }
    onPreview?.(file, streamUrl)
  }

  // Long-press for mobile selection
  const longPressHandlers = useLongPress(
    () => {
      if (!selectionMode) {
        enterSelectionMode(file, 'file')
      }
    },
    handleCardClick,
    { delay: 500, moveTolerance: 10 }
  )

  // Open action menu (bottom sheet on mobile, dropdown on desktop)
  const handleMenuOpen = (e) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    if (isMobile()) {
      setShowBottomSheet(true)
    } else {
      setActiveMenuId(activeMenuId === fileId ? null : fileId)
    }
  }


  const handleStarAction = (e) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    toggleStar(e)
  }

  const handleMenuAction = (e) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    handleMenuOpen(e)
  }

  // Checkbox component — stops ALL pointer events to prevent useLongPress interception
  const stopAllPropagation = (e) => e.stopPropagation()
  const SelectionCheckbox = ({ className = '' }) => (
    <div
      onClick={(e) => { e.stopPropagation(); toggleSelectItem(file, 'file') }}
      onMouseDown={stopAllPropagation}
      onMouseUp={stopAllPropagation}
      onTouchStart={stopAllPropagation}
      onTouchEnd={stopAllPropagation}
      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all ${
        isSelected
          ? 'bg-ucd-accent border-ucd-accent text-white'
          : 'border-ucd-dim/40 hover:border-ucd-accent/60 bg-ucd-bg/50'
      } ${className}`}
    >
      {isSelected && <Check className="w-3 h-3" strokeWidth={3} />}
    </div>
  )

  // ─── BOTTOM SHEET ACTION ITEMS ──────────────────────────
  const renderBottomSheetContent = () => (
    <>
      <BottomSheetItem
        icon={<Eye className="w-5 h-5 text-ucd-text" />}
        label="Preview"
        onClick={() => { onPreview?.(file, streamUrl); setShowBottomSheet(false) }}
      />
      {activeTab !== 'trash' && (
        <>
          <BottomSheetItem
            icon={<Download className="w-5 h-5 text-ucd-text" />}
            label="Download"
            href={downloadUrl}
            download
            onClick={() => setShowBottomSheet(false)}
          />
          <BottomSheetItem
            icon={<Copy className="w-5 h-5 text-sky-400" />}
            label="Copy"
            onClick={() => { copyItem(file, 'file'); setShowBottomSheet(false) }}
          />
          <BottomSheetItem
            icon={<Scissors className="w-5 h-5 text-amber-400" />}
            label="Cut / Move"
            onClick={() => { cutItem(file, 'file'); setShowBottomSheet(false) }}
          />
          <BottomSheetItem
            icon={<Share2 className="w-5 h-5 text-ucd-accent" />}
            label="Get Shareable Link"
            variant="accent"
            onClick={handleShare}
          />
          <BottomSheetItem
            icon={<Trash2 className="w-5 h-5 text-ucd-rose" />}
            label="Move to Trash"
            variant="danger"
            onClick={(e) => { handleSoftDelete(e); setShowBottomSheet(false) }}
          />
        </>
      )}
      {activeTab === 'trash' && (
        <>
          <BottomSheetItem
            icon={<RotateCcw className="w-5 h-5 text-ucd-accent" />}
            label="Restore"
            variant="accent"
            onClick={(e) => { handleRestore(e); setShowBottomSheet(false) }}
          />
          <BottomSheetItem
            icon={<Trash2 className="w-5 h-5 text-ucd-rose" />}
            label="Delete Permanently"
            variant="danger"
            onClick={(e) => { e?.stopPropagation(); setShowDeleteModal(true); setShowBottomSheet(false) }}
          />
        </>
      )}
    </>
  )

  // ─── DESKTOP DROPDOWN MENU ──────────────────────────────
  const renderDropdownMenu = (positionClass = "top-7") => (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      className={`absolute right-0 ${positionClass} w-44 bg-ucd-surface border border-ucd-border rounded-xl shadow-2xl p-1 z-50`}
    >
      <button
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onPreview?.(file, streamUrl); setShowMenu(false) }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-ucd-text hover:bg-ucd-accent/10 hover:text-ucd-accent rounded-lg transition-colors"
      >
        <Eye className="w-3 h-3" />
        <span>Preview</span>
      </button>

      {activeTab !== 'trash' && (
        <>
          <a
            href={downloadUrl}
            download
            onClick={(e) => { e.stopPropagation(); setShowMenu(false) }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-ucd-text hover:bg-ucd-accent/10 hover:text-ucd-accent rounded-lg transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>Download</span>
          </a>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyItem(file, 'file'); setShowMenu(false) }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-ucd-text hover:bg-ucd-accent/10 hover:text-ucd-accent rounded-lg transition-colors"
          >
            <Copy className="w-3 h-3 text-sky-400" />
            <span>Copy</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); cutItem(file, 'file'); setShowMenu(false) }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-ucd-text hover:bg-ucd-accent/10 hover:text-ucd-accent rounded-lg transition-colors"
          >
            <Scissors className="w-3 h-3 text-amber-400" />
            <span>Cut / Move</span>
          </button>
          <button
            onClick={handleShare}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-ucd-accent hover:bg-ucd-accent/10 rounded-lg transition-colors"
          >
            <Share2 className="w-3 h-3" />
            <span>Get Shareable Link</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleSoftDelete(e); setShowMenu(false) }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-ucd-rose hover:bg-ucd-rose/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-3 h-3" /><span>Move to Trash</span>
          </button>
        </>
      )}

      {activeTab === 'trash' && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleRestore(e); setShowMenu(false) }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-ucd-accent hover:bg-ucd-accent/10 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3 h-3" /><span>Restore</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowDeleteModal(true); setShowMenu(false) }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-ucd-rose hover:bg-ucd-rose/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-3 h-3" /><span>Delete Permanently</span>
          </button>
        </>
      )}
    </div>
  )

  return (
    <>
      {viewMode === 'list' ? (
        <div
          {...longPressHandlers}
          className={`group flex items-center justify-between p-2.5 md:p-3 bg-ucd-bg/60 hover:bg-ucd-surface border rounded-xl cursor-pointer transition-all duration-150 overflow-visible relative ${
            isSelected
              ? 'border-ucd-accent/40 bg-ucd-accent/5 ring-1 ring-ucd-accent/20'
              : 'border-transparent hover:border-ucd-accent/20'
          }`}
        >
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            {/* Checkbox — visible on hover or in selection mode */}
            <div className={`shrink-0 ${selectionMode || isSelected ? 'block' : 'hidden group-hover:block'}`}>
              <SelectionCheckbox />
            </div>
            {renderIcon('w-4 h-4')}
            <span className="font-medium text-sm text-ucd-text truncate max-w-[180px] sm:max-w-[280px] md:max-w-[400px]">{fileName}</span>
          </div>

          <div className="flex items-center space-x-3 md:space-x-5 text-xs text-ucd-dim shrink-0">
            <span className="hidden sm:block">{formatBytes(fileSize)}</span>
            <span className="hidden md:block">{formatDate(file?.created_at)}</span>

            <div className="flex items-center space-x-0.5" onClick={e => e.stopPropagation()}>
              {activeTab !== 'trash' && (
                <button
                  onClick={handleStarAction}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={handleStarAction}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  className="p-1 text-ucd-dim hover:text-amber-400 transition-colors"
                >
                  <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
                </button>
              )}

              <div className="relative" ref={menuRef} onClick={e => e.stopPropagation()}>
                <button
                  onClick={handleMenuAction}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={handleMenuAction}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  className="p-1 text-ucd-dim hover:text-ucd-accent rounded hover:bg-ucd-accent/10 transition-colors"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>

                {showMenu && renderDropdownMenu("top-7")}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          {...longPressHandlers}
          className={`group relative bg-ucd-surface hover:bg-ucd-hover rounded-xl border overflow-visible cursor-pointer transition-all duration-200 hover:shadow-glow flex flex-col justify-between ${
            isSelected
              ? 'border-ucd-accent/40 ring-2 ring-ucd-accent/20 bg-ucd-accent/5'
              : 'border-ucd-border hover:border-ucd-accent/30'
          }`}
        >
          {/* Preview thumbnail */}
          <div className="h-28 md:h-32 bg-ucd-bg flex items-center justify-center relative border-b border-ucd-border rounded-t-xl overflow-hidden">
            {category === 'image' && thumbnailUrl && !imgError ? (
              <img
                src={thumbnailUrl}
                alt={fileName}
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                loading={isAboveTheFold ? "eager" : "lazy"}
                fetchPriority={isAboveTheFold ? "high" : "low"}
                decoding={isAboveTheFold ? "sync" : "async"}
                onError={() => setImgError(true)}
              />
            ) : category === 'video' ? (
              <VideoThumbnail
                fileId={fileId}
                fileName={fileName}
                thumbnailUrl={thumbnailUrl}
                streamUrl={streamUrl}
                isAboveTheFold={isAboveTheFold}
              />
            ) : (
              <div className="p-3 rounded-xl bg-ucd-surface/60 border border-ucd-border">
                {renderIcon("w-8 h-8 md:w-10 md:h-10")}
              </div>
            )}




            {/* Top-left: Checkbox */}
            <div className={`absolute top-2 left-2 ${selectionMode || isSelected ? 'block' : 'hidden group-hover:block'}`}>
              <SelectionCheckbox />
            </div>

            {activeTab !== 'trash' && (
              <button
                onClick={handleStarAction}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={handleStarAction}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                className="absolute top-2 right-2 p-1 bg-ucd-bg/80 backdrop-blur rounded-md text-ucd-dim hover:text-amber-400 border border-ucd-border transition-all"
              >
                <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
              </button>
            )}
          </div>

          {/* Metadata */}
          <div className="p-2.5 md:p-3 flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <p className="font-medium text-sm text-ucd-text truncate">{fileName}</p>
              <p className="text-[10px] text-ucd-dim mt-0.5">{formatBytes(fileSize)}</p>
            </div>

            <div className="relative" ref={menuRef} onClick={e => e.stopPropagation()}>
              <button
                onClick={handleMenuAction}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={handleMenuAction}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                className="p-1 text-ucd-dim hover:text-ucd-accent rounded-md hover:bg-ucd-accent/10 transition-colors"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {showMenu && renderDropdownMenu("bottom-7")}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Sheet */}
      <BottomSheet
        isOpen={showBottomSheet}
        onClose={() => setShowBottomSheet(false)}
        title={fileName}
        icon={renderIcon('w-5 h-5')}
      >
        {renderBottomSheetContent()}
      </BottomSheet>

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmPermanentDelete}
        title="Delete File Permanently?"
        message={`Are you sure you want to permanently delete "${fileName}"? This file in Telegram and database will be destroyed.`}
        confirmText="Delete Permanently"
        confirmStyle="danger"
        loading={deleting}
      />
    </>
  )
}
