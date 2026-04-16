/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/src/**/*.{ts,tsx,html}",
    "./src/renderer/index.html"
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'rgb(var(--color-bg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-bg-secondary) / <alpha-value>)',
          card: 'rgb(var(--color-bg-card) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          hover: 'rgb(var(--color-accent-hover) / <alpha-value>)',
          glow: 'rgb(var(--color-accent) / 0.35)',
        },
        zone: {
          active: 'rgb(var(--color-zone-active) / <alpha-value>)',
          idle: 'rgb(var(--color-zone-idle) / <alpha-value>)',
          border: 'rgb(var(--color-zone-border) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--color-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'zone-active': '0 0 20px rgb(var(--color-zone-active) / 0.4)',
        'accent-glow': '0 0 30px rgb(var(--color-accent) / 0.5)',
      },
      animation: {
        'zone-pulse': 'zonePulse 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        zonePulse: {
          '0%': { opacity: '0.5', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
