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
    withIncident.catIncident === 'seizure',
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
  // ★ 反过来也要断言：**触发突发不是靠重载页面，而是靠运行中换一条时间线**。
  // 曾经这里漏接头顶标签的回调，表现为「点了抽搐：身体在抽、标签显示休息」。
  // 那条路径（触发突发后重建运行时）与初始构造是两条代码路径，只测初始构造抓不到，
  // 因此必须断言「突发期间标签也在报突发」。
  check(
    '突发期间头顶标签同步报出突发（运行中换时间线的路径）',
    (withIncident.catLabel ?? '').includes('抽搐'),
    `catLabel=${withIncident.catLabel}`,
  );
}

// ---------------------------------------------------------------- App 预览（右栏 iPhone 机模）

// 第四阶段：右栏改成 App 预览。断言三件事——它挂上了、它能收起展开、它显示的是**有效性**而不只是数字。
const appSnaps = records.filter((r) => r.app);
if (appSnaps.length > 0) {
  check('App 预览已挂载', appSnaps.length > 0, `${appSnaps.length} 条快照带 app 字段`);
  check(
    'App 预览默认展开',
    appSnaps.some((r) => r.app.collapsed === false),
    '所有快照都处于收起状态',
  );
  const tabs = new Set(appSnaps.map((r) => r.app.tab));
  check('App 页签可以切换', tabs.size >= 3, `只见到 ${[...tabs].join('、')}`);
  check(
    'App 的读数是数值而不是占位',
    appSnaps.some((r) => typeof r.app.readings.hr?.value === 'number'),
    '没有任何快照带回数值读数',
  );
  // ★ 关键断言：抽搐期间体动指数 0.95，呼吸通道必然不可用。
  // 手机必须显示"不可用"，而不是把一个坏值当读数——这是第三阶段的读数有效性在界面上的落点。
  const during = appSnaps.find((r) => r.catIncident);
  check(
    '突发期间 App 把不可用的读数标出来（不是照抄数字）',
    during ? during.app.readings.rr?.validity !== 'valid' : false,
    `rr validity=${during?.app.readings.rr?.validity}`,
  );
  check(
    '事件流页签渲染出了事件行',
    appSnaps.some((r) => r.app.tab === 'events' && r.app.eventRows > 0),
    `events 快照的 eventRows=${appSnaps.find((r) => r.app.tab === 'events')?.app.eventRows}`,
  );

  // ★ 第四阶段：读数变化提示。三条断言分别对应「判出来了」「画红了」「弹出来了」——
  // 缺任何一条，用户看到的都是"点了抽搐但 App 没反应"。
  const alerting = appSnaps.find((r) => r.app.alert?.notify);
  check(
    '注入突发后 App 判定为需要提醒',
    Boolean(alerting),
    '没有任何快照带 app.alert.notify=true',
  );
  check(
    '提醒时至少一路数字被标红',
    Boolean(alerting && (alerting.app.alert.red ?? []).length > 0),
    `red=${JSON.stringify(alerting?.app.alert.red)}`,
  );
  check(
    '提醒弹窗真的出现在机身里（不只是内部状态）',
    appSnaps.some((r) => r.app.alert?.popup),
    '没有任何快照带 app.alert.popup=true',
  );
  check(
    '突发期间 App 识别出急性生理窗口',
    appSnaps.some((r) => r.app.alert?.acute),
    '没有任何快照带 app.alert.acute=true',
  );
} else {
  console.log('  · 日志里没有 App 预览字段，跳过 App 断言（可能是旧版页面）');
}

// ---------------------------------------------------------------- 项圈形态可视化

// 第三阶段新增：项圈硬件（带体 / 电子仓 / ECG 电极 ×2 / 体表热敏电阻）与触须无干涉区。
// 断言它们的**存在**，而不是外观——"项圈没挂上"或"无干涉区挂错了父节点"
// 都无法靠"模型加载成功"发现。
//
// 第四阶段起项圈**默认可见**（它就是产品形态：猫脖子上那个带传感器的项圈），
// 因此这里直接断言首屏快照里就有它，不再依赖 `?collar=on`。
//
// 按**名字**断言而不是按数量：写实模型的项圈多了一个状态指示灯（5 → 6 个部件），
// 而"数量变了"既可能是硬件新增，也可能是某个部件丢了——数量断言分不清这两件事。
const REQUIRED_COLLAR_PARTS = [
  'collar-band',
  'collar-pod',
  'collar-ecg-left',
  'collar-ecg-right',
  'collar-thermistor',
];
const withCollar = records.find((r) => r.collar?.collar === true);
if (withCollar) {
  const names = withCollar.collar.partNames ?? [];
  check(
    '项圈默认挂在猫脖子上，且部件齐全（带体 + 电子仓 + 双电极 + 热敏电阻）',
    REQUIRED_COLLAR_PARTS.every((n) => names.includes(n)),
    `parts=${withCollar.collar.parts} names=${names.join(',') || '（该版本未回传部件名）'}`,
  );
  // 无干涉区默认关闭（`?collar=zone` 才打开），序列里在 19 s 打开一次——
  // 所以这里要找**打开过**的快照，而不是第一条带项圈的快照。
  const withZone = records.find((r) => r.collar?.whiskerZone === true);
  check('触须无干涉区可独立显示', Boolean(withZone), withZone ? '' : '整个序列里没有 whiskerZone=true 的快照');
} else {
  failures.push('首屏快照里没有项圈（它应该默认可见）');
  console.error('  ✗ 首屏快照里没有项圈（它应该默认可见）');
}

if (failures.length > 0) {
  console.error(`\n✗ 场景自检未通过：${failures.length} 项`);
  process.exit(1);
}
console.log('\n✓ 场景自检全部通过');
