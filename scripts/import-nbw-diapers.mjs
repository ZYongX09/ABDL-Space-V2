#!/usr/bin/env node
/**
 * 从本地 HTML 解析纸尿裤，去重后通过 wrangler d1 直接写入数据库
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const HTML_FILE = '/home/ZYongX/Downloads/公共仓库_files/公共仓库.html';
const ACCOUNT_ID = 'c5a9726ee4c59c70d9261881af33ca87';
const DB_NAME = 'abdl-space-db';
const CWD = '/home/ZYongX/projects/git/abdl-space';
const DRY_RUN = process.argv.includes('--dry-run');

const TYPE_MAP = {
  '纸尿裤': '纸尿裤', '拉拉裤': '拉拉裤', '纸尿片': '纸尿片',
  '其他': '纸尿裤', '布尿布': '纸尿裤', '尿布兜': '纸尿裤', '训练裤': '拉拉裤',
};

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
    const sizeRegex = /class="size-tag"[^>]*>([^<]+)<\/span>/g;
    const sizes = []; let sm;
    while ((sm = sizeRegex.exec(block)) !== null) sizes.push(sm[1].trim());
    if (brand) cards.push({ brand, model, product_type: TYPE_MAP[rawType] || '纸尿裤', sizes });
  }
  return cards;
}

function escape(s) { return String(s).replace(/'/g, "''"); }

function getExisting() {
  const out = execSync(
    `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 execute ${DB_NAME} --command "SELECT brand, model FROM diapers" --remote --json`,
    { cwd: CWD, encoding: 'utf8', timeout: 30000 }
  );
  const data = JSON.parse(out);
  return new Set(data[0].results.map(r => `${r.brand}|${r.model}`.toLowerCase()));
}

function execSQL(sql) {
  const tmpFile = '/tmp/diaper-import.sql';
  fs.writeFileSync(tmpFile, sql);
  try {
    const out = execSync(
      `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 execute ${DB_NAME} --file ${tmpFile} --remote --json 2>&1`,
      { cwd: CWD, encoding: 'utf8', timeout: 60000 }
    );
    // wrangler 输出可能包含非 JSON 行（如 "├ Checking..."），提取 JSON 部分
    const jsonMatch = out.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return [{ results: [], success: true }];
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

const html = fs.readFileSync(HTML_FILE, 'utf8');
const cards = parseHTML(html);
console.log(`📋 解析到 ${cards.length} 个产品`);

const existing = getExisting();
console.log(`🔍 已有 ${existing.size} 条`);

const newCards = cards.filter(c => !existing.has(`${c.brand}|${c.model}`.toLowerCase()));
console.log(`✨ 去重后新增 ${newCards.length} 条\n`);

if (DRY_RUN) {
  newCards.forEach((c, i) => console.log(`  ${i+1}. ${c.brand} — ${c.model} [${c.product_type}] (${c.sizes.join(', ')})`));
  console.log('\n🔍 Dry-run 完成');
  process.exit(0);
}

// 生成批量 SQL（每个产品一个 INSERT）
const stmts = newCards.map(c => {
  const sizesStr = c.sizes.map(s => `"${escape(s)}"`).join(',');
  return `INSERT INTO diapers (brand, model, product_type, thickness, absorbency_mfr, absorbency_adult, is_baby_diaper, material, features, avg_price) VALUES ('${escape(c.brand)}', '${escape(c.model)}', '${escape(c.product_type)}', 3, '', '', 0, '', '', '');`;
});

// 分批执行（每批 20 条）
const BATCH = 20;
let success = 0;
for (let i = 0; i < stmts.length; i += BATCH) {
  const batch = stmts.slice(i, i + BATCH);
  const sql = batch.join('\n');
  console.log(`⏳ 写入 ${i+1}-${Math.min(i+BATCH, stmts.length)}...`);
  try {
    execSQL(sql);
    success += batch.length;
    console.log(`✅ 完成`);
  } catch (e) {
    console.error(`❌ 批次失败: ${e.message.slice(0, 200)}`);
  }
}

console.log(`\n🎉 完成！写入 ${success}/${stmts.length} 条`);
