/**
 * @camp/simulator —— 带已知真值的仿真数据生成器。
 *
 * 为什么必须有真值：3 天里没有真硬件，唯一能证明「分析层是对的」的方法，
 * 就是造一个知道答案的数据源，然后断言分析层能把它还原出来。
 *
 * 真值包含三项，分别对应三层可验证性：
 *   1. comfortCurve   → 潜在状态曲线
 *   2. injectedGaps   → 资源缺口（供 evaluatePillars 验证）
 *   3. injectedLags   → 环境→生理的滞后（供相关分析验证）
 *
 * 另有一条**行为层**真值：猫的行为时间线与主动注入的突发演示（`injectedIncidents`）。
 *
 * ⚠️ 导入路径纪律：本文件对 core 的**运行时**导入必须用相对路径，不能用 `@camp/core`。
 * `@camp/core` 是 pnpm 在 `node_modules` 下建的目录联接，而 Node 24 的类型剥离
 * （strip-only）**拒绝处理 node_modules 下的文件**，会抛
 * `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`。仅类型导入会被剥掉、不触发该限制，
 * 所以历史上一直是纯类型导入才没有暴露这个问题。
 */
import type {
  AdapterCapabilities,
  CatBehaviorTimeline,
  DeviceAdapter,
  PetProfile,
  Sample,
  Session,
  SimEvent,
  SimTruth,
} from '../../core/src/index.ts';
import { activityAt, hourOfDayAt, incidentAt } from '../../core/src/index.ts';
import {
  coreTempDeltaAt,
  episodeMotion,
  episodeSpanS,
  predictPhysiologyAt,
} from '../../core/src/index.ts';
import type { PhysiologyEpisodeKind } from '../../core/src/index.ts';
import { Rng } from './prng.ts';
import { SIM_CAT_ANCHORS, buildSessionBehavior } from './behavior.ts';
import type { BehaviorLayerOptions } from './behavior.ts';
import { applyReading, createVitalsSimulator, makeSleepTracker } from './vitals.ts';
import type { VitalsTruthRow } from './vitals.ts';

export { Rng, mulberry32 } from './prng.ts';
export * from './behavior.ts';
export * from './vitals.ts';

export type ScenarioId =
  | 'living-room-day'
  | 'multi-cat-tension'
  | 'noise-event'
  | 'senior-mobility'
  | 'vet-visit';

export interface ScenarioDef {
  id: ScenarioId;
  name: string;
  description: string;
  /** 注入的居家资源缺口 */
  gaps: SimTruth['injectedGaps'];
}

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  'living-room-day': {
    id: 'living-room-day',
    name: '客厅的一天',
    description: '基线场景。白天作息，偶发噪声与活动高峰。',
    gaps: [],
  },
  'multi-cat-tension': {
    id: 'multi-cat-tension',
    name: '多猫紧张',
    description: '关键资源未分离，出现砂盆外排泄与长时间躲藏。',
    gaps: ['separated-resources', 'safe-place'],
  },
  'noise-event': {
    id: 'noise-event',
    name: '噪声事件',
    description: '施工/爆竹类突发噪声，检验心率与发声的滞后响应。',
    gaps: ['safe-place'],
  },
  'senior-mobility': {
    id: 'senior-mobility',
    name: '老年行动力',
    description: '高龄个体，垂直空间可达性下降，需要坡道与夜灯。',
    gaps: ['safe-place', 'separated-resources'],
  },
  'vet-visit': {
    id: 'vet-visit',
    name: '兽医就诊',
    description:
      '整段处于诊室情境。**真值不变，只有读数被情境抬高**（心率 ×1.35、呼吸 ×2.4）——用来演示「为什么诊室读数不能当基线」。',
    gaps: [],
  },
};

export interface SimConfig {
  profile: PetProfile;
  seed: number;
  durationMin: number;
  scenario: ScenarioId;
  /** 采样间隔（秒），默认 10 */
  sampleIntervalSec?: number;
  /** 是否在真值中记录注入缺口（默认按场景） */
  injectGaps?: boolean;
  /** 行为层。缺省开启——猫的位移与行为事件都由它派生，不再是纯随机事件 */
  behavior?: BehaviorLayerOptions;
}

/** 各物种的生理基线。用于把潜在状态映射到可观测信号。 */
function baselines(profile: PetProfile) {
  const isCat = profile.species === 'cat';
  const sizeFactor = Math.min(Math.max(profile.heightCm / (isCat ? 24 : 45), 0.4), 1.8);
  return {
    hr: (isCat ? 160 : 95) * (0.85 + 0.3 / sizeFactor),
    hrv: isCat ? 45 : 70,
    rr: (isCat ? 26 : 18) * (0.9 + 0.25 / sizeFactor),
    temp: isCat ? 38.4 : 38.6,
  };
}

function ageBandOf(ageMonths: number): 'junior' | 'adult' | 'senior' | 'geriatric' {
  if (ageMonths < 12) return 'junior';
  if (ageMonths < 96) return 'adult';
  if (ageMonths < 156) return 'senior';
  return 'geriatric';
}

/**
 * 生成一份带真值的会话。
 *
 * 环境 → 生理的映射刻意使用**逐通道不同滞后**，这样下游的滞后相关分析
 * 才有可被验证的对象（若所有通道零滞后，验证就成了自证）。
 */
export function generateSession(cfg: SimConfig): Session {
  const interval = cfg.sampleIntervalSec ?? 10;
  const rng = new Rng(cfg.seed);
  const base = baselines(cfg.profile);
  const scenario = SCENARIOS[cfg.scenario];
  const band = ageBandOf(cfg.profile.ageMonths);
  const isSenior = band === 'senior' || band === 'geriatric';

  // 注入滞后（秒）：噪声→心率快；热→呼吸慢
  const injectedLags: Record<string, number> = {
    'noise->hr': 20,
    'noise->vocalization': 30,
    'temp->rr': 180,
    'light->activity': 60,
  };
  const lagSteps = Object.fromEntries(
    Object.entries(injectedLags).map(([k, v]) => [k, Math.round(v / interval)]),
  ) as Record<string, number>;

  const totalSteps = Math.floor((cfg.durationMin * 60) / interval);
  const durationS = cfg.durationMin * 60;
  const samples: Sample[] = [];
  const comfortCurve: Array<{ t: number; value: number }> = [];
  const events: SimEvent[] = [];

  // ---------------- 行为层 ----------------
  // 用**独立的种子**构建：行为层自带 RNG，不消耗主 `rng` 的随机流，
  // 因此「同种子字节级一致」的既有断言仍成立，且现有生理序列不被打乱。
  const behaviorEnabled = cfg.behavior?.enabled ?? true;
  const behaviorTimeline: CatBehaviorTimeline | undefined = behaviorEnabled
    ? buildSessionBehavior(cfg.behavior?.seed ?? cfg.seed, durationS, {
        timeScale: cfg.behavior?.timeScale,
        awayWindows: cfg.behavior?.awayWindows,
        anchors: cfg.behavior?.anchors ?? SIM_CAT_ANCHORS,
        injectIncidents: cfg.behavior?.injectIncidents,
      })
    : undefined;
  // ---------------- 生理读数层 ----------------
  // 与行为层同样的理由用**独立种子**：不消耗主 `rng` 的随机流，
  // 因此「同种子字节级一致」的既有断言仍然成立。
  const vitalsSim = createVitalsSimulator({
    seed: (cfg.seed ^ 0x5f3759df) >>> 0,
    species: cfg.profile.species,
    base,
    stepS: interval,
    ...(cfg.scenario === 'vet-visit' ? { clinicContext: true } : {}),
  });
  const sleepTracker = makeSleepTracker();
  const episodeTracker = makeEpisodeTracker();
  const vitalsTruth: VitalsTruthRow[] = [];
  let sinceIncidentEndS = Number.POSITIVE_INFINITY;
  let hadIncident = false;

  let prevSegmentKey = '';
  let prevIncidentKind: string | null = null;

  // 噪声突发窗口（noise-event 场景更密集）
  const burstRate = cfg.scenario === 'noise-event' ? 0.02 : 0.004;
  let burstRemaining = 0;

  // 用于实现滞后的小环形缓冲
  const noiseHist: number[] = [];
  const tempHist: number[] = [];
  const lightHist: number[] = [];

  const at = (hist: number[], stepsAgo: number): number => {
    const idx = hist.length - 1 - stepsAgo;
    return idx >= 0 ? (hist[idx] ?? 0) : 0;
  };

  for (let i = 0; i < totalSteps; i++) {
    const t = i * interval;
    const minutesIntoDay = (t / 60) % 1440;

    // ---------------- 环境 ----------------
    if (burstRemaining <= 0 && rng.chance(burstRate)) {
      burstRemaining = Math.round(rng.range(30, 180) / interval);
    }
    const burst = burstRemaining > 0 ? 1 : 0;
    if (burstRemaining > 0) burstRemaining--;

    const noiseDbA = 38 + rng.normal(0, 2.5) + burst * rng.range(18, 34);
    const ambientTempC = 23 + 2.2 * Math.sin((minutesIntoDay / 1440) * 2 * Math.PI) + rng.normal(0, 0.3);
    const lightLux = Math.max(
      5,
      60 + 240 * Math.max(0, Math.sin(((minutesIntoDay - 360) / 720) * Math.PI)) + rng.normal(0, 12),
    );

    noiseHist.push(noiseDbA);
    tempHist.push(ambientTempC);
    lightHist.push(lightLux);

    // ---------------- 潜在状态 ----------------
    const noiseStress = Math.max(0, (noiseDbA - 45) / 30); // ~0..0.9
    const thermalStress = Math.max(0, Math.abs(ambientTempC - 22) - 3) / 6;
    const agePenalty = isSenior ? 0.12 : 0;
    const raw = 0.85 - noiseStress - thermalStress - agePenalty + rng.normal(0, 0.03);
    const comfort = Math.min(1, Math.max(0, raw));
    comfortCurve.push({ t, value: comfort });

    // ---------------- 生理（带注入滞后） ----------------
    const noiseLag = at(noiseHist, lagSteps['noise->hr'] ?? 0);
    const noiseStressLag = Math.max(0, (noiseLag - 45) / 30);
    const tempLag = at(tempHist, lagSteps['temp->rr'] ?? 0);
    const lightLag = at(lightHist, lagSteps['light->activity'] ?? 0);

    // 环境 → 呼吸的应力指数（带注入滞后）。真值与读数都由生理仿真器使用它。
    const thermalIndex = Math.max(0, (tempLag - 24) / 6);

    const noiseLagVocal = at(noiseHist, lagSteps['noise->vocalization'] ?? 0);
    let vocalization = Math.max(0, Math.round(Math.max(0, (noiseLagVocal - 50) / 12) + rng.normal(0, 0.4)));

    // ---------------- 行为层：当前活动、姿势与突发 ----------------
    const seg = behaviorTimeline ? activityAt(behaviorTimeline, t) : undefined;
    const incident = behaviorTimeline ? incidentAt(behaviorTimeline, t) : null;

    // ---------------- 生理状态机：把突发展开成多时相过程 ----------------
    //
    // 这是「抽搐 / 呕吐时心率与呼吸怎么变」在本条链路上的落点：
    // 突发不是方波，而是「前驱 → 动作 → 恢复」的多时相过程，取值由
    // `core/src/physiology/` 登记（方向有文献支持，幅度是仿真注入值）。
    // 它同时给出体动伪影与机械频带能量，供体动门限与下游识别使用。
    //
    // ⚠️ 为什么这里要自己跟踪恢复段、而不只看 `incidentAt`：
    //   动作演示（`INCIDENT_DEFS.demoDurationS`，抽搐 15 秒）比生理窗口（30 秒）短，
    //   因为生理窗口必须额外容纳「发作之后仍偏高」的恢复段。只看 `incidentAt`
    //   会让会话里的状态永远停在 `ictal` 然后突然消失——而恢复段恰恰是
    //   唯一可被采信的偏离，砍掉它等于把识别算法唯一能用的信号砍掉。
    const active = episodeTracker.observe(t, incident ? incident.t : null, mapIncidentKind(incident?.kind));
    const physiology =
      active && seg
        ? predictPhysiologyAt({
            t,
            hrBpm: base.hr,
            hrvRmssdMs: base.hrv,
            rrBpm: base.rr,
            activity: seg.activity,
            episode: active.kind,
            episodeElapsedS: t - active.windowStartS,
            injected: true,
            motion: episodeMotion(active.kind),
          })
        : null;
    // 体温是慢通道：按**真实时长**折算，因此在压缩后的演示里几乎不动。
    // 它只出现在 `truth` 里（项圈测不到核心温）。
    const coreTempDeltaC = active
      ? coreTempDeltaAt(active.kind, t - active.windowStartS, false)
      : 0;

    // ---------------- 生理读数与真值 ----------------
    // ⚠️ 读数 ≠ 真值。真值是"如果有一台完美仪器会读到什么"，读数里叠了运动伪迹、
    // 接触状态与情境偏移（见 `vitals.ts` 头部说明：体表温的生成输入里没有核心温）。
    if (incident !== null) {
      hadIncident = true;
      sinceIncidentEndS = 0;
    } else if (hadIncident) {
      sinceIncidentEndS += interval;
    }
    const sleeping = behaviorTimeline
      ? sleepTracker(seg?.activity ?? 'resting', incident ? incident.kind : null, interval)
      : false;
    const vitalStep = vitalsSim.next({
      t,
      hourOfDay: hourOfDayAt(t),
      activity: seg?.activity ?? 'resting',
      incidentKind: incident?.kind ?? null,
      sleeping,
      ambientTempC,
      sinceIncidentEndS,
      stressIndex: noiseStressLag,
      thermalIndex,
      physiology: physiology?.at.ops ?? null,
      physiologyState: physiology?.at.state ?? null,
      tremorPower: physiology?.features.tremorPower,
      retchPower: physiology?.features.retchPower,
      coreTempDeltaC,
      // 体表温的发作期响应只由「发作本身 + 已过时间」驱动，**不读核心温**：
      // 一旦让体表温去读核心温，"体表温与核心温无相关"这条结论就在仿真里作废了。
      episodeElapsedS: active ? t - active.windowStartS : undefined,
      episodeKind: active?.kind ?? null,
    });
    vitalsTruth.push(vitalStep.truth);

    const posture = mapPosture(seg?.posture, burst > 0, incident !== null);
    const activityLevel = seg
      ? activityLevelOf(seg.activity)
      : Math.max(0, 0.35 * (lightLag / 300) + rng.normal(0, 0.05));

    // 躲藏段抬高发声计数：Hare et al. 2025 显示主人不在场时发声率显著上升（IRR≈3.2）。
    // ⚠️ 该研究场景是兽医体检而非居家，因此这里只作为**方向性**通道联动，
    // 不构成「猫躲藏时一定叫得更多」的结论，也不做任何语义解读。
    if (incident === null && seg?.activity === 'hiding') {
      vocalization = Math.round(vocalization * 1.8);
    }

    samples.push(
      applyReading(
        {
          t,
          activity: Number(activityLevel.toFixed(3)),
          posture: incident ? `event:${incident.kind}` : posture,
          vocalization,
          noiseDbA: Number(noiseDbA.toFixed(2)),
          ambientTempC: Number(ambientTempC.toFixed(2)),
          lightLux: Number(lightLux.toFixed(1)),
          ...(seg ? { activityId: seg.activity, anchorId: seg.anchorId } : {}),
        },
        vitalStep.reading,
      ),
    );

    // ---------------- 触觉相关身体事件（由行为段派生） ----------------
    if (seg && behaviorTimeline) {
      const segKey = `${seg.t}:${seg.activity}`;
      if (segKey !== prevSegmentKey) {
        prevSegmentKey = segKey;
        for (const ev of eventsFromBehaviorSegment(seg, t, rng)) events.push(ev);
      }
    } else if (rng.chance(0.02)) {
      // 行为层关闭时保留原先的随机事件，向后兼容
      const kind = rng.pick(['scratch', 'rub', 'head-shake', 'posture-change'] as const);
      if (kind) events.push({ t, kind, magnitude: Number(rng.range(0.2, 1).toFixed(2)) });
    }
    if (vocalization > 0) {
      events.push({ t, kind: 'vocalization', magnitude: Number((vocalization / 3).toFixed(2)) });
    }
    // 突发开始：记录一次姿势改变事件（离散事件，供事件流直接使用）
    if (incident && prevIncidentKind !== incident.kind) {
      events.push({
        t,
        kind: 'posture-change',
        magnitude: 1,
        note: `突发演示：${incident.kind}${incident.injected ? '（注入）' : ''}`,
      });
    }
    prevIncidentKind = incident?.kind ?? null;

    // 多猫紧张场景：砂盆外排泄与躲藏
    if (cfg.scenario === 'multi-cat-tension') {
      if (rng.chance(0.006)) events.push({ t, kind: 'elimination-outside-box', magnitude: 1 });
      if (rng.chance(0.05)) events.push({ t, kind: 'hiding', magnitude: Number(rng.range(0.3, 1).toFixed(2)) });
    }
  }

  const injectGaps = cfg.injectGaps ?? scenario.gaps.length > 0;
  const injectedIncidents = (behaviorTimeline?.incidents ?? []).filter((i) => i.injected);
  const truth: SimTruth = {
    comfortCurve,
    injectedGaps: injectGaps ? [...scenario.gaps] : [],
    injectedLags,
    seed: cfg.seed,
    scenario: cfg.scenario,
    vitals: vitalsTruth,
    ...(behaviorTimeline
      ? {
          behavior: {
            seed: behaviorTimeline.seed,
            timeScale: behaviorTimeline.timeScale,
            segments: behaviorTimeline.segments,
            incidents: behaviorTimeline.incidents,
            budgetS: behaviorTimeline.budgetS,
          },
          injectedIncidents,
        }
      : {}),
  };

  return {
    id: `sim-${cfg.scenario}-${cfg.seed}-${cfg.durationMin}m`,
    profile: cfg.profile,
    source: 'simulator',
    startedAt: Date.UTC(2026, 9, 2, 9, 0, 0),
    samples,
    events,
    truth,
    ...(behaviorTimeline ? { behaviorTimeline } : {}),
  };
}

// ---------------------------------------------------------------- 生理状态机的接缝

/** 行为层的突发名 → 生理层的突发名。仅抽搐与呕吐建立了生理时相。 */
function mapIncidentKind(kind: string | undefined | null): PhysiologyEpisodeKind | null {
  if (kind === 'seizure') return 'seizure';
  if (kind === 'vomit') return 'vomiting';
  return null;
}

export interface ActiveEpisode {
  kind: PhysiologyEpisodeKind;
  /** 本次突发**生理窗口**的起点（= 行为层的突发起点 − 前驱时长） */
  windowStartS: number;
}

/**
 * 突发与恢复段的跟踪器。
 *
 * 它解决的是一个具体的接缝问题：行为层的突发区间与生理层的时相窗口**不等长**。
 *
 * | | 动作演示 | 生理窗口 |
 * |---|---|---|
 * | 抽搐 | 15 s | 30 s（含 13 s 恢复段） |
 * | 呕吐 | 30 s | 30 s |
 *
 * 只按行为层的 `incidentAt` 判断，会话里的状态会在动作结束时**直接消失**——
 * 而「发作之后心率仍偏高」正是整条链路上唯一可被采信的偏离。
 * 因此这里让生理窗口**跨过**动作区间的末尾：恢复段是真实存在的窗口，
 * 不是靠标签延长的。
 */
function makeEpisodeTracker() {
  let active: ActiveEpisode | null = null;
  let recoveryUntilS = 0;

  return {
    /**
     * 每次采样调一次。
     *
     * @param t 本次采样时刻
     * @param incidentStartS 行为层给出的**本次突发起点**（= 动作起点 − 前驱）；不在突发中时为 null
     * @param incidentKind 生理层对应的突发名；不在突发中时为 null
     */
    observe(
      t: number,
      incidentStartS: number | null,
      incidentKind: PhysiologyEpisodeKind | null,
    ): ActiveEpisode | null {
      if (incidentKind !== null && incidentStartS !== null) {
        if (active === null || active.kind !== incidentKind) {
          // ⚠️ 窗口起点锚定在**行为层给出的突发起点**上，不要用采样间隔去推算。
          //
          // 为什么必须锚定：行为引擎的突发区间起点已经是「动作起点 − 前驱」
          // （见 `behavior/engine.ts` 的 `strideTarget = atS - 1`），因此
          // `t - incidentStartS` 本身就是正确的时相进度。
          // 若改用「当前时刻 − 一个采样间隔 − 前驱」推算，误差会随突发类型放大：
          // 呕吐的前驱长达 18 秒，推算出的起点会把整个干呕期推到窗口之外
          // （实测：采样点全都落进恢复期，干呕与排出一次都没出现）。
          active = { kind: incidentKind, windowStartS: incidentStartS };
        }
        recoveryUntilS = active.windowStartS + episodeSpanS(incidentKind, false);
        return active;
      }
      if (active !== null && t < recoveryUntilS) return active;
      active = null;
      return null;
    },
  };
}

// ---------------------------------------------------------------- 行为 → 采样/事件的映射

/**
 * 行为姿势 → 采样通道里的 `posture` 字符串。
 *
 * 沿用既有的四个取值（`resting` / `active` / `tense-upright` / `hiding`），
 * 而不是把 core 的六个姿势原样写进采样：`posture` 是**已有的通道**，
 * 换掉取值集合会让既有分析与下游代码失效。
 * 完整的六个姿势保留在 `truth.behavior.segments` 里。
 */
function mapPosture(posture: string | undefined, burst: boolean, inIncident: boolean): string {
  if (inIncident || burst) return 'tense-upright';
  switch (posture) {
    case 'walking':
    case 'climbing':
    case 'standing':
    case 'crouching':
      return 'active';
    case 'lying':
    case 'sitting':
    default:
      return 'resting';
  }
}

/** 各行为折算成 0–1 的「活动量」水平。数值是操作化常量，不代表实测能量消耗。 */
function activityLevelOf(activity: string): number {
  switch (activity) {
    case 'locomoting':
      return 0.55;
    case 'playing':
      return 0.7;
    case 'scratching':
      return 0.35;
    case 'vomit':
      return 0.3;
    case 'feeding':
    case 'drinking':
    case 'eliminating':
    case 'grooming':
      return 0.18;
    case 'alert':
      return 0.12;
    case 'perching':
      return 0.06;
    case 'hiding':
      return 0.04;
    case 'resting':
    default:
      return 0.02;
  }
}

/**
 * 由行为区间派生事件流。
 *
 * 为什么把事件**由行为派生**而不是继续独立随机：事件流的核心宣称是
 * 「按离家时段汇总发生了什么事件」。如果抓挠事件与「猫在抓挠」这个行为
 * 各自随机，两者就会互相矛盾（猫在睡觉却在抓）。派生之后，
 * 「抓挠事件一定落在抓挠段内」成为可断言的性质。
 */
function eventsFromBehaviorSegment(
  seg: { activity: string },
  t: number,
  rng: Rng,
): SimEvent[] {
  const out: SimEvent[] = [];
  const mag = (): number => Number(rng.range(0.2, 1).toFixed(2));
  switch (seg.activity) {
    case 'scratching':
      out.push({ t, kind: 'scratch', magnitude: mag() });
      break;
    case 'grooming':
      // 理毛既可能被记为摩擦，也可能被记为抓挠——这是本仓库已记录的真实混淆：
      // Smit et al. 2023 发现项圈模型会把抓挠系统性误分类为理毛。
      out.push(
        rng.chance(0.5)
          ? { t, kind: 'rub', magnitude: mag() }
          : { t, kind: 'scratch', magnitude: mag() },
      );
      break;
    case 'locomoting':
    case 'eliminating':
      out.push({ t, kind: 'posture-change', magnitude: mag() });
      break;
    case 'hiding':
      out.push({ t, kind: 'hiding', magnitude: 1 });
      break;
    case 'playing':
      out.push({ t, kind: 'impact', magnitude: mag() });
      break;
    default:
      break;
  }
  return out;
}

/** 仿真适配器：把静态生成包装成流式接口，供 UI 将来替换为真机适配器。 */
export class SimulatorAdapter implements DeviceAdapter {
  readonly id: string;
  readonly kind = 'simulator' as const;
  readonly capabilities: AdapterCapabilities = {
    camera: true,
    hr: true,
    rr: true,
    temp: true,
    imu: true,
    audio: true,
  };

  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly session: Session;

  // 注意：不用参数属性（constructor(private x)）——Node 的类型剥离是 strip-only，
  // 参数属性需要代码生成，会抛 ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX。
  // 全仓禁用非可擦除语法，由 tsconfig 的 erasableSyntaxOnly 在编译期拦截。
  constructor(session: Session) {
    this.session = session;
    this.id = `sim:${session.id}`;
  }

  async start(onSample: (s: Sample) => void): Promise<void> {
    let i = 0;
    await this.stop();
    this.timer = setInterval(() => {
      const s = this.session.samples[i++];
      if (s) onSample(s);
      else void this.stop();
    }, 200);
  }

  async stop(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
