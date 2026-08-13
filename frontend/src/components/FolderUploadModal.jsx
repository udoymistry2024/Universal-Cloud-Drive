import React from 'react'
import { FolderUp, FileText, Loader2, X } from 'lucide-react'
import { useDrive } from '../context/DriveContext'

export const FolderUploadModal = () => {
  const { pendingFolderUpload, isReconstructingFolders, confirmFolderUpload, cancelFolderUpload } = useDrive()

  if (!pendingFolderUpload) return null

  const { folderName, filesCount, foldersCount } = pendingFolderUpload

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={isReconstructingFolders ? undefined : cancelFolderUpload}
    >
      <div
        className="bg-ucd-surface border border-ucd-border rounded-3xl shadow-glow-lg w-full max-w-md p-6 relative overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Gradient Highlight Line */}
        <div className="h-1.5 w-full absolute top-0 left-0 bg-gradient-to-r from-ucd-accent via-ucd-royal to-sky-400" />

        {/* Close Button - Disabled while processing */}
        {!isReconstructingFolders && (
          <button
            onClick={cancelFolderUpload}
            className="absolute top-5 right-5 text-ucd-dim hover:text-ucd-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-start space-x-4 mb-6 mt-2">
          <div className="p-3.5 rounded-2xl bg-ucd-accent/15 border border-ucd-accent/20 text-ucd-accent flex-shrink-0 animate-pulse">
            <FolderUp className="w-7 h-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-lg text-ucd-text tracking-tight truncate">Folder Upload: {folderName}</h3>
            <p className="text-xs text-ucd-dim mt-1.5 leading-relaxed">
              We need to reconstruct this directory structure in your Cloud Drive before enqueuing file uploads.
            </p>
          </div>
        </div>

        {/* Stats Panel */}
        <div className="bg-ucd-bg/50 border border-ucd-border/60 rounded-2xl p-4 space-y-3 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ucd-dim">Root Folder Name:</span>
            <span className="font-semibold text-white truncate max-w-[200px]">{folderName}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ucd-dim">Subfolders to Recreate:</span>
            <span className="font-bold text-amber-400">{foldersCount} folders</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ucd-dim">Total Files to Upload:</span>
            <span className="font-bold text-ucd-accent">{filesCount} files</span>
          </div>
        </div>

        {/* Loading / Action Section */}
        {isReconstructingFolders ? (
          <div className="flex flex-col items-center justify-center py-4 space-y-3">
            <Loader2 className="w-9 h-9 animate-spin text-ucd-accent" />
            <div className="flex flex-col items-center text-center">
              <span className="text-sm font-semibold text-ucd-accent animate-pulse">Reconstructing directories...</span>
              <span className="text-[11px] text-ucd-dim mt-1">Please do not close the browser tab.</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-ucd-border/50">
            <button
              type="button"
              onClick={cancelFolderUpload}
              className="px-4 py-2.5 text-xs font-semibold text-ucd-muted hover:text-ucd-text hover:bg-ucd-hover rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmFolderUpload}
              className="px-6 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 rounded-xl shadow-md hover:shadow-glow transition-all flex items-center space-x-2"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Confirm & Upload</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
