/**
 * 读数变化提示（App 的数字变红 + 弹窗）的单测。
 *
 * 这一层的风险集中在"什么时候打扰主人"，因此断言几乎全部围绕**误报**：
 *   - 跨条件不比、体动大不比、环境吵不比、参考不足不比；
 *   - 只有"读数真的偏离"或"急性窗口里读不到"才弹；
 *   - 弹窗正文只列可核查的事实，且边界句与转诊路径必须一起出现。
 *
 * 真·零误报的统计断言在 `packages/simulator/test/vitals.test.ts` 里
 * （那边能同时拿到仿真会话与提示层）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VITALS_CONSTANTS,
  VITALS_BOUNDARY_NOTE,
  VITAL_ALERT_REFERRAL,
  VITAL_ALERT_SUBTITLE,
  VITAL_ALERT_TITLE,
  evaluateVitalAlerts,
  highlightedChannels,
  highestAlertLevel,
  vitalsConstant,
} from '../src/index.ts';
import type { ReadingValidity, Sample, VitalKey } from '../src/index.ts';

// ---------------------------------------------------------------- 夹具

interface Opts {
  validity?: ReadingValidity;
  condition?: Sample['measurementCondition'];
  noiseDbA?: number;
  motionIndex?: number;
  physiologyState?: string;
}

/** 造一个三通道齐备的采样点（贴近真实会话的形状）。 */
function mk(
  t: number,
  values: { hr?: number; rr?: number; temp?: number },
  opts: Opts = {},
): Sample {
  const validity = opts.validity ?? 'valid';
  return {
    t,
    hrBpm: values.hr,
    rrBpm: values.rr,
    tempSurfaceC: values.temp,
    measurementCondition: opts.condition ?? 'resting',
    motionIndex: opts.motionIndex ?? 0.05,
    noiseDbA: opts.noiseDbA ?? 38,
    ...(opts.physiologyState ? { physiologyState: opts.physiologyState } : {}),
    readingQuality: {
      ...(values.hr !== undefined ? { hr: { validity, score: 0.9, windowS: 60 } } : {}),
      ...(values.rr !== undefined ? { rr: { validity, score: 0.6, windowS: 60 } } : {}),
      ...(values.temp !== undefined ? { temp: { validity, score: 0.95, windowS: 60 } } : {}),
    },
  };
}

/** 造一段平静基线：每 10 秒一个点，心跳 160、呼吸 24、体表温 36.0。 */
function calmBaseline(n = 60, over: (i: number) => Partial<{ hr: number; rr: number; temp: number }> = () => ({})): Sample[] {
  return Array.from({ length: n }, (_, i) => {
    const o = over(i);
    return mk(i * 10, { hr: 160 + (i % 3) - 1, rr: 24 + (i % 2), temp: 36 + ((i % 5) - 2) * 0.02, ...o });
  });
}

function evaluateAt(samples: Sample[], t: number): ReturnType<typeof evaluateVitalAlerts> {
  const sample = samples.find((s) => s.t === t) ?? (samples[samples.length - 1] as Sample);
  return evaluateVitalAlerts({ sample, samples, atS: t });
}

// ---------------------------------------------------------------- 不打扰的四种情形

test('提示：平静会话不弹提醒（心率/呼吸/体表温都在参考值附近）', () => {
  const samples = calmBaseline();
  for (const t of [300, 400, 500]) {
    const a = evaluateAt(samples, t);
    assert.equal(a.shouldNotify, false, `t=${t} 不该弹提醒：${a.details.join(' / ')}`);
    assert.equal(highestAlertLevel(a), 'none');
  }
});

test('提示：跨条件不比（睡眠参考不得用来评价静息读数）', () => {
  // 前 40 个点是睡眠（心率系统性偏低 12%、呼吸偏低 22%），后 20 个点是静息。
  const samples: Sample[] = [
    ...calmBaseline(40).map((s) => ({ ...s, measurementCondition: 'sleep' as const, hrBpm: 141, rrBpm: 19 })),
    ...calmBaseline(20).map((s, i) => ({ ...s, t: 400 + i * 10, measurementCondition: 'resting' as const })),
  ];
  const a = evaluateAt(samples, 450);
  // 若把睡眠读数混进参考，静息的心率会被算成"高了 12%"；同条件参考下应接近 0
  const hr = a.channels.find((c) => c.key === 'hr');
  assert.ok(hr);
  assert.ok(Math.abs(hr.deviationPct ?? 1) < 0.05, `同条件参考应让偏离接近 0，实际 ${hr.deviationPct}`);
  assert.equal(a.shouldNotify, false);
});

test('提示：体动大或环境吵的窗口一律不做数值比较', () => {
  const samples = [
    ...calmBaseline(50),
    mk(500, { hr: 240, rr: 48, temp: 36.9 }, { motionIndex: 0.8 }),
    mk(510, { hr: 240, rr: 48, temp: 36.9 }, { noiseDbA: 68 }),
  ];
  const moving = evaluateAt(samples, 500);
  assert.equal(moving.shouldNotify, false, '高体动窗口不应比较读数');
  assert.match(moving.channels[0]!.reason, /体动/);

  const noisy = evaluateAt(samples, 510);
  assert.equal(noisy.shouldNotify, false, '噪声中的读数不应比较');
  assert.match(noisy.channels[0]!.reason, /体动/);
});

test('提示：参考窗口不足时明确说明，而不是拿两三个点当基线', () => {
  const samples = calmBaseline(3);
  const a = evaluateAt(samples, 20);
  assert.equal(a.shouldNotify, false);
  assert.match(a.channels[0]!.reason, /少于/);
});

// ---------------------------------------------------------------- 会打扰的两种情形

test('提示：读数偏离超过阈值 → 该通道 alert，并弹出提醒', () => {
  const samples = [
    ...calmBaseline(60),
    // 心率 +40%、呼吸 +50%、体表温 +0.8 °C
    mk(600, { hr: 224, rr: 36, temp: 36.8 }, { motionIndex: 0.2 }),
  ];
  const a = evaluateAt(samples, 600);
  assert.equal(a.shouldNotify, true);
  const hot = highlightedChannels(a);
  assert.deepEqual(hot.sort(), ['hr', 'rr', 'temp']);
  assert.equal(a.title, VITAL_ALERT_TITLE);
  assert.equal(a.title, '宠物状态异常');
  assert.equal(a.subtitle, VITAL_ALERT_SUBTITLE);
  // 副标题的意义：把"异常"落回可证伪的通道与"相对自身基线"这两个说法上
  assert.match(a.subtitle, /心率/);
  assert.match(a.subtitle, /自身基线/);
  assert.ok(a.details.length >= 3);
  for (const d of a.details) assert.match(d, /参考值|阈值|生理过程/);
});

test('提示：急性窗口里"读不到"也要标红并提醒（设备失去测量能力本身就是信息）', () => {
  const samples = [
    ...calmBaseline(60),
    mk(600, { hr: 300, rr: 60, temp: 36.3 }, { validity: 'motion-artifact', motionIndex: 0.98, physiologyState: 'ictal' }),
  ];
  const a = evaluateAt(samples, 600);
  assert.equal(a.acuteWindow, true);
  assert.equal(a.readingTrustworthinessLimited, true);
  assert.equal(a.shouldNotify, true);
  const hot = highlightedChannels(a);
  assert.ok(hot.includes('hr') && hot.includes('rr'), '不可用的通道也要标红');
  assert.ok(a.details.some((d) => /急性动作的生理过程/.test(d)));
  // 不可用时**不得**给出数值判断
  const hr = a.channels.find((c) => c.key === 'hr');
  assert.equal(hr?.deviationPct, null);
  assert.equal(hr?.usable, false);
});

test('提示：只有体表温用绝对阈值，心率/呼吸用比例', () => {
  const samples = [
    ...calmBaseline(60),
    mk(600, { hr: 168, rr: 25, temp: 36.9 }, { motionIndex: 0.2 }),
  ];
  const a = evaluateAt(samples, 600);
  const temp = a.channels.find((c) => c.key === 'temp');
  assert.ok(temp);
  assert.equal(temp.deviationAbs !== null, true);
  assert.equal(temp.deviationPct, null);
  assert.equal(temp.level, 'alert', `+0.9 °C 应越线，实际 ${temp.deviationAbs}`);
  // 心率只高了 5%，不该越线
  assert.equal(a.channels.find((c) => c.key === 'hr')?.level, 'none');
});

// ---------------------------------------------------------------- 文案与阈值来源

test('提示：弹窗文案包含边界句与转诊路径，且标题是这句产品口径', () => {
  const samples = [...calmBaseline(60), mk(600, { hr: 240, rr: 40, temp: 36.8 }, { motionIndex: 0.2 })];
  const a = evaluateAt(samples, 600);
  assert.equal(a.title, '宠物状态异常');
  assert.equal(a.boundary, VITALS_BOUNDARY_NOTE);
  assert.match(a.boundary, /不构成/);
  assert.equal(a.referral, VITAL_ALERT_REFERRAL);
  assert.match(a.referral, /联系兽医/);
});

test('提示：全部阈值来自登记表，而不是散落在实现里', () => {
  for (const id of [
    'alertReferenceWindowS',
    'alertMinReferenceWindows',
    'alertNoiseLimitDbA',
    'alertHrDeviation',
    'alertRrDeviation',
    'alertTempDeviationC',
    'alertWatchRatio',
  ]) {
    const c = vitalsConstant(id);
    assert.ok(c, `缺少操作化常量 ${id}`);
    assert.ok(c.why.length > 20, `${id} 应写明为什么这么选`);
  }
  assert.ok(VITALS_CONSTANTS.length >= 15);
});

test('提示：通道结果永远齐备（界面不需要判断"在不在结果里"）', () => {
  const keys: VitalKey[] = ['hr', 'rr', 'temp'];
  const a = evaluateAt(calmBaseline(60), 300);
  assert.deepEqual(a.channels.map((c) => c.key), keys);
  const empty = evaluateAt([mk(0, {})], 0);
  assert.deepEqual(empty.channels.map((c) => c.key), keys);
  assert.equal(empty.shouldNotify, false);
});
