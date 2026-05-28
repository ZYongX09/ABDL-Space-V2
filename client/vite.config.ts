import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHtmlPlugin } from 'vite-plugin-html';

export default defineConfig({
  plugins: [
    react(),
    createHtmlPlugin({
      inject: {
        data: {
          captchaKey: process.env.VITE_CAPTCHA_KEY || '',
        },
      },
    }),
  ],
  server: { port: 5173 },
  build: { outDir: 'dist' },
});
