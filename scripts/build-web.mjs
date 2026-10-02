#!/usr/bin/env node
/**
 * 静态站构建（无打包器）。
 *
 * 流程：
 *   1. 清空 apps/web/dist
 *   2. 用 tsc 把 core / simulator / web 的 TS 编译进 dist（保留目录结构）
 *   3. 复制 index.html 与 public/ 静态资源
 *
 * 为什么不用打包器：应用是原生 TS + DOM，打包器不带来实际价值，却引入原生二进制
 * 与可选依赖（Vite 7 的 rolldown / lightningcss 在本环境 install 失败）。
 * tsc 编译 + 浏览器原生 import map 已足够，且 GitHub Pages 部署无需任何构建工具链。
 *
 * 注意：沙箱禁止管道 stdio 的子进程，因此 spawn 必须用 stdio: 'inherit'。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps', 'web');
const DIST = path.join(WEB, 'dist');

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

console.log('→ 清理 dist');
rmrf(DIST);
fs.mkdirSync(DIST, { recursive: true });

const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
if (!fs.existsSync(tsc)) {
  console.error('✗ 找不到 typescript。请先运行 pnpm install');
  process.exit(1);
}

console.log('→ 编译 TypeScript（core + simulator + web）');
const res = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (res.status !== 0) {
  console.error('✗ tsc 编译失败');
  process.exit(res.status ?? 1);
}

console.log('→ 复制 index.html');
fs.copyFileSync(path.join(WEB, 'index.html'), path.join(DIST, 'index.html'));

if (fs.existsSync(path.join(WEB, 'public'))) {
  console.log('→ 复制 public/');
  copyDir(path.join(WEB, 'public'), DIST);
}

// GitHub Pages 默认走 Jekyll，会忽略下划线开头的文件；.nojekyll 关闭该行为
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

const count = (d) => fs.readdirSync(d, { withFileTypes: true })
  .reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);

console.log(`✓ 构建完成 → apps/web/dist（${count(DIST)} 个文件）`);
console.log('  本地预览：pnpm --filter @camp/web dev');
