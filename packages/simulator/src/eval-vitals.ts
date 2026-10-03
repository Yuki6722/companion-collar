#!/usr/bin/env node
/**
 * 生理读数的可用性与失真报告（命令行）。
 *
 * 用法：
 *   node src/eval-vitals.ts [--seed 42] [--minutes 1440] [--scenario living-room-day]
 *
 * 为什么需要它：本阶段的结论不是"项圈测到了心率/呼吸/体温"，而是
 * **"三个通道各有多少时间真的可用、坏掉的时候坏成什么样"**。
 * 这些数字只有在会话规模（小时级）上才有意义，因此单独做一个报告工具。
 *
 * ⚠️ 报告里的每个数字都只说明**仿真器与算法链路是否自洽**：
 *   项圈的心率、呼吸频率、体表温在猫上都未取得验证研究。
 */
import { generateSession } from './index.ts';
import type { ScenarioId } from './index.ts';
import type { PetProfile, Sample } from '@camp/core';
import { summarizeAvailability, sleepRespRateSummary, VITALS_SIM_NOTE } from '../../core/src/index.ts';

function argOf(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v ?? fallback;
}

function numOf(name: string, fallback: number): number {
  const n = Number(argOf(name, String(fallback)));
  return Number.isFinite(n) ? n : fallback;
}

const seed = numOf('seed', 42);
const minutes = numOf('minutes', 1440);
const scenario = argOf('scenario', 'living-room-day') as ScenarioId;

const profile: PetProfile = {
  species: 'cat',
  breedId: 'domestic-shorthair',
  weightKg: 4.2,
  heightCm: 24,
  ageMonths: 36,
};

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

function pearson(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Number.NaN;
  const ma = a.reduce((p, c) => p + c, 0) / n;
  const mb = b.reduce((p, c) => p + c, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = (a[i] as number) - ma;
    const y = (b[i] as number) - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return num / Math.sqrt(da * db || 1);
}

/** 最小二乘拟合 + R² + 平均绝对误差：用来证明"换算"不成立。 */
function linearFit(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number; r2: number; mae: number } {
  const n = Math.min(xs.length, ys.length);
  const mx = xs.reduce((p, c) => p + c, 0) / n;
  const my = ys.reduce((p, c) => p + c, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - mx;
    const dy = (ys[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let err = 0;
  for (let i = 0; i < n; i++) {
    err += Math.abs((ys[i] as number) - (intercept + slope * (xs[i] as number)));
  }
  return { slope, intercept, r2: syy === 0 ? 0 : (sxy * sxy) / (sxx * syy), mae: err / n };
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? (s[mid] as number) : (((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

const session = generateSession({ profile, seed, durationMin: minutes, scenario });
const samples = session.samples;
const availability = summarizeAvailability(samples);

console.log('=== 生理读数可用性报告（仿真）===');
console.log('场景      :', scenario);
console.log('种子      :', seed);
console.log('时长      :', minutes, '分钟 →', samples.length, '个采样点');

console.log('\n-- 各通道可用性 --');
for (const key of ['hr', 'rr', 'temp'] as const) {
  const ch = availability.channels[key];
  const reasons = Object.entries(ch.reasons)
    .map(([k, v]) => `${k} ${v}`)
    .join('、');
  console.log(
    `${ch.label.padEnd(4, '　')}: 报出 ${pct(ch.reportedShare)} / 可用 ${pct(ch.validShare)}（${ch.validWindows}/${ch.totalWindows}）  ${reasons}`,
  );
}
console.log('最受限通道:', availability.mostLimited ?? '（无）');

console.log('\n-- 测量条件分布 --');
for (const [k, v] of Object.entries(availability.conditions)) {
  console.log(`  ${k}: ${v} (${pct((v ?? 0) / samples.length)})`);
}

// ---------------- 体表温 vs 核心温 ----------------
const truth = session.truth?.vitals ?? [];
const surface: number[] = [];
const core: number[] = [];
for (let i = 0; i < samples.length; i++) {
  const s = samples[i] as Sample;
  const v = truth[i];
  if (s.tempSurfaceC !== undefined && v) {
    surface.push(s.tempSurfaceC);
    core.push(v.tempCoreC);
  }
}
const r = pearson(surface, core);
const fit = linearFit(core, surface);
console.log('\n-- 体表温读数 vs 核心温真值（证明"换算"不成立）--');
console.log('  采样对数      :', surface.length);
console.log('  Pearson r     :', r.toFixed(3));
console.log('  线性拟合 R²   :', fit.r2.toFixed(4));
console.log('  拟合斜率      :', fit.slope.toFixed(3), '（≈0 意味着体表温几乎不携带核心温的信息）');
console.log('  拟合后 MAE    :', fit.mae.toFixed(2), '°C');
console.log('  读数中位      :', median(surface).toFixed(2), '°C   真值中位:', median(core).toFixed(2), '°C');

// ---------------- 情境偏移对照 ----------------
const home = generateSession({ profile, seed, durationMin: Math.min(minutes, 240), scenario: 'living-room-day' });
const clinic = generateSession({ profile, seed, durationMin: Math.min(minutes, 240), scenario: 'vet-visit' });
const medOf = (s: typeof home, key: 'hrBpm' | 'rrBpm'): number =>
  median(s.samples.map((x) => x[key]).filter((v): v is number => typeof v === 'number'));
const truthMed = (s: typeof home, key: 'hrTrueBpm' | 'rrTrueBpm'): number =>
  median((s.truth?.vitals ?? []).map((v) => v[key]));
console.log('\n-- 情境对照（同种子、同真值，只有读数被情境抬高）--');
console.log(
  `  心率 读数中位: 家中 ${medOf(home, 'hrBpm').toFixed(1)} → 诊室 ${medOf(clinic, 'hrBpm').toFixed(1)}  ` +
    `| 真值中位: ${truthMed(home, 'hrTrueBpm').toFixed(1)} → ${truthMed(clinic, 'hrTrueBpm').toFixed(1)}`,
);
console.log(
  `  呼吸 读数中位: 家中 ${medOf(home, 'rrBpm').toFixed(1)} → 诊室 ${medOf(clinic, 'rrBpm').toFixed(1)}  ` +
    `| 真值中位: ${truthMed(home, 'rrTrueBpm').toFixed(1)} → ${truthMed(clinic, 'rrTrueBpm').toFixed(1)}`,
);

// ---------------- 睡眠呼吸频率 ----------------
const sleep = sleepRespRateSummary(samples);
console.log('\n-- 睡眠呼吸频率（唯一有共识阈值的居家协议）--');
console.log('  可用睡眠读数 :', sleep.n, '个，识别时段', sleep.bouts.length, '个');
console.log('  中位数       :', sleep.medianBpm === null ? '（无）' : `${sleep.medianBpm} 次/分`);
console.log('  超过阈值的时段:', sleep.overThresholdBouts, `/ 触发条件 ${sleep.manyBoutsNeeded} 个`);
console.log('  触发共识规则 :', sleep.exceeds ? '是' : '否');
console.log('  提示         :', sleep.message);

console.log('\n' + VITALS_SIM_NOTE);
