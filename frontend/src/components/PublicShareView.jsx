import React, { useState, useEffect, useMemo } from 'react'
import {
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  FileArchive,
  FileCode,
  File,
  Folder,
  Loader2,
  AlertCircle,
  ChevronRight,
  LayoutGrid,
  List,
  Search,
  ArrowDownToLine,
  ShieldCheck,
  Play,
  CheckSquare,
  Square,
  CheckCircle2
} from 'lucide-react'
import {
  getPublicFileInfo,
  getPublicFolderInfo,
  getPublicDownloadUrl,
  getPublicStreamUrl,
  getPublicFileDownloadUrl,
  getPublicFileStreamUrl,
  getPublicThumbnailUrl
} from '../lib/api'
import { formatBytes, getFileCategory } from '../lib/fileUtils'
import { PreviewModal } from './PreviewModal'
import { BrandLogo } from './BrandLogo'

export const PublicShareView = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [shareData, setShareData] = useState(null)
  const [shareType, setShareType] = useState('file') // 'file' | 'folder'
  const [shareToken, setShareToken] = useState('')
  const [previewState, setPreviewState] = useState({ file: null, streamUrl: '' })
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [searchQuery, setSearchQuery] = useState('')
  const [thumbnailErrors, setThumbnailErrors] = useState({})
  const [selectedFileIds, setSelectedFileIds] = useState([])

  const fetchFolderContent = (token, subfolderId = null, pushHistory = true) => {
    setLoading(true)
    setSelectedFileIds([])
    getPublicFolderInfo(token, subfolderId)
      .then(data => {
        setShareData(data)
        setLoading(false)
        if (pushHistory) {
          const state = { subfolderId }
          const url = `/share/folder/${token}` + (subfolderId ? `?folder=${subfolderId}` : '')
          if (!window.history.state || window.history.state.subfolderId !== subfolderId) {
            window.history.pushState(state, '', url)
          }
        }
      })
      .catch(err => {
        setError(err.response?.data?.detail || "Shared folder link has expired or is invalid.")
        setLoading(false)
      })
  }

  useEffect(() => {
    const path = window.location.pathname
    const parts = path.split('/').filter(Boolean)

    if (parts.length >= 3 && parts[0] === 'share') {
      const type = parts[1]
      const token = parts[2]
      setShareType(type)
      setShareToken(token)

      if (type === 'file') {
        getPublicFileInfo(token)
          .then(data => { setShareData(data); setLoading(false) })
          .catch(err => { setError(err.response?.data?.detail || "Shared file link has expired or is invalid."); setLoading(false) })
      } else if (type === 'folder') {
        const params = new URLSearchParams(window.location.search)
        const initFolder = params.get('folder')
        fetchFolderContent(token, initFolder, false)
      }
    } else {
      setError("Invalid share link.")
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const handleSharePopState = (e) => {
      if (shareType === 'folder' && shareToken) {
        const subfolderId = e.state?.subfolderId || null
        fetchFolderContent(shareToken, subfolderId, false)
      }
    }

    window.addEventListener('popstate', handleSharePopState)
    return () => window.removeEventListener('popstate', handleSharePopState)
  }, [shareType, shareToken])

  const handleThumbnailError = (fileId) => {
    setThumbnailErrors(prev => ({ ...prev, [fileId]: true }))
  }

  // Search filtering
  const filteredFolders = useMemo(() => {
    if (!shareData?.folders) return []
    if (!searchQuery.trim()) return shareData.folders
    const q = searchQuery.toLowerCase()
    return shareData.folders.filter(f => f.name.toLowerCase().includes(q))
  }, [shareData?.folders, searchQuery])

  const filteredFiles = useMemo(() => {
    if (!shareData?.files) return []
    if (!searchQuery.trim()) return shareData.files
    const q = searchQuery.toLowerCase()
    return shareData.files.filter(f => f.name.toLowerCase().includes(q))
  }, [shareData?.files, searchQuery])

  // Multi-Selection Logic
  const toggleSelectFile = (fileId, e) => {
    e?.stopPropagation()
    setSelectedFileIds(prev =>
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    )
  }

  const toggleSelectAll = () => {
    if (selectedFileIds.length === filteredFiles.length) {
      setSelectedFileIds([])
    } else {
      setSelectedFileIds(filteredFiles.map(f => f.id))
    }
  }

  const rootToken = shareToken || shareData?.root_folder?.share_token

  // Bulk download selected files
  const handleBulkDownload = () => {
    if (selectedFileIds.length === 0) return
    selectedFileIds.forEach(fileId => {
      const url = getPublicFileDownloadUrl(rootToken, fileId)
      const a = document.createElement('a')
      a.href = url
      a.download = ''
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070a13] bg-supabase-grid flex flex-col items-center justify-center text-ucd-accent">
        <Loader2 className="w-9 h-9 animate-spin mb-3 text-ucd-accent" />
        <span className="text-sm font-medium text-ucd-muted">Loading shared cloud content...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#070a13] bg-supabase-grid flex flex-col items-center justify-center p-4">
        <div className="bg-slate-900/70 border border-ucd-border/80 backdrop-blur-xl rounded-2xl p-6 text-center max-w-sm shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-3 border border-rose-500/20">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base text-ucd-text mb-1">Access Denied</h3>
          <p className="text-xs text-ucd-dim mb-4">{error}</p>
          <a href="/" className="px-4 py-2 bg-ucd-accent/20 hover:bg-ucd-accent/30 text-ucd-accent text-xs font-semibold rounded-xl border border-ucd-accent/30 transition-colors inline-block">
            Go to Universal Cloud Drive
          </a>
        </div>
      </div>
    )
  }

  const category = shareType === 'file' && shareData ? getFileCategory(shareData.mime_type, shareData.name) : 'document'

  return (
    <div className="dark bg-[#070a13] bg-supabase-grid min-h-screen text-ucd-text flex flex-col select-none">
      {/* Header Bar */}
      <header className="h-14 border-b border-cyan-500/20 bg-slate-950/20 backdrop-blur-md px-4 md:px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <BrandLogo size="sm" />
          <span className="text-[11px] bg-ucd-accent/15 border border-ucd-accent/30 text-ucd-accent px-2 py-0.5 rounded-md font-medium flex items-center space-x-1">
            <ShieldCheck className="w-3 h-3 text-ucd-accent" />
            <span>Public Shared Folder</span>
          </span>
        </div>

        <a
          href="/"
          className="px-4 py-1.5 bg-ucd-surface hover:bg-ucd-hover border border-ucd-border/80 text-xs font-semibold text-ucd-text rounded-xl transition-colors shadow-sm"
        >
          Sign In
        </a>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col">
        {/* SINGLE FILE SHARE VIEW */}
        {shareType === 'file' && shareData && (
          <div className="max-w-xl w-full mx-auto my-auto bg-slate-900/60 border border-cyan-500/20 backdrop-blur-xl rounded-3xl shadow-2xl p-6 md:p-8 relative overflow-hidden text-center">
            {/* Hero Image / Icon */}
            <div
              onClick={() => setPreviewState({ file: shareData, streamUrl: getPublicStreamUrl(shareData.share_token) })}
              className="relative w-full h-64 bg-slate-950/60 rounded-2xl overflow-hidden border border-ucd-border/80 flex items-center justify-center mb-6 cursor-pointer group"
            >
              {(category === 'image' || category === 'video') && !thumbnailErrors[shareData.id] ? (
                <img
                  src={getPublicThumbnailUrl(rootToken, shareData.id)}
                  alt={shareData.name}
                  onError={() => handleThumbnailError(shareData.id)}
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="flex flex-col items-center space-y-2">
                  {category === 'image' && <ImageIcon className="w-16 h-16 text-purple-400" />}
                  {category === 'video' && <Film className="w-16 h-16 text-rose-400" />}
                  {category === 'audio' && <Music className="w-16 h-16 text-emerald-400" />}
                  {category === 'pdf' && <FileText className="w-16 h-16 text-red-400" />}
                  {category === 'text' && <FileCode className="w-16 h-16 text-sky-400" />}
                  {category === 'archive' && <FileArchive className="w-16 h-16 text-amber-400" />}
                  {category === 'document' && <File className="w-16 h-16 text-ucd-accent" />}
                </div>
              )}

              {category === 'video' && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-ucd-accent/90 text-white flex items-center justify-center shadow-glow group-hover:scale-110 transition-transform">
                    <Play className="w-6 h-6 fill-white ml-0.5" />
                  </div>
                </div>
              )}
            </div>

            <h2 className="text-xl font-bold text-white truncate px-2">{shareData.name}</h2>
            <p className="text-xs text-ucd-dim mt-1.5">{formatBytes(shareData.size)} • Public Shared File</p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => setPreviewState({ file: shareData, streamUrl: getPublicStreamUrl(shareData.share_token) })}
                className="w-full sm:w-auto px-6 py-3 bg-slate-800/80 hover:bg-slate-700/80 border border-ucd-border/80 text-ucd-text font-semibold text-xs rounded-xl transition-all flex items-center justify-center space-x-2 shadow-md"
              >
                <Eye className="w-4 h-4 text-ucd-accent" />
                <span>Preview File</span>
              </button>

              <a
                href={getPublicDownloadUrl(shareData.share_token)}
                download
                className="w-full sm:w-auto px-7 py-3 bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 text-white font-semibold text-xs rounded-xl shadow-glow-btn transition-all flex items-center justify-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Download File</span>
              </a>
            </div>
          </div>
        )}

        {/* SHARED FOLDER GRID / LIST VIEW */}
        {shareType === 'folder' && shareData && (
          <div className="space-y-6">
            {/* Top Folder Header & Controls */}
            <div className="bg-slate-900/60 border border-cyan-500/20 backdrop-blur-xl rounded-2xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center space-x-3.5 min-w-0">
                <div className="p-3 bg-amber-400/10 rounded-xl border border-amber-400/20 shrink-0">
                  <Folder className="w-7 h-7 fill-amber-400/60 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-white truncate">
                    {shareData.current_folder?.name || shareData.root_folder?.name || 'Shared Folder'}
                  </h2>
                  <p className="text-xs text-ucd-dim mt-0.5">
                    Public Shared Folder • {(shareData.folders?.length || 0) + (shareData.files?.length || 0)} items
                  </p>
                </div>
              </div>

              {/* Toolbar: Search + Select All + View Switcher */}
              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                {/* Search Bar */}
                <div className="relative flex-1 md:w-56">
                  <Search className="w-4 h-4 text-ucd-dim absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search files..."
                    className="w-full bg-slate-950/60 border border-ucd-border/80 focus:border-ucd-accent/50 rounded-xl pl-9 pr-3 py-1.5 text-xs text-ucd-text placeholder-ucd-dim focus:outline-none transition-colors"
                  />
                </div>

                {/* Select All Button */}
                {filteredFiles.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className="px-3 py-1.5 bg-slate-950/60 hover:bg-slate-800 border border-ucd-border/80 text-xs font-semibold text-ucd-text rounded-xl transition-colors flex items-center space-x-1.5 shrink-0"
                  >
                    {selectedFileIds.length === filteredFiles.length ? (
                      <><CheckSquare className="w-4 h-4 text-ucd-accent" /><span>Deselect All</span></>
                    ) : (
                      <><Square className="w-4 h-4 text-ucd-dim" /><span>Select All</span></>
                    )}
                  </button>
                )}

                {/* Bulk Download Button */}
                {selectedFileIds.length > 0 && (
                  <button
                    onClick={handleBulkDownload}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 text-white font-semibold text-xs rounded-xl shadow-glow transition-all flex items-center space-x-1.5 shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download ({selectedFileIds.length})</span>
                  </button>
                )}

                {/* View Mode Switcher */}
                <div className="flex items-center bg-slate-950/60 border border-ucd-border/80 rounded-xl p-1 shrink-0">
                  <button
                    onClick={() => setViewMode('grid')}
                    title="Grid View"
                    className={`p-1.5 rounded-lg transition-colors ${
                      viewMode === 'grid' ? 'bg-ucd-accent/20 text-ucd-accent' : 'text-ucd-dim hover:text-ucd-text'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    title="List View"
                    className={`p-1.5 rounded-lg transition-colors ${
                      viewMode === 'list' ? 'bg-ucd-accent/20 text-ucd-accent' : 'text-ucd-dim hover:text-ucd-text'
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Breadcrumbs Navigation */}
            {shareData.breadcrumbs && shareData.breadcrumbs.length > 0 && (
              <div className="flex items-center space-x-2 overflow-x-auto text-xs bg-slate-900/40 backdrop-blur-md p-3 rounded-xl border border-cyan-500/20 scrollbar-none">
                {shareData.breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.id || idx}>
                    {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-ucd-dim shrink-0" />}
                    <button
                      onClick={() => fetchFolderContent(rootToken, crumb.id)}
                      className={`hover:text-ucd-accent transition-colors font-medium truncate max-w-[180px] ${
                        idx === shareData.breadcrumbs.length - 1 ? 'text-ucd-accent font-semibold' : 'text-ucd-dim'
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* SUBFOLDERS SECTION */}
            {filteredFolders.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-ucd-dim uppercase tracking-wider mb-3 px-1">Folders ({filteredFolders.length})</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {filteredFolders.map(subfolder => (
                    <div
                      key={subfolder.id}
                      onClick={() => fetchFolderContent(rootToken, subfolder.id)}
                      className="p-3.5 bg-slate-900/60 hover:bg-slate-800/80 border border-ucd-border/80 hover:border-ucd-accent/40 rounded-2xl cursor-pointer transition-all duration-200 flex items-center space-x-3 group shadow-md"
                    >
                      <div className="p-2.5 bg-amber-400/10 rounded-xl border border-amber-400/20 shrink-0 group-hover:scale-105 transition-transform">
                        <Folder className="w-5 h-5 fill-amber-400/60 text-amber-400" />
                      </div>
                      <span className="text-xs font-semibold text-ucd-text group-hover:text-ucd-accent truncate transition-colors">
                        {subfolder.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FILES SECTION */}
            <div>
              <h3 className="text-xs font-semibold text-ucd-dim uppercase tracking-wider mb-3 px-1">Files ({filteredFiles.length})</h3>

              {/* GRID VIEW (Clicking card opens Preview Modal directly) */}
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {filteredFiles.map(file => {
                    const fileCat = getFileCategory(file.mime_type, file.name)
                    const downloadUrl = getPublicFileDownloadUrl(rootToken, file.id)
                    const streamUrl = getPublicFileStreamUrl(rootToken, file.id)
                    const thumbUrl = getPublicThumbnailUrl(rootToken, file.id)
                    const isSelected = selectedFileIds.includes(file.id)
                    const hasThumb = (fileCat === 'image' || fileCat === 'video') && !thumbnailErrors[file.id]

                    return (
                      <div
                        key={file.id}
                        onClick={() => setPreviewState({ file, streamUrl })}
                        className={`bg-slate-900/60 hover:bg-slate-800/90 border rounded-2xl overflow-hidden transition-all duration-200 group flex flex-col shadow-lg cursor-pointer relative ${
                          isSelected ? 'border-ucd-accent ring-2 ring-ucd-accent/30 bg-ucd-accent/10' : 'border-ucd-border/80 hover:border-ucd-accent/40'
                        }`}
                      >
                        {/* Select Checkbox at Top-Right */}
                        <div
                          onClick={(e) => toggleSelectFile(file.id, e)}
                          className="absolute top-2.5 right-2.5 z-20 p-1 rounded-lg bg-slate-950/70 backdrop-blur-md border border-ucd-border/60 hover:border-ucd-accent text-ucd-dim hover:text-ucd-accent transition-all"
                          title={isSelected ? "Deselect" : "Select"}
                        >
                          {isSelected ? (
                            <CheckCircle2 className="w-4 h-4 text-ucd-accent fill-ucd-accent/20" />
                          ) : (
                            <Square className="w-4 h-4 text-ucd-dim" />
                          )}
                        </div>

                        {/* 16:9 Thumbnail / Image Card */}
                        <div className="relative aspect-video bg-slate-950/70 overflow-hidden flex items-center justify-center border-b border-ucd-border/60">
                          {hasThumb ? (
                            <img
                              src={thumbUrl}
                              alt={file.name}
                              onError={() => handleThumbnailError(file.id)}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <div className="p-4 rounded-2xl bg-slate-900/80 border border-ucd-border/60 shadow-inner">
                              {fileCat === 'image' && <ImageIcon className="w-8 h-8 text-purple-400" />}
                              {fileCat === 'video' && <Film className="w-8 h-8 text-rose-400" />}
                              {fileCat === 'audio' && <Music className="w-8 h-8 text-emerald-400" />}
                              {fileCat === 'pdf' && <FileText className="w-8 h-8 text-red-400" />}
                              {fileCat === 'text' && <FileCode className="w-8 h-8 text-sky-400" />}
                              {fileCat === 'archive' && <FileArchive className="w-8 h-8 text-amber-400" />}
                              {fileCat === 'document' && <File className="w-8 h-8 text-ucd-accent" />}
                            </div>
                          )}

                          {fileCat === 'video' && (
                            <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                              <div className="w-9 h-9 rounded-full bg-ucd-accent/90 text-white flex items-center justify-center shadow-glow group-hover:scale-110 transition-transform">
                                <Play className="w-4 h-4 fill-white ml-0.5" />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* File Details Footer */}
                        <div className="p-3 flex items-center justify-between min-w-0">
                          <div className="min-w-0 flex-1 pr-2">
                            <p className="text-xs font-medium text-ucd-text truncate group-hover:text-ucd-accent transition-colors" title={file.name}>
                              {file.name}
                            </p>
                            <p className="text-[10px] text-ucd-dim mt-0.5">{formatBytes(file.size)}</p>
                          </div>

                          <a
                            href={downloadUrl}
                            download
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 text-ucd-dim hover:text-ucd-accent hover:bg-ucd-accent/10 rounded-lg transition-colors shrink-0"
                            title="Download File"
                          >
                            <ArrowDownToLine className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* LIST VIEW */
                <div className="space-y-2">
                  {filteredFiles.map(file => {
                    const fileCat = getFileCategory(file.mime_type, file.name)
                    const downloadUrl = getPublicFileDownloadUrl(rootToken, file.id)
                    const streamUrl = getPublicFileStreamUrl(rootToken, file.id)
                    const isSelected = selectedFileIds.includes(file.id)

                    return (
                      <div
                        key={file.id}
                        onClick={() => setPreviewState({ file, streamUrl })}
                        className={`flex items-center justify-between p-3 bg-slate-900/60 hover:bg-slate-800/80 border rounded-xl transition-colors cursor-pointer group ${
                          isSelected ? 'border-ucd-accent bg-ucd-accent/10' : 'border-ucd-border/80'
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0 flex-1 pr-3">
                          <div
                            onClick={(e) => toggleSelectFile(file.id, e)}
                            className="shrink-0 p-0.5 text-ucd-dim hover:text-ucd-accent"
                          >
                            {isSelected ? (
                              <CheckCircle2 className="w-4 h-4 text-ucd-accent" />
                            ) : (
                              <Square className="w-4 h-4 text-ucd-dim" />
                            )}
                          </div>

                          <div className="shrink-0">
                            {fileCat === 'image' && <ImageIcon className="w-4 h-4 text-purple-400" />}
                            {fileCat === 'video' && <Film className="w-4 h-4 text-rose-400" />}
                            {fileCat === 'audio' && <Music className="w-4 h-4 text-emerald-400" />}
                            {fileCat === 'pdf' && <FileText className="w-4 h-4 text-red-400" />}
                            {fileCat === 'text' && <FileCode className="w-4 h-4 text-sky-400" />}
                            {fileCat === 'archive' && <FileArchive className="w-4 h-4 text-amber-400" />}
                            {fileCat === 'document' && <File className="w-4 h-4 text-ucd-accent" />}
                          </div>

                          <span className="text-xs font-medium text-ucd-text group-hover:text-ucd-accent truncate transition-colors">
                            {file.name}
                          </span>
                        </div>

                        <div className="flex items-center space-x-4 text-xs text-ucd-dim shrink-0">
                          <span>{formatBytes(file.size)}</span>
                          <a
                            href={downloadUrl}
                            download
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 text-ucd-accent hover:text-sky-400 hover:bg-ucd-accent/10 rounded-lg transition-colors"
                            title="Download File"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {filteredFiles.length === 0 && filteredFolders.length === 0 && (
                <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-cyan-500/20 text-ucd-dim text-xs">
                  {searchQuery ? "No matching files or folders found." : "This shared folder is empty."}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Preview Modal for Images / Videos / Documents */}
      {previewState.file && (
        <PreviewModal
          file={previewState.file}
          streamUrl={previewState.streamUrl}
          onClose={() => setPreviewState({ file: null, streamUrl: '' })}
        />
      )}
    </div>
  )
}
