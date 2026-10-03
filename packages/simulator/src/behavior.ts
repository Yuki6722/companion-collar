/**
 * 行为层与仿真会话的接缝。
 *
 * 为什么把「锚点表」放在模拟器里而不是 core：
 *   `@camp/core` 的行为层刻意不含任何米制坐标（房间坐标的权威来源是
 *   `apps/web/src/scene/layout.ts`，它同时驱动 3D 摆放与居家资源清单）。
 *   但仿真器在 Node 里跑、拿不到 web 层的 layout，因此这里给出一份
 *   **与 layout 同构的最小锚点清单**：只声明「有哪些锚点、高度多少、具备什么能力」，
 *   用于让时间线里出现真实的位移与攀跳。
 *
 *   ⚠️ 锚点的 `id` 是跨包契约，单一事实来源是 core 的 `CAT_ANCHOR_IDS`：
 *   本表与 `apps/web/src/scene/cat/anchor-map.ts` 都按它取 id，
 *   core 单测会断言两张表的 id 集合与之一致。
 */
import { buildBehaviorTimeline } from '../../core/src/index.ts';
import type { CatAnchorSpec, CatBehaviorTimeline, CatIncidentKind } from '../../core/src/index.ts';

/**
 * 与 `apps/web/src/scene/layout.ts` 的猫用品坐标对应的锚点。
 *
 * 高度取「猫站上去的台面高度」；地面锚点高度 0。
 * 这里**不写坐标**——仿真只需要高度差来决定「走还是跳」；
 * 真实米制坐标由 web 层的 `anchor-map.ts` 提供（它直接读 `layout.ts`）。
 */
export const SIM_CAT_ANCHORS: readonly CatAnchorSpec[] = [
  { id: 'floor-living', label: '起居区地面', capabilities: ['floor', 'jump-target'], heightM: 0 },
  { id: 'floor-bedroom', label: '睡眠区地面', capabilities: ['floor', 'jump-target'], heightM: 0 },
  { id: 'floor-kitchen', label: '厨房区地面', capabilities: ['floor', 'jump-target'], heightM: 0 },
  { id: 'tree-platform', label: '猫爬架一层平台', capabilities: ['jump-target', 'vertical'], heightM: 0.72 },
  { id: 'tree-top', label: '猫爬架顶台', capabilities: ['vertical', 'sleep', 'jump-target'], heightM: 1.45 },
  { id: 'cat-shelf-low', label: '墙面跳台（低）', capabilities: ['vertical'], heightM: 1.25 },
  { id: 'cat-shelf-high', label: '墙面跳台（高）', capabilities: ['vertical'], heightM: 1.65 },
  { id: 'wardrobe-top', label: '衣柜顶', capabilities: ['vertical'], heightM: 2.4 },
  { id: 'bed-top', label: '床面', capabilities: ['sleep', 'jump-target'], heightM: 0.56 },
  { id: 'sofa-top', label: '沙发面', capabilities: ['sleep', 'jump-target'], heightM: 0.42 },
  { id: 'cat-bed', label: '封闭式猫窝', capabilities: ['sleep', 'hide'], heightM: 0.07 },
  { id: 'hiding-box', label: '纸箱躲藏处', capabilities: ['hide'], heightM: 0.02 },
  { id: 'food-bowls', label: '食盆', capabilities: ['food'], heightM: 0.05 },
  { id: 'fountain', label: '饮水机', capabilities: ['water'], heightM: 0.16 },
  { id: 'water-bowl', label: '第二水碗', capabilities: ['water'], heightM: 0.06 },
  { id: 'litter-a', label: '猫砂盆 A', capabilities: ['litter'], heightM: 0.22 },
  { id: 'litter-b', label: '猫砂盆 B', capabilities: ['litter'], heightM: 0.22 },
];

export interface BehaviorLayerOptions {
  enabled?: boolean;
  seed?: number;
  timeScale?: number;
  awayWindows?: ReadonlyArray<readonly [number, number]>;
  anchors?: readonly CatAnchorSpec[];
  injectIncidents?: ReadonlyArray<{ atS: number; kind: CatIncidentKind }>;
}

/** 行为层默认倍率：1 秒当 1 分钟，让「一天」在 24 分钟的演示里走完。 */
export const DEFAULT_TIME_SCALE = 60;

/**
 * 为一次会话生成行为时间线。
 *
 * 与生理采样**共用同一个 `durationS`**，这样 `truth.injectedIncidents` 的时刻
 * 可以直接与 `samples` 对齐做方向断言。
 */
export function buildSessionBehavior(
  seed: number,
  durationS: number,
  options: Omit<BehaviorLayerOptions, 'enabled' | 'seed'> = {},
): CatBehaviorTimeline {
  return buildBehaviorTimeline({
    seed,
    durationS,
    timeScale: options.timeScale ?? DEFAULT_TIME_SCALE,
    awayWindows: options.awayWindows ?? [],
    anchors: options.anchors ?? SIM_CAT_ANCHORS,
    injectIncidents: options.injectIncidents ?? [],
  });
}

/**
 * 会话内秒 → 当日小时数。与 core 的 `hourOfDayAt` 同源，这里再导出一次是为了
 * 让仿真侧（例如「离家窗口落在哪几个小时」的报告）不必再 import 一次 core 内部路径。
 */
export { hourOfDayAt, DAY_START_HOUR } from '../../core/src/behavior/contract.ts';
