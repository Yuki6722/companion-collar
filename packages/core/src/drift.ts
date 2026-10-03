/**
 * 漂移检测：回答「它在慢慢变化吗？」
 *
 * 这是本产品最重要的能力，因为 PLOS ONE 2026（n=647）与 AAFP 指南都指出：
 * 主人的盲区不在**明显**信号（识别率 90%），而在**细微**与**渐变**的信号。
 *
 * 三条判据必须同时满足才报 notable，缺一降级：
 *   1. 效应量  |deltaRobust| ≥ 1.0
 *   2. 显著性  p < 0.05（置换检验）
 *   3. 持续性  recent 中越过基线 ±1σ 的比例 ≥ 0.6
 *
 * 第 3 条是为了排除「单次尖峰」——一次惊吓不是漂移。
 * **「无漂移」是合法结论**，必须能输出。
 */
import { baselineOf, median, type BaselineStats } from './baseline.ts';

/**
 * core 内部的确定性 PRNG，仅用于置换检验的**种子化重排**。
 *
 * 为什么不复用 `@camp/simulator` 的 Rng（两个原因，都是硬约束）：
 *   1. 依赖方向：simulator → core，不能反向。
 *   2. Node 的类型剥离（strip-only）**明确拒绝 node_modules 下的文件**，而 workspace 包
 *      在跑测试时是经 node_modules 符号链接解析的（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`）。
 *      因此 core 不能在**运行时**导入任何其它 workspace 包。
 * 于是这里保留一份最小实现。它与 simulator 的 Rng 用途不同：
 * 这里的只负责打乱，simulator 的负责生成数据。
 */
function makeShuffleRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type DriftDirection = 'up' | 'down' | 'none';
export type DriftSeverity = 'none' | 'watch' | 'notable';

export interface DriftResult {
  key: string;
  label: string;
  unit?: string;
  baselineMedian: number;
  recentMedian: number;
  /** 稳健效应量：以基线 sigma 为尺度 */
  deltaRobust: number;
  direction: DriftDirection;
  severity: DriftSeverity;
  /** 置换检验 p 值 */
  pValue: number;
  /** 近期样本越过 基线中位数 ±1σ（沿漂移方向）的比例 */
  sustainedPct: number;
  /** 是否构成「持续」而非「单次尖峰」 */
  sustained: boolean;
  nBaseline: number;
  nRecent: number;
  /** 因数据不足而降级时为 true */
  degraded: boolean;
}

export interface DriftOptions {
  /** 置换次数，默认 1000 */
  permutations?: number;
  /** 显著性阈值，默认 0.05 */
  alpha?: number;
  /** 两个窗口各自的最小样本数，默认 30 */
  minSamples?: number;
  /** 置换检验随机种子，默认 1（保证可复现） */
  seed?: number;
}

export interface MetricSeries {
  key: string;
  label: string;
  unit?: string;
  /** 较早的窗口 */
  baseline: readonly number[];
  /** 较晚的窗口 */
  recent: readonly number[];
}

const DEFAULT_PERMUTATIONS = 1000;
const DEFAULT_ALPHA = 0.05;
const SUSTAINED_THRESHOLD = 0.6;
const NOTABLE_DELTA = 1.0;
const WATCH_DELTA = 0.5;

/** 置换检验：重排合并样本后重算中位数差，估计观测差由随机产生的概率。 */
function permutationPValue(
  baseline: readonly number[],
  recent: readonly number[],
  observedDiff: number,
  permutations: number,
  rng: () => number,
): number {
  const combined = [...baseline, ...recent];
  const nB = baseline.length;
  const target = Math.abs(observedDiff);
  let atLeastAsExtreme = 0;

  for (let i = 0; i < permutations; i++) {
    const arr = combined.slice();
    for (let j = arr.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      const tmp = arr[j] as number;
      arr[j] = arr[k] as number;
      arr[k] = tmp;
    }
    const diff = Math.abs(median(arr.slice(nB)) - median(arr.slice(0, nB)));
    if (diff >= target) atLeastAsExtreme++;
  }
  // 加一校正，避免 p = 0
  return (atLeastAsExtreme + 1) / (permutations + 1);
}

function severityOf(delta: number, pValue: number, sustained: boolean, alpha: number): DriftSeverity {
  const mag = Math.abs(delta);
  if (mag < WATCH_DELTA) return 'none';
  // notable 需三条同时成立
  if (mag >= NOTABLE_DELTA && pValue < alpha && sustained) return 'notable';
  return 'watch';
}

/**
 * 检测单个指标的漂移。任一窗口样本不足则返回 null（不猜）。
 */
export function detectDrift(
  baseline: readonly number[],
  recent: readonly number[],
  meta: { key: string; label: string; unit?: string },
  opts: DriftOptions = {},
): DriftResult | null {
  const permutations = opts.permutations ?? DEFAULT_PERMUTATIONS;
  const alpha = opts.alpha ?? DEFAULT_ALPHA;
  const minSamples = opts.minSamples ?? 30;
  const rng = makeShuffleRng(opts.seed ?? 1);

  const b: BaselineStats | null = baselineOf(baseline, minSamples);
  const cleanRecent = recent.filter((x) => Number.isFinite(x));
  if (b === null || cleanRecent.length < minSamples) return null;

  const recentMedian = median(cleanRecent);
  const deltaRobust = b.degenerate ? 0 : (recentMedian - b.median) / b.sigma;
  const direction: DriftDirection = deltaRobust === 0 ? 'none' : deltaRobust > 0 ? 'up' : 'down';

  // 持续性：近期样本有多少越过基线中位数 ±1σ
  const threshold = direction === 'down' ? b.median - b.sigma : b.median + b.sigma;
  let beyond = 0;
  for (const v of cleanRecent) {
    if (direction === 'down' ? v < threshold : v > threshold) beyond++;
  }
  const sustainedPct = cleanRecent.length > 0 ? beyond / cleanRecent.length : 0;
  const sustained = sustainedPct >= SUSTAINED_THRESHOLD;

  const pValue = permutationPValue(baseline, cleanRecent, recentMedian - b.median, permutations, rng);
  const severity = severityOf(deltaRobust, pValue, sustained, alpha);

  const result: DriftResult = {
    key: meta.key,
    label: meta.label,
    baselineMedian: b.median,
    recentMedian,
    deltaRobust,
    direction,
    severity,
    pValue,
    sustainedPct,
    sustained,
    nBaseline: b.n,
    nRecent: cleanRecent.length,
    degraded: b.degenerate,
  };
  if (meta.unit !== undefined) result.unit = meta.unit;
  return result;
}

const SEVERITY_RANK: Record<DriftSeverity, number> = { notable: 2, watch: 1, none: 0 };

/**
 * 批量检测并按「先严重度、后效应量」排序。
 * 数据不足的指标被跳过（返回数组里不会出现），调用方应另行提示「数据不足」。
 */
export function detectDrifts(series: readonly MetricSeries[], opts: DriftOptions = {}): DriftResult[] {
  const out: DriftResult[] = [];
  for (const s of series) {
    const r = detectDrift(s.baseline, s.recent, { key: s.key, label: s.label, ...(s.unit !== undefined ? { unit: s.unit } : {}) }, opts);
    if (r !== null) out.push(r);
  }
  out.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (bySeverity !== 0) return bySeverity;
    return Math.abs(b.deltaRobust) - Math.abs(a.deltaRobust);
  });
  return out;
}

/** 人类可读的方向描述。刻意只描述**变化**，不描述感受或原因。 */
export function describeDrift(r: DriftResult): string {
  if (r.severity === 'none') return `${r.label}：未见明显变化`;
  const dir = r.direction === 'up' ? '高于' : '低于';
  const pct =
    r.baselineMedian !== 0
      ? `（约 ${(((r.recentMedian - r.baselineMedian) / Math.abs(r.baselineMedian)) * 100).toFixed(0)}%）`
      : '';
  const conf = r.sustained ? '持续' : '非持续（可能是单次波动）';
  return `${r.label}：近期中位数${dir}基线 ${Math.abs(r.deltaRobust).toFixed(1)}σ ${pct}，${conf}`;
}
