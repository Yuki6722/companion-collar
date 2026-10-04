#!/usr/bin/env node
/**
 * 柴犬姿态审计（不启动浏览器）：**爪底不许穿地**，以及一组姿态事实。
 *
 * 为什么需要这个门禁：本轮真出过一次故障 —— 低姿态（趴卧 / 睡 / 喝水 / 嗅闻 / 玩耍 /
 * 排泄 / 坐）要把躯干压到 0.13–0.24 m，而前肢长 0.29 m，膝角不折够时**前爪会插进地板**，
 * 实测最深 15 cm。布局审计与运动审计都读不到模型，所以那次是"只有看画面才会发现"的错误。
 * 这个脚本把模型与控制器一起在 Node 里真跑起来，逐姿态量四只爪子的世界高度。
 *
 * 两个工程细节：
 *  1. 模型用 `document.createElement('canvas')` 程序化生成毛贴图，Node 里没有 DOM ——
 *     所以下面装了一个**最小 canvas 替身**（只实现模型真用到的那几个 2D 方法）。
 *     它的输出没有画面意义，但足以让几何与关节链完整装配起来。
 *  2. 阈值取 `root.position.y` 而不是 0：狗在院子里时脚下是 −0.12 m 的草坪，
 *     拿 0 当基准会把"站在草地上"误判成穿地 12 cm。
 *
 * 用法：node scripts/check-dog-pose.mjs
 * 退出码：0 = 全部通过；1 = 有失败。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DOG = path.join(ROOT, 'apps', 'web', 'dist', 'apps', 'web', 'src', 'scene', 'dog');
const SRC_DOG = path.join(ROOT, 'apps', 'web', 'src', 'scene', 'dog');
const OUTPUTS = [['dog-model', 'dog-model.js'], ['dog-controller', 'dog-controller.js'], ['dog-rig', 'dog-rig.js']];

function needsBuild() {
  for (const [stem, out] of OUTPUTS) {
    const compiled = path.join(DIST_DOG, out);
    const source = path.join(SRC_DOG, `${stem}.ts`);
    if (!fs.existsSync(compiled) || !fs.existsSync(source)) return true;
    if (fs.statSync(source).mtimeMs > fs.statSync(compiled).mtimeMs) return true;
  }
  return false;
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

// ---------------------------------------------------------------- 最小 canvas 替身

/** 2D 上下文替身：只实现 `dog-model.ts` 真正调用到的方法。 */
function fakeContext() {
  const noop = () => undefined;
  return {
    canvas: { width: 256, height: 256 },
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    globalAlpha: 1,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (_x, _y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: noop,
    drawImage: noop,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    arc: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    clip: noop,
    setTransform: noop,
  };
}

globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') return {};
    const el = { width: 256, height: 256, getContext: () => fakeContext() };
    return el;
  },
};
globalThis.self = globalThis;

const Model = await import(pathToFileURL(path.join(DIST_DOG, 'dog-model.js')).href);
const Controller = await import(pathToFileURL(path.join(DIST_DOG, 'dog-controller.js')).href);

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

const rig = Model.buildShibaRig(0);
const ctrl = new Controller.DogController(rig, { reducedMotion: false });
const TOL = Controller.PAW_GROUND_TOLERANCE_M;
const PAW_KEYS = ['frontL', 'frontR', 'hindL', 'hindR'];

/**
 * 四只**爪底**的世界高度相对于脚下地面（负 = 穿地）。
 *
 * ⚠️ 必须减去爪网格原点→爪底 的偏移：`getWorldPosition()` 给的是网格原点，
 * 而爪子是约 2 cm 厚的球 —— 拿原点当爪底会让所有判定整体差 2 cm
 * （本轮真踩过：控制器一度按原点判定，于是站姿被误判成"浮空 2 cm"、
 * 兜底也过度折膝）。这里从几何包围盒读同一份偏移量。
 */
function soleOffset(paw) {
  const geo = paw.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const minY = geo.boundingBox?.min.y;
  return minY === undefined || !Number.isFinite(minY) ? 0 : minY * paw.scale.y;
}

function pawClearances(groundY) {
  const out = {};
  for (const key of PAW_KEYS) {
    const paw = rig.legs[key]?.paw;
    out[key] = paw ? paw.getWorldPosition(new (paw.position.constructor)()).y + soleOffset(paw) - groundY : NaN;
  }
  return out;
}

console.log('→ 审计柴犬：17 种姿态 × 4 只爪子的世界高度\n');

// ---------------------------------------------------------------- 1. 骨架契约

console.log('【1】骨架契约（模型与控制器之间的耦合面）');
{
  const missing = [];
  for (const key of ['root', 'body', 'spine', 'chest', 'hips', 'neck', 'head', 'muzzle', 'nose', 'jaw', 'tongue', 'earL', 'earR', 'tailRoot', 'legs', 'collar']) {
    if (!rig[key]) missing.push(key);
  }
  check('DogRig 的字段都装配上了', missing.length === 0, missing.join('、'));
  check(`尾巴 5 段`, rig.tail.length === 5, `${rig.tail.length} 段`);
  check(`项圈 6 个部件（带体 + 电子仓 + 双电极 + 热敏电阻 + 摄像头）`, rig.collar.children.length === 6, `${rig.collar.children.length} 个`);
  for (const key of PAW_KEYS) {
    const leg = rig.legs[key];
    check(`腿 ${key} 的 hip→knee→paw 三级链存在`, Boolean(leg?.hip && leg?.knee && leg?.paw));
  }
  check(
    `SHIBA_METRICS.bodyCenterY 与控制器的站立基准一致`,
    Math.abs(Model.SHIBA_METRICS.bodyCenterY - 0.32) < 1e-6,
    `${Model.SHIBA_METRICS.bodyCenterY} vs 0.32`,
  );
  const m = Model.SHIBA_METRICS;
  check(
    `体尺合理（肩高 ${m.shoulderHeightM} / 体长 ${m.bodyLengthM} / 头顶 ${m.headTopY}）`,
    m.shoulderHeightM > 0.3 && m.shoulderHeightM < 0.5 && m.bodyLengthM > 0.4 && m.bodyLengthM < 0.7 && m.headTopY > m.shoulderHeightM,
  );
}

// ---------------------------------------------------------------- 2. 站立：四爪贴地

console.log('\n【2】站立（零位即站姿）');
{
  ctrl.snapTo('stand');
  for (let i = 0; i < 30; i++) ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
  const c = pawClearances(rig.root.position.y);
  const worst = Math.min(...Object.values(c));
  check(
    `站立时四爪都贴地（最低 ${worst.toFixed(4)} m）`,
    worst >= -TOL,
    PAW_KEYS.map((k) => `${k}=${c[k].toFixed(3)}`).join(' '),
  );
}

// ---------------------------------------------------------------- 3. 逐姿态爪底不穿地

console.log('\n【3】17 种姿态：爪底一律不穿地（这是本轮真出过故障的地方）');
const POSES = Controller.DOG_POSES ? Object.keys(Controller.DOG_POSES) : ['stand'];
for (const pose of POSES) {
  ctrl.snapTo(pose);
  // 推进 1 秒：让过渡走完、呼吸与微动作都进入正常范围
  for (let i = 0; i < 60; i++) ctrl.update(1 / 60, { phaseSpeed: pose === 'walk' ? 1.6 : 0, moving: pose === 'walk' || pose === 'trot' || pose === 'run' });
  const c = pawClearances(rig.root.position.y);
  const worstKey = PAW_KEYS.reduce((a, b) => (c[b] < c[a] ? b : a), PAW_KEYS[0]);
  const worst = c[worstKey];
  check(
    `${pose.padEnd(10)} 爪底 ≥ ${-TOL} m（最低 ${worstKey} ${worst.toFixed(4)}）`,
    worst >= -TOL,
    PAW_KEYS.map((k) => `${k}=${c[k].toFixed(3)}`).join(' '),
  );
}

// ---------------------------------------------------------------- 4. 步态：整圈都不穿地

console.log('\n【4】移动步态：走完一整个循环，逐帧都不穿地');
for (const [pose, phaseSpeed] of [['walk', 1.6], ['trot', 2.6], ['run', 3.6]]) {
  ctrl.snapTo(pose);
  let worst = Number.POSITIVE_INFINITY;
  let worstT = 0;
  const frames = Math.round((1 / phaseSpeed) * 3 * 60); // 三个完整循环
  for (let i = 0; i < frames; i++) {
    ctrl.update(1 / 60, { phaseSpeed, moving: true });
    const c = pawClearances(rig.root.position.y);
    const m = Math.min(...Object.values(c));
    if (m < worst) {
      worst = m;
      worstT = i / 60;
    }
  }
  check(`${pose} 三圈内爪底最低 ${worst.toFixed(4)} m（t=${worstT.toFixed(2)}s）`, worst >= -TOL);
}

// ---------------------------------------------------------------- 5. 院子里（地面 −0.12 m）

console.log('\n【5】院子里的姿态：基准随脚下地面移动，不许"悬空"');
{
  rig.root.position.y = -0.12;
  for (const pose of ['stand', 'sit', 'down', 'run']) {
    ctrl.snapTo(pose);
    for (let i = 0; i < 45; i++) ctrl.update(1 / 60, { phaseSpeed: pose === 'run' ? 3.6 : 0, moving: pose === 'run' });
    const c = pawClearances(-0.12);
    const worst = Math.min(...Object.values(c));
    check(`${pose.padEnd(10)} 草地上爪底 ${worst.toFixed(4)} m`, worst >= -TOL && worst < 0.08, PAW_KEYS.map((k) => c[k].toFixed(3)).join(' '));
  }
  rig.root.position.y = 0;
}

// ---------------------------------------------------------------- 6. 姿态高度次序 + root 未被改写

console.log('\n【6】姿态事实：趴下真的低、控制器不碰世界变换');
{
  const heights = {};
  for (const pose of ['stand', 'sit', 'down', 'sleep']) {
    ctrl.snapTo(pose);
    for (let i = 0; i < 60; i++) ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
    heights[pose] = ctrl.snapshot().bodyHeight;
  }
  check(
    `躯干高度次序 stand > sit > down ≈ sleep（${heights.stand} / ${heights.sit} / ${heights.down} / ${heights.sleep}）`,
    heights.stand > heights.sit && heights.sit > heights.down + 0.02 && Math.abs(heights.down - heights.sleep) < 0.05,
  );

  // 用哨兵值验证：控制器全程不许写 root
  rig.root.position.set(1.234, 0.567, -0.891);
  rig.root.rotation.y = 0.4321;
  for (const pose of POSES) {
    ctrl.snapTo(pose);
    for (let i = 0; i < 20; i++) ctrl.update(1 / 60, { phaseSpeed: 1.6, moving: true });
  }
  const p = rig.root.position;
  check(
    `17 种姿态全程没有改写 root.position / rotation.y`,
    Math.abs(p.x - 1.234) < 1e-9 && Math.abs(p.y - 0.567) < 1e-9 && Math.abs(p.z + 0.891) < 1e-9 && Math.abs(rig.root.rotation.y - 0.4321) < 1e-9,
    `pos=(${p.x},${p.y},${p.z}) rotY=${rig.root.rotation.y}`,
  );
  rig.root.position.set(0, 0, 0);
  rig.root.rotation.y = 0;
}

// ---------------------------------------------------------------- 7. 突发：多时相真的在动

console.log('\n【7】突发动作：多时相推进，且抖动真的落到骨架上');
{
  ctrl.snapTo('seizure');
  const seen = new Set();
  let maxTremor = 0;
  for (let i = 0; i < 60 * 16; i++) {
    ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
    const m = ctrl.incidentMotionSnapshot();
    if (m) {
      seen.add(m.phaseIndex);
      maxTremor = Math.max(maxTremor, m.tremorApplied ?? 0);
    }
  }
  check(`抽搐走过 ${seen.size} 个时相（应 ≥ 3）`, seen.size >= 3, [...seen].join(','));
  check(`阵挛期抖动真的落到骨架上（峰值 ${maxTremor.toFixed(4)}）`, maxTremor > 0);

  ctrl.snapTo('vomit');
  const vSeen = new Set();
  let jawMax = 0;
  for (let i = 0; i < 60 * 9; i++) {
    ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
    const m = ctrl.incidentMotionSnapshot();
    if (m) {
      vSeen.add(m.phaseIndex);
      jawMax = Math.max(jawMax, ctrl.snapshot().joints.jaw ?? 0);
    }
  }
  check(`呕吐走过 ${vSeen.size} 个时相（应 ≥ 3）`, vSeen.size >= 3, [...vSeen].join(','));
  check(`呕出期下颌张开（峰值 ${jawMax.toFixed(3)} rad）`, jawMax > 0.3);
}

// ---------------------------------------------------------------- 8. 本轮反馈：抖动幅度与"吐出"一次性事件

console.log('\n【8】抽搐要有明显的原地抖动 / 呕吐要能吐出东西（本轮用户反馈）');
{
  ctrl.snapTo('seizure');
  let maxTremor = 0;
  let maxRoll = 0;
  let maxBodyY = -Infinity;
  let minBodyY = Infinity;
  let maxRollZ = -Infinity;
  let minRollZ = Infinity;
  for (let i = 0; i < 60 * 16; i++) {
    ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
    const m = ctrl.incidentMotionSnapshot();
    if (m) {
      maxTremor = Math.max(maxTremor, m.tremorApplied ?? 0);
      maxRoll = Math.max(maxRoll, m.tremorRollApplied ?? 0);
    }
    // ⚠️ 只统计**阵挛期窗口**（约 5.5–12.5 s）内的摆幅：
    // 把整段都算进去的话，测到的是"从站姿倒向侧卧"这段过渡，不是抖动本身。
    const t = i / 60;
    if (t < 6.0 || t > 12.0) continue;
    const snap = ctrl.snapshot();
    const y = snap.joints.bodyY ?? 0;
    const z = snap.joints.bodyRoll ?? 0;
    maxBodyY = Math.max(maxBodyY, y);
    minBodyY = Math.min(minBodyY, y);
    maxRollZ = Math.max(maxRollZ, z);
    minRollZ = Math.min(minRollZ, z);
  }
  // "明显"是可量化的：阵挛期里躯干上下摆幅与侧倾摆幅都要够大（原来只有 1.6 cm）
  check(
    `抽搐阵挛期的躯干上下摆幅 ≥ 5 cm（实测 ${((maxBodyY - minBodyY) * 100).toFixed(1)} cm）`,
    maxBodyY - minBodyY >= 0.05,
    `bodyY ${minBodyY.toFixed(3)}–${maxBodyY.toFixed(3)}`,
  );
  check(
    `抽搐阵挛期的侧倾摆幅 ≥ 20°（实测 ${(((maxRollZ - minRollZ) * 180) / Math.PI).toFixed(1)}°）`,
    maxRollZ - minRollZ >= (20 * Math.PI) / 180,
    `bodyRoll ${minRollZ.toFixed(3)}–${maxRollZ.toFixed(3)}`,
  );
  check(`时相给出的抖动幅度 > 0（tremorAmp=${maxTremor.toFixed(3)}）`, maxTremor > 0);
  check(`时相给出的横向抖动幅度 > 0（tremorRollAmp=${maxRoll.toFixed(3)}）`, maxRoll > 0);

  // 呕吐的"吐出"必须是一次性的：整段里只返回一次 true
  ctrl.snapTo('vomit');
  let emits = 0;
  let firstAt = -1;
  for (let i = 0; i < 60 * 9; i++) {
    ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
    if (ctrl.consumeVomitEmit()) {
      emits += 1;
      if (firstAt < 0) firstAt = i / 60;
    }
  }
  check(`一次呕吐只触发一次"吐出"（实测 ${emits} 次，t=${firstAt.toFixed(2)}s）`, emits === 1);
  check(`"吐出"发生在干呕之后（t≥3s，实测 ${firstAt.toFixed(2)}s）`, firstAt >= 2.9);
  check(`"吐出"之后不再重复触发`, ctrl.consumeVomitEmit() === false);

  // 重新进入呕吐必须能再吐一次（否则第二次点按钮没有呕吐物）
  ctrl.snapTo('stand');
  ctrl.snapTo('vomit');
  let second = false;
  for (let i = 0; i < 60 * 5; i++) {
    ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
    if (ctrl.consumeVomitEmit()) second = true;
  }
  check('再次呕吐时会重新触发"吐出"（第二次点按钮仍会有呕吐物）', second);

  // 抽搐全程不许触发"吐出"
  ctrl.snapTo('stand');
  ctrl.snapTo('seizure');
  let wrongEmit = false;
  for (let i = 0; i < 60 * 16; i++) {
    ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
    if (ctrl.consumeVomitEmit()) wrongEmit = true;
  }
  check('抽搐不会误触发"吐出"', !wrongEmit);
}

// ---------------------------------------------------------------- 9. 项圈相机机位依赖的网格名

console.log('\n【9】"狗视角"机位依赖的项圈镜头网格');
{
  // ⚠️ 必须先把狗摆回站姿再量：上一节结束时它还在抽搐的侧卧姿态里，
  // 那样量到的镜头高度是"躺着的项圈"（0.13 m），会误报。
  ctrl.snapTo('stand');
  for (let i = 0; i < 30; i++) ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
  const lens = rig.collar.getObjectByName('collar-camera');
  check('项圈前端镜头网格存在（名字 `collar-camera`，狗视角机位按它定位）', Boolean(lens));
  if (lens) {
    lens.updateWorldMatrix(true, false);
    const p = lens.getWorldPosition(new (lens.position.constructor)());
    check(
      `站姿时镜头在颈部高度（离地 ${p.y.toFixed(3)} m，应在 0.25–0.45 之间）`,
      p.y > 0.25 && p.y < 0.45,
      `y=${p.y.toFixed(3)}`,
    );
  }
}

// ---------------------------------------------------------------- 10. 院子里的三个新姿态

console.log('\n【10】院子里的三个新姿态：玩水 / 草地打滚 / 刨地（本轮新增）');
{
  const YARD_POSES = ['water-play', 'rolling', 'digging'];

  /** 推进 `seconds` 秒并返回若干关节的摆幅（max − min）与逐帧采样。 */
  function swingOf(pose, keys, seconds, sampleKeys = keys) {
    ctrl.snapTo(pose);
    const min = {};
    const max = {};
    const series = Object.fromEntries(sampleKeys.map((k) => [k, []]));
    for (let i = 0; i < 60 * seconds; i++) {
      ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
      const j = ctrl.snapshot().joints;
      for (const k of keys) {
        const v = j[k] ?? 0;
        min[k] = min[k] === undefined ? v : Math.min(min[k], v);
        max[k] = max[k] === undefined ? v : Math.max(max[k], v);
      }
      for (const k of sampleKeys) series[k].push(j[k] ?? 0);
    }
    const out = {};
    for (const k of keys) out[k] = (max[k] ?? 0) - (min[k] ?? 0);
    out.__min = min;
    out.__max = max;
    out.__series = series;
    return out;
  }

  /** 两序列的皮尔森相关系数（用来判"两条前腿是交替还是同步"）。 */
  function correlation(a, b) {
    const ma = a.reduce((s, v) => s + v, 0) / a.length;
    const mb = b.reduce((s, v) => s + v, 0) / b.length;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < a.length; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return num / Math.sqrt(da * db);
  }

  // 10.1 存在性：能 snapTo、能推进 1 秒而不抛异常
  for (const id of YARD_POSES) {
    let error = null;
    try {
      ctrl.snapTo(id);
      for (let i = 0; i < 60; i++) ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
    } catch (err) {
      error = err;
    }
    check(
      `姿态 ${id} 存在且能 snapTo + 推进 1 秒不抛异常`,
      Boolean(Controller.DOG_POSES[id]) && error === null,
      error ? String(error) : Controller.DOG_POSES[id] ? '' : 'DOG_POSES 里没有这个 key',
    );
  }

  // 10.2 爪底不穿地：**整周期**逐帧（不是只看一秒处的那一帧）
  //      —— 这三个姿态都是振荡的，只采一帧会刚好错过最低点。
  for (const id of YARD_POSES) {
    ctrl.snapTo(id);
    let worst = Number.POSITIVE_INFINITY;
    let worstKey = '';
    let worstT = 0;
    for (let i = 0; i < 60 * 6; i++) {
      ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
      const c = pawClearances(rig.root.position.y);
      for (const k of PAW_KEYS) {
        if (c[k] < worst) {
          worst = c[k];
          worstKey = k;
          worstT = i / 60;
        }
      }
    }
    check(
      `${id.padEnd(10)} 整周期（6 s）爪底都不穿地（最低 ${worstKey} ${worst.toFixed(4)} @ ${worstT.toFixed(2)}s）`,
      worst >= -TOL,
    );
  }

  // 10.3 玩水：**确实在动**（静默失效守卫 —— 扒水退化成站着不动就没人看得出来）
  {
    const s = swingOf('water-play', ['frontL.hip', 'frontL.knee', 'frontR.hip', 'frontR.knee'], 2, ['frontL.hip', 'frontR.hip']);
    const hipSwing = Math.min(s['frontL.hip'], s['frontR.hip']);
    const kneeSwing = Math.min(s['frontL.knee'], s['frontR.knee']);
    check(`玩水：两只前爪的 hip 摆幅都 > 0.1 rad（实测 ${hipSwing.toFixed(3)}）`, hipSwing > 0.1);
    check(`玩水：两只前爪的 knee 摆幅都 > 0.1 rad（实测 ${kneeSwing.toFixed(3)}）`, kneeSwing > 0.1);
    // "交替"本身也要断言：两条前腿同相就成了"两只手一起拍"
    const corr = correlation(s.__series['frontL.hip'], s.__series['frontR.hip']);
    check(`玩水：两条前爪是**交替**的（相关系数 ${corr.toFixed(3)}，应 < −0.5）`, corr < -0.5);
    // "头朝水面低下"：吻部估算高度必须明显低于站姿
    ctrl.snapTo('stand');
    for (let i = 0; i < 60; i++) ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
    const standMuzzle = ctrl.snapshot().joints.muzzleHeightApproxM ?? 0;
    ctrl.snapTo('water-play');
    for (let i = 0; i < 60; i++) ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
    const playMuzzle = ctrl.snapshot().joints.muzzleHeightApproxM ?? 0;
    check(
      `玩水：头确实低下来了（吻部 ${playMuzzle.toFixed(3)} m < 站姿 ${standMuzzle.toFixed(3)} m）`,
      playMuzzle < standMuzzle - 0.1,
    );
  }

  // 10.4 打滚：滚转确实在来回，且躯干确实压到了低位
  {
    const s = swingOf('rolling', ['bodyRoll', 'bodyY', 'frontL.hip'], 2);
    const rollMin = s.__min.bodyRoll ?? 0;
    const rollMax = s.__max.bodyRoll ?? 0;
    check(`打滚：绕 Z 的滚转摆幅 > 0.3 rad（实测 ${s.bodyRoll.toFixed(3)}）`, s.bodyRoll > 0.3);
    check(
      `打滚：滚转在 0.5–1.2 rad 之间来回（实测 ${rollMin.toFixed(3)}–${rollMax.toFixed(3)}）`,
      rollMin >= 0.49 && rollMax <= 1.21,
    );
    check(`打滚：躯干压到低位（bodyY ≤ 0.20 m，实测 ${(s.__max.bodyY ?? 0).toFixed(3)}）`, (s.__max.bodyY ?? 1) <= 0.2);
    check(`打滚：四肢在蹬（前爪 hip 摆幅 ${s['frontL.hip'].toFixed(3)} > 0.1）`, s['frontL.hip'] > 0.1);
  }

  // 10.5 刨地：前爪摆幅
  {
    const s = swingOf('digging', ['frontL.hip', 'frontL.knee', 'frontR.hip', 'frontR.knee'], 2);
    const hipSwing = Math.min(s['frontL.hip'], s['frontR.hip']);
    const kneeSwing = Math.min(s['frontL.knee'], s['frontR.knee']);
    check(`刨地：两只前爪的 hip 摆幅都 > 0.1 rad（实测 ${hipSwing.toFixed(3)}）`, hipSwing > 0.1);
    check(`刨地：两只前爪的 knee 摆幅都 > 0.1 rad（实测 ${kneeSwing.toFixed(3)}）`, kneeSwing > 0.1);
    // "前低后略高"：`bodyPitch > 0` 就是前低后高（见控制器的符号约定）
    ctrl.snapTo('digging');
    for (let i = 0; i < 60; i++) ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
    check(`刨地：身体前低后略高（bodyPitch = ${(ctrl.snapshot().joints.bodyPitch ?? 0).toFixed(3)} rad > 0）`, (ctrl.snapshot().joints.bodyPitch ?? 0) > 0.1);
  }

  // 10.6 水花：玩水时**反复**触发（不是一次性），别的时候一次都不许有
  {
    ctrl.snapTo('water-play');
    let emits = 0;
    let duplicate = 0;
    let firstAt = -1;
    for (let i = 0; i < 60 * 2; i++) {
      ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
      if (ctrl.consumeSplashEvent()) {
        emits += 1;
        if (firstAt < 0) firstAt = i / 60;
        // 防重入：同一次扒水再问一次，必须还是 false（否则水花会按帧生成）
        if (ctrl.consumeSplashEvent()) duplicate += 1;
      }
    }
    check(`玩水 2 秒内反复触发水花（实测 ${emits} 次，首次在 ${firstAt.toFixed(2)}s）`, emits >= 2);
    check('同一次扒水不会被重复认领（防重入）', duplicate === 0);
    check(`累计认领数与返回值一致（${ctrl.splashEmitCount()} 次）`, ctrl.splashEmitCount() >= emits);

    // 非玩水姿态：抽搐 / 呕吐 / 站立全程都不许冒水花
    for (const id of ['stand', 'seizure', 'vomit']) {
      ctrl.snapTo(id);
      let wrong = false;
      for (let i = 0; i < 60 * 16; i++) {
        ctrl.update(1 / 60, { phaseSpeed: 0, moving: false });
        if (ctrl.consumeSplashEvent()) wrong = true;
      }
      check(`姿态 ${id.padEnd(8)} 全程不会触发水花`, !wrong);
    }
  }

  // 10.7 新参数默认值守卫：站姿里必须全 0，且只有这三个新姿态用到它们
  {
    const NEW_KEYS = [
      'frontPawOscAmp',
      'frontPawOscHz',
      'bodyRollOscAmp',
      'bodyRollOscHz',
      'limbFlailAmp',
      'limbFlailHz',
      'headYawOffset',
      'headShakeIntervalS',
    ];
    const standPose = Controller.DOG_POSES.stand.pose;
    const nonZero = NEW_KEYS.filter((k) => (standPose[k] ?? 0) !== 0);
    check(
      '新参数在站姿（所有姿态的派生基准）里全部为 0 —— 这是"原有 14 个姿态逐帧不变"的结构性前提',
      nonZero.length === 0,
      nonZero.join('、'),
    );
    const users = Object.entries(Controller.DOG_POSES)
      .filter(([, def]) => NEW_KEYS.some((k) => (def.pose[k] ?? 0) !== 0))
      .map(([id]) => id)
      .sort();
    check(
      `只有三个新姿态用到新参数（实测 ${users.join('、') || '无'}）`,
      users.length === 3 && users.every((id) => YARD_POSES.includes(id)),
    );
  }
}

ctrl.dispose();

if (failures.length > 0) {
  console.error(`\n✗ 姿态审计未通过：${failures.length} / ${checks} 项失败`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`\n✓ 姿态审计全部通过（${checks} 项）`);