/**
 * `@camp/core` 生理层：**状态 → 心率 / 呼吸 / 体动** 的注入规则与项圈可观测特征映射。
 *
 * 为什么单独一层、而不并进 `behavior/`：
 *   行为层描述「猫在做什么」（姿势、位移、动作），生理层描述「此刻心率与呼吸处于什么水平」。
 *   两者是**两条独立的轴**：同一段「趴着不动」既可能发生在发作后恢复期，也可能就是睡着。
 *   把生理参数塞进行为参数表，会让「姿势」和「读数」互相污染。
 *
 * ⚠️ 全层的边界与本项目的证据政策一致：
 *   - 所有取值都是**仿真注入真值**，供下游识别算法做回归断言；
 *   - 猫用项圈的心率与呼吸频率**未取得任何验证研究** → 只作真值，不作宣称；
 *   - 状态名是动作名，不是疾病名，也不构成任何诊断。
 */
export {
  COLLAR_SAMPLING,
  MOTION_ARTIFACT_UNUSABLE,
  PHYSIOLOGY_EPISODES,
  PHYSIOLOGY_EPISODE_KINDS,
  PHYSIOLOGY_STATE_IDS,
  coreTempDeltaAt,
  coreTempDeltaC,
  effectiveHeatingSeconds,
  episodeSpanS,
  episodesOfState,
  phaseAt,
  realSecondsAt,
} from './state.ts';
export type {
  CollarSamplingSpec,
  PhaseAt,
  PhysiologyEpisodeDef,
  PhysiologyEpisodeKind,
  PhysiologyPhaseDef,
  PhysiologyPhaseRamp,
  PhysiologyStateId,
  PhysiologyStateOps,
} from './state.ts';

import type { EvidenceTag, Tier } from '../types.ts';
import type { CatActivityId, IncidentMotion } from '../behavior/vocabulary.ts';
import { INCIDENT_DEFS } from '../behavior/vocabulary.ts';
import type {
  PhysiologyEpisodeKind,
  PhysiologyPhaseRamp,
  PhysiologyStateId,
  PhysiologyStateOps,
} from './state.ts';
import { MOTION_ARTIFACT_UNUSABLE, PHYSIOLOGY_EPISODES, coreTempDeltaAt, episodeSpanS } from './state.ts';

/** 某个突发对应的**动作配方**（单一事实来源是 `INCIDENT_DEFS`，这里只做映射）。 */
const EPISODE_MOTION_SOURCE: Readonly<Record<PhysiologyEpisodeKind, 'seizure' | 'vomit'>> = {
  seizure: 'seizure',
  vomiting: 'vomit',
};

/** 取某个突发的动作配方；用于把动画幅度折成识别算法看得见的频带能量。 */
export function episodeMotion(kind: PhysiologyEpisodeKind): IncidentMotion {
  return INCIDENT_DEFS[EPISODE_MOTION_SOURCE[kind]].motion;
}

/**
 * 该取值下读数在物理上是否还可能被采信。
 *
 * 判据只有一条：机械伪影是否已把传感器淹没（见 `MOTION_ARTIFACT_UNUSABLE`）。
 * **不是**「质量等级」——有效性由 `vitals/` 层按体动门限与接触状态判定。
 */
export function isReadingTrustworthy(ops: PhysiologyStateOps): boolean {
  return ops.motionArtifact < MOTION_ARTIFACT_UNUSABLE;
}

// ---------------------------------------------------------------- 基线

/**
 * 个体静息基线。
 *
 * ⚠️ 为什么只能给「基线」而不能给「正常范围」：猫的心率参考区间本身存在来源冲突
 * （静息表 120–140 vs 分诊表 150–220），而呼吸频率在诊室、家中静息、午睡三种条件下
 * 是三个显著不同的量（诊室中位 64 / 家中静息中位 27 / 午睡中位 20）。
 * 因此本模型一律输出**相对该猫自身基线的偏离**，绝不输出「是否正常」。
 */
export interface PhysiologyBaseline {
  /** 静息心率（次/分） */
  hrBpm: number;
  /** 静息心率变异性 RMSSD（毫秒） */
  hrvRmssdMs: number;
  /** 静息呼吸频率（次/分） */
  rrBpm: number;
}

// ---------------------------------------------------------------- 状态取值

const NEUTRAL: PhysiologyStateOps = {
  hrScale: 1,
  hrOffset: 0,
  hrvScale: 1,
  rrScale: 1,
  breathDepthScale: 1,
  respIrregularity: 0,
  motionArtifact: 0,
};

/**
 * 常驻状态（`idle`）的取值。
 *
 * `idle` 不是「恒定」——它随当前行为小幅波动。这里的数值是**操作化常量**：
 * 文献没有给出「猫在走动时心率比静息高多少」的一手值，取值的唯一目的是让
 * 「行为 ↔ 读数」之间存在可被断言的对应关系，不代表实测幅度。
 */
export const IDLE_STATE_OPS: PhysiologyStateOps = NEUTRAL;

/** 行为 → `idle` 状态下的生理取值。未登记的行为按 `resting` 处理。 */
const ACTIVITY_IDLE_OPS: Readonly<Record<CatActivityId, PhysiologyStateOps>> = {
  resting: { ...NEUTRAL, rrScale: 0.92, breathDepthScale: 0.95 },
  alert: { ...NEUTRAL, hrScale: 1.06, rrScale: 1.08, respIrregularity: 0.05, motionArtifact: 0.03 },
  grooming: { ...NEUTRAL, hrScale: 1.08, rrScale: 1.1, respIrregularity: 0.08, motionArtifact: 0.12 },
  locomoting: { ...NEUTRAL, hrScale: 1.25, rrScale: 1.45, breathDepthScale: 1.15, respIrregularity: 0.15, motionArtifact: 0.35 },
  playing: { ...NEUTRAL, hrScale: 1.5, rrScale: 1.9, breathDepthScale: 1.2, respIrregularity: 0.25, motionArtifact: 0.55 },
  feeding: { ...NEUTRAL, hrScale: 1.05, rrScale: 1.1, respIrregularity: 0.12, motionArtifact: 0.1 },
  drinking: { ...NEUTRAL, hrScale: 1.04, rrScale: 1.12, respIrregularity: 0.15, motionArtifact: 0.1 },
  eliminating: { ...NEUTRAL, hrScale: 1.12, rrScale: 1.2, respIrregularity: 0.2, motionArtifact: 0.18 },
  scratching: { ...NEUTRAL, hrScale: 1.35, rrScale: 1.5, breathDepthScale: 1.1, respIrregularity: 0.2, motionArtifact: 0.5 },
  hiding: { ...NEUTRAL, hrScale: 1.05, rrScale: 1.0, breathDepthScale: 0.9, respIrregularity: 0.06, motionArtifact: 0.02 },
  perching: { ...NEUTRAL, rrScale: 0.98, breathDepthScale: 0.98 },
  // 干呕状态的常驻取值取自呕吐突发的**干呕时相**，保证「自然发生的干呕」与
  // 「手动演示的呕吐」在读数上一致——否则两者会在同一份数据里互相矛盾。
  vomit: { ...NEUTRAL, hrScale: 1.18, hrOffset: 4, rrScale: 1.3, respIrregularity: 0.6, motionArtifact: 0.5 },
};

/** 取某个行为在 `idle` 状态下的生理取值。 */
export function idleOpsForActivity(activity: CatActivityId): PhysiologyStateOps {
  return ACTIVITY_IDLE_OPS[activity] ?? ACTIVITY_IDLE_OPS.resting;
}

// ---------------------------------------------------------------- 可观测特征

/**
 * 项圈可观测特征：**每一项都必须能由颈部项圈在物理上得到**。
 *
 * 这一层的用途是接住后续的识别算法与 App 通知：算法看得见的只有这些通道，
 * 看不见「发作」「疼痛」这类不可测量的构念。
 *
 * ⚠️ 全部取值都是仿真真值。没有被验证过的项圈测出过这些特征，
 * 因此这里的任何一项都**不构成对真实设备性能的宣称**。
 */
export type PhysiologyFeatureId =
  /** 心率（次/分） */
  | 'hrBpm'
  /** 心率相对自身静息基线的偏离比例（0.1 = 高 10%） */
  | 'hrRelative'
  /** 心率变异性 RMSSD（毫秒） */
  | 'hrvRmssdMs'
  /** 呼吸频率（次/分） */
  | 'rrBpm'
  /** 呼吸幅度相对基线（1 = 与基线相同） */
  | 'breathDepthRel'
  /** 呼吸节律紊乱度 0–1 */
  | 'respIrregularity'
  /** 颈部体动 0–1 */
  | 'motionArtifact'
  /** 8–15 Hz 频带抖动能量 0–1（抽搐的机械特征） */
  | 'tremorPower'
  /** 1.5–3 Hz 频带躯干起伏能量 0–1（干呕的机械特征） */
  | 'retchPower';

export const PHYSIOLOGY_FEATURE_IDS: readonly PhysiologyFeatureId[] = [
  'hrBpm',
  'hrRelative',
  'hrvRmssdMs',
  'rrBpm',
  'breathDepthRel',
  'respIrregularity',
  'motionArtifact',
  'tremorPower',
  'retchPower',
];

export type PhysiologyFeatureValues = Record<PhysiologyFeatureId, number>;

/**
 * ⚠️ 一个刻意的**不导出**：本层不定义自己的「读数质量」类型。
 *
 * 质量与有效性的单一事实来源是 `types.ts` 的 `ReadingQuality` + `ReadingValidity`
 * 与 `vitals/` 层的体动门限（`hrMotionGate` / `rrMotionGate`）。
 * 这里再定义一个同名类型，两套口径必然漂移——而本项目最不能容忍的就是
 * 「同一个窗口，一个模块说可用、另一个说不可用」。
 *
 * 本层只提供**驱动物理量**（`motionArtifact`）与**状态事实**（`readingTrustworthy`），
 * 由 `vitals/` 层把它们换算成有效性。
 */

/** 频带能量 → 0–1 特征。把机械动作折算成「下游算法看得见的那一列」。 */
function bandPower(amp: number, freqHz: number, loHz: number, hiHz: number, refAmp: number): number {
  if (!(amp > 0) || !(freqHz > 0)) return 0;
  const inside = freqHz >= loHz && freqHz <= hiHz;
  if (!inside) return 0;
  return Math.min(1, amp / refAmp);
}

/** 抽搐抖动能量：抖幅 0.038 m 时饱和。操作化常量。 */
const TREMOR_REF_AMP_M = 0.038;
/** 干呕起伏能量：起伏 0.02 m 时饱和。操作化常量。 */
const RETCH_REF_AMP_M = 0.02;

/**
 * 由**突发动作配方**（`IncidentMotion`）推出机械类特征。
 *
 * 为什么不在这里写死数字：抖动幅度与频率的单一事实来源是 `INCIDENT_DEFS[*].motion`
 * ——那里已经为「画面上看得出抽搐」调好了幅度。在这里再抄一份，两边必然漂移。
 * 因此本函数只做**换标**：把动画幅度折成识别算法看得见的频带能量。
 *
 * ⚠️ 结论必须如实说：抽搐（约 11 Hz）与干呕（约 2.2 Hz）能被分开，
 * **是这套仿真参数的设计性质，不是对真实猫的检出能力**。
 * 真实可分辨性未知，需要真机数据验证。
 */
export function featureBandsFromMotion(motion: IncidentMotion): { tremorPower: number; retchPower: number } {
  return {
    tremorPower: bandPower(motion.tremorAmp, motion.tremorFreq, 8, 15, TREMOR_REF_AMP_M),
    retchPower: bandPower(motion.tremorAmp, motion.tremorFreq, 1.5, 3, RETCH_REF_AMP_M),
  };
}

// ---------------------------------------------------------------- 求值

export interface PhysiologyAt {
  /** 跨包一致的时刻（会话内秒） */
  t: number;
  state: PhysiologyStateId;
  /** 正在发生的突发；`null` 表示常驻状态 */
  episode: PhysiologyEpisodeKind | null;
  /** 突发内已过的演示秒数；无突发时为 0 */
  episodeElapsedS: number;
  /** 本次突发是否由调用方主动注入（真值） */
  injected: boolean;
  /**
   * 该状态下生理读数在**物理上**是否还可能被采信。
   *
   * ⚠️ 它不是「读数质量」本身：质量由 `vitals/` 层按体动门限与接触状态判定。
   * 这里说的是「这段动作有多大的机械能量去污染传感器」，是给后者的**输入**。
   */
  readingTrustworthy: boolean;
  /** 相对基线的取值（倍率与偏移），供仿真与 UI 解释偏离来源 */
  ops: PhysiologyStateOps;
}

export interface PhysiologyPrediction {
  at: PhysiologyAt;
  features: PhysiologyFeatureValues;
}

/**
 * 求某一时刻的生理状态与项圈可观测特征。
 *
 * 三条工程纪律：
 *   1. **确定性**：给定同样的输入必然得到同样的输出，不读系统时间、不用随机数。
 *   2. **连续**：恢复期的取值向突发结束时的目标线性衰减，因此读数不会在突发结束的
 *      那一刻「跳回」基线——跳变本身就是最容易被下游误读成一次新事件的形态。
 *   3. **无突发时退化为常驻状态**：`idle` 的取值由当前行为给出，而不是恒定基线。
 */
export function predictPhysiologyAt(
  input: {
    /** 会话内秒数；仅用于回填到输出的 `at.t` */
    t?: number;
    /** 基线心率（次/分） */
    hrBpm: number;
    /** 基线 HRV RMSSD（毫秒） */
    hrvRmssdMs: number;
    /** 基线呼吸频率（次/分） */
    rrBpm: number;
    activity?: CatActivityId;
    episode?: PhysiologyEpisodeKind | null;
    /** 突发内已过秒数（演示时间轴） */
    episodeElapsedS?: number;
    /** 突发总时长（演示时间轴）。缺省取该突发的时相总和 */
    episodeDurationS?: number;
    injected?: boolean;
    /** 突发动作配方；给定时会输出 8–15 Hz / 1.5–3 Hz 频带能量 */
    motion?: IncidentMotion | null;
    /** 严重度 0–1：把时相窗口按比例收缩。默认 1；用于「只演示前驱」这类回归构造 */
    severity?: number;
  },
  realTime = false,
): PhysiologyPrediction {
  const baseInput = {
    hrBpm: input.hrBpm,
    hrvRmssdMs: input.hrvRmssdMs,
    rrBpm: input.rrBpm,
  };
  const t = input.t ?? 0;
  const bands = input.motion
    ? featureBandsFromMotion(input.motion)
    : { tremorPower: 0, retchPower: 0 };

  if (!input.episode) {
    const ops = idleOpsForActivity(input.activity ?? 'resting');
    return {
      at: {
        t,
        state: 'idle',
        episode: null,
        episodeElapsedS: 0,
        injected: false,
        readingTrustworthy: isReadingTrustworthy(ops),
        ops,
      },
      features: toFeatures(baseInput, ops, bands),
    };
  }

  const def = PHYSIOLOGY_EPISODES[input.episode];
  const severity = clamp01(input.severity ?? 1);
  const episodeDurationS = input.episodeDurationS ?? episodeSpanS(input.episode, realTime);
  const elapsed = Math.max(0, Math.min(episodeDurationS, input.episodeElapsedS ?? 0));
  const resolved = rampToStateOps(def, elapsed, realTime, severity);
  return {
    at: {
      t,
      state: resolved.state,
      episode: input.episode,
      episodeElapsedS: elapsed,
      injected: input.injected ?? false,
      readingTrustworthy: isReadingTrustworthy(resolved.ops),
      ops: resolved.ops,
    },
    features: toFeatures(baseInput, resolved.ops, bands),
  };
}

/** 把「基线 × 倍率 + 偏移」落到各通道上。 */
function toFeatures(
  base: { hrBpm: number; hrvRmssdMs: number; rrBpm: number },
  ops: PhysiologyStateOps,
  bands: { tremorPower: number; retchPower: number },
): PhysiologyFeatureValues {
  const hrBpm = Math.max(1, base.hrBpm * ops.hrScale + ops.hrOffset);
  return {
    hrBpm: round2(hrBpm),
    hrRelative: round3(ops.hrScale + ops.hrOffset / Math.max(1, base.hrBpm) - 1),
    hrvRmssdMs: round2(Math.max(1, base.hrvRmssdMs * ops.hrvScale)),
    rrBpm: round2(Math.max(1, base.rrBpm * ops.rrScale)),
    breathDepthRel: round3(ops.breathDepthScale),
    respIrregularity: round3(ops.respIrregularity),
    motionArtifact: round3(ops.motionArtifact),
    tremorPower: round3(bands.tremorPower),
    retchPower: round3(bands.retchPower),
  };
}

/**
 * 累加时相斜坡：求某时刻的通道取值。
 *
 * 实现要点（这一层唯一有点绕的地方）：
 *   每个时相从「上一个时相结束时的取值」线性走到本时相的登记值；
 *   **某时相没有定义某个通道时就沿用上一个定义了它的时相**——
 *   于是「前驱只抬心率、不动呼吸」这种描述可以只填需要的字段。
 *
 * 为什么必须逐时相插值、而不是直接跳到登记值：恢复期要能落在中间值上。
 * 若整段直接取终值，一次 15 秒的演示里「发作后心率仍偏高」这段就不存在了，
 * 而**那正是唯一可被采信的偏离**。
 */
function rampToStateOps(
  def: (typeof PHYSIOLOGY_EPISODES)[PhysiologyEpisodeKind],
  elapsedS: number,
  realTime: boolean,
  severity: number,
): { state: PhysiologyStateId; ops: PhysiologyStateOps } {
  const phases = realTime ? def.realPhases : def.phases;
  const total = phases.length;
  const take = Math.max(1, Math.round(total * clamp01(severity)));
  /** 已走过的时相里**登记过**的通道取值；未登记的通道由 `NEUTRAL` 兜底。 */
  const prev: Partial<PhysiologyStateOps> = {};
  /**
   * 走过了多少**被采信**的时相时长。
   *
   * ⚠️ 这里踩过一次坑：最初用「当前时相在**全部**时相里的累计起点」去累加，
   * 于是最后一个时相（恢复期）被截断到**第一段**的结束时间——
   * 一段演示里恢复期只剩 2 秒，「发作后仍偏高」这段信号几乎消失。
   * 现在只有真正走过的时相才推进 `acc`，因此斜坡落在正确的窗口里。
   */
  let acc = 0;

  for (let i = 0; i < take; i++) {
    const phase = phases[i] as (typeof phases)[number];
    // ⚠️ 第二个坑（更隐蔽）：**不要把 `phase.ops` 直接并进 `prev`**。
    // `ops` 对象自己带着 `durationS` 字段，一旦并进去就会盖掉下一段的真实时长，
    // 于是每个时相的边界整体错位（实测：第一段吃掉了第二段的整段时长）。
    // 因此这里逐字段取值，`prev` 里只允许出现生理通道。
    const defined = definedOps(phase.ops);
    const dur = Math.max(0.0005, phase.ops.durationS);
    const end = acc + dur;
    if (elapsedS >= end && i < take - 1) {
      Object.assign(prev, defined);
      acc = end;
      continue;
    }
    // 起点 = 之前所有时相已登记的取值（未登记的通道用中性值）
    const start: PhysiologyStateOps = { ...NEUTRAL, ...prev };
    const target: PhysiologyStateOps = { ...start, ...defined };
    const u = Math.min(1, Math.max(0, (elapsedS - acc) / dur));
    return { state: phase.id, ops: lerpOps(start, target, u) };
  }

  const last = phases[take - 1] as (typeof phases)[number];
  return { state: last.id, ops: { ...NEUTRAL, ...prev } };
}

/** 只取 `ops` 里**登记过**的生理通道，丢掉 `durationS`。 */
function definedOps(ramp: PhysiologyPhaseRamp): Partial<PhysiologyStateOps> {
  const out: Partial<PhysiologyStateOps> = {};
  if (ramp.hrScale !== undefined) out.hrScale = ramp.hrScale;
  if (ramp.hrOffset !== undefined) out.hrOffset = ramp.hrOffset;
  if (ramp.hrvScale !== undefined) out.hrvScale = ramp.hrvScale;
  if (ramp.rrScale !== undefined) out.rrScale = ramp.rrScale;
  if (ramp.breathDepthScale !== undefined) out.breathDepthScale = ramp.breathDepthScale;
  if (ramp.respIrregularity !== undefined) out.respIrregularity = ramp.respIrregularity;
  if (ramp.motionArtifact !== undefined) out.motionArtifact = ramp.motionArtifact;
  return out;
}

function lerpOps(a: PhysiologyStateOps, b: PhysiologyStateOps, u: number): PhysiologyStateOps {
  return {
    hrScale: lerp(a.hrScale, b.hrScale, u),
    hrOffset: lerp(a.hrOffset, b.hrOffset, u),
    hrvScale: lerp(a.hrvScale, b.hrvScale, u),
    rrScale: lerp(a.rrScale, b.rrScale, u),
    breathDepthScale: lerp(a.breathDepthScale, b.breathDepthScale, u),
    respIrregularity: lerp(a.respIrregularity, b.respIrregularity, u),
    motionArtifact: lerp(a.motionArtifact, b.motionArtifact, u),
  };
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ---------------------------------------------------------------- 曲线

export interface PhysiologyTrace {
  kind: PhysiologyEpisodeKind;
  /** 是否按真实时长（而不是压缩后的演示时长）采样 */
  realTime: boolean;
  /** 这一条曲线代表的时长上限（秒） */
  durationS: number;
  baseline: PhysiologyBaseline;
  stepS: number;
  samples: ReadonlyArray<{
    t: number;
    state: PhysiologyStateId;
    /** 该时刻读数在物理上是否还可能被采信（质量由 `vitals/` 层按体动门限判定） */
    readingTrustworthy: boolean;
    hrBpm: number;
    hrvRmssdMs: number;
    rrBpm: number;
    breathDepthRel: number;
    respIrregularity: number;
    motionArtifact: number;
    tremorPower: number;
    retchPower: number;
    /**
     * 核心温的偏离（°C）。**按真实时长计算**，因此在压缩后的演示时长里几乎为 0。
     *
     * 为什么不能是可观测量：发热比体动慢几个数量级，15 秒的演示里它本来就不该动。
     * 若让它跟着演示时长走，会伪造出「抽搐 15 秒体温升 0.8 °C」这种不存在的事实。
     */
    tempDeltaC: number;
  }>;
}

/**
 * 生成一条完整曲线。
 *
 * 这才是「便于之后项圈识别」的实际交付物：App 的指标图、通知阈值推导、
 * 识别算法的回归夹具，全都吃这一份输出。**它由已知真值生成**，
 * 因此下游算法可以断言「我有没有把这段还原出来」。
 *
 * 频带能量默认取该突发的动作配方（单一事实来源是 `INCIDENT_DEFS`），
 * 调用方不必自己去找它——漏给就会静默地得到一条全 0 的抖动能量。
 */
export function buildPhysiologyTrace(
  kind: PhysiologyEpisodeKind,
  baseline: PhysiologyBaseline,
  options: {
    realTime?: boolean;
    stepS?: number;
    durationS?: number;
    severity?: number;
    /** 缺省取 `episodeMotion(kind)`；显式传 `null` 表示「不注入机械动作」 */
    motion?: IncidentMotion | null;
  } = {},
): PhysiologyTrace {
  const realTime = options.realTime ?? false;
  const stepS = options.stepS ?? 1;
  const span = episodeSpanS(kind, realTime);
  const durationS = options.durationS ?? span;
  const severity = options.severity ?? 1;
  const motion = options.motion === undefined ? episodeMotion(kind) : options.motion;
  const steps = Math.max(1, Math.ceil(durationS / stepS));
  const out: PhysiologyTrace['samples'][number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = Math.min(durationS, i * stepS);
    const p = predictPhysiologyAt(
      {
        ...baseline,
        t,
        episode: kind,
        episodeElapsedS: t,
        episodeDurationS: durationS,
        injected: true,
        motion,
        severity,
      },
      realTime,
    );
    out.push({
      t,
      state: p.at.state,
      readingTrustworthy: p.at.readingTrustworthy,
      hrBpm: p.features.hrBpm,
      hrvRmssdMs: p.features.hrvRmssdMs,
      rrBpm: p.features.rrBpm,
      breathDepthRel: p.features.breathDepthRel,
      respIrregularity: p.features.respIrregularity,
      motionArtifact: p.features.motionArtifact,
      tremorPower: p.features.tremorPower,
      retchPower: p.features.retchPower,
      tempDeltaC: coreTempDeltaAt(kind, t, realTime, severity),
    });
  }
  return { kind, realTime, durationS, baseline, stepS, samples: out };
}

// ---------------------------------------------------------------- 证据接口

/** 面向证据等级展示的紧急程度与说明。**只描述偏离，不判定正常与否。** */
export const PHYSIOLOGY_BOUNDARY_NOTE =
  '生理读数为仿真真值：猫用项圈的心率与呼吸频率未取得任何验证研究，因此以下读数只表示「相对这只猫自身基线的偏离」，不构成任何诊断，也不能用来判断它是否健康。';

export const PHYSIOLOGY_UNGATED_NOTE =
  '本段读数不可采信：全身运动造成的机械伪影会同时污染心率与呼吸通道。可被用上的偏离发生在动作前后，而不是动作当下。';

/**
 * 等级 → 一句话说明。UI 用它渲染证据徽标，避免各处自己拼字符串。
 */
export function physiologyEvidenceText(evidence: EvidenceTag): string {
  const tier: Tier = evidence.tier;
  const name: Record<Tier, string> = {
    strong: '强',
    moderate: '中',
    weak: '弱',
    unverified: '未取得可靠来源',
    disputed: '来源冲突',
  };
  const note = evidence.note ? ` —— ${evidence.note}` : '';
  const source = evidence.source ? `（${evidence.source}）` : '';
  return `${name[tier]}${source}${note}`;
}

// ---------------------------------------------------------------- 可判别性

/**
 * 两个状态在给定特征集上的差异清单。
 *
 * ⚠️ 这个函数的返回值**不是**「算法能不能分开它们」的证据。
 * 它说明的是：**这套仿真参数在设计上把哪些通道拉开了差距**。
 * 真实猫上是否可分未知，必须用真机数据验证——这一点写进函数名与文档，
 * 免得后来者把设计性质读成性能宣称。
 */
export function describeSeparability(
  a: PhysiologyFeatureValues,
  b: PhysiologyFeatureValues,
  opts: { minRelative?: number } = {},
): { feature: PhysiologyFeatureId; a: number; b: number; relativeDelta: number }[] {
  const minRelative = opts.minRelative ?? 0.25;
  const out: { feature: PhysiologyFeatureId; a: number; b: number; relativeDelta: number }[] = [];
  for (const id of PHYSIOLOGY_FEATURE_IDS) {
    const va = a[id];
    const vb = b[id];
    const denom = Math.max(Math.abs(va), Math.abs(vb), 1e-6);
    const rel = Math.abs(va - vb) / denom;
    if (rel >= minRelative) out.push({ feature: id, a: va, b: vb, relativeDelta: round3(rel) });
  }
  return out.sort((x, y) => y.relativeDelta - x.relativeDelta);
}
