#!/usr/bin/env node
/**
 * claims-check:ignore-file
 *
 * 措辞门禁（claims gate）
 *
 * 目的：把「只宣称可证伪的事」这条纪律变成构建期可执行的检查，而不是靠人自觉。
 *
 * 禁词表与豁免规则来自**单一事实来源** `packages/core/src/claims.ts`，
 * 与单元测试共用，避免两处漂移（新增禁词会自动被测试覆盖）。
 *
 * 规则：扫描源码与构建产物中的文本，命中禁词即失败。
 *   例外 1：同一行含明确的否定标记 → 视为边界说明或免责声明，放行。
 *   例外 2：文件前 15 行含 `claims-check:ignore-file` → 整份跳过。
 *           用于「本身就是 policy 的文件」：本文件、AGENTS.md、证据政策文档。
 *
 * 用法：node scripts/check-claims.mjs [--quiet]
 * 退出码：0 = 通过；1 = 命中禁词
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_CLAIMS,
  CLAIMS_SKIP_DIRS,
  FORBIDDEN_TERMS,
  IGNORE_FILE_MARKER,
  NEGATION_MARKERS,
} from '../packages/core/src/claims.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUIET = process.argv.includes('--quiet');

const SCAN_DIRS = ['packages', 'apps', 'docs', 'scripts'];
const SCAN_ROOT_FILES = ['README.md', 'AGENTS.md', 'CHANGELOG.md'];
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.html', '.css', '.md', '.json']);
const SKIP_DIRS = new Set(CLAIMS_SKIP_DIRS);

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (SCAN_EXT.has(path.extname(e.name).toLowerCase())) yield full;
  }
}

const files = [];
for (const rel of SCAN_DIRS) files.push(...walk(path.join(ROOT, rel)));
for (const rel of SCAN_ROOT_FILES) {
  const f = path.join(ROOT, rel);
  if (fs.existsSync(f)) files.push(f);
}

const violations = [];
let scanned = 0;
let skipped = 0;

for (const file of files) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  if (lines.slice(0, 15).some((l) => l.includes(IGNORE_FILE_MARKER))) {
    skipped++;
    continue;
  }
  scanned++;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (NEGATION_MARKERS.some((n) => line.includes(n))) continue;
    for (const { term, why } of FORBIDDEN_TERMS) {
      if (line.includes(term)) {
        violations.push({
          file: path.relative(ROOT, file),
          line: i + 1,
          term,
          why,
          excerpt: line.trim().slice(0, 120),
        });
      }
    }
  }
}

if (violations.length === 0) {
  if (!QUIET) {
    console.log(
      `✓ 措辞门禁通过（扫描 ${scanned} 个文件，豁免 ${skipped} 个，${FORBIDDEN_TERMS.length} 条禁词）`,
    );
    console.log(`  允许的宣称共 ${ALLOWED_CLAIMS.length} 条，来源 packages/core/src/claims.ts`);
  }
  process.exit(0);
}

console.error(`✗ 措辞门禁未通过：命中 ${violations.length} 处\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  「${v.term}」`);
  console.error(`      原因：${v.why}`);
  console.error(`      原文：${v.excerpt}`);
  console.error('');
}
console.error('若确为边界说明或免责声明，请在同一行加入否定标记（如「不构成」「不是」）。');
console.error(`若该文件本身就是政策文本，请在前 15 行加入 ${IGNORE_FILE_MARKER}。`);
process.exit(1);
