#!/usr/bin/env node
/**
 * 把 upload-wiki-images.mjs 生成的 URL 映射合并到 diaper-wiki.json
 * 同时把 raw_images 替换为 upload 后真实 URL
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WIKI = path.join(ROOT, 'client/public/data/diaper-wiki.json');
const MAP = path.join(ROOT, '.tmp-wiki-url-map.json');

async function main() {
  const wiki = JSON.parse(await fs.readFile(WIKI, 'utf8'));
  const mapArr = JSON.parse(await fs.readFile(MAP, 'utf8'));
  const map = new Map(mapArr);
  
  let replaced = 0;
  for (const [id, p] of Object.entries(wiki.products)) {
    if (!p.raw_images) continue;
    const safeName = p.slug.replace(/[^a-z0-9-]/g, '-');
    const newImages = p.raw_images.map((url, idx) => {
      const ext = (url.match(/\.(jpg|jpeg|png|webp)/i)||['.jpg'])[0].slice(1).toLowerCase();
      const target = `diapers/${p.brand.toLowerCase()}/${safeName}/${(idx+1).toString().padStart(2, '0')}.${ext}`;
      const key = `${id}::${target}`;
      if (map.has(key)) { replaced++; return map.get(key); }
      return url;
    });
    p.raw_images = newImages;
    
    if (p.size_chart_image) {
      const ext = (p.size_chart_image.match(/\.(jpg|jpeg|png|webp)/i) || ['.jpg'])[0].slice(1).toLowerCase();
      const target = `diapers/${p.brand.toLowerCase()}/${safeName}/size-chart.${ext}`;
      const key = `${id}::${target}`;
      if (map.has(key)) p.size_chart_image = map.get(key);
    }
  }
  
  // 更新元信息
  if (!wiki.meta) wiki.meta = {};
  wiki.meta.last_image_migration = new Date().toISOString();
  
  await fs.writeFile(WIKI, JSON.stringify(wiki, null, 2));
  await fs.rm(MAP, { force: true });
  console.log(`✅ 替换 ${replaced} 张图 URL`);
  console.log(`💾 ${WIKI} 已更新`);
  console.log('');
  console.log('⚠️  重要提示: 客户端有 singleton 缓存，已打开百科页的用户看不到新图');
  console.log('   建议: 发布 changelog 后让用户 Ctrl+Shift+R 硬刷新');
}

main().catch(e => { console.error(e); process.exit(1); });
