/**
 * 狗版「仿真会话」的端到端单测：`generateSession()` 在 `species === 'dog'` 时
 * 必须产出一整段**按狗的标准**的会话（生理读数 + 事件流 + 狗的行为时间线）。
 *
 * 这个文件守的是四条**跨包/跨物种**的边界，任何一条破了都不会在类型检查阶段报错：
 *   1. 狗的锚点表（simulator）与 core 的 `DOG_ANCHOR_IDS` 逐字一致——漏配会让
 *      「狗走进一个仿真里不存在的锚点」，或退化成「一整天待在一个点上」；
 *   2. 狗的会话只产出 `dogBehaviorTimeline`，猫的会话只产出 `behaviorTimeline`
 *      （两个消费方各读各的，谁也不该读到对方的时间线）；
 *   3. 事件流必须由**狗**的行为派生，而不是沿用猫那张按猫活动名写的 switch
 *      （复用不会报错，只会让狗的事件流恒为空或与行为对不上）；
 *   4. 猫那一路的行为**一行未变**（回归），因为本轮改的是分派点与新增字段。
 *
 * ⚠️ 措辞边界：本文件只断言仿真数据的结构与方向。狗的生理基线是**仿真参数**，
 * 它们不构成任何临床或诊断用途，也不是对真实犬只的测量值。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSession, SIM_DOG_ANCHORS } from '../src/index.ts';
// ⚠️ 运行时导入 core 必须走相对路径：`@camp/core` 是 node_modules 下的目录联接，
// 而 Node 的类型剥离拒绝处理 node_modules 下的文件（AGENTS.md §5.5.6）。
import {
  CAT_BREEDS,
  DOG_ACTIVITY_IDS,
  DOG_ANCHOR_IDS,
  DOG_BREEDS,
  DOG_INCIDENT_DEFS,
  dogActivityAt,
  dogIncidentAt,
  sizeClassOf,
} from '../../core/src/index.ts';
import type { PetProfile, Session } from '@camp/core';

// ---------------------------------------------------------------- 夹具

/** 本场景的主角：柴犬（肩高约 40 cm、体重约 10 kg）。 */
const shiba: PetProfile = {
  species: 'dog',
  breedId: 'shiba',
  weightKg: 10,
  heightCm: 40,
  ageMonths: 36,
};

const cat: PetProfile = {
  species: 'cat',
  breedId: 'domestic-shorthair',
  weightKg: 4.2,
  heightCm: 24,
  ageMonths: 36,
};

const DAY_MIN = 720; // 12 小时；够跨过狗的清晨/傍晚两个活动宽肩与夜间睡眠

function dogSession(over: Partial<Parameters<typeof generateSession>[0]> = {}): Session {
  return generateSession({
    profile: shiba,
    seed: 42,
    durationMin: DAY_MIN,
    scenario: 'living-room-day',
    ...over,
  });
}

/** 中位数。断言只看**方向与量级**，因此不需要更复杂的统计量。 */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  if (s.length === 0) return 0;
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

// ---------------------------------------------------------------- ① 完整会话

test('狗档案能生成完整会话：生理读数 + 事件 + 狗的行为时间线', () => {
  const s = dogSession();

  // 采样与真值一一对应（读数 ≠ 真值这条纪律在狗这边同样成立）
  assert.ok(s.samples.length > 0, '狗会话不应没有采样');
  assert.equal(s.samples.length, (DAY_MIN * 60) / 10);
  assert.equal(s.truth?.vitals?.length, s.samples.length, '真值序列应与采样一一对应');
  assert.ok(s.samples.every((x) => typeof x.hrvRmssdMs === 'number'), '每个采样点都应有 HRV 读数');
  const validHr = s.samples.filter((x) => x.readingQuality?.hr?.validity === 'valid');
  assert.ok(validHr.length > 0, '应存在心率可用的窗口（否则会话只是个空壳）');

  // 事件流由行为派生，不应为空；也不该只有发声那一类
  assert.ok(s.events.length > 0, '狗会话应有事件');
  const kinds = new Set(s.events.map((e) => e.kind));
  assert.ok(kinds.size >= 3, `事件种类过少：${[...kinds].join(',')}`);

  // 时间线：**只有**狗的那条
  const tl = s.dogBehaviorTimeline;
  assert.ok(tl, '狗会话应带 dogBehaviorTimeline');
  assert.equal(s.behaviorTimeline, undefined, '狗会话不应产出猫的时间线');
  assert.equal(tl.durationS, DAY_MIN * 60);

  // 时间线不变量：区间首尾相接、无空洞、恰好铺满
  let prevEnd = 0;
  let total = 0;
  for (const seg of tl.segments) {
    assert.ok(seg.durS > 0, `区间时长必须 > 0（${seg.durS}）`);
    assert.equal(seg.t, prevEnd, `区间起点 ${seg.t} 与上一段终点 ${prevEnd} 不接续`);
    prevEnd = seg.t + seg.durS;
    total += seg.durS;
  }
  assert.equal(prevEnd, tl.durationS);
  assert.ok(Math.abs(total - tl.durationS) < 1e-6);

  // 采样点上的活动/锚点必须能在时间线里查到同一件事（画面、事件流、读数共用一条时间轴）
  for (const i of [0, 10, 500, 2000]) {
    const sample = s.samples[i]!;
    const seg = dogActivityAt(tl, sample.t);
    assert.equal(sample.activityId, seg.activity, `采样 ${i} 的活动与时间线不一致`);
    assert.equal(sample.anchorId, seg.anchorId, `采样 ${i} 的锚点与时间线不一致`);
    assert.ok(
      (DOG_ACTIVITY_IDS as readonly string[]).includes(seg.activity),
      `时间线出现了未登记的活动 ${seg.activity}`,
    );
  }
});

test('狗的时间线用的是狗的锚点表：一天里至少覆盖 6 个不同锚点', () => {
  // 这条断言专门拦一个**静默**的退化：`generateSession` 走 `buildDogTimeline` 时忘了传锚点，
  // 引擎会退回「只有一块地面」的场地——时间线照样连续、照样确定、照样有 16 种活动，
  // 只是狗哪儿也不去。从数字上很难一眼看出，因此这里直接数锚点个数。
  for (const seed of [42, 715]) {
    const tl = dogSession({ seed }).dogBehaviorTimeline;
    assert.ok(tl, `seed=${seed} 缺少狗的时间线`);
    const anchors = new Set(tl.segments.map((s) => s.anchorId));
    assert.ok(
      anchors.size >= 6,
      `seed=${seed} 只覆盖了 ${anchors.size} 个锚点（${[...anchors].join('、')}），像是退化成了单点场地`,
    );
    for (const id of anchors) {
      assert.ok(DOG_ANCHOR_IDS.includes(id), `片段落在 core 契约之外的锚点 ${id}`);
    }
    // 16 种活动都该出现：缺哪一类都说明锚点能力漏配（能力是「这个活动能不能发生」的前提）
    const seen = new Set<string>(tl.segments.map((s) => s.activity));
    for (const id of DOG_ACTIVITY_IDS) {
      assert.ok(seen.has(id), `12 小时内未出现活动 ${id}`);
    }
  }
});

// ---------------------------------------------------------------- ② 跨包契约：锚点

test('SIM_DOG_ANCHORS 的 id 与 core 的 DOG_ANCHOR_IDS 逐字一致（含顺序）', () => {
  // 单一事实来源是 core 的 `DOG_ANCHOR_IDS`；`apps/web/src/scene/dog/dog-nav.ts` 与这里
  // 各建一张表，两边都按它取 id。**顺序也钉住**：web 层是按这个顺序写死坐标与朝向的。
  assert.deepEqual(
    SIM_DOG_ANCHORS.map((a) => a.id),
    [...DOG_ANCHOR_IDS],
    '仿真器的狗锚点表与 core 的锚点 id 清单不一致（漏配会让狗走进一个不存在的锚点）',
  );
  assert.equal(SIM_DOG_ANCHORS.length, 20);
  for (const spec of SIM_DOG_ANCHORS) {
    assert.ok(spec.label.length > 0, `锚点 ${spec.id} 缺少中文名`);
    assert.ok(spec.capabilities.length > 0, `锚点 ${spec.id} 没有声明任何能力`);
    // 狗不上家具：高度全 0。写一个非零高度会让行为层以为存在攀爬目标。
    assert.equal(spec.heightM, 0, `锚点 ${spec.id} 的高度必须为 0（狗不上家具）`);
  }
});

// ---------------------------------------------------------------- ③ 生理基线

test('狗的静息心率落在狗的生理量级，且与同体重同肩高的猫明显不同（猫更高）', () => {
  // 两个档案**除 species 外完全相同**：基线的体型因子只吃肩高，若连体重/肩高一起换，
  // 测出来的就是两个变量的混合，而不是物种差异。
  const catSameSize: PetProfile = {
    species: 'cat',
    breedId: 'maine-coon',
    weightKg: shiba.weightKg,
    heightCm: shiba.heightCm,
    ageMonths: shiba.ageMonths,
  };
  const dog = dogSession();
  const catS = generateSession({
    profile: catSameSize,
    seed: 42,
    durationMin: DAY_MIN,
    scenario: 'living-room-day',
  });

  const restingHr = (s: Session): number[] =>
    s.samples
      .filter((x) => x.measurementCondition === 'resting' && x.readingQuality?.hr?.validity === 'valid')
      .map((x) => x.hrBpm ?? 0);

  const dogHr = median(restingHr(dog));
  const catHr = median(restingHr(catS));
  assert.ok(dogHr > 0 && catHr > 0, '两边都应有静息窗口');

  // 只断言**方向与量级**，不编造精确值：`baselines()` 里的 95 / 160 与体型因子都是
  // **仿真参数**（操作化常量），不是对真实动物的测量值。这里守的是
  // 「狗落在狗的档、猫落在猫的档、且猫明显更高」这三件事。
  assert.ok(dogHr >= 60 && dogHr <= 140, `狗的静息心率中位数 ${dogHr.toFixed(1)} 不在 60–140 bpm 的量级`);
  assert.ok(
    catHr > dogHr * 1.2,
    `同体型下猫的静息心率应明显更高：猫 ${catHr.toFixed(1)} vs 狗 ${dogHr.toFixed(1)}`,
  );
  // 心率变异性同理：基线里狗 70 / 猫 45，方向必须体现在读数上
  assert.ok(
    median(dog.samples.map((x) => x.hrvRmssdMs ?? 0)) > median(catS.samples.map((x) => x.hrvRmssdMs ?? 0)),
    '狗的 HRV 基线应高于同体型猫（仿真参数 70 vs 45）',
  );
});

// ---------------------------------------------------------------- ④ 确定性

test('狗会话同种子严格一致，不同种子不同', () => {
  const a = dogSession({ seed: 7, durationMin: 120 });
  const b = dogSession({ seed: 7, durationMin: 120 });
  assert.equal(JSON.stringify(a), JSON.stringify(b), '同种子应产出字节级一致的会话');
  const c = dogSession({ seed: 8, durationMin: 120 });
  assert.notEqual(JSON.stringify(a.samples), JSON.stringify(c.samples));
  assert.notEqual(
    JSON.stringify(a.dogBehaviorTimeline?.segments),
    JSON.stringify(c.dogBehaviorTimeline?.segments),
  );
});

test('行为层可关闭：关掉之后狗的时间线与行为真值都不存在，采样仍完整', () => {
  const s = dogSession({ durationMin: 60, behavior: { enabled: false } });
  assert.equal(s.dogBehaviorTimeline, undefined);
  assert.equal(s.behaviorTimeline, undefined);
  assert.equal(s.truth?.injectedIncidents, undefined);
  assert.equal(s.samples.length, (60 * 60) / 10);
  assert.equal(s.samples[0]?.activityId, undefined, '关掉行为层后不应有 activityId 通道');
});

// ---------------------------------------------------------------- ⑤ 突发注入

test('注入的狗突发落进 dogBehaviorTimeline.incidents，时长取 DOG_INCIDENT_DEFS', () => {
  const atS = 3600;
  const s = dogSession({ behavior: { injectIncidents: [{ atS, kind: 'seizure' }] } });
  const tl = s.dogBehaviorTimeline;
  assert.ok(tl);

  const hit = tl.incidents.find((i) => i.kind === 'seizure' && i.injected);
  assert.ok(hit, '注入的抽搐必须真的落进狗的时间线（injected === true）');
  assert.equal(hit.injected, true);
  assert.equal(hit.t, atS, '落位应对齐请求时刻');
  assert.equal(hit.durationS, DOG_INCIDENT_DEFS.seizure.durationS, '时长应取 DOG_INCIDENT_DEFS');

  // 时间线求值、区间标记与采样姿势三处必须指向同一次突发
  assert.equal(dogIncidentAt(tl, hit.t + 1)?.kind, 'seizure');
  const seg = dogActivityAt(tl, hit.t + hit.durationS / 2);
  assert.equal(seg.incidentKind, 'seizure');
  assert.equal(seg.posture, DOG_INCIDENT_DEFS.seizure.posture);
  const during = s.samples.filter((x) => x.t >= hit.t && x.t < hit.t + hit.durationS);
  assert.ok(during.length > 0, '突发期间应有采样');
  assert.ok(during.every((x) => x.posture === 'event:seizure'), '突发区间的采样姿势应标为事件');

  // 真值里也记了一条（供「注入 → 还原」这条验证链使用）
  assert.equal(s.truth?.injectedIncidents?.length, 1);
  assert.equal(s.truth?.injectedIncidents?.[0]?.kind, 'seizure');
});

test('呕吐注入同样落位；越界的注入被丢弃', () => {
  const vomit = dogSession({ behavior: { injectIncidents: [{ atS: 1800, kind: 'vomit' }] } });
  const hit = vomit.dogBehaviorTimeline?.incidents.find((i) => i.kind === 'vomit' && i.injected);
  assert.ok(hit);
  assert.equal(hit.durationS, DOG_INCIDENT_DEFS.vomit.durationS);

  const outOfRange = dogSession({ behavior: { injectIncidents: [{ atS: 99 * 3600, kind: 'seizure' }] } });
  assert.deepEqual(outOfRange.truth?.injectedIncidents, []);
});

test('猫的突发名注进狗档案：类型上合法，运行时必须被丢弃', () => {
  // `injectIncidents` 的 `kind` 是猫狗两个种类的联合（调用方两侧都能原样传参），
  // 因此「用猫的名字注进狗档案」在类型层面是**允许**的——正因如此，运行时必须挡住它，
  // 不能让一个狗的行为层不认识的名字混进时间线。
  const s = dogSession({ behavior: { injectIncidents: [{ atS: 3600, kind: 'labored-breathing' }] } });
  assert.deepEqual(s.dogBehaviorTimeline?.incidents, []);
  assert.deepEqual(s.truth?.injectedIncidents, []);
});

// ---------------------------------------------------------------- ⑥ 事件由狗的行为派生

test('狗的事件流由狗的行为派生：每类身体事件都落在对应的活动段内', () => {
  const s = dogSession();
  const tl = s.dogBehaviorTimeline;
  assert.ok(tl);

  /** 事件种类 → 允许出现的活动段。 */
  const ALLOWED: Record<string, readonly string[]> = {
    'posture-change': ['walking', 'eating', 'drinking', 'eliminating', 'sitting'],
    rub: ['trotting', 'sniffing', 'water-play'],
    impact: ['running', 'playing', 'rolling'],
    // 刨地派生抓挠：前肢交替刮擦，与猫的抓挠是同一类颈部动作
    scratch: ['digging'],
    'head-shake': ['alerting'],
  };

  let body = 0;
  for (const ev of s.events) {
    // 发声走的是环境噪声通道（带注入滞后），不由活动段派生
    if (ev.kind === 'vocalization') continue;
    // 突发开始时补记的那条姿势改变带 `note`，它来自突发而不是活动段
    if (ev.note) continue;
    body++;
    const seg = dogActivityAt(tl, ev.t);
    const allowed = ALLOWED[ev.kind];
    assert.ok(
      allowed?.includes(seg.activity),
      `事件 ${ev.kind} 落在「${seg.activity}」段内，与狗的行为对不上`,
    );
  }
  assert.ok(body > 0, '12 小时里应派生出一批身体事件');

  // 两个取值在狗这条路上**刻意不派生**：狗没有砂盆（「砂盆外」没有对应物），
  // 也没有躲藏活动。行为层已把排泄硬约束在院子的排泄角，在那里排泄是正确动作，不是越界。
  assert.equal(s.events.some((e) => e.kind === 'elimination-outside-box'), false);
  assert.equal(s.events.some((e) => e.kind === 'hiding'), false);
});

test('狗在休息/睡眠段不凭空产生身体事件（与猫版同一条纪律）', () => {
  const s = dogSession();
  const tl = s.dogBehaviorTimeline;
  assert.ok(tl);
  for (const ev of s.events) {
    if (ev.kind === 'vocalization' || ev.note) continue;
    const seg = dogActivityAt(tl, ev.t);
    assert.notEqual(seg.activity, 'resting', `休息段不应出现 ${ev.kind} 事件`);
    assert.notEqual(seg.activity, 'sleeping', `睡眠段不应出现 ${ev.kind} 事件`);
  }
});

// ---------------------------------------------------------------- ⑥b 院子里的互动（本轮新增）

/**
 * 本轮新增的四种院子互动 → 各自允许出现的锚点。
 *
 * ⚠️ 这两张名单是**跨包契约的一部分**：core 的目的地规则按能力筛、
 * 这里按 id 复述一遍。加了活动却没让它进采集链路，症状是「时间线里有、采样里没有」
 * ——画面（读时间线）与手机（读采样）会各说一套，因此下面逐条断言采样里真的出现过。
 */
const YARD_INTERACTION_ANCHORS: Readonly<Record<string, readonly string[]>> = {
  'water-play': ['yard-pond', 'outdoor-water'],
  rolling: ['yard-lawn-center', 'yard-lawn-west'],
  digging: ['yard-dig'],
  sunning: ['yard-shade', 'yard-lawn-west', 'deck'],
};

/** 四种互动在**活动量通道**上的折法（仿真参数，与 `dogActivityLevelOf` 一一对应）。 */
const YARD_INTERACTION_LEVEL: Readonly<Record<string, number>> = {
  'water-play': 0.6,
  rolling: 0.65,
  digging: 0.5,
  sunning: 0.02,
};

test('四种院子互动出现在会话采样里，活动量落在 0–1，锚点与契约一致', () => {
  const s = dogSession();

  for (const [id, anchors] of Object.entries(YARD_INTERACTION_ANCHORS)) {
    const rows = s.samples.filter((x) => x.activityId === id);
    assert.ok(rows.length > 0, `12 小时的采样里没有出现「${id}」（活动加在行为层却没进采集链路）`);
    for (const row of rows) {
      // 采样写的必须是**狗的原生活动名**，不是折给读数层的猫键
      assert.equal(row.activityId, id);
      assert.ok(anchors.includes(row.anchorId ?? ''), `${id} 出现在 ${row.anchorId}`);
      assert.ok(
        typeof row.activity === 'number' && row.activity >= 0 && row.activity <= 1,
        `${id} 的活动量 ${row.activity} 越出 0–1`,
      );
      assert.equal(row.activity, YARD_INTERACTION_LEVEL[id], `${id} 的活动量与折法表不符`);
    }
  }

  // 三种短互动属于中高活动量，晒太阳最低——这条次序是「折法」的核心
  const sunLevel = YARD_INTERACTION_LEVEL.sunning ?? 1;
  for (const id of ['water-play', 'rolling', 'digging'] as const) {
    assert.ok(
      (YARD_INTERACTION_LEVEL[id] ?? 0) > sunLevel,
      `${id} 的活动量应高于晒太阳（晒太阳是趴卧不动的日照停留）`,
    );
  }
});

test('新活动的身体事件由狗的行为派生：玩水→摩擦、打滚→碰撞、刨地→抓挠，晒太阳不派生', () => {
  const s = dogSession();
  const tl = s.dogBehaviorTimeline;
  assert.ok(tl);

  /** 活动 → 该活动段内允许出现的事件种类。 */
  const EXPECTED: Readonly<Record<string, readonly string[]>> = {
    'water-play': ['rub'],
    rolling: ['impact'],
    digging: ['scratch'],
  };
  const derived = new Map<string, Set<string>>();
  for (const ev of s.events) {
    if (ev.kind === 'vocalization' || ev.note) continue;
    const seg = dogActivityAt(tl, ev.t);
    if (!(seg.activity in EXPECTED) && seg.activity !== 'sunning') continue;
    const set = derived.get(seg.activity) ?? new Set<string>();
    set.add(ev.kind);
    derived.set(seg.activity, set);
  }

  for (const [activity, kinds] of Object.entries(EXPECTED)) {
    const seen = derived.get(activity);
    assert.ok(seen, `没有从「${activity}」段派生出任何身体事件`);
    for (const kind of seen) {
      assert.ok(
        kinds.includes(kind),
        `「${activity}」段派生出了 ${kind}，不在允许的 ${kinds.join('/')} 里`,
      );
    }
  }

  // 晒太阳在休息，**刻意不派生**：趴着不动时不该凭空出现抓挠或碰撞（与休息/睡眠同一条纪律）
  const sunEvents = s.events.filter((ev) => {
    if (ev.kind === 'vocalization' || ev.note) return false;
    return dogActivityAt(tl, ev.t).activity === 'sunning';
  });
  assert.deepEqual(sunEvents, [], '晒太阳段不应派生身体事件');

  // 两个取值在狗这条路上仍然刻意不出现（沿用上一轮的决定，本轮不放松）
  assert.equal(s.events.some((e) => e.kind === 'elimination-outside-box'), false);
  assert.equal(s.events.some((e) => e.kind === 'hiding'), false);
});

test('新锚点真的被走到：5 个新锚点都在 12 小时里出现过', () => {
  // 加了锚点却没人去 = 白加。这条断言直接数新的那 5 个 id 是否被时间线覆盖。
  const NEW_ANCHORS = ['yard-lawn-center', 'yard-lawn-west', 'yard-lawn-east', 'yard-shade', 'yard-dig'];
  for (const seed of [42, 715]) {
    const tl = dogSession({ seed }).dogBehaviorTimeline;
    assert.ok(tl, `seed=${seed} 缺少狗的时间线`);
    const visited = new Set(tl.segments.map((s) => s.anchorId));
    for (const id of NEW_ANCHORS) {
      assert.ok(visited.has(id), `seed=${seed} 12 小时里没有走到新锚点 ${id}`);
    }
    for (const id of visited) {
      assert.ok(DOG_ANCHOR_IDS.includes(id), `片段落在 core 契约之外的锚点 ${id}`);
    }
  }
});

// ---------------------------------------------------------------- ⑦ 猫那一路的回归

test('猫档案的会话行为不变（回归）：时间线与事件都还在，条数量级不变', () => {
  const s = generateSession({ profile: cat, seed: 42, durationMin: DAY_MIN, scenario: 'living-room-day' });
  const tl = s.behaviorTimeline;
  assert.ok(tl, '猫会话仍应带 behaviorTimeline');
  assert.equal(s.dogBehaviorTimeline, undefined, '猫会话不应产出狗的时间线');
  assert.ok(s.truth?.behavior, '猫的行为真值仍应写在 truth.behavior 里');
  assert.equal(s.truth?.behavior?.seed, tl.seed);
  assert.equal(s.truth?.behavior?.segments.length, tl.segments.length);
  assert.ok(s.events.length > 0, '猫的事件流不应变空');

  // 条数量级：本轮改动前的实测值（720 min / seed 42）是 segments 272、events 704。
  // 这里用**量级带**而不是精确值——精确值会把「猫行为被合法地改动一次」也判成回归失败，
  // 而这条断言要守的是「事件没有凭空消失、也没有成倍膨胀」。
  assert.ok(
    tl.segments.length > 180 && tl.segments.length < 420,
    `猫的行为区间数 ${tl.segments.length} 偏离了原有量级`,
  );
  assert.ok(
    s.events.length > 400 && s.events.length < 1100,
    `猫的事件数 ${s.events.length} 偏离了原有量级`,
  );

  // 猫版特有的派生结果必须还在（抓挠 / 躲藏这两类来自猫的活动名，
  // 一旦有人把派生规则换成狗的，它们会立刻消失）
  const kinds = new Set(s.events.map((e) => e.kind));
  for (const k of ['vocalization', 'posture-change', 'scratch'] as const) {
    assert.ok(kinds.has(k), `猫的事件流丢了 ${k}`);
  }
});

test('猫档案的注入仍然走猫的行为层（seizure 在猫这边同样有效）', () => {
  const s = generateSession({
    profile: cat,
    seed: 42,
    durationMin: DAY_MIN,
    scenario: 'living-room-day',
    behavior: { injectIncidents: [{ atS: 3600, kind: 'seizure' }] },
  });
  const hit = s.behaviorTimeline?.incidents.find((i) => i.kind === 'seizure' && i.injected);
  assert.ok(hit, '猫的注入不应因为类型放宽而失效');
  assert.equal(s.dogBehaviorTimeline, undefined);
});

// ---------------------------------------------------------------- ⑧ 品种表

test('DOG_BREEDS：至少 12 个真实犬种、覆盖多个体重档、含柴犬且体尺在柴犬的量级', () => {
  assert.ok(DOG_BREEDS.length >= 12, `犬种只有 ${DOG_BREEDS.length} 个，少于要求的 12 个`);

  const ids = new Set<string>();
  for (const b of DOG_BREEDS) {
    assert.ok(!ids.has(b.id), `犬种 id 重复：${b.id}`);
    ids.add(b.id);
    assert.ok(b.label.length > 0, `${b.id} 缺少中文名`);
    // 量级合理性：犬只肩高大致 15–90 cm、成年体重 1–90 kg。
    // 这是**范围检查**，不是对某个品种的规定值（品种数据来源与等级见 profile.ts 的注释）。
    assert.ok(b.heightCm >= 15 && b.heightCm <= 90, `${b.id} 的肩高 ${b.heightCm} 不在犬只的量级内`);
    assert.ok(b.weightKg >= 1 && b.weightKg <= 90, `${b.id} 的体重 ${b.weightKg} 不在犬只的量级内`);
    assert.equal(b.evidence.tier, 'weak', `${b.id} 缺少证据标签（必须显式标为 weak）`);
    assert.ok((b.evidence.source ?? '').length > 0);
  }

  // 本场景的主角：柴犬（肩高约 40 cm、体重约 10 kg）
  const shibaBreed = DOG_BREEDS.find((b) => b.id === 'shiba');
  assert.ok(shibaBreed, '犬种表必须包含柴犬（id: shiba）');
  assert.ok(Math.abs(shibaBreed.heightCm - 40) <= 3, `柴犬肩高 ${shibaBreed.heightCm} 偏离约 40 cm`);
  assert.ok(Math.abs(shibaBreed.weightKg - 10) <= 2, `柴犬体重 ${shibaBreed.weightKg} 偏离约 10 kg`);

  // 体重必须铺开到多个档位：档位同时喂给体型因子与项圈工程预算，
  // 全都落在同一档，「换品种 → 基线跟着变」在仿真里就等于没发生。
  const classes = new Set(DOG_BREEDS.map((b) => sizeClassOf('dog', b.weightKg)));
  assert.ok(classes.size >= 4, `犬种体重只覆盖 ${classes.size} 个档位：${[...classes].join('、')}`);
  assert.ok(classes.has('toy') && classes.has('giant'), '应同时覆盖最小档与最大档');

  // 追加而不是替换：猫的品种表不受影响
  assert.ok(CAT_BREEDS.length >= 12);
  assert.equal(CAT_BREEDS.some((b) => b.id === 'shiba'), false);
});
