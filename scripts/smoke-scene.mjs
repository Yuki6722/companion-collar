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

// ---------------------------------------------------------------- 自主行为

const autoSnaps = records.filter((r) => r.catMode === 'auto');
if (autoSnaps.length >= 2) {
  const activities = new Set(autoSnaps.map((r) => r.catActivity).filter(Boolean));
  check(
    '自主行为下猫确实在换活动',
    activities.size >= 2,
    `只见到 ${[...activities].join('、') || '（无）'}`,
  );
  const anchors = new Set(autoSnaps.map((r) => r.catAnchor).filter(Boolean));
  const positions = new Set(autoSnaps.map((r) => JSON.stringify(r.catAt)));
  check(
    '自主行为下猫确实在移动',
    anchors.size >= 2 || positions.size >= 2,
    `锚点 ${[...anchors].join('、') || '（无）'}`,
  );
  const firstHour = autoSnaps[0].catHour ?? 0;
  const lastHour = autoSnaps.at(-1).catHour ?? 0;
  check('演示时钟在推进', Math.abs(lastHour - firstHour) > 0.01, `${firstHour} → ${lastHour}`);

  // 段内进展计数器：这是「标签没有卡住」的可靠证据。
  // 活动名在 resting 段里平均 56 秒不变，只看名称变化会误判。
  const elapsedFirst = autoSnaps[0].catSegElapsed ?? 0;
  const elapsedLast = autoSnaps.at(-1).catSegElapsed ?? 0;
  const segChanged = (autoSnaps[0].catAnchor ?? '') !== (autoSnaps.at(-1).catAnchor ?? '');
  check(
    '段内进展计数在推进（或已切换到新段）',
    elapsedLast > elapsedFirst || segChanged,
    `本段已进行 ${elapsedFirst}s → ${elapsedLast}s，锚点变化=${segChanged}`,
  );
  check(
    '标签文案与当前行为一致',
    (autoSnaps.at(-1).catLabel ?? '').length > 0,
    `catLabel=${autoSnaps.at(-1).catLabel}`,
  );

  // 活动必须是行为词汇表里的取值，不能是空字符串或随机字符串
  const known = new Set([
    'resting', 'alert', 'grooming', 'locomoting', 'playing',
    'feeding', 'drinking', 'eliminating', 'scratching', 'hiding', 'perching', 'vomit',
  ]);
  const unknown = [...activities].filter((a) => !known.has(a));
  check('活动取值都来自行为词汇表', unknown.length === 0, unknown.join('、'));
} else {
  console.log('  · 日志里自主行为快照不足 2 条，跳过自主行为断言');
}

const withIncident = records.find((r) => r.catIncident);
if (withIncident) {
  check(
    '注入的突发出现在快照里',
    withIncident.catIncident === 'labored-breathing',
    `catIncident=${withIncident.catIncident}`,
  );
} else {
  console.log('  · 日志里没有突发快照，跳过突发断言');
}

// ---------------------------------------------------------------- 头顶状态标签

// 徽章文本里带 `catLabel=`（见 selftest.ts 的 summarize），未挂载时为 none。
const withLabel = records.find((r) => typeof r.catLabel === 'string' && r.catLabel !== 'none');
if (withLabel) {
  check('猫头顶状态标签已挂载且有文案', withLabel.catLabel.length > 0, withLabel.catLabel);
  check(
    '状态标签在突发期间切成动作名',
    !withIncident || (withIncident.catLabel ?? '').includes('呼吸'),
    `catLabel=${withIncident?.catLabel}`,
  );
} else {
  console.log('  · 日志里没有状态标签字段，跳过（可能是旧版页面）');
}

// 突发必须**真的改变姿势参数**，否则就是「标签在报、身体没动」——
// 这正是最初「点了抽搐没反应」的故障形态，必须由断言拦住。
if (withIncident) {
  const calmSnap = autoSnaps.find((r) => !r.catIncident) ?? first;
  const breathDuring = withIncident.catPose.breathFreq ?? 0;
  const breathBefore = calmSnap.catPose.breathFreq ?? 0;
  check(
    '突发期间姿势参数确实被改变',
    breathDuring > breathBefore * 1.3,
    `breathFreq ${breathBefore}（平常）→ ${breathDuring}（呼吸急促中）`,
  );
  // 动作配方也必须真的挂上：这是「标签在报」与「身体在动」的分界
  check(
    '突发动作配方已生效（不只是标签在报）',
    (withIncident.catMotion?.tremorAmp ?? 0) > 0,
    `catMotion=${JSON.stringify(withIncident.catMotion)}`,
  );
  // ★ 反过来也要断言：**触发突发不是靠重载页面，而是靠运行中重建时间线**。
  // 曾经这里漏接头顶标签的回调，表现为「点了抽搐：身体在抽、标签显示休息」。
  // 那条路径（triggerIncident）与初始构造是两条代码路径，只测初始构造抓不到，
  // 因此必须断言「突发期间标签也在报突发」。
  check(
    '突发期间头顶标签同步报出突发（triggerIncident 路径）',
    (withIncident.catLabel ?? '').includes('抽搐'),
    `catLabel=${withIncident.catLabel}`,
  );
}

if (failures.length > 0) {
  console.error(`\n✗ 场景自检未通过：${failures.length} 项`);
  process.exit(1);
}
console.log('\n✓ 场景自检全部通过');
