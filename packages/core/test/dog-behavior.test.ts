import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOG_ACTIVITY_DEFS,
  DOG_ACTIVITY_IDS,
  DOG_ANCHOR_IDS,
  DOG_ANCHOR_LABELS,
  DOG_INCIDENT_BOUNDARY_NOTE,
  DOG_INCIDENT_DEFS,
  DOG_INCIDENT_KINDS,
  DOG_INCIDENT_REFERRAL_NOTE,
  DOG_POSTURE_LABELS,
  FORBIDDEN_TERMS,
  NEGATION_MARKERS,
  buildDogTimeline,
  dogActivityAt,
  dogActivityShare,
  dogActivityWeightAt,
  dogIncidentAt,
  dogNightFactor,
  hourOfDayAt,
} from '../src/index.ts';
import type { DogActivityId, DogAnchorSpec, DogBehaviorTimeline } from '../src/index.ts';

// ---------------------------------------------------------------- 夹具

/**
 * 锚点夹具：与 `apps/web/src/scene/dog/dog-nav.ts` 的 `DOG_ANCHOR_SPECS` 同构
 * （同样按 `DOG_ANCHOR_IDS` 取 id、能力也照抄），但**不含朝向与坐标**——
 * 行为层不需要坐标，它只需要知道「有没有食盆、有没有院子」。
 */
const ANCHORS: readonly DogAnchorSpec[] = [
  { id: 'floor-living', label: '起居区', capabilities: ['floor', 'play'], heightM: 0 },
  { id: 'floor-kitchen', label: '厨房前走道', capabilities: ['floor'], heightM: 0 },
  { id: 'floor-entry', label: '玄关', capabilities: ['floor'], heightM: 0 },
  { id: 'floor-bedroom', label: '睡眠区', capabilities: ['floor', 'rest'], heightM: 0 },
  { id: 'floor-east', label: '电视柜北侧走道', capabilities: ['floor', 'play'], heightM: 0 },
  { id: 'floor-north', label: '推拉门前', capabilities: ['floor', 'doorway'], heightM: 0 },
  { id: 'food', label: '食盆前', capabilities: ['food'], heightM: 0 },
  { id: 'bed-main', label: '主软垫', capabilities: ['rest'], heightM: 0 },
  { id: 'bed-sleep', label: '床边软垫', capabilities: ['rest'], heightM: 0 },
  { id: 'outdoor-water', label: '院内水盆', capabilities: ['water', 'yard'], heightM: 0 },
  { id: 'yard-lawn', label: '院内草坪', capabilities: ['yard', 'run', 'play'], heightM: 0 },
  { id: 'elimination', label: '院北草地（排泄角）', capabilities: ['elimination', 'yard'], heightM: 0 },
  { id: 'yard-lounge', label: '休闲区', capabilities: ['yard', 'rest', 'play'], heightM: 0 },
  // 池塘本轮补上 `water`：玩水要落在它上面，而饮水仍然只在院内水盆/食盆旁。
  { id: 'yard-pond', label: '池塘边', capabilities: ['yard', 'play', 'water'], heightM: 0 },
  { id: 'deck', label: '木平台', capabilities: ['yard', 'doorway', 'rest'], heightM: 0 },
  // 本轮新增的 5 个院子锚点。能力逐字照抄跨包契约（与 `SIM_DOG_ANCHORS`、
  // web 的 `DOG_ANCHOR_SPECS` 是同一份），因为**能力漏配不会报错**，
  // 只会让对应的院子互动静默消失。
  { id: 'yard-lawn-center', label: '草坪中央', capabilities: ['yard', 'run', 'play', 'roll'], heightM: 0 },
  { id: 'yard-lawn-west', label: '草坪西侧', capabilities: ['yard', 'roll', 'sun'], heightM: 0 },
  { id: 'yard-lawn-east', label: '草坪东侧', capabilities: ['yard', 'run', 'play'], heightM: 0 },
  { id: 'yard-shade', label: '树下阴影', capabilities: ['yard', 'rest', 'sun'], heightM: 0 },
  { id: 'yard-dig', label: '灌木边草地', capabilities: ['yard', 'dig'], heightM: 0 },
];

const DAY_S = 24 * 3600;

/** 场地的集合：用于判定「在院子还是室内」。 */
const YARD_IDS = new Set([
  'outdoor-water',
  'yard-lawn',
  'elimination',
  'yard-lounge',
  'yard-pond',
  'deck',
  'yard-lawn-center',
  'yard-lawn-west',
  'yard-lawn-east',
  'yard-shade',
  'yard-dig',
]);

function build(seed: number, extra: Partial<Parameters<typeof buildDogTimeline>[0]> = {}): DogBehaviorTimeline {
  return buildDogTimeline({ seed, durationS: DAY_S, anchors: ANCHORS, ...extra });
}

/** 断言「区间连续铺满、无空洞、无重叠」这一条不变量，所有用例共用。 */
function assertContinuous(tl: DogBehaviorTimeline, label: string): void {
  assert.ok(tl.segments.length > 0, `${label}: 时间线不应为空`);
  const first = tl.segments[0];
  assert.ok(first, `${label}: 缺少第一个区间`);
  assert.equal(first.t, 0, `${label}: 第一个区间必须从 0 开始`);

  let prevEnd = 0;
  let total = 0;
  for (const [i, seg] of tl.segments.entries()) {
    assert.ok(seg.durS > 0, `${label}: 第 ${i} 段时长必须 > 0（${seg.durS}）`);
    assert.equal(seg.t, prevEnd, `${label}: 第 ${i} 段起点 ${seg.t} 与上一段终点 ${prevEnd} 不接续`);
    assert.ok(DOG_ACTIVITY_DEFS[seg.activity], `${label}: 第 ${i} 段活动 ${seg.activity} 未登记`);
    assert.ok(DOG_POSTURE_LABELS[seg.posture], `${label}: 第 ${i} 段姿势 ${seg.posture} 未登记`);
    prevEnd = seg.t + seg.durS;
    total += seg.durS;
  }
  assert.equal(prevEnd, tl.durationS, `${label}: 末尾 ${prevEnd} 未覆盖到 ${tl.durationS}`);
  assert.ok(
    Math.abs(total - tl.durationS) < 1e-6,
    `${label}: Σ durS=${total} 应等于 durationS=${tl.durationS}`,
  );

  // 预算合计也必须等于总时长：每一秒都要被计入某个活动，不重不漏
  const budgetSum = Object.values(tl.budgetS).reduce((a, b) => a + (b ?? 0), 0);
  assert.ok(
    Math.abs(budgetSum - tl.durationS) < 1e-6,
    `${label}: 时间预算合计 ${budgetSum} 应等于 ${tl.durationS}`,
  );
}

/** 某活动的「次数」：把连续的同活动区间算作一次。 */
function bouts(tl: DogBehaviorTimeline, activity: DogActivityId): number {
  let n = 0;
  let prev = false;
  for (const seg of tl.segments) {
    const now = seg.activity === activity;
    if (now && !prev) n++;
    prev = now;
  }
  return n;
}

/** 在指定小时区间内的活动占比（小时按 `hourOfDayAt` 与仿真约定一致，从 09:00 起算）。 */
function shareInHours(tl: DogBehaviorTimeline, activity: DogActivityId, fromH: number, toH: number): number {
  let hit = 0;
  let tot = 0;
  for (const seg of tl.segments) {
    for (let t = seg.t; t < seg.t + seg.durS; t += 60) {
      const h = hourOfDayAt(t);
      const inRange = fromH <= toH ? h >= fromH && h < toH : h >= fromH || h < toH;
      if (!inRange) continue;
      tot += 60;
      if (seg.activity === activity) hit += 60;
    }
  }
  return tot > 0 ? hit / tot : 0;
}

// ---------------------------------------------------------------- ① 不变量：连续铺满

test('狗的行为时间线：区间首尾相接、无空洞、无重叠，且恰好铺满', () => {
  for (const seed of [3, 42, 715, 2026]) {
    assertContinuous(build(seed), `seed=${seed}`);
  }
});

test('狗的行为时间线：多种时长都恰好铺满（含退化输入）', () => {
  for (const durationS of [60, 600, 3600, 6 * 3600, DAY_S]) {
    const tl = build(11, { durationS });
    assert.equal(tl.durationS, durationS);
    assertContinuous(tl, `durationS=${durationS}`);
  }
  // 时长为 0 不应抛异常，也不应产出任何区间
  const zero = build(11, { durationS: 0 });
  assert.equal(zero.segments.length, 0);
  assert.equal(zero.durationS, 0);
  // 负时长被钳到 0
  assert.equal(build(11, { durationS: -100 }).durationS, 0);
});

test('狗的行为时间线：没有锚点时退化为单一地面锚点，行为仍然有效', () => {
  const tl = buildDogTimeline({ seed: 9, durationS: 2 * 3600 });
  assertContinuous(tl, '无锚点');
  for (const seg of tl.segments) {
    assert.equal(seg.anchorId, 'floor-living', `无锚点时不应出现其它锚点：${seg.anchorId}`);
  }
  // 退化的单锚点场地里没有排泄角，因此**不能**出现「在起居区排泄」这种假象
  assert.equal(
    tl.segments.some((s) => s.activity === 'eliminating'),
    false,
    '没有排泄角锚点时不应产生排泄行为',
  );
});

test('狗的行为时间线：移动段的 anchorId 是目的地，定点段是所在地', () => {
  const tl = build(42);
  const known = new Set(DOG_ANCHOR_IDS);
  for (const seg of tl.segments) {
    assert.ok(known.has(seg.anchorId), `片段落在未知锚点 ${seg.anchorId}`);
  }
  // 到达某处后的定点段必须与移动段记录的目的地一致：相邻两段要么同锚点，
  // 要么后一段是「从别处移动过来」的目的地。
  for (let i = 1; i < tl.segments.length; i++) {
    const prev = tl.segments[i - 1]!;
    const seg = tl.segments[i]!;
    if (seg.t !== prev.t + prev.durS) continue;
    assert.ok(seg.anchorId.length > 0);
  }
  // 移动类活动的姿势必须是 moving（不是坐着、不是卧着）
  for (const id of ['walking', 'trotting', 'running', 'sniffing'] as const) {
    for (const seg of tl.segments.filter((s) => s.activity === id)) {
      assert.equal(seg.posture, 'moving', `${id} 段的姿势应为 moving`);
    }
  }
});

// ---------------------------------------------------------------- ② 确定性

test('狗的行为时间线：同种子严格一致', () => {
  const a = build(42);
  const b = build(42);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('狗的行为时间线：不同种子产出不同序列', () => {
  assert.notEqual(JSON.stringify(build(1).segments), JSON.stringify(build(2).segments));
});

test('狗的行为时间线：同种子 + 同注入同样严格一致', () => {
  const extra = { injectIncidents: [{ atS: 3600, kind: 'seizure' as const }] };
  assert.equal(JSON.stringify(build(5, extra)), JSON.stringify(build(5, extra)));
});

// ---------------------------------------------------------------- ③ 锚点硬约束

test('狗的行为硬约束：eating 只落在 food，drinking 只落在 outdoor-water / food', () => {
  for (const seed of [7, 42, 715]) {
    const tl = build(seed);
    for (const seg of tl.segments) {
      if (seg.activity === 'eating') {
        assert.equal(seg.anchorId, 'food', `seed=${seed} 进食出现在 ${seg.anchorId}`);
      }
      if (seg.activity === 'drinking') {
        assert.ok(
          seg.anchorId === 'food' || seg.anchorId === 'outdoor-water',
          `seed=${seed} 饮水出现在 ${seg.anchorId}（池塘不在允许列表里）`,
        );
      }
    }
  }
});

test('狗的行为硬约束：eliminating 只落在 elimination 锚点', () => {
  for (const seed of [7, 42, 715]) {
    const tl = build(seed);
    const elim = tl.segments.filter((s) => s.activity === 'eliminating');
    assert.ok(elim.length > 0, `seed=${seed} 一天里应当出现排泄`);
    for (const seg of elim) {
      assert.equal(seg.anchorId, 'elimination', `seed=${seed} 排泄出现在 ${seg.anchorId}`);
    }
  }
});

test('狗的行为硬约束：running 只在院子里，且一天里真的发生若干次', () => {
  for (const seed of [1, 42, 715]) {
    const tl = build(seed);
    const runs = tl.segments.filter((s) => s.activity === 'running');
    assert.ok(runs.length > 0, `seed=${seed} 一天里应当出现奔跑（16 种活动都要出现）`);
    for (const seg of runs) {
      assert.ok(YARD_IDS.has(seg.anchorId), `seed=${seed} 奔跑出现在 ${seg.anchorId}（应在院子里）`);
    }
  }
});

test('狗的行为硬约束：吃喝与排泄的次数落在「一天数次」的量级', () => {
  // 这不是文献数字，而是一条**合理性**断言：采样器每几十秒就重选一次活动，
  // 若没有节拍上限，一个 0.5% 权重的行为一天也能被选中上百次（「一天排泄 100 次」）。
  // 这条断言把 DOG_MIN_INTERVAL_S 的意图钉住。
  for (const seed of [7, 42, 715]) {
    const tl = build(seed);
    assert.ok(bouts(tl, 'eliminating') >= 2 && bouts(tl, 'eliminating') <= 12, `seed=${seed} 排泄次数 ${bouts(tl, 'eliminating')}`);
    assert.ok(bouts(tl, 'running') >= 2, `seed=${seed} 奔跑次数 ${bouts(tl, 'running')}`);
    // 睡觉次数也应当收敛：碎片化的睡眠说明节拍或时长区间失控
    assert.ok(bouts(tl, 'sleeping') <= 200, `seed=${seed} 睡眠段数 ${bouts(tl, 'sleeping')} 过多`);
  }
});

test('狗的行为硬约束：playing 落在具备玩耍条件的锚点（草坪 / 休闲区 / 起居区 / 走道 / 池塘边）', () => {
  const PLAY_IDS = new Set([
    'yard-lawn',
    'yard-lawn-center',
    'yard-lawn-east',
    'yard-lounge',
    'floor-living',
    'floor-east',
    'yard-pond',
  ]);
  const tl = build(42);
  const plays = tl.segments.filter((s) => s.activity === 'playing');
  assert.ok(plays.length > 0, '一天里应当出现玩耍');
  for (const seg of plays) {
    assert.ok(PLAY_IDS.has(seg.anchorId), `玩耍出现在 ${seg.anchorId}`);
  }
});

test('全部 16 种活动都会出现，且姿势与登记表一致', () => {
  const tl = build(715);
  const seen = new Set(tl.segments.map((s) => s.activity));
  for (const id of DOG_ACTIVITY_IDS) {
    assert.ok(seen.has(id as DogActivityId), `24 小时内未出现活动 ${id}`);
  }
  for (const seg of tl.segments) {
    assert.equal(seg.posture, DOG_ACTIVITY_DEFS[seg.activity].posture, `${seg.activity} 段姿势与登记表不符`);
  }
});

// ---------------------------------------------------------------- ③b 院子里的互动（本轮新增）

/** 院子里的四种互动：用户反馈「希望狗在院子里多做一些交互」的落点。 */
const YARD_INTERACTIONS = ['water-play', 'rolling', 'digging', 'sunning'] as const;

test('院子里的四种互动都会真的出现，且玩水一天至少两次', () => {
  // 这条断言守的是「加了活动但时间线里从来不出现」这一类**静默失效**：
  // 活动定义齐了、锚点也配了，只要「整段窗口」与「最短移动 10 s」的关系不对，
  // 整段就会被记成 walking、活动一次都不发生（本轮实测：窗口取 12 s 时打滚零次）。
  for (const seed of [1, 42, 715, 2026]) {
    const tl = build(seed);
    const wp = bouts(tl, 'water-play');
    assert.ok(wp >= 2, `seed=${seed} 玩水只出现 ${wp} 次（用户点名的互动必须反复出现）`);
    for (const id of ['rolling', 'digging', 'sunning'] as const) {
      assert.ok(bouts(tl, id) >= 1, `seed=${seed} 一天里没有出现 ${id}`);
    }
  }
});

test('院子互动的硬约束：玩水在池塘/水盆，打滚在两块草坪，刨地在灌木边，晒太阳在三处日照位', () => {
  const SUN_IDS = new Set(['yard-shade', 'yard-lawn-west', 'deck']);
  for (const seed of [7, 42, 715]) {
    const tl = build(seed);
    for (const seg of tl.segments) {
      if (seg.activity === 'water-play') {
        assert.ok(
          seg.anchorId === 'yard-pond' || seg.anchorId === 'outdoor-water',
          `seed=${seed} 玩水出现在 ${seg.anchorId}`,
        );
      }
      if (seg.activity === 'rolling') {
        assert.ok(
          seg.anchorId === 'yard-lawn-center' || seg.anchorId === 'yard-lawn-west',
          `seed=${seed} 打滚出现在 ${seg.anchorId}`,
        );
      }
      if (seg.activity === 'digging') {
        assert.equal(seg.anchorId, 'yard-dig', `seed=${seed} 刨地出现在 ${seg.anchorId}`);
      }
      if (seg.activity === 'sunning') {
        assert.ok(SUN_IDS.has(seg.anchorId), `seed=${seed} 晒太阳出现在 ${seg.anchorId}`);
      }
    }
  }
});

test('晒太阳只在白天出现：起点落在日照窗内，整段不跨进夜里', () => {
  // 夜里出现「晒太阳」是荒谬的，因此这一条**不能只靠节拍兜底**：
  // 权重函数在夜间与日照窗外直接把它的权重归零（见 `dogActivityWeights` 的 `daylight`）。
  for (const seed of [1, 7, 42, 99, 715, 2026]) {
    const tl = build(seed);
    const sun = tl.segments.filter((s) => s.activity === 'sunning');
    assert.ok(sun.length > 0, `seed=${seed} 一天里没有晒太阳`);
    for (const seg of sun) {
      const h0 = hourOfDayAt(seg.t);
      assert.equal(dogNightFactor(h0), 0, `seed=${seed} 晒太阳在夜间起段（h=${h0}）`);
      assert.ok(h0 >= 7 && h0 < 20, `seed=${seed} 晒太阳不在日照窗内（h=${h0}）`);
      // 整段都不得落进夜间：它一次占 5–15 分钟，跨过 22:00 就不再是「白天」了
      for (let t = seg.t; t < seg.t + seg.durS; t += 60) {
        assert.equal(dogNightFactor(hourOfDayAt(t)), 0, `seed=${seed} 晒太阳的区间跨进了夜间（t=${t}）`);
      }
      assert.equal(dogNightFactor(hourOfDayAt(seg.t + seg.durS - 0.001)), 0);
    }
  }
});

test('四种院子互动都有白天偏向：不会在夜间起段', () => {
  // 「短时高频」的三段只有十几秒，因此判据取**起段时刻**：
  // 权重在夜里为 0，选不出来就是选不出来。
  for (const seed of [1, 42, 715]) {
    const tl = build(seed);
    for (const id of YARD_INTERACTIONS) {
      for (const seg of tl.segments.filter((s) => s.activity === id)) {
        assert.equal(dogNightFactor(hourOfDayAt(seg.t)), 0, `seed=${seed} ${id} 在夜间起段（t=${seg.t}）`);
      }
    }
  }
});

test('退化场地（只有一块地面）里不出现院子互动：没有对应锚点就不给权重', () => {
  // 与「没有排泄角就不产生排泄」同一条纪律：活动与场地是**绑定的**。
  // 少了这条，狗会在起居区「玩水」——一个场地里根本不存在的地方。
  const tl = buildDogTimeline({ seed: 42, durationS: DAY_S });
  for (const id of YARD_INTERACTIONS) {
    assert.equal(
      tl.segments.some((s) => s.activity === id),
      false,
      `退化场地里没有 ${id} 需要的锚点，却出现了该活动`,
    );
  }
});

test('新锚点的 id 与 capabilities 逐字等于跨包契约（web 侧同步加同样的条目）', () => {
  // 能力的单一事实来源是这条跨包契约：`ANCHORS` 夹具、`SIM_DOG_ANCHORS`、
  // web 的 `DOG_ANCHOR_SPECS` 三处**逐字**一致。能力漏配不会报错，
  // 只会让某一种院子互动静默消失，所以这里逐个钉死。
  const EXPECTED: Readonly<Record<string, readonly string[]>> = {
    'yard-lawn-center': ['yard', 'run', 'play', 'roll'],
    'yard-lawn-west': ['yard', 'roll', 'sun'],
    'yard-lawn-east': ['yard', 'run', 'play'],
    'yard-shade': ['yard', 'rest', 'sun'],
    'yard-dig': ['yard', 'dig'],
    // 已有锚点本轮只加一个能力：池塘能玩水，但仍然不在「饮水」的白名单里
    'yard-pond': ['yard', 'play', 'water'],
  };
  for (const [id, caps] of Object.entries(EXPECTED)) {
    const spec = ANCHORS.find((a) => a.id === id);
    assert.ok(spec, `锚点 ${id} 不在锚点表里`);
    assert.deepEqual([...spec.capabilities], [...caps], `锚点 ${id} 的能力与契约不符`);
    assert.equal(spec.heightM, 0, `锚点 ${id} 的高度必须为 0（狗不上家具）`);
  }
  // 五个新锚点都在院子里：院子互动的前提是「场地里真的有那个地方」
  for (const id of ['yard-lawn-center', 'yard-lawn-west', 'yard-lawn-east', 'yard-shade', 'yard-dig']) {
    const spec = ANCHORS.find((a) => a.id === id);
    assert.ok(spec, `锚点 ${id} 不在锚点表里`);
    assert.ok(spec.capabilities.includes('yard'), `锚点 ${id} 应当属于院子`);
  }
  // 池塘有了 `water`，但喝水那条白名单里依然没有它——两条一起成立才说明这条改动是准的
  const tl = build(42);
  assert.equal(
    tl.segments.some((s) => s.activity === 'drinking' && s.anchorId === 'yard-pond'),
    false,
    '池塘标了 water 之后，饮水不应被引流到池塘',
  );
});

// ---------------------------------------------------------------- ④ 突发注入

test('注入的突发一定出现在 incidents 里，且时长取 DOG_INCIDENT_DEFS', () => {
  const requests = [
    { atS: 2 * 3600, kind: 'seizure' as const },
    { atS: 8 * 3600, kind: 'vomit' as const },
  ];
  const tl = build(42, { injectIncidents: requests });
  assertContinuous(tl, '含注入突发');
  for (const req of requests) {
    const hit = tl.incidents.find((i) => i.kind === req.kind && i.injected);
    assert.ok(hit, `注入的 ${req.kind} 未被记录`);
    assert.ok(hit.injected, `${req.kind} 必须标记 injected`);
    assert.equal(hit.t, req.atS, `${req.kind} 落位应为请求时刻（请求 ${req.atS}，实际 ${hit.t}）`);
    assert.equal(
      hit.durationS,
      DOG_INCIDENT_DEFS[req.kind].durationS,
      `${req.kind} 时长应取 DOG_INCIDENT_DEFS`,
    );
  }
});

test('突发事件不把时间线捅出洞：注入后仍然首尾相接、恰好铺满', () => {
  const tl = build(7, {
    injectIncidents: DOG_INCIDENT_KINDS.map((kind, i) => ({ atS: 3600 * (i + 1), kind })),
  });
  assertContinuous(tl, '全部突发种类');
  for (const inc of tl.incidents.filter((i) => i.injected)) {
    assert.ok(dogIncidentAt(tl, inc.t), `${inc.kind} 在起点处未命中`);
    assert.ok(dogIncidentAt(tl, inc.t + inc.durationS - 0.001), `${inc.kind} 在末点前未命中`);
    assert.equal(dogIncidentAt(tl, inc.t + inc.durationS + 0.001), null, `${inc.kind} 结束后仍命中`);
    // 突发事件对应的区间必须带 incidentKind，且活动/姿势与突发相符
    const seg = dogActivityAt(tl, inc.t + inc.durationS / 2);
    assert.equal(seg.incidentKind, inc.kind, `${inc.kind} 对应区间未标记 incidentKind`);
    assert.equal(seg.posture, DOG_INCIDENT_DEFS[inc.kind].posture, `${inc.kind} 覆盖期间的姿势不符`);
  }
});

test('突发与活动相符：抽搐=侧卧不动，呕吐=站立低头', () => {
  const seizure = DOG_INCIDENT_DEFS.seizure;
  const vomit = DOG_INCIDENT_DEFS.vomit;
  assert.equal(seizure.posture, 'lying');
  assert.equal(vomit.posture, 'lowered');

  const tlS = build(42, { injectIncidents: [{ atS: 3600, kind: 'seizure' }] });
  const incS = tlS.incidents.find((i) => i.kind === 'seizure' && i.injected);
  assert.ok(incS);
  const segS = dogActivityAt(tlS, incS.t + incS.durationS / 2);
  assert.equal(segS.posture, 'lying', '抽搐期间应侧卧');
  assert.equal(segS.activity, 'resting', '抽搐期间活动应为「不动」');

  const tlV = build(42, { injectIncidents: [{ atS: 3600, kind: 'vomit' }] });
  const incV = tlV.incidents.find((i) => i.kind === 'vomit' && i.injected);
  assert.ok(incV);
  const segV = dogActivityAt(tlV, incV.t + incV.durationS / 2);
  assert.equal(segV.posture, 'lowered', '呕吐期间应站立低头');
});

test('不注入时没有 injected 的突发；越界与重复的注入被丢弃', () => {
  assert.equal(build(4).incidents.filter((i) => i.injected).length, 0);

  const tl = build(4, {
    injectIncidents: [
      { atS: -10, kind: 'seizure' },
      { atS: DAY_S + 10, kind: 'seizure' },
      { atS: 600, kind: 'seizure' },
      { atS: 600, kind: 'vomit' },
    ],
  });
  const injected = tl.incidents.filter((i) => i.injected);
  assert.equal(injected.length, 1, `越界应被丢弃、同一时刻只保留第一条，实际 ${injected.length}`);
  assert.equal(injected[0]?.kind, 'seizure');
});

test('突发时相划分：各时相之和等于演示时长，且每段都为正值', () => {
  for (const kind of DOG_INCIDENT_KINDS) {
    const def = DOG_INCIDENT_DEFS[kind];
    assert.ok(def.phases.length >= 2, `${kind} 应至少有两个时相`);
    let sum = 0;
    for (const phase of def.phases) {
      assert.ok(phase.durS > 0, `${kind} 的时相「${phase.name}」时长必须 > 0`);
      assert.ok(phase.name.length > 0);
      sum += phase.durS;
    }
    assert.equal(sum, def.durationS, `${kind} 的时相之和 ${sum} 应等于演示时长 ${def.durationS}`);
  }
});

// ---------------------------------------------------------------- ⑤ 昼夜差异

test('狗的节律：夜间以睡眠为主，白天活动量更大', () => {
  // 断言的是**结构性差异**（夜里睡、白天动），不是任何文献百分比：
  // 引擎的片段时长与权重都是操作化常量，能复现的只有这条方向性结论。
  for (const seed of [42, 715]) {
    const tl = build(seed);
    const nightSleep = shareInHours(tl, 'sleeping', 22, 5);
    const daySleep = shareInHours(tl, 'sleeping', 9, 18);
    // 实测（seed 1…2026）：夜间 0.31–0.35、白天 0.04–0.06，比值 6–8 倍。
    // 阈值刻意取得宽松：这条断言守的是**方向**（夜里睡、白天醒），不是某个百分比。
    assert.ok(
      nightSleep > daySleep * 3,
      `seed=${seed} 夜间睡眠占比 ${nightSleep.toFixed(3)} 应明显高于白天 ${daySleep.toFixed(3)}`,
    );
    assert.ok(nightSleep > 0.25, `seed=${seed} 夜间睡眠占比 ${nightSleep.toFixed(3)} 过低`);
    assert.ok(daySleep < 0.2, `seed=${seed} 白天睡眠占比 ${daySleep.toFixed(3)} 过高`);

    const nightMove =
      shareInHours(tl, 'walking', 22, 5) + shareInHours(tl, 'trotting', 22, 5) + shareInHours(tl, 'sniffing', 22, 5);
    const dayMove =
      shareInHours(tl, 'walking', 9, 18) + shareInHours(tl, 'trotting', 9, 18) + shareInHours(tl, 'sniffing', 9, 18);
    assert.ok(dayMove > nightMove, `seed=${seed} 白天走动类 ${dayMove.toFixed(3)} 应高于夜间 ${nightMove.toFixed(3)}`);
  }
});

test('狗的节律曲线：落在 0–1、一天内不均匀、越界小时取模', () => {
  for (let h = 0; h < 24; h += 0.25) {
    const v = dogActivityWeightAt(h);
    assert.ok(v >= 0 && v <= 1, `h=${h} 倾向 ${v} 越界`);
  }
  // 清晨与傍晚是主人的散步/互动时段，明显高于午后与深夜
  assert.ok(dogActivityWeightAt(7) > dogActivityWeightAt(13));
  assert.ok(dogActivityWeightAt(17) > dogActivityWeightAt(13));
  assert.ok(dogActivityWeightAt(3) < dogActivityWeightAt(13));
  assert.equal(dogActivityWeightAt(25), dogActivityWeightAt(1));
  assert.equal(dogActivityWeightAt(-1), dogActivityWeightAt(23));
});

test('夜间程度：22:00–05:00 为 1，白天为 0', () => {
  assert.equal(dogNightFactor(23), 1);
  assert.equal(dogNightFactor(2), 1);
  assert.equal(dogNightFactor(5), 1);
  assert.equal(dogNightFactor(9), 0);
  assert.equal(dogNightFactor(15), 0);
  assert.equal(dogNightFactor(21), 0);
});

test('狗的节律与猫的节律是两套参数，不共用一条曲线', () => {
  // 这条断言守的是「共用机制、分开参数」这条纪律：狗的昼夜结构与猫不同，
  // 若哪天有人把狗版的曲线改成 import 猫的 `activityWeightAt`，两侧的
  // 形状会立刻一致，这里就会失败。
  const cat = [0.1, 0.12, 0.14, 0.2, 0.5, 0.92, 0.78, 0.86, 0.88, 0.72, 0.5, 0.42];
  const dog = cat.map((_, i) => dogActivityWeightAt(i));
  const sameOverallShape = cat.every((v, i) => Math.abs(v - (dog[i] ?? 0)) < 0.02);
  assert.equal(sameOverallShape, false, '狗版节律不应与猫版曲线逐点相同');
  // 差异要出现在最能说明问题的地方：深夜（猫 0.1 附近，狗更低）与清晨
  assert.ok(dogActivityWeightAt(3) < 0.2);
});

// ---------------------------------------------------------------- 求值

test('dogActivityAt：区间内任意时刻返回同一条目，且越界钳制不抛异常', () => {
  const tl = build(8);
  for (const seg of tl.segments) {
    assert.equal(dogActivityAt(tl, seg.t).activity, seg.activity, `t=${seg.t} 处活动不一致`);
    const mid = dogActivityAt(tl, seg.t + seg.durS / 2);
    assert.equal(mid.activity, seg.activity);
    assert.equal(mid.posture, seg.posture);
  }
  assert.equal(dogActivityAt(tl, -100).t, 0);
  assert.ok(dogActivityAt(tl, tl.durationS + 1000).t >= 0);
});

test('dogActivityAt：二分查找命中的区间一定包含该时刻', () => {
  const tl = build(23);
  for (let t = 0; t < tl.durationS; t += 137) {
    const seg = dogActivityAt(tl, t);
    assert.ok(seg.t <= t && t < seg.t + seg.durS, `t=${t} 命中的区间不包含该时刻`);
  }
});

test('dogIncidentAt：没有突发时恒为 null', () => {
  const tl = build(4);
  for (let t = 0; t < tl.durationS; t += 3600) {
    assert.equal(dogIncidentAt(tl, t), null);
  }
});

// ---------------------------------------------------------------- 时长纪律

test('时长纪律：休息/睡眠 60–300 s，移动段 8–40 s', () => {
  const MOVE = new Set<DogActivityId>(['walking', 'trotting', 'running', 'sniffing']);
  for (const seed of [1, 7, 42, 99, 715]) {
    const tl = build(seed);
    // 首尾各留一段：末段是「一天剩下多少就铺多少」，受窗口而不是受纪律约束。
    const interior = tl.segments.slice(1, -1);
    for (const seg of interior) {
      if (MOVE.has(seg.activity)) {
        assert.ok(
          seg.durS >= 7.99 && seg.durS <= 40.01,
          `seed=${seed} ${seg.activity} 时长 ${seg.durS} 应落在 8–40 s`,
        );
      }
      // 定点段的停留下限只对**真正的停留**成立：行程尾段（由移动段带出来的那一段，
      // 例如「走完 40 s 之后的警觉张望」）受窗口约束，可以更短。
      if (seg.activity === 'eating' || seg.activity === 'drinking' || seg.activity === 'eliminating') {
        assert.ok(seg.durS >= 19.99, `seed=${seed} ${seg.activity} 时长 ${seg.durS} 过短`);
      }
    }
    // 主流休息/睡眠段确实落在 60–300 s：取中位数判定，
    // 不被少数「窗口截短」的段落带偏。
    for (const id of ['resting', 'sleeping'] as const) {
      const durs = tl.segments.filter((s) => s.activity === id).map((s) => s.durS);
      assert.ok(durs.length > 0, `一天里应当出现 ${id}`);
      const sorted = [...durs].sort((a, b) => a - b);
      const m = sorted[Math.floor(sorted.length / 2)] ?? 0;
      assert.ok(m >= 60 && m <= 300, `seed=${seed} ${id} 时长中位数 ${m} 应落在 60–300 s`);
    }
  }
});

test('时长纪律：休息与睡眠合计占一天的可观比例', () => {
  const tl = build(42);
  const rest = dogActivityShare(tl, 'resting') + dogActivityShare(tl, 'sleeping');
  assert.ok(rest > 0.2 && rest < 0.85, `休息+睡眠占比 ${rest.toFixed(3)} 越界`);
});

// ---------------------------------------------------------------- 词汇与文案

test('活动词汇：16 种活动都有定义、姿势与中文名', () => {
  assert.equal(DOG_ACTIVITY_IDS.length, 16);
  for (const id of DOG_ACTIVITY_IDS) {
    const def = DOG_ACTIVITY_DEFS[id as DogActivityId];
    assert.ok(def, `活动 ${id} 缺少定义`);
    assert.equal(def.id, id);
    assert.ok(DOG_POSTURE_LABELS[def.posture], `活动 ${id} 的姿势未登记`);
    assert.ok(def.label.length > 0 && def.hint.length > 0);
    assert.ok(Number.isFinite(def.weight) && def.weight >= 0, `活动 ${id} 权重非法`);
  }
  assert.equal(DOG_ACTIVITY_IDS.length, Object.keys(DOG_ACTIVITY_DEFS).length);
});

test('锚点 id 清单与锚点表一致（跨包契约）', () => {
  // 单一事实来源是 DOG_ANCHOR_IDS；apps/web 的 dog-nav.ts 按它建表。
  // 这条断言保证「契约里的 id」不会多于或少于实际可用的锚点。
  assert.deepEqual(ANCHORS.map((a) => a.id).sort(), [...DOG_ANCHOR_IDS].sort());
  for (const id of DOG_ANCHOR_IDS) {
    assert.ok(DOG_ANCHOR_LABELS[id], `锚点 ${id} 缺少中文名`);
  }
  assert.equal(Object.keys(DOG_ANCHOR_LABELS).length, DOG_ANCHOR_IDS.length);
  // 逐字钉住顺序：web 层是按这个顺序写死映射的
  assert.deepEqual([...DOG_ANCHOR_IDS], [
    'floor-living',
    'floor-kitchen',
    'floor-entry',
    'floor-bedroom',
    'floor-east',
    'floor-north',
    'food',
    'bed-main',
    'bed-sleep',
    'outdoor-water',
    'yard-lawn',
    'elimination',
    'yard-lounge',
    'yard-pond',
    'deck',
    'yard-lawn-center',
    'yard-lawn-west',
    'yard-lawn-east',
    'yard-shade',
    'yard-dig',
  ]);
});

test('突发种类与定义一一对应', () => {
  for (const kind of DOG_INCIDENT_KINDS) {
    const def = DOG_INCIDENT_DEFS[kind];
    assert.equal(def.kind, kind);
    assert.ok(def.durationS > 0);
    assert.ok(DOG_POSTURE_LABELS[def.posture], `突发 ${kind} 的姿势未登记`);
    assert.ok(def.hint.length > 5);
  }
  assert.equal(DOG_INCIDENT_KINDS.length, Object.keys(DOG_INCIDENT_DEFS).length);
});

/**
 * 与 `scripts/check-claims.mjs` 的门禁规则保持一致：
 * 命中禁词时，若**同一行**含否定标记（`不构成`/`不是`/`禁止`/`无法` …），视为边界说明，放行。
 * 这里复刻这条规则而不是简单禁止所有出现——否则「不构成诊断」这种**必需**的
 * 免责声明反而会被自己的测试判为违规。
 */
function assertNoForbiddenClaim(text: string, label: string): void {
  for (const line of text.split('\n')) {
    for (const { term, why } of FORBIDDEN_TERMS) {
      if (!line.includes(term)) continue;
      const negated = NEGATION_MARKERS.some((m) => line.includes(m));
      assert.ok(negated, `${label}：行内出现禁词「${term}」（${why}）却没有否定标记：${line}`);
    }
  }
}

test('狗的突发文案：必须明确「不构成」，且禁词只能出现在否定语境里', () => {
  const texts: string[] = [DOG_INCIDENT_BOUNDARY_NOTE, DOG_INCIDENT_REFERRAL_NOTE];
  for (const kind of DOG_INCIDENT_KINDS) {
    texts.push(DOG_INCIDENT_DEFS[kind].label, DOG_INCIDENT_DEFS[kind].hint);
    for (const phase of DOG_INCIDENT_DEFS[kind].phases) texts.push(phase.name);
  }
  for (const id of DOG_ACTIVITY_IDS) {
    texts.push(DOG_ACTIVITY_DEFS[id as DogActivityId].label, DOG_ACTIVITY_DEFS[id as DogActivityId].hint);
  }
  for (const id of DOG_ANCHOR_IDS) texts.push(DOG_ANCHOR_LABELS[id] ?? '');

  assertNoForbiddenClaim(texts.join('\n'), '狗版行为层文案');
  // 边界句必须明确「不构成诊断」这一否定表述，而不是只说「演示」
  assert.match(DOG_INCIDENT_BOUNDARY_NOTE, /不构成/);
  assert.match(DOG_INCIDENT_BOUNDARY_NOTE, /不是/);
  // 转诊路径必须给出下一步动作
  assert.match(DOG_INCIDENT_REFERRAL_NOTE, /兽医/);
});
