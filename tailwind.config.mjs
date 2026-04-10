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
        // Beisser primary green — built around their brand color #006834
        // Overrides Tailwind's built-in cyan so all existing cyan-* classes
        // automatically pick up the Beisser green palette.
        cyan: {
          50:  '#f0faf4',
          100: '#d4f2e2',
          200: '#a3e4c4',
          300: '#5dce9b',
          400: '#25b36e', // bright accent — primary interactive element color
          500: '#009944', // standard
          600: '#006834', // Beisser primary
          700: '#005228',
          800: '#003b1e',
          900: '#002714',
          950: '#001a0d',
        },
        // brand.* aliases — kept in sync with cyan for components that reference brand.*
        brand: {
          50:  '#f0faf4',
          400: '#25b36e',
          500: '#009944',
          600: '#006834',
        },
        // Beisser secondary gold — #9E8635
        gold: {
          50:  '#fdf9ec',
          100: '#f9edcc',
          200: '#f1d993',
          300: '#e5bf52',
          400: '#d4a528',
          500: '#9e8635', // Beisser gold
          600: '#836e2a',
          700: '#62521f',
          800: '#413714',
          900: '#21190a',
        },
      },
    },
  },
  plugins: [],
};
