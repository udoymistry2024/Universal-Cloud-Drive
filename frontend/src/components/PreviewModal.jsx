import React, { useState, useEffect } from 'react'
import { X, Download, Loader2, FileText, Image as ImageIcon, Film, Music, FileCode, File } from 'lucide-react'
import { getFileCategory, formatBytes } from '../lib/fileUtils'
import { getDownloadUrl } from '../lib/api'
import { AudioPlayer } from './AudioPlayer'

export const PreviewModal = ({ file, streamUrl, onClose }) => {
  const [textContent, setTextContent] = useState('')
  const [loadingText, setLoadingText] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
  const [videoLoading, setVideoLoading] = useState(true)

  if (!file) return null

  const category = getFileCategory(file.mime_type, file.name)
  const downloadUrl = file?.id ? getDownloadUrl(file.id) : ''

  useEffect(() => {
    if (category === 'text' && streamUrl) {
      setLoadingText(true)
      fetch(streamUrl)
        .then(res => res.text())
        .then(text => { setTextContent(text); setLoadingText(false) })
        .catch(() => { setTextContent("Failed to load text preview."); setLoadingText(false) })
    }
    if (category === 'image') {
      setImageLoading(true)
    }
    if (category === 'video') {
      setVideoLoading(true)
    }
  }, [file.id, streamUrl, category])



  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="h-12 md:h-14 px-3 md:px-6 flex items-center justify-between border-b border-ucd-accent/20 bg-ucd-bg/90 backdrop-blur-sm shrink-0">
        <div className="min-w-0 flex-1 pr-4">
          <p className="font-semibold text-sm text-ucd-accent truncate">{file.name}</p>
          <p className="text-[10px] text-ucd-dim">{formatBytes(file.size)}</p>
        </div>
        <div className="flex items-center space-x-2">
          {downloadUrl && (
            <a
              href={downloadUrl}
              download
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 text-white text-xs font-semibold rounded-xl shadow-glow-btn transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </a>
          )}
          <button onClick={onClose} className="p-1.5 text-ucd-dim hover:text-ucd-accent hover:bg-ucd-surface rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content Container */}
      <div className="flex-1 flex items-center justify-center p-3 md:p-6 overflow-hidden">
        {category === 'image' && (
          <div className="relative w-full h-full flex items-center justify-center">
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center text-ucd-accent z-10">
                <Loader2 className="w-10 h-10 animate-spin text-ucd-accent" />
              </div>
            )}
            <img
              src={streamUrl}
              alt={file.name}
              fetchPriority="high"
              decoding="async"
              onLoad={() => setImageLoading(false)}
              onError={() => setImageLoading(false)}
              className={`max-h-full max-w-full object-contain rounded-xl border border-ucd-accent/20 shadow-glow-lg transition-all duration-300 ${
                imageLoading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
              }`}
            />
          </div>
        )}


        {category === 'video' && (
          <div className="relative w-full max-w-5xl h-full flex items-center justify-center">
            {videoLoading && (
              <div className="absolute inset-0 flex items-center justify-center text-rose-400 z-10 bg-black/60 backdrop-blur-sm rounded-2xl">
                <Loader2 className="w-10 h-10 animate-spin text-rose-400" />
              </div>
            )}
            <video
              src={streamUrl}
              controls
              autoPlay
              playsInline
              preload="auto"
              onLoadedData={() => setVideoLoading(false)}
              onCanPlay={() => setVideoLoading(false)}
              onError={() => setVideoLoading(false)}
              className="max-h-full max-w-full rounded-2xl border border-ucd-accent/30 shadow-2xl bg-black"
            />
          </div>
        )}

        {category === 'audio' && (
          <AudioPlayer src={streamUrl} fileName={file.name} autoPlay={true} />
        )}

        {category === 'pdf' && (
          <iframe
            src={streamUrl}
            title={file.name}
            className="w-full max-w-5xl h-full rounded-xl bg-white border border-ucd-accent/20 shadow-glow-lg"
          />
        )}

        {category === 'text' && (
          <div className="w-full max-w-4xl h-full bg-ucd-bg border border-ucd-accent/20 rounded-xl p-4 md:p-6 overflow-y-auto font-mono text-xs text-ucd-text shadow-glow-lg select-text cursor-text">
            {loadingText ? (
              <div className="flex items-center justify-center h-full text-ucd-accent select-none">
                <Loader2 className="w-8 h-8 animate-spin text-ucd-accent" />
              </div>
            ) : (
              <pre className="whitespace-pre-wrap font-mono leading-relaxed select-text cursor-text selection:bg-ucd-accent/40 selection:text-white">{textContent}</pre>
            )}
          </div>
        )}


        {!['image', 'video', 'audio', 'pdf', 'text'].includes(category) && (
          <div className="text-center p-8 bg-ucd-surface border border-ucd-border rounded-3xl max-w-md shadow-glow-lg flex flex-col items-center space-y-4 m-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shadow-sm">
              <File className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">No Browser Preview Available</h3>
              <p className="text-xs text-ucd-dim leading-relaxed">
                This file format <span className="text-ucd-accent font-semibold">({file.name.includes('.') ? `.${file.name.split('.').pop()?.toUpperCase()}` : (file.mime_type || 'Binary')})</span> cannot be previewed directly inside the browser.
              </p>
            </div>
            {downloadUrl && (
              <a
                href={downloadUrl}
                download
                className="inline-flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 text-white text-sm font-semibold rounded-xl shadow-glow-btn transition-all active:scale-95 mt-2"
              >
                <Download className="w-4 h-4" />
                <span>Download File ({formatBytes(file.size)})</span>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

