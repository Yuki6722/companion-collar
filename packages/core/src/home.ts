/**
 * 居家资源清单：把「房间里的东西」折算成 AAFP/ISFM 五大支柱的可核查检查项。
 *
 * 为什么这件事属于 `core` 而不是 `apps/web`：
 *   1. 「环境舒适度」在专业上是**可核查的资源清单**，不是感受（见 docs/research/03）；
 *   2. 资源位置还在驱动 3D 场景的物件摆放，两边必须共用**同一份数据**，否则清单和房间会各说各话；
 *   3. 规则要能脱开浏览器单测（`packages/core/test/home.test.ts`）。
 * 因此这里**只放数据与规则，不放任何几何**；`apps/web/src/scene/layout.ts` 提供坐标。
 *
 * 措辞纪律：本模块只描述「资源够不够」，不描述宠物感受。缺数据一律 `unknown`，绝不默认合格。
 */
import type { GapStatus, HomeResourceKind, PillarId, Tier } from './types.ts';
import type { HomeResourceItem, HomeResourceSummary, HomeResourceCheck } from './types.ts';

export type { HomeResourceItem, HomeResourceSummary, HomeResourceCheck } from './types.ts';

// ---------------------------------------------------------------- 操作化常量

/**
 * 关键资源之间的最小间距（米）。
 *
 * ⚠️ **工程操作化常量，不是文献结论**：AAFP/ISFM 明确要求资源「多个且相互分离」，
 * 但没有给出米制阈值。我们取 1.5 m 作为可执行的判定线，据此把规则的证据等级
 * 标为 `moderate`（要求本身 strong，阈值 weak，故合并取中并在此写明）。
 */
export const RESOURCE_SEPARATION_MIN_M = 1.5;

/** 同一类资源算作「同一位置簇」的距离阈值（米）。同样是操作化常量。 */
export const RESOURCE_CLUSTER_MAX_M = 2;

/** 躲藏处离人流通道的最小距离（米）。操作化常量：指南只说「不在人流通道上」。 */
export const HIDE_OFF_PATH_MIN_M = 0.8;

/** 算作「可俯瞰的高处」的最小台面高度（米）。 */
export const PERCH_MIN_H_M = 0.9;

/** 来源：AAFP/ISFM 猫科环境需求指南（2013）五大支柱；AAFP 2021 老年猫照护指南沿用。 */
const SOURCE_PILLARS = 'AAFP/ISFM 2013 五大支柱（JFMS）；AAFP 2021 老年猫照护指南（PMC10812122）';

const NOTE_THRESHOLD = '指南要求「分离」，未给米制阈值；本项目用 1.5 m 作为可执行的操作化常量。';

// ---------------------------------------------------------------- 几何小工具

export interface Point2 {
  x: number;
  z: number;
}

function distance(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** 点到折线的最短距离；用于「躲藏处是否在人流通道上」。 */
export function distanceToPath(p: Point2, path: readonly Point2[]): number {
  if (path.length === 0) return Number.POSITIVE_INFINITY;
  if (path.length === 1) {
    const only = path[0];
    return only ? distance(p, only) : Number.POSITIVE_INFINITY;
  }
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b) continue;
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * vx), p.z - (a.z + t * vz)));
  }
  return best;
}

/** 单链接聚类：把彼此距离 ≤ threshold 的同类资源并成「位置簇」。 */
function countClusters(items: readonly HomeResourceItem[], threshold: number): number {
  if (items.length === 0) return 0;
  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== undefined && parent[root] !== root) root = parent[root] as number;
    return root;
  };
  const union = (i: number, j: number): void => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[b] = a;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a && b && distance(a.position, b.position) <= threshold) union(i, j);
    }
  }
  const roots = new Set<number>();
  for (let i = 0; i < items.length; i++) roots.add(find(i));
  return roots.size;
}

// ---------------------------------------------------------------- 主函数

export interface SummarizeOptions {
  /** 同住的猫数量。直接决定猫砂盆下限（猫数 + 1）。 */
  cats: number;
  /** 家中人流通道折线；给出后才能判定「躲藏处不在通道上」，否则该项为 unknown。 */
  trafficPath?: readonly Point2[];
}

function of(items: readonly HomeResourceItem[], kind: HomeResourceKind): HomeResourceItem[] {
  return items.filter((i) => i.kind === kind);
}

function check(
  id: string,
  pillar: PillarId,
  requirement: string,
  actual: string,
  ok: boolean | null,
  evidence: Tier,
  note?: string,
): HomeResourceCheck {
  const status: GapStatus = ok === null ? 'unknown' : ok ? 'ok' : 'gap';
  const out: HomeResourceCheck = {
    id,
    pillar,
    requirement,
    actual,
    status,
    evidence,
    source: SOURCE_PILLARS,
  };
  if (note) out.note = note;
  return out;
}

/**
 * 由房间内的资源清单推导检查项。
 *
 * 返回的 `checks` 里**包含无法从房间内容推出的项**（作息、清洁剂、互动方式等），
 * 它们的 `status` 固定为 `unknown` —— 这样 UI 不会因为「没这几项」而看起来全部合格。
 */
export function summarizeHomeResources(
  items: readonly HomeResourceItem[],
  opts: SummarizeOptions,
): HomeResourceSummary {
  const cats = Math.max(1, Math.floor(opts.cats));
  const litter = of(items, 'litter');
  const water = of(items, 'water');
  const food = of(items, 'food');
  const sleep = of(items, 'sleep');
  const scratch = of(items, 'scratch');
  const hide = of(items, 'hide');
  const perch = items.filter(
    (i) => (i.kind === 'vertical' || i.kind === 'sleep') && (i.heightM ?? 0) >= PERCH_MIN_H_M,
  );
  const play = of(items, 'play');

  const counts: Partial<Record<HomeResourceKind, number>> = {};
  for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1;

  const checks: HomeResourceCheck[] = [];

  // ② 多个且相互分离的关键资源
  const litterNeed = cats + 1;
  checks.push(
    check(
      'rs1',
      'separated-resources',
      `猫砂盆数量 = 猫的数量 + 1（${cats} 只猫 → 至少 ${litterNeed} 个）`,
      `房间里有 ${litter.length} 个猫砂盆`,
      litter.length >= litterNeed,
      'strong',
    ),
  );

  const waterToFood = minDistance(water, food);
  const foodToLitter = minDistance(food, litter);
  const waterToLitter = minDistance(water, litter);
  const separationOk =
    waterToFood !== null &&
    foodToLitter !== null &&
    waterToLitter !== null &&
    waterToFood >= RESOURCE_SEPARATION_MIN_M &&
    foodToLitter >= RESOURCE_SEPARATION_MIN_M &&
    waterToLitter >= RESOURCE_SEPARATION_MIN_M;
  checks.push(
    check(
      'rs2',
      'separated-resources',
      '食盆与饮水分开摆放，且都不在猫砂盆旁边',
      waterToFood === null
        ? '缺少食盆或饮水点，无法判定'
        : `食↔水 ${waterToFood.toFixed(1)} m；食↔最近砂盆 ${fmt(foodToLitter)}；水↔最近砂盆 ${fmt(waterToLitter)}`,
      waterToFood === null ? null : separationOk,
      'moderate',
      NOTE_THRESHOLD,
    ),
  );

  const sleepOk = sleep.length >= cats;
  const scratchOk = scratch.length >= cats;
  checks.push(
    check(
      'rs3',
      'separated-resources',
      `每只猫都有独立的睡窝与抓挠面（${cats} 只猫）`,
      `睡窝 ${sleep.length} 处、抓挠面 ${scratch.length} 处`,
      sleepOk && scratchOk,
      'strong',
    ),
  );

  const clustered = (['litter', 'water', 'sleep', 'scratch', 'hide', 'vertical'] as const)
    .map((kind) => ({ kind, clusters: countClusters(of(items, kind), RESOURCE_CLUSTER_MAX_M) }))
    .filter((entry) => entry.clusters > 0);
  const concentrated = clustered.filter((entry) => entry.clusters < 2);
  checks.push(
    check(
      'rs4',
      'separated-resources',
      '同一类资源分散在房子里多个位置，而不是集中在一处',
      concentrated.length === 0
        ? `${clustered.length} 类资源都分布在 ≥2 个位置簇`
        : `集中在单处的资源：${concentrated.map((c) => `${labelOfKind(c.kind)}(${c.clusters} 簇)`).join('、')}`,
      concentrated.length === 0,
      'moderate',
      `位置簇阈值 ${RESOURCE_CLUSTER_MAX_M} m 为操作化常量。`,
    ),
  );

  // ① 一个安全的地方
  checks.push(
    check(
      'sp1',
      'safe-place',
      '家里有至少一处猫可以独处躲藏的封闭空间',
      hide.length > 0 ? `躲藏处 ${hide.length} 处：${hide.map((h) => h.label).join('、')}` : '没有发现封闭躲藏处',
      hide.length > 0,
      'strong',
    ),
  );

  if (opts.trafficPath && opts.trafficPath.length > 0) {
    const path = opts.trafficPath;
    const closest = hide
      .map((h) => ({ label: h.label, d: distanceToPath(h.position, path) }))
      .sort((a, b) => a.d - b.d)[0];
    checks.push(
      check(
        'sp2',
        'safe-place',
        '躲藏处不在人流通道上，不会被频繁打扰',
        closest ? `最近的躲藏处距通道 ${closest.d.toFixed(1)} m（${closest.label}）` : '没有发现躲藏处',
        hide.length === 0 ? false : (closest?.d ?? 0) >= HIDE_OFF_PATH_MIN_M,
        'moderate',
        `通道距离阈值 ${HIDE_OFF_PATH_MIN_M} m 为操作化常量；指南只要求「不在人流通道上」。`,
      ),
    );
  } else {
    checks.push(
      check('sp2', 'safe-place', '躲藏处不在人流通道上，不会被频繁打扰', '未提供人流通道，无法判定', null, 'moderate'),
    );
  }

  checks.push(
    check(
      'sp3',
      'safe-place',
      `有一处高处可以俯瞰房间（≥ ${PERCH_MIN_H_M} m）`,
      perch.length > 0
        ? `可俯瞰的高处 ${perch.length} 处，最高 ${Math.max(...perch.map((p) => p.heightM ?? 0)).toFixed(2)} m`
        : '没有发现可俯瞰的高处',
      perch.length > 0,
      'strong',
    ),
  );

  // ③ 玩耍与捕猎机会（仅房间内容可判定的部分）
  checks.push(
    check(
      'pl2',
      'play-hunt',
      '有可以独自玩的玩具',
      play.length > 0 ? `可见玩具 ${play.length} 件` : '没有发现玩具',
      play.length > 0,
      'moderate',
    ),
  );
  checks.push(
    check('pl1', 'play-hunt', '每天有固定的互动玩耍时间', '取决于你的日常安排，房间看不出来', null, 'strong'),
  );

  // ④ 互动方式：全部依赖用户确认，房间内容推不出
  checks.push(check('in1', 'predictable-interaction', '喂食、玩耍、清洁时间相对固定', '取决于你的日常安排', null, 'strong'));
  checks.push(check('in2', 'predictable-interaction', '猫想结束互动时就让它走', '取决于你的互动方式', null, 'strong'));
  checks.push(check('in3', 'predictable-interaction', '不使用惩罚性的方式管教', '取决于你的互动方式', null, 'strong'));

  // ⑤ 嗅觉环境：同样依赖用户确认
  checks.push(check('sm1', 'olfactory', '资源定期清洁，但不用浓香型清洁剂', '取决于你的清洁习惯', null, 'moderate'));
  checks.push(check('sm2', 'olfactory', '家里没有持续的强烈香氛或精油扩散', '需要你确认', null, 'moderate'));
  checks.push(
    check(
      'sm3',
      'olfactory',
      '猫的抓挠痕迹不被立刻清除（那是它的气味标记）',
      scratch.length > 0 ? '房间里有抓挠面；痕迹是否保留取决于你' : '没有发现抓挠面',
      null,
      'moderate',
    ),
  );

  return { cats, counts, checks };
}

function minDistance(a: readonly HomeResourceItem[], b: readonly HomeResourceItem[]): number | null {
  let best: number | null = null;
  for (const x of a) {
    for (const y of b) {
      const d = distance(x.position, y.position);
      if (best === null || d < best) best = d;
    }
  }
  return best;
}

function fmt(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1)} m`;
}

function labelOfKind(kind: HomeResourceKind): string {
  const map: Record<HomeResourceKind, string> = {
    litter: '猫砂盆',
    food: '食盆',
    water: '饮水点',
    sleep: '睡窝',
    scratch: '抓挠面',
    hide: '躲藏处',
    vertical: '垂直空间',
    play: '玩具',
  };
  return map[kind];
}

/** 供 UI 分组用的支柱标题。 */
export const PILLAR_LABELS: Readonly<Record<PillarId, string>> = {
  'safe-place': '① 一个安全的地方',
  'separated-resources': '② 多个且相互分离的关键资源',
  'play-hunt': '③ 玩耍与捕猎行为的机会',
  'predictable-interaction': '④ 积极、一致且可预测的人宠互动',
  olfactory: '⑤ 尊重嗅觉的环境',
};
