/**
 * 分层的生理基线。
 *
 * **为什么必须分层**：同一只猫的心率与呼吸频率，「睡眠 / 家中静息 / 活动 / 诊室」
 * 四个条件下的中位数可以相差一倍以上（诊室实测心率 176±35 → 195 → 226 bpm；
 * 呼吸频率诊室中位 64 vs 家中静息 27 vs 午睡 20）。
 * 不分层的基线，测出来的差异是**情境**，不是身体。
 *
 * 「诊室读数不能当基线」这条方法学前提，在这里被变成一行代码：
 * 基线只能由**同一测量条件**下的**有效读数**建立，样本不足一律 null（不猜）。
 */
import { baselineOf, type BaselineStats } from '../baseline.ts';
import type { MeasurementCondition, Sample, VitalKey } from '../types.ts';
import { conditionOf, readingOf, VITAL_LABELS } from './readings.ts';

export interface VitalsBaseline {
  key: VitalKey;
  label: string;
  condition: MeasurementCondition;
  stats: BaselineStats;
  /** 建立基线用的可用读数个数 */
  n: number;
}

export interface VitalsBaselineOptions {
  minSamples?: number;
}

/**
 * 建立某通道在**指定条件**下的稳健基线。
 *
 * 样本不足（默认 30）返回 null —— 调用方应显示「数据不足」而不是猜一个值。
 * 只有 `validity === 'valid'` 的窗口参与计算：把运动伪迹算进基线，
 * 基线的离散度会被伪迹撑大，之后的漂移检测就再也测不出真实变化。
 */
export function vitalsBaselineOf(
  samples: readonly Sample[],
  key: VitalKey,
  condition: MeasurementCondition,
  opts: VitalsBaselineOptions = {},
): VitalsBaseline | null {
  const xs: number[] = [];
  for (const s of samples) {
    if (conditionOf(s) !== condition) continue;
    const v = readingOf(s, key);
    if (v !== null) xs.push(v);
  }
  const stats = baselineOf(xs, opts.minSamples);
  if (stats === null) return null;
  return { key, label: VITAL_LABELS[key], condition, stats, n: stats.n };
}

/** 基线的可读描述，只描述测量条件与量，不描述猫的状态。 */
export function describeVitalsBaseline(b: VitalsBaseline): string {
  return `${b.label}（${conditionLabel(b.condition)}基线）：中位数 ${b.stats.median.toFixed(1)}，MAD ${b.stats.mad.toFixed(2)}，n=${b.n}`;
}

function conditionLabel(c: MeasurementCondition): string {
  switch (c) {
    case 'sleep':
      return '睡眠';
    case 'resting':
      return '静息';
    case 'active':
      return '活动';
    case 'post-event':
      return '突发动作之后';
    case 'clinic':
      return '诊室环境';
    default:
      return String(c);
  }
}
