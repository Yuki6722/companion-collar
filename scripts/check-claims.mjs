#!/usr/bin/env node
/**
 * claims-check:ignore-file
 *
 * 措辞门禁（claims gate）
 *
 * 目的：把「只宣称可证伪的事」这条纪律变成构建期可执行的检查，而不是靠人自觉。
 *
 * 规则：扫描源码与构建产物中的文本，命中禁词即失败。
 *   例外 1：若同一行含明确的否定标记，则视为边界说明或免责声明，放行。
 *   例外 2：文件前 15 行含 `claims-check:ignore-file` 者整份跳过。
 *           用于「本身就是 policy 的文件」——例如本文件、AGENTS.md、
 *           以及 docs/design/02-evidence-policy.md，它们必须能写出禁词本身。
 *
 * 用法：node scripts/check-claims.mjs [--quiet]
 * 退出码：0 = 通过；1 = 命中禁词
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUIET = process.argv.includes('--quiet');
const IGNORE_FILE_MARKER = 'claims-check:ignore-file';

/** 禁止出现的宣称。这些说法要么不可证伪，要么已被证据否定。 */
const FORBIDDEN = [
  { term: '检测触觉感受', why: '触觉器官在面部与爪垫，颈部项圈物理上测不到' },
  { term: '还原宠物视角', why: '帧率低于 CFF、视野不同、无嗅觉通道，三者都不等价' },
  { term: '还原宠物所见', why: '同上' },
  { term: '宠物所见', why: '摄像头记录的是环境，与环境影像记录仪不是一回事' },
  { term: '宠物视角相机', why: '准确说法是环境影像记录仪' },
  { term: '翻译宠物语言', why: '专家已指出标准化翻译可能造成危险误判' },
  { term: '猫语翻译', why: '同上' },
  { term: '读懂宠物', why: '不可证伪的承诺' },
  { term: '宠物情绪识别', why: '动物情绪体验不可直接测量' },
  { term: '沉浸式代入', why: '本项目不做头显 VR' },
  { term: '诊断', why: '非医疗器械；除非在否定语境中作为免责声明' },
  { term: '治疗', why: '同上' },
];

/** 否定标记：同一行出现即视为边界说明，放行。 */
const NEGATION = [
  '不构成', '不是', '不做', '不能', '不应', '不得', '禁止', '无法',
  '不宣称', '不提供', '非诊断', '❌', '≠', '边界',
];

/** 只有允许的宣称可以出现在面向用户的文案里（供人工核对，不参与断言）。 */
const ALLOWED_CLAIMS = [
  '可视化猫的视野与身体尺度',
  '按证据等级展示听阈范围',
  '核查居家资源是否符合权威指南',
  '提示可能值得关注的生理变化（非诊断）',
  '环境影像记录',
];

const SCAN_DIRS = ['packages', 'apps', 'docs', 'scripts'];
const SCAN_ROOT_FILES = ['README.md', 'AGENTS.md', 'CHANGELOG.md'];
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.html', '.css', '.md', '.json']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.tools', '.vite', 'research']);

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
    if (NEGATION.some((n) => line.includes(n))) continue;
    for (const { term, why } of FORBIDDEN) {
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
      `✓ 措辞门禁通过（扫描 ${scanned} 个文件，豁免 ${skipped} 个，${FORBIDDEN.length} 条禁词）`,
    );
    console.log(`  允许的宣称共 ${ALLOWED_CLAIMS.length} 条，完整政策见 docs/design/02-evidence-policy.md`);
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
