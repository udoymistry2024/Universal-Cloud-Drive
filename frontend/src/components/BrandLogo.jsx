import React from 'react'

export const BrandLogo = ({ size = 'md', showText = true, className = '' }) => {
  const iconBoxSizes = {
    sm: 'w-8 h-8 md:w-9 md:h-9',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  }

  const textSizes = {
    sm: 'text-sm md:text-base',
    md: 'text-base md:text-lg',
    lg: 'text-xl md:text-2xl',
    xl: 'text-2xl md:text-3xl'
  }

  return (
    <div className={`flex items-center space-x-3 select-none ${className}`}>
      {/* SVG Custom Brand Icon Container */}
      <div className={`relative flex-shrink-0 flex items-center justify-center ${iconBoxSizes[size] || iconBoxSizes.md} group`}>
        {/* Ambient Outer Glowing Ring */}
        <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-tr from-cyan-400 via-sky-400 to-blue-600 blur-sm opacity-60 group-hover:opacity-100 transition-opacity duration-300 animate-pulse" />

        <div className="relative w-full h-full rounded-xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-cyan-400/40 p-1 shadow-glow flex items-center justify-center overflow-hidden">
          <svg
            viewBox="0 0 36 36"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full text-cyan-400 relative z-10 drop-shadow-[0_0_10px_rgba(56,189,248,0.8)]"
          >
            <defs>
              <linearGradient id="cloudGradMain" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="50%" stopColor="#0284c7" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
              <linearGradient id="coreGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#a5f3fc" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>

            {/* Cloud Outer Stroke & Subtle Fill */}
            <path
              d="M26 27H10C6.68629 27 4 24.3137 4 21C4 17.9287 6.30906 15.3958 9.32422 15.0458C10.2223 11.0827 13.7667 8 18 8C22.6944 8 26.5 11.8056 26.5 16.5C26.83 16.47 27.16 16.45 27.5 16.45C30.5376 16.45 33 18.9124 33 21.95C33 24.8 30.8 27 28 27H26Z"
              fill="url(#cloudGradMain)"
              fillOpacity="0.22"
              stroke="url(#cloudGradMain)"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Central Storage Core Node */}
            <circle cx="18" cy="18" r="3.5" fill="url(#coreGlow)" className="animate-ping opacity-80" />
            <circle cx="18" cy="18" r="2.75" fill="#a5f3fc" />

            {/* Circuit Connections */}
            <path
              d="M18 21.75V25M14 19.5L11.5 21.5M22 19.5L24.5 21.5"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* Brand Text — Hidden on Mobile screens, visible on Tablet/Desktop */}
      {showText && (
        <div className={`hidden sm:flex items-center whitespace-nowrap font-black tracking-tight ${textSizes[size] || textSizes.md} drop-shadow-[0_0_12px_rgba(56,189,248,0.25)]`}>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-400">
            Universal
          </span>
          <span className="text-slate-100 font-bold ml-1.5">
            Cloud
          </span>
          <span className="text-cyan-400/90 font-medium ml-1">
            Drive
          </span>
        </div>
      )}
    </div>
  )
}
