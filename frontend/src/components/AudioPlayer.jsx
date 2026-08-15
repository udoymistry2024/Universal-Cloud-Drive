import React, { useState, useRef, useEffect } from 'react'
import { Play, Pause, Volume2, VolumeX, RotateCcw, FastForward, Rewind, Repeat, Music, Disc } from 'lucide-react'

export const AudioPlayer = ({ src, fileName, autoPlay = true }) => {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isLooping, setIsLooping] = useState(false)

  const formatTime = (secs) => {
    if (isNaN(secs) || secs < 0) return '0:00'
    const mins = Math.floor(secs / 60)
    const remainingSecs = Math.floor(secs % 60)
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleLoadedMetadata = () => setDuration(audio.duration)
    const handleEnded = () => setIsPlaying(false)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)

    if (autoPlay) {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
    }

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [src, autoPlay])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch(() => {})
    }
  }

  const handleSeek = (e) => {
    const audio = audioRef.current
    if (!audio) return
    const newTime = Number(e.target.value)
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleVolumeChange = (e) => {
    const audio = audioRef.current
    if (!audio) return
    const newVol = Number(e.target.value)
    audio.volume = newVol
    setVolume(newVol)
    setIsMuted(newVol === 0)
  }

  const toggleMute = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isMuted) {
      audio.volume = volume || 0.8
      setIsMuted(false)
    } else {
      audio.volume = 0
      setIsMuted(true)
    }
  }

  const toggleLoop = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.loop = !isLooping
    setIsLooping(!isLooping)
  }

  const skipTime = (seconds) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds))
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-2xl border border-cyan-500/30 rounded-3xl p-6 shadow-2xl flex flex-col items-center select-none relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute -top-12 -left-12 w-32 h-32 bg-ucd-accent/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Album Art / Animated Vinyl Disc */}
      <div className="relative mb-5 group">
        <div className={`w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 border-4 border-slate-800 shadow-2xl flex items-center justify-center relative ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }}>
          <div className="w-10 h-10 rounded-full bg-cyan-500/20 border-2 border-cyan-400/40 flex items-center justify-center">
            <Disc className={`w-6 h-6 text-ucd-accent ${isPlaying ? 'animate-pulse' : ''}`} />
          </div>
          {/* Groove Rings */}
          <div className="absolute inset-2 border border-white/5 rounded-full pointer-events-none" />
          <div className="absolute inset-5 border border-white/5 rounded-full pointer-events-none" />
          <div className="absolute inset-8 border border-white/5 rounded-full pointer-events-none" />
        </div>

        {/* Audio Wave Visualizer Indicator */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-slate-950/90 border border-cyan-500/30 rounded-full flex items-center space-x-1 shadow-md">
          <span className={`w-1 h-3 bg-ucd-accent rounded-full ${isPlaying ? 'animate-bounce' : 'h-1.5'}`} style={{ animationDelay: '0.1s' }} />
          <span className={`w-1 h-4 bg-sky-400 rounded-full ${isPlaying ? 'animate-bounce' : 'h-2'}`} style={{ animationDelay: '0.2s' }} />
          <span className={`w-1 h-2 bg-blue-500 rounded-full ${isPlaying ? 'animate-bounce' : 'h-1'}`} style={{ animationDelay: '0.3s' }} />
          <span className={`w-1 h-3 bg-cyan-400 rounded-full ${isPlaying ? 'animate-bounce' : 'h-1.5'}`} style={{ animationDelay: '0.4s' }} />
        </div>
      </div>

      {/* File Title */}
      <div className="text-center w-full px-2 mb-4">
        <h3 className="text-sm md:text-base font-bold text-white truncate max-w-full drop-shadow-sm" title={fileName}>
          {fileName}
        </h3>
        <p className="text-xs font-semibold text-ucd-accent tracking-wider uppercase mt-0.5">Cloud Drive Audio</p>
      </div>

      {/* Seek Progress Bar & Timestamps */}
      <div className="w-full space-y-1.5 mb-4">
        <div className="relative w-full group flex items-center">
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-ucd-accent hover:h-2 transition-all"
            style={{
              background: `linear-gradient(to right, #0ea5e9 ${progressPercent}%, #1e293b ${progressPercent}%)`
            }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-ucd-dim">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Main Playback Controls */}
      <div className="flex items-center justify-center space-x-4 mb-4">
        <button
          onClick={toggleLoop}
          title={isLooping ? 'Looping enabled' : 'Enable loop'}
          className={`p-2 rounded-full transition-all ${
            isLooping ? 'bg-ucd-accent/20 text-ucd-accent border border-ucd-accent/40 shadow-glow' : 'text-ucd-dim hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Repeat className="w-4 h-4" />
        </button>

        <button
          onClick={() => skipTime(-10)}
          title="Rewind 10 seconds"
          className="p-2 text-ucd-dim hover:text-white hover:bg-slate-800/60 rounded-full transition-all"
        >
          <Rewind className="w-4 h-4" />
        </button>

        <button
          onClick={togglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
          className="w-12 h-12 rounded-full bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 text-white flex items-center justify-center shadow-glow-btn transition-all active:scale-95"
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
        </button>

        <button
          onClick={() => skipTime(10)}
          title="Forward 10 seconds"
          className="p-2 text-ucd-dim hover:text-white hover:bg-slate-800/60 rounded-full transition-all"
        >
          <FastForward className="w-4 h-4" />
        </button>

        <button
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
          className={`p-2 rounded-full transition-all ${
            isMuted ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20' : 'text-ucd-dim hover:text-white hover:bg-slate-800/60'
          }`}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Volume Slider */}
      <div className="flex items-center space-x-2 w-3/4 max-w-[200px] pt-1 border-t border-slate-800/60">
        <Volume2 className="w-3.5 h-3.5 text-ucd-dim shrink-0" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-ucd-accent"
          style={{
            background: `linear-gradient(to right, #0ea5e9 ${(isMuted ? 0 : volume) * 100}%, #1e293b ${(isMuted ? 0 : volume) * 100}%)`
          }}
        />
      </div>
    </div>
  )
}
