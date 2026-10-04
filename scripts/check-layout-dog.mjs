#!/usr/bin/env node
/**
 * 狗版场景的**布局审计**（不启动浏览器）。
 *
 * 为什么需要它：本环境的沙箱不允许启动浏览器（Chromium 的进程间通信用命名管道，
 * 被拦截 —— 见 AGENTS.md §6），因此「家具是不是压在墙上」「狗的东西是不是摆在过道上」
 * 「树是不是长在池塘里」这三类错误**无法靠肉眼发现**，只能靠对布局数据做机械判定。
 *
 * 判据全部来自 `apps/web/src/scene/dog/layout-dog.ts` —— 而建模代码读的也是同一份数据，
 * 所以这些断言真的约束了画面里的摆放（这是本仓库「布局即事实来源」那条纪律的兑现处）。
 *
 * 用法：
 *   node scripts/check-layout-dog.mjs          # 需要先构建（缺失时会自动编译一次）
 *
 * 退出码：0 = 全部断言通过；1 = 有断言失败。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPILED = path.join(ROOT, 'apps', 'web', 'dist', 'apps', 'web', 'src', 'scene', 'dog', 'layout-dog.js');
const SOURCE = path.join(ROOT, 'apps', 'web', 'src', 'scene', 'dog', 'layout-dog.ts');

/**
 * 编译产物可能比源码旧 —— 那样审计的是**上一版布局**，通过与否都没有意义。
 * 因此这里比 mtime，源码更新就重新编译一次（只此一条依赖，不做增量判断）。
 */
function needsBuild() {
  if (!fs.existsSync(COMPILED)) return true;
  return fs.statSync(SOURCE).mtimeMs > fs.statSync(COMPILED).mtimeMs;
}

if (needsBuild()) {
  console.log('→ 编译产物缺失或已过期，先运行一次 tsc');
  const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  const res = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) {
    console.error('✗ 编译失败，无法审计');
    process.exit(1);
  }
}

const L = await import(pathToFileURL(COMPILED).href);

const failures = [];
let checks = 0;

function check(label, ok, detail) {
  checks += 1;
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? `（${detail}）` : ''}`);
    console.error(`  ✗ ${label}${detail ? `（${detail}）` : ''}`);
  }
}

/** 两个 AABB 的重叠面积（不重叠为 0）。 */
function overlapArea(a, b) {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const d = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  return w > 0 && d > 0 ? w * d : 0;
}

/** 点是否在椭圆内。 */
function inEllipse(x, z, e) {
  const dx = (x - e.x) / e.rx;
  const dz = (z - e.z) / e.rz;
  return dx * dx + dz * dz < 1;
}

/** 点到 AABB 的距离（在内部为 0）。 */
function distToFootprint(x, z, f) {
  if (f.ellipse) {
    // 椭圆的近似距离：把点按半轴归一化后按圆处理，误差在 1% 量级，用于净距判定足够
    const dx = (x - f.ellipse.x) / f.ellipse.rx;
    const dz = (z - f.ellipse.z) / f.ellipse.rz;
    const r = Math.hypot(dx, dz);
    return r <= 1 ? 0 : (r - 1) * Math.min(f.ellipse.rx, f.ellipse.rz);
  }
  const dx = Math.max(f.minX - x, 0, x - f.maxX);
  const dz = Math.max(f.minZ - z, 0, z - f.maxZ);
  return Math.hypot(dx, dz);
}

/** 一条折线上按 5 cm 采样的点。 */
function samplePolyline(points, step = 0.05) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

const footprints = L.FOOTPRINTS;
const byId = new Map(footprints.map((f) => [f.id, f]));

console.log(`→ 审计 apps/web/src/scene/dog/layout-dog.ts（${footprints.length} 个占地矩形）\n`);

// ---------------------------------------------------------------- 1. 程序清单齐全

console.log('【1】场景清单：用户点名要的东西一件都不能少');
const requiredProgram = [
  'kitchen', 'island', 'tv', 'sofa', 'bed', 'cabinets', 'dining', 'floorlamp',
  'bowls', 'dogbed', 'toys', 'leash',
  'lawn', 'trees', 'bushes', 'lounge', 'sidetable', 'stonePath', 'pond', 'fence', 'lantern', 'engawa',
];
const programIds = new Set(L.PROGRAM.map((p) => p.id));
const missingProgram = requiredProgram.filter((id) => !programIds.has(id));
check(`清单包含全部 ${requiredProgram.length} 项要求`, missingProgram.length === 0, `缺少 ${missingProgram.join('、')}`);
for (const group of ['room', 'dog', 'yard']) {
  const n = L.PROGRAM.filter((p) => p.group === group).length;
  check(`清单的「${group}」分组非空`, n > 0, `${n} 项`);
}

// ---------------------------------------------------------------- 2. 实体不互相重叠

console.log('\n【2】实体不互相重叠（同组内部除外：绿篱是一排灌木、藤架是四根柱）');
const solids = footprints.filter((f) => f.kind === 'solid');
const collisions = [];
for (let i = 0; i < solids.length; i++) {
  for (let j = i + 1; j < solids.length; j++) {
    const a = solids[i];
    const b = solids[j];
    if (a.group && a.group === b.group) continue;
    const area = overlapArea(a, b);
    if (area > 0.0004) collisions.push(`${a.id} × ${b.id} = ${area.toFixed(3)} m²`);
  }
}
check(
  `${solids.length} 个实心占地两两不重叠`,
  collisions.length === 0,
  collisions.slice(0, 6).join('；') + (collisions.length > 6 ? ` …共 ${collisions.length} 处` : ''),
);

// 树 / 灌木 / 构筑物不许长在池塘里
const pond = byId.get('pond');
const inWater = [];
if (pond?.ellipse) {
  for (const f of solids) {
    if (f.id.startsWith('boulder')) continue; // 池边置石本来就应该压在水线上
    const cx = (f.minX + f.maxX) / 2;
    const cz = (f.minZ + f.maxZ) / 2;
    if (inEllipse(cx, cz, pond.ellipse)) inWater.push(f.id);
  }
}
check('没有实体落在池塘水面里（置石除外）', inWater.length === 0, inWater.join('、'));

// ---------------------------------------------------------------- 3. 不出界

console.log('\n【3】一切都在自己的区域内（不穿墙、不出院）');
const TOL = 0.03;
const outOfBounds = [];
for (const f of footprints) {
  if (f.kind === 'canopy') continue; // 树冠越出院墙是自然的
  const cz = (f.minZ + f.maxZ) / 2;
  const zone = cz > -L.ROOM.depth / 2 ? 'room' : 'yard';
  const bounds = zone === 'room' ? L.ROOM_BOUNDS : L.YARD_BOUNDS;
  const bad = [];
  if (f.minX < bounds.minX - TOL) bad.push(`minX=${f.minX.toFixed(2)}<${bounds.minX}`);
  if (f.maxX > bounds.maxX + TOL) bad.push(`maxX=${f.maxX.toFixed(2)}>${bounds.maxX}`);
  if (f.minZ < bounds.minZ - TOL) bad.push(`minZ=${f.minZ.toFixed(2)}<${bounds.minZ.toFixed(2)}`);
  if (f.maxZ > bounds.maxZ + TOL) bad.push(`maxZ=${f.maxZ.toFixed(2)}>${bounds.maxZ}`);
  if (bad.length > 0) outOfBounds.push(`${f.id}(${zone}): ${bad.join(' ')}`);
}
check(`${footprints.length} 个占地都在界内`, outOfBounds.length === 0, outOfBounds.slice(0, 5).join('；'));

// 室内净高：没有东西穿过天花板（藤架在院子里，不参与）
const tooTall = footprints
  .filter((f) => f.kind === 'solid' && f.heightM !== undefined)
  .filter((f) => (f.minZ + f.maxZ) / 2 > -L.ROOM.depth / 2 && f.heightM > L.ROOM.height - 0.02)
  .map((f) => `${f.id}=${f.heightM}`);
check('室内没有任何物件穿过天花板', tooTall.length === 0, tooTall.join('、'));

// ---------------------------------------------------------------- 4. 墙体洞口

console.log('\n【4】墙体洞口：在墙内、不互相重叠、每面墙都留有墙垛');
for (const wall of L.WALLS) {
  const sorted = [...wall.openings].sort((a, b) => a.center - b.center);
  let wallOk = true;
  const problems = [];
  let cursor = wall.start;
  for (const op of sorted) {
    const uMin = op.center - op.width / 2;
    const uMax = op.center + op.width / 2;
    if (uMin < wall.start - 1e-6 || uMax > wall.end + 1e-6) {
      wallOk = false;
      problems.push(`${op.id} 超出墙范围`);
    }
    if (op.center - op.width / 2 < cursor - 1e-6) {
      wallOk = false;
      problems.push(`${op.id} 与相邻洞口重叠`);
    }
    if (op.sillY < -1e-6 || op.sillY + op.height > L.ROOM.height + 1e-6) {
      wallOk = false;
      problems.push(`${op.id} 高度越界`);
    }
    cursor = uMax;
  }
  if (wall.end - cursor < 0.1 - 1e-6) {
    wallOk = false;
    problems.push('末端墙垛不足 0.1 m');
  }
  check(`墙 ${wall.id}（${wall.label}）的 ${sorted.length} 个洞口合法`, wallOk, problems.join('；'));
}

// 推拉门的「开着的那一格」必须落在门洞范围内
const sliding = L.WALLS.flatMap((w) => w.openings).find((o) => o.id === 'sliding-door');
const openZone = L.SLIDING_DOOR_OPEN;
check(
  '推拉门开着的那一格落在门洞内，且宽于 0.9 m',
  !sliding ||
    (openZone.minX >= sliding.center - sliding.width / 2 - 1e-6 &&
      openZone.maxX <= sliding.center + sliding.width / 2 + 1e-6 &&
      openZone.width > 0.9),
  `开洞 [${openZone.minX.toFixed(2)}, ${openZone.maxX.toFixed(2)}] = ${openZone.width.toFixed(2)} m`,
);

// ---------------------------------------------------------------- 5. 通道畅通

console.log('\n【5】通道畅通：主通道与院内小径都不许被实体压住');
const blockers = footprints.filter((f) => f.kind === 'solid' || f.kind === 'water');
const MIN_CLEAR = 0.05;

function clearanceOf(points, label) {
  const samples = samplePolyline(points);
  let worst = Infinity;
  let worstAt = null;
  for (const [x, z] of samples) {
    for (const f of blockers) {
      const d = distToFootprint(x, z, f);
      if (d < worst) {
        worst = d;
        worstAt = { x, z, id: f.id };
      }
    }
  }
  check(
    `${label} 全程净距 ≥ ${MIN_CLEAR} m`,
    worst >= MIN_CLEAR,
    worstAt ? `最窄处 ${worst.toFixed(3)} m（${worstAt.id} 附近 x=${worstAt.x.toFixed(2)}, z=${worstAt.z.toFixed(2)}）` : '无采样点',
  );
  return worst;
}

clearanceOf(L.TRAFFIC_PATH, '室内主通道（入户门 → 厨房 → 起居 → 推拉门）');
for (const p of L.PATHS) clearanceOf(p.points, `院内${p.label}`);

/**
 * ★ 关键一致性问题：主通道必须从**推拉门开着的那一格**走出屋 ——
 * 否则动线会横穿玻璃（玻璃不是 solid 占地，前一条断言抓不到这种错误）。
 */
{
  const last = L.TRAFFIC_PATH[L.TRAFFIC_PATH.length - 1];
  const prev = L.TRAFFIC_PATH[L.TRAFFIC_PATH.length - 2];
  const wallZ = -L.ROOM.depth / 2;
  let crossX = null;
  if (prev && last && (prev[1] - wallZ) * (last[1] - wallZ) <= 0) {
    const t = (wallZ - prev[1]) / (last[1] - prev[1]);
    crossX = prev[0] + (last[0] - prev[0]) * t;
  }
  check(
    '主通道从推拉门开着的那一格穿出屋外',
    crossX !== null && crossX >= openZone.minX && crossX <= openZone.maxX,
    crossX === null ? '通道没有穿过北墙' : `穿越点 x=${crossX.toFixed(2)}，开洞 [${openZone.minX.toFixed(2)}, ${openZone.maxX.toFixed(2)}]`,
  );
}

// 狗的用品与主通道的净距（单独报一次：这条纪律值得有人能一眼读到）
console.log('\n  狗的用品与主通道的净距：');
for (const id of ['foodStation', 'dogBedMain', 'dogBedSleep', 'toyBasket', 'outdoorWater']) {
  const f = byId.get(id);
  if (!f) continue;
  let worst = Infinity;
  for (const [x, z] of samplePolyline(L.TRAFFIC_PATH)) {
    worst = Math.min(worst, distToFootprint(x, z, f));
  }
  console.log(`    · ${f.label}（${id}）：${worst.toFixed(2)} m`);
}

// ---------------------------------------------------------------- 6. 点名要素存在性

console.log('\n【6】用户点名的院子要素真的存在');
check('绿色草地：草坪边界与池塘洞都在', typeof L.YARD.groundY === 'number' && Boolean(pond?.ellipse), `池塘 rx=${L.POND.rx} rz=${L.POND.rz}`);
check('树木 ≥ 3 棵（含一棵红枫）', L.TREES.length >= 3 && L.TREES.some((t) => t.foliage === 'warm'), `${L.TREES.length} 棵`);
check('灌木丛 ≥ 6 丛（含北侧绿篱）', L.BUSHES.length >= 6, `${L.BUSHES.length} 丛`);
/**
 * 决策守卫：花坛与花丛是**用户看过后要求去掉**的（程序化花瓣在写实场景里读起来很怪）。
 * 把它写成断言而不是只写进文档，是为了让「重新加回来」必须是一次显式决定 ——
 * 若确实要加回来，请连同这条断言一起改掉。
 */
check(
  '花坛与花丛已按用户反馈移除，不再出现在布局与清单里',
  L.FLOWER_BEDS === undefined && !L.PROGRAM.some((p) => p.id === 'flowers'),
  `FLOWER_BEDS=${typeof L.FLOWER_BEDS}`,
);
check('石板路 ≥ 3 条', L.PATHS.length >= 3, `${L.PATHS.length} 条`);
check('休闲躺椅与小桌各一件', Boolean(byId.get('loungeChair')) && Boolean(byId.get('sideTable')));
check('藤架立柱 4 根', L.PERGOLA_POSTS.length === 4);
check('池塘有水面、池底与岸边置石', Boolean(pond) && L.BOULDERS.length >= 2, `${L.BOULDERS.length} 块置石`);

console.log('\n【7】狗的用品真的在「看得见、不挡道」的位置');
for (const id of ['foodStation', 'dogBedMain', 'dogBedSleep', 'toyBasket']) {
  const f = byId.get(id);
  check(`${f ? f.label : id} 在室内`, Boolean(f) && (f.minZ + f.maxZ) / 2 > -L.ROOM.depth / 2);
}
{
  const beds = ['dogBedMain', 'dogBedSleep'].map((id) => byId.get(id)).filter(Boolean);
  const apart = beds.length === 2 ? Math.hypot(
    (beds[0].minX + beds[0].maxX) / 2 - (beds[1].minX + beds[1].maxX) / 2,
    (beds[0].minZ + beds[0].maxZ) / 2 - (beds[1].minZ + beds[1].maxZ) / 2,
  ) : 0;
  check('两张软垫分处两地（起居日光位 + 卧室床边）', apart > 1.2, `相距 ${apart.toFixed(2)} m`);
}
check('院里另有一个水盆（出门即可饮水）', (byId.get('outdoorWater')?.minZ ?? 0) < -L.ROOM.depth / 2);

// ---------------------------------------------------------------- 汇总

console.log('\n→ 分区统计');
const zones = { room: 0, yard: 0 };
let solidCount = 0;
for (const f of footprints) {
  if (f.kind === 'solid') solidCount += 1;
  const cz = (f.minZ + f.maxZ) / 2;
  if (cz > -L.ROOM.depth / 2) zones.room += 1;
  else zones.yard += 1;
}
console.log(`  占地矩形 ${footprints.length} 个（实心 ${solidCount}）· 室内 ${zones.room} · 院子 ${zones.yard}`);
console.log(`  房间 ${L.ROOM.width}×${L.ROOM.depth}×${L.ROOM.height} m · 院子 ${L.YARD.width}×${L.YARD.depth} m`);
console.log(`  清单 ${L.PROGRAM.length} 项 · 机位 ${L.CAMERA_PRESETS.length} 个`);
console.log(`  源文件最后修改：${fs.statSync(SOURCE).mtime.toISOString()}`);

if (failures.length > 0) {
  console.error(`\n✗ 布局审计未通过：${failures.length} / ${checks} 项失败`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`\n✓ 布局审计全部通过（${checks} 项）`);
