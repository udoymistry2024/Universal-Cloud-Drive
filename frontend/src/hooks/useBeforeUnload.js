import { useEffect } from 'react'

/**
 * Custom Hook: useBeforeUnload
 * Shows browser native "Leave page?" confirmation when uploads/downloads are active.
 * Also handles Page Visibility API to keep upload stream alive on mobile tab switch.
 */
export const useBeforeUnload = (isActive) => {
  useEffect(() => {
    if (!isActive) return

    const handleBeforeUnload = (e) => {
      e.preventDefault()
      // Modern browsers require returnValue to be set
      e.returnValue = 'Upload/Download in progress. Are you sure you want to leave?'
      return e.returnValue
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Keep-alive: Prevent browser from throttling by requesting a no-op lock
        // This helps keep fetch/XHR requests alive on mobile when tab is backgrounded
        if (navigator.locks) {
          navigator.locks.request('ucd-upload-keepalive', { mode: 'shared' }, () => {
            return new Promise((resolve) => {
              const checkVisible = () => {
                if (document.visibilityState === 'visible' || !isActive) {
                  resolve()
                } else {
                  setTimeout(checkVisible, 1000)
                }
              }
              checkVisible()
            })
          }).catch(() => {})
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isActive])
}
