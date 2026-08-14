import React, { useState } from 'react'
import { CheckCircle2, AlertCircle, Loader2, X, ChevronDown, ChevronUp, UploadCloud, Clock, Ban, ShieldCheck, Server, RotateCcw, Pause, Play, Zap } from 'lucide-react'
import { useDrive } from '../context/DriveContext'
import { formatBytes, formatSpeed, formatETA } from '../lib/fileUtils'

export const UploadProgress = () => {
  const {
    uploadQueue = [],
    removeUploadFromQueue,
    retryUpload,
    retryAllUploads,
    clearUploadQueue,
    pauseUpload,
    resumeUpload,
    pauseAllUploads,
    resumeAllUploads,
    isPausedAll
  } = useDrive() || {}
  
  const [isMinimized, setIsMinimized] = useState(false)
  const safeQueue = Array.isArray(uploadQueue) ? uploadQueue : []

  if (safeQueue.length === 0) return null

  const activeCount = safeQueue.filter(u => u?.status === 'uploading' || u?.status === 'queued').length
  const pausedCount = safeQueue.filter(u => u?.status === 'paused').length
  const failedOrCancelledCount = safeQueue.filter(u => u?.status === 'cancelled' || u?.status === 'error').length
  const hasActiveOrPaused = activeCount > 0 || pausedCount > 0

  return (
    <div className="fixed bottom-4 right-4 w-84 md:w-96 bg-ucd-surface rounded-2xl shadow-2xl border border-ucd-border overflow-hidden z-50 animate-in slide-in-from-bottom-4 duration-300 select-none">
      {/* Header */}
      <div className="bg-ucd-bg border-b border-ucd-accent/20 p-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <UploadCloud className="w-4 h-4 text-ucd-accent animate-pulse" />
          <span className="font-semibold text-xs md:text-sm text-ucd-accent">
            {activeCount > 0
              ? `Uploading ${activeCount} item${activeCount > 1 ? 's' : ''}`
              : pausedCount > 0
              ? `Paused (${pausedCount} item${pausedCount > 1 ? 's' : ''})`
              : failedOrCancelledCount > 0
              ? `Stopped (${failedOrCancelledCount} item${failedOrCancelledCount > 1 ? 's' : ''})`
              : `Uploads finished (${safeQueue.length})`}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          {/* Pause All Button */}
          {activeCount > 0 && (
            <button
              onClick={() => pauseAllUploads?.()}
              title="Pause all active uploads"
              className="p-1 hover:bg-amber-500/20 text-amber-400 rounded transition-colors mr-1 cursor-pointer flex items-center space-x-1 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30"
            >
              <Pause className="w-3.5 h-3.5 fill-amber-400" />
              <span className="text-[10px] font-bold">Pause</span>
            </button>
          )}

          {/* Resume All Button */}
          {pausedCount > 0 && (
            <button
              onClick={() => resumeAllUploads?.()}
              title="Resume all paused uploads"
              className="p-1 hover:bg-emerald-500/20 text-emerald-400 rounded transition-colors mr-1 cursor-pointer flex items-center space-x-1 px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30"
            >
              <Play className="w-3.5 h-3.5 fill-emerald-400" />
              <span className="text-[10px] font-bold">Resume</span>
            </button>
          )}

          {/* Retry All Button */}
          {failedOrCancelledCount > 0 && activeCount === 0 && pausedCount === 0 && (
            <button
              onClick={() => retryAllUploads?.()}
              title="Retry all stopped or cancelled uploads"
              className="p-1 hover:bg-cyan-500/20 text-cyan-400 rounded transition-colors mr-1 cursor-pointer flex items-center space-x-1 px-1.5 py-0.5 bg-cyan-500/10 border border-cyan-500/30"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold">Retry All</span>
            </button>
          )}

          <button
            onClick={() => setIsMinimized(v => !v)}
            title={isMinimized ? "Expand" : "Collapse"}
            className="p-1 hover:bg-ucd-surface rounded text-ucd-dim hover:text-ucd-accent transition-colors"
          >
            {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          
          <button
            onClick={() => {
              if (!hasActiveOrPaused) {
                clearUploadQueue?.()
              }
            }}
            disabled={hasActiveOrPaused}
            title={hasActiveOrPaused ? "Cannot close panel while uploads are active or paused" : "Close panel"}
            aria-label="Close upload progress panel"
            className={`p-1 rounded transition-colors ${
              hasActiveOrPaused
                ? 'opacity-30 cursor-not-allowed text-ucd-dim'
                : 'text-ucd-dim hover:text-ucd-rose hover:bg-ucd-rose/20'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="max-h-64 overflow-y-auto divide-y divide-ucd-border">
          {safeQueue.map((item) => {
            if (!item || !item.id) return null
            return (
              <div key={item.id} className="p-3 flex items-center justify-between">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-xs font-medium text-ucd-text truncate max-w-[200px] md:max-w-[260px]">
                    {item.fileName || 'Uploading file...'}
                  </p>

                  {item.status === 'uploading' && (
                    <>
                      <div className="mt-1 flex items-center space-x-1.5 text-[10px] font-medium">
                        {item.stage === 'cloud' ? (
                          <span className="text-sky-400 flex items-center space-x-1">
                            <ShieldCheck className="w-3 h-3 animate-pulse text-sky-400" />
                            <span>Encrypting and securing to cloud drive...</span>
                          </span>
                        ) : (
                          <span className="text-ucd-accent flex items-center space-x-1">
                            <Server className="w-3 h-3 animate-pulse text-ucd-accent" />
                            <span>Uploading to local server...</span>
                          </span>
                        )}
                      </div>

                      <div className="mt-1 w-full bg-ucd-bg h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-200 rounded-full ${
                            item.stage === 'cloud'
                              ? 'bg-gradient-to-r from-sky-400 to-blue-500 shadow-glow'
                              : 'bg-gradient-to-r from-ucd-accent to-ucd-royal shadow-glow'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, item.progress || 0))}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-ucd-dim mt-1">
                        <span>{formatBytes(item.loaded || 0)} / {formatBytes(item.total || 0)}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-ucd-accent font-semibold">{formatSpeed(item.speed || 0)}</span>
                          {item.etaSeconds > 0 && <span>• {formatETA(item.etaSeconds)}</span>}
                        </div>
                      </div>
                    </>
                  )}

                  {item.status === 'paused' && (
                    <p className="text-[10px] text-amber-400 mt-1 flex items-center space-x-1 font-medium">
                      <Pause className="w-3 h-3 text-amber-400 fill-amber-400" />
                      <span>Upload paused</span>
                    </p>
                  )}

                  {item.status === 'queued' && (
                    <p className="text-[10px] text-ucd-dim mt-1 flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>Queued in line...</span>
                    </p>
                  )}

                  {item.status === 'success' && item.skipped && (
                    <p className="text-[10px] text-sky-400 mt-1 flex items-center space-x-1 font-medium">
                      <Zap className="w-3 h-3 text-sky-400 fill-sky-400" />
                      <span>Skipped (Already in Cloud)</span>
                    </p>
                  )}

                  {item.status === 'cancelled' && (
                    <p className="text-[10px] text-ucd-dim mt-1 flex items-center space-x-1 text-ucd-rose">
                      <Ban className="w-3 h-3 text-ucd-rose" />
                      <span>Upload cancelled</span>
                    </p>
                  )}

                  {item.status === 'error' && (
                    <p className="text-[10px] text-ucd-rose mt-1 truncate">{item.error || 'Upload failed'}</p>
                  )}
                </div>

                <div className="flex items-center space-x-1.5 shrink-0">
                  {item.status === 'uploading' && (
                    <>
                      <span className="text-[10px] font-bold text-ucd-accent flex items-center space-x-1 mr-1">
                        <Loader2 className="w-3 h-3 animate-spin" /><span>{item.progress || 0}%</span>
                      </span>
                      <button
                        onClick={() => pauseUpload?.(item.id)}
                        title="Pause Upload"
                        className="p-1 text-amber-400 hover:text-amber-300 rounded hover:bg-amber-400/10 transition-colors"
                      >
                        <Pause className="w-3.5 h-3.5 fill-amber-400" />
                      </button>
                    </>
                  )}

                  {item.status === 'paused' && (
                    <button
                      onClick={() => resumeUpload?.(item.id)}
                      title="Resume Upload"
                      className="p-1 text-emerald-400 hover:text-emerald-300 rounded hover:bg-emerald-400/10 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-emerald-400" />
                    </button>
                  )}

                  {item.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {item.status === 'error' && <AlertCircle className="w-4 h-4 text-ucd-rose" />}
                  {(item.status === 'error' || item.status === 'cancelled') && (
                    <button
                      onClick={() => retryUpload?.(item.id)}
                      title="Retry Upload"
                      className="p-1 text-ucd-accent hover:text-sky-400 rounded hover:bg-ucd-accent/10 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => removeUploadFromQueue?.(item.id)}
                    title="Cancel / Remove"
                    className="p-1 text-ucd-dim hover:text-ucd-rose rounded hover:bg-ucd-rose/10 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
