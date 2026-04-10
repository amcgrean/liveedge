/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Beisser primary green — #006834 anchored at 500 (base)
        // Overrides Tailwind's built-in cyan so all existing cyan-* classes
        // automatically pick up the Beisser green palette.
        cyan: {
          50:  '#f0faf4',
          100: '#d4f2e2',
          200: '#a3e4c4',
          300: '#5dce9b',
          400: '#1a9248', // brightened — readable text on dark backgrounds
          500: '#006834', // ← exact Beisser green
          600: '#005229',
          700: '#003d1f',
          800: '#002a15',
          900: '#001a0d',
          950: '#000d07',
        },
        // brand.* aliases — kept in sync with cyan for components that reference brand.*
        brand: {
          50:  '#f0faf4',
          400: '#1a9248',
          500: '#006834', // ← exact Beisser green
          600: '#005229',
        },
        // Beisser secondary gold — #9E8635 anchored at 500 (base)
        gold: {
          50:  '#fdf9ec',
          100: '#f9edcc',
          200: '#f1d993',
          300: '#e5bf52',
          400: '#c0a040', // brightened — readable on dark backgrounds
          500: '#9e8635', // ← exact Beisser gold
          600: '#7d6a2a',
          700: '#5e501f',
          800: '#3e3415',
          900: '#1f1a0a',
        },
      },
    },
  },
  plugins: [],
};
