#!/usr/bin/env node
/**
 * 裤裤百科 — 商品图批量上传到 img.abdl-space.top/file/diapers/
 * 
 * 用法:
 *   1. 用户登录 abdl-space.top
 *   2. 浏览器 devtools → Network → 找到 imgbed 上传 API 的 Authorization 头
 *   3. TOKEN=*** node scripts/upload-wiki-images.mjs [brand] [concurrency]
 *   4. 可选 brand: "ABU" / "REARZ" / 不传(全部)
 *   5. 可选 concurrency: 并发数 (默认 4)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('❌ 缺少 TOKEN 环境变量');
  console.error('   浏览器 devtools → Network → 找 imgbed 上传请求 → Authorization 头');
  console.error('   TOKEN=*** node scripts/upload-wiki-images.mjs');
  process.exit(1);
}

const TARGET_BRAND = process.argv[2]?.toUpperCase() || null;
const CONCURRENCY = parseInt(process.argv[3] || '4', 10);
const UPLOAD_URL = 'https://img.abdl-space.top/upload';
const WIKI_FILE = path.join(ROOT, 'client/public/data/diaper-wiki.json');
const TMP_DIR = path.join(ROOT, '.tmp-wiki-images');
const URL_MAP_FILE = path.join(ROOT, '.tmp-wiki-url-map.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 含 3 次重试 + content-type 校验
async function downloadImage(url, outPath) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
      });
      if (!res.ok) throw new Error(`Download ${url} failed: ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) throw new Error(`Not an image: ${url} (ct=${ct})`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) throw new Error(`Too small (${buf.length} bytes): ${url}`);
      await fs.writeFile(outPath, buf);
      return buf.length;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await sleep(500 * (attempt + 1));
    }
  }
  throw lastErr;
}

async function uploadImage(filePath, targetName) {
  const fileBuf = await fs.readFile(filePath);
  const blob = new Blob([fileBuf]);
  const formData = new FormData();
  formData.append('file', blob, path.basename(filePath));
  
  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Authorization': TOKEN },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} - ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data) || !data[0]?.src) throw new Error(`Unexpected response shape: ${JSON.stringify(data).slice(0, 200)}`);
  return `https://img.abdl-space.top${data[0].src}`;
}

async function processTask(t, idx, total) {
  process.stdout.write(`[${idx}/${total}] ${t.targetName.padEnd(60, ' ')} `);
  // 1) 下载（带重试）
  let bufSize;
  try {
    const tmpPath = path.join(TMP_DIR, path.basename(t.targetName));
    bufSize = await downloadImage(t.sourceUrl, tmpPath);
  } catch (e) {
    process.stdout.write(`❌ dl: ${e.message.slice(0, 80)}\n`);
    return { ok: false, key: t.key, error: e.message };
  }
  // 2) 上传（HF rate limit 时跳过，等下次重试）
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const tmpPath = path.join(TMP_DIR, path.basename(t.targetName));
      const uploadedUrl = await uploadImage(tmpPath, t.targetName);
      process.stdout.write(`✅ (${(bufSize/1024).toFixed(0)}KB)\n`);
      return { ok: true, key: t.key, url: uploadedUrl };
    } catch (e) {
      lastErr = e;
      const isRateLimit = e.message.includes('429') || e.message.includes('rate limit') || e.message.includes('TelegramNew') || e.message.includes('500');
      if (isRateLimit) {
        // HF rate limit — 立即放弃本张 + 后续队列，避免重复打满
        process.stdout.write(`⏳ rate-limit\n`);
        return { ok: false, key: t.key, error: 'rate-limit' };
      }
      if (attempt < 2) await sleep(800 * (attempt + 1));
    }
  }
  process.stdout.write(`❌ up: ${lastErr.message.slice(0, 80)}\n`);
  return { ok: false, key: t.key, error: lastErr.message };
}

async function main() {
  console.log('📦 读取 wiki 数据...');
  const wiki = JSON.parse(await fs.readFile(WIKI_FILE, 'utf8'));
  await fs.mkdir(TMP_DIR, { recursive: true });
  
  // 加载已有 URL 映射（断点续传）
  let urlMap = new Map();
  try {
    const existing = JSON.parse(await fs.readFile(URL_MAP_FILE, 'utf8'));
    urlMap = new Map(existing);
    console.log(`🔄 断点续传: 已完成 ${urlMap.size} 张`);
  } catch {}

  // 构建任务列表
  const tasks = [];
  for (const [id, p] of Object.entries(wiki.products)) {
    if (TARGET_BRAND && p.brand !== TARGET_BRAND) continue;
    
    p.raw_images?.forEach((url, idx) => {
      const ext = (url.match(/\.(jpg|jpeg|png|webp)/i) || ['.jpg'])[0].slice(1).toLowerCase();
      const safeName = p.slug.replace(/[^a-z0-9-]/g, '-');
      const target = `diapers/${p.brand.toLowerCase()}/${safeName}/${(idx+1).toString().padStart(2, '0')}.${ext}`;
      const key = `${id}::${target}`;
      if (!urlMap.has(key)) {
        tasks.push({ productId: id, productName: p.name, sourceUrl: url, targetName: target, key });
      }
    });
    
    if (p.size_chart_image) {
      const ext = (p.size_chart_image.match(/\.(jpg|jpeg|png|webp)/i) || ['.jpg'])[0].slice(1).toLowerCase();
      const safeName = p.slug.replace(/[^a-z0-9-]/g, '-');
      const target = `diapers/${p.brand.toLowerCase()}/${safeName}/size-chart.${ext}`;
      const key = `${id}::${target}`;
      if (!urlMap.has(key)) {
        tasks.push({ productId: id, productName: p.name, sourceUrl: p.size_chart_image, targetName: target, key });
      }
    }
  }
  
  console.log(`📋 待上传: ${tasks.length} 张${TARGET_BRAND ? ` (品牌: ${TARGET_BRAND})` : ''} (并发: ${CONCURRENCY})`);
  if (tasks.length === 0) {
    console.log('🎉 全部完成');
    return;
  }
  console.log('');

  // 并发控制
  const queue = [...tasks];
  let done = 0;
  let rateLimited = false;
  let consecutiveFailures = 0;
  const startTime = Date.now();
  
  async function worker() {
    while (queue.length > 0) {
      if (rateLimited || consecutiveFailures >= 10) {
        queue.length = 0;
        break;
      }
      const t = queue.shift();
      done++;
      const r = await processTask(t, done, tasks.length + urlMap.size);
      if (r.ok) {
        urlMap.set(r.key, r.url);
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
        if (r.error === 'rate-limit' || consecutiveFailures >= 10) {
          rateLimited = true;
        }
      }
      // 每 5 张写一次
      if (urlMap.size % 5 === 0 && urlMap.size > 0) {
        await fs.writeFile(URL_MAP_FILE, JSON.stringify([...urlMap.entries()], null, 2));
      }
    }
  }
  
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  
  // 最终保存
  await fs.writeFile(URL_MAP_FILE, JSON.stringify([...urlMap.entries()], null, 2));
  await fs.rm(TMP_DIR, { recursive: true, force: true });
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log(`✨ 完成！共 ${urlMap.size} 张图已上传，耗时 ${elapsed}s`);
  if (rateLimited) {
    console.log('⚠️  触发 HuggingFace rate limit (128/小时)');
    console.log('   建议: 1 小时后重新运行此脚本，urlMap 自动断点续传');
  }
  console.log(`📄 URL 映射: ${URL_MAP_FILE}`);
  console.log('');
  console.log('下一步：把映射合并到 diaper-wiki.json：');
  console.log('  node scripts/merge-uploaded-urls.mjs');
}

main().catch(e => {
  console.error('💥', e);
  process.exit(1);
});
