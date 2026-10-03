import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HIDE_OFF_PATH_MIN_M,
  RESOURCE_CLUSTER_MAX_M,
  RESOURCE_SEPARATION_MIN_M,
  distanceToPath,
  summarizeHomeResources,
} from '../src/index.ts';
import type { HomeResourceCheck, HomeResourceItem } from '../src/index.ts';

/** 与 3D 场景同一套位置（见 apps/web/src/scene/layout.ts 的 HOME_RESOURCES）。 */
function sampleRoom(): HomeResourceItem[] {
  return [
    { id: 'litter-a', kind: 'litter', label: '猫砂盆 A（西南角）', position: { x: -3.15, z: 2.35 } },
    { id: 'litter-b', kind: 'litter', label: '猫砂盆 B（床与衣柜之间）', position: { x: -3.15, z: -0.28 } },
    { id: 'fountain', kind: 'water', label: '饮水机（窗边）', position: { x: 1.5, z: -2.4 } },
    { id: 'water-bowl', kind: 'water', label: '第二水碗（沙发旁）', position: { x: 0.35, z: 1.55 } },
    { id: 'food-bowls', kind: 'food', label: '食盆（窗边西侧）', position: { x: -0.75, z: -2.4 } },
    { id: 'cat-bed', kind: 'sleep', label: '封闭式猫窝', position: { x: -0.35, z: -0.9 } },
    { id: 'tree-perch', kind: 'sleep', label: '猫爬架顶台', position: { x: 2.6, z: -2.25 }, heightM: 1.45 },
    { id: 'tree-posts', kind: 'scratch', label: '猫爬架剑麻立柱', position: { x: 2.6, z: -2.25 } },
    { id: 'wall-scratcher', kind: 'scratch', label: '墙面剑麻抓板', position: { x: 3.5, z: -0.62 } },
    { id: 'floor-scratcher', kind: 'scratch', label: '地面抓板', position: { x: 0.3, z: 0.6 } },
    { id: 'cat-bed-hide', kind: 'hide', label: '封闭式猫窝', position: { x: -0.35, z: -0.9 } },
    { id: 'hiding-box', kind: 'hide', label: '纸箱躲藏处', position: { x: 2.55, z: 1.45 } },
    { id: 'tree-perch-vertical', kind: 'vertical', label: '猫爬架顶台', position: { x: 2.6, z: -2.25 }, heightM: 1.45 },
    { id: 'cat-shelf-0', kind: 'vertical', label: '墙面跳台（低）', position: { x: 3.45, z: -1.5 }, heightM: 1.25 },
    { id: 'cat-shelf-1', kind: 'vertical', label: '墙面跳台（高）', position: { x: 3.45, z: -0.9 }, heightM: 1.65 },
    { id: 'wardrobe-top', kind: 'vertical', label: '衣柜顶', position: { x: -3.28, z: 1.3 }, heightM: 2.4 },
    { id: 'toys', kind: 'play', label: '逗猫棒与小球', position: { x: 1, z: 1.9 } },
  ];
}

/** 与 layout.ts 的 TRAFFIC_PATH 一致。 */
const TRAFFIC_PATH = [
  { x: 3, z: 2.6 },
  { x: 0.2, z: 2 },
  { x: -1.6, z: 1.9 },
  { x: 0.4, z: 0.4 },
  { x: 1.5, z: -0.5 },
];

function byId(checks: HomeResourceCheck[], id: string): HomeResourceCheck {
  const hit = checks.find((c) => c.id === id);
  assert.ok(hit, `缺少检查项 ${id}`);
  return hit;
}

test('样本房间按 AAFP 清单全部达标（几何可判定的部分）', () => {
  const summary = summarizeHomeResources(sampleRoom(), {
    cats: 1,
    trafficPath: TRAFFIC_PATH,
  });
  for (const check of summary.checks) {
    if (check.status === 'unknown') continue;
    assert.equal(check.status, 'ok', `${check.id} 应为 ok：${check.actual}`);
  }
  assert.equal(summary.counts.litter, 2);
  assert.equal(summary.counts.water, 2);
  assert.equal(summary.counts.scratch, 3);
});

test('猫砂盆必须满足 猫数 + 1', () => {
  const one = summarizeHomeResources(sampleRoom(), { cats: 1 });
  assert.equal(byId(one.checks, 'rs1').status, 'ok');

  const missingSecond = summarizeHomeResources(
    sampleRoom().filter((i) => i.id !== 'litter-b'),
    { cats: 1 },
  );
  assert.equal(byId(missingSecond.checks, 'rs1').status, 'gap');

  const threeCats = summarizeHomeResources(sampleRoom(), { cats: 3 });
  assert.equal(byId(threeCats.checks, 'rs1').status, 'gap');
});

test('食水挨着、或紧邻猫砂盆时判为缺口', () => {
  const items = sampleRoom().map((i) =>
    i.id === 'food-bowls' ? { ...i, position: { x: 1.3, z: -2.4 } } : i,
  );
  const near = summarizeHomeResources(items, { cats: 1 });
  assert.equal(byId(near.checks, 'rs2').status, 'gap');

  const closed = sampleRoom().map((i) =>
    i.id === 'food-bowls' ? { ...i, position: { x: -3.0, z: -0.28 } } : i,
  );
  const besideLitter = summarizeHomeResources(closed, { cats: 1 });
  assert.equal(byId(besideLitter.checks, 'rs2').status, 'gap');
});

test('同类资源挤在一处时 rs4 为缺口', () => {
  const items = sampleRoom().map((i) =>
    i.kind === 'water' && i.id === 'water-bowl'
      ? { ...i, position: { x: 1.5 + RESOURCE_CLUSTER_MAX_M / 4, z: -2.4 } }
      : i,
  );
  const summary = summarizeHomeResources(items, { cats: 1 });
  const rs4 = byId(summary.checks, 'rs4');
  assert.equal(rs4.status, 'gap');
  assert.match(rs4.actual, /饮水点/);
});

test('缺少睡窝 / 抓挠面时 rs3 为缺口', () => {
  const noSleep = summarizeHomeResources(
    sampleRoom().filter((i) => i.kind !== 'sleep'),
    { cats: 1 },
  );
  assert.equal(byId(noSleep.checks, 'rs3').status, 'gap');
});

test('躲藏处判定依赖人流通道；没有通道数据就是 unknown 而非合格', () => {
  const withoutPath = summarizeHomeResources(sampleRoom(), { cats: 1 });
  assert.equal(byId(withoutPath.checks, 'sp2').status, 'unknown');

  const onPath = summarizeHomeResources(
    sampleRoom().map((i) => (i.kind === 'hide' ? { ...i, position: { x: 0.4, z: 0.4 } } : i)),
    { cats: 1, trafficPath: TRAFFIC_PATH },
  );
  assert.equal(byId(onPath.checks, 'sp2').status, 'gap');
});

test('与房间内容无关的项一律 unknown，不会被算成合格', () => {
  const summary = summarizeHomeResources(sampleRoom(), { cats: 1 });
  for (const id of ['in1', 'in2', 'in3', 'sm1', 'sm2', 'sm3', 'pl1']) {
    assert.equal(byId(summary.checks, id).status, 'unknown', `${id} 不应被自动判定`);
  }
  assert.equal(summary.checks.length, 15);
});

test('空房间不抛异常，且资源类检查全部为缺口', () => {
  const summary = summarizeHomeResources([], { cats: 1 });
  assert.equal(summary.counts.litter, undefined);
  for (const id of ['rs1', 'rs3', 'sp1', 'sp3', 'pl2']) {
    assert.equal(byId(summary.checks, id).status, 'gap', `${id} 在空房间里应为缺口`);
  }
  assert.equal(byId(summary.checks, 'rs2').status, 'unknown');
});

test('每条检查项都带证据等级；阈值类检查必须写明是操作化常量', () => {
  const summary = summarizeHomeResources(sampleRoom(), { cats: 1 });
  for (const check of summary.checks) {
    assert.ok(check.evidence, `${check.id} 缺少证据等级`);
    assert.ok(check.source, `${check.id} 缺少来源`);
  }
  assert.match(byId(summary.checks, 'rs2').note ?? '', /操作化常量/);
});

test('distanceToPath 基本正确', () => {
  const path = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
  ];
  assert.equal(distanceToPath({ x: 5, z: 3 }, path), 3);
  assert.equal(distanceToPath({ x: -2, z: 0 }, path), 2);
  assert.ok(distanceToPath({ x: 0, z: 0 }, []).valueOf() > 1e9);
});

test('分离阈值确实是 1.5 m（改动会打破场景与清单的一致性）', () => {
  assert.equal(RESOURCE_SEPARATION_MIN_M, 1.5);
  assert.equal(HIDE_OFF_PATH_MIN_M, 0.8);
});
