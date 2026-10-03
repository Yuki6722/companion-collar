/**
 * 共享领域类型。
 *
 * 约定：**凡面向用户展示的参数值，都必须带 EvidenceTag**。
 * 这是「只宣称可证伪的事」这条纪律的类型层保障——没有证据标签的参数无法通过类型检查。
 */
import type {
  CatBehaviorIncident,
  CatBehaviorSegment,
  CatBehaviorTimeline,
} from './behavior/contract.ts';

// ---------------------------------------------------------------- 基础枚举

export type Species = 'dog' | 'cat';

export type SizeClass =
  | 'toy' | 'small' | 'medium' | 'large' | 'giant'
  | 'cat-small' | 'cat-standard' | 'cat-large';

export type AgeBand = 'junior' | 'adult' | 'senior' | 'geriatric';

/**
 * 证据等级。用于约束所有面向用户的数值与结论。
 * - strong      多项独立同行评审证据一致
 * - moderate    单项研究或权威综述汇总表
 * - weak        二手材料、教学讲义、厂商口径
 * - unverified  未能取得可靠来源——**不得展示具体数值**
 * - disputed    来源之间存在冲突——**必须展示为区间**
 */
export type Tier = 'strong' | 'moderate' | 'weak' | 'unverified' | 'disputed';

export interface EvidenceTag {
  tier: Tier;
  /** 可点击来源或文献题录 */
  source?: string;
  /** 面向用户的简短说明（为什么是这个等级） */
  note?: string;
  /** 冲突值必须给出区间 */
  range?: [number, number];
}

// ---------------------------------------------------------------- 宠物档案

export interface PetProfile {
  species: Species;
  breedId: string;
  weightKg: number;
  /** 肩高（厘米）。猫约 23–25，小型犬约 20–30，大型犬约 60–70 */
  heightCm: number;
  ageMonths: number;
}

export interface CollarBudget {
  /** 项圈重量上限（克）。经验值：体重 2%，标注为 weak */
  maxWeightG: number;
  strapMinMm: number;
  strapMaxMm: number;
}

/**
 * 由宠物档案推导出的感知参数。
 * 注意：这是**参数化可视化**的输入，不是宠物主观体验的复刻。
 */
export interface PerceptionProfile {
  /** 项圈相机离地高度（米） */
  cameraHeightM: number;
  horizontalFovDeg: number;
  binocularFovDeg: number;
  colorModel: 'dichromatic' | 'trichromatic';
  conePeaksNm: EvidenceTag & { value: [number, number] | null };
  flickerFusionHz: EvidenceTag & { value: number | null };
  hearingRangeHz: EvidenceTag & { value: [number, number] | null };
  olfactory: EvidenceTag;
  /** 老年/高龄追加的居家改造建议 */
  mobilityFlags: string[];
  collarBudget: CollarBudget;
  /** 每个字段的证据等级，便于 UI 统一渲染标签 */
  evidence: Record<string, Tier>;
}

// ---------------------------------------------------------------- 居家资源与五大支柱

export type PillarId =
  | 'safe-place'
  | 'separated-resources'
  | 'play-hunt'
  | 'predictable-interaction'
  | 'olfactory';

export interface HomeResources {
  litterBoxes: number;
  litterBoxLocations: number;
  foodStations: number;
  waterStations: number;
  sleepingSpots: number;
  scratchingSurfaces: number;
  hidingPlaces: number;
  verticalSpaces: number;
  /** 关键资源是否分散在 ≥2 个位置簇 */
  resourcesSeparated: boolean | null;
  nightLight: boolean | null;
  ramps: boolean | null;
}

export type GapStatus = 'ok' | 'gap' | 'unknown';

export interface PillarGap {
  pillar: PillarId;
  /** unknown 表示用户尚未回答——绝不默认合格 */
  status: GapStatus;
  requirement: string;
  actual: string;
  evidence: Tier;
  source?: string;
  /** 该条目是否为猫科框架的犬用类比改写 */
  adaptedForDog?: boolean;
}

// ---------------------------------------------------------------- 居家资源清单

/** 关键环境资源类别。与 AAFP/ISFM 指南的资源枚举一一对应。 */
export type HomeResourceKind =
  | 'litter'
  | 'food'
  | 'water'
  | 'sleep'
  | 'scratch'
  | 'hide'
  | 'vertical'
  | 'play';

/**
 * 房间里的一个资源点。
 *
 * 这份数据是**场景与清单的共同事实来源**：`apps/web` 用 `position` 摆 3D 物件，
 * `summarizeHomeResources()` 用同一份坐标判定「资源是否相互分离」。
 */
export interface HomeResourceItem {
  id: string;
  kind: HomeResourceKind;
  label: string;
  /** 米制平面坐标 */
  position: { x: number; z: number };
  /** 台面高度（米）。仅垂直空间/睡窝有意义，用于「能否俯瞰」。 */
  heightM?: number;
}

/** 一条可核查的检查项。`status: 'unknown'` 表示无法从现有信息判定，绝不等于合格。 */
export interface HomeResourceCheck {
  /** 沿用研究报告 science.json 的检查项编号（rs1…rs4、sp1…sp3、pl1/pl2、in1…in3、sm1…sm3） */
  id: string;
  pillar: PillarId;
  requirement: string;
  actual: string;
  status: GapStatus;
  evidence: Tier;
  source?: string;
  note?: string;
}

export interface HomeResourceSummary {
  cats: number;
  counts: Partial<Record<HomeResourceKind, number>>;
  checks: HomeResourceCheck[];
}


// ---------------------------------------------------------------- 会话与采样

export interface Sample {
  /** 会话内相对秒数 */
  t: number;
  hrBpm?: number;
  hrvRmssdMs?: number;
  rrBpm?: number;
  tempC?: number;
  activity?: number;
  posture?: string;
  vocalization?: number;
  noiseDbA?: number;
  ambientTempC?: number;
  humidityPct?: number;
  lightLux?: number;
  /**
   * 行为层给出的活动与锚点。仅当会话由仿真器生成且行为层开启时存在。
   * 有它，才能断言「抓挠事件一定落在抓挠段内」这类因果一致性。
   */
  activityId?: string;
  anchorId?: string;
}

export type SimEventKind =
  | 'scratch' | 'rub' | 'impact' | 'head-shake'
  | 'posture-change' | 'vocalization'
  | 'elimination-outside-box' | 'hiding';

/** 触觉**相关身体事件**——命名为事件，不命名为感受。 */
export interface SimEvent {
  t: number;
  kind: SimEventKind;
  magnitude: number;
  note?: string;
}

export interface Session {
  id: string;
  profile: PetProfile;
  source: 'simulator' | 'device';
  startedAt: number;
  samples: Sample[];
  events: SimEvent[];
  /** 仿真真值，仅 source === 'simulator' 时存在。用于验证分析层。 */
  truth?: SimTruth;
  /**
   * 行为时间线。仿真器生成、`apps/web` 消费（驱动猫的位移与姿势）。
   *
   * 与真值分开的理由：真值是「给验证用的答案」，时间线是「给渲染用的输入」；
   * 读者不同、生命周期也不同（截图上只需要时间线）。
   */
  behaviorTimeline?: CatBehaviorTimeline;
}

export interface SimTruth {
  /** 潜在舒适度曲线（0–1，1 为最舒适） */
  comfortCurve: Array<{ t: number; value: number }>;
  /** 注入的居家资源缺口 */
  injectedGaps: PillarId[];
  /** 各环境通道到生理信号的注入滞后（秒） */
  injectedLags: Record<string, number>;
  seed: number;
  scenario: string;
  /** 行为层真值：时间线本身 + 主动注入的突发（供回归断言） */
  behavior?: {
    seed: number;
    timeScale: number;
    segments: readonly CatBehaviorSegment[];
    incidents: readonly CatBehaviorIncident[];
    budgetS: Partial<Record<string, number>>;
  };
  /**
   * 主动注入的突发演示（仅 `injected === true` 的那些）。
   *
   * ⚠️ 这是仿真真值，不是对猫的判断。它用来断言「注入的突发被还原」，
   * 不构成任何「识别到异常」的宣称。
   */
  injectedIncidents?: CatBehaviorIncident[];
}

// ---------------------------------------------------------------- 设备抽象

export interface AdapterCapabilities {
  camera: boolean;
  hr: boolean;
  rr: boolean;
  temp: boolean;
  imu: boolean;
  audio: boolean;
}

/**
 * 设备适配器。当前只有仿真实现；真机（如 Dinbeat UNO 类多参数胸背带）按此接口接入。
 */
export interface DeviceAdapter {
  readonly id: string;
  readonly kind: 'simulator' | 'collar';
  readonly capabilities: AdapterCapabilities;
  start(onSample: (s: Sample) => void): Promise<void>;
  stop(): Promise<void>;
}
