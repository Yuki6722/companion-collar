/**
 * 生理读数的漂移检测：**只在同一测量条件下比较**。
 *
 * 这一层几乎不发明新算法，只做一件事：把条件一致性变成**强制前置条件**。
 * 理由是已核实的现场事实——同一只猫的心率在"家里静息"与"诊室"之间可以相差 35% 以上，
 * 呼吸频率可以相差 2.4 倍（诊室中位 64 vs 家中静息 27）。
 * 如果允许跨条件比较，检测器测到的是**换了地方**，不是换了状态。
 *
 * 复用 `core/drift.ts` 的稳健效应量 + 置换检验 + 持续性判据，不改动它。
 */
import { detectDrift, type DriftOptions, type DriftResult } from '../drift.ts';
import { median } from '../baseline.ts';
import type { MeasurementCondition, Sample, VitalKey } from '../types.ts';
import { conditionOf, readingOf, VITAL_LABELS } from './readings.ts';

export interface VitalsWindow {
  samples: readonly Sample[];
  condition: MeasurementCondition;
}

export interface VitalsDriftInput {
  key: VitalKey;
  unit?: string;
  /** 较早的窗口 */
  baseline: VitalsWindow;
  /** 较晚的窗口 */
  recent: VitalsWindow;
}

export interface VitalsDriftResult extends DriftResult {
  /** 近期窗口的条件 */
  condition: MeasurementCondition;
  /** 基线窗口的条件 */
  baselineCondition: MeasurementCondition;
  /** 两个窗口条件不一致时为 true，此时**不得**解读为变化 */
  conditionMismatch: boolean;
}

function valuesIn(samples: readonly Sample[], key: VitalKey, condition: MeasurementCondition): number[] {
  const out: number[] = [];
  for (const s of samples) {
    if (conditionOf(s) !== condition) continue;
    const v = readingOf(s, key);
    if (v !== null) out.push(v);
  }
  return out;
}

/**
 * 检测某通道的漂移。
 *
 * 返回 null 的两种情形：① 任一窗口的可用读数不足（数据不足就不猜）；
 * ② 条件不一致且样本也不足以给出说明性中位数。
 * 条件不一致本身**不是** null：它返回一个 `conditionMismatch: true` 且严重度为 none 的结果，
 * 让界面能明确写出「不可比较」，而不是静默地什么都算不出来。
 */
export function detectVitalsDrift(
  input: VitalsDriftInput,
  opts: DriftOptions = {},
): VitalsDriftResult | null {
  const minSamples = opts.minSamples ?? 30;
  const mismatch = input.baseline.condition !== input.recent.condition;
  const bVals = valuesIn(input.baseline.samples, input.key, input.baseline.condition);
  const rVals = valuesIn(input.recent.samples, input.key, input.recent.condition);

  if (mismatch) {
    if (bVals.length < minSamples || rVals.length < minSamples) return null;
    return {
      key: input.key,
      label: VITAL_LABELS[input.key],
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      baselineMedian: median(bVals),
      recentMedian: median(rVals),
      deltaRobust: 0,
      direction: 'none',
      severity: 'none',
      pValue: 1,
      sustainedPct: 0,
      sustained: false,
      nBaseline: bVals.length,
      nRecent: rVals.length,
      degraded: true,
      condition: input.recent.condition,
      baselineCondition: input.baseline.condition,
      conditionMismatch: true,
    };
  }

  const r = detectDrift(bVals, rVals, {
    key: input.key,
    label: VITAL_LABELS[input.key],
    ...(input.unit !== undefined ? { unit: input.unit } : {}),
  }, opts);
  if (r === null) return null;
  return {
    ...r,
    condition: input.recent.condition,
    baselineCondition: input.baseline.condition,
    conditionMismatch: false,
  };
}

/** 人类可读描述。刻意只描述**变化与测量条件**，不描述原因或感受。 */
export function describeVitalsDrift(r: VitalsDriftResult): string {
  if (r.conditionMismatch) {
    return `${r.label}：不可比较——基线取自「${conditionLabel(r.baselineCondition)}」、近期取自「${conditionLabel(r.condition)}」，两者的差异可能只是换了条件。`;
  }
  const cond = conditionLabel(r.condition);
  if (r.severity === 'none') return `${r.label}（${cond}）：未见明显变化`;
  const dir = r.direction === 'up' ? '高于' : '低于';
  const conf = r.sustained ? '持续' : '非持续（可能是单次波动）';
  return `${r.label}（${cond}）：近期中位数${dir}基线 ${Math.abs(r.deltaRobust).toFixed(1)}σ，${conf}`;
}

export function conditionLabel(c: MeasurementCondition): string {
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
