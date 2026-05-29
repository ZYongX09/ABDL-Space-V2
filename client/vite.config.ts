import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'inject-captcha-key',
      transformIndexHtml(html) {
        const captchaKey = process.env.VITE_CAPTCHA_KEY || '';
        const turnstileKey = process.env.VITE_TURNSTILE_SITE_KEY || '';
        let result = html.replace('<%= captchaKey %>', captchaKey.replace(/'/g, "\\'"));
        result = result.replace('<%= turnstileKey %>', turnstileKey.replace(/'/g, "\\'"));
        return result;
      },
    },
  ],
  server: { port: 5173 },
  build: { outDir: 'dist' },
});
