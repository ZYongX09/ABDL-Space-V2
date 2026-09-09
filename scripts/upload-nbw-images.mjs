#!/usr/bin/env node
/**
 * 上传公共仓库的图片到图床，并写入 diaper_images 表
 * 
 * 用法: node scripts/upload-nbw-images.mjs [--dry-run]
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HTML_FILE = '/home/ZYongX/Downloads/公共仓库_files/公共仓库.html';
const IMG_DIR = '/home/ZYongX/Downloads/公共仓库_files';
const UPLOAD_URL = 'https://img.abdl-space.top/upload';
const TOKEN = 'imgbed_0c2995820e419320e1ed8374096c2680c7697e925003a6da89951402d72b6998';
const ACCOUNT_ID = 'c5a9726ee4c59c70d9261881af33ca87';
const DB_NAME = 'abdl-space-db';
const CWD = '/home/ZYongX/projects/git/abdl-space';
const DRY_RUN = process.argv.includes('--dry-run');
const CONCURRENCY = 3;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseHTML(html) {
  const cards = [];
  const parts = html.split('card-img-wrap');
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const typeMatch = block.match(/font-size:\s*10px;\s*color:\s*var\(--accent-pink-deep\)[^>]*>\s*(\S+)/);
    const rawType = typeMatch ? typeMatch[1].trim() : '纸尿裤';
    const brandMatch = block.match(/font-size:\s*18px;\s*font-weight:\s*900[^>]*>\s*\n?\s*([^\n<]+)/);
    const brand = brandMatch ? brandMatch[1].trim() : '';
    const modelMatch = block.match(/font-size:\s*14px;\s*opacity:\s*0\.8[^>]*>\s*([^\n<]+)/);
    const model = modelMatch ? modelMatch[1].trim() : brand;
    const imgMatch = block.match(/<img src="([^"]+)"/);
    const imgFile = imgMatch ? path.basename(decodeURIComponent(imgMatch[1])) : '';
    if (brand && imgFile) {
      cards.push({ brand, model, rawType, imgFile });
    }
  }
  return cards;
}

function getDBDiapers() {
  const out = execSync(
    `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 execute ${DB_NAME} --command "SELECT id, brand, model FROM diapers" --remote --json`,
    { cwd: CWD, encoding: 'utf8', timeout: 30000 }
  );
  const m = out.match(/\[[\s\S]*\]/);
  const data = JSON.parse(m[0]);
  return data[0].results;
}

function getExistingImages() {
  const out = execSync(
    `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 execute ${DB_NAME} --command "SELECT diaper_id FROM diaper_images" --remote --json`,
    { cwd: CWD, encoding: 'utf8', timeout: 30000 }
  );
  const m = out.match(/\[[\s\S]*\]/);
  const data = JSON.parse(m[0]);
  return new Set(data[0].results.map(r => r.diaper_id));
}

function insertImage(diaperId, imageUrl, sortOrder) {
  const sql = `INSERT INTO diaper_images (diaper_id, image_url, sort_order) VALUES (${diaperId}, '${imageUrl.replace(/'/g, "''")}', ${sortOrder});`;
  const tmpFile = '/tmp/img-insert.sql';
  fs.writeFileSync(tmpFile, sql);
  try {
    execSync(
      `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 execute ${DB_NAME} --file ${tmpFile} --remote --json`,
      { cwd: CWD, encoding: 'utf8', timeout: 30000 }
    );
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function uploadImage(filePath, brand, model) {
  const fileBuf = await fsp.readFile(filePath);
  const ext = path.extname(filePath);
  const safeName = `${brand}-${model}`.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '_').slice(0, 60);
  const fileName = `${safeName}${ext}`;
  const blob = new Blob([fileBuf], { type: getMime(ext) });
  const formData = new FormData();
  formData.append('file', blob, fileName);
  const url = `${UPLOAD_URL}?uploadFolder=diapers`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': TOKEN },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.slice(0, 150)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data) || !data[0]?.src) throw new Error(`Unexpected: ${JSON.stringify(data).slice(0, 150)}`);
  return `https://img.abdl-space.top${data[0].src}`;
}

function getMime(ext) {
  const map = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

async function main() {
  console.log('📖 解析 HTML...');
  const html = fs.readFileSync(HTML_FILE, 'utf8');
  const cards = parseHTML(html);
  console.log(`📋 ${cards.length} 个产品有图片\n`);

  console.log('🔍 查数据库...');
  const dbDiapers = getDBDiapers();
  const existingImages = getExistingImages();
  const diaperMap = new Map(dbDiapers.map(d => [`${d.brand}|${d.model}`.toLowerCase(), d.id]));
  console.log(`   数据库 ${dbDiapers.length} 条, 已有图片 ${existingImages.size} 个\n`);

  // 匹配并构建任务
  const tasks = [];
  for (const card of cards) {
    const key = `${card.brand}|${card.model}`.toLowerCase();
    const diaperId = diaperMap.get(key);
    if (!diaperId) {
      console.log(`⚠️  未匹配: ${card.brand} — ${card.model}`);
      continue;
    }
    if (existingImages.has(diaperId)) {
      continue; // 已有图片，跳过
    }
    const localPath = path.join(IMG_DIR, card.imgFile);
    if (!fs.existsSync(localPath)) {
      console.log(`⚠️  文件不存在: ${card.imgFile}`);
      continue;
    }
    tasks.push({ diaperId, brand: card.brand, model: card.model, localPath });
  }

  console.log(`📋 待上传: ${tasks.length} 张\n`);

  if (DRY_RUN) {
    tasks.forEach((t, i) => console.log(`  ${i+1}. [${t.diaperId}] ${t.brand} — ${t.model}`));
    console.log('\n🔍 Dry-run 完成');
    return;
  }

  let success = 0, failed = 0;
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(async (t) => {
      const url = await uploadImage(t.localPath, t.brand, t.model);
      insertImage(t.diaperId, url, 0);
      return { ...t, url };
    }));
    for (const r of results) {
      if (r.status === 'fulfilled') {
        console.log(`✅ [${r.value.diaperId}] ${r.value.brand} — ${r.value.model}`);
        success++;
      } else {
        console.log(`❌ ${r.reason?.message?.slice(0, 80)}`);
        failed++;
      }
    }
    if (i + CONCURRENCY < tasks.length) await sleep(500);
  }

  console.log(`\n🎉 完成！上传 ${success} 张, 失败 ${failed} 张`);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
