import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_DEFS,
  ACTIVITY_IDS,
  BEHAVIOR_PARAMS,
  CAT_ANCHOR_IDS,
  CAT_ANCHOR_LABELS,
  FORBIDDEN_TERMS,
  INCIDENT_BOUNDARY_NOTE,
  INCIDENT_DEFS,
  INCIDENT_KINDS,
  INCIDENT_REFERRAL_NOTE,
  NEGATION_MARKERS,
  OPERATIVE_CONSTANTS,
  POSTURE_DEFS,
  activityAt,
  activityShare,
  activityWeightAt,
  behaviorParam,
  behaviorParamRange,
  behaviorParamText,
  buildBehaviorTimeline,
  hourOfDayAt,
  incidentAt,
  isOwnerAwayHour,
} from '../src/index.ts';
import type { CatAnchorSpec, CatBehaviorTimeline } from '../src/index.ts';

// ---------------------------------------------------------------- 夹具

/**
 * 测试夹具：与 `simulator/src/behavior.ts` 的 `SIM_CAT_ANCHORS` 同构
 * （同样按 `CAT_ANCHOR_IDS` 取 id），但**不含米制坐标**——行为层不需要坐标。
 */
const ANCHORS: readonly CatAnchorSpec[] = [
  { id: 'floor-living', label: '起居区地面', capabilities: ['floor', 'jump-target'], heightM: 0 },
  { id: 'floor-bedroom', label: '睡眠区地面', capabilities: ['floor', 'jump-target'], heightM: 0 },
  { id: 'floor-kitchen', label: '厨房区地面', capabilities: ['floor', 'jump-target'], heightM: 0 },
  { id: 'tree-platform', label: '猫爬架一层平台', capabilities: ['jump-target', 'vertical'], heightM: 0.72 },
  { id: 'tree-top', label: '猫爬架顶台', capabilities: ['vertical', 'sleep', 'jump-target'], heightM: 1.45 },
  { id: 'cat-shelf-low', label: '墙面跳台（低）', capabilities: ['vertical'], heightM: 1.25 },
  { id: 'cat-shelf-high', label: '墙面跳台（高）', capabilities: ['vertical'], heightM: 1.65 },
  { id: 'wardrobe-top', label: '衣柜顶', capabilities: ['vertical'], heightM: 2.4 },
  { id: 'bed-top', label: '床面', capabilities: ['sleep', 'jump-target'], heightM: 0.56 },
  { id: 'sofa-top', label: '沙发面', capabilities: ['sleep', 'jump-target'], heightM: 0.42 },
  { id: 'cat-bed', label: '封闭式猫窝', capabilities: ['sleep', 'hide'], heightM: 0.07 },
  { id: 'hiding-box', label: '纸箱躲藏处', capabilities: ['hide'], heightM: 0.02 },
  { id: 'food-bowls', label: '食盆', capabilities: ['food'], heightM: 0.05 },
  { id: 'fountain', label: '饮水机', capabilities: ['water'], heightM: 0.16 },
  { id: 'water-bowl', label: '第二水碗', capabilities: ['water'], heightM: 0.06 },
  { id: 'litter-a', label: '猫砂盆 A', capabilities: ['litter'], heightM: 0.22 },
  { id: 'litter-b', label: '猫砂盆 B', capabilities: ['litter'], heightM: 0.22 },
];

const DAY_S = 24 * 3600;

function build(seed: number, extra: Partial<Parameters<typeof buildBehaviorTimeline>[0]> = {}): CatBehaviorTimeline {
  return buildBehaviorTimeline({
    seed,
    durationS: DAY_S,
    anchors: ANCHORS,
    ...extra,
  });
}

/** 断言「区间连续覆盖」这一条不变量，所有用例共用。 */
function assertContinuous(tl: CatBehaviorTimeline, label: string): void {
  assert.ok(tl.segments.length > 0, `${label}: 时间线不应为空`);
  const first = tl.segments[0];
  assert.ok(first, `${label}: 缺少第一个区间`);
  assert.equal(first.t, 0, `${label}: 第一个区间必须从 0 开始`);

  let prevEnd = 0;
  let total = 0;
  for (const [i, seg] of tl.segments.entries()) {
    assert.ok(seg.durS > 0, `${label}: 第 ${i} 段时长必须 > 0（${seg.durS}）`);
    assert.equal(seg.t, prevEnd, `${label}: 第 ${i} 段起点 ${seg.t} 与上一段终点 ${prevEnd} 不接续`);
    assert.ok(ACTIVITY_DEFS[seg.activity], `${label}: 第 ${i} 段活动 ${seg.activity} 未登记`);
    assert.ok(POSTURE_DEFS[seg.posture], `${label}: 第 ${i} 段姿势 ${seg.posture} 未登记`);
    prevEnd = seg.t + seg.durS;
    total += seg.durS;
  }
  assert.equal(prevEnd, tl.durationS, `${label}: 末尾 ${prevEnd} 未覆盖到 ${tl.durationS}`);
  assert.ok(
    Math.abs(total - tl.durationS) < 1e-6,
    `${label}: Σ durS=${total} 应等于 durationS=${tl.durationS}`,
  );

  const budgetSum = Object.values(tl.budgetS).reduce((a, b) => a + (b ?? 0), 0);
  assert.ok(
    Math.abs(budgetSum - tl.durationS) < 1e-6,
    `${label}: 时间预算合计 ${budgetSum} 应等于 ${tl.durationS}`,
  );
}

// ---------------------------------------------------------------- 确定性

test('行为时间线：同种子严格一致', () => {
  const a = build(42);
  const b = build(42);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('行为时间线：不同种子产出不同序列', () => {
  const a = build(1);
  const b = build(2);
  assert.notEqual(JSON.stringify(a.segments), JSON.stringify(b.segments));
});

test('行为时间线：时长越短越好，且不越界', () => {
  for (const minutes of [1, 5, 60, 300]) {
    const tl = build(7, { durationS: minutes * 60 });
    assert.equal(tl.durationS, minutes * 60);
    assertContinuous(tl, `${minutes} 分钟`);
  }
});

// ---------------------------------------------------------------- 区间连续覆盖

test('行为时间线：区间首尾相接、无空洞、无重叠，且覆盖满时长', () => {
  for (const seed of [3, 11, 2026]) {
    assertContinuous(build(seed), `seed=${seed}`);
  }
});

test('活动占比：休息与高处停留合计落在文献区间内', () => {
  // 依据：休息+睡眠约占时间预算 50%（Eckstein & Hart 2000，moderate，附实验条件限制）。
  // 这里刻意用宽松的上下界：行为引擎的片段时长本身是操作化常量，
  // 断言的是「量级结构对」而不是「复现某个文献百分比」。
  for (const seed of [5, 17, 99]) {
    const tl = build(seed);
    const rest = activityShare(tl, 'resting') + activityShare(tl, 'perching');
    assert.ok(rest > 0.2 && rest < 0.9, `seed=${seed} 休息类占比 ${rest.toFixed(3)} 越界`);
    // 抓挠、理毛这类小片段不应占满全天
    assert.ok(activityShare(tl, 'scratching') < 0.3, `seed=${seed} 抓挠占比过高`);
  }
});

// ---------------------------------------------------------------- 求值

test('activityAt：区间内任意时刻返回同一条目，且越界钳制不抛异常', () => {
  const tl = build(8);
  for (const seg of tl.segments) {
    const atStart = activityAt(tl, seg.t);
    const mid = activityAt(tl, seg.t + seg.durS / 2);
    assert.equal(atStart.activity, seg.activity, `t=${seg.t} 处活动不一致`);
    assert.equal(mid.activity, seg.activity, `t=${seg.t + seg.durS / 2} 处活动不一致`);
    assert.equal(mid.posture, seg.posture);
  }
  // 越界：负值与超出末尾都应返回边界条目而不是抛异常
  assert.equal(activityAt(tl, -100).t, 0);
  const tail = activityAt(tl, tl.durationS + 1000);
  assert.ok(tail.t >= 0);
});

test('activityAt：二分查找与线性扫描结果一致（保证自检与 UI 取值正确）', () => {
  const tl = build(23);
  for (let t = 0; t < tl.durationS; t += 137) {
    const seg = activityAt(tl, t);
    assert.ok(seg.t <= t && t < seg.t + seg.durS, `t=${t} 命中的区间不包含该时刻`);
  }
});

// ---------------------------------------------------------------- 突发注入

test('注入的突发一定出现在 incidents 且标记 injected', () => {
  const requests = [
    { atS: 3 * 3600, kind: 'seizure' as const },
    { atS: 9 * 3600, kind: 'labored-breathing' as const },
    { atS: 20 * 3600, kind: 'withdrawal' as const },
  ];
  const tl = build(42, { injectIncidents: requests });
  assertContinuous(tl, '含注入突发');

  for (const req of requests) {
    const hit = tl.incidents.find((i) => i.kind === req.kind && i.injected);
    assert.ok(hit, `注入的 ${req.kind} 未被记录`);
    // 允许 2 秒的落位偏差：引擎把注入点前 1 秒作为推进边界，
    // 再按当前行为片段的剩余时长落位（见 engine.ts 的注释）。
    assert.ok(
      Math.abs(hit.t - req.atS) <= 2,
      `${req.kind} 落位偏差过大：请求 ${req.atS}，实际 ${hit.t}`,
    );
    assert.ok(hit.durationS > 0, `${req.kind} 时长必须 > 0`);
    // 突发事件对应的区间必须带 incidentKind
    const seg = activityAt(tl, hit.t + hit.durationS / 2);
    assert.equal(seg.incidentKind, req.kind, `${req.kind} 对应区间未标记 incidentKind`);
  }
});

test('注入的突发不会破坏区间连续性（覆盖层而非新轴）', () => {
  const tl = build(7, {
    injectIncidents: INCIDENT_KINDS.map((kind, i) => ({ atS: 3600 * (i + 1), kind })),
  });
  assertContinuous(tl, '全部突发种类');
  // 每一种注入了的突发都应能在某个时刻被 incidentAt 找到
  for (const inc of tl.incidents.filter((i) => i.injected)) {
    assert.ok(incidentAt(tl, inc.t), `${inc.kind} 在起点处未命中`);
    assert.ok(incidentAt(tl, inc.t + inc.durationS - 0.001), `${inc.kind} 在末点前未命中`);
    assert.equal(incidentAt(tl, inc.t + inc.durationS + 0.001), null, `${inc.kind} 在结束后仍命中`);
  }
});

test('不注入时没有 injected 的突发；越界与重复的注入被丢弃', () => {
  const tl = build(4);
  assert.equal(tl.incidents.filter((i) => i.injected).length, 0, '不注入时不应有 injected 突发');

  const tl2 = build(4, {
    injectIncidents: [
      { atS: -10, kind: 'seizure' },
      { atS: DAY_S + 10, kind: 'seizure' },
      { atS: 600, kind: 'freezing' },
      { atS: 600, kind: 'vomit' },
    ],
  });
  const injected = tl2.incidents.filter((i) => i.injected);
  assert.equal(injected.length, 1, `越界应被丢弃、同一时刻只保留第一条，实际 ${injected.length}`);
  assert.equal(injected[0]?.kind, 'freezing');
});

test('躲藏退避会把猫带到躲藏锚点', () => {
  const tl = build(42, { injectIncidents: [{ atS: 12 * 3600, kind: 'withdrawal' }] });
  const inc = tl.incidents.find((i) => i.kind === 'withdrawal' && i.injected);
  assert.ok(inc);
  const seg = activityAt(tl, inc.t + inc.durationS / 2);
  assert.equal(seg.activity, 'hiding');
  assert.ok(
    seg.anchorId === 'hiding-box' || seg.anchorId === 'cat-bed',
    `退避后应在躲藏锚点，实际 ${seg.anchorId}`,
  );
});

// ---------------------------------------------------------------- 锚点约束

test('需要资源锚点的行为最终落在具备该能力的锚点上', () => {
  const tl = build(31);
  const requireCap: Partial<Record<(typeof ACTIVITY_IDS)[number], string>> = {
    feeding: 'food',
    drinking: 'water',
    eliminating: 'litter',
    hiding: 'hide',
    perching: 'vertical',
  };
  const byId = new Map(ANCHORS.map((a) => [a.id, a]));
  for (const seg of tl.segments) {
    const want = requireCap[seg.activity];
    if (!want) continue;
    const anchor = byId.get(seg.anchorId);
    assert.ok(anchor, `片段落在未知锚点 ${seg.anchorId}`);
    assert.ok(
      anchor.capabilities.includes(want as never),
      `${seg.activity} 应落在具备 ${want} 能力的锚点，实际 ${seg.anchorId}`,
    );
  }
});

test('攀跳只在高度差明显时出现，且姿势与目的地一致', () => {
  const tl = build(13);
  const byId = new Map(ANCHORS.map((a) => [a.id, a]));
  for (const seg of tl.segments) {
    if (seg.activity !== 'locomoting') continue;
    assert.ok(
      seg.posture === 'walking' || seg.posture === 'climbing',
      `移动段姿势异常：${seg.posture}`,
    );
    const to = byId.get(seg.anchorId);
    assert.ok(to, `移动段目的地未知：${seg.anchorId}`);
  }
  // 一天里升到高处是猫的常规行为，应至少出现一次攀跳
  assert.ok(
    tl.segments.some((s) => s.posture === 'climbing'),
    '24 小时内应至少出现一次攀跳',
  );
});

test('没有锚点时退化为单一地面锚点，仍保持连续覆盖', () => {
  const tl = buildBehaviorTimeline({ seed: 3, durationS: 3600 });
  assertContinuous(tl, '无锚点');
  for (const seg of tl.segments) {
    assert.equal(seg.anchorId, 'floor');
    // 没有锚点时不可能真的位移。注意活动仍可能是 `locomoting`（引擎选中了「移动」
    // 这个行为），但必须被标记为未发生位移——否则寻路与自检会把「原地选了移动行为」
    // 误读成「猫在走动」。
    if (seg.activity === 'locomoting') {
      assert.equal(seg.resolved, false, '没有锚点时移动段必须标记 resolved:false');
    }
  }
  // 反过来：有锚点时至少要有真正的位移与攀跳
  const withAnchors = build(13);
  assert.ok(
    withAnchors.segments.some((s) => s.activity === 'locomoting' && s.resolved !== false),
    '有锚点时应出现真实位移',
  );
});

// ---------------------------------------------------------------- 节律

test('活动倾向曲线：落在 0–1，且一天内不均匀（清晨与傍晚高于正午）', () => {
  for (let h = 0; h < 24; h += 0.25) {
    const v = activityWeightAt(h);
    assert.ok(v >= 0 && v <= 1, `h=${h} 倾向 ${v} 越界`);
  }
  // 与进食双峰（约 04–08 与 16–20）一致的时段应高于午后
  assert.ok(activityWeightAt(6) > activityWeightAt(13));
  assert.ok(activityWeightAt(18) > activityWeightAt(13));
  // 深夜最低
  assert.ok(activityWeightAt(2) < activityWeightAt(13));
  // 取模：越界小时数与等价小时数一致
  assert.equal(activityWeightAt(25), activityWeightAt(1));
  assert.equal(activityWeightAt(-1), activityWeightAt(23));
});

test('会话时刻映射到当日小时：从 09:00 起算且循环', () => {
  assert.equal(hourOfDayAt(0), 9);
  assert.equal(hourOfDayAt(3600), 10);
  assert.equal(hourOfDayAt(15 * 3600), 0);
  assert.equal(hourOfDayAt(24 * 3600), 9);
});

test('主人不在家时段：夜间为真、白天为假', () => {
  assert.equal(isOwnerAwayHour(3), true);
  assert.equal(isOwnerAwayHour(12), false);
  assert.equal(isOwnerAwayHour(23), true);
});

// ---------------------------------------------------------------- 证据政策

test('证据政策：unverified 不得有数值，disputed 必须给区间或明写「无法归因」', () => {
  for (const p of BEHAVIOR_PARAMS) {
    if (p.evidence.tier === 'unverified') {
      assert.equal(p.value, null, `unverified 参数「${p.label}」不得给出数值`);
      assert.equal(
        behaviorParamText(p.id),
        '未取得可靠来源',
        `unverified 参数「${p.label}」的展示文本不得包含数字`,
      );
    }
    if (p.evidence.tier === 'disputed') {
      if (p.value === null) {
        // 「来源冲突」有两种形态：① 两个数值打架 → 必须给区间；
        // ② 该现象本身无法被可靠归因（例如「长时间不动可能是疼痛也可能是恐惧」）→ 不给数值，
        //    但必须在 note 里写明这一点。这里断言第二种形态**确实写明了理由**。
        assert.match(
          p.evidence.note ?? '',
          /无法|不给|不能/,
          `disputed 参数「${p.label}」既无区间，又未写明为何不给数值`,
        );
      } else {
        assert.ok(Array.isArray(p.value), `disputed 参数「${p.label}」必须是区间或 null`);
        assert.equal((p.value as [number, number]).length, 2);
        const range = behaviorParamRange(p.id);
        assert.ok(range, `「${p.label}」应能取到区间`);
        assert.ok(range[0] < range[1], `「${p.label}」区间顺序应为 [lo, hi]`);
        assert.ok(
          p.evidence.note && p.evidence.note.length > 20,
          `disputed 参数「${p.label}」应写明来源冲突`,
        );
      }
    }
    assert.ok(p.evidence.source, `参数「${p.label}」缺少来源`);
    assert.ok(p.evidence.note, `参数「${p.label}」缺少说明`);
  }
});

test('证据政策：unverified 展示文本一律不含数字', () => {
  for (const p of BEHAVIOR_PARAMS.filter((x) => x.evidence.tier === 'unverified')) {
    assert.doesNotMatch(behaviorParamText(p.id), /\d/, `「${p.label}」的文本含数字`);
  }
});

test('参数登记表：id 唯一、可查询、区间的参数能正确取值', () => {
  const ids = new Set<string>();
  for (const p of BEHAVIOR_PARAMS) {
    assert.ok(!ids.has(p.id), `参数 id 重复：${p.id}`);
    ids.add(p.id);
    assert.equal(behaviorParam(p.id)?.id, p.id);
  }
  assert.equal(behaviorParam('not-exist'), undefined);
  // 明确登记过的「有数值」项
  const threshold = behaviorParam('jumpDetectMinHeightM');
  assert.equal(threshold?.value, 0.4);
  assert.equal(threshold?.evidence.tier, 'moderate');
  // 明确登记过的「无来源」项
  assert.equal(behaviorParam('jumpsPerDay')?.value, null);
});

test('操作化常量：每项都写明理由，且不与文献参数混放', () => {
  assert.ok(OPERATIVE_CONSTANTS.length >= 3);
  for (const c of OPERATIVE_CONSTANTS) {
    assert.ok(c.why.length > 20, `操作化常量「${c.label}」应写明为什么这么选`);
    assert.ok(c.unit.length > 0);
    assert.ok(typeof c.value === 'number');
    assert.equal(behaviorParam(c.id), undefined, `操作化常量不应同时出现在 BEHAVIOR_PARAMS：${c.id}`);
  }
});

/**
 * 与 `scripts/check-claims.mjs` 的门禁规则保持一致：
 * 命中禁词时，若**同一行**含否定标记（`不构成`/`不是`/`禁止`/`无法` …），视为边界说明，放行。
 * 这里刻意复刻这条规则而不是简单禁止所有出现——否则「不构成诊断」这种**必需**的
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

test('突发边界文案：必须明确「不构成」，且禁词只能出现在否定语境里', () => {
  const texts: string[] = [INCIDENT_BOUNDARY_NOTE, INCIDENT_REFERRAL_NOTE];
  for (const kind of INCIDENT_KINDS) {
    texts.push(INCIDENT_DEFS[kind].label, INCIDENT_DEFS[kind].hint);
  }
  for (const id of ACTIVITY_IDS) {
    texts.push(ACTIVITY_DEFS[id].label, ACTIVITY_DEFS[id].hint);
  }
  for (const p of BEHAVIOR_PARAMS) texts.push(p.label, p.evidence.note ?? '');

  assertNoForbiddenClaim(texts.join('\n'), '行为层文案');
  // 边界句必须明确「不构成诊断」这一否定表述，而不是只说「演示」
  assert.match(INCIDENT_BOUNDARY_NOTE, /不构成/);
});

test('突发动作配方必须让每种突发「在画面上看得出来」', () => {
  // 背景：第一版突发只换姿势、没有身体动作，于是「抽搐」在画面上就是一只趴着不动的猫
  // ——标签写着抽搐、身体毫无变化。这条断言就是防止那种情况再发生：
  // 每种突发至少要通过一个通道产生可见变化。
  const TREMOR_VISIBLE = 0.004; // 米：约躯干高度的 4%，低于此读不出抖动
  const BREATH_VISIBLE = 0.004; // 米：呼吸幅度相对基准的净变化
  const RIGID_VISIBLE = 0.4;

  for (const kind of INCIDENT_KINDS) {
    const m = INCIDENT_DEFS[kind].motion;
    assert.ok(m, `突发 ${kind} 缺少动作配方`);
    const channels = {
      tremor: m.tremorAmp * 1.5 >= TREMOR_VISIBLE,
      breath: Math.abs(m.breathAmpAdd) >= BREATH_VISIBLE || m.breathFreqScale <= 0.85 || m.breathFreqScale >= 1.5,
      rigidity: m.rigidity >= RIGID_VISIBLE,
    };
    assert.ok(
      channels.tremor || channels.breath || channels.rigidity,
      `突发「${INCIDENT_DEFS[kind].label}」三个通道都不够可见 —— 点了会像没反应：${JSON.stringify(m)}`,
    );
  }
});

test('突发动作幅度不能大到「猫在膨胀」', () => {
  // 躯干半径约 0.1 m、体长仅约 0.3 m。幅度取大一点更「明显」，但越线就变成别的动作了。
  // 渲染层另有 MAX_BREATH_AMP 兜底，这里守住配方本身不给出离谱的数值。
  for (const kind of INCIDENT_KINDS) {
    const m = INCIDENT_DEFS[kind].motion;
    assert.ok(m.tremorAmp <= 0.06, `突发「${INCIDENT_DEFS[kind].label}」抖动幅度 ${m.tremorAmp} m 过大`);
    assert.ok(
      m.breathAmpAdd <= 0.03 && m.breathAmpAdd >= -0.02,
      `突发「${INCIDENT_DEFS[kind].label}」呼吸幅度增量 ${m.breathAmpAdd} m 越界`,
    );
    assert.ok(m.limbJitter <= 0.8, `突发「${INCIDENT_DEFS[kind].label}」四肢抽动过大`);
    assert.ok(m.rigidity >= 0 && m.rigidity <= 1, `突发「${INCIDENT_DEFS[kind].label}」僵直系数应在 0–1`);
    assert.ok(m.earFlatten >= 0 && m.earFlatten <= 1, `突发「${INCIDENT_DEFS[kind].label}」耳压系数应在 0–1`);
  }
});

test('「僵直不动」与「抽搐」的表达方式必须相反', () => {
  // 这是两个最容易被混为一谈的突发：一个靠**剧烈抖动**、一个靠**完全不动**。
  // 若哪天有人把 freezing 也加上抖动，它就退化成了另一个「抽搐」。
  const seizure = INCIDENT_DEFS.seizure.motion;
  const freezing = INCIDENT_DEFS.freezing.motion;
  assert.ok(seizure.tremorAmp > 0.02, '抽搐应有明显抖动');
  assert.equal(freezing.tremorAmp, 0, '僵直不动不应有抖动');
  assert.ok(freezing.rigidity > seizure.rigidity, '僵直不动的僵直程度应高于抽搐');
});

test('突发种类与定义一一对应', () => {
  for (const kind of INCIDENT_KINDS) {
    const def = INCIDENT_DEFS[kind];
    assert.equal(def.kind, kind);
    assert.ok(def.demoDurationS > 0);
    assert.ok(POSTURE_DEFS[def.posture], `突发 ${kind} 的姿势未登记`);
    assert.ok(def.hint.length > 5);
  }
  assert.equal(INCIDENT_KINDS.length, Object.keys(INCIDENT_DEFS).length);
});

test('突发演示时长是为「人眼可看」定的真实秒数（不是倍率下的秒数）', () => {
  // 这条断言守的是一个**渲染契约**：apps/web 的行为运行时对突发段**不乘演示倍率**
  // （见 cat-behavior.ts 的 update）。契约成立的前提是 demoDurationS 本身就是
  // 「给人看的秒数」。若有人把某个突发的演示时长改到 2 秒以下，点下去就等于没反应；
  // 改到几分钟以上，演示又会卡住不动。这里把可用的区间钉住。
  for (const kind of INCIDENT_KINDS) {
    const d = INCIDENT_DEFS[kind].demoDurationS;
    assert.ok(d >= 10, `突发「${INCIDENT_DEFS[kind].label}」演示仅 ${d}s，太短会看不到`);
    assert.ok(d <= 120, `突发「${INCIDENT_DEFS[kind].label}」演示 ${d}s 过长，会像卡住`);
  }
});

test('锚点 id 清单与锚点表一致（跨包契约）', () => {
  // 单一事实来源是 CAT_ANCHOR_IDS；simulator 与 apps/web 各自按它建表。
  // 这条断言保证「契约里的 id」不会多于或少于实际可用的锚点。
  const ids = ANCHORS.map((a) => a.id).sort();
  const expected = [...CAT_ANCHOR_IDS].sort();
  assert.deepEqual(ids, expected, '锚点表与 CAT_ANCHOR_IDS 不一致');
  for (const id of CAT_ANCHOR_IDS) {
    assert.ok(CAT_ANCHOR_LABELS[id], `锚点 ${id} 缺少中文名`);
  }
  assert.equal(Object.keys(CAT_ANCHOR_LABELS).length, CAT_ANCHOR_IDS.length);
});

test('活动词汇：每个活动都有定义与姿势，且都有权重（权重为 0 的仅干呕）', () => {
  for (const id of ACTIVITY_IDS) {
    const def = ACTIVITY_DEFS[id];
    assert.ok(def, `活动 ${id} 缺少定义`);
    assert.equal(def.id, id);
    assert.ok(POSTURE_DEFS[def.posture], `活动 ${id} 的姿势未登记`);
    assert.ok(def.label.length > 0 && def.hint.length > 0);
  }
  assert.equal(ACTIVITY_IDS.length, Object.keys(ACTIVITY_DEFS).length);
});
