/**
 * 稳健基线。
 *
 * 为什么用中位数 + MAD 而不是均值 + 标准差：
 * 宠物生理数据里尖峰很多（一次惊吓就能把均值拉走），而本产品要检测的是
 * **缓慢漂移**，不是瞬时波动。MAD 对离群点的抵抗正是这个场景需要的。
 *
 * 核心原则：**数据不足时返回 null，绝不猜。** UI 应显示「数据不足」。
 */

/** 建立基线所需的最小样本数。低于此值一律视为不足。 */
export const MIN_BASELINE_SAMPLES = 30;

export interface BaselineStats {
  median: number;
  /** 原始中位绝对偏差 */
  mad: number;
  /** 正态分布下等效标准差 = 1.4826 × MAD */
  sigma: number;
  n: number;
  min: number;
  max: number;
  /** 信号近乎常量（sigma ≈ 0），稳健 z 无意义 */
  degenerate: boolean;
}

/** 中位数。空数组返回 NaN。 */
export function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? (s[mid] as number) : (((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

/** 原始中位绝对偏差。 */
export function mad(xs: readonly number[], med?: number): number {
  if (xs.length === 0) return Number.NaN;
  const m = med ?? median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

/** 线性插值分位数（q ∈ [0,1]）。 */
export function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo] as number;
  const frac = pos - lo;
  return (s[lo] as number) * (1 - frac) + (s[hi] as number) * frac;
}

/** 从样本数组里抽取某个数值字段，自动跳过缺失值与 NaN。 */
export function valuesOf<T>(
  samples: readonly T[],
  pick: (s: T) => number | undefined,
): number[] {
  const out: number[] = [];
  for (const s of samples) {
    const v = pick(s);
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/**
 * 计算基线。样本不足返回 null —— 调用方必须处理这个分支。
 */
export function baselineOf(
  xs: readonly number[],
  minSamples: number = MIN_BASELINE_SAMPLES,
): BaselineStats | null {
  const clean = xs.filter((x) => Number.isFinite(x));
  if (clean.length < minSamples) return null;

  const med = median(clean);
  const m = mad(clean, med);
  const sigma = 1.4826 * m;

  return {
    median: med,
    mad: m,
    sigma,
    n: clean.length,
    min: Math.min(...clean),
    max: Math.max(...clean),
    degenerate: sigma < 1e-9,
  };
}

/**
 * 稳健 z 分数：相对**这只宠物自己的**基线，而不是种群平均值。
 * 退化信号（sigma ≈ 0）返回 0，避免除零产生 Infinity 污染下游。
 */
export function robustZ(x: number, b: BaselineStats): number {
  if (b.degenerate) return 0;
  return (x - b.median) / b.sigma;
}
