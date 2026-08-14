import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'

import { getFiles, getFolders, getFolderPath, createFolder, uploadFile as apiUploadFile, emptyTrash as apiEmptyTrash, moveItemApi, copyItemApi, updateFile, updateFolder, deleteFile, deleteFolder, getDownloadUrl, API_BASE_URL } from '../lib/api'

import { useAuth } from './AuthContext'

const DriveContext = createContext({})

// 2GB File Size Limit in Bytes
const MAX_FILE_SIZE = 2147483648

// Recursive helper to fetch all nested files inside a folder (and its subfolders)
const fetchFolderFilesRecursively = async (folderId) => {
  let resultFiles = []
  try {
    const [subFiles, subFolders] = await Promise.all([
      getFiles(folderId, null, false),
      getFolders(folderId, false)
    ])
    if (subFiles && subFiles.length > 0) {
      resultFiles.push(...subFiles)
    }
    if (subFolders && subFolders.length > 0) {
      for (const sf of subFolders) {
        const nestedFiles = await fetchFolderFilesRecursively(sf.id)
        resultFiles.push(...nestedFiles)
      }
    }
  } catch (err) {
    console.error(`Error resolving files for folder ${folderId}:`, err)
  }
  return resultFiles
}

export const DriveProvider = ({ children }) => {
  const { user, refreshUser } = useAuth()
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      return params.get('tab') || 'my_drive'
    }
    return 'my_drive'
  })
  const [currentFolder, setCurrentFolder] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const initFolderId = params.get('folder')
      if (initFolderId) {
        const storedName = sessionStorage.getItem(`ucd_fname_${initFolderId}`) || 'Folder'
        return { id: initFolderId, name: storedName }
      }
    }
    return null
  })
  const [folderPath, setFolderPath] = useState([]) // [{id, name}]
  const [files, setFiles] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState('grid') // grid | list
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadQueue, setUploadQueue] = useState([]) // [{ id, uploadId, fileName, stage, progress, loaded, total, speed, etaSeconds, status, controller, error }]
  const [toast, setToast] = useState(null) // { message, type: 'error' | 'success' }
  const [clipboard, setClipboard] = useState(null) // { action: 'copy'|'cut', type: 'file'|'folder', item }
  const [pastingState, setPastingState] = useState(null) // { isPasting: true, action, current, total, itemName }
  const [pendingFolderUpload, setPendingFolderUpload] = useState(null) // { folderName, filesCount, foldersCount, rawFiles, uniqueFolders }
  const [isReconstructingFolders, setIsReconstructingFolders] = useState(false)
  const [sortBy, setSortBy] = useState('name') // 'name' | 'size' | 'date'
  const [sortOrder, setSortOrder] = useState('asc') // 'asc' | 'desc'
  const [activeMenuId, setActiveMenuId] = useState(null)




  // ─── MULTI-SELECTION STATE ──────────────────────────────────────
  const [selectedItems, setSelectedItems] = useState([]) // [{ id, type: 'file'|'folder', item }]
  const [selectionMode, setSelectionMode] = useState(false)

  const showToast = (message, type = 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // ─── BEFORE-UNLOAD GUARD (Upload/Download Protection) ──────────
  useEffect(() => {
    const hasActiveUploads = uploadQueue.some(u => u.status === 'uploading' || u.status === 'queued')
    if (!hasActiveUploads) return

    const handleBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = 'Upload in progress. Are you sure you want to leave?'
      return e.returnValue
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && navigator.locks) {
        navigator.locks.request('ucd-upload-keepalive', { mode: 'shared' }, () => {
          return new Promise((resolve) => {
            const check = () => {
              const stillActive = uploadQueue.some(u => u.status === 'uploading' || u.status === 'queued')
              if (document.visibilityState === 'visible' || !stillActive) {
                resolve()
              } else {
                setTimeout(check, 1000)
              }
            }
            check()
          })
        }).catch(() => {})
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [uploadQueue])

  const fetchAbortControllerRef = React.useRef(null)
  const driveCacheRef = React.useRef(new Map())

  // Stable content fetcher with SWR Memory Cache for 0ms navigation
  const fetchDriveContent = useCallback(async (showLoading = true) => {
    if (!user?.id) return

    const cacheKey = `${activeTab}_${currentFolder?.id || 'root'}`
    const cachedData = driveCacheRef.current.get(cacheKey)

    // SWR Pattern: Render instantly (0ms) from memory cache if available
    if (cachedData) {
      setFiles(cachedData.files || [])
      setFolders(cachedData.folders || [])
      showLoading = false
    } else if (showLoading) {
      setLoading(true)
    }

    // Abort previous pending fetch request if user navigated rapidly
    if (fetchAbortControllerRef.current) {
      try { fetchAbortControllerRef.current.abort() } catch (e) {}
    }
    const controller = new AbortController()
    fetchAbortControllerRef.current = controller

    try {
      let freshFiles = []
      let freshFolders = []

      if (activeTab === 'starred') {
        freshFiles = (await getFiles(null, true, false, controller.signal)) || []
        freshFolders = []
      } else if (activeTab === 'trash') {
        const [fileList, folderList] = await Promise.all([
          getFiles(null, null, true, controller.signal),
          getFolders(null, true, controller.signal)
        ])
        freshFiles = fileList || []
        freshFolders = folderList || []
      } else if (currentFolder?.id) {
        const [fileList, folderList, pathAncestors] = await Promise.all([
          getFiles(currentFolder.id, null, false, controller.signal),
          getFolders(currentFolder.id, false, controller.signal),
          getFolderPath(currentFolder.id, controller.signal)
        ])
        freshFiles = fileList || []
        freshFolders = folderList || []
        if (!controller.signal.aborted && Array.isArray(pathAncestors) && pathAncestors.length > 0) {
          setFolderPath(pathAncestors)
          const targetLeaf = pathAncestors[pathAncestors.length - 1]
          if (targetLeaf && targetLeaf.name) {
            setCurrentFolder(targetLeaf)
            try { sessionStorage.setItem(`ucd_fname_${targetLeaf.id}`, targetLeaf.name) } catch (e) {}
          }
        }
      } else {
        const [fileList, folderList] = await Promise.all([
          getFiles(null, null, false, controller.signal),
          getFolders(null, false, controller.signal)
        ])
        freshFiles = fileList || []
        freshFolders = folderList || []
        if (!controller.signal.aborted) {
          setFolderPath([])
        }
      }

      if (!controller.signal.aborted) {
        setFiles(freshFiles)
        setFolders(freshFolders)
        driveCacheRef.current.set(cacheKey, { files: freshFiles, folders: freshFolders, timestamp: Date.now() })
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
        // Ignored — request cancelled due to fast navigation
        return
      }
      console.error("Error fetching drive content:", err)
    } finally {
      if (fetchAbortControllerRef.current === controller) {
        if (showLoading) setLoading(false)
      }
    }
  }, [user?.id, currentFolder?.id, activeTab])

  const toggleStarLocally = (id, type) => {
    if (type === 'file') {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, is_starred: !f.is_starred } : f))
    } else {
      setFolders(prev => prev.map(f => f.id === id ? { ...f, is_starred: !f.is_starred } : f))
    }
    driveCacheRef.current.clear()
  }


  // Trigger content load ONLY when user ID, current folder ID, or active tab changes
  useEffect(() => {
    fetchDriveContent(true)
  }, [fetchDriveContent])

  // Clear selection and dropdown menu when navigating or changing tabs
  useEffect(() => {
    setSelectedItems([])
    setSelectionMode(false)
    setActiveMenuId(null)
  }, [currentFolder?.id, activeTab])

  // Helper to sync state with browser history (PushState)
  const pushDriveState = (tab, folder, path) => {
    const state = {
      tab: tab || 'my_drive',
      folderId: folder?.id || null,
      folderName: folder?.name || null,
      folderPath: path || []
    }

    let url = window.location.pathname
    if (tab === 'starred') url += '?tab=starred'
    else if (tab === 'trash') url += '?tab=trash'
    else if (folder?.id) url += `?folder=${folder.id}`

    const currentState = window.history.state
    if (currentState?.tab === state.tab && currentState?.folderId === state.folderId) {
      return
    }

    window.history.pushState(state, '', url)
  }

  // Handle mobile hardware back button & browser back/forward buttons
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initTab = params.get('tab') || 'my_drive'
    const initFolderId = params.get('folder')

    if (!window.history.state) {
      window.history.replaceState({
        tab: initTab,
        folderId: initFolderId,
        folderPath: []
      }, '', window.location.search || window.location.pathname)
    }

    const handlePopState = (e) => {
      // If selection mode is active, exit selection first
      if (selectionMode) {
        setSelectedItems([])
        setSelectionMode(false)
      }

      const state = e.state
      if (state) {
        setActiveTab(state.tab || 'my_drive')
        if (state.folderId) {
          setCurrentFolder({ id: state.folderId, name: state.folderName || 'Folder' })
          setFolderPath(state.folderPath || [])
        } else {
          setCurrentFolder(null)
          setFolderPath([])
        }
      } else {
        // Fallback to My Drive root
        setActiveTab('my_drive')
        setCurrentFolder(null)
        setFolderPath([])
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [selectionMode])

  const changeTab = (tab) => {
    setActiveTab(tab)
    setCurrentFolder(null)
    setFolderPath([])
    pushDriveState(tab, null, [])
  }

  const navigateToFolder = (folder) => {
    if (!folder) {
      setCurrentFolder(null)
      setFolderPath([])
      pushDriveState('my_drive', null, [])
      return
    }

    if (folder.id && folder.name) {
      try {
        sessionStorage.setItem(`ucd_fname_${folder.id}`, folder.name)
      } catch (e) {}
    }

    let newPath = []
    const index = folderPath.findIndex(p => p.id === folder.id)
    if (index !== -1) {
      newPath = folderPath.slice(0, index + 1)
    } else {
      newPath = [...folderPath, folder]
    }

    setActiveTab('my_drive')
    setCurrentFolder(folder)
    setFolderPath(newPath)
    pushDriveState('my_drive', folder, newPath)
  }

  // Optimistic local state updates for folder operations (Zero flicker)
  const addFolderLocally = (newFolder) => {
    setFolders(prev => {
      if (prev.some(f => f.id === newFolder.id)) return prev
      return [...prev, newFolder]
    })
  }

  const removeFolderLocally = (folderId) => {
    setFolders(prev => prev.filter(f => f.id !== folderId))
    refreshUser?.()
  }

  const removeFileLocally = (fileId) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
    refreshUser?.()
  }

  const emptyTrashAll = async () => {
    try {
      setFiles([])
      setFolders([])
      await apiEmptyTrash()
      showToast("Trash emptied successfully!", "success")
      refreshUser?.()
      await fetchDriveContent(false)
    } catch (err) {
      showToast("Failed to empty trash.", "error")
    }
  }

  // ─── CLIPBOARD COPY / CUT / PASTE ──────────────────────────────────────
  const copyItem = (item, type = 'file') => {
    setClipboard({ action: 'copy', type, item })
    showToast(`"${item?.name || 'Item'}" copied to clipboard`, 'success')
  }

  const cutItem = (item, type = 'file') => {
    setClipboard({ action: 'cut', type, item })
    showToast(`"${item?.name || 'Item'}" cut to clipboard`, 'success')
  }

  const pasteItem = async () => {
    if (!clipboard || pastingState?.isPasting) return
    const { action, type, item, bulk, items } = clipboard
    const destFolderId = currentFolder?.id || null

    if (bulk && Array.isArray(items)) {
      return bulkPaste()
    }

    setPastingState({
      isPasting: true,
      action: action || 'copy',
      current: 1,
      total: 1,
      itemName: item?.name || 'Item'
    })

    try {
      if (action === 'cut') {
        await moveItemApi(item.id, type, destFolderId)
        showToast(`"${item?.name || 'Item'}" moved successfully!`, 'success')
      } else {
        await copyItemApi(item.id, type, destFolderId)
        showToast(`"${item?.name || 'Item'}" copied successfully!`, 'success')
      }
      setClipboard(null)
      refreshUser?.()
      await fetchDriveContent(false)
    } catch (err) {
      console.error("Paste error:", err)
      const errorMsg = err.response?.data?.detail || err.message || "Failed to paste item."
      showToast(errorMsg, 'error')
    } finally {
      setPastingState(null)
    }
  }

  const clearClipboard = () => setClipboard(null)

  // ─── MULTI-SELECTION OPERATIONS ──────────────────────────────────────
  const toggleSelectItem = useCallback((item, type) => {
    setSelectedItems(prev => {
      const exists = prev.find(s => s.id === item.id && s.type === type)
      if (exists) {
        const next = prev.filter(s => !(s.id === item.id && s.type === type))
        if (next.length === 0) setSelectionMode(false)
        return next
      }
      return [...prev, { id: item.id, type, item }]
    })
  }, [])

  const enterSelectionMode = useCallback((item, type) => {
    setSelectionMode(true)
    setSelectedItems([{ id: item.id, type, item }])
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedItems([])
    setSelectionMode(false)
  }, [])

  const selectAll = useCallback(() => {
    const allVisible = [
      ...(folders || []).map(f => ({ id: f.id, type: 'folder', item: f })),
      ...(files || []).map(f => ({ id: f.id, type: 'file', item: f }))
    ]
    if (allVisible.length === 0) return
    setSelectedItems(allVisible)
    setSelectionMode(true)
  }, [folders, files])

  const toggleSelectAll = useCallback(() => {
    const totalVisible = (folders?.length || 0) + (files?.length || 0)
    if (totalVisible === 0) return

    if (selectedItems.length >= totalVisible) {
      setSelectedItems([])
      setSelectionMode(false)
    } else {
      selectAll()
    }
  }, [folders, files, selectedItems, selectAll])

  const isItemSelected = useCallback((id, type) => {
    return selectedItems.some(s => s.id === id && s.type === type)
  }, [selectedItems])

  // Bulk Copy — copy all selected items to clipboard context
  const bulkCopy = useCallback(() => {
    if (selectedItems.length === 0) return
    setClipboard({ action: 'copy', items: selectedItems, bulk: true })
    showToast(`${selectedItems.length} items copied to clipboard`, 'success')
    clearSelection()
  }, [selectedItems, clearSelection])

  // Bulk Cut — cut all selected items
  const bulkCut = useCallback(() => {
    if (selectedItems.length === 0) return
    setClipboard({ action: 'cut', items: selectedItems, bulk: true })
    showToast(`${selectedItems.length} items cut to clipboard`, 'success')
    clearSelection()
  }, [selectedItems, clearSelection])

  // Bulk Paste — paste all items from bulk clipboard with progress tracking
  const bulkPaste = async () => {
    if (!clipboard?.bulk || pastingState?.isPasting) return
    const { action, items } = clipboard
    const destFolderId = currentFolder?.id || null
    const totalItems = items?.length || 0
    if (totalItems === 0) return

    let successCount = 0

    setPastingState({
      isPasting: true,
      action: action || 'copy',
      current: 0,
      total: totalItems,
      itemName: items[0]?.item?.name || 'Item'
    })

    for (let i = 0; i < totalItems; i++) {
      const sel = items[i]
      setPastingState({
        isPasting: true,
        action: action || 'copy',
        current: i + 1,
        total: totalItems,
        itemName: sel.item?.name || `Item ${i + 1}`
      })

      try {
        if (action === 'cut') {
          await moveItemApi(sel.id, sel.type, destFolderId)
        } else {
          await copyItemApi(sel.id, sel.type, destFolderId)
        }
        successCount++
      } catch (err) {
        console.error(`Bulk paste error for ${sel.item?.name}:`, err)
      }
    }

    setPastingState(null)
    setClipboard(null)
    refreshUser?.()
    await fetchDriveContent(false)
    showToast(`${successCount} of ${totalItems} items ${action === 'cut' ? 'moved' : 'copied'} successfully!`, 'success')
  }

  // Bulk Download — sequential download of selected files & files inside selected folders
  const bulkDownload = useCallback(async () => {
    if (selectedItems.length === 0) return

    let allFilesToDownload = []

    for (const sel of selectedItems) {
      if (sel.type === 'file' && sel.item) {
        allFilesToDownload.push(sel.item)
      } else if (sel.type === 'folder' && sel.id) {
        const folderFiles = await fetchFolderFilesRecursively(sel.id)
        allFilesToDownload.push(...folderFiles)
      }
    }

    // Deduplicate file records by ID
    const uniqueFiles = Array.from(new Map(allFilesToDownload.map(f => [f.id, f])).values())

    if (uniqueFiles.length === 0) {
      showToast('No files found to download in selected items.', 'error')
      return
    }

    showToast(`Started downloading ${uniqueFiles.length} file(s) sequentially...`, 'success')
    clearSelection()

    // Trigger sequential browser downloads with 750ms spacing between triggers
    uniqueFiles.forEach((fileRec, index) => {
      setTimeout(() => {
        const url = getDownloadUrl(fileRec.id)
        const a = document.createElement('a')
        a.href = url
        a.download = fileRec.name || 'file'
        a.style.display = 'none'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }, index * 750)
    })
  }, [selectedItems, clearSelection, showToast])


  // Bulk Restore — restore all selected items from trash
  const bulkRestore = useCallback(async () => {
    if (selectedItems.length === 0) return
    let successCount = 0

    for (const sel of selectedItems) {
      try {
        if (sel.type === 'file') {
          await updateFile(sel.id, { is_trash: false })
        } else {
          await updateFolder(sel.id, { is_trash: false })
        }
        successCount++
      } catch (err) {
        console.error(`Bulk restore error for ${sel.item?.name}:`, err)
      }
    }

    clearSelection()
    refreshUser?.()
    await fetchDriveContent(false)
    showToast(`${successCount} items restored.`, 'success')
  }, [selectedItems, clearSelection, refreshUser, fetchDriveContent])

  // Bulk Delete / Trash — move all selected items to trash (or permanently delete if in trash)
  const bulkDelete = useCallback(async () => {
    if (selectedItems.length === 0) return
    const isTrash = activeTab === 'trash'
    let successCount = 0

    for (const sel of selectedItems) {
      try {
        if (isTrash) {
          // Permanent delete
          if (sel.type === 'file') {
            await deleteFile(sel.id)
          } else {
            await deleteFolder(sel.id)
          }
        } else {
          // Soft delete (move to trash)
          if (sel.type === 'file') {
            await updateFile(sel.id, { is_trash: true })
          } else {
            await updateFolder(sel.id, { is_trash: true })
          }
        }
        successCount++
      } catch (err) {
        console.error(`Bulk delete error for ${sel.item?.name}:`, err)
      }
    }

    clearSelection()
    refreshUser?.()
    await fetchDriveContent(false)
    showToast(
      isTrash
        ? `${successCount} items permanently deleted.`
        : `${successCount} items moved to Trash.`,
      'success'
    )
  }, [selectedItems, activeTab, clearSelection, refreshUser, fetchDriveContent])

  const uploadControllersRef = React.useRef(new Map())

  // Push Files to Upload Queue Line (Handles both Files and Folders with recursive structure reconstruction)
  const uploadFiles = async (fileList) => {
    const rawFiles = Array.from(fileList)
    if (rawFiles.length === 0) return

    const initialFolderId = currentFolder?.id || null
    const uniqueFolders = new Set()

    rawFiles.forEach(file => {
      const relPath = file.webkitRelativePath || file.relativePath
      if (relPath) {
        const parts = relPath.split('/')
        parts.pop() // remove filename
        if (parts.length > 0) {
          for (let i = 1; i <= parts.length; i++) {
            uniqueFolders.add(parts.slice(0, i).join('/'))
          }
        }
      }
    })

    if (uniqueFolders.size > 0) {
      const rootFolderNames = Array.from(new Set(
        Array.from(uniqueFolders).map(f => f.split('/')[0])
      ))
      const displayFolderName = rootFolderNames.length > 1
        ? `${rootFolderNames.length} Folders (${rootFolderNames.slice(0, 2).join(', ')}${rootFolderNames.length > 2 ? '...' : ''})`
        : (rootFolderNames[0] || 'Selected Folder')

      setPendingFolderUpload({
        folderName: displayFolderName,
        filesCount: rawFiles.length,
        foldersCount: uniqueFolders.size,
        rawFiles,
        uniqueFolders
      })
      return
    }

    let existingFilesInFolder = []
    try {
      existingFilesInFolder = (await getFiles(initialFolderId)) || []
    } catch (e) {
      existingFilesInFolder = []
    }

    let skippedCount = 0

    const newItems = rawFiles.map(file => {
      const itemId = Math.random().toString(36).substring(7)
      const uploadId = Math.random().toString(36).substring(7)
      const isTooLarge = file.size > MAX_FILE_SIZE

      const isAlreadyUploaded = existingFilesInFolder.some(f => f.name.toLowerCase() === file.name.toLowerCase() && !f.is_trash)

      if (isAlreadyUploaded) {
        skippedCount++
        return {
          id: itemId,
          uploadId,
          file,
          fileName: file.name,
          targetFolderId: initialFolderId,
          stage: 'cloud',
          progress: 100,
          loaded: file.size,
          total: file.size,
          speed: 0,
          etaSeconds: 0,
          status: 'success',
          skipped: true,
          error: null
        }
      }

      if (isTooLarge) {
        showToast(`"${file.name}" exceeds the 2GB limit!`, 'error')
      } else {
        uploadControllersRef.current.set(itemId, new AbortController())
      }

      return {
        id: itemId,
        uploadId,
        file,
        fileName: file.name,
        targetFolderId: initialFolderId,
        stage: 'local',
        progress: 0,
        loaded: 0,
        total: file.size,
        speed: 0,
        etaSeconds: 0,
        status: isTooLarge ? 'error' : 'queued',
        error: isTooLarge ? 'Size Limit Exceeded (>2GB)' : null
      }
    })

    setUploadQueue(prev => [...prev, ...newItems])
    if (skippedCount > 0) {
      showToast(`Skipped ${skippedCount} already uploaded files. Enqueued ${newItems.length - skippedCount} remaining files.`, 'success')
    } else {
      showToast(`Added ${newItems.length} items to upload queue.`, 'success')
    }
  }

  const confirmFolderUpload = async () => {
    if (!pendingFolderUpload) return
    const { rawFiles, uniqueFolders } = pendingFolderUpload
    setIsReconstructingFolders(true)

    const initialFolderId = currentFolder?.id || null
    const pathMap = { "": initialFolderId }

    try {
      const sortedFolders = Array.from(uniqueFolders).sort((a, b) => {
        return a.split('/').length - b.split('/').length
      })

      for (const folderPath of sortedFolders) {
        const parts = folderPath.split('/')
        const folderName = parts[parts.length - 1]
        const parentPath = parts.slice(0, -1).join('/')
        const parentFolderId = pathMap[parentPath]

        try {
          // Check if folder already exists under this parent
          const existingFolders = await getFolders(parentFolderId)
          const matched = (existingFolders || []).find(f => f.name.toLowerCase() === folderName.toLowerCase() && !f.is_trash)

          if (matched) {
            pathMap[folderPath] = matched.id
          } else {
            const newFolder = await createFolder(folderName, parentFolderId)
            pathMap[folderPath] = newFolder.id
            if (parentFolderId === (currentFolder?.id || null)) {
              addFolderLocally(newFolder)
            }
          }
        } catch (err) {
          console.error("Failed to reconstruct folder path:", folderPath, err)
          pathMap[folderPath] = parentFolderId
        }
      }

      // Fetch existing files per folder to skip already-uploaded files (Auto-Resume Smart Sync)
      const existingFilesPerFolderMap = {}
      const targetFolderIds = Array.from(new Set(Object.values(pathMap)))

      for (const fId of targetFolderIds) {
        try {
          const filesInFolder = await getFiles(fId)
          existingFilesPerFolderMap[fId] = filesInFolder || []
        } catch (e) {
          existingFilesPerFolderMap[fId] = []
        }
      }

      let skippedCount = 0

      const newItems = rawFiles.map(file => {
        const itemId = Math.random().toString(36).substring(7)
        const uploadId = Math.random().toString(36).substring(7)
        const isTooLarge = file.size > MAX_FILE_SIZE

        let fileFolderId = initialFolderId
        const relPath = file.webkitRelativePath || file.relativePath
        if (relPath) {
          const parts = relPath.split('/')
          parts.pop() // remove filename
          const fileFolderPath = parts.join('/')
          fileFolderId = pathMap[fileFolderPath] || initialFolderId
        }

        // Check if file with exact name & size already exists in target cloud folder
        const existingFolderFiles = existingFilesPerFolderMap[fileFolderId] || []
        const isAlreadyUploaded = existingFolderFiles.some(f => f.name.toLowerCase() === file.name.toLowerCase() && !f.is_trash)

        if (isAlreadyUploaded) {
          skippedCount++
          return {
            id: itemId,
            uploadId,
            file,
            fileName: file.name,
            targetFolderId: fileFolderId,
            stage: 'cloud',
            progress: 100,
            loaded: file.size,
            total: file.size,
            speed: 0,
            etaSeconds: 0,
            status: 'success',
            skipped: true,
            error: null
          }
        }

        if (isTooLarge) {
          showToast(`"${file.name}" exceeds the 2GB limit!`, 'error')
        } else {
          uploadControllersRef.current.set(itemId, new AbortController())
        }

        return {
          id: itemId,
          uploadId,
          file,
          fileName: file.name,
          targetFolderId: fileFolderId, // Bound permanently to target folder ID
          stage: 'local', // 'local' | 'cloud'
          progress: 0,
          loaded: 0,
          total: file.size,
          speed: 0,
          etaSeconds: 0,
          status: isTooLarge ? 'error' : 'queued', // queued | uploading | success | error | cancelled
          error: isTooLarge ? 'Size Limit Exceeded (>2GB)' : null
        }
      })

      setUploadQueue(prev => [...prev, ...newItems])
      if (skippedCount > 0) {
        showToast(`Skipped ${skippedCount} already uploaded files. Enqueued ${newItems.length - skippedCount} remaining files.`, 'success')
      } else {
        showToast(`Added ${newItems.length} items to upload queue.`, 'success')
      }
    } catch (err) {
      console.error("Reconstruction failed:", err)
      showToast("Reconstruction failed", "error")
    } finally {
      setIsReconstructingFolders(false)
      setPendingFolderUpload(null)
    }
  }

  const cancelFolderUpload = () => {
    setPendingFolderUpload(null)
  }



  // Reactive Sequential Upload Queue Worker Engine
  useEffect(() => {
    const safeQueue = Array.isArray(uploadQueue) ? uploadQueue : []
    const isUploading = safeQueue.some(u => u?.status === 'uploading')
    if (isUploading) return

    const nextItem = safeQueue.find(u => u?.status === 'queued')
    if (!nextItem || !nextItem.id) return

    const processUpload = async (item) => {
      setUploadQueue(prev => prev.map(u => u.id === item.id ? { ...u, status: 'uploading', stage: 'local' } : u))

      let sse = null
      try {
        sse = new EventSource(`${API_BASE_URL}/api/files/upload-progress/${item.uploadId}`)
        sse.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.stage === 'cloud') {
              const current = data.current || 0
              const total = data.total || item.file.size
              const speed = data.speed || 0
              const percent = data.percent || 0
              const remainingBytes = total - current
              const etaSeconds = speed > 0 ? Math.round(remainingBytes / speed) : 0

              setUploadQueue(prev => prev.map(u => u.id === item.id ? {
                ...u,
                stage: 'cloud',
                progress: percent,
                loaded: current,
                total: total,
                speed: speed,
                etaSeconds: etaSeconds
              } : u))
            }
          } catch (e) {}
        }
      } catch (e) {
        console.warn("SSE connection error:", e)
      }

      const controller = uploadControllersRef.current.get(item.id)

      try {
        await apiUploadFile(item.file, item.targetFolderId, (metrics) => {
          setUploadQueue(prev => prev.map(u => {
            if (u.id === item.id && u.stage === 'local') {
              return {
                ...u,
                progress: metrics.percent,
                loaded: metrics.loaded,
                total: metrics.total,
                speed: metrics.speed,
                etaSeconds: metrics.etaSeconds
              }
            }
            return u
          }))
        }, controller?.signal, item.uploadId)

        setUploadQueue(prev => prev.map(u => u.id === item.id ? {
          ...u,
          status: 'success',
          progress: 100,
          speed: 0,
          etaSeconds: 0
        } : u))

        refreshUser?.()
        await fetchDriveContent(false)
      } catch (err) {
        if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
          console.log(`Upload cancelled or paused by user for "${item.fileName}"`)
          setUploadQueue(prev => prev.map(u => {
            if (u.id === item.id) {
              if (u.status === 'paused') {
                return { ...u, speed: 0, etaSeconds: 0 }
              }
              return { ...u, status: 'cancelled', error: 'Upload cancelled' }
            }
            return u
          }))
        } else {
          console.error("Upload error detail:", err)
          const errorMessage = err.response?.data?.detail || err.message || 'Upload failed'
          setUploadQueue(prev => prev.map(u => u.id === item.id ? { ...u, status: 'error', error: errorMessage } : u))
        }
      } finally {
        uploadControllersRef.current.delete(item.id)
        if (sse) {
          try { sse.close() } catch (e) {}
        }
      }
    }

    processUpload(nextItem)
  }, [uploadQueue, refreshUser, fetchDriveContent])

  const [isPausedAll, setIsPausedAll] = useState(false)

  const notifyResumeUploadOnBackend = (uploadId) => {
    if (!uploadId) return
    try {
      fetch(`${API_BASE_URL}/api/files/resume-upload/${uploadId}`, { method: 'POST' }).catch(() => {})
    } catch (e) {}
  }

  const pauseUpload = (id) => {
    setUploadQueue(prev => prev.map(u => {
      if (u.id === id) {
        notifyCancelUploadOnBackend(u.uploadId)
        return { ...u, status: 'paused', speed: 0, etaSeconds: 0 }
      }
      return u
    }))
    const controller = uploadControllersRef.current.get(id)
    if (controller) {
      try { controller.abort() } catch (e) {}
    }
  }

  const resumeUpload = (id) => {
    uploadControllersRef.current.set(id, new AbortController())
    setUploadQueue(prev => prev.map(u => {
      if (u.id === id) {
        notifyResumeUploadOnBackend(u.uploadId)
        const freshUploadId = Math.random().toString(36).substring(7)
        return {
          ...u,
          uploadId: freshUploadId,
          status: 'queued',
          stage: 'local',
          progress: 0,
          loaded: 0,
          speed: 0,
          etaSeconds: 0,
          error: null
        }
      }
      return u
    }))
  }

  const pauseAllUploads = () => {
    setIsPausedAll(true)
    const safeQueue = Array.isArray(uploadQueue) ? uploadQueue : []
    safeQueue.forEach(u => {
      if (u.status === 'uploading' || u.status === 'queued') {
        notifyCancelUploadOnBackend(u.uploadId)
        const controller = uploadControllersRef.current.get(u.id)
        if (controller) {
          try { controller.abort() } catch (e) {}
        }
      }
    })
    setUploadQueue(prev => prev.map(u => (u.status === 'uploading' || u.status === 'queued') ? { ...u, status: 'paused', speed: 0, etaSeconds: 0 } : u))
  }

  const resumeAllUploads = () => {
    setIsPausedAll(false)
    const safeQueue = Array.isArray(uploadQueue) ? uploadQueue : []
    safeQueue.forEach(u => {
      if (u.status === 'paused' || u.status === 'cancelled' || u.status === 'error') {
        uploadControllersRef.current.set(u.id, new AbortController())
        notifyResumeUploadOnBackend(u.uploadId)
      }
    })
    setUploadQueue(prev => prev.map(u => (u.status === 'paused' || u.status === 'cancelled' || u.status === 'error') ? {
      ...u,
      uploadId: Math.random().toString(36).substring(7),
      status: 'queued',
      stage: 'local',
      progress: 0,
      loaded: 0,
      speed: 0,
      etaSeconds: 0,
      error: null
    } : u))
  }

  const retryAllUploads = () => {
    setIsPausedAll(false)
    const safeQueue = Array.isArray(uploadQueue) ? uploadQueue : []
    safeQueue.forEach(u => {
      if (u.status === 'cancelled' || u.status === 'error' || u.status === 'paused') {
        uploadControllersRef.current.set(u.id, new AbortController())
        notifyResumeUploadOnBackend(u.uploadId)
      }
    })
    setUploadQueue(prev => prev.map(u => (u.status === 'cancelled' || u.status === 'error' || u.status === 'paused') ? {
      ...u,
      uploadId: Math.random().toString(36).substring(7),
      status: 'queued',
      stage: 'local',
      progress: 0,
      loaded: 0,
      speed: 0,
      etaSeconds: 0,
      error: null
    } : u))
  }

  const retryUpload = (id) => {
    setUploadQueue(prev => prev.map(u => {
      if (u.id === id) {
        uploadControllersRef.current.set(id, new AbortController())
        notifyResumeUploadOnBackend(u.uploadId)
        return {
          ...u,
          uploadId: Math.random().toString(36).substring(7),
          status: 'queued',
          stage: 'local',
          progress: 0,
          loaded: 0,
          speed: 0,
          etaSeconds: 0,
          error: null
        }
      }
      return u
    }))
  }

  const cancelUploadInQueue = (id) => {
    const item = (uploadQueue || []).find(u => u.id === id)
    if (item) {
      notifyCancelUploadOnBackend(item.uploadId)
    }
    const controller = uploadControllersRef.current.get(id)
    if (controller) {
      try { controller.abort() } catch (e) {}
      uploadControllersRef.current.delete(id)
    }
    setUploadQueue(prev => prev.map(u => u.id === id ? { ...u, status: 'cancelled', error: 'Upload cancelled' } : u))
  }

  const removeUploadFromQueue = (id) => {
    cancelUploadInQueue(id)
    setUploadQueue(prev => prev.filter(u => u.id !== id))
  }

  const clearUploadQueue = () => {
    const safeQueue = Array.isArray(uploadQueue) ? uploadQueue : []
    safeQueue.forEach(u => {
      if (u.status === 'uploading' || u.status === 'queued') {
        cancelUploadInQueue(u.id)
      }
    })
    setUploadQueue([])
  }


  const sortedFiles = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    const items = [...files]
    if (sortBy === 'name') {
      items.sort((a, b) => {
        const comp = collator.compare(a.name || '', b.name || '')
        return sortOrder === 'asc' ? comp : -comp
      })
    } else if (sortBy === 'size') {
      items.sort((a, b) => {
        const comp = (a.size || 0) - (b.size || 0)
        return sortOrder === 'asc' ? comp : -comp
      })
    } else if (sortBy === 'date') {
      items.sort((a, b) => {
        const comp = new Date(a.created_at || 0) - new Date(b.created_at || 0)
        return sortOrder === 'asc' ? comp : -comp
      })
    }
    return items
  }, [files, sortBy, sortOrder])

  const sortedFolders = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    const items = [...folders]
    if (sortBy === 'name') {
      items.sort((a, b) => {
        const comp = collator.compare(a.name || '', b.name || '')
        return sortOrder === 'asc' ? comp : -comp
      })
    } else if (sortBy === 'date') {
      items.sort((a, b) => {
        const comp = new Date(a.created_at || 0) - new Date(b.created_at || 0)
        return sortOrder === 'asc' ? comp : -comp
      })
    }
    return items
  }, [folders, sortBy, sortOrder])

  return (
    <DriveContext.Provider value={{
      activeTab: activeTab || 'my_drive',
      setActiveTab: changeTab,
      currentFolder: currentFolder || null,
      folderPath: folderPath || [],
      navigateToFolder,
      files: sortedFiles,
      folders: sortedFolders,
      sortBy,
      setSortBy,
      sortOrder,
      setSortOrder,
      loading: Boolean(loading),

      viewMode: viewMode || 'grid',
      setViewMode,
      searchQuery: searchQuery || '',
      setSearchQuery,
      uploadQueue: uploadQueue || [],
      uploadFiles,
      pauseUpload,
      resumeUpload,
      pauseAllUploads,
      resumeAllUploads,
      isPausedAll,
      retryUpload,
      retryAllUploads,
      cancelUploadInQueue,
      removeUploadFromQueue,
      clearUploadQueue,

      addFolderLocally,
      removeFolderLocally,
      removeFileLocally,
      toggleStarLocally,
      emptyTrashAll,
      pendingFolderUpload,
      isReconstructingFolders,
      confirmFolderUpload,
      cancelFolderUpload,
      activeMenuId,
      setActiveMenuId,



      clipboard: clipboard || null,
      pastingState: pastingState || null,
      copyItem,
      cutItem,
      pasteItem: clipboard?.bulk ? bulkPaste : pasteItem,
      clearClipboard,
      // Multi-Selection
      selectedItems: selectedItems || [],
      selectionMode: Boolean(selectionMode),
      toggleSelectItem,
      enterSelectionMode,
      clearSelection,
      selectAll,
      toggleSelectAll,
      isItemSelected,
      bulkCopy,
      bulkCut,
      bulkDownload,
      bulkDelete,
      bulkRestore,
      toast: toast || null,
      showToast,
      clearToast: () => setToast(null),
      refreshContent: (showLoading = true) => fetchDriveContent(showLoading)
    }}>
      {children}
    </DriveContext.Provider>
  )
}

export const useDrive = () => useContext(DriveContext) || {}
