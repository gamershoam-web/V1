/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./site/**/*.html', './site/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        space: { 950: '#05030f', 900: '#0a0820', 800: '#120f2e', 700: '#1c1846' },
        neon: { cyan: '#22d3ee', purple: '#a855f7', pink: '#f472b6', green: '#4ade80' },
      },
      fontFamily: {
        display: ['Orbitron', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
