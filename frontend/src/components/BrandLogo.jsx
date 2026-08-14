import React from 'react'

export const BrandLogo = ({ size = 'md', showText = true, className = '' }) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  }

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
    xl: 'text-2xl'
  }

  return (
    <div className={`flex items-center space-x-2.5 select-none ${className}`}>
      {/* SVG Custom Logo Icon */}
      <div className={`relative flex items-center justify-center ${iconSizes[size] || iconSizes.md} group`}>
        {/* Ambient Outer Neon Glow */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-cyan-500 via-sky-400 to-blue-600 blur-md opacity-50 group-hover:opacity-80 transition-opacity duration-300 animate-pulse" />

        <div className="relative w-full h-full rounded-xl bg-gradient-to-br from-slate-900 via-ucd-surface to-slate-950 border border-cyan-400/30 p-1.5 shadow-lg flex items-center justify-center overflow-hidden">
          {/* Subtle Inner Glow Background */}
          <div className="absolute -inset-1 bg-gradient-to-tr from-cyan-500/20 via-sky-400/10 to-indigo-500/20 rounded-xl opacity-80" />

          <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full text-cyan-400 relative z-10 drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]"
          >
            <defs>
              <linearGradient id="cloudGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="50%" stopColor="#0284c7" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
              <linearGradient id="coreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#67e8f9" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>

            {/* Cloud Body Path */}
            <path
              d="M22.5 24H9.5C6.46 24 4 21.54 4 18.5C4 15.7 6.08 13.38 8.8 13.06C9.64 9.54 12.8 7 16.5 7C20.64 7 24 10.36 24 14.5C24.34 14.47 24.67 14.46 25 14.46C27.76 14.46 30 16.7 30 19.46C30 22.04 28.04 24 25.5 24H22.5Z"
              fill="url(#cloudGrad)"
              fillOpacity="0.25"
              stroke="url(#cloudGrad)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Central Storage Core Node */}
            <circle cx="16" cy="16" r="3" fill="url(#coreGrad)" className="animate-ping opacity-75" />
            <circle cx="16" cy="16" r="2.5" fill="#67e8f9" />

            {/* Circuit / Connection Pulse Lines */}
            <path
              d="M16 19.5V22.5M12.5 17.5L10 19M19.5 17.5L22 19"
              stroke="#67e8f9"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* Brand Text */}
      {showText && (
        <div className="flex flex-col leading-none">
          <span className={`font-black tracking-tight ${textSizes[size] || textSizes.md} text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-blue-400 drop-shadow-[0_0_12px_rgba(56,189,248,0.3)]`}>
            Universal
          </span>
          <span className="text-[10px] md:text-xs font-semibold tracking-wider text-slate-300 uppercase">
            Cloud Drive
          </span>
        </div>
      )}
    </div>
  )
}
