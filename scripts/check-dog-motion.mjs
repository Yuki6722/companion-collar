#!/usr/bin/env node
/**
 * 狗的运动审计（不启动浏览器）。
 *
 * 用户对狗提了两条硬要求：**行动要有轨迹**、**不许倒着走**、**不许从一个位置闪到另一个位置**。
 * 这三件事全都是**渲染层的事实**，而本环境的沙箱不允许启动浏览器（见 AGENTS.md §6），
 * 因此没法靠看画面来验证。做法与 `check-layout-dog.mjs` 一样：把运动做成纯函数，
 * 在 Node 里按 60 Hz 逐帧模拟，然后对逐帧数据做断言。
 *
 * 断言分六组：
 *   【1】图的正确性：锚点都能落到节点上、全图连通、**进出院子只有推拉门这一条路**
 *   【2】边上不撞东西：每条边的每个采样点都离实体 ≥ 5 cm
 *        （狗自己的软垫/食盆是例外：站上去、凑过去本来就是对的）
 *   【3】路径跟随的三条不变量（逐帧）：
 *        A 位移 ≤ 速度 × 帧时 —— 结构上不可能瞬移
 *        B 发生位移时 cos(朝向 − 前进方向) > 0 —— 结构上不可能倒着走
 *        C 朝向变化 ≤ 最大转头速率 × 帧时 —— 不会"啪"地转身
 *   【4】关键路线的可达性与尺度：吃/喝/排泄/奔跑各有去处，路程长度在合理量级
 *   【5】草坪覆盖率：草坪上任何"进得去"的位置都在某个导航节点的 0.7 m 内
 *        —— 这是"能走的地方不再被导航图限制住"的机械证据
 *   【6】互动点位：用户点名的 7 个点位各自接得上、走得通；外加一条决策守卫
 *        （`yard-pond` 必须仍然具备 water 能力且仍然连着玩水那一格）
 *
 * 【3】的路线集为什么不"全对全"：草坪格点铺开之后节点接近 100 个，
 * 锚点对全排列是几千条长路线，跑得完但没必要。改成**每条边至少走一次**
 * （边是图的最小单元，走完边就覆盖了每个节点的进出）**加上固定种子的抽样对**
 * （跨半张图的长路线，专门验"转大弯时不倒着走"）。抽样用固定种子，所以每次跑的是同一组，
 * 失败可复现。
 *
 * 用法：node scripts/check-dog-motion.mjs        （缺失/过期时会自动编译一次）
 * 退出码：0 = 全部通过；1 = 有失败。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DOG = path.join(ROOT, 'apps', 'web', 'dist', 'apps', 'web', 'src', 'scene', 'dog');
const SRC_DOG = path.join(ROOT, 'apps', 'web', 'src', 'scene', 'dog');
const OUTPUTS = { 'dog-nav': 'dog-nav.js', 'layout-dog': 'layout-dog.js' };

/** 编译产物可能比源码旧 —— 那样审计的是上一版图，通过与否都没有意义。 */
function needsBuild() {
  for (const [stem, out] of Object.entries(OUTPUTS)) {
    const compiled = path.join(DIST_DOG, out);
    const source = path.join(SRC_DOG, `${stem}.ts`);
    if (!fs.existsSync(compiled) || !fs.existsSync(source)) return true;
    if (fs.statSync(source).mtimeMs > fs.statSync(compiled).mtimeMs) return true;
  }
  return false;
}

const NAV = path.join(DIST_DOG, 'dog-nav.js');
const LAYOUT = path.join(DIST_DOG, 'layout-dog.js');

if (needsBuild()) {
  console.log('→ 编译产物缺失或已过期，先运行一次 tsc');
  const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  const res = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) {
    console.error('✗ 编译失败，无法审计');
    process.exit(1);
  }
}

const N = await import(pathToFileURL(NAV).href);
const L = await import(pathToFileURL(LAYOUT).href);

const failures = [];
let checks = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures.push(`${label}${detail ? `（${detail}）` : ''}`);
    console.error(`  ✗ ${label}${detail ? `（${detail}）` : ''}`);
  }
}

const nodes = N.NAV_NODES;
const nodeById = new Map(nodes.map((n) => [n.id, n]));
const blockers = L.FOOTPRINTS.filter((f) => f.kind === 'solid' || f.kind === 'water');

/** 点到占地的距离（椭圆按椭圆精确算）。 */
function distToFootprint(x, z, f) {
  if (f.ellipse) {
    const dx = (x - f.ellipse.x) / f.ellipse.rx;
    const dz = (z - f.ellipse.z) / f.ellipse.rz;
    const r = Math.hypot(dx, dz);
    return r <= 1 ? 0 : (r - 1) * Math.min(f.ellipse.rx, f.ellipse.rz);
  }
  const dx = Math.max(f.minX - x, 0, x - f.maxX);
  const dz = Math.max(f.minZ - z, 0, z - f.maxZ);
  return Math.hypot(dx, dz);
}

function sampleSegment(a, b, step = 0.05) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, t });
  }
  return out;
}

/**
 * 固定种子的确定性抽样器（mulberry32）。
 *
 * 为什么门禁自己也需要一个随机数：草坪铺开之后节点接近 100 个，锚点对全排列是几千条
 * 长路线 —— 跑得完，但每次提交都多花十几秒，而多出来的覆盖是重复的。
 * 改成"每条边走一次 + 抽样 48 对长路线"。抽样必须**可复现**：种子写死，
 * 失败时报出来的路线下次跑还在，不然"偶发失败"会变成无法定位的噪声。
 */
function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log(`→ 审计狗的活动导航（${nodes.length} 个节点 / ${N.NAV_EDGES.length} 条边 / ${blockers.length} 个障碍）\n`);

// ---------------------------------------------------------------- 1. 图的正确性

console.log('【1】图的正确性');
{
  const ids = new Set(nodes.map((n) => n.id));
  const dupes = nodes.map((n) => n.id).filter((id, i, arr) => arr.indexOf(id) !== i);
  check('节点 id 无重复', dupes.length === 0, dupes.join('、'));

  const badEdges = N.NAV_EDGES.filter(([a, b]) => !ids.has(a) || !ids.has(b));
  check('每条边的两个端点都存在', badEdges.length === 0, badEdges.map((e) => e.join('-')).join('、'));

  const anchorMissing = N.DOG_ANCHOR_SPECS.filter((s) => !N.ANCHOR_NODES[s.id]);
  check(
    `${N.DOG_ANCHOR_SPECS.length} 个行为锚点都映射到了导航节点`,
    anchorMissing.length === 0,
    anchorMissing.map((s) => s.id).join('、'),
  );

  const mappedNodes = new Set(Object.values(N.ANCHOR_NODES).flat());
  const unknown = [...mappedNodes].filter((id) => !ids.has(id));
  check('锚点映射指向的节点都存在', unknown.length === 0, unknown.join('、'));

  // 连通性：从玄关出发能否到达每一个节点
  const unreachable = nodes.map((n) => n.id).filter((id) => id !== 'entry' && N.findPath('entry', id).length === 0);
  check(`全图从「entry」可达（${nodes.length} 个节点）`, unreachable.length === 0, unreachable.join('、'));

  // ★ 进出院子只有一条路：所有室内 ↔ 院内路径都必须经过 doorway
  const room = nodes.filter((n) => n.z > L.ROOM_BOUNDS.minZ + 0.01).map((n) => n.id);
  const yard = nodes.filter((n) => n.z <= L.ROOM_BOUNDS.minZ + 0.01).map((n) => n.id);
  const bypass = [];
  for (const a of room) {
    for (const b of yard) {
      const p = N.findPath(a, b);
      if (p.length === 0) bypass.push(`${a}→${b} 不可达`);
      else if (!p.includes('doorway')) bypass.push(`${a}→${b} 未经过 doorway`);
    }
  }
  check(
    `室内(${room.length}) → 院子(${yard.length}) 全部经过推拉门那一格`,
    bypass.length === 0,
    bypass.slice(0, 4).join('；'),
  );
}

// ---------------------------------------------------------------- 2. 边上不撞东西

console.log('\n【2】每条边的每个采样点都离实体 ≥ 5 cm（狗自己的用品除外）');
{
  const MIN_CLEAR = 0.05;
  const bad = [];
  let worst = { d: Number.POSITIVE_INFINITY, at: '' };
  for (const [aId, bId] of N.NAV_EDGES) {
    const a = nodeById.get(aId);
    const b = nodeById.get(bId);
    if (!a || !b) continue;
    // 端点声明为"可占用"的占地，在**整条边**上豁免：
    // 这条边就是通往狗自己软垫/食盆的最后一段，那些物件本来就不是障碍。
    // （按"离端点 0.5 m 内才豁免"会漏判：软垫有半米宽，进入它的时候离端点已经超过 0.5 m。）
    const exempt = new Set([...(a.occupiable ?? []), ...(b.occupiable ?? [])]);
    for (const s of sampleSegment(a, b)) {
      for (const f of blockers) {
        if (exempt.has(f.id)) continue;
        const d = distToFootprint(s.x, s.z, f);
        if (d < worst.d) worst = { d, at: `${aId}-${bId} 靠近 ${f.id}` };
        if (d < MIN_CLEAR) bad.push(`${aId}-${bId} 离 ${f.id} 仅 ${d.toFixed(3)} m`);
      }
    }
  }
  check(
    `${N.NAV_EDGES.length} 条边全程净距 ≥ ${MIN_CLEAR} m`,
    bad.length === 0,
    bad.slice(0, 5).join('；') + (bad.length > 5 ? ` …共 ${bad.length} 处` : ''),
  );
  if (Number.isFinite(worst.d)) console.log(`    · 最窄处 ${worst.d.toFixed(3)} m（${worst.at}）`);
}

// ---------------------------------------------------------------- 3. 路径跟随的三条不变量

console.log('\n【3】路径跟随：逐帧模拟 60 Hz（这是"不瞬移 / 不倒着走"的机械证据）');
const SPEED = { walking: 0.9, trotting: 1.8, running: 4.2, sniffing: 0.6 };
{
  const DT = 1 / 60;
  const routes = [];
  const seenRouteLabels = new Set();
  const pushRoute = (label, pts) => {
    if (pts.length < 2 || seenRouteLabels.has(label)) return;
    seenRouteLabels.add(label);
    routes.push({ label, pts });
  };

  // (a) **每条边至少被走一次**。边是图的最小单元：走完所有边就覆盖了每个节点的进出。
  for (const [a, b] of N.NAV_EDGES) {
    const na = nodeById.get(a);
    const nb = nodeById.get(b);
    if (na && nb) pushRoute(`${a} → ${b}`, [{ x: na.x, z: na.z }, { x: nb.x, z: nb.z }]);
  }

  // (b) 关键路线：真正会发生的"吃 / 喝 / 排泄 / 奔跑 / 回垫子"。
  const keyTargets = ['food', 'outdoor-water', 'elimination', 'yard-lawn', 'bed-main', 'bed-sleep', 'floor-living'];
  for (const from of ['living', 'entry', 'bedroom', 'north', 'deck-east']) {
    for (const anchor of keyTargets) {
      const to = N.resolveAnchorNode(anchor, nodeById.get(from));
      if (!to) continue;
      pushRoute(`${from} → ${anchor}(${to})`, N.routeBetween(from, to));
    }
  }

  // (c) 固定种子的抽样对：跨半张图的长路线（长路线才走得出"转大弯"的帧）。
  //     种子写死 —— 门禁每次取样同一组，失败可复现。
  const SAMPLE_PAIRS = 48;
  const starts = ['entry', 'living', 'bedroom', 'north', 'deck-in', 'deck-east', 'yard-water', 'path-c', 'lounge', 'meadow', 'elimination'];
  const anchorIds = N.DOG_ANCHOR_SPECS.map((s) => s.id);
  const random = seededRng(20260214);
  for (let i = 0; i < SAMPLE_PAIRS; i++) {
    const from = starts[Math.floor(random() * starts.length)];
    const anchor = anchorIds[Math.floor(random() * anchorIds.length)];
    const to = N.resolveAnchorNode(anchor, nodeById.get(from));
    if (!to) continue;
    pushRoute(`抽样 ${from} → ${anchor}(${to})`, N.routeBetween(from, to));
  }

  let maxStepRatio = 0;
  let backwards = [];
  let turnViolation = [];
  let notArrived = [];
  let insideSolid = [];
  let worstRoute = '';

  for (const route of routes) {
    for (const speed of [SPEED.walking, SPEED.running]) {
      let st = N.startFollow(route.pts[0].x, route.pts[0].z, Math.atan2(route.pts[1].x - route.pts[0].x, route.pts[1].z - route.pts[0].z), route.pts);
      let frames = 0;
      let prev = { x: st.x, z: st.z, heading: st.heading };
      while (!st.arrived && frames < 60 * 90) {
        st = N.advance(st, DT, speed, route.pts);
        frames += 1;
        const dx = st.x - prev.x;
        const dz = st.z - prev.z;
        const step = Math.hypot(dx, dz);
        const ratio = step / (speed * DT);
        if (ratio > maxStepRatio) {
          maxStepRatio = ratio;
          worstRoute = `${route.label} @${speed}`;
        }
        if (step > 1e-9) {
          // B：位移方向必须落在朝向的**前方**（余量由 ALIGN_DEADBAND = 0.2 给出）
          const cos = (Math.sin(st.heading) * dx + Math.cos(st.heading) * dz) / step;
          if (cos <= 0.19) backwards.push(`${route.label} cos=${cos.toFixed(3)}`);
          // 采样点不许落在实体里（狗自己的用品豁免：站上去、凑过去本来就是对的）
          for (const f of blockers) {
            if (distToFootprint(st.x, st.z, f) > 0) continue;
            const nearGear = ['foodStation', 'dogBedMain', 'dogBedSleep', 'outdoorWater'].includes(f.id);
            if (!nearGear) insideSolid.push(`${route.label} 进入 ${f.id}`);
          }
        }
        // C：转头速率上限
        const turn = Math.abs(N.wrapAngle(st.heading - prev.heading));
        if (turn > N.MAX_TURN_RATE * DT * 1.0001) turnViolation.push(`${route.label} Δ=${turn.toFixed(4)}`);
        prev = { x: st.x, z: st.z, heading: st.heading };
      }
      if (!st.arrived) notArrived.push(`${route.label} @${speed}`);
    }
  }

  check(
    `A 位移 ≤ 速度×帧时（最大比值 ${maxStepRatio.toFixed(4)}，最差 ${worstRoute}）`,
    maxStepRatio <= 1.0001,
    `出现 > 1 的比值，说明存在"一步跨过"`,
  );
  check(`B 从不倒着走（${routes.length} 条路线 × 2 档速度，逐帧检查 cos > 0.19）`, backwards.length === 0, backwards.slice(0, 3).join('；'));
  check('C 朝向变化不超过最大转头速率', turnViolation.length === 0, turnViolation.slice(0, 3).join('；'));
  check('每条路线都在有限时间内到达（无死循环）', notArrived.length === 0, notArrived.slice(0, 3).join('；'));
  check('行进途中不会穿进实体（狗自己的用品除外）', insideSolid.length === 0, [...new Set(insideSolid)].slice(0, 3).join('；'));
  console.log(`    · 共模拟 ${routes.length} 条路线 × 2 档速度（${N.NAV_EDGES.length} 条边各走一次 + 关键路线 + 固定种子抽样 ${SAMPLE_PAIRS} 对）`);
}

// ---------------------------------------------------------------- 4. 关键路线

console.log('\n【4】关键路线：吃 / 喝 / 排泄 / 奔跑都有去处，尺度合理');
{
  const report = [];
  for (const [from, anchor] of [
    ['living', 'food'],
    ['living', 'outdoor-water'],
    ['living', 'elimination'],
    ['living', 'yard-lawn'],
    ['living', 'bed-main'],
    ['entry', 'yard-lawn'],
  ]) {
    const to = N.resolveAnchorNode(anchor, nodeById.get(from));
    const pts = to ? N.routeBetween(from, to) : [];
    const len = N.polylineLength(pts);
    report.push(`${from}→${anchor}=${len.toFixed(1)}m`);
    check(
      `${from} → ${anchor} 可到达且路程在 1–40 m 之间`,
      pts.length >= 2 && len > 1 && len < 40,
      `len=${len.toFixed(2)} m，节点=${to ?? '无'}`,
    );
  }
  console.log(`    · ${report.join(' · ')}`);

  check(
    '「出院子」必须跨过北墙：室内锚点到院内锚点的路程包含 z < 北墙 的点',
    (() => {
      const pts = N.routeBetween('living', N.resolveAnchorNode('yard-lawn', nodeById.get('living')) ?? 'meadow');
      return pts.some((p) => p.z < L.ROOM_BOUNDS.minZ - 0.1);
    })(),
  );

  const faces = N.DOG_ANCHOR_SPECS.filter((s) => s.faceHeading !== null && !Number.isFinite(s.faceHeading));
  check('锚点的到位朝向都是有限数或 null', faces.length === 0, faces.map((s) => s.id).join('、'));
}

// ---------------------------------------------------------------- 5. 草坪覆盖率

console.log('\n【5】草坪覆盖率：草坪上任何"进得去"的位置都在某个导航节点的 0.7 m 内');
if (typeof N.lawnReachable !== 'function') {
  check('导航层导出了 `lawnReachable`（覆盖率断言的取样域判据）', false, '缺少导出');
} else {
  /**
   * 取样域 = 草坪上"狗真的站得进去、也走得过去"的位置：
   *   · 净距 ≥ 0.30 m（与 `dog-nav.ts` 的 `NODE_CLEARANCE` 同一个门槛：低于它的地方
   *     本来就是树干、灌木、置石或水面，狗不会站在那里，不该算作"草坪上可去的位置"）；
   *   · 属于 `lawnReachable` 认定的可达空地。院子东北角有一小片被点景灌木与围栏封死的
   *     死角（矩形模型下通道只有约 4 cm），那里**不布点**也**不作为要求** ——
   *     覆盖率要回答的是"用户希望狗能去的地方都去得了"，不是"草坪矩形里每个数学点都有节点"。
   * 采样用 0.5 m 格：比目标半径 0.7 m 细，任何一个比 0.5 m 大的空洞都会被采到。
   */
  const COVER_M = 0.7;
  const COVER_CLEARANCE = 0.3;
  const clearanceAt = (x, z) => blockers.reduce((d, f) => Math.min(d, distToFootprint(x, z, f)), Infinity);
  let worst = { d: 0, x: 0, z: 0 };
  let considered = 0;
  let skippedBlocked = 0;
  let skippedSealed = 0;
  const holes = [];
  for (let x = L.YARD_BOUNDS.minX; x <= L.YARD_BOUNDS.maxX + 1e-9; x += 0.5) {
    for (let z = L.YARD_BOUNDS.minZ; z <= L.YARD_BOUNDS.maxZ + 1e-9; z += 0.5) {
      if (clearanceAt(x, z) < COVER_CLEARANCE) {
        skippedBlocked += 1;
        continue;
      }
      if (!N.lawnReachable(x, z)) {
        skippedSealed += 1;
        continue;
      }
      considered += 1;
      let nearest = Number.POSITIVE_INFINITY;
      for (const n of nodes) nearest = Math.min(nearest, Math.hypot(n.x - x, n.z - z));
      if (nearest > worst.d) worst = { d: nearest, x, z };
      if (nearest > COVER_M) holes.push(`(${x.toFixed(1)}, ${z.toFixed(1)}) 最近节点 ${nearest.toFixed(2)} m`);
    }
  }
  check(
    `草坪上 ${considered} 个样本点到最近导航节点的距离全部 ≤ ${COVER_M} m（实测最坏 ${worst.d.toFixed(3)} m @ x=${worst.x.toFixed(2)}, z=${worst.z.toFixed(2)}）`,
    holes.length === 0,
    holes.slice(0, 5).join('；') + (holes.length > 5 ? ` …共 ${holes.length} 处` : ''),
  );
  // 防"空断言"：取样域如果被过滤器吃到很小，上面那条会因为没东西可测而永远通过。
  check(
    `覆盖率断言的取样域不是空的（${considered} 个样本点；另有 ${skippedBlocked} 个落在实体上、${skippedSealed} 个落在封死的死角里而跳过）`,
    considered >= 100,
    `只有 ${considered} 个样本点，断言失去意义`,
  );
}

// ---------------------------------------------------------------- 6. 互动点位

console.log('\n【6】互动点位：用户点名的那些格子各自接得上、走得通');
{
  const neighbors = new Map(nodes.map((n) => [n.id, []]));
  for (const [a, b] of N.NAV_EDGES) {
    neighbors.get(a)?.push(b);
    neighbors.get(b)?.push(a);
  }
  // 用户点名的 7 格：4 个草坪方位点 + 树下 + 灌木边 + 池塘岸边
  const required = ['pond-edge', 'shade-tree', 'dig-bush', 'lawn-c', 'lawn-w', 'lawn-e', 'lawn-n'];
  const lines = [];
  for (const id of required) {
    const node = nodeById.get(id);
    const nb = neighbors.get(id) ?? [];
    const path = N.findPath('deck-in', id);
    lines.push(`${id}(${node ? `${node.x.toFixed(2)},${node.z.toFixed(2)}` : '缺失'}):${nb.length}邻居`);
    check(
      `${id} 至少与 2 个邻居连通、且从「deck-in」可达`,
      Boolean(node) && nb.length >= 2 && path.length >= 2,
      node ? `邻居 ${nb.length} 个，路径 ${path.length} 跳` : '节点不存在',
    );
  }
  console.log(`    · ${lines.join(' · ')}`);

  // 5 个新锚点必须真的绑在对应那一格上（映射被改成别的点时，这条会拦住）
  const namedPairs = [
    ['yard-lawn-center', 'lawn-c'],
    ['yard-lawn-west', 'lawn-w'],
    ['yard-lawn-east', 'lawn-e'],
    ['yard-shade', 'shade-tree'],
    ['yard-dig', 'dig-bush'],
  ];
  const lost = namedPairs.filter(([anchor, node]) => !(N.ANCHOR_NODES[anchor] ?? []).includes(node));
  check(
    `5 个新锚点的节点列表都含各自的具名点（${namedPairs.map((p) => p[0]).join(' / ')}）`,
    lost.length === 0,
    lost.map((p) => `${p[0]} 丢了 ${p[1]}`).join('；'),
  );

  /**
   * ★ 决策守卫：`yard-pond` 必须仍然具备 `water` 能力、并且仍然连着紧贴水面的那一格。
   *
   * 为什么把"用户点名的互动"写成断言：能力漏配**不会报错**，只会让「玩水」这类活动
   * 因为找不到目的地而**静默消失** —— 画面上看不出异常，只是狗再也不去池塘了。
   * 这条守卫让"把玩水点删掉"必须是一次显式决定：要删，就得连同这条断言一起改。
   */
  const pondAnchor = N.DOG_ANCHOR_SPECS.find((s) => s.id === 'yard-pond');
  const pondNodes = N.ANCHOR_NODES['yard-pond'] ?? [];
  check(
    '决策守卫：`yard-pond` 具备 water 能力，且节点列表含 `pond-edge`',
    Boolean(pondAnchor) && pondAnchor.capabilities.includes('water') && pondNodes.includes('pond-edge'),
    `capabilities=[${(pondAnchor?.capabilities ?? []).join(', ')}] · nodes=[${pondNodes.join(', ')}]`,
  );

  /**
   * 决策守卫 ②：**锚点解析不许退化成"原地目标"**。
   *
   * 为什么这条也要守：`yard-lawn` 这一轮从 4 个走廊站位扩到全部草坪节点之后，
   * "去草坪"很容易解析到狗正站着的那一格 —— 路程 0，运行时那一段就只剩原地动作
   * （`dog-behavior.ts` 的 `travelS = 0` 分支），画面上是狗摆着姿势不动。
   * 判据：候选 ≥ 3 的锚点，**从它自己的候选点出发**时，解析出来的目标必须是别的节点、
   * 且至少 0.35 m 之外 —— 也就是"这一段真的要走一段路"。
   * 候选只有一两个的锚点不参与（"就近取一个"就是它全部的含义，不该被这条规则改写）。
   */
  const degenerate = [];
  let minTravel = Number.POSITIVE_INFINITY;
  let minTravelAt = '';
  for (const spec of N.DOG_ANCHOR_SPECS) {
    const cands = N.ANCHOR_NODES[spec.id] ?? [];
    if (cands.length < 3) continue;
    for (const from of cands) {
      const node = nodeById.get(from);
      const to = node ? N.resolveAnchorNode(spec.id, node) : null;
      const target = to ? nodeById.get(to) : undefined;
      if (!node || !target) {
        degenerate.push(`${spec.id} ← ${from}: 解析不出目标`);
        continue;
      }
      const d = Math.hypot(target.x - node.x, target.z - node.z);
      if (d < minTravel) {
        minTravel = d;
        minTravelAt = `${spec.id} ← ${from} → ${to}`;
      }
      if (to === from || d < 0.35) degenerate.push(`${spec.id} ← ${from} → ${to} 仅 ${d.toFixed(2)} m`);
    }
  }
  check(
    `锚点解析不会退化成「原地目标」（候选 ≥ 3 的锚点，实测最短一段路 ${Number.isFinite(minTravel) ? `${minTravel.toFixed(2)} m @ ${minTravelAt}` : '不适用'}）`,
    degenerate.length === 0,
    degenerate.slice(0, 4).join('；') + (degenerate.length > 4 ? ` …共 ${degenerate.length} 处` : ''),
  );
}

if (failures.length > 0) {
  console.error(`\n✗ 运动审计未通过：${failures.length} / ${checks} 项失败`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`\n✓ 运动审计全部通过（${checks} 项）`);
