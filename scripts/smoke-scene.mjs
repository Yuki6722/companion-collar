#!/usr/bin/env node
/**
 * 场景自检断言（不启动浏览器）。
 *
 * 为什么这样设计：本环境的沙箱**不允许启动浏览器**（Chromium 的进程间通信用命名管道），
 * 也不给 DOM dump。于是把浏览器侧的证据变成「可断言的文本」：
 *   1. 本地预览服务提供一个只写日志的端点 `POST /__selftest`（见 scripts/dev-server.mjs）；
 *   2. 页面在 `?debug=1&auto=1` 下会把自检快照 POST 回来，并在
 *      `.tools/selftest.jsonl` 里留下「平静 → 激动 → 平静」三条快照；
 *   3. 本脚本读这份日志做断言。
 *
 * 生成日志（需要一个人能启动浏览器的终端；命令会写进日志文件）：
 *   pnpm --filter @camp/web build
 *   node scripts/dev-server.mjs            # 另开一个终端
 *   chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
 *          --virtual-time-budget=20000 --window-size=1280,800 \
 *          "http://127.0.0.1:5273/?debug=1&auto=1"
 *   然后运行：node scripts/smoke-scene.mjs
 *
 * 退出码：0 = 全部断言通过；1 = 有断言失败或没有日志。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG = path.join(ROOT, '.tools', 'selftest.jsonl');

if (!fs.existsSync(LOG)) {
  console.error('✗ 找不到 .tools/selftest.jsonl');
  console.error('  请先按脚本头部注释里的命令跑一次 ?debug=1&auto=1 页面。');
  process.exit(1);
}

const records = fs
  .readFileSync(LOG, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

if (records.length === 0) {
  console.error('✗ 自检日志为空或格式不对');
  process.exit(1);
}

const first = records[0];
const agitated = records.find((r) => r.catState === 'agitated');
const backToCalm = records.find((r, i) => i > 0 && r.catState === 'calm');
const failures = [];

function check(label, ok, detail) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? `（${detail}）` : ''}`);
    console.error(`  ✗ ${label}${detail ? `（${detail}）` : ''}`);
  }
}

console.log(`→ 读取 ${path.relative(ROOT, LOG)}（${records.length} 条快照）`);

check('WebGL 上下文可用', first.webgl === true);
check('场景真的渲染了三角形', (first.triangles ?? 0) > 0, `triangles=${first.triangles}`);
check('扫描模型全部到货', (first.modelsLoaded ?? 0) > 0, `modelsLoaded=${first.modelsLoaded}`);
check('平铺贴图全部到货', (first.tilesLoaded ?? 0) > 0, `tilesLoaded=${first.tilesLoaded}`);
check('环境光（HDRI）已加载', first.envLoaded === true);
check('没有资产失败', (first.issues?.length ?? 0) === 0, (first.issues ?? []).join('; '));
check(
  '程序化占位件已被扫描模型替换',
  (first.slots?.placeholdersLeft ?? 0) === 0,
  `placeholdersLeft=${first.slots?.placeholdersLeft}`,
);
check('边柜槽位是真模型', first.slots?.sideboard === 'model', String(first.slots?.sideboard));

if (agitated) {
  check(
    '切换到「激动不适」后参数确实改变',
    agitated.catPose.tailFreq > first.catPose.tailFreq + 1 &&
      agitated.catPose.earFlatten > first.catPose.earFlatten + 0.8 &&
      agitated.catPose.pupilScale > first.catPose.pupilScale + 0.4,
    `tail=${agitated.catPose.tailFreq} ear=${agitated.catPose.earFlatten} pupil=${agitated.catPose.pupilScale}`,
  );
  check(
    '两种状态落在不同锚点',
    JSON.stringify(agitated.catAt) !== JSON.stringify(first.catAt),
    `calm=${JSON.stringify(first.catAt)} agitated=${JSON.stringify(agitated.catAt)}`,
  );
} else {
  failures.push('日志里没有「激动不适」快照');
  console.error('  ✗ 日志里没有「激动不适」快照');
}

if (backToCalm) {
  check(
    '切回「平静舒适」后参数回到起点',
    Math.abs((backToCalm.catPose.tailFreq ?? 0) - first.catPose.tailFreq) < 1e-6,
    `tail=${backToCalm.catPose.tailFreq}`,
  );
} else {
  console.log('  · 日志里没有「切回平静」的快照，跳过该断言');
}

if (failures.length > 0) {
  console.error(`\n✗ 场景自检未通过：${failures.length} 项`);
  process.exit(1);
}
console.log('\n✓ 场景自检全部通过');
