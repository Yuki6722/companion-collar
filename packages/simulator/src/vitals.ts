/**
 * 生理读数的仿真器：**真值与读数分开生成**。
 *
 * 为什么这个文件是整个阶段的枢纽：
 *   只要仿真让"体表温 = 核心温 − 2.7"，任何"体表温换算核心温"的算法都会在评估里
 *   表现完美——那是自证预言，不是验证。因此这里有一条硬规矩：
 *
 *   **体表温的生成输入里没有核心温。** 它由环境温 + 被毛隔热 + 接触状态 + 自身慢漂决定。
 *   于是「两者无相关」是被**编码进模型**的结构（τ≈0 的结论），而不是留给仿真去发现的事实。
 *
 * 读数层再叠两种失效，它们都是真机上真实存在的：
 *   1. **运动伪迹**：体动超过门限时读数值不可用（呼吸通道的门限最严，因为颈部只有微弱的胸廓传导）；
 *   2. **情境偏移**：诊室环境下心率读数 ×1.35、呼吸读数 ×2.4，而**真值不变**。
 *   第 2 条是本阶段最想让人看到的一幕：读数在动，猫没变。
 *
 * ⚠️ 导入路径纪律：对 core 的**运行时**导入必须用相对路径（`AGENTS.md` §5.5.6）。
 */
import {
  vitalsConstantValue,
  type MeasurementCondition,
  type PhysiologyStateOps,
  type ReadingQuality,
  type ReadingValidity,
  type Sample,
  type SimTruth,
  type Species,
  type VitalKey,
} from '../../core/src/index.ts';
import { Rng } from './prng.ts';

export interface VitalsStepContext {
  /** 会话内秒 */
  t: number;
  /** 当日小时（0–24） */
  hourOfDay: number;
  /** 行为层当前活动 */
  activity: string;
  /** 当前突发（若有） */
  incidentKind: string | null;
  /** 是否处于「连续静息足够久」的睡眠段（由调用方按 sleepStintMinS 判定） */
  sleeping: boolean;
  /**
   * 距离上一次突发动作结束的秒数；从未发生过或仍在进行中时传 `Infinity`。
   * 用于划出「突发之后」的窗口——刚应激过的读数不该进睡眠/静息基线。
   */
  sinceIncidentEndS: number;
  /** 环境温度（°C），体表温的唯一外部输入之一 */
  ambientTempC: number;
  /**
   * 环境应力指数（0–1，已带注入滞后）。噪声通道 → 心率，
   * 保留既有会话的「环境 → 生理」可验证链路。
   */
  stressIndex: number;
  /** 温度应力指数（0–1，已带注入滞后）。环境温度 → 呼吸频率。 */
  thermalIndex: number;
  /**
   * **生理状态机给出的取值**（`@camp/core` 的 `predictPhysiologyAt().at.ops`）。
   *
   * 为什么由调用方注入而不是在这里自己算：突发期间的心率/呼吸变化是
   * **多时相过程**（前驱 → 发作 → 恢复），它的单一事实来源在
   * `core/src/physiology/`。如果这个仿真器自己再写一份「抽搐 = +45%」，
   * 两条链路必然漂移——曲线导出的是有恢复段的版本，会话里却是方波。
   *
   * 给了它就**优先于**下面的 `INCIDENT_TRUTH` / `INCIDENT_MOTION` 兜底表。
   */
  physiology?: PhysiologyStateOps | null;
  /** 该时刻的生理状态名（仅非 idle 时给），用于写进采样点 */
  physiologyState?: string | null;
  /**
   * 该时刻的机械频带能量（0–1）。同样来自生理层，用于让「抖动 / 用力」
   * 在数据里可分，而不是只留一个体动强度。
   */
  tremorPower?: number;
  retchPower?: number;
  /**
   * 核心温偏离（°C），由生理层按**真实时长**折算。
   *
   * ⚠️ 它属于真值（`truth.vitals[].tempCoreC`），**不是**体表温读数：
   * 项圈测不到核心温，两者之间也没有相关（见 `core/src/vitals/`）。
   */
  coreTempDeltaC?: number;
  /**
   * 距离本次急性动作窗口开始的秒数（演示时相）。仅在窗口内给值。
   *
   * ⚠️ 体表温的发作期响应由**这一个量**驱动，**不由 `coreTempDeltaC` 驱动**。
   * 这是刻意的：一旦让体表温去读核心温，就等于把「体表温与核心温无相关」
   * 这条已核实的结论在仿真里作废，之后任何"换算算法"都会显得很准。
   */
  episodeElapsedS?: number;
  /** 本次急性动作的种类（决定体表温的发作期响应幅度） */
  episodeKind?: string | null;
}

export interface VitalsReadingRow {
  hrBpm?: number;
  hrvRmssdMs?: number;
  rrBpm?: number;
  tempSurfaceC?: number;
  readingQuality: Partial<Record<VitalKey, ReadingQuality>>;
  measurementCondition: MeasurementCondition;
  motionIndex: number;
  /** 生理状态名（仅非 idle 时写入，见 `Sample.physiologyState`） */
  physiologyState?: string;
  tremorPower?: number;
  retchPower?: number;
}

export type VitalsTruthRow = NonNullable<SimTruth['vitals']>[number];

export interface VitalsSimulatorOptions {
  seed: number;
  species: Species;
  /** 基线（由调用方按档案推导，保持与既有生理通道同一口径） */
  base: { hr: number; hrv: number; rr: number; temp: number };
  /** 采样步长（秒）：项圈移位这类**与体动无关**的失效按它计时 */
  stepS: number;
  /** 整段处于诊室情境（`vet-visit` 场景）。真值不变，只有读数被情境抬高。 */
  clinicContext?: boolean;
}

export interface VitalsSimulator {
  next(ctx: VitalsStepContext): { reading: VitalsReadingRow; truth: VitalsTruthRow };
}

/** 体动指数：活动与突发共同决定。全部为**操作化常量**，不是实测能量消耗。 */
const ACTIVITY_MOTION: Readonly<Record<string, number>> = {
  resting: 0.02,
  alert: 0.1,
  grooming: 0.25,
  perching: 0.05,
  hiding: 0.03,
  feeding: 0.2,
  drinking: 0.2,
  eliminating: 0.22,
  scratching: 0.4,
  locomoting: 0.5,
  playing: 0.8,
  vomit: 0.7,
};

/** 突发对**真值**的兜底影响。 */
const INCIDENT_TRUTH_FALLBACK: Readonly<Record<string, { hr: number; rr: number; temp: number }>> = {
  'labored-breathing': { hr: 0.25, rr: 0.6, temp: 0.05 },
  withdrawal: { hr: 0.15, rr: 0.1, temp: 0 },
  freezing: { hr: 0.05, rr: -0.1, temp: 0 },
};

/** 突发对体动指数的兜底影响。抽搐与呕吐的伪影同样来自生理层。 */
const INCIDENT_MOTION_FALLBACK: Readonly<Record<string, number>> = {
  'labored-breathing': 0.35,
  withdrawal: 0.6,
  freezing: 0.02,
};

/** 生理量程：超出即由固件拒收（真机上表现为"本次读数无效"）。 */
const RANGE: Readonly<Record<VitalKey, [number, number]>> = {
  hr: [40, 350],
  rr: [3, 120],
  temp: [25, 42],
};

export function motionIndexOf(activity: string, incidentKind: string | null): number;
export function motionIndexOf(
  activity: string,
  incidentKind: string | null,
  physiology: PhysiologyStateOps | null,
): number;
/**
 * 体动指数。
 *
 * 给了生理取值时**一律以它为准**：那样「抽搐发作期伪影 1.0」与「干呕 0.5」
 * 就只有一个来源，体动门限的判定也才有唯一解释。
 */
export function motionIndexOf(
  activity: string,
  incidentKind: string | null,
  physiology?: PhysiologyStateOps | null,
): number {
  if (physiology) return clamp01(physiology.motionArtifact);
  const base = ACTIVITY_MOTION[activity] ?? 0.2;
  const inc = incidentKind ? INCIDENT_MOTION_FALLBACK[incidentKind] ?? 0 : 0;
  return Math.min(1, Math.max(base, inc));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 伪迹幅度的硬上限：一次体动再剧烈，也不该把读数推到荒唐的值上。 */
function clampArtifact(v: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, v));
}

/**
 * 测量条件。
 *
 * 顺序有讲究：**诊室 > 突发之后 > 睡眠 > 活动 > 静息**。
 * 「突发之后」压过「睡眠」是因为刚发生过动作的窗口不该被当作睡眠读数，
 * 否则睡眠呼吸频率协议会被自己的应激读数污染。
 */
export function conditionOfStep(
  ctx: VitalsStepContext,
  motionIndex: number,
  sinceIncidentEndS: number,
  clinicContext: boolean,
): MeasurementCondition {
  if (clinicContext) return 'clinic';
  if (sinceIncidentEndS >= 0 && sinceIncidentEndS < vitalsConstantValue('postEventWindowS', 600)) {
    return 'post-event';
  }
  if (ctx.sleeping) return 'sleep';
  if (motionIndex >= vitalsConstantValue('hrMotionGate', 0.6)) return 'active';
  return 'resting';
}

function outOfRange(key: VitalKey, value: number): boolean {
  const [lo, hi] = RANGE[key];
  return !(value >= lo && value <= hi);
}

/**
 * 建一个生理读数仿真器。
 *
 * 状态只有两条：体表温自身的慢漂、以及接触状态。两者都不读核心温。
 */
export function createVitalsSimulator(opts: VitalsSimulatorOptions): VitalsSimulator {
  const rng = new Rng(opts.seed);
  const base = opts.base;
  const clinic = opts.clinicContext === true;
  const clinicHr = vitalsConstantValue('clinicHrContextFactor', 1.35);
  const clinicRr = vitalsConstantValue('clinicRrContextFactor', 2.4);
  const ambientCoupling = vitalsConstantValue('tempSurfaceAmbientCoupling', 0.35);
  const ownDriftSd = vitalsConstantValue('tempSurfaceOwnDriftSdC', 0.6);
  const dailyAmp = vitalsConstantValue('hrTruthDailyAmplitude', 0.06);
  const hrGate = vitalsConstantValue('hrMotionGate', 0.6);
  const rrGate = vitalsConstantValue('rrMotionGate', 0.25);
  const tempGate = vitalsConstantValue('tempContactGate', 0.5);
  const windowS = vitalsConstantValue('aggregationWindowS', 60);
  const stepS = Math.max(1, opts.stepS);

  // 体表温的自身慢漂（一阶自回归）：与核心温无关，这是"不换算"的结构保证。
  let surfaceDrift = 0;
  // 接触状态：0–1，缓慢变化；低于门限即"探头没贴稳"。
  let contact = 0.95;
  /**
   * 项圈移位（剩余秒数）。
   *
   * 为什么必须有这条**与体动无关**的失效：Smit 2023 明确记录项圈会旋转、
   * 松紧变化、残余移位。如果失效只由体动驱动，仿真会给出一个过于乐观的可用率
   * （休息与睡眠占猫一天的一半以上），而"休息时读数就一定准"恰恰是没有被验证的假设。
   */
  let displacedS = 0;
  // 心率/呼吸读数的伪迹步行值，使坏值看起来是"漂走了"而不是纯噪声。
  let hrArtifact = 0;
  let rrArtifact = 0;
  // 一段生理趋势（把真值从纯噪声变成有起伏的信号）
  let trend = 0;

  return {
    next(ctx: VitalsStepContext): { reading: VitalsReadingRow; truth: VitalsTruthRow } {
      const phys = ctx.physiology ?? null;
      const motionIndex = motionIndexOf(ctx.activity, ctx.incidentKind, phys);
      const fallback = ctx.incidentKind
        ? INCIDENT_TRUTH_FALLBACK[ctx.incidentKind] ?? { hr: 0, rr: 0, temp: 0 }
        : { hr: 0, rr: 0, temp: 0 };
      /**
       * 突发对真值的三项影响统一折算成倍率。
       *
       * 有生理状态机时用它的倍率与偏移（多时相、带恢复段）；否则退回兜底表。
       * 两条路径都不再依赖任何"平铺的固定百分比"——这正是把
       * 「抽搐 = +45%」这类写法从会话链路里清掉的目的。
       */
      const inc = phys
        ? { hr: phys.hrScale + phys.hrOffset / Math.max(1, base.hr), rr: phys.rrScale, temp: 0 }
        : { hr: 1 + fallback.hr, rr: 1 + fallback.rr, temp: fallback.temp };

      // ---------------- 真值 ----------------
      trend = trend * 0.995 + rng.normal(0, 0.35);
      const daily = 1 + dailyAmp * Math.sin(((ctx.hourOfDay - 9) / 24) * 2 * Math.PI);
      const sleepFactor = ctx.sleeping ? 0.88 : 1;

      const hrTrueBpm =
        base.hr * daily * sleepFactor * (1 + 0.28 * ctx.stressIndex) * inc.hr +
        trend +
        rng.normal(0, 1.2);
      const rrTrueBpm =
        base.rr * (ctx.sleeping ? 0.78 : 1) * (1 + 0.22 * ctx.thermalIndex) * inc.rr +
        rng.normal(0, 0.7);
      // 体温的慢通道由调用方按**真实时长**折算后经 `inc.temp` 传入（生理层负责）；
      // 未注入时退回兜底表的固定值。
      const tempCoreC = base.temp + (phys ? ctx.coreTempDeltaC ?? 0 : fallback.temp) + rng.normal(0, 0.05);

      const condition = conditionOfStep(ctx, motionIndex, ctx.sinceIncidentEndS, clinic);
      const truth: VitalsTruthRow = {
        t: ctx.t,
        hrTrueBpm: Number(hrTrueBpm.toFixed(2)),
        rrTrueBpm: Number(rrTrueBpm.toFixed(2)),
        tempCoreC: Number(tempCoreC.toFixed(3)),
        condition,
      };

      // ---------------- 读数 ----------------
      // 情境只改读数，不改真值。
      let hrReading = hrTrueBpm * (clinic ? clinicHr : 1) + hrArtifact + rng.normal(0, 1.8);
      let rrReading = rrTrueBpm * (clinic ? clinicRr : 1) + rrArtifact + rng.normal(0, 0.6);

      // 体表温：输入里**没有**核心温。
      surfaceDrift = surfaceDrift * 0.995 + rng.normal(0, ownDriftSd * 0.09);
      let tempSurface = 35.6 + ambientCoupling * (ctx.ambientTempC - 22) + surfaceDrift + rng.normal(0, 0.12);

      // 发作期的体表温响应：由**发作本身**驱动（持续用力的血流与代谢产热），
      // 幅度被被毛隔热压得很小，而且**不由核心温推算**（见 ctx.episodeElapsedS 的注释）。
      // 它是这一路读数唯一能被"事件"推动的部分，也是 App 上体表温那格会变红的原因。
      const episodeSurfaceC = episodeSurfaceDelta(
        ctx.episodeKind ?? null,
        ctx.episodeElapsedS,
        vitalsConstantValue('surfaceEpisodeTauS', 20),
      );
      tempSurface += episodeSurfaceC;

      // 接触状态：体动会让探头离皮，长时间看是一个缓慢变量。
      contact = Math.min(1, Math.max(0, contact * 0.99 + 0.06 * (1 - motionIndex) - 0.25 * motionIndex + rng.normal(0, 0.01)));

      // 项圈移位：与体动无关，成段发生。
      if (displacedS <= 0 && rng.chance(0.006)) {
        displacedS = rng.range(60, 240);
      }
      if (displacedS > 0) displacedS = Math.max(0, displacedS - stepS);
      const displaced = displacedS > 0;
      if (displaced) {
        // 移位期间三路读数一起漂走：电极离皮、热敏电阻测空气。
        hrReading += rng.normal(0, 45);
        rrReading += rng.normal(0, 8);
        tempSurface += rng.normal(0, 0.8);
      }

      // 伪迹步行：体动越强，坏值漂得越远。
      //
      // ⚠️ 指数用 **4 次方**而不是 2 次方。用 2 次方时，中等体动（快走 0.5）会
      // 产生 ±40 bpm 的伪迹，而那个窗口的读数仍被标成 **valid**（低于心率门限），
      // 于是 App 上会出现"走路时心率忽高忽低"的假读数。伪迹必须在**低于门限**的
      // 体动区间里迅速衰减到可忽略。
      hrArtifact = clampArtifact(hrArtifact * 0.5 + motionIndex ** 4 * 220 * rng.normal(0, 1) * 0.35, 80);
      rrArtifact = clampArtifact(rrArtifact * 0.5 + motionIndex ** 4 * 40 * rng.normal(0, 1) * 0.35, 15);

      const reading: VitalsReadingRow = {
        readingQuality: {},
        measurementCondition: condition,
        motionIndex: Number(motionIndex.toFixed(3)),
      };
      // 状态与频带能量是**仿真真值的旁注**，只在非 idle 时写入（见 `Sample.physiologyState`）。
      if (ctx.physiologyState && ctx.physiologyState !== 'idle') {
        reading.physiologyState = ctx.physiologyState;
      }
      if (typeof ctx.tremorPower === 'number') reading.tremorPower = Number(ctx.tremorPower.toFixed(3));
      if (typeof ctx.retchPower === 'number') reading.retchPower = Number(ctx.retchPower.toFixed(3));

      const hrValidity: ReadingValidity = outOfRange('hr', hrReading)
        ? 'rejected-out-of-range'
        : displaced
          ? 'poor-contact'
          : motionIndex > hrGate
            ? 'motion-artifact'
            : 'valid';
      const rrValidity: ReadingValidity = outOfRange('rr', rrReading)
        ? 'rejected-out-of-range'
        : displaced
          ? 'poor-contact'
          : motionIndex > rrGate
            ? 'motion-artifact'
            : 'valid';
      const tempValidity: ReadingValidity = outOfRange('temp', tempSurface)
        ? 'rejected-out-of-range'
        : displaced || contact < tempGate
          ? 'poor-contact'
          : 'valid';

      // 超出量程时固件拒收，因此**不写数值字段**；其余情况写入原始值，
      // 由 `readingQuality` 标明它是否可用于分析（界面会把坏值划线展示）。
      if (hrValidity !== 'rejected-out-of-range') reading.hrBpm = Number(hrReading.toFixed(2));
      if (rrValidity !== 'rejected-out-of-range') reading.rrBpm = Number(rrReading.toFixed(2));
      if (tempValidity !== 'rejected-out-of-range') reading.tempSurfaceC = Number(tempSurface.toFixed(3));

      // HRV：环境应激与生理状态各自压低自主神经张力。
      // 有生理状态机时用它的 `hrvScale`（抽搐发作期 0.35、恢复期 0.7——
      // 恢复期的自主神经张力恢复是**可断言**的，不该被一个固定百分比抹平）。
      const hrvPhysScale = phys ? phys.hrvScale : 1 - 0.6 * Math.max(0, inc.hr - 1);
      reading.hrvRmssdMs = Number(
        Math.max(
          6,
          base.hrv * (1 - 0.45 * ctx.stressIndex) * hrvPhysScale + rng.normal(0, 3),
        ).toFixed(2),
      );

      reading.readingQuality.hr = quality(hrValidity, 1 - motionIndex * 0.8, windowS);
      reading.readingQuality.rr = quality(rrValidity, 1 - motionIndex * 1.2, windowS);
      reading.readingQuality.temp = quality(tempValidity, contact, windowS);

      return { reading, truth };
    },
  };
}

function quality(validity: ReadingValidity, score: number, windowS: number): ReadingQuality {
  return {
    validity,
    score: Number(Math.min(1, Math.max(0, score)).toFixed(3)),
    windowS,
  };
}

/**
 * 发作期体表温的上升量（°C）。
 *
 * 只有 `seizure`（持续肌肉用力）与 `vomiting`（用力但短促）登记了幅度，
 * 其余动作取 0：**没有证据支持它们会改变贴皮温度**，就不给它们编一个。
 * 幅度全部是操作化常量（`VITALS_CONSTANTS.surfaceEpisodeEffectC` 等），
 * 且上限远小于核心温的上升——被毛是隔热层。
 */
function episodeSurfaceDelta(kind: string | null, elapsedS: number | undefined, tauS: number): number {
  if (!kind || typeof elapsedS !== 'number' || !(elapsedS > 0)) return 0;
  const peak =
    kind === 'seizure'
      ? vitalsConstantValue('surfaceEpisodeEffectC', 0.5)
      : kind === 'vomiting' || kind === 'vomit'
        ? vitalsConstantValue('surfaceEpisodeEffectVomitC', 0.15)
        : 0;
  if (!(peak > 0)) return 0;
  // 热惯性：指数趋近，不瞬间跳变
  return peak * (1 - Math.exp(-elapsedS / Math.max(1, tauS)));
}

/** 把读数行摊进采样点（保持既有 `Sample` 字段语义不变）。 */
export function applyReading(sample: Sample, reading: VitalsReadingRow): Sample {
  const out: Sample = {
    ...sample,
    readingQuality: reading.readingQuality,
    measurementCondition: reading.measurementCondition,
    motionIndex: reading.motionIndex,
  };
  if (reading.hrBpm !== undefined) out.hrBpm = reading.hrBpm;
  if (reading.hrvRmssdMs !== undefined) out.hrvRmssdMs = reading.hrvRmssdMs;
  if (reading.rrBpm !== undefined) out.rrBpm = reading.rrBpm;
  if (reading.tempSurfaceC !== undefined) out.tempSurfaceC = reading.tempSurfaceC;
  if (reading.physiologyState !== undefined) out.physiologyState = reading.physiologyState;
  if (reading.tremorPower !== undefined) out.tremorPower = reading.tremorPower;
  if (reading.retchPower !== undefined) out.retchPower = reading.retchPower;
  return out;
}

/**
 * 睡眠判定：连续静息多久才算睡着。
 *
 * 抽出来是为了让「睡眠呼吸频率」这条唯一有共识的协议在数据里真的存在，
 * 而不是靠调用方随手传一个布尔值。
 */
export function makeSleepTracker(): (activity: string, incidentKind: string | null, dtS: number) => boolean {
  let restRunS = 0;
  const need = vitalsConstantValue('sleepStintMinS', 300);
  return (activity: string, incidentKind: string | null, dtS: number): boolean => {
    const restingish = activity === 'resting' || activity === 'perching' || activity === 'hiding';
    if (incidentKind !== null || !restingish) {
      restRunS = 0;
      return false;
    }
    restRunS += dtS;
    return restRunS >= need;
  };
}
