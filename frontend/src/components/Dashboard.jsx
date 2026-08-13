import React, { useState, useEffect } from 'react'
import { ChevronRight, Upload, HardDrive, Star, Trash2, Loader2, ClipboardCheck, Clipboard, X, CheckSquare, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

import { useDrive } from '../context/DriveContext'
import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'
import { FolderCard } from './FolderCard'
import { FileCard } from './FileCard'
import { UploadProgress } from './UploadProgress'
import { NewFolderModal } from './NewFolderModal'
import { PreviewModal } from './PreviewModal'
import { Toast } from './Toast'
import { FloatingActionButton } from './FloatingActionButton'
import { ConfirmModal } from './ConfirmModal'
import { RequestStorageModal } from './RequestStorageModal'
import { BulkActionBar } from './BulkActionBar'
import { DeleteAccountModal } from './DeleteAccountModal'
import { FolderUploadModal } from './FolderUploadModal'


export const Dashboard = () => {
  const {
    activeTab = 'my_drive',
    currentFolder = null,
    folderPath = [],
    navigateToFolder,
    files = [],
    folders = [],
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    loading = false,
    viewMode = 'grid',
    searchQuery = '',
    uploadFiles,
    emptyTrashAll,
    clipboard = null,
    pastingState = null,
    pasteItem,

    clearClipboard,
    toast = null,
    clearToast,
    // Multi-Selection
    selectedItems = [],
    selectionMode = false,
    clearSelection,
    toggleSelectAll,
    bulkCopy,
    bulkCut,
    bulkDownload,
    bulkDelete,
    bulkRestore
  } = useDrive() || {}

  // Always dark mode
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  const [isDragging, setIsDragging] = useState(false)
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false)
  const [isRequestStorageOpen, setIsRequestStorageOpen] = useState(false)
  const [previewState, setPreviewState] = useState({ file: null, streamUrl: '' })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showEmptyTrashModal, setShowEmptyTrashModal] = useState(false)
  const [emptyingTrash, setEmptyingTrash] = useState(false)
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false)


  const breadcrumbRef = React.useRef(null)

  // Auto-scroll breadcrumbs container to the rightmost active folder when path changes
  useEffect(() => {
    if (breadcrumbRef.current) {
      breadcrumbRef.current.scrollLeft = breadcrumbRef.current.scrollWidth
    }
  }, [folderPath, activeTab])

  // Desktop Keyboard Shortcut Handler: Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Delete, Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing inside an input, textarea, or contentEditable element
      const tag = e.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) {
        return
      }

      const isModifier = e.ctrlKey || e.metaKey
      const key = e.key?.toLowerCase()

      // Ctrl + A / Cmd + A: Select All
      if (isModifier && key === 'a') {
        e.preventDefault()
        toggleSelectAll?.()
      }
      // Ctrl + C / Cmd + C: Copy
      else if (isModifier && key === 'c') {
        if (selectedItems && selectedItems.length > 0) {
          e.preventDefault()
          bulkCopy?.()
        }
      }
      // Ctrl + X / Cmd + X: Cut
      else if (isModifier && key === 'x') {
        if (selectedItems && selectedItems.length > 0) {
          e.preventDefault()
          bulkCut?.()
        }
      }
      // Ctrl + V / Cmd + V: Paste
      else if (isModifier && key === 'v') {
        if (clipboard) {
          e.preventDefault()
          pasteItem?.()
        }
      }
      // Delete / Backspace: Delete selected items to trash
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItems && selectedItems.length > 0) {
          e.preventDefault()
          setShowBulkDeleteModal(true)
        }
      }
      // Escape: Cancel selection mode
      else if (e.key === 'Escape') {
        if (selectedItems && selectedItems.length > 0) {
          e.preventDefault()
          clearSelection?.()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSelectAll, bulkCopy, bulkCut, pasteItem, selectedItems, clipboard, clearSelection])



  const getAllFilesFromDataTransfer = async (dataTransferItems) => {
    const filesWithPaths = []

    const traverseEntry = (entry, path = '') => {
      return new Promise((resolve) => {
        if (entry.isFile) {
          entry.file((file) => {
            const relativePath = path ? `${path}/${file.name}` : file.name
            Object.defineProperty(file, 'relativePath', {
              value: relativePath,
              writable: true
            })
            filesWithPaths.push(file)
            resolve()
          })
        } else if (entry.isDirectory) {
          const dirReader = entry.createReader()
          const readEntries = () => {
            dirReader.readEntries(async (entries) => {
              if (entries.length === 0) {
                resolve()
              } else {
                const newPath = path ? `${path}/${entry.name}` : entry.name
                for (const subEntry of entries) {
                  await traverseEntry(subEntry, newPath)
                }
                await readEntries()
                resolve()
              }
            })
          }
          readEntries()
        } else {
          resolve()
        }
      })
    }

    const promises = []
    for (let i = 0; i < dataTransferItems.length; i++) {
      const item = dataTransferItems[i]
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null
        if (entry) {
          promises.push(traverseEntry(entry))
        } else {
          const file = item.getAsFile()
          if (file) filesWithPaths.push(file)
        }
      }
    }

    await Promise.all(promises)
    return filesWithPaths
  }

  const handleDragOver = (e) => { if (!selectionMode) { e.preventDefault(); setIsDragging(true) } }
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false) }
  const handleDrop = async (e) => {
    e.preventDefault()
    setIsDragging(false)
    if (selectionMode) return

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const extractedFiles = await getAllFilesFromDataTransfer(e.dataTransfer.items)
      if (extractedFiles.length > 0) {
        uploadFiles(extractedFiles)
        return
      }
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files)
    }
  }

  const handleConfirmEmptyTrash = async () => {
    setEmptyingTrash(true)
    try {
      await emptyTrashAll()
    } finally {
      setEmptyingTrash(false)
      setShowEmptyTrashModal(false)
    }
  }

  const handleBulkDeleteConfirm = async () => {
    setBulkDeleting(true)
    try {
      await bulkDelete()
    } finally {
      setBulkDeleting(false)
      setShowBulkDeleteModal(false)
    }
  }


  const safeSearch = (searchQuery || '').toLowerCase()
  const safeFiles = Array.isArray(files) ? files : []
  const safeFolders = Array.isArray(folders) ? folders : []
  const safeFolderPath = Array.isArray(folderPath) ? folderPath : []

  const filteredFiles = safeFiles.filter(f => f && typeof f === 'object' && String(f.name || '').toLowerCase().includes(safeSearch))
  const filteredFolders = safeFolders.filter(f => f && typeof f === 'object' && String(f.name || '').toLowerCase().includes(safeSearch))

  return (
    <div
      className="dark"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Desktop Drag and Drop File Upload Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center border-4 border-dashed border-ucd-accent rounded-3xl m-4 pointer-events-none animate-in fade-in duration-200">
          <div className="p-8 rounded-3xl bg-ucd-accent/10 border border-ucd-accent/30 text-ucd-accent flex flex-col items-center space-y-4 shadow-glow-lg text-center">
            <Upload className="w-16 h-16 animate-bounce text-ucd-accent" />
            <p className="text-xl font-bold text-white">Drop files anywhere to upload</p>
            <p className="text-sm text-ucd-dim">Files will be uploaded directly to {currentFolder ? `"${currentFolder.name}"` : 'My Drive'}</p>
          </div>
        </div>
      )}

      <div className="bg-ucd-bg text-ucd-text flex flex-col min-h-screen">
        <Navbar
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          sidebarOpen={sidebarOpen}
          onOpenDeleteAccount={() => setIsDeleteAccountOpen(true)}
        />

        <div className="flex flex-1 overflow-hidden relative">
          <Sidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onOpenNewFolder={() => { setIsNewFolderOpen(true); setSidebarOpen(false) }}
            onRequestSpace={() => setIsRequestStorageOpen(true)}
          />

          {/* Main workspace */}
          <main className="flex-1 p-3 md:p-5 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
            {/* Breadcrumb & Action bar */}
            <div className="flex items-center justify-between text-sm mb-4 md:mb-5 select-none gap-2">
              <div
                ref={breadcrumbRef}
                className="flex items-center space-x-1.5 text-ucd-muted min-w-0 overflow-x-auto scrollbar-none py-1 pr-2 max-w-full"
              >
                <button onClick={() => navigateToFolder(null)} className="hover:text-ucd-accent transition-colors flex items-center space-x-1.5 shrink-0">
                  {activeTab === 'starred' ? (
                    <><Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" /><span className="whitespace-nowrap font-medium">Starred</span></>
                  ) : activeTab === 'trash' ? (
                    <><Trash2 className="w-4 h-4 text-ucd-rose shrink-0" /><span className="whitespace-nowrap font-medium">Trash</span></>
                  ) : (
                    <><HardDrive className="w-4 h-4 text-ucd-accent shrink-0" /><span className="whitespace-nowrap font-medium">My Drive</span></>
                  )}
                </button>

                {activeTab === 'my_drive' && safeFolderPath.map((folder, idx) => {
                  if (!folder || !folder.id) return null
                  const isLast = idx === safeFolderPath.length - 1
                  return (
                    <React.Fragment key={folder.id || idx}>
                      <ChevronRight className="w-3.5 h-3.5 text-ucd-border shrink-0" />
                      <button
                        onClick={() => navigateToFolder(folder)}
                        className={`hover:text-ucd-accent transition-colors whitespace-nowrap shrink-0 ${
                          isLast ? 'text-ucd-text font-bold' : 'text-ucd-muted font-medium'
                        }`}
                      >
                        {folder.name || 'Folder'}
                      </button>
                    </React.Fragment>
                  )
                })}
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                {(filteredFiles.length > 0 || filteredFolders.length > 0) && (
                  <>
                    {/* Alphanumeric/Natural Sort Controller */}
                    <div className="flex items-center space-x-1.5 border border-ucd-border bg-ucd-surface/50 rounded-xl p-0.5 shrink-0">
                      <button
                        onClick={() => {
                          if (sortBy === 'name') setSortBy('date')
                          else if (sortBy === 'date') setSortBy('size')
                          else setSortBy('name')
                        }}
                        title={`Sorting by ${sortBy === 'name' ? 'Name' : sortBy === 'date' ? 'Date' : 'Size'}. Click to change.`}
                        className="flex items-center space-x-1.5 px-2.5 py-1 hover:text-white text-ucd-dim text-xs font-semibold rounded-lg hover:bg-ucd-hover transition-all"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5 text-ucd-accent" />
                        <span>{sortBy === 'name' ? 'Name' : sortBy === 'date' ? 'Date' : 'Size'}</span>
                      </button>
                      <button
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        title={`Order: ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}. Click to toggle.`}
                        className="p-1 hover:text-white text-ucd-dim rounded-lg hover:bg-ucd-hover transition-all"
                      >
                        {sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-ucd-accent" /> : <ArrowDown className="w-3.5 h-3.5 text-ucd-accent" />}
                      </button>
                    </div>

                    <button
                      onClick={toggleSelectAll}
                      title={
                        (selectedItems?.length || 0) >= (filteredFiles.length + filteredFolders.length)
                          ? "Deselect All Items"
                          : "Select All Items"
                      }
                      className={`flex items-center space-x-1.5 px-2.5 py-1.5 border rounded-xl text-xs font-semibold transition-all shrink-0 ${
                        (selectedItems?.length || 0) >= (filteredFiles.length + filteredFolders.length)
                          ? 'bg-ucd-accent/20 border-ucd-accent/40 text-ucd-accent shadow-glow'
                          : 'bg-ucd-surface hover:bg-ucd-hover border-ucd-border text-ucd-dim hover:text-ucd-text'
                      }`}
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>
                        {(selectedItems?.length || 0) >= (filteredFiles.length + filteredFolders.length) ? 'Deselect All' : 'Select All'}
                      </span>
                    </button>
                  </>
                )}


                {activeTab === 'trash' && (filteredFiles.length > 0 || filteredFolders.length > 0) && (
                  <button
                    onClick={() => setShowEmptyTrashModal(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-semibold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Empty Trash</span>
                  </button>
                )}
              </div>
            </div>

            {/* Loading */}
            {loading ? (
              <div className="flex items-center justify-center py-20 text-ucd-accent space-x-3">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">Loading content...</span>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Folders */}
                {filteredFolders.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-ucd-dim mb-2.5">Folders</h3>
                    <div className={viewMode === 'grid'
                      ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5"
                      : "bg-ucd-surface/40 rounded-2xl border border-ucd-border p-1 space-y-1 overflow-visible"
                    }>
                      {filteredFolders.map((folder) => <FolderCard key={folder.id} folder={folder} />)}
                    </div>
                  </div>
                )}

                {/* Files */}
                <div>
                  {filteredFolders.length > 0 && (
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-ucd-dim mb-2.5">Files</h3>
                  )}

                  {filteredFiles.length === 0 && filteredFolders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 md:py-24 text-center border border-dashed border-ucd-border rounded-2xl bg-ucd-surface/20">
                      <div className="p-4 bg-ucd-accent/10 text-ucd-accent rounded-2xl border border-ucd-accent/20 mb-4 shadow-glow">
                        <Upload className="w-8 h-8" />
                      </div>
                      <h4 className="font-semibold text-base text-ucd-text">
                        {activeTab === 'trash' ? 'Trash is empty' : 'No files found'}
                      </h4>
                      <p className="text-sm text-ucd-dim max-w-xs mt-1.5">
                        {activeTab === 'trash'
                          ? 'Items moved to trash will appear here before permanent deletion.'
                          : 'Drag and drop files here, or click "+" in the bottom right to upload your files.'}
                      </p>
                    </div>
                  ) : (
                    <div className={viewMode === 'grid'
                      ? "grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5"
                      : "bg-ucd-surface/40 rounded-2xl border border-ucd-border p-1 space-y-1 overflow-visible"
                    }>
                      {filteredFiles.map((file, idx) => (
                        <FileCard
                          key={file.id}
                          file={file}
                          index={idx}
                          onPreview={(f, url) => setPreviewState({ file: f, streamUrl: url })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Drag overlay */}
        {isDragging && (
          <div className="fixed inset-0 z-50 bg-gradient-to-br from-ucd-accent/90 to-ucd-royal/90 backdrop-blur-md flex flex-col items-center justify-center text-white border-4 border-dashed border-white/40 m-4 md:m-6 rounded-2xl pointer-events-none">
            <Upload className="w-12 h-12 md:w-16 md:h-16 mb-3 animate-bounce" />
            <h2 className="text-xl md:text-2xl font-bold">Drop files to upload</h2>
            <p className="text-sm mt-1 opacity-80">Files will be stored in your Telegram Cloud</p>
          </div>
        )}

        {/* Floating Action Plus Button — hide when in selection mode */}
        {!selectionMode && <FloatingActionButton onOpenNewFolder={() => setIsNewFolderOpen(true)} />}

        {/* Bulk Action Bar — appears when items are selected */}
        <BulkActionBar
          selectedCount={selectedItems?.length || 0}
          onBulkCopy={bulkCopy}
          onBulkCut={bulkCut}
          onBulkDownload={bulkDownload}
          onBulkDelete={() => setShowBulkDeleteModal(true)}
          onBulkRestore={bulkRestore}
          onClear={clearSelection}
          activeTab={activeTab}
        />

        {/* Floating Clipboard & Pasting Progress Bar (Bottom) */}
        {pastingState?.isPasting ? (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="flex items-center space-x-3 bg-ucd-surface/95 backdrop-blur-xl border border-ucd-accent/40 rounded-2xl shadow-2xl px-4 py-2.5 max-w-[90vw] md:max-w-md">
              <Loader2 className="w-5 h-5 text-ucd-accent animate-spin shrink-0" />
              <div className="flex flex-col text-xs min-w-0">
                <span className="font-bold text-ucd-accent truncate">
                  {pastingState.action === 'cut' ? 'Moving' : 'Copying'} items... ({pastingState.current}/{pastingState.total})
                </span>
                {pastingState.itemName && (
                  <span className="text-[11px] text-ucd-dim truncate">
                    {pastingState.itemName}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : clipboard && !selectionMode ? (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="flex items-center space-x-2 md:space-x-3 bg-ucd-surface/95 backdrop-blur-xl border border-emerald-500/40 rounded-2xl shadow-2xl px-3 py-2 md:px-4 md:py-2.5 max-w-[90vw] md:max-w-lg">
              <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-medium min-w-0 pr-2 border-r border-ucd-border">
                <ClipboardCheck className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
                <span className="hidden sm:inline">Ready:</span>
                <span className="font-semibold text-white max-w-[100px] sm:max-w-[160px] truncate">
                  {clipboard.bulk ? `${clipboard.items?.length} items` : clipboard.item?.name}
                </span>
                <span className="text-[10px] uppercase px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded font-bold shrink-0">
                  {clipboard.action}
                </span>
              </div>

              <button
                onClick={pasteItem}
                disabled={Boolean(pastingState?.isPasting)}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-glow transition-all active:scale-95 disabled:opacity-50 shrink-0"
              >
                <Clipboard className="w-4 h-4" />
                <span>Paste Here</span>
              </button>

              <button
                onClick={clearClipboard}
                title="Cancel Clipboard"
                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : null}

        <UploadProgress />
        <NewFolderModal isOpen={isNewFolderOpen} onClose={() => setIsNewFolderOpen(false)} />
        <RequestStorageModal isOpen={isRequestStorageOpen} onClose={() => setIsRequestStorageOpen(false)} />
        {previewState.file && (
          <PreviewModal file={previewState.file} streamUrl={previewState.streamUrl} onClose={() => setPreviewState({ file: null, streamUrl: '' })} />
        )}
        <Toast toast={toast} onClose={clearToast} />

        {/* Empty Trash Confirm Modal */}
        <ConfirmModal
          isOpen={showEmptyTrashModal}
          onClose={() => setShowEmptyTrashModal(false)}
          onConfirm={handleConfirmEmptyTrash}
          title="Empty Trash Bin?"
          message="Are you sure you want to permanently delete all items in Trash? All file attachments in Telegram will be destroyed."
          confirmText="Empty Trash"
          confirmStyle="danger"
          loading={emptyingTrash}
        />

        {/* Bulk Delete Confirm Modal */}
        <ConfirmModal
          isOpen={showBulkDeleteModal}
          onClose={() => setShowBulkDeleteModal(false)}
          onConfirm={handleBulkDeleteConfirm}
          title={activeTab === 'trash' ? 'Delete Selected Permanently?' : 'Move Selected to Trash?'}
          message={
            activeTab === 'trash'
              ? `Are you sure you want to permanently delete ${selectedItems?.length || 0} selected item(s)? This cannot be undone.`
              : `Are you sure you want to move ${selectedItems?.length || 0} selected item(s) to Trash?`
          }
          confirmText={activeTab === 'trash' ? 'Delete Permanently' : 'Move to Trash'}
          confirmStyle="danger"
          loading={bulkDeleting}
        />


        {/* Delete Account 3-Step Verification Modal */}
        <DeleteAccountModal
          isOpen={isDeleteAccountOpen}
          onClose={() => setIsDeleteAccountOpen(false)}
        />

        <FolderUploadModal />
      </div>

    </div>
  )
}
