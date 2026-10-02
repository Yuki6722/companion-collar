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
 */
import type {
  AdapterCapabilities,
  DeviceAdapter,
  PetProfile,
  Sample,
  Session,
  SimEvent,
  SimTruth,
} from '@camp/core';
import { Rng } from './prng.ts';

export { Rng, mulberry32 } from './prng.ts';

export type ScenarioId =
  | 'living-room-day'
  | 'multi-cat-tension'
  | 'noise-event'
  | 'senior-mobility';

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
  const samples: Sample[] = [];
  const comfortCurve: Array<{ t: number; value: number }> = [];
  const events: SimEvent[] = [];

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

    const hrBpm = base.hr * (1 + 0.28 * noiseStressLag) + rng.normal(0, 1.8);
    const hrvRmssdMs = Math.max(6, base.hrv * (1 - 0.45 * noiseStressLag) + rng.normal(0, 3));
    const rrBpm = base.rr * (1 + 0.22 * Math.max(0, (tempLag - 24) / 6)) + rng.normal(0, 0.8);
    const tempC = base.temp + rng.normal(0, 0.05);
    const activity = Math.max(0, 0.35 * (lightLag / 300) + rng.normal(0, 0.05));

    const noiseLagVocal = at(noiseHist, lagSteps['noise->vocalization'] ?? 0);
    const vocalization = Math.max(0, Math.round(Math.max(0, (noiseLagVocal - 50) / 12) + rng.normal(0, 0.4)));

    samples.push({
      t,
      hrBpm: Number(hrBpm.toFixed(2)),
      hrvRmssdMs: Number(hrvRmssdMs.toFixed(2)),
      rrBpm: Number(rrBpm.toFixed(2)),
      tempC: Number(tempC.toFixed(3)),
      activity: Number(activity.toFixed(3)),
      posture: burst > 0 ? 'tense-upright' : 'resting',
      vocalization,
      noiseDbA: Number(noiseDbA.toFixed(2)),
      ambientTempC: Number(ambientTempC.toFixed(2)),
      lightLux: Number(lightLux.toFixed(1)),
    });

    // ---------------- 触觉相关身体事件 ----------------
    if (rng.chance(0.02)) {
      const kind = rng.pick(['scratch', 'rub', 'head-shake', 'posture-change'] as const);
      if (kind) events.push({ t, kind, magnitude: Number(rng.range(0.2, 1).toFixed(2)) });
    }
    if (vocalization > 0) {
      events.push({ t, kind: 'vocalization', magnitude: Number((vocalization / 3).toFixed(2)) });
    }

    // 多猫紧张场景：砂盆外排泄与躲藏
    if (cfg.scenario === 'multi-cat-tension') {
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
  };

  return {
    id: `sim-${cfg.scenario}-${cfg.seed}-${cfg.durationMin}m`,
    profile: cfg.profile,
    source: 'simulator',
    startedAt: Date.UTC(2026, 9, 2, 9, 0, 0),
    samples,
    events,
    truth,
  };
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
