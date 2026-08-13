import React, { Component, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DriveProvider } from './context/DriveContext'
import { Dashboard } from './components/Dashboard'
import { AuthModal } from './components/AuthModal'
import { PublicShareView } from './components/PublicShareView'
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react'

// Error Boundary Component to catch any unexpected runtime UI crashes safely
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error("UI Runtime Error caught by ErrorBoundary:", error, errorInfo)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl mb-4 text-amber-400">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
          <p className="text-xs text-slate-400 max-w-md mb-4">
            A temporary display error occurred while rendering the page. Don't worry, your files in Telegram Storage are completely safe.
          </p>
          {this.state.error && (
            <pre className="text-[11px] font-mono text-rose-300 bg-rose-950/40 p-3 rounded-xl border border-rose-500/20 max-w-md w-full mb-6 text-left overflow-x-auto whitespace-pre-wrap select-text">
              {this.state.error.message || String(this.state.error)}
            </pre>
          )}
          <button
            onClick={this.handleReload}
            className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-sky-400 to-blue-600 text-white font-semibold rounded-xl shadow-glow-btn hover:opacity-90 transition-all text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reload Dashboard</span>
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

const AppContent = () => {
  const { user, loading } = useAuth()

  // Public Share Route: Accessible without authentication
  if (window.location.pathname.startsWith('/share/')) {
    return <PublicShareView />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-ucd-bg flex flex-col items-center justify-center text-ucd-accent">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <span className="text-sm text-ucd-muted">Loading Universal Cloud Drive...</span>
      </div>
    )
  }

  if (!user) return <AuthModal />

  return (
    <DriveProvider>
      <Dashboard />
    </DriveProvider>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  )
}
