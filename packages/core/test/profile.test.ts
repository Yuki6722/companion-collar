import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageBandOf,
  cameraHeightOf,
  clamp,
  collarBudgetOf,
  isSenior,
  sizeClassOf,
} from '../src/index.ts';
import type { PetProfile } from '../src/index.ts';

const cat: PetProfile = {
  species: 'cat',
  breedId: 'domestic-shorthair',
  weightKg: 4.2,
  heightCm: 24,
  ageMonths: 36,
};

const largeDog: PetProfile = {
  species: 'dog',
  breedId: 'golden-retriever',
  weightKg: 32,
  heightCm: 58,
  ageMonths: 120,
};

test('clamp 边界', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

test('年龄分档覆盖四个档位且单调不降', () => {
  assert.equal(ageBandOf(3), 'junior');
  assert.equal(ageBandOf(24), 'adult');
  assert.equal(ageBandOf(120), 'senior');
  assert.equal(ageBandOf(200), 'geriatric');
  assert.equal(isSenior(120), true);
  assert.equal(isSenior(24), false);
});

test('体型分档：猫与犬使用各自的分档表', () => {
  assert.equal(sizeClassOf('cat', 2.8), 'cat-small');
  assert.equal(sizeClassOf('cat', 4.2), 'cat-standard');
  assert.equal(sizeClassOf('cat', 6.5), 'cat-large');
  assert.equal(sizeClassOf('dog', 3), 'toy');
  assert.equal(sizeClassOf('dog', 8), 'small');
  assert.equal(sizeClassOf('dog', 20), 'medium');
  assert.equal(sizeClassOf('dog', 32), 'large');
  assert.equal(sizeClassOf('dog', 60), 'giant');
});

test('项圈预算随体重增长，且有上下限', () => {
  const tiny = collarBudgetOf({ ...cat, species: 'dog', weightKg: 1.5, heightCm: 15 });
  const big = collarBudgetOf(largeDog);
  assert.ok(tiny.maxWeightG >= 25, '下限 25 g 生效');
  assert.ok(big.maxWeightG > tiny.maxWeightG, '更重 → 允许更重');
  assert.ok(big.maxWeightG <= 260, '上限 260 g 生效');
  assert.ok(big.strapMaxMm > big.strapMinMm, '带长区间有效');
});

test('相机高度被限制在物理合理区间', () => {
  assert.ok(cameraHeightOf(5) >= 0.15, '极矮个体不塌到 0');
  assert.ok(cameraHeightOf(120) <= 0.7, '极高个体不超出上限');
  assert.ok(cameraHeightOf(58) > cameraHeightOf(24), '大型犬机位高于猫');
  assert.equal(cameraHeightOf(24), 0.204);
});
