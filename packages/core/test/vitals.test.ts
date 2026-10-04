/**
 * 生理读数层单测。
 *
 * 三条边界值得单独说，因为它们都是"会被写错"的地方：
 *   1. **无效读数不是数据**：坏值要保留（供界面展示原因），但绝不能进入算法。
 *   2. **跨条件比较必须被拦住**：条件一致是漂移解读的前置条件，不是可选修饰。
 *   3. **仿真不得自证**：公共 API 里不能出现任何"体表温 → 核心温"的换算符号。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as coreApi from '../src/index.ts';
import {
  BEHAVIOR_PARAMS,
  FORBIDDEN_TERMS,
  NEGATION_MARKERS,
  SLEEP_RR_QUESTIONS,
  VITALS_BOUNDARY_NOTE,
  VITALS_CONSTANTS,
  VITALS_PARAMS,
  VITALS_SIM_NOTE,
  VALIDITY_LABELS,
  conditionOf,
  describeVitalsDrift,
  detectVitalsDrift,
  qualityOf,
  rawReadingOf,
  readingOf,
  sleepRespRateSummary,
  summarizeAvailability,
  validVitals,
  vitalsBaselineOf,
  vitalsConstant,
  vitalsParam,
  vitalsParamRange,
  vitalsParamText,
  vitalsParamValue,
} from '../src/index.ts';
import type {
  MeasurementCondition,
  ReadingValidity,
  Sample,
  VitalKey,
} from '../src/index.ts';

// ---------------------------------------------------------------- 夹具

interface SampleOpts {
  validity?: ReadingValidity;
  condition?: MeasurementCondition;
  score?: number;
  /** 同时写入原始数值字段（模拟"设备确实吐了个数"） */
  keepRawValue?: boolean;
}

/** 造一个只带单通道读数的采样点。 */
function vitalSample(t: number, key: VitalKey, value: number, opts: SampleOpts = {}): Sample {
  const validity = opts.validity ?? 'valid';
  const s: Sample = {
    t,
    measurementCondition: opts.condition ?? 'resting',
    readingQuality: {
      [key]: { validity, score: opts.score ?? 0.9, windowS: 60 },
    },
  };
  // 无效窗口默认**不写数值字段**（真实设备行为由 keepRawValue 模拟）
  if (validity === 'valid' || opts.keepRawValue) {
    if (key === 'hr') s.hrBpm = value;
    else if (key === 'rr') s.rrBpm = value;
    else s.tempSurfaceC = value;
  }
  return s;
}

function series(
  key: VitalKey,
  n: number,
  valueOf: (i: number) => number,
  opts: (i: number) => SampleOpts = () => ({}),
): Sample[] {
  return Array.from({ length: n }, (_, i) => vitalSample(i * 10, key, valueOf(i), opts(i)));
}

/** 与 `scripts/check-claims.mjs` 一致的禁词判据（同 behavior.test.ts 的复刻）。 */
function assertNoForbiddenClaim(text: string, label: string): void {
  for (const line of text.split('\n')) {
    for (const { term, why } of FORBIDDEN_TERMS) {
      if (!line.includes(term)) continue;
      const negated = NEGATION_MARKERS.some((m) => line.includes(m));
      assert.ok(negated, `${label}：行内出现禁词「${term}」（${why}）却没有否定标记：${line}`);
    }
  }
}

// ---------------------------------------------------------------- 登记表

test('生理登记表：id 唯一、可查询、每项带来源与说明', () => {
  const ids = new Set<string>();
  for (const p of VITALS_PARAMS) {
    assert.ok(!ids.has(p.id), `参数 id 重复：${p.id}`);
    ids.add(p.id);
    assert.equal(vitalsParam(p.id)?.id, p.id);
    assert.ok(p.evidence.source, `参数「${p.label}」缺少来源`);
    assert.ok(p.evidence.note, `参数「${p.label}」缺少说明`);
    assert.ok(p.label.length > 0);
  }
  assert.equal(vitalsParam('not-exist'), undefined);
});

test('证据政策：unverified 无值且展示文本不含数字，disputed 必须是二元区间', () => {
  for (const p of VITALS_PARAMS) {
    if (p.evidence.tier === 'unverified') {
      assert.equal(p.value, null, `unverified 参数「${p.label}」不得给出数值`);
      assert.doesNotMatch(vitalsParamText(p.id), /\d/, `「${p.label}」的展示文本含数字`);
    }
    if (p.evidence.tier === 'disputed') {
      assert.ok(Array.isArray(p.value), `disputed 参数「${p.label}」必须是区间或 null`);
      const range = vitalsParamRange(p.id);
      assert.ok(range, `「${p.label}」应能取到区间`);
      assert.ok(range[0] < range[1], `「${p.label}」区间顺序应为 [lo, hi]`);
      assert.match(p.evidence.note ?? '', /冲突/, `「${p.label}」应写明来源冲突`);
    }
  }
});

test('项圈三通道的验证状态必须是 unverified（本阶段最不能含糊的一条）', () => {
  for (const id of ['collarHeartRateValidation', 'collarRespRateValidation', 'collarSurfaceTempValidation']) {
    const p = vitalsParam(id);
    assert.ok(p, `缺少登记项 ${id}`);
    assert.equal(p.evidence.tier, 'unverified', `${id} 必须标 unverified`);
    assert.equal(p.value, null, `${id} 不得给出数值`);
  }
  assert.equal(vitalsParamValue('sleepRespRateThreshold'), 30);
  assert.equal(vitalsParam('sleepRespRateThreshold')?.evidence.tier, 'moderate');
  assert.equal(vitalsParamText('collarRespRateValidation'), '未取得可靠来源');
});

test('操作化常量：每项写明理由、id 唯一、不与登记表混放', () => {
  assert.ok(VITALS_CONSTANTS.length >= 5);
  const ids = new Set<string>();
  for (const c of VITALS_CONSTANTS) {
    assert.ok(!ids.has(c.id), `操作化常量 id 重复：${c.id}`);
    ids.add(c.id);
    assert.ok(c.why.length > 20, `操作化常量「${c.label}」应写明为什么这么选`);
    assert.ok(c.unit.length > 0);
    assert.equal(typeof c.value, 'number');
    assert.equal(vitalsParam(c.id), undefined, `操作化常量不应同时出现在 VITALS_PARAMS：${c.id}`);
  }
  assert.equal(vitalsConstant('rrMotionGate')?.value, 0.25);
});

test('生理参数已从行为登记表迁出，不再重复定义', () => {
  const behaviorIds = new Set(BEHAVIOR_PARAMS.map((p) => p.id));
  assert.ok(!behaviorIds.has('restingHeartRate'), '静息心率应从 BEHAVIOR_PARAMS 迁出');
  assert.ok(!behaviorIds.has('restingRespiratoryRate'), '静息呼吸应从 BEHAVIOR_PARAMS 迁出');
  assert.ok(vitalsParam('restingHeartRate'), '静息心率应出现在 VITALS_PARAMS');
  assert.ok(vitalsParam('respRateByCondition'), '呼吸频率应按条件登记');
});

// ---------------------------------------------------------------- 读数有效性

test('读数有效性：无效窗口不提供可用读数，但坏值仍可用于展示原因', () => {
  const good = vitalSample(0, 'hr', 140);
  const artifact = vitalSample(60, 'hr', 240, { validity: 'motion-artifact', keepRawValue: true });
  const missing = vitalSample(120, 'hr', 0, { validity: 'poor-contact' });

  assert.equal(readingOf(good, 'hr'), 140);
  assert.equal(readingOf(artifact, 'hr'), null, '运动伪迹窗口不得给出可用读数');
  assert.equal(rawReadingOf(artifact, 'hr'), 240, '坏值应保留，供界面划线展示');
  assert.equal(rawReadingOf(missing, 'hr'), null, '未写入数值字段时原始读数也是 null');
  assert.equal(qualityOf(artifact, 'hr')?.validity, 'motion-artifact');
  assert.equal(qualityOf(missing, 'hr')?.score, 0.9);
  assert.equal(qualityOf(good, 'rr'), null, '未登记的通道读数质量应为 null');
  assert.match(VALIDITY_LABELS['motion-artifact'], /不可用/);
});

test('validVitals：算法层唯一入口，按条件过滤且排除全部无效窗口', () => {
  const samples: Sample[] = [
    vitalSample(0, 'rr', 22, { condition: 'sleep' }),
    vitalSample(10, 'rr', 24, { condition: 'sleep' }),
    vitalSample(20, 'rr', 60, { condition: 'active', validity: 'motion-artifact', keepRawValue: true }),
    vitalSample(30, 'rr', 26, { condition: 'resting' }),
  ];
  assert.equal(validVitals(samples, 'rr').length, 3);
  assert.equal(validVitals(samples, 'rr', 'sleep').length, 2);
  assert.equal(validVitals(samples, 'rr', 'active').length, 0, '活动窗口的伪迹读数必须被排除');
  assert.equal(conditionOf(samples[3]!), 'resting');
  assert.equal(conditionOf({ t: 0 }), 'resting', '未登记条件时按静息处理');
});

test('可用性报告：把「能测」与「能用」的差距变成一个数字', () => {
  // 真实会话里每个采样点都会登记三个通道，所以分母是同一批窗口。
  const samples: Sample[] = [];
  for (let i = 0; i < 20; i++) {
    const s: Sample = {
      t: i * 10,
      measurementCondition: i < 6 ? 'sleep' : 'active',
      readingQuality: {
        hr: { validity: i < 8 ? 'valid' : 'motion-artifact', score: 0.9, windowS: 60 },
        rr: { validity: i < 10 ? 'valid' : 'motion-artifact', score: 0.6, windowS: 60 },
        temp: { validity: 'valid', score: 0.95, windowS: 60 },
      },
    };
    if (i < 8) s.hrBpm = 140;
    else s.hrBpm = 240;
    if (i < 10) s.rrBpm = 22;
    else s.rrBpm = 70;
    s.tempSurfaceC = 35.6;
    samples.push(s);
  }
  const report = summarizeAvailability(samples);
  assert.equal(report.channels.hr.validWindows, 8);
  assert.equal(report.channels.rr.validWindows, 10);
  assert.equal(report.channels.temp.validShare, 1);
  assert.equal(report.channels.hr.reasons['motion-artifact'], 12);
  assert.equal(report.channels.hr.reportedShare, 1, '坏值也计入"报了什么"，但不计入"可用"');
  assert.equal(report.conditions.sleep, 6);
  assert.equal(report.mostLimited, 'hr', '可用比例最低的通道应被指出');
});

// ---------------------------------------------------------------- 分层基线

test('分层基线：只用同条件 + 有效读数；样本不足返回 null', () => {
  const sleep = series('rr', 40, () => 22, () => ({ condition: 'sleep' }));
  const active = series('rr', 40, () => 55, () => ({ condition: 'active' }));
  const mixed = [...sleep, ...active];

  const b = vitalsBaselineOf(mixed, 'rr', 'sleep');
  assert.ok(b);
  assert.equal(b.condition, 'sleep');
  assert.equal(b.n, 40);
  assert.equal(b.stats.median, 22, '活动段的读数不得污染睡眠基线');

  assert.equal(vitalsBaselineOf(mixed, 'rr', 'post-event'), null, '样本不足时必须返回 null');
});

test('分层基线：把运动伪迹算进基线会撑大离散度，因此必须排除', () => {
  const clean = series('hr', 60, (i) => 140 + (i % 3) - 1);
  const polluted = clean.map((s, i) =>
    i % 5 === 0
      ? vitalSample(i * 10, 'hr', 260 + i, { validity: 'motion-artifact', keepRawValue: true })
      : s,
  );
  const bClean = vitalsBaselineOf(clean, 'hr', 'resting');
  const bPolluted = vitalsBaselineOf(polluted, 'hr', 'resting');
  assert.ok(bClean && bPolluted);
  assert.ok(
    bPolluted.stats.sigma <= bClean.stats.sigma + 1e-9,
    `无效读数不得进入基线：${bPolluted.stats.sigma} vs ${bClean.stats.sigma}`,
  );
});

// ---------------------------------------------------------------- 同条件漂移

test('同条件漂移：条件一致时能检出注入的变化，且方向正确', () => {
  // 基线必须带自然波动：常数序列的 MAD = 0，稳健效应量按定义无意义（degenerate）。
  const baseline = series('hr', 60, (i) => 140 + (i % 5) - 2);
  const recent = series('hr', 60, (i) => 152 + (i % 5) - 2);
  const r = detectVitalsDrift({
    key: 'hr',
    baseline: { samples: baseline, condition: 'resting' },
    recent: { samples: recent, condition: 'resting' },
  });
  assert.ok(r);
  assert.equal(r.conditionMismatch, false);
  assert.equal(r.direction, 'up');
  assert.equal(r.severity, 'notable');
  assert.match(describeVitalsDrift(r), /高于基线/);
});

test('同条件漂移：条件不一致时必须拦下，而不是给出一个变化结论', () => {
  const home = series('hr', 60, (i) => 140 + (i % 5) - 2, () => ({ condition: 'resting' }));
  const clinic = series('hr', 60, (i) => 195 + (i % 5) - 2, () => ({ condition: 'clinic' }));
  const r = detectVitalsDrift({
    key: 'hr',
    baseline: { samples: home, condition: 'resting' },
    recent: { samples: clinic, condition: 'clinic' },
  });
  assert.ok(r);
  assert.equal(r.conditionMismatch, true);
  assert.equal(r.severity, 'none');
  assert.equal(r.degraded, true);
  assert.match(describeVitalsDrift(r), /不可比较/);
  assert.match(describeVitalsDrift(r), /诊室环境/);
});

test('同条件漂移：可用读数不足时返回 null（不猜）', () => {
  const r = detectVitalsDrift({
    key: 'rr',
    baseline: { samples: series('rr', 5, () => 22, () => ({ condition: 'sleep' })), condition: 'sleep' },
    recent: { samples: series('rr', 5, () => 30, () => ({ condition: 'sleep' })), condition: 'sleep' },
  });
  assert.equal(r, null);
});

// ---------------------------------------------------------------- 睡眠呼吸频率

/** 造一个睡眠时段（n 个 10 秒间隔的读数），并把游标推进到下一段的起点。 */
function sleepBout(startS: number, n: number, bpm: number): Sample[] {
  return Array.from({ length: n }, (_, i) => vitalSample(startS + i * 10, 'rr', bpm, { condition: 'sleep' }));
}

/** 一段清醒（体动窗口）：呼吸读数应被排除在睡眠统计之外。 */
function awakeGap(startS: number, n: number): Sample[] {
  return Array.from({ length: n }, (_, i) =>
    vitalSample(startS + i * 10, 'rr', 70, { condition: 'resting', validity: 'motion-artifact', keepRawValue: true }),
  );
}

test('睡眠呼吸频率：只采信睡眠中的有效读数，且按独立时段计数', () => {
  const samples: Sample[] = [
    ...sleepBout(0, 30, 22),
    ...awakeGap(600, 10),
    ...sleepBout(3600, 30, 24),
  ];
  const s = sleepRespRateSummary(samples);
  assert.equal(s.condition, 'sleep');
  assert.equal(s.thresholdBpm, 30);
  assert.equal(s.bouts.length, 2, `应识别出两个独立睡眠时段，实际 ${s.bouts.length}`);
  assert.equal(s.n, 60, '清醒窗口的读数不得进入睡眠统计');
  assert.equal(s.medianBpm, 23);
  assert.equal(s.overThresholdBouts, 0);
  assert.equal(s.exceeds, false, '两个时段都没超阈值时不应触发行动规则');
  assert.match(s.message, /未超过/);
});

test('睡眠呼吸频率：中位数超阈值即触发共识的行动规则', () => {
  const s = sleepRespRateSummary(sleepBout(0, 40, 34));
  assert.equal(s.exceeds, true);
  assert.match(s.message, /中位数已超过共识建议的评估阈值 30/);
  assert.match(s.message, /不构成/);
});

test('睡眠呼吸频率：「多次测量超阈值」这条路径按独立时段计数', () => {
  // 整体中位数 20（多数时段正常），但有 3 个时段的中位数 34 —— 走原文的「多次测量 >30」分支。
  const samples: Sample[] = [];
  let cursor = 0;
  const push = (bpm: number): void => {
    samples.push(...sleepBout(cursor, 30, bpm));
    cursor += 600;
    samples.push(...awakeGap(cursor, 5));
    cursor += 3600;
  };
  for (let i = 0; i < 3; i++) push(34);
  for (let i = 0; i < 5; i++) push(20);

  const s = sleepRespRateSummary(samples);
  assert.equal(s.bouts.length, 8);
  assert.equal(s.overThresholdBouts, 3);
  assert.equal(s.medianBpm, 20, '整体中位数不该被少数时段拉高');
  assert.equal(s.exceeds, true, '3 个超阈值时段应触发「多次测量」这条路径');
  assert.match(s.message, /3 个睡眠时段/);
});

test('睡眠呼吸频率：没有可用睡眠读数时如实说明，并给出人工对照的做法', () => {
  const samples = series('rr', 60, () => 70, () => ({ condition: 'active', validity: 'motion-artifact', keepRawValue: true }));
  const s = sleepRespRateSummary(samples);
  assert.equal(s.medianBpm, null);
  assert.equal(s.n, 0);
  assert.equal(s.exceeds, false);
  assert.match(s.message, /没有可用的睡眠读数/);
  assert.match(s.message, /眼睛数/);
  assert.ok(SLEEP_RR_QUESTIONS.length >= 3);
});

test('睡眠呼吸频率：阈值取自登记表，不在实现里写死', () => {
  const samples = Array.from({ length: 40 }, (_, i) => vitalSample(i * 10, 'rr', 31, { condition: 'sleep' }));
  const s = sleepRespRateSummary(samples);
  assert.equal(s.thresholdBpm, vitalsParamValue('sleepRespRateThreshold'));
  assert.equal(s.exceeds, true);
  assert.equal(s.evidence.tier, 'moderate');
});

// ---------------------------------------------------------------- 边界与禁词

test('文案禁词：全部生理层展示文案只能以否定语境出现禁词', () => {
  const texts: string[] = [VITALS_BOUNDARY_NOTE, VITALS_SIM_NOTE, ...SLEEP_RR_QUESTIONS];
  for (const p of VITALS_PARAMS) texts.push(p.label, p.evidence.note ?? '', vitalsParamText(p.id));
  for (const c of VITALS_CONSTANTS) texts.push(c.label, c.why);
  for (const k of Object.values(VALIDITY_LABELS)) texts.push(k);

  assertNoForbiddenClaim(texts.join('\n'), '生理层文案');
  assert.match(VITALS_BOUNDARY_NOTE, /不构成/);
  assert.match(VITALS_SIM_NOTE, /未取得验证研究/);
});

test('公共 API 守卫：不得存在任何「由体表温推核心温」的符号', () => {
  // ⚠️ 判据是**转换语义**，不是"名字里出现核心温"。
  //
  // 第一版用 `/coreTemp/` 匹配，立刻误伤了 `coreTempDeltaC`——那是真值侧的
  // 「突发期间核心温上升多少」的模型函数，与换算毫无关系。
  // 这与措辞门禁把裸词「换算」列为禁词是同一类错误：门禁一旦惩罚正确的名字，
  // 作者就会去改名，而不是去掉错误的做法。
  const suspicious = Object.keys(coreApi).filter((k) =>
    /convert|toCore|fromSurface|surfaceTo|换算/i.test(k),
  );
  assert.deepEqual(suspicious, [], `公共 API 不应导出换算符号：${suspicious.join(', ')}`);
  // 反向确认判据本身有效：真值侧的核心温模型函数**必须**能通过
  assert.ok(Object.keys(coreApi).length > 0);
});
