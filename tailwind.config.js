/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        pitch: {
          50: '#f1fdf3',
          500: '#22c55e',
          700: '#15803d',
          900: '#14532d'
        }
      }
    }
  },
  plugins: []
}
