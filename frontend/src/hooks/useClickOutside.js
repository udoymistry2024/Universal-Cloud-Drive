import { useEffect, useRef } from 'react'

/**
 * Custom hook: Fires callback when user clicks outside the referenced element.
 */
export const useClickOutside = (callback) => {
  const ref = useRef(null)

  useEffect(() => {
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        callback()
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [callback])

  return ref
}
