import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        wakame: { DEFAULT: '#4ade80', dim: '#22c55e', dark: '#16a34a' },
        ink: '#0a0a0a',
        panel: '#171717',
        card: '#1f1f1f',
      },
    },
  },
  plugins: [],
};
export default config;
