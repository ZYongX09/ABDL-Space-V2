import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

function copyDirSync(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      // 每次构建注入时间戳，强制 index.html hash 变化，
      // 防止 CF Pages 认为"文件已存在"跳过上传。
      name: 'build-timestamp',
      transformIndexHtml(html) {
        return html.replace('</head>', `<!-- build:${Date.now()} --></head>`);
      },
    },
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
    {
      name: 'copy-functions',
      closeBundle() {
        // Copy functions/ to dist/functions/ so CF Pages picks them up
        // (works regardless of whether Build output is 'dist' or 'client/dist')
        try {
          copyDirSync('functions', 'dist/functions');
          console.log('[copy-functions] Copied functions/ to dist/functions/');
        } catch (e) {
          if (e.code === 'ENOENT') {
            console.log('[copy-functions] No functions/ directory found, skipping');
          } else {
            console.error('[copy-functions] Error:', e.message);
          }
        }
      },
    },
  ],
  server: { port: 5173 },
  build: { outDir: 'dist' },
});
