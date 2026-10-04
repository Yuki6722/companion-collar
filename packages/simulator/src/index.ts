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
 * 另有一条**行为层**真值：行为时间线与主动注入的突发演示（`injectedIncidents`）。
 * 行为层按 `profile.species` 分派：猫走 `buildBehaviorTimeline`（结果放进 `behaviorTimeline`），
 * 狗走 `buildDogTimeline`（结果放进 `dogBehaviorTimeline`）。两条路共用同一套生理读数链路。
 *
 * ⚠️ 导入路径纪律：本文件对 core 的**运行时**导入必须用相对路径，不能用 `@camp/core`。
 * `@camp/core` 是 pnpm 在 `node_modules` 下建的目录联接，而 Node 24 的类型剥离
 * （strip-only）**拒绝处理 node_modules 下的文件**，会抛
 * `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`。仅类型导入会被剥掉、不触发该限制，
 * 所以历史上一直是纯类型导入才没有暴露这个问题。
 */
import type {
  AdapterCapabilities,
  CatActivityId,
  CatBehaviorTimeline,
  DeviceAdapter,
  DogBehaviorTimeline,
  PetProfile,
  Sample,
  Session,
  SimEvent,
  SimTruth,
  Species,
} from '../../core/src/index.ts';
import { activityAt, dogActivityAt, dogIncidentAt, hourOfDayAt, incidentAt } from '../../core/src/index.ts';
import {
  coreTempDeltaAt,
  episodeMotion,
  episodeSpanS,
  predictPhysiologyAt,
} from '../../core/src/index.ts';
import type { PhysiologyEpisodeKind } from '../../core/src/index.ts';
import { Rng } from './prng.ts';
import { SIM_CAT_ANCHORS, SIM_DOG_ANCHORS, buildSessionBehavior, buildSessionDogBehavior } from './behavior.ts';
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
  /**
   * 行为层。缺省开启——位移与行为事件都由它派生，不再是纯随机事件。
   *
   * ⚠️ 这张表的**内容按 `profile.species` 解释**：猫看 `anchors` / `awayWindows`，
   * 狗看 `dogAnchors`（并把 `awayWindows` 忽略掉）。`injectIncidents` 是两边共用的，
   * 它的 `kind` 放宽成猫狗两个种类的联合，由 `generateSession` 在运行时按物种过滤。
   */
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
 *
 * 物种分派只有两处，且都只看 `cfg.profile.species`：
 *   1. 生理基线（`baselines()`：狗 hr 95 / hrv 70 / rr 18，猫 hr 160 / hrv 45 / rr 26）；
 *   2. 行为层（猫 `buildBehaviorTimeline`、狗 `buildDogTimeline`）。
 * 读数链路、事件流、真值记录三者**完全共用**：狗的会话不是另写一条流水线，
 * 而是同一条流水线的另一组参数。
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
  //
  // 物种分派：猫与狗各自一套行为参数（「共用机制、分开参数」，AGENTS.md §8），
  // 因此这里是两条**并列**的路，而不是给猫的引擎加一个开关：
  //   猫 → `buildBehaviorTimeline`（本轮一行未改，产出仍写 `behaviorTimeline`）
  //   狗 → `buildDogTimeline`（16 种狗的活动、狗的节律、狗的锚点硬约束，
  //        产出写进**新字段** `dogBehaviorTimeline`）
  // 两条路产出的时间线都连续覆盖整段会话，因此下游（生理读数、事件流、真值）
  // 只有「用哪个求值函数」这一处差别。
  const behaviorEnabled = cfg.behavior?.enabled ?? true;
  const isDog = cfg.profile.species === 'dog';
  const behaviorSeed = cfg.behavior?.seed ?? cfg.seed;
  const catTimeline: CatBehaviorTimeline | undefined =
    behaviorEnabled && !isDog
      ? buildSessionBehavior(behaviorSeed, durationS, {
          timeScale: cfg.behavior?.timeScale,
          awayWindows: cfg.behavior?.awayWindows,
          anchors: cfg.behavior?.anchors ?? SIM_CAT_ANCHORS,
          injectIncidents: cfg.behavior?.injectIncidents,
        })
      : undefined;
  // ⚠️ 锚点必须显式传 `SIM_DOG_ANCHORS`：漏了它，狗的行为层会退化成「只有一块地面」，
  //    时间线依旧连续、依旧确定，只是狗哪儿也不去——这是最不容易被肉眼发现的一类错。
  const dogTimeline: DogBehaviorTimeline | undefined =
    behaviorEnabled && isDog
      ? buildSessionDogBehavior(behaviorSeed, durationS, {
          timeScale: cfg.behavior?.timeScale,
          // 刻意**不读** `cfg.behavior.anchors`：那是猫的锚点表类型，把它的类型撑成联合
          // 会让每一处猫的调用点都要先收窄一次。狗的锚点由仿真器自己给，
          // 20 个 id 与能力与 `apps/web/src/scene/dog/dog-nav.ts` 逐条一致（由单测的契约断言把守）。
          dogAnchors: SIM_DOG_ANCHORS,
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
    // 两条时间线的结构是同一套（`t` / `durS` / `activity` / `posture` / `anchorId` /
    // `incidentKind`），因此**只在这里按物种选一次求值函数**，之后的生理读数、事件派生、
    // 真值记录全部共用——这是「共用机制、分开参数」在代码上的落点。
    const seg = dogTimeline ? dogActivityAt(dogTimeline, t) : catTimeline ? activityAt(catTimeline, t) : undefined;
    const incident = dogTimeline ? dogIncidentAt(dogTimeline, t) : catTimeline ? incidentAt(catTimeline, t) : null;
    // 生理读数层（`vitals.ts`）的体动表与生理状态表都是按**猫的活动词汇**建的，本轮不改它。
    // 狗的活动名先折成它认识的那个键；`Sample.activityId` 仍然写狗的原生活动名，
    // 因此「采样 ↔ 时间线」的一致性断言在狗这边照样成立。
    const vitalsActivity: CatActivityId = vitalsActivityKeyOf(seg?.activity ?? 'resting', cfg.profile.species);

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
            activity: vitalsActivity,
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
    const sleeping = behaviorEnabled
      ? sleepTracker(vitalsActivity, incident ? incident.kind : null, interval)
      : false;
    const vitalStep = vitalsSim.next({
      t,
      hourOfDay: hourOfDayAt(t),
      activity: vitalsActivity,
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
    // 活动量折算表也是**分物种**的：狗的 16 个活动名里只有 4 个与猫表重名，
    // 靠改名复用猫表会让「走动」拿到理毛档的取值，漂移基线就变成映射的产物了。
    const activityLevel = seg
      ? isDog
        ? dogActivityLevelOf(seg.activity)
        : activityLevelOf(seg.activity)
      : Math.max(0, 0.35 * (lightLag / 300) + rng.normal(0, 0.05));

    // 躲藏段抬高发声计数：Hare et al. 2025 显示主人不在场时发声率显著上升（IRR≈3.2）。
    // ⚠️ 该研究场景是兽医体检而非居家，因此这里只作为**方向性**通道联动，
    // 不构成「猫躲藏时一定叫得更多」的结论，也不做任何语义解读。
    // 狗版**没有**加类似的物种联动：狗的活动表里没有躲藏段，而本仓库的研究集里
    // 也没有一条能支撑「某个狗的活动段发声更多」的来源——没有依据就不编一条。
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
    // 派生规则**分物种**：两张活动名词表几乎不重叠，套用猫的 switch 会让狗的事件流恒为空。
    if (seg && behaviorEnabled) {
      const segKey = `${seg.t}:${seg.activity}`;
      if (segKey !== prevSegmentKey) {
        prevSegmentKey = segKey;
        const bodyEvents = isDog
          ? eventsFromDogBehaviorSegment(seg, t, rng)
          : eventsFromBehaviorSegment(seg, t, rng);
        for (const ev of bodyEvents) events.push(ev);
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

    // 多猫紧张场景：砂盆外排泄与躲藏。
    // ⚠️ 这是**猫版场景**的两条随机事件注入，因此只在猫那一路执行：
    //    狗没有砂盆（「砂盆外」在狗的场地里没有对应物），也没有躲藏活动，
    //    照搬过来会凭空造出两种与行为时间线对不上的事件。
    if (!isDog && cfg.scenario === 'multi-cat-tension') {
      if (rng.chance(0.006)) events.push({ t, kind: 'elimination-outside-box', magnitude: 1 });
      if (rng.chance(0.05)) events.push({ t, kind: 'hiding', magnitude: Number(rng.range(0.3, 1).toFixed(2)) });
    }
  }

  const injectGaps = cfg.injectGaps ?? scenario.gaps.length > 0;
  const truth: SimTruth = {
    comfortCurve,
    injectedGaps: injectGaps ? [...scenario.gaps] : [],
    injectedLags,
    seed: cfg.seed,
    scenario: cfg.scenario,
    vitals: vitalsTruth,
  };
  // 行为真值的落点**按物种分开**：
  //   猫 → `truth.behavior`（它的字段是按猫的活动词汇类型化的，原有断言依赖它）
  //   狗 → 只写 `injectedIncidents`。狗的行为真值不塞进 `truth.behavior`，因为那里
  //        的 `segments` 是 `CatBehaviorSegment[]` —— 硬塞狗的活动名要么是一句类型谎话、
  //        要么得去改 core 的 `SimTruth`。狗的时间线本身已经带齐
  //        `seed` / `timeScale` / `segments` / `incidents` / `budgetS`，唯一事实来源就是
  //        `session.dogBehaviorTimeline` 那一处。
  // 注入的突发两边都记：`DogBehaviorIncident` 与 `CatBehaviorIncident` 结构相同
  // （狗的突发名本来就是猫联合的子集），因此这里不需要第二套字段。
  if (catTimeline) {
    truth.behavior = {
      seed: catTimeline.seed,
      timeScale: catTimeline.timeScale,
      segments: catTimeline.segments,
      incidents: catTimeline.incidents,
      budgetS: catTimeline.budgetS,
    };
    truth.injectedIncidents = catTimeline.incidents.filter((i) => i.injected);
  } else if (dogTimeline) {
    truth.injectedIncidents = dogTimeline.incidents.filter((i) => i.injected);
  }

  return {
    id: `sim-${cfg.scenario}-${cfg.seed}-${cfg.durationMin}m`,
    profile: cfg.profile,
    source: 'simulator',
    startedAt: Date.UTC(2026, 9, 2, 9, 0, 0),
    samples,
    events,
    truth,
    ...(catTimeline ? { behaviorTimeline: catTimeline } : {}),
    ...(dogTimeline ? { dogBehaviorTimeline: dogTimeline } : {}),
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
 * 狗的活动名 → 生理读数层（`vitals.ts`）认识的那个活动键。
 *
 * **为什么需要这一层映射**：读数层的体动表（`ACTIVITY_MOTION`）与生理状态表
 * （`core/src/physiology` 的 `ACTIVITY_IDLE_OPS`）都是按猫的活动词汇建的，而这两个文件
 * 本轮都不许改。若把狗的活动名原样传进去，两张表都查不到键、双双落到兜底值——
 * 后果是「睡眠」与「走动」拿到同一个体动强度（缺省 0.2），运动伪迹门限与呼吸通道的
 * 可用窗口随之全部失准，而这恰恰是本项目唯一能展示的边界（无效读数不是数据）。
 *
 * 映射只借用**一个语义：颈部体动的量级档**，不要求两边行为同义：
 *   睡眠/休息 → `resting`（最低档，且它是睡眠判定认的「静息」）
 *   坐/警觉   → `alert`（不动但有张力；**刻意不映射成 `resting`**，否则「坐 5 分钟」
 *              会被静息时长判定当成睡着）
 *   走/小跑   → `locomoting`（有位移的匀速运动）
 *   奔跑      → `playing`（最高档，量级上对应冲刺时的颈部冲击）
 *   玩耍      → `playing`
 *   嗅闻      → `grooming`（低头贴地、小幅度持续体动）
 *   进食/饮水/排泄 → `feeding` / `drinking` / `eliminating`（名字与量级都对得上）
 *   ---- 本轮新增的四种院子互动，折法各自写清理由 ----
 *   玩水      → `playing`：前肢反复拍打的颈部动作与「对物件挥爪扑击」同档，
 *              猫表里没有更贴切的键（映射借用的只是**体动量级**，不是行为同义）
 *   打滚      → `playing`：躯干大幅翻转为最高一档体动，与冲刺/扑击同量级
 *   刨地      → `scratching`：前肢交替向体侧刮擦，与猫的抓挠是同一类颈部动作
 *               （本仓库已知的真实混淆是抓挠/理毛，这里取的就是那个「刮擦」档）
 *   晒太阳    → `resting`：长时间趴卧不动。**不能**映射成 `alert`，
 *               否则日照停留会被静息时长判定排除在静息之外，反过来让睡眠判定失准
 *
 * ⚠️ 这是一张**操作化映射表**（本项目自定，用于让链路跑起来），不是行为学结论；
 *    它不改任何面向用户的取值，`Sample.activityId` 写的仍是狗的原生活动名。
 */
const DOG_VITALS_ACTIVITY: Readonly<Record<string, string>> = {
  sleeping: 'resting',
  resting: 'resting',
  sitting: 'alert',
  alerting: 'alert',
  walking: 'locomoting',
  trotting: 'locomoting',
  running: 'playing',
  playing: 'playing',
  sniffing: 'grooming',
  eating: 'feeding',
  drinking: 'drinking',
  eliminating: 'eliminating',
  'water-play': 'playing',
  rolling: 'playing',
  digging: 'scratching',
  sunning: 'resting',
};

/**
 * 取某活动在读数层里的键。
 *
 * 猫那一路是**恒等**的（活动名本来就是猫的词汇），这里的 `as CatActivityId` 只是把
 * 「物种分派已经保证过」这件事写给类型系统：两条时间线在分派点之后共用同一条链路，
 * 而 `predictPhysiologyAt` / `motionIndexOf` 的签名要求的是猫的活动名。
 * 换句话说，这个断言换来的是「下游一行都不用改」，代价是一处必须被注释说明的窄化。
 */
function vitalsActivityKeyOf(activity: string, species: Species): CatActivityId {
  if (species !== 'dog') return activity as CatActivityId;
  return (DOG_VITALS_ACTIVITY[activity] ?? 'resting') as CatActivityId;
}

/**
 * 行为姿势 → 采样通道里的 `posture` 字符串。
 *
 * 沿用既有的四个取值（`resting` / `active` / `tense-upright` / `hiding`），
 * 而不是把 core 的姿势原样写进采样：`posture` 是**已有的通道**，
 * 换掉取值集合会让既有分析与下游代码失效。
 * 完整的姿势保留在时间线的 `segments` 里（猫在 `truth.behavior.segments`，
 * 狗在 `session.dogBehaviorTimeline.segments`）。
 *
 * 狗版多出两个猫表里没有的姿势名：`moving`（四爪交替：走 / 小跑 / 奔跑 / 嗅闻）与
 * `lowered`（低头压低：吃 / 喝 / 排泄 / 呕吐）。两者都折进 `active` ——
 * 采样通道的取值集合**不变**，而它们都不是「不动」。
 * 本轮新增的院子互动沿用同一条折法：`water-play` / `rolling` / `digging`
 * （前肢拍水、侧身翻滚、前肢刨地）都折进 `active`；`sunning` 折进 `resting`
 * ——它是趴卧不动的日照停留，与「休息」同一档。
 */
function mapPosture(posture: string | undefined, burst: boolean, inIncident: boolean): string {
  if (inIncident || burst) return 'tense-upright';
  switch (posture) {
    case 'walking':
    case 'climbing':
    case 'standing':
    case 'crouching':
    case 'moving':
    case 'lowered':
    case 'water-play':
    case 'rolling':
    case 'digging':
      return 'active';
    case 'lying':
    // `down` 与 `lying` 是同一个身体形状（见 core 的 DogPosture），同样折进 resting
    case 'down':
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
 * 狗的 16 种活动 → 0–1 的活动量水平。
 *
 * 为什么不复用猫的那张表：两张活动名词表只有 4 个名字重合（`resting` / `drinking` /
 * `eliminating` / `playing`），其余靠改名映射会让「走动」拿到「理毛」档的取值，
 * 于是按活动量做的漂移基线就变成映射的产物，而不是行为的产物。
 *
 * 取值与猫表**同一个 0–1 尺度**（这样两个物种的 `Sample.activity` 仍可比），
 * 顺序也照猫表：位移类 > 用力类 > 定点类 > 不动。全部是**操作化常量**，
 * 不是实测能量消耗，也不构成任何关于犬只活动的宣称。
 * 本轮新增的四种院子互动（玩水 / 打滚 / 刨地 / 晒太阳）按同一条纪律插在上面：
 * 中高活动量的三个排在玩耍与走动之间，晒太阳落在最低档。
 */
function dogActivityLevelOf(activity: string): number {
  switch (activity) {
    case 'running':
      return 0.9;
    case 'playing':
      return 0.7;
    // ---- 本轮新增的四种院子互动 ----
    // 打滚（0.65）与玩水（0.6）属于中高活动量：躯干/前肢都在持续用力，
    // 但都短促（十几秒），低于冲刺与玩耍。刨地（0.5）介于走动与嗅闻之间
    // ——前肢用力而躯干基本不动。晒太阳（0.02）是全表最低的一档，
    // 与「休息」同档：它本来就是长时间趴卧不动。
    // 取值与猫表**同一个 0–1 尺度**（这些判断是仿真参数，不是实测能量消耗）。
    case 'rolling':
      return 0.65;
    case 'water-play':
      return 0.6;
    case 'digging':
      return 0.5;
    case 'trotting':
      return 0.6;
    case 'walking':
      return 0.45;
    case 'sniffing':
      return 0.22;
    case 'eliminating':
      return 0.22;
    case 'eating':
    case 'drinking':
      return 0.18;
    case 'alerting':
      return 0.12;
    case 'sitting':
      return 0.05;
    case 'sunning':
    case 'resting':
      return 0.02;
    case 'sleeping':
      return 0.01;
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

/**
 * 由**狗**的行为区间派生事件流。
 *
 * 为什么不复用上面那张表：猫表是按猫的活动名（`scratching` / `grooming` / `hiding`…）
 * 写的 switch，狗的活动名一个也对不上——直接复用不会报错，只会让狗的事件流**恒为空**，
 * 而这正是「事件必须由行为派生」这条纪律最容易被悄悄破坏的地方。
 * 事件**种类**沿用同一套 `SimEventKind`（不改 core 的词汇），只换派生规则。
 *
 * 映射只借用**一个语义：这段动作会在颈部产生哪一类机械事件**。它是操作化的，
 * 不是行为学结论——本仓库的研究集里没有「狗在某个活动下产生多少次项圈事件」这类可引用的数字。
 *
 * 本轮新增的四种院子互动沿用同一条折法（列在下面各 case 的注释里）：
 * 玩水 → 摩擦、打滚 → 碰撞、刨地 → 抓挠、晒太阳 → **不派生**（它在休息）。
 *
 * ⚠️ 两个取值在狗这条路上**刻意不出现**：
 *   - `elimination-outside-box`：狗没有砂盆，「砂盆外」在狗的场地里没有对应物；
 *     而且行为层把排泄**硬约束**在院子的排泄角（`DOG_DESTINATION_RULES`），
 *     在那里排泄是它该做的事，记成「越界」是把正确行为描述成异常。
 *   - `hiding`：狗的活动里没有躲藏段。与其为了让取值「看起来都用上了」
 *     而编一个没有对应行为的事件，不如让它不出现在狗的事件流里。
 */
function eventsFromDogBehaviorSegment(
  seg: { activity: string },
  t: number,
  rng: Rng,
): SimEvent[] {
  const out: SimEvent[] = [];
  const mag = (): number => Number(rng.range(0.2, 1).toFixed(2));
  switch (seg.activity) {
    // 移动：颈部的姿态从「卧/坐」换成「四爪交替」，这是最直接的一类姿势改变。
    // 走动单独记姿势改变，是因为它是狗最基础的活动，事件流里出现得最多也合理。
    case 'walking':
      out.push({ t, kind: 'posture-change', magnitude: mag() });
      break;
    // 小跑与嗅闻：项圈在颈部前后滑动、探头反复受力 → 记为摩擦。
    // 玩水同理：前肢反复拍打时颈部持续小幅前后位移，项圈在皮毛上滑动。
    case 'trotting':
    case 'sniffing':
    case 'water-play':
      out.push({ t, kind: 'rub', magnitude: mag() });
      break;
    // 冲刺与玩耍：落地、急停、甩咬带来的冲击。狗没有猫那种上下攀跳的位移，
    // 冲击只可能来自这几段。打滚同理：躯干与地面反复接触，是整个身体尺度上的碰撞。
    case 'running':
    case 'playing':
    case 'rolling':
      out.push({ t, kind: 'impact', magnitude: mag() });
      break;
    // 刨地：前肢交替刮擦地面，与猫的抓挠是同一类颈部动作（本仓库已知的混淆是
    // 抓挠/理毛被项圈模型互换，这里取的就是那个「刮擦」档）。
    case 'digging':
      out.push({ t, kind: 'scratch', magnitude: mag() });
      break;
    // 定点行为（吃 / 喝 / 排泄 / 坐）：低头与起身，都属于姿势改变。
    case 'eating':
    case 'drinking':
    case 'eliminating':
    case 'sitting':
      out.push({ t, kind: 'posture-change', magnitude: mag() });
      break;
    // 警觉张望：起立时的摆头甩耳是颈部出现的短促横向摆动。
    // ⚠️ 这是**操作化映射**（把「颈部最容易被记成甩头的动作」对齐到一个活动），
    //    不是行为学结论：狗的活动表里没有理毛那类天然会甩头的段。
    case 'alerting':
      out.push({ t, kind: 'head-shake', magnitude: mag() });
      break;
    // 休息、睡眠与晒太阳不派生身体事件——与猫版同一条纪律：
    // 躺着不动时不该凭空出现抓挠或碰撞。
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
