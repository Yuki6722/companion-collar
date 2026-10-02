import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSession, mulberry32, SCENARIOS } from '../src/index.ts';
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
