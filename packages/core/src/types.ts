/**
 * 共享领域类型。
 *
 * 约定：**凡面向用户展示的参数值，都必须带 EvidenceTag**。
 * 这是「只宣称可证伪的事」这条纪律的类型层保障——没有证据标签的参数无法通过类型检查。
 */

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
