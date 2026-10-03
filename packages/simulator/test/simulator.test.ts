import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSession, mulberry32, SCENARIOS } from '../src/index.ts';
import { activityAt, incidentAt } from '../../core/src/index.ts';
import type { PetProfile } from '@camp/core';

const profile: PetProfile = {
  species: 'cat',
  breedId: 'domestic-shorthair',
  weightKg: 4.2,
  heightCm: 24,
  ageMonths: 36,
};

const base = { profile, durationMin: 60, scenario: 'living-room-day' as const };

test('PRNG 同种子严格同序列', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
});

test('不同种子给出不同序列', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  const same = Array.from({ length: 20 }, () => a() === b());
  assert.ok(same.includes(false), '至少应有差异');
});

test('同种子生成字节级一致的会话', () => {
  const a = generateSession({ ...base, seed: 7 });
  const b = generateSession({ ...base, seed: 7 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('不同种子生成不同的会话', () => {
  const a = generateSession({ ...base, seed: 7 });
  const b = generateSession({ ...base, seed: 8 });
  assert.notEqual(JSON.stringify(a.samples), JSON.stringify(b.samples));
});

test('采样数量与时长一致，且时间单调递增', () => {
  const s = generateSession({ ...base, seed: 1, durationMin: 60, sampleIntervalSec: 10 });
  assert.equal(s.samples.length, 360);
  for (let i = 1; i < s.samples.length; i++) {
    assert.ok((s.samples[i]!.t ?? 0) > (s.samples[i - 1]!.t ?? 0), '时间必须严格递增');
  }
});

test('生理量落在生理合理区间', () => {
  const s = generateSession({ ...base, seed: 3, scenario: 'noise-event', durationMin: 120 });
  for (const x of s.samples) {
    assert.ok(x.hrBpm! > 60 && x.hrBpm! < 320, `心率越界: ${x.hrBpm}`);
    assert.ok(x.hrvRmssdMs! >= 6, `HRV 低于下限: ${x.hrvRmssdMs}`);
    assert.ok(x.rrBpm! > 5 && x.rrBpm! < 80, `呼吸越界: ${x.rrBpm}`);
    assert.ok(x.tempC! > 36 && x.tempC! < 41, `体温越界: ${x.tempC}`);
    assert.ok(x.noiseDbA! >= 0 && x.noiseDbA! < 130, `噪声越界: ${x.noiseDbA}`);
  }
});

test('舒适度曲线落在 0–1', () => {
  const s = generateSession({ ...base, seed: 5, durationMin: 120, scenario: 'multi-cat-tension' });
  for (const p of s.truth!.comfortCurve) {
    assert.ok(p.value >= 0 && p.value <= 1, `越界: ${p.value}`);
  }
});

test('噪声事件场景确实产生噪声突发', () => {
  const quiet = generateSession({ ...base, seed: 11, scenario: 'living-room-day', durationMin: 240 });
  const noisy = generateSession({ ...base, seed: 11, scenario: 'noise-event', durationMin: 240 });
  const max = (s: typeof quiet) => Math.max(...s.samples.map((x) => x.noiseDbA ?? 0));
  assert.ok(max(noisy) > max(quiet), '噪声场景应有更高的峰值');
});

test('噪声与心率正相关，且存在可被检测的滞后', () => {
  const s = generateSession({ ...base, seed: 21, scenario: 'noise-event', durationMin: 240 });
  const noise = s.samples.map((x) => x.noiseDbA ?? 0);
  const hr = s.samples.map((x) => x.hrBpm ?? 0);
  const corr = (a: number[], b: number[]) => {
    const n = Math.min(a.length, b.length);
    const ma = a.slice(0, n).reduce((p, c) => p + c, 0) / n;
    const mb = b.slice(0, n).reduce((p, c) => p + c, 0) / n;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < n; i++) {
      const x = (a[i] ?? 0) - ma;
      const y = (b[i] ?? 0) - mb;
      num += x * y;
      da += x * x;
      db += y * y;
    }
    return num / Math.sqrt(da * db || 1);
  };

  let bestLag = 0;
  let best = -Infinity;
  for (let lag = 0; lag <= 12; lag++) {
    const r = corr(noise.slice(0, noise.length - lag), hr.slice(lag));
    if (r > best) {
      best = r;
      bestLag = lag;
    }
  }
  assert.ok(best > 0.25, `噪声-心率应正相关，实际 best r=${best.toFixed(3)}`);
  assert.ok(bestLag > 0, '应存在非零滞后（注入滞后为 2 个采样点）');
});

test('真值记录了注入的缺口与滞后', () => {
  const s = generateSession({ ...base, seed: 9, scenario: 'multi-cat-tension', durationMin: 60 });
  assert.deepEqual(s.truth!.injectedGaps, ['separated-resources', 'safe-place']);
  assert.equal(s.truth!.injectedLags['noise->hr'], 20);
  assert.equal(s.truth!.seed, 9);
});

test('所有场景都能生成且事件非空', () => {
  for (const id of Object.keys(SCENARIOS) as Array<keyof typeof SCENARIOS>) {
    const s = generateSession({ profile, seed: 4, durationMin: 120, scenario: id });
    assert.ok(s.samples.length > 0, `${id} 无采样`);
    assert.equal(s.truth!.scenario, id);
  }
});

// ---------------------------------------------------------------- 行为层

const INCIDENTS = [
  { atS: 3 * 3600, kind: 'seizure' as const },
  { atS: 9 * 3600, kind: 'labored-breathing' as const },
  // ⚠️ 必须落在 durationMin 之内，否则会被引擎按「越界」丢弃（真值里也就不会有它）
  { atS: 11 * 3600, kind: 'withdrawal' as const },
];

/**
 * 注入时刻与落位时刻之间允许的偏差。
 *
 * 引擎刻意在事发前 1 秒结束前一个行为片段（见 engine.ts），这样画面不会
 * 「先跳到事发动作再看它开始」。因此落位会比请求时刻略早，最多 1 秒。
 */
const INCIDENT_LEAD_S = 1.5;

const withBehavior = (over: Partial<Parameters<typeof generateSession>[0]> = {}) =>
  generateSession({
    profile,
    seed: 42,
    durationMin: 720,
    scenario: 'living-room-day',
    ...over,
  });

test('行为层默认开启，并产出连续覆盖的时间线', () => {
  const s = withBehavior();
  const tl = s.behaviorTimeline;
  assert.ok(tl, '会话应带行为时间线');
  assert.ok(tl.segments.length > 0, '时间线不应为空');
  assert.equal(tl.durationS, 720 * 60);

  let prevEnd = 0;
  let total = 0;
  for (const seg of tl.segments) {
    assert.ok(seg.durS > 0, '区间时长必须 > 0');
    assert.equal(seg.t, prevEnd, '区间应首尾相接');
    prevEnd = seg.t + seg.durS;
    total += seg.durS;
  }
  assert.equal(prevEnd, tl.durationS);
  assert.ok(Math.abs(total - tl.durationS) < 1e-6);
  assert.equal(s.truth?.behavior?.seed, tl.seed);
});

test('行为层可用 enabled:false 关掉，采样仍完整', () => {
  const s = withBehavior({ behavior: { enabled: false } });
  assert.equal(s.behaviorTimeline, undefined);
  assert.equal(s.truth?.behavior, undefined);
  assert.equal(s.truth?.injectedIncidents, undefined);
  assert.equal(s.samples.length, (720 * 60) / 10);
  // 关掉行为层后不应有 activityId 通道
  assert.equal(s.samples[0]?.activityId, undefined);
});

test('采样携带行为通道，且与时间线一致', () => {
  const s = withBehavior();
  const tl = s.behaviorTimeline!;
  for (const i of [0, 100, 500, 2000]) {
    const sample = s.samples[i]!;
    assert.ok(sample.activityId, `采样 ${i} 应有 activityId`);
    const seg = activityAt(tl, sample.t);
    assert.equal(sample.activityId, seg.activity, `采样 ${i} 的活动与时间线不一致`);
    assert.equal(sample.anchorId, seg.anchorId);
  }
});

test('注入的突发被真值记录，且与时间线一一对应', () => {
  const s = withBehavior({ behavior: { injectIncidents: INCIDENTS } });
  const truth = s.truth!.injectedIncidents!;
  assert.equal(truth.length, INCIDENTS.length, '注入数应与真值数一致');

  for (const req of INCIDENTS) {
    const hit = truth.find((i) => i.kind === req.kind);
    assert.ok(hit, `注入的 ${req.kind} 未出现在真值`);
    assert.equal(hit.injected, true);
    assert.ok(
      Math.abs(hit.t - req.atS) <= INCIDENT_LEAD_S,
      `${req.kind} 落位偏差过大：${hit.t} vs ${req.atS}`,
    );
    // 时间线里同一时刻应能查到该突发
    const at = incidentAt(s.behaviorTimeline!, hit.t + 1);
    assert.equal(at?.kind, req.kind);
  }
});

test('越界的注入被丢弃且不会出现在真值里', () => {
  const s = withBehavior({ behavior: { injectIncidents: [{ atS: 99 * 3600, kind: 'seizure' }] } });
  assert.deepEqual(s.truth!.injectedIncidents, []);
  assert.ok(
    (s.behaviorTimeline?.incidents ?? []).every((i) => !i.injected),
    '越界注入不应出现在时间线里',
  );
});

test('突发期间心率与呼吸上升、HRV 下降（行为真值 ↔ 生理读数可断言）', () => {
  const s = withBehavior({ behavior: { injectIncidents: [INCIDENTS[1]!] } });
  const inc = s.truth!.injectedIncidents![0]!;
  const during = s.samples.filter((x) => x.t >= inc.t && x.t < inc.t + inc.durationS);
  const before = s.samples.filter((x) => x.t >= inc.t - 20 * 60 && x.t < inc.t);
  assert.ok(during.length > 3 && before.length > 3, '窗口内应有足够采样');

  const med = (xs: number[]): number => {
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  };

  const hrDuring = med(during.map((x) => x.hrBpm ?? 0));
  const hrBefore = med(before.map((x) => x.hrBpm ?? 0));
  assert.ok(hrDuring > hrBefore, `突发中心率应上升：${hrDuring.toFixed(1)} vs ${hrBefore.toFixed(1)}`);

  const rrDuring = med(during.map((x) => x.rrBpm ?? 0));
  const rrBefore = med(before.map((x) => x.rrBpm ?? 0));
  assert.ok(rrDuring > rrBefore, `突发中呼吸应上升：${rrDuring.toFixed(1)} vs ${rrBefore.toFixed(1)}`);

  const hrvDuring = med(during.map((x) => x.hrvRmssdMs ?? 0));
  const hrvBefore = med(before.map((x) => x.hrvRmssdMs ?? 0));
  assert.ok(hrvDuring < hrvBefore, `突发中 HRV 应下降：${hrvDuring.toFixed(1)} vs ${hrvBefore.toFixed(1)}`);

  // 采样通道应标出这是突发区间，而不是伪装成普通姿势
  assert.ok(
    during.every((x) => x.posture === 'event:labored-breathing'),
    '突发区间内的 posture 应标记为事件',
  );
});

test('事件流由行为派生：抓挠事件一定落在抓挠段内', () => {
  const s = withBehavior();
  const tl = s.behaviorTimeline!;
  const scratches = s.events.filter((e) => e.kind === 'scratch');
  assert.ok(scratches.length > 0, '24 小时演示里应出现抓挠事件');
  for (const ev of scratches) {
    // 摩擦/理毛段允许产出 scratch（项圈会把抓挠误判为理毛，这是已记录的真实混淆）
    const seg = activityAt(tl, ev.t);
    assert.ok(
      seg.activity === 'scratching' || seg.activity === 'grooming',
      `抓挠事件落在「${seg.activity}」段内，与行为不一致`,
    );
  }
  // 躲藏事件必须落在躲藏段
  const hiders = s.events.filter((e) => e.kind === 'hiding');
  assert.ok(hiders.length > 0, '24 小时演示里应出现躲藏事件');
  for (const ev of hiders) {
    assert.equal(activityAt(tl, ev.t).activity, 'hiding', '躲藏事件应落在躲藏段内');
  }
});

test('行为事件不会在猫休息时凭空产生', () => {
  const s = withBehavior();
  const tl = s.behaviorTimeline!;
  // 休息段不应产出抓挠/碰撞/摩擦这类身体事件（发声与突发姿势改变除外）
  const bodyEvents = s.events.filter(
    (e) => e.kind === 'scratch' || e.kind === 'rub' || e.kind === 'impact',
  );
  for (const ev of bodyEvents) {
    const seg = activityAt(tl, ev.t);
    assert.notEqual(seg.activity, 'resting', `猫在休息时不应出现 ${ev.kind} 事件`);
  }
});

test('同种子的行为层也字节级一致', () => {
  const a = withBehavior();
  const b = withBehavior();
  assert.equal(JSON.stringify(a.behaviorTimeline), JSON.stringify(b.behaviorTimeline));
  assert.equal(JSON.stringify(a.truth), JSON.stringify(b.truth));
});

test('离家窗口可以传入行为层，且不影响生理序列结构', () => {
  const s = withBehavior({ behavior: { awayWindows: [[0, 8 * 3600]] } });
  const tl = s.behaviorTimeline!;
  assert.ok(tl.segments.length > 0);
  assert.equal(s.samples.length, (720 * 60) / 10);
});

test('行为时间线可经 JSON 往返（部署产物与截图都依赖这一点）', () => {
  const s = withBehavior({ behavior: { injectIncidents: [INCIDENTS[0]!] } });
  const round = JSON.parse(JSON.stringify(s.behaviorTimeline)) as typeof s.behaviorTimeline;
  assert.deepEqual(round, s.behaviorTimeline);
  const sample = s.samples[120]!;
  assert.equal(activityAt(round!, sample.t).activity, activityAt(s.behaviorTimeline!, sample.t).activity);
});
