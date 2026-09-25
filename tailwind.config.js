/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}', './app/**/*.{js,jsx}'],
  theme: { extend: { colors: { medical: { 50: '#eff8f7', 100: '#d9eeeb', 500: '#388b86', 600: '#286f6b', 700: '#205956' } }, boxShadow: { card: '0 8px 28px rgba(26, 57, 69, .055)' } } },
  plugins: [],
};

