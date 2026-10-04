import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORBIDDEN_TERMS, describeDrift, detectDrift, detectDrifts } from '../src/index.ts';
import type { MetricSeries } from '../src/index.ts';
import { makeUnit, normalSeries } from './helpers.ts';

const OPTS = { permutations: 500, seed: 11 };
const N = 200;

/** 生成两个窗口：baseline 均值 100、sd 5；recent 均值 100+shift。 */
function windows(shift: number, seed = 5, spikeCount = 0) {
  const baseline = normalSeries(seed, N, 100, 5);
  const recent = normalSeries(seed + 1000, N, 100 + shift, 5);
  // 可选：在 recent 里注入少量尖峰，检验「尖峰 ≠ 漂移」
  const u = makeUnit(seed + 5000);
  for (let i = 0; i < spikeCount; i++) recent[Math.floor(u() * N)] = 140;
  return { baseline, recent };
}

const meta = { key: 'hr', label: '心率', unit: 'bpm' };

test('无漂移：severity 为 none，且能正常输出结论', () => {
  const { baseline, recent } = windows(0);
  const r = detectDrift(baseline, recent, meta, OPTS);
  assert.ok(r);
  assert.equal(r.severity, 'none');
  assert.ok(Math.abs(r.deltaRobust) < 0.5);
});

test('持续上漂移 +2.4σ → notable，方向 up，p 显著，sustained', () => {
  const { baseline, recent } = windows(12);
  const r = detectDrift(baseline, recent, meta, OPTS);
  assert.ok(r);
  assert.equal(r.severity, 'notable');
  assert.equal(r.direction, 'up');
  assert.ok(r.pValue < 0.05, `p=${r.pValue}`);
  assert.equal(r.sustained, true);
  assert.ok(r.deltaRobust > 1.8 && r.deltaRobust < 3.0, `delta=${r.deltaRobust}`);
});

test('持续下漂移 → 方向 down', () => {
  const { baseline, recent } = windows(-12);
  const r = detectDrift(baseline, recent, meta, OPTS);
  assert.ok(r);
  assert.equal(r.direction, 'down');
  assert.equal(r.severity, 'notable');
  assert.ok(r.deltaRobust < -1.8);
});

test('中等偏移 0.7σ → watch，不升级为 notable（未过 1.0 门槛）', () => {
  const { baseline, recent } = windows(3.5);
  const r = detectDrift(baseline, recent, meta, OPTS);
  assert.ok(r);
  assert.equal(r.severity, 'watch');
  assert.ok(Math.abs(r.deltaRobust) >= 0.5 && Math.abs(r.deltaRobust) < 1.0);
});

test('单次尖峰不构成漂移 —— 这是「持续性」判据存在的理由', () => {
  const { baseline, recent } = windows(0, 5, 8);
  const r = detectDrift(baseline, recent, meta, OPTS);
  assert.ok(r);
  assert.equal(r.severity, 'none', '8/200 个尖峰不应被判为漂移');
  assert.ok(Math.abs(r.deltaRobust) < 0.5);
});

test('数据不足返回 null，绝不猜', () => {
  const r = detectDrift([1, 2, 3], [4, 5, 6], meta, OPTS);
  assert.equal(r, null);
  const ok = Array.from({ length: 50 }, (_, i) => 100 + (i % 3));
  assert.equal(detectDrift(ok, [1, 2, 3], meta, OPTS), null, 'recent 不足同样返回 null');
});

test('退化基线（常量）不崩溃，delta 归零而非 Infinity', () => {
  const flat = Array.from({ length: 60 }, () => 42);
  const r = detectDrift(flat, flat, meta, OPTS);
  assert.ok(r);
  assert.equal(r.degraded, true);
  assert.equal(r.deltaRobust, 0);
  assert.equal(r.direction, 'none');
});

test('置换检验可复现：同 seed 同 p 值，不同 seed 通常不同', () => {
  const { baseline, recent } = windows(12);
  const a = detectDrift(baseline, recent, meta, { permutations: 300, seed: 42 });
  const b = detectDrift(baseline, recent, meta, { permutations: 300, seed: 42 });
  assert.ok(a && b);
  assert.equal(a.pValue, b.pValue);
  // 不同种子下 p 值应接近但不保证相等；只断言都远小于 0.05
  const c = detectDrift(baseline, recent, meta, { permutations: 300, seed: 99 });
  assert.ok(c);
  assert.ok(c.pValue < 0.05);
});

test('detectDrifts：按严重度排序，数据不足的指标被跳过', () => {
  const good = windows(12, 21);
  const mild = windows(3.5, 22);
  const flat = windows(0, 23);
  const series: MetricSeries[] = [
    { key: 'flat', label: '无变化项', baseline: flat.baseline, recent: flat.recent },
    { key: 'mild', label: '轻微项', baseline: mild.baseline, recent: mild.recent },
    { key: 'big', label: '显著项', baseline: good.baseline, recent: good.recent },
    { key: 'tiny', label: '数据不足项', baseline: [1, 2], recent: [3, 4] },
  ];
  const results = detectDrifts(series, OPTS);
  assert.equal(results.length, 3, '数据不足项应被跳过');
  assert.equal(results[0]?.key, 'big');
  assert.equal(results[1]?.key, 'mild');
  assert.equal(results[2]?.key, 'flat');
});

test('describeDrift 只描述变化，不描述感受或原因', () => {
  const { baseline, recent } = windows(12);
  const r = detectDrift(baseline, recent, meta, OPTS);
  assert.ok(r);
  const text = describeDrift(r);
  assert.match(text, /心率/);
  assert.match(text, /高于基线/);
  // 直接对照**单一事实来源**的禁词表：新增禁词会自动被这条测试覆盖
  for (const { term } of FORBIDDEN_TERMS) {
    assert.ok(!text.includes(term), `输出不应包含禁词「${term}」：${text}`);
  }
  const flat = detectDrift(windows(0).baseline, windows(0).recent, meta, OPTS);
  assert.ok(flat);
  assert.match(describeDrift(flat), /未见明显变化/);
});
