/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ucd: {
          bg:       '#0F172A',   // slate-900
          deep:     '#020617',   // slate-950
          surface:  '#1E293B',   // slate-800
          hover:    '#334155',   // slate-700
          border:   '#334155',   // slate-700
          borderLt: '#475569',   // slate-600
          accent:   '#38BDF8',   // sky-400
          accentDk: '#0EA5E9',   // sky-500
          royal:    '#2563EB',   // blue-600
          royalDk:  '#1D4ED8',   // blue-700
          text:     '#E2E8F0',   // slate-200
          muted:    '#94A3B8',   // slate-400
          dim:      '#64748B',   // slate-500
          amber:    '#FBBF24',   // amber-400
          rose:     '#FB7185',   // rose-400
          emerald:  '#34D399',   // emerald-400
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow:      '0 0 10px rgba(56,189,248,0.15), 0 0 25px rgba(56,189,248,0.06)',
        'glow-lg': '0 0 15px rgba(56,189,248,0.25), 0 0 40px rgba(56,189,248,0.1)',
        'glow-btn': '0 2px 12px rgba(56,189,248,0.3)',
      },
    },
  },
  plugins: [],
}
