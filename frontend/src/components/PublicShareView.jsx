import React, { useState, useEffect } from 'react'
import { Cloud, Download, Eye, FileText, Image, Film, Music, FileArchive, FileCode, File, Folder, Loader2, AlertCircle, ChevronRight } from 'lucide-react'
import { getPublicFileInfo, getPublicFolderInfo, getPublicDownloadUrl, getPublicStreamUrl, getPublicFileDownloadUrl, getPublicFileStreamUrl, getPublicThumbnailUrl } from '../lib/api'

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

  const fetchFolderContent = (token, subfolderId = null, pushHistory = true) => {
    setLoading(true)
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
    
    // Path format: /share/file/{token} OR /share/folder/{token}
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

  if (loading) {
    return (
      <div className="min-h-screen bg-ucd-bg flex flex-col items-center justify-center text-ucd-accent">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <span className="text-sm text-ucd-muted">Loading shared content...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-ucd-bg flex flex-col items-center justify-center p-4">
        <div className="bg-ucd-surface border border-ucd-border rounded-2xl p-6 text-center max-w-sm shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-3 border border-rose-500/20">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base text-ucd-text mb-1">Access Denied</h3>
          <p className="text-xs text-ucd-dim mb-4">{error}</p>
          <a href="/" className="px-4 py-2 bg-ucd-hover hover:bg-ucd-border text-xs font-semibold text-ucd-text rounded-xl transition-colors">
            Go to Universal Cloud Drive
          </a>
        </div>
      </div>
    )
  }

  const category = shareType === 'file' && shareData ? getFileCategory(shareData.mime_type, shareData.name) : 'document'
  const rootToken = shareToken || shareData?.root_folder?.share_token

  return (
    <div className="dark bg-firebase-texture min-h-screen text-ucd-text flex flex-col select-none">
      {/* Header */}
      <header className="h-14 border-b border-ucd-border bg-ucd-bg/95 backdrop-blur-sm px-4 md:px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-2.5">
          <BrandLogo size="sm" />
          <span className="text-xs bg-ucd-accent/15 border border-ucd-accent/30 text-ucd-accent px-2 py-0.5 rounded-md font-medium">Shared</span>
        </div>

        <a
          href="/"
          className="px-3.5 py-1.5 bg-ucd-surface hover:bg-ucd-hover border border-ucd-border text-xs font-semibold text-ucd-text rounded-xl transition-colors"
        >
          Sign In
        </a>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 flex flex-col justify-center items-center">
        {shareType === 'file' && shareData && (
          <div className="w-full max-w-md bg-ucd-surface border border-ucd-border rounded-2xl shadow-2xl p-6 relative overflow-hidden">
            <div className="w-16 h-16 bg-ucd-accent/10 border border-ucd-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-glow">
              {category === 'image' && <Image className="w-8 h-8 text-purple-400" />}
              {category === 'video' && <Film className="w-8 h-8 text-rose-400" />}
              {category === 'audio' && <Music className="w-8 h-8 text-emerald-400" />}
              {category === 'pdf' && <FileText className="w-8 h-8 text-red-400" />}
              {category === 'text' && <FileCode className="w-8 h-8 text-sky-400" />}
              {category === 'archive' && <FileArchive className="w-8 h-8 text-amber-400" />}
              {category === 'document' && <File className="w-8 h-8 text-slate-400" />}
            </div>

            <h2 className="text-lg font-bold text-ucd-text text-center truncate px-2">{shareData.name}</h2>
            <p className="text-xs text-ucd-dim text-center mt-1">{formatBytes(shareData.size)} • Shared File</p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => setPreviewState({ file: shareData, streamUrl: getPublicStreamUrl(shareData.share_token) })}
                className="w-full sm:w-auto px-5 py-2.5 bg-ucd-bg hover:bg-ucd-hover border border-ucd-border text-ucd-text font-semibold text-xs rounded-xl transition-colors flex items-center justify-center space-x-2"
              >
                <Eye className="w-4 h-4 text-ucd-accent" />
                <span>Preview</span>
              </button>

              <a
                href={getPublicDownloadUrl(shareData.share_token)}
                download
                className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 text-white font-semibold text-xs rounded-xl shadow-glow-btn transition-all flex items-center justify-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Download File</span>
              </a>
            </div>
          </div>
        )}

        {shareType === 'folder' && shareData && (
          <div className="w-full bg-ucd-surface border border-ucd-border rounded-2xl shadow-2xl p-5 md:p-6">
            {/* Folder Header */}
            <div className="flex items-center justify-between mb-4 border-b border-ucd-border pb-4">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="p-2.5 bg-amber-400/10 rounded-xl border border-amber-400/20 shrink-0">
                  <Folder className="w-6 h-6 fill-amber-400/60 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-ucd-text truncate">{shareData.current_folder?.name || shareData.root_folder?.name}</h2>
                  <p className="text-xs text-ucd-dim">
                    Public Shared Folder • {(shareData.folders?.length || 0) + (shareData.files?.length || 0)} items
                  </p>
                </div>
              </div>
            </div>

            {/* Breadcrumbs Navigation */}
            {shareData.breadcrumbs && shareData.breadcrumbs.length > 0 && (
              <div className="flex items-center space-x-1.5 overflow-x-auto text-xs mb-5 bg-ucd-bg/60 p-2.5 rounded-xl border border-ucd-border shrink-0">
                {shareData.breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.id || idx}>
                    {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-ucd-dim shrink-0" />}
                    <button
                      onClick={() => fetchFolderContent(rootToken, crumb.id)}
                      className={`hover:text-ucd-accent transition-colors font-medium truncate max-w-[150px] ${
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
            {shareData.folders && shareData.folders.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-ucd-dim uppercase tracking-wider mb-2.5 px-1">Subfolders</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {shareData.folders.map(subfolder => (
                    <div
                      key={subfolder.id}
                      onClick={() => fetchFolderContent(rootToken, subfolder.id)}
                      className="p-3 bg-ucd-bg hover:bg-ucd-hover border border-ucd-border hover:border-ucd-accent/30 rounded-xl cursor-pointer transition-all flex items-center space-x-3 group"
                    >
                      <div className="p-2 bg-amber-400/10 rounded-lg shrink-0">
                        <Folder className="w-5 h-5 fill-amber-400/60 text-amber-400" />
                      </div>
                      <span className="text-sm font-medium text-ucd-text group-hover:text-ucd-accent truncate transition-colors">
                        {subfolder.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FILES SECTION */}
            <div>
              <h3 className="text-xs font-semibold text-ucd-dim uppercase tracking-wider mb-2.5 px-1">Files</h3>
              <div className="space-y-2">
                {shareData.files?.map(file => {
                  const fileCat = getFileCategory(file.mime_type, file.name)
                  const downloadUrl = getPublicFileDownloadUrl(rootToken, file.id)
                  const streamUrl = getPublicFileStreamUrl(rootToken, file.id)

                  return (
                    <div key={file.id} className="flex items-center justify-between p-3 bg-ucd-bg hover:bg-ucd-surface border border-ucd-border rounded-xl transition-colors">
                      <div className="flex items-center space-x-3 min-w-0 flex-1 pr-2">
                        <div className="shrink-0">
                          {fileCat === 'image' && <Image className="w-4 h-4 text-purple-400" />}
                          {fileCat === 'video' && <Film className="w-4 h-4 text-rose-400" />}
                          {fileCat === 'audio' && <Music className="w-4 h-4 text-emerald-400" />}
                          {fileCat === 'pdf' && <FileText className="w-4 h-4 text-red-400" />}
                          {fileCat === 'text' && <FileCode className="w-4 h-4 text-sky-400" />}
                          {fileCat === 'archive' && <FileArchive className="w-4 h-4 text-amber-400" />}
                          {fileCat === 'document' && <File className="w-4 h-4 text-ucd-accent" />}
                        </div>
                        <span className="text-sm font-medium text-ucd-text truncate">{file.name}</span>
                      </div>

                      <div className="flex items-center space-x-3.5 text-xs text-ucd-dim shrink-0">
                        <span>{formatBytes(file.size)}</span>
                        
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => setPreviewState({ file, streamUrl })}
                            className="p-1.5 text-ucd-dim hover:text-ucd-accent hover:bg-ucd-accent/10 rounded-lg transition-colors"
                            title="Preview File"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <a
                            href={downloadUrl}
                            download
                            className="p-1.5 text-ucd-accent hover:text-sky-400 hover:bg-ucd-accent/10 rounded-lg transition-colors"
                            title="Download File"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {(!shareData.files || shareData.files.length === 0) && (!shareData.folders || shareData.folders.length === 0) && (
                  <div className="text-center py-12 text-ucd-dim text-xs">This shared folder is empty.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {previewState.file && (
        <PreviewModal file={previewState.file} streamUrl={previewState.streamUrl} onClose={() => setPreviewState({ file: null, streamUrl: '' })} />
      )}
    </div>
  )
}
