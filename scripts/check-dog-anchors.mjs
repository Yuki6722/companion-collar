#!/usr/bin/env node
/**
 * 锚点契约审计：**三张表必须逐字一致**。
 *
 * 同一个"行为锚点"在三个包里各有一份表述：
 *   - `@camp/core` 的 `DOG_ANCHOR_IDS`        —— 行为层选目的地用的 id 集合
 *   - `@camp/simulator` 的 `SIM_DOG_ANCHORS`  —— 生成会话时写进时间线的锚点
 *   - `apps/web` 的 `DOG_ANCHOR_SPECS`        —— 渲染层把锚点翻译成导航节点
 *
 * 这三张表**靠人工同步**（core 不能反向依赖 web，web 也不该 import core 的运行时），
 * 所以它们是最容易静默漂移的地方：只要有一边漏了一个 id，表现就是
 * "时间线让狗去某个锚点，但渲染层查不到 → 退到兜底节点 → 狗在莫名其妙的地方做动作"，
 * 而**任何单测都不会报错**（core 与 simulator 的相等性有单测，web 那一侧没有）。
 *
 * 这个脚本把 web 那一侧也钉住：读编译产物（dist 里的相对导入链是完整的，
 * 因此绕开了 node_modules 的类型剥离限制 —— 见 AGENTS.md §5.5.6），
 * 逐项比较三个 id 列表的**内容与顺序**，并检查锚点→导航节点的映射没有悬空引用。
 *
 * 用法：node scripts/check-dog-anchors.mjs
 * 退出码：0 = 通过；1 = 有失败。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'apps', 'web', 'dist');
const NAV_JS = path.join(DIST, 'apps', 'web', 'src', 'scene', 'dog', 'dog-nav.js');
const CORE_JS = path.join(DIST, 'packages', 'core', 'src', 'behavior', 'dog.js');
const SIM_TS = path.join(ROOT, 'packages', 'simulator', 'src', 'behavior.ts');
const NAV_TS = path.join(ROOT, 'apps', 'web', 'src', 'scene', 'dog', 'dog-nav.ts');

/** 编译产物比源文件旧就重编一次，避免审到旧结果。 */
function stale() {
  if (!fs.existsSync(NAV_JS) || !fs.existsSync(CORE_JS)) return true;
  const built = fs.statSync(NAV_JS).mtimeMs;
  return [NAV_TS, CORE_JS].some((p) => fs.existsSync(p) && fs.statSync(p).mtimeMs > built);
}

if (stale()) {
  console.log('→ 编译产物缺失或已过期，先运行一次 tsc');
  const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  const res = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) {
    console.error('✗ 编译失败，无法审计');
    process.exit(1);
  }
}

const nav = await import(pathToFileURL(NAV_JS).href);
const core = await import(pathToFileURL(CORE_JS).href);
// simulator 走源码：它对 core 的运行时导入是相对路径（§5.5.6），所以能直接跑
const sim = await import(pathToFileURL(SIM_TS).href);

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

const webIds = nav.DOG_ANCHOR_SPECS.map((a) => a.id);
const coreIds = [...core.DOG_ANCHOR_IDS];
const simIds = sim.SIM_DOG_ANCHORS.map((a) => a.id);

console.log('→ 审计锚点契约（core / simulator / web 三张表）\n');
console.log(`  core ${coreIds.length} · simulator ${simIds.length} · web ${webIds.length}\n`);

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const diff = (a, b) => `只在 A: [${a.filter((x) => !b.includes(x)).join(',')}] 只在 B: [${b.filter((x) => !a.includes(x)).join(',')}]`;

check('core 与 simulator 的锚点 id 逐字且同序', sameList(coreIds, simIds), diff(coreIds, simIds));
check('core 与 web 的锚点 id 逐字且同序', sameList(coreIds, webIds), diff(coreIds, webIds));
check('锚点 id 无重复', new Set(webIds).size === webIds.length);

// capabilities：web 侧声明的能力必须与 core 一致（行为层按能力筛目的地，不一致会挑到走不到的地方）
//
// ⚠️ 这里**必须如实报告"跳过"而不是打勾**：core 的能力表是 `readonly string[]`（刻意放宽，
// 见 `DogAnchorSpec` 的注释），并没有导出一份可按锚点查的映射表。查不到就说明这条断言
// 这一轮**没有真的验过**——把跳过写成 ✓ 是假证据。
{
  const coreCaps = core.DOG_ANCHOR_CAPABILITIES;
  if (!coreCaps) {
    console.log('  ⊘ 跳过：core 未导出按锚点查的能力表（能力一致性目前只由 core 单测钉住）');
  } else {
    const mismatched = [];
    for (const spec of nav.DOG_ANCHOR_SPECS) {
      const want = coreCaps[spec.id];
      if (!want) continue;
      const got = new Set(spec.capabilities);
      if (want.length !== got.size || want.some((c) => !got.has(c))) {
        mismatched.push(`${spec.id}: core=[${want.join(',')}] web=[${[...spec.capabilities].join(',')}]`);
      }
    }
    check('web 声明的 capabilities 与 core 一致', mismatched.length === 0, mismatched.join(' · '));
  }
}

// 锚点 → 导航节点：每个锚点都要有映射，且映射到的节点必须真的存在
{
  const mapped = new Set(Object.keys(nav.ANCHOR_NODES));
  const unmapped = webIds.filter((id) => !mapped.has(id));
  check(`每个锚点都映射到了导航节点`, unmapped.length === 0, unmapped.join(','));

  const nodes = new Set(nav.NAV_NODES.map((n) => n.id));
  const dangling = [];
  for (const [anchor, list] of Object.entries(nav.ANCHOR_NODES)) {
    for (const n of list) if (!nodes.has(n)) dangling.push(`${anchor}→${n}`);
  }
  check('锚点映射没有指向不存在的导航节点', dangling.length === 0, dangling.join(','));

  const emptyList = Object.entries(nav.ANCHOR_NODES)
    .filter(([, list]) => list.length === 0)
    .map(([k]) => k);
  check('没有锚点映射到空列表', emptyList.length === 0, emptyList.join(','));
}

// 用户点名的院子互动锚点：不许在后续改动里被静默删掉
{
  const needed = ['yard-pond', 'yard-lawn-center', 'yard-lawn-west', 'yard-lawn-east', 'yard-shade', 'yard-dig'];
  const missing = needed.filter((id) => !webIds.includes(id));
  check('院子互动锚点齐全（玩水/打滚/刨地/晒太阳）', missing.length === 0, missing.join(','));
  const pond = nav.DOG_ANCHOR_SPECS.find((a) => a.id === 'yard-pond');
  check(
    '`yard-pond` 具备 water 能力且指向池边节点',
    Boolean(pond?.capabilities.includes('water')) && (nav.ANCHOR_NODES['yard-pond'] ?? []).includes('pond-edge'),
    `capabilities=[${pond?.capabilities.join(',')}] nodes=[${(nav.ANCHOR_NODES['yard-pond'] ?? []).join(',')}]`,
  );
}

if (failures.length > 0) {
  console.error(`\n✗ 锚点契约审计未通过：${failures.length} / ${checks} 项失败`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`\n✓ 锚点契约审计全部通过（${checks} 项）`);
