import React, { useState, useEffect, useRef } from 'react'
import { Film } from 'lucide-react'

export const VideoThumbnail = ({ fileId, fileName, thumbnailUrl, streamUrl, isAboveTheFold }) => {
  const [imgUrl, setImgUrl] = useState(thumbnailUrl)
  const [loadError, setLoadError] = useState(false)
  const [seeking, setSeeking] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    setImgUrl(thumbnailUrl)
    setLoadError(false)
    const cacheKey = `ucd_vid_thumb_${fileId}`
    try {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        setImgUrl(cached)
      }
    } catch (e) {}
  }, [fileId, thumbnailUrl])

  const handleBackendError = () => {
    setLoadError(true)
  }

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      const vid = videoRef.current
      const targetTime = vid.duration > 10 ? 10 : (vid.duration > 1 ? 1 : 0.5)
      vid.currentTime = targetTime
      setSeeking(true)
    }
  }

  const handleVideoSeeked = () => {
    if (!seeking || !videoRef.current || !canvasRef.current) return
    try {
      const vid = videoRef.current
      const canvas = canvasRef.current
      canvas.width = 360
      canvas.height = 200
      const ctx = canvas.getContext('2d')
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
      if (dataUrl && dataUrl.length > 500) {
        setImgUrl(dataUrl)
        setLoadError(false)
        try {
          sessionStorage.setItem(`ucd_vid_thumb_${fileId}`, dataUrl)
        } catch (e) {}
      }
    } catch (e) {
      console.warn("Client canvas frame capture error:", e)
    }
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black/40 overflow-hidden group/vid">
      {imgUrl && !loadError ? (
        <img
          src={imgUrl}
          alt={fileName}
          className="w-full h-full object-cover opacity-85 group-hover/vid:opacity-100 transition-opacity"
          loading={isAboveTheFold ? "eager" : "lazy"}
          onError={handleBackendError}
        />
      ) : (
        <>
          {streamUrl && (
            <video
              ref={videoRef}
              src={streamUrl}
              preload="metadata"
              muted
              playsInline
              crossOrigin="anonymous"
              onLoadedMetadata={handleVideoLoadedMetadata}
              onSeeked={handleVideoSeeked}
              className="hidden"
            />
          )}
          <canvas ref={canvasRef} className="hidden" />
          <div className="p-3 rounded-xl bg-ucd-surface/60 border border-ucd-border flex items-center justify-center">
            <Film className="w-8 h-8 text-rose-400" />
          </div>
        </>
      )}

      {/* Film Overlay Icon */}
      <div className="absolute p-2 rounded-full bg-black/60 backdrop-blur border border-white/20 text-rose-400 shadow-glow group-hover/vid:scale-110 transition-transform pointer-events-none z-10">
        <Film className="w-4 h-4" />
      </div>
    </div>
  )
}
