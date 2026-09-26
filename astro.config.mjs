import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  site: 'https://nimo235.github.io',
  base: '/luca-stach/',
  vite: {
    plugins: [tailwindcss()],
  },
});
