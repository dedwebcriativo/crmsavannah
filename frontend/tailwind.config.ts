import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        savanna: {
          bg: '#F7F5EF',
          panel: '#FFFFFF',
          ink: '#2B2A25',
          muted: '#6E6B5E',
          border: '#E5E1D3',
          green: {
            50: '#E6F0EA',
            100: '#C3DDCE',
            400: '#2E8058',
            600: '#046439',
            700: '#03351E',
          },
          gold: {
            400: '#C9962C',
            500: '#B07F1F',
          },
          rust: '#A8492E',
        },
      },
      fontFamily: {
        display: ['"Poppins"', 'system-ui', 'sans-serif'],
        body: ['"Poppins"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        md: '12px',
        lg: '16px',
      },
    },
  },
  plugins: [],
};

export default config;
