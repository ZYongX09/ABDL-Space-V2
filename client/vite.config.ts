import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'inject-captcha-key',
      transformIndexHtml(html) {
        const key = process.env.VITE_CAPTCHA_KEY || '';
        return html.replace('<%= captchaKey %>', key.replace(/'/g, "\\'"));
      },
    },
  ],
  server: { port: 5173 },
  build: { outDir: 'dist' },
});
