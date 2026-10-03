#!/usr/bin/env node
/**
 * 生理曲线导出（命令行）。
 *
 * 用法：
 *   node src/export-physiology.ts [--out FILE] [--step 1] [--real-step 30]
 *   或经 pnpm：pnpm sim:curves
 *
 * **为什么需要这个工具**：App 要在界面上显示「心率 / 呼吸」这类指标，并在异常时提醒。
 * 提醒逻辑必须先在一份**知道答案**的数据上跑通——真值从哪来？就从这里。
 * 导出的 JSON 同时供三处使用：
 *   1. App 的指标图（不必自己再实现一遍生理模型）；
 *   2. 通知阈值的推导与回归（阈值是操作化常量，不是文献数字）；
 *   3. 之后项圈识别算法的夹具（`truth.kind` 就是答案）。
 *
 * ⚠️ 边界：全部数值都是**仿真真值**。猫用项圈的心率与呼吸频率未取得任何验证研究，
 * 因此这些曲线只说明「模型与阈值逻辑自洽」，不代表任何真实检出能力。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COLLAR_SAMPLING,
  INCIDENT_DEFS,
  INCIDENT_REFERRAL_NOTE,
  PHYSIOLOGY_BOUNDARY_NOTE,
  PHYSIOLOGY_EPISODES,
  PHYSIOLOGY_EPISODE_KINDS,
  PHYSIOLOGY_FEATURE_IDS,
  buildPhysiologyTrace,
  episodeMotion,
  episodeSpanS,
  describeSeparability,
  predictPhysiologyAt,
} from '../../core/src/index.ts';
import type { PhysiologyBaseline, PhysiologyFeatureValues, PhysiologyTrace } from '../../core/src/index.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.resolve(HERE, '../../../data/physiology/curves.json');

function argOf(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v ?? fallback;
}

function numOf(name: string, fallback: number): number {
  const n = Number(argOf(name, String(fallback)));
  return Number.isFinite(n) ? n : fallback;
}

const outFile = path.resolve(argOf('out', DEFAULT_OUT));
const stepS = numOf('step', 1);
const realStepS = numOf('real-step', 30);

/**
 * 个体静息基线。
 *
 * ⚠️ 为什么是「基线」而不是「正常值」：猫的心率参考区间本身存在来源冲突
 * （静息表 120–140 vs 分诊表 150–220），呼吸频率在诊室/家中静息/午睡三种条件下
 * 是三个显著不同的量。因此曲线一律是**相对该猫自身基线的偏离**。
 */
const BASELINE: PhysiologyBaseline = { hrBpm: 140, hrvRmssdMs: 45, rrBpm: 25 };

/**
 * 通知阈值的**候选值**。
 *
 * ⚠️ 全部是操作化常量，不是文献数字，也**不构成**任何判断：
 *   阈值取多少是产品决策 + 真机标定问题，这里只给出一个可被回归的自洽取值。
 * `gatedBy` 是必须前置的读数有效性条件——不先过这一关，报警一定会在运动伪影上误报。
 */
const NOTIFY_CANDIDATES = [
  {
    id: 'hrSustainedAboveBaseline',
    label: '心率持续高于自身静息基线',
    feature: 'hrRelative',
    comparison: '>=',
    threshold: 0.25,
    minConsecutiveWindows: 2,
    gatedBy: 'readingQuality.hr.validity === "valid"',
    why: '抽搐的恢复段与呕吐的干呕期都会把心率抬高；单次读数不构成任何判断，因此要求连续多个聚合窗口。',
  },
  {
    id: 'rrSustainedAboveBaseline',
    label: '呼吸频率持续高于自身静息基线',
    feature: 'rrBpm',
    comparison: '>=',
    threshold: 1.4,
    unit: '倍基线',
    minConsecutiveWindows: 2,
    gatedBy: 'readingQuality.rr.validity === "valid"',
    why: '呼吸通道的体动门限最严，可用窗口本就稀少；阈值按倍率而不是绝对次数，避免跨测量条件比较。',
  },
  {
    id: 'motionBandExclusive',
    label: '机械频带互斥：高频抖动或低频用力二者之一出现',
    feature: 'tremorPower | retchPower',
    comparison: '>=',
    threshold: 0.5,
    minConsecutiveWindows: 1,
    gatedBy: '—（该特征本身即来自加速度计）',
    why: '这是两个状态在颈部最可分的一点：抽搐落在 8–15 Hz、干呕落在 1.5–3 Hz，互不重叠。',
  },
] as const;

const traces: Record<string, unknown> = {};
for (const kind of PHYSIOLOGY_EPISODE_KINDS) {
  const def = PHYSIOLOGY_EPISODES[kind];
  const demo: PhysiologyTrace = buildPhysiologyTrace(kind, BASELINE, { stepS });
  const real = buildPhysiologyTrace(kind, BASELINE, { realTime: true, stepS: realStepS });
  traces[kind] = {
    label: def.label,
    hint: def.hint,
    actionDemoDurationS: def.kind === 'vomiting' ? INCIDENT_DEFS.vomit.demoDurationS : INCIDENT_DEFS.seizure.demoDurationS,
    physiologyWindowS: episodeSpanS(kind, false),
    realDurationS: episodeSpanS(kind, true),
    phases: def.phases.map((p) => ({ id: p.id, label: p.label, hint: p.hint, durationS: p.ops.durationS })),
    demo,
    real,
  };
}

/** 峰值对照表：一眼看出两个状态在哪些通道上被拉开。 */
const featureTable = PHYSIOLOGY_EPISODE_KINDS.map((kind) => {
  const trace = buildPhysiologyTrace(kind, BASELINE, { stepS });
  const peak = (pick: (s: PhysiologyTrace['samples'][number]) => number): number =>
    Number(Math.max(...trace.samples.map(pick)).toFixed(3));
  const trough = (pick: (s: PhysiologyTrace['samples'][number]) => number): number =>
    Number(Math.min(...trace.samples.map(pick)).toFixed(3));
  return {
    kind,
    label: PHYSIOLOGY_EPISODES[kind].label,
    peakHrBpm: peak((s) => s.hrBpm),
    peakRrBpm: peak((s) => s.rrBpm),
    troughHrvRmssdMs: trough((s) => s.hrvRmssdMs),
    peakRespIrregularity: peak((s) => s.respIrregularity),
    peakMotionArtifact: peak((s) => s.motionArtifact),
    peakTremorPower: peak((s) => s.tremorPower),
    peakRetchPower: peak((s) => s.retchPower),
    peakTempDeltaC: peak((s) => s.tempDeltaC),
    /** 读数不可采信的窗口占比：报警逻辑必须先过这一关 */
    unusableShare: Number(
      (trace.samples.filter((s) => !s.readingTrustworthy).length / trace.samples.length).toFixed(3),
    ),
  };
});

const at = (kind: 'seizure' | 'vomiting', t: number): PhysiologyFeatureValues =>
  predictPhysiologyAt({ ...BASELINE, episode: kind, episodeElapsedS: t, motion: episodeMotion(kind) }).features;

const separability = describeSeparability(at('seizure', 7.5), at('vomiting', 10)).map((d) => ({
  feature: d.feature,
  seizure: d.a,
  vomiting: d.b,
  relativeDelta: d.relativeDelta,
}));

const payload = {
  generatedBy: 'packages/simulator/src/export-physiology.ts',
  /** ⚠️ 结论只到这一行为止：这是仿真真值，不是对真实设备的性能宣称。 */
  boundary: PHYSIOLOGY_BOUNDARY_NOTE,
  referral: INCIDENT_REFERRAL_NOTE,
  baseline: BASELINE,
  featureIds: PHYSIOLOGY_FEATURE_IDS,
  /** 采集参数：全部 unverified，不得展示数字。 */
  collarSampling: COLLAR_SAMPLING,
  traces,
  featureTable,
  separability,
  notifyCandidates: NOTIFY_CANDIDATES,
  notes: [
    '全部数值为仿真注入真值；猫用项圈的心率与呼吸频率未取得任何验证研究。',
    '可分性是**这套仿真参数的设计性质**，不是对真实猫的检出能力。',
    '通知阈值是操作化常量，需真机数据标定；报警前必须先过读数有效性这一关。',
    '体温是慢通道：演示时间线（30 秒）代表十余分钟的真实过程，因此体温按真实时长推进。',
  ],
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');

// ---------------------------------------------------------------- 控制台摘要
console.log('=== 生理曲线导出（仿真真值）===');
for (const row of featureTable) {
  console.log(
    `${row.label.padEnd(4, '　')}: 心率峰值 ${String(row.peakHrBpm).padStart(6)} bpm` +
      ` · 呼吸峰值 ${String(row.peakRrBpm).padStart(5)} 次/分` +
      ` · 抖动能量 ${row.peakTremorPower} / 起伏能量 ${row.peakRetchPower}` +
      ` · 不可采信占比 ${(row.unusableShare * 100).toFixed(0)}%`,
  );
}
console.log('可分通道:', separability.map((d) => `${d.feature}(${d.relativeDelta})`).join('、'));
console.log('已写入  :', outFile);
console.log(PHYSIOLOGY_BOUNDARY_NOTE);
