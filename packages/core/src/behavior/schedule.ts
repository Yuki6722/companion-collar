/**
 * 行为调度：决定「下一个行为是什么、做多久、要不要移动过去」。
 *
 * 设计约束（三条，都来自证据政策）：
 *   1. **片段时长不与任何文献数字绑定**。一手来源没有「家猫活动片段典型时长」，
 *      因此时长区间是 `OPERATIVE_CONSTANTS` 里的操作化常量，只保证「短促行为 + 长休息交替」这一结构。
 *   2. **抓挠/玩耍不产生的因果解释**。文献对「抓挠是否由应激驱动」有冲突（`disputed`），
 *      所以这里只按**时段**加权，不写「因为应激所以抓挠」。
 *   3. **进食/砂盆的时段是饲主作息的代理**，不是猫的内生节律——原研究 6/9 猫为定时喂食。
 */
import type { CatAnchorCapability, CatAnchorSpec } from './contract.ts';
import { OPERATIVE_CONSTANTS } from './params.ts';
import { activityWeightAt, isOwnerAwayHour } from './rhythm.ts';
import type { BehaviorRng } from './rng.ts';
import { ACTIVITY_IDS } from './vocabulary.ts';
import type { CatActivityId } from './vocabulary.ts';

function constantValue(id: string, fallback: number): number {
  return OPERATIVE_CONSTANTS.find((c) => c.id === id)?.value ?? fallback;
}

/** 取可用锚点：能力集合包含任一所需能力即可。 */
export function selectAnchor(
  anchors: readonly CatAnchorSpec[],
  capabilities: readonly CatAnchorCapability[],
  rng: BehaviorRng,
  avoidId?: string,
): CatAnchorSpec | undefined {
  if (anchors.length === 0) return undefined;
  const capable = anchors.filter((a) => capabilities.some((c) => a.capabilities.includes(c)));
  const pool = capable.length > 0 ? capable : anchors;
  const fresh = avoidId ? pool.filter((a) => a.id !== avoidId) : [];
  return rng.pick(fresh.length > 0 ? fresh : pool);
}

/**
 * 各行为在当前时刻的未归一化权重。
 *
 * 数值本身是操作化常量，**不是文献数字**；文献只能告诉我们方向性结论
 * （活动/跳跃随年龄下降、静息随年龄上升；进食与砂盆呈双峰）。
 */
export function activityWeights(
  hour: number,
  away: boolean,
  rng: BehaviorRng,
): Array<{ id: CatActivityId; weight: number }> {
  const act = activityWeightAt(hour);
  const lull = 1 - act;

  const raw: Record<CatActivityId, number> = {
    // 静息与活动互为镜像；文献支持「活动量下降则静息上升」（Yamazaki 2020）
    resting: 0.35 + 1.15 * lull,
    // 静坐观察在中等活跃度时最高：太困就睡了，太活跃就在动
    alert: 0.55 - 0.5 * Math.abs(act - 0.45),
    // 理毛是休息之后出现的小片段（Eckstein & Hart 2000）
    grooming: 0.16 + 0.34 * lull,
    // 巡逻：只在活跃时段
    locomoting: 1.3 * act,
    playing: 0.85 * act * act,
    // 进食双峰落在约 04–08 / 16–20，与进食窗口对齐（Migny et al. 2026）
    feeding: 0.9 * (hour < 4 || hour > 22 ? 0.25 : 1) * (0.3 + act),
    drinking: 0.5,
    // 砂盆使用主要落在主人不活动或不在家时（约 04–08 / 20–24）
    eliminating: 0.7 * (away ? 1.6 : 0.8),
    scratching: 0.75,
    // 躲藏：文献里没有可靠的时长占比，因此权重刻意取低，只作为一次「退避」事件
    hiding: 0.16,
    // 高处停留：① 猫偏好高处，访客密集时更明显（Hirsch et al. 2025，猫咖人群，
    //   数值不可外推，只取方向性结论）；② 高台可能从窗台与鞋柜看到入户门方向
    perching: 0.55 + 0.7 * act,
    // 干呕不参与随机加权：它由突发注入或 engine 的极小概率分支产生（见 engine.ts）。
    // 放在这里并取 0，是为了让 Record 完整、避免将来新增活动时静默漏配权重。
    vomit: 0,
  };

  // 需要锚点的行为同样参与选择——「去哪」由引擎在选定后解析，这里不做过滤，
  // 否则吃/喝/用砂盆会永远排不到。
  return ACTIVITY_IDS.map((id) => {
    // 加一点确定性抖动，避免每次都在同一时刻选到同一个行为
    const jitter = 0.85 + 0.3 * rng.next();
    return { id, weight: Math.max(0, raw[id] * jitter) };
  });
}

/** 按权重选下一个行为，并避免原地重复。 */
export function chooseActivity(
  weights: ReadonlyArray<{ id: CatActivityId; weight: number }>,
  previousId: CatActivityId | null,
  rng: BehaviorRng,
): CatActivityId {
  const narrowed = weights.filter((w) => w.id !== previousId);
  const pool = narrowed.length > 0 ? narrowed : weights;
  const idx = rng.weightedIndex(pool.map((w) => w.weight));
  return pool[Math.min(idx, pool.length - 1)]?.id ?? 'resting';
}

/** 单次原地行为的时长（秒）。操作化常量，不代表真实片段时长分布。 */
export function activityDurationS(activity: CatActivityId, hour: number, rng: BehaviorRng): number {
  if (activity === 'hiding') {
    // 躲藏是一次「退避」，比普通小片段长，但不设成永久——否则演示里猫会消失很久
    return rng.range(4 * 60, 12 * 60);
  }
  if (activity === 'perching') {
    return rng.range(2 * 60, 20 * 60);
  }
  if (activity === 'resting') {
    const act = activityWeightAt(hour);
    // 夜里安静，休息片段明显拉长
    return rng.range(5 * 60, (18 + 34 * (1 - act)) * 60);
  }
  const lo = constantValue('stintRestS', 20);
  const hi = constantValue('stintActiveS', 180);
  return rng.range(lo, hi);
}

/** 两点之间的移动时长（秒）：水平距离 / 速度 + 攀跳附加。web 层会按真实几何再校正。 */
export function travelDurationS(
  from: CatAnchorSpec | undefined,
  to: CatAnchorSpec | undefined,
  rng: BehaviorRng,
): number {
  if (!from || !to) return rng.range(2, 5);
  const speed = constantValue('walkSpeedMps', 0.45);
  // 行为层不使用米制坐标，因此这里用一个稳定的伪距离：由锚点 id 派生，
  // 保证确定性且与顺序无关；web 层负责用真实坐标替代。
  const dx = Math.abs(hashId(from.id) - hashId(to.id)) % 40;
  const horizontal = 0.4 + dx * 0.18; // 0.4–7.4 m 量级
  const jumpGate = constantValue('jumpMinHeightM', 0.15);
  const climb = Math.abs((to.heightM ?? 0) - (from.heightM ?? 0)) > jumpGate;
  // 攀跳要比走路慢：蹬地 + 落地不稳，读数上也不是匀速
  const climbPenalty = climb ? 1.6 : 1;
  return (horizontal / speed) * climbPenalty * (0.9 + 0.2 * rng.next());
}

/** 由字符串 id 派生一个稳定整数；只用于伪距离，不用于任何展示。 */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000;
}

export { isOwnerAwayHour };
