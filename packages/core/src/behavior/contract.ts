/**
 * 行为时间线的**契约层**：类型与规范，不含生成逻辑。
 *
 * 为什么契约要与生成器分开：
 *   `simulator` 生产时间线、`apps/web` 消费时间线，两边都要能只 import 类型而不拉进
 *   生成器的实现细节；而且锚点规范属于「接口」，生成器属于「算法」。
 *
 * 与房间坐标的关系（刻意的边界）：
 *   本文件**不含任何米制坐标**。房间坐标的权威来源是 `apps/web/src/scene/layout.ts`
 *   ——那里同时驱动 3D 物件摆放与居家资源清单，再加一份坐标必然漂移。
 *   因此这里只声明「锚点必须具备哪些能力」（地面/可跳上/可躲藏），
 *   坐标由 web 层在做 3D 映射时补上。行为引擎的移动时长因此是估算值，
 *   web 层拿到真实距离后会自行校正。
 */
import type { CatActivityId, CatAnchorCapability, CatIncidentKind, CatPosture } from './vocabulary.ts';

/**
 * 锚点能力（`floor` / `hide` / `food` / `vertical` …）声明在 `vocabulary.ts`，
 * 这里一并对外暴露，便于消费者只 import 契约层就拿到全部相关类型。
 */
export type { CatAnchorCapability } from './vocabulary.ts';

export interface CatAnchorSpec {
  id: string;
  label: string;
  capabilities: readonly CatAnchorCapability[];
  /**
   * 台面高度（米）。0 表示地面锚点。
   * 行为层**只**用它判断「要不要攀跳」，不用于任何数值宣称。
   */
  heightM: number;
}

/** 单个行为区间。`t` 与 `t + durS` 连续覆盖整个时间线，无空洞、无重叠。 */
export interface CatBehaviorSegment {
  /** 区间起点（会话内秒） */
  t: number;
  /** 区间时长（秒），恒 > 0 */
  durS: number;
  activity: CatActivityId;
  posture: CatPosture;
  /** 该区间发生的锚点（`locomoting` 表示**目的地**锚点） */
  anchorId: string;
  /**
   * 位移是否真的发生。
   *
   * 为什么需要这个字段：猫可能「想移动」但**没有可去的锚点**（例如锚点表为空、
   * 或所有候选都与当前位置相同）。此时区间仍然连续、姿势仍然贴地，
   * 但**空间上并没有移动**。消费方（寻路、自检）必须能区分这两种情况，
   * 否则会把「原地选了个移动行为」误读成「猫在走动」。
   */
  resolved?: boolean;
  /** 非空表示该区间处于突发演示覆盖之下 */
  incidentKind?: CatIncidentKind;
}

/**
 * 一次突发演示。
 *
 * `injected === true` 表示由调用方主动注入（仿真真值）；`false` 表示行为引擎按证据政策
 * 自行生成的极小概率事件（目前只有自然干呕）。把两者分开是为了让回归断言能判
 * 「注入的突发确实被还原」，而不必担心自然事件的干扰。
 */
export interface CatBehaviorIncident {
  t: number;
  durationS: number;
  kind: CatIncidentKind;
  injected: boolean;
}

export interface CatBehaviorTimeline {
  seed: number;
  durationS: number;
  /** 按 `t` 严格递增的区间序列 */
  segments: readonly CatBehaviorSegment[];
  incidents: readonly CatBehaviorIncident[];
  /** 逐活动累计时长（秒），用于断言与漂移基线 */
  budgetS: Partial<Record<CatActivityId, number>>;
  /** 展示倍率；1 = 真实时间，60 = 1 秒当 1 分钟。仅用于画面推进，不改变时间线本身 */
  timeScale: number;
}

/** 一次注入请求。同一时刻重复注入时只保留第一条。 */
export interface CatBehaviorIncidentRequest {
  atS: number;
  kind: CatIncidentKind;
}

export interface CatBehaviorInput {
  seed: number;
  /** 时间线长度（会话内秒） */
  durationS: number;
  timeScale?: number;
  /** 主动注入的突发演示（真值） */
  injectIncidents?: readonly CatBehaviorIncidentRequest[];
  /**
   * 离家窗口（会话内秒）。用于「主人不在场」的差异建模。
   * ⚠️ 注意：文献里只有**发声事件计数**有直接证据支持存在差异，
   * 活动量/抓挠/躲藏的方向都是假设（见 params.ts 的 `absent*Direction`）。
   */
  awayWindows?: readonly (readonly [number, number])[];
  /** 房间里的可用锚点。缺省时退化为单一地面锚点（行为仍然有效，只是不移动） */
  anchors?: readonly CatAnchorSpec[];
}

/** 会话起点所对应的当日时刻（小时）。与 `simulator` 的 `startedAt` 约定一致：09:00。 */
export const DAY_START_HOUR = 9;

/**
 * 会话内秒数 → 当日小时数。
 *
 * 为什么用固定映射而不是读系统时间：仿真与测试必须确定性；读真实时钟会让同一份
 * 种子在不同时刻产出不同时间线。演示要「看到一天」，靠的是 `timeScale` 而不是真时间。
 */
export function hourOfDayAt(tS: number): number {
  const hours = DAY_START_HOUR + tS / 3600;
  return ((hours % 24) + 24) % 24;
}
