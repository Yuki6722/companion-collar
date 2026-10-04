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


// ---------------------------------------------------------------- 生理读数

/** 项圈的三个生理通道。刻意只有这三个：血压需要阻断动脉，项圈形态下物理不成立。 */
export type VitalKey = 'hr' | 'rr' | 'temp';

/**
 * 一次读数的**有效性**。这不是精度分级，而是「这次到底有没有测到」。
 *
 * 为什么必须有它：项圈在猫跑动、翻身、蹭家具时照样会吐出一个数字，
 * 而那个数字与生理量无关。把「坏值 + 原因」保留成一等数据，
 * 界面才能把不可用的读数**划线展示**，而不是假装它不存在、也不是把它当读数用。
 */
export type ReadingValidity =
  | 'valid'
  | 'motion-artifact'
  | 'poor-contact'
  | 'rejected-out-of-range';

/**
 * 测量条件。
 *
 * 为什么它不是可选标签而是核心字段：同一只猫的心率与呼吸频率，
 * 「睡眠 / 家中静息 / 活动 / 诊室」四个条件下的中位数可以相差一倍以上
 * （诊室实测心率 176±35 → 195 → 226 bpm；呼吸频率诊室中位 64 vs 家中静息 27 vs 午睡 20）。
 * 不按条件分层的基线对比，测出来的是**情境差异**，不是身体变化。
 */
export type MeasurementCondition = 'sleep' | 'resting' | 'active' | 'post-event' | 'clinic';

/** 单通道的读数质量。`score` 是接触/体动/灌注的综合质量，0–1。 */
export interface ReadingQuality {
  validity: ReadingValidity;
  score: number;
  /** 聚合窗口（秒）：该读数是多长时间的聚合值 */
  windowS: number;
}

// ---------------------------------------------------------------- 会话与采样

export interface Sample {
  /** 会话内相对秒数 */
  t: number;
  /** 心率**读数**（仅有效窗口写入；无效窗口请在 `readingQuality` 里说明原因） */
  hrBpm?: number;
  hrvRmssdMs?: number;
  /** 呼吸频率**读数** */
  rrBpm?: number;
  /**
   * 体表温**读数**（°C）。
   *
   * ⚠️ 这是项圈真正能测的那一项：贴颈热敏电阻读的是被毛表面温度。
   * 它与核心温**无相关**（Kendall τ ≈ −0.01），因此**不得**换算为核心温，
   * 核心温真值只存在于 `truth.vitals[].tempCoreC`（仿真才有）。
   */
  tempSurfaceC?: number;
  /** 各通道的有效性：无效时不要读对应的数值字段 */
  readingQuality?: Partial<Record<VitalKey, ReadingQuality>>;
  /** 该采样点在什么条件下取得。跨条件做基线对比会测出情境差异，不是身体变化。 */
  measurementCondition?: MeasurementCondition;
  /** 体动强度（0–1）。伪迹与拒答的驱动量，单独记便于断言。 */
  motionIndex?: number;
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
  /**
   * 生理状态（`@camp/core` 的 `PhysiologyStateId`）。
   *
   * 只在**非 idle** 时写入：常驻状态是绝大多数采样点，逐点写一个 `'idle'` 会让
   * 会话文件凭空多出一列无信息字段。缺省即 idle。
   *
   * ⚠️ 它是**仿真真值的一部分**（「此刻注入到哪一段」），不是对猫的判断；
   * 面对用户的文案只能说「当前处于哪一段动作」，不得写成任何状况名称。
   */
  physiologyState?: string;
  /**
   * 该采样点的机械频带能量（0–1）：8–15 Hz 抖动、1.5–3 Hz 躯干起伏。
   *
   * 为什么单独给出来而不只给 `motionIndex`：单看体动强度无法区分
   * 「高频抖动」与「低频用力」——而这两者恰恰是抽搐与呕吐在颈部最可分的特征。
   */
  tremorPower?: number;
  retchPower?: number;
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
  /**
   * 生理**真值**序列（拟生理值，只在仿真里存在）。
   *
   * 为什么与 `samples` 分开：`samples` 里放的是**设备读数**，
   * 这里放的是「如果有一台完美仪器会读到什么」。两者之间的差距
   * （运动伪迹、接触不良、情境偏移、体表温与核心温无关）正是本阶段要展示的东西。
   * 若把真值混进读数通道，任何"换算算法"都会在评估中表现完美——那是自证预言。
   */
  vitals?: Array<{
    t: number;
    hrTrueBpm: number;
    rrTrueBpm: number;
    /** 核心温真值（°C）。项圈**测不到**这一项 */
    tempCoreC: number;
    condition: MeasurementCondition;
  }>;
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
