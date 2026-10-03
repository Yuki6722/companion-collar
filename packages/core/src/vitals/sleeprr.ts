/**
 * 睡眠呼吸频率：把**唯一一条有居家阈值的协议**做进产品。
 *
 * 事实基础（`docs/research/07` §2.3）：ACVIM 2020 共识给出的行动规则是
 * 「均值 >30 次/分，或多次测量 >30，likely warrant additional evaluation」，
 * 而它的**原始做法是主人每天用眼睛数**。这是本项目检索范围内唯一一条
 * 「居家可执行 + 有阈值 + 有同行评审」的预警协议。
 *
 * 因此这一层做两件事：
 *   1. 只采信 `condition === 'sleep'` 且 `validity === 'valid'` 的读数——体动窗口的呼吸读数不是读数；
 *   2. 输出**结构化问题 + 转诊路径**，而不是一个"是否异常"的结论。
 *
 * 两处刻意偏离原文，都必须展示给用户：
 *   - 原文用**均值**，本项目用**中位数**（稳健统计；单次伪迹不该抬高判断）；
 *   - 原文说「多次测量」，没有定义次数，本项目按**独立睡眠时段**计数。
 */
import type { EvidenceTag, Sample } from '../types.ts';
import {
  VITALS_BOUNDARY_NOTE,
  conditionOf,
  readingOf,
} from './readings.ts';
import {
  vitalsConstantValue,
  vitalsParam,
  vitalsParamNumber,
} from './params.ts';

/** 一次睡眠时段（bout）的呼吸频率汇总。 */
export interface SleepBout {
  /** 时段起点（会话内秒） */
  t: number;
  /** 可用读数个数 */
  n: number;
  medianBpm: number;
}

export interface SleepRespRateSummary {
  condition: 'sleep';
  /** 共识建议的评估阈值（次/分），取自登记表，不在本文件里写死 */
  thresholdBpm: number;
  /** 全部可用睡眠读数的中位数；无可用读数时为 null */
  medianBpm: number | null;
  /** 可用读数个数 */
  n: number;
  /** 识别出的独立睡眠时段 */
  bouts: readonly SleepBout[];
  /** 中位数超过阈值的时段数 */
  overThresholdBouts: number;
  /** 判「多次」所需的时段数（操作化常量，原文未定义） */
  manyBoutsNeeded: number;
  /** 是否触发共识里那条行动规则 */
  exceeds: boolean;
  /** 结构化提示：可回答的问题 + 转诊路径 */
  message: string;
  /** 必须常驻在提示附近的边界句 */
  boundary: string;
  evidence: EvidenceTag;
}

/** 需要主人回答的问题。刻意是「可回答」的，而不是「你注意观察」这种无法执行的建议。 */
export const SLEEP_RR_QUESTIONS: readonly string[] = [
  '最近几天，是否多次在它睡着时数到呼吸超过阈值？',
  '数的时候它是不是真的睡着了（侧卧、无体动、眼睛闭合）？',
  '是否出现过张口呼吸，或呼吸看起来费力、腹部起伏明显？',
  '是否同时出现不吃东西、精神明显变差、躲起来不出来？',
];

const FALLBACK_THRESHOLD = 30;
const FALLBACK_MANY = 3;

/**
 * 汇总睡眠呼吸频率。
 *
 * 时段切分规则：相邻可用睡眠读数的时间间隔超过 2 个聚合窗口即视为新的时段。
 * 这条规则用的是既有操作化常量（聚合窗口），不额外发明数字。
 */
export function sleepRespRateSummary(samples: readonly Sample[]): SleepRespRateSummary {
  const thresholdBpm = vitalsParamNumber('sleepRespRateThreshold') ?? FALLBACK_THRESHOLD;
  const manyBoutsNeeded = vitalsConstantValue('manyOverThresholdCount', FALLBACK_MANY);
  const gapS = vitalsConstantValue('aggregationWindowS', 60) * 2;
  const evidence =
    vitalsParam('sleepRespRateThreshold')?.evidence ??
    ({ tier: 'moderate', source: 'ACVIM 2020（经 docs/research/07 §2.3 汇总核实）' } as EvidenceTag);

  const picks: Array<{ t: number; v: number }> = [];
  for (const s of samples) {
    if (conditionOf(s) !== 'sleep') continue;
    const v = readingOf(s, 'rr');
    if (v !== null) picks.push({ t: s.t, v });
  }

  const bouts: SleepBout[] = [];
  let current: Array<{ t: number; v: number }> = [];
  const flush = (): void => {
    if (current.length === 0) return;
    const vs = current.map((x) => x.v).sort((a, b) => a - b);
    const mid = vs.length >> 1;
    const medBpm = vs.length % 2 === 1 ? (vs[mid] as number) : (((vs[mid - 1] as number) + (vs[mid] as number)) / 2);
    bouts.push({ t: current[0]?.t ?? 0, n: current.length, medianBpm: Number(medBpm.toFixed(1)) });
    current = [];
  };
  for (const p of picks) {
    const prev = current[current.length - 1];
    if (prev && p.t - prev.t > gapS) flush();
    current.push(p);
  }
  flush();

  const all = picks.map((x) => x.v).sort((a, b) => a - b);
  let medianBpm: number | null = null;
  if (all.length > 0) {
    const mid = all.length >> 1;
    medianBpm = all.length % 2 === 1 ? (all[mid] as number) : (((all[mid - 1] as number) + (all[mid] as number)) / 2);
    medianBpm = Number(medianBpm.toFixed(1));
  }

  const overThresholdBouts = bouts.filter((b) => b.medianBpm > thresholdBpm).length;
  const exceeds = medianBpm !== null && (medianBpm > thresholdBpm || overThresholdBouts >= manyBoutsNeeded);

  return {
    condition: 'sleep',
    thresholdBpm,
    medianBpm,
    n: all.length,
    bouts,
    overThresholdBouts,
    manyBoutsNeeded,
    exceeds,
    message: buildMessage({ medianBpm, thresholdBpm, overThresholdBouts, manyBoutsNeeded, exceeds, n: all.length, bouts: bouts.length }),
    boundary: VITALS_BOUNDARY_NOTE,
    evidence,
  };
}

function buildMessage(input: {
  medianBpm: number | null;
  thresholdBpm: number;
  overThresholdBouts: number;
  manyBoutsNeeded: number;
  exceeds: boolean;
  n: number;
  bouts: number;
}): string {
  if (input.medianBpm === null || input.n === 0) {
    return `本段没有可用的睡眠读数（共识别到 ${input.bouts} 个睡眠时段，可用读数 0 个），因此无法给出睡眠呼吸频率。睡眠读数需要猫真正睡着且无明显体动；在这段时间里，请按下面的问题用眼睛数一次，作为对照。`;
  }
  const base = `最近一段共 ${input.bouts} 个睡眠时段、${input.n} 个可用读数，呼吸频率的中位数为 ${input.medianBpm} 次/分`;
  if (!input.exceeds) {
    return `${base}，未超过共识建议的评估阈值 ${input.thresholdBpm} 次/分。请继续在不同睡眠时段各数一次；单次测量不能说明问题。`;
  }
  const why =
    input.medianBpm > input.thresholdBpm
      ? `中位数已超过共识建议的评估阈值 ${input.thresholdBpm} 次/分`
      : `共有 ${input.overThresholdBouts} 个睡眠时段的中位数超过共识建议的评估阈值 ${input.thresholdBpm} 次/分（本项目把「多次测量」定义为 ${input.manyBoutsNeeded} 个独立睡眠时段；原文未给出具体次数）`;
  return `${base}，${why}。这**不构成任何判断**，请先回答下面四个问题，并把这段记录带给兽医：① 是否在它真正睡着时测的？② 最近几天是否多次超过阈值？③ 是否出现张口呼吸或呼吸费力？④ 是否同时不吃东西、精神明显变差或长时间躲起来？其中③属于需要立即就诊的表现，请不要等待。`;
}
