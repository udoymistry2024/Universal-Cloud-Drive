import React, { useState, useCallback } from 'react'
import { Search, LayoutGrid, List, LogOut, Cloud, User, Menu, X, Trash2 } from 'lucide-react'
import { useDrive } from '../context/DriveContext'
import { useAuth } from '../context/AuthContext'
import { useClickOutside } from '../hooks/useClickOutside'
import { BrandLogo } from './BrandLogo'
import { ConfirmModal } from './ConfirmModal'

export const Navbar = ({ onToggleSidebar, sidebarOpen, onOpenDeleteAccount }) => {
  const { searchQuery = '', setSearchQuery, viewMode = 'grid', setViewMode, navigateToFolder, setActiveTab, clearSelection } = useDrive() || {}
  const { user, signOut } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showSignOutModal, setShowSignOutModal] = useState(false)

  const userMenuRef = useClickOutside(useCallback(() => setShowUserMenu(false), []))

  // Logo click: navigate to home (root My Drive) and refresh page cleanly
  const handleLogoClick = () => {
    setActiveTab?.('my_drive')
    navigateToFolder?.(null)
    clearSelection?.()
    setSearchQuery?.('')
    
    if (window.location.search || window.location.hash) {
      window.location.href = window.location.pathname
    } else {
      window.location.reload()
    }
  }

  return (
    <>
      <header className="h-14 border-b border-cyan-500/20 bg-slate-950/20 backdrop-blur-md px-3 md:px-5 flex items-center justify-between sticky top-0 z-30 select-none">
        {/* Left: Hamburger + Logo */}
        <div className="flex items-center space-x-2 md:space-x-3 shrink-0">
          <button
            onClick={onToggleSidebar}
            className="md:hidden p-2 text-ucd-accent hover:bg-ucd-surface rounded-lg transition-colors"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Clickable Brand Logo & Name — navigates to home */}
          <button
            onClick={handleLogoClick}
            className="hover:opacity-90 transition-opacity cursor-pointer text-left"
            title="Go to Home"
          >
            <BrandLogo size="sm" />
          </button>
        </div>

        {/* Center: Search */}
        <div className="flex-1 max-w-xl mx-2 md:mx-4 select-text">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ucd-dim pointer-events-none" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-ucd-surface border border-ucd-border rounded-xl text-ucd-text text-xs md:text-sm placeholder:text-ucd-dim focus:border-ucd-accent/50 focus:ring-1 focus:ring-ucd-accent/20 outline-none transition-all"
            />
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center space-x-1.5 md:space-x-2 shrink-0">
          {/* View mode toggle - enabled on both mobile & desktop */}
          <div className="flex bg-ucd-surface border border-ucd-border p-0.5 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-ucd-accent/15 text-ucd-accent shadow-glow' : 'text-ucd-dim hover:text-ucd-text'}`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-ucd-accent/15 text-ucd-accent shadow-glow' : 'text-ucd-dim hover:text-ucd-text'}`}
              title="List View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* User avatar */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className="group relative p-0.5 rounded-full bg-gradient-to-tr from-cyan-300 via-sky-400 to-blue-500 shadow-glow hover:shadow-glow-lg transition-all duration-300 transform active:scale-95 cursor-pointer"
              title={`Account: @${user?.telegram_username || 'User'}`}
            >
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gradient-to-br from-cyan-500 via-sky-500 to-blue-600 border border-cyan-200/50 text-white flex items-center justify-center font-black text-xs md:text-sm tracking-wider shadow-glow-btn group-hover:from-cyan-400 group-hover:to-blue-500 transition-all">
                {user?.telegram_username?.charAt(0).toUpperCase() || <User className="w-4 h-4 text-white" />}
              </div>
              {/* Active Status Indicator Dot */}
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-slate-950 rounded-full shadow-sm" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2.5 w-64 bg-slate-900/95 border border-cyan-500/20 backdrop-blur-xl rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in duration-150">
                <div className="px-3.5 py-2.5 border-b border-ucd-border/60 mb-1 flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-bold text-sm flex items-center justify-center shadow-glow shrink-0">
                    {user?.telegram_username?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold text-ucd-accent uppercase tracking-wider">Signed in as</p>
                    <p className="text-xs font-bold text-white truncate mt-0.5">@{user?.telegram_username || 'User'}</p>
                  </div>
                </div>

                <button
                  onClick={() => { setShowSignOutModal(true); setShowUserMenu(false) }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-ucd-muted hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors font-semibold"
                >
                  <LogOut className="w-3.5 h-3.5 text-sky-400" />
                  <span>Sign Out</span>
                </button>

                <button
                  onClick={() => { onOpenDeleteAccount?.(); setShowUserMenu(false) }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors font-semibold border-t border-ucd-border/40 mt-1 pt-2"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Delete Account</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Sign Out Confirmation Modal */}
      <ConfirmModal
        isOpen={showSignOutModal}
        onClose={() => setShowSignOutModal(false)}
        onConfirm={() => {
          setShowSignOutModal(false)
          signOut?.()
        }}
        title="Sign Out of Universal Cloud Drive?"
        message={`Are you sure you want to sign out of @${user?.telegram_username || 'your account'}? You will need your Telegram OTP to log back in.`}
        confirmText="Sign Out"
        confirmStyle="danger"
      />
    </>
  )
}
