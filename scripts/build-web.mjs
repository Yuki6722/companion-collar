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

const THREE_PKG = resolveThreePackage();
const VENDOR_THREE = path.join(DIST, 'vendor', 'three');

/**
 * three 装在 workspace 包自己的 node_modules 下（pnpm 不做提升），
 * 所以两个候选目录都要看：根目录（hoisted 安装）与 apps/web。
 */
function resolveThreePackage() {
  const candidates = [
    path.join(ROOT, 'node_modules', 'three'),
    path.join(WEB, 'node_modules', 'three'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'build', 'three.module.js'))) return dir;
  }
  console.error('✗ 找不到 three 运行时。请先在 apps/web 下执行：pnpm add -D three @types/three');
  process.exit(1);
}

/** 用得上的 three addon；其相对依赖由 vendorThree() 递归带上，不手写完整清单。 */
const THREE_ADDON_ENTRIES = [
  'controls/OrbitControls.js',
  'loaders/GLTFLoader.js',
  'loaders/RGBELoader.js',
  'environments/RoomEnvironment.js',
  'geometries/RoundedBoxGeometry.js',
];

/**
 * 为什么复制而不是从 node_modules 直接引用：
 * 部署产物只有 dist（GitHub Pages），import map 必须指向同源路径；同时保证运行时零网络依赖。
 *
 * 为什么递归而不写固定清单：GLTFLoader 依赖 ../utils/BufferGeometryUtils.js 与
 * ../utils/SkeletonUtils.js，手写清单一升级 three 就会漏文件、并且要到运行时才炸。
 */
function vendorThree() {
  const build = path.join(THREE_PKG, 'build');
  const jsm = path.join(THREE_PKG, 'examples', 'jsm');
  const mainEntry = path.join(build, 'three.module.js');
  if (!fs.existsSync(mainEntry)) {
    console.error('✗ 找不到 three 运行时。请先运行 pnpm install');
    process.exit(1);
  }

  /** 相对 dist/vendor/three 的 posix 路径 → 源文件绝对路径 */
  const files = new Map();
  files.set('three.module.js', mainEntry);

  // 0.167+ 把核心拆到 three.core.js，由 three.module.js 相对导入
  if (/from\s*['"]\.\/three\.core\.js['"]/.test(fs.readFileSync(mainEntry, 'utf8'))) {
    files.set('three.core.js', path.join(build, 'three.core.js'));
  }

  const collect = (relPosix) => {
    const key = `addons/${relPosix}`;
    if (files.has(key)) return;
    const abs = path.join(jsm, ...relPosix.split('/'));
    if (!fs.existsSync(abs)) {
      console.error(`✗ 缺少 three addon：examples/jsm/${relPosix}`);
      process.exit(1);
    }
    files.set(key, abs);
    for (const m of fs.readFileSync(abs, 'utf8').matchAll(/from\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue; // 裸标识符 'three' 交给 import map
      collect(path.posix.normalize(path.posix.join(path.posix.dirname(relPosix), spec)));
    }
  };
  for (const entry of THREE_ADDON_ENTRIES) collect(entry);

  for (const [rel, abs] of files) {
    const dst = path.join(VENDOR_THREE, ...rel.split('/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(abs, dst);
  }
  return files.size;
}

console.log('→ 复制 index.html');
fs.copyFileSync(path.join(WEB, 'index.html'), path.join(DIST, 'index.html'));

console.log(`→ 复制 three 运行时 → dist/vendor/three（${vendorThree()} 个文件）`);

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
