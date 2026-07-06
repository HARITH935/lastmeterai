import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563EB',
          light: '#3B82F6',
          50: '#EFF6FF',
          100: '#DBEAFE',
        },
        slate: {
          // override to use spec text color as base
          900: '#1E293B',
        },
        go: '#10B981',
        nogo: '#EF4444',
        urgent: '#F59E0B',
        surface: '#F8FAFC',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.06)',
      },
    },
  },
  plugins: [],
} satisfies Config
