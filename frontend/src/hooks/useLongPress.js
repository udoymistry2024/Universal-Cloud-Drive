import { useRef, useCallback } from 'react'

/**
 * Custom Hook: useLongPress
 * Detects a long-press gesture (500ms) on mobile & desktop.
 * Handles touch movement threshold (10px) to prevent action on scroll.
 */
export const useLongPress = (onLongPress, onClick, options = {}) => {
  const delay = options?.delay ?? 500
  const moveTolerance = options?.moveTolerance ?? 10

  const timerRef = useRef(null)
  const isLongPressRef = useRef(false)
  const hasMovedRef = useRef(false)
  const startPosRef = useRef({ x: 0, y: 0 })
  const lastTouchTimeRef = useRef(0)

  const start = useCallback((e) => {
    // Prevent duplicate mouse events immediately after touch events
    if (e.type === 'mousedown' && Date.now() - lastTouchTimeRef.current < 500) {
      return
    }
    if (e.type === 'touchstart') {
      lastTouchTimeRef.current = Date.now()
    }

    const touch = e.touches?.[0] || e
    startPosRef.current = { x: touch.clientX, y: touch.clientY }
    isLongPressRef.current = false
    hasMovedRef.current = false

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true
      timerRef.current = null
      onLongPress?.(e)
    }, delay)
  }, [onLongPress, delay])

  const move = useCallback((e) => {
    const touch = e.touches?.[0] || e
    if (!touch || !startPosRef.current) return

    const dx = Math.abs(touch.clientX - startPosRef.current.x)
    const dy = Math.abs(touch.clientY - startPosRef.current.y)

    // If finger/mouse moves beyond moveTolerance (10px), mark as scroll/drag and clear timers
    if (dx > moveTolerance || dy > moveTolerance) {
      hasMovedRef.current = true
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [moveTolerance])

  const end = useCallback((e) => {
    // Prevent duplicate mouse events immediately after touch events
    if (e.type === 'mouseup' && Date.now() - lastTouchTimeRef.current < 500) {
      return
    }
    if (e.type === 'touchend') {
      lastTouchTimeRef.current = Date.now()
    }

    // Clear long-press timer
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    // Verify touch end position against start position
    const touch = e.changedTouches?.[0]
    if (touch && startPosRef.current) {
      const dx = Math.abs(touch.clientX - startPosRef.current.x)
      const dy = Math.abs(touch.clientY - startPosRef.current.y)
      if (dx > moveTolerance || dy > moveTolerance) {
        hasMovedRef.current = true
      }
    }

    // Only fire onClick if it wasn't a long-press AND finger did NOT move (clean tap)
    if (!isLongPressRef.current && !hasMovedRef.current) {
      onClick?.(e)
    }

    // Reset state
    isLongPressRef.current = false
    hasMovedRef.current = false
  }, [onClick, moveTolerance])

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    isLongPressRef.current = false
    hasMovedRef.current = false
  }, [])

  return {
    onMouseDown: start,
    onMouseMove: move,
    onMouseUp: end,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: end,
    onTouchCancel: cancel,
  }
}
