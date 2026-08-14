import React, { useState, useCallback } from 'react'
import { Search, LayoutGrid, List, LogOut, Cloud, User, Menu, X, Trash2 } from 'lucide-react'
import { useDrive } from '../context/DriveContext'
import { useAuth } from '../context/AuthContext'
import { useClickOutside } from '../hooks/useClickOutside'
import { BrandLogo } from './BrandLogo'

export const Navbar = ({ onToggleSidebar, sidebarOpen, onOpenDeleteAccount }) => {
  const { searchQuery = '', setSearchQuery, viewMode = 'grid', setViewMode, navigateToFolder, setActiveTab, clearSelection } = useDrive() || {}
  const { user, signOut } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const userMenuRef = useClickOutside(useCallback(() => setShowUserMenu(false), []))

  // Logo click: gracefully navigate to home (root) without hard refresh
  const handleLogoClick = () => {
    setActiveTab('my_drive')
    navigateToFolder(null)
    clearSelection()
    setSearchQuery('')
  }

  return (
    <header className="h-14 border-b border-ucd-border bg-ucd-bg/95 backdrop-blur-sm px-3 md:px-5 flex items-center justify-between sticky top-0 z-30 select-none">
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
            className="w-8 h-8 rounded-full bg-gradient-to-br from-ucd-accent to-ucd-royal text-white flex items-center justify-center font-bold text-sm shadow-glow-btn hover:opacity-90 transition-all"
          >
            {user?.telegram_username?.charAt(0).toUpperCase() || <User className="w-4 h-4" />}
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-60 bg-ucd-surface border border-ucd-border rounded-2xl shadow-2xl p-2 z-50">
              <div className="px-3 py-2 border-b border-ucd-border mb-1">
                <p className="text-[10px] font-semibold text-ucd-dim uppercase tracking-wider">Signed in as</p>
                <p className="text-xs text-ucd-text truncate mt-0.5">@{user?.telegram_username}</p>
              </div>

              <button
                onClick={() => { signOut(); setShowUserMenu(false) }}
                className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-ucd-muted hover:text-ucd-text hover:bg-ucd-hover rounded-xl transition-colors font-medium"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>

              <button
                onClick={() => { onOpenDeleteAccount?.(); setShowUserMenu(false) }}
                className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors font-medium"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Delete Account</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
