import React, { useState, useCallback } from 'react'
import { Folder, MoreVertical, Trash2, Edit, Share2, RotateCcw, Copy, Scissors, Check } from 'lucide-react'
import { useDrive } from '../context/DriveContext'
import { deleteFolder, updateFolder, shareFolder } from '../lib/api'
import { useClickOutside } from '../hooks/useClickOutside'
import { useLongPress } from '../hooks/useLongPress'
import { formatDate, copyToClipboard } from '../lib/fileUtils'
import { ConfirmModal } from './ConfirmModal'
import { BottomSheet, BottomSheetItem } from './BottomSheet'

const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768

export const FolderCard = ({ folder }) => {
  const { navigateToFolder, refreshContent, removeFolderLocally, showToast, activeTab = 'my_drive', viewMode = 'grid', copyItem, cutItem, selectionMode = false, toggleSelectItem, enterSelectionMode, isItemSelected, activeMenuId, setActiveMenuId } = useDrive() || {}
  const [showBottomSheet, setShowBottomSheet] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState(folder?.name || '')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const folderId = folder?.id
  const showMenu = activeMenuId === folderId

  // Click outside closes the folder dropdown menu
  const menuRef = useClickOutside(useCallback(() => {
    if (activeMenuId === folderId) {
      setActiveMenuId(null)
    }
  }, [activeMenuId, folderId, setActiveMenuId]))


  // Guard: Return null if folder object is invalid
  if (!folder || typeof folder !== 'object') return null

  const folderName = folder?.name || 'Untitled Folder'
  const isSelected = typeof isItemSelected === 'function' ? isItemSelected(folderId, 'folder') : false


  // Soft Delete (move to Trash)
  const handleSoftDelete = async (e) => {
    e?.stopPropagation()
    if (typeof setActiveMenuId === 'function') setActiveMenuId(null)
    if (!folderId) return
    removeFolderLocally(folderId)
    try {
      await updateFolder(folderId, { is_trash: true })
      showToast(`Folder "${folderName}" moved to Trash.`, 'success')
      await refreshContent()
    } catch (err) {
      showToast("Failed to move folder to Trash.", 'error')
      await refreshContent()
    }
  }

  // Restore from Trash
  const handleRestore = async (e) => {
    e?.stopPropagation()
    if (typeof setActiveMenuId === 'function') setActiveMenuId(null)
    if (!folderId) return
    removeFolderLocally(folderId)
    try {
      await updateFolder(folderId, { is_trash: false })
      showToast(`Folder "${folderName}" restored.`, 'success')
      await refreshContent()
    } catch (err) {
      showToast("Failed to restore folder.", 'error')
      await refreshContent()
    }
  }

  // Permanent Delete
  const handleConfirmPermanentDelete = async () => {
    if (typeof setActiveMenuId === 'function') setActiveMenuId(null)
    if (!folderId) return
    setDeleting(true)
    try {
      removeFolderLocally(folderId)
      await deleteFolder(folderId)
      showToast(`Folder "${folderName}" permanently deleted.`, 'success')
      await refreshContent()
    } catch (err) {
      console.error("Failed to delete folder:", err)
      const errorMsg = err.response?.data?.detail || err.message || "Failed to delete folder."
      showToast(errorMsg, 'error')
      await refreshContent()
    } finally {
      setDeleting(false)
      setShowDeleteModal(false)
    }
  }

  // Get Shareable Link
  const handleShare = async (e) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    if (typeof setActiveMenuId === 'function') setActiveMenuId(null)
    setShowBottomSheet(false)
    if (!folderId) return
    try {
      const shareData = await shareFolder(folderId)
      const fullUrl = `${window.location.origin}${shareData.share_path}`
      const copied = await copyToClipboard(fullUrl)
      if (copied) {
        showToast("Shareable folder link copied to clipboard!", 'info')
      } else {
        window.prompt("Shareable Folder Link (Ctrl+C to copy):", fullUrl)
      }
    } catch (err) {
      console.error("Share error:", err)
      showToast("Failed to generate share link.", 'error')
    }
  }

  const handleRename = async (e) => {
    e.preventDefault()
    if (!folderId) return
    if (newName.trim() && newName !== folderName) {
      try {
        await updateFolder(folderId, { name: newName.trim() })
        await refreshContent()
      } catch (err) {
        const errorMsg = err.response?.data?.detail || err.message || "Failed to rename folder."
        showToast(errorMsg, 'error')
      }
    }
    setIsRenaming(false)
  }

  // Click handler: Selection mode OR navigate
  const handleCardClick = (e) => {
    if (isRenaming) return
    if (selectionMode) {
      e?.preventDefault()
      e?.stopPropagation()
      toggleSelectItem(folder, 'folder')
      return
    }
    // Ctrl/Meta + Click for multi-select (desktop)
    if (e?.ctrlKey || e?.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      enterSelectionMode(folder, 'folder')
      return
    }
    if (activeTab !== 'trash' && folderId) {
      navigateToFolder(folder)
    }
  }

  // Long-press for mobile selection
  const longPressHandlers = useLongPress(
    () => {
      if (!selectionMode && !isRenaming) {
        enterSelectionMode(folder, 'folder')
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
      setActiveMenuId(activeMenuId === folderId ? null : folderId)
    }
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
      onClick={(e) => { e.stopPropagation(); toggleSelectItem(folder, 'folder') }}
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
      {activeTab !== 'trash' ? (
        <>
          <BottomSheetItem
            icon={<Edit className="w-5 h-5 text-ucd-text" />}
            label="Rename"
            onClick={() => { setIsRenaming(true); setShowBottomSheet(false) }}
          />
          <BottomSheetItem
            icon={<Copy className="w-5 h-5 text-sky-400" />}
            label="Copy"
            onClick={() => { copyItem(folder, 'folder'); setShowBottomSheet(false) }}
          />
          <BottomSheetItem
            icon={<Scissors className="w-5 h-5 text-amber-400" />}
            label="Cut / Move"
            onClick={() => { cutItem(folder, 'folder'); setShowBottomSheet(false) }}
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
      ) : (
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
  const renderDropdownMenu = (position = 'top-7') => (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      className={`absolute right-0 ${position} w-48 bg-ucd-surface border border-ucd-border rounded-xl shadow-2xl p-1 z-50`}
    >
      {activeTab !== 'trash' ? (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setIsRenaming(true); setShowMenu(false) }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-ucd-text hover:bg-ucd-accent/10 hover:text-ucd-accent rounded-lg transition-colors"
          >
            <Edit className="w-3 h-3" />
            <span>Rename</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyItem(folder, 'folder'); setShowMenu(false) }}
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
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); cutItem(folder, 'folder'); setShowMenu(false) }}
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
            <Trash2 className="w-3 h-3" />
            <span>Move to Trash</span>
          </button>
        </>
      ) : (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleRestore(e); setShowMenu(false) }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-ucd-accent hover:bg-ucd-accent/10 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restore</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowDeleteModal(true); setShowMenu(false) }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-ucd-rose hover:bg-ucd-rose/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Delete Permanently</span>
          </button>
        </>
      )}
    </div>
  )

  // ─── LIST VIEW ─────────────────────────────────────────
  if (viewMode === 'list') {
    return (
      <>
        <div
          {...longPressHandlers}
          className={`group flex items-center justify-between p-2.5 md:p-3 bg-slate-900/60 hover:bg-slate-800/80 backdrop-blur-xl border rounded-xl cursor-pointer transition-all duration-150 overflow-visible ${
            showMenu ? 'z-[60] relative shadow-2xl' : 'relative z-10'
          } ${
            isSelected
              ? 'border-ucd-accent/50 bg-ucd-accent/15 ring-1 ring-ucd-accent/20'
              : 'border-cyan-500/20 hover:border-ucd-accent/40'
          }`}
        >
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            {/* Checkbox — visible on hover or in selection mode */}
            <div className={`shrink-0 ${selectionMode || isSelected ? 'block' : 'hidden group-hover:block'}`}>
              <SelectionCheckbox />
            </div>
            <div className="p-1 bg-amber-400/10 rounded shrink-0">
              <Folder className="w-4 h-4 fill-amber-400/60 text-amber-400" />
            </div>
            {isRenaming ? (
              <form onSubmit={handleRename} onClick={e => e.stopPropagation()} className="flex-1">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onBlur={handleRename}
                  autoFocus
                  className="w-full px-2 py-0.5 bg-ucd-bg border border-ucd-accent/50 rounded text-xs outline-none text-ucd-text"
                />
              </form>
            ) : (
              <span className="font-medium text-sm text-ucd-text truncate max-w-[180px] sm:max-w-[280px] md:max-w-[400px]">{folderName}</span>
            )}
          </div>

          <div className="flex items-center space-x-3 md:space-x-5 text-xs text-ucd-dim shrink-0">
            <span className="hidden sm:block">Folder</span>
            <span className="hidden md:block">{formatDate(folder?.created_at)}</span>

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

              {showMenu && renderDropdownMenu('top-7')}
            </div>
          </div>
        </div>

        {/* Mobile Bottom Sheet */}
        <BottomSheet
          isOpen={showBottomSheet}
          onClose={() => setShowBottomSheet(false)}
          title={folderName}
          icon={<Folder className="w-5 h-5 fill-amber-400/60 text-amber-400" />}
        >
          {renderBottomSheetContent()}
        </BottomSheet>

        <ConfirmModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleConfirmPermanentDelete}
          title="Delete Folder Permanently?"
          message={`Are you sure you want to permanently delete "${folderName}"? All contained files in Telegram and database will be destroyed.`}
          confirmText="Delete Permanently"
          confirmStyle="danger"
          loading={deleting}
        />
      </>
    )
  }

  // ─── GRID VIEW ─────────────────────────────────────────
  return (
    <>
      <div
        {...longPressHandlers}
        className={`group bg-slate-900/60 hover:bg-slate-800/80 backdrop-blur-xl p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all duration-200 hover:shadow-glow ${
          showMenu ? 'z-[60] relative shadow-2xl overflow-visible' : 'relative z-10'
        } ${
          isSelected
            ? 'border-ucd-accent/50 ring-2 ring-ucd-accent/20 bg-ucd-accent/15'
            : 'border-cyan-500/20 hover:border-ucd-accent/40'
        }`}
      >
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          {/* Checkbox — visible on hover or in selection mode */}
          <div className={`shrink-0 ${selectionMode || isSelected ? 'block' : 'hidden group-hover:block'}`}>
            <SelectionCheckbox />
          </div>
          <div className="p-2 bg-amber-400/10 rounded-lg shrink-0">
            <Folder className="w-5 h-5 fill-amber-400/60 text-amber-400" />
          </div>
          {isRenaming ? (
            <form onSubmit={handleRename} onClick={e => e.stopPropagation()} className="flex-1">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onBlur={handleRename}
                autoFocus
                className="w-full px-2 py-1 bg-ucd-bg border border-ucd-accent/50 rounded text-xs outline-none text-ucd-text"
              />
            </form>
          ) : (
            <span className="font-medium text-sm text-ucd-text truncate">{folderName}</span>
          )}
        </div>

        <div className="relative shrink-0" ref={menuRef} onClick={e => e.stopPropagation()}>
          <button
            onClick={handleMenuAction}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={handleMenuAction}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            className={`p-1.5 text-ucd-dim hover:text-ucd-accent rounded-lg hover:bg-ucd-accent/10 transition-all ${
              selectionMode ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
            }`}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {showMenu && renderDropdownMenu('mt-1')}
        </div>
      </div>

      {/* Mobile Bottom Sheet */}
      <BottomSheet
        isOpen={showBottomSheet}
        onClose={() => setShowBottomSheet(false)}
        title={folderName}
        icon={<Folder className="w-5 h-5 fill-amber-400/60 text-amber-400" />}
      >
        {renderBottomSheetContent()}
      </BottomSheet>

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmPermanentDelete}
        title="Delete Folder Permanently?"
        message={`Are you sure you want to permanently delete "${folderName}"? All contained files in Telegram and database will be destroyed.`}
        confirmText="Delete Permanently"
        confirmStyle="danger"
        loading={deleting}
      />
    </>
  )
}
