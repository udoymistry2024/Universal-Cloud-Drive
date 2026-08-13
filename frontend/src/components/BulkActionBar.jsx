import React from 'react'
import { Copy, Scissors, Download, Trash2, RotateCcw, X, CheckSquare } from 'lucide-react'

/**
 * BulkActionBar — Floating action bar at the bottom of screen when items are selected.
 * Shows "X Selected" with Bulk Copy, Cut, Download, Restore, Delete actions.
 * Compact glassmorphism design.
 */
export const BulkActionBar = ({
  selectedCount = 0,
  onBulkCopy,
  onBulkCut,
  onBulkDownload,
  onBulkDelete,
  onBulkRestore,
  onClear,
  activeTab
}) => {
  const count = Number(selectedCount) || 0
  if (count <= 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center space-x-1.5 md:space-x-2 bg-ucd-surface/95 backdrop-blur-xl border border-ucd-accent/30 rounded-2xl shadow-2xl px-3 py-2 md:px-4 md:py-2.5">
        {/* Selected count badge */}
        <div className="flex items-center space-x-1.5 pr-2 md:pr-3 border-r border-ucd-border mr-1">
          <CheckSquare className="w-4 h-4 text-ucd-accent" />
          <span className="text-xs md:text-sm font-bold text-ucd-accent whitespace-nowrap">
            {count} Selected
          </span>
        </div>

        {activeTab !== 'trash' ? (
          <>
            {/* Bulk Copy */}
            <button
              onClick={onBulkCopy}
              title="Copy Selected"
              className="p-2 md:p-2.5 text-sky-400 hover:bg-sky-400/10 rounded-xl transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>

            {/* Bulk Cut */}
            <button
              onClick={onBulkCut}
              title="Cut / Move Selected"
              className="p-2 md:p-2.5 text-amber-400 hover:bg-amber-400/10 rounded-xl transition-colors"
            >
              <Scissors className="w-4 h-4" />
            </button>

            {/* Bulk Download */}
            <button
              onClick={onBulkDownload}
              title="Download Selected"
              className="p-2 md:p-2.5 text-emerald-400 hover:bg-emerald-400/10 rounded-xl transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            {/* Bulk Restore */}
            <button
              onClick={onBulkRestore}
              title="Restore Selected"
              className="p-2 md:p-2.5 text-ucd-accent hover:bg-ucd-accent/10 rounded-xl transition-colors flex items-center space-x-1"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-semibold">Restore</span>
            </button>
          </>
        )}

        {/* Bulk Delete */}
        <button
          onClick={onBulkDelete}
          title={activeTab === 'trash' ? 'Delete Permanently' : 'Move to Trash'}
          className="p-2 md:p-2.5 text-ucd-rose hover:bg-ucd-rose/10 rounded-xl transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {/* Divider + Clear */}
        <div className="pl-1 md:pl-2 border-l border-ucd-border">
          <button
            onClick={onClear}
            title="Clear Selection"
            className="p-2 md:p-2.5 text-ucd-dim hover:text-ucd-text hover:bg-ucd-bg/50 rounded-xl transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
