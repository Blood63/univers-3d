/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#04070d',
        ink: '#0b1220',
        line: 'rgba(186, 214, 255, 0.18)',
        glow: '#9ec5ff',
        amber: '#f0c27a',
      },
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glass: '0 10px 40px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
}
