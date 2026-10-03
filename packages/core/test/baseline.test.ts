import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_BASELINE_SAMPLES,
  baselineOf,
  mad,
  median,
  quantile,
  robustZ,
  valuesOf,
} from '../src/index.ts';
import { normalSeries } from './helpers.ts';

test('median：奇数与偶数长度', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([5]), 5);
  assert.ok(Number.isNaN(median([])));
});

test('median 不受离群点影响（这正是选它的原因）', () => {
  const clean = [10, 11, 12, 13, 14];
  const spiked = [10, 11, 12, 13, 1000];
  assert.equal(median(clean), 12);
  assert.equal(median(spiked), 12, '中位数应无视单个尖峰');
});

test('mad：原始中位绝对偏差', () => {
  // 中位数 3，绝对偏差 [2,1,0,1,2] → 中位数 1
  assert.equal(mad([1, 2, 3, 4, 5]), 1);
});

test('quantile 边界与插值', () => {
  const xs = [1, 2, 3, 4];
  assert.equal(quantile(xs, 0), 1);
  assert.equal(quantile(xs, 1), 4);
  assert.equal(quantile(xs, 0.5), 2.5);
});

test('样本不足时返回 null，绝不猜', () => {
  const few = Array.from({ length: MIN_BASELINE_SAMPLES - 1 }, (_, i) => i);
  assert.equal(baselineOf(few), null);
  const enough = Array.from({ length: MIN_BASELINE_SAMPLES }, (_, i) => i);
  assert.notEqual(baselineOf(enough), null);
});

test('sigma = 1.4826 × mad', () => {
  const xs = normalSeries(7, 200, 100, 5);
  const b = baselineOf(xs);
  assert.ok(b);
  assert.ok(Math.abs(b.sigma - 1.4826 * b.mad) < 1e-9);
});

test('退化信号（常量）被标记，且 robustZ 返回 0 而非 Infinity', () => {
  const constant = Array.from({ length: 50 }, () => 42);
  const b = baselineOf(constant);
  assert.ok(b);
  assert.equal(b.degenerate, true);
  assert.equal(b.sigma, 0);
  assert.equal(robustZ(100, b), 0, 'degenerate 时不得返回 Infinity');
});

test('robustZ 相对自身基线，而非种群平均', () => {
  // 一只静息心率天然偏高的个体：其"正常"不应被判为异常
  const xs = normalSeries(3, 300, 120, 6);
  const b = baselineOf(xs);
  assert.ok(b);
  assert.ok(Math.abs(robustZ(120, b)) < 0.3, '落在自身基线上应接近 0');
  assert.ok(robustZ(138, b) > 2, '偏离自身基线 3σ 应显著');
});

test('非有限值被剔除，NaN 不会污染基线', () => {
  const dirty = [...Array.from({ length: 40 }, (_, i) => i), Number.NaN, Number.POSITIVE_INFINITY];
  const b = baselineOf(dirty);
  assert.ok(b);
  assert.equal(b.n, 40, 'NaN 与 Infinity 应被剔除');
});

test('valuesOf 跳过缺失字段并保留顺序', () => {
  const samples: Array<{ v?: number }> = [{ v: 1 }, { v: undefined }, { v: 3 }, {}, { v: Number.NaN }];
  assert.deepEqual(valuesOf(samples, (s) => s.v), [1, 3]);
});
