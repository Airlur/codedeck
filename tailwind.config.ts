import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#f8fafc',
          card: '#ffffff',
          border: '#e2e8f0',
          text: '#0f172a',
          muted: '#64748b',
        },
        dopamine: {
          blue: '#2563eb',
          green: '#16a34a',
          red: '#dc2626',
          orange: '#ea580c',
        },
      },
      boxShadow: {
        soft: '0 10px 30px -15px rgba(15, 23, 42, 0.25)',
      },
      borderRadius: {
        xl2: '1rem',
      },
    },
  },
  plugins: [],
};

export default config;
