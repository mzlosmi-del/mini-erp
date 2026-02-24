/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        surface: {
          50:  '#f8f7f4',
          100: '#f0ede6',
          200: '#e2ddd3',
        },
        ink: {
          900: '#1a1714',
          700: '#3d3a35',
          500: '#6b6760',
          300: '#a8a49e',
        },
        accent: {
          DEFAULT: '#2563eb',
          light: '#dbeafe',
        },
        danger: '#dc2626',
        success: '#16a34a',
        warning: '#d97706',
      },
    },
  },
  plugins: [],
}
