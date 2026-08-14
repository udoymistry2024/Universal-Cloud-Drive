import React, { useState, useEffect } from 'react'
import { Film } from 'lucide-react'

export const VideoThumbnail = ({ fileId, fileName, thumbnailUrl, isAboveTheFold }) => {
  const [imgUrl, setImgUrl] = useState(thumbnailUrl)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    setImgUrl(thumbnailUrl)
    setLoadError(false)
  }, [fileId, thumbnailUrl])

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black/40 overflow-hidden group/vid">
      {imgUrl && !loadError ? (
        <img
          src={imgUrl}
          alt=""
          className="w-full h-full object-cover opacity-85 group-hover/vid:opacity-100 transition-opacity"
          loading={isAboveTheFold ? "eager" : "lazy"}
          onError={() => setLoadError(true)}
        />
      ) : (
        <div className="p-3 rounded-xl bg-ucd-surface/60 border border-ucd-border flex items-center justify-center">
          <Film className="w-8 h-8 text-rose-400" />
        </div>
      )}

      {/* Film Overlay Icon */}
      <div className="absolute p-2 rounded-full bg-black/60 backdrop-blur border border-white/20 text-rose-400 shadow-glow group-hover/vid:scale-110 transition-transform pointer-events-none z-10">
        <Film className="w-4 h-4" />
      </div>
    </div>
  )
}
