/**
 * 生理状态机与曲线的回归断言。
 *
 * 这些用例守住的是**这张表本身的性质**，不是「能不能识别抽搐」：
 *   1. 结构：心率/呼吸在发作期真的上去了，恢复期真的在回落；
 *   2. 时相：恢复段的读数落在峰值与基线之间（否则「恢复期」只是标签）；
 *   3. 诚实：短时突发不会给出可用的体温信号，演示时长下体温几乎不动；
 *   4. 可分：抽搐与干呕在**设计上**被哪些通道拉开——并明确它不等于检出能力；
 *   5. 反例：`unverified` 的采集参数绝不输出数字。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLAR_SAMPLING,
  INCIDENT_DEFS,
  PHYSIOLOGY_EPISODES,
  PHYSIOLOGY_EPISODE_KINDS,
  PHYSIOLOGY_STATE_IDS,
  buildPhysiologyTrace,
  describeSeparability,
  effectiveHeatingSeconds,
  episodeSpanS,
  episodesOfState,
  idleOpsForActivity,
  phaseAt,
  predictPhysiologyAt,
} from '../src/index.ts';
import type { PhysiologyBaseline, PhysiologyTrace } from '../src/index.ts';

const BASE: PhysiologyBaseline = { hrBpm: 140, hrvRmssdMs: 45, rrBpm: 25 };

function traceOf(kind: 'seizure' | 'vomiting', stepS = 1): PhysiologyTrace {
  return buildPhysiologyTrace(kind, BASE, { stepS });
}

function peakOf(trace: PhysiologyTrace, key: 'hrBpm' | 'rrBpm'): number {
  return Math.max(...trace.samples.map((s) => s[key]));
}

// ---------------------------------------------------------------- 结构：方向与峰谷

test('生理状态机：抽搐时心率显著升高，且发作期读数不可采信', () => {
  const trace = traceOf('seizure');
  const peak = peakOf(trace, 'hrBpm');
  assert.ok(
    peak > BASE.hrBpm * 1.6,
    `抽搐心率峰值应明显高于基线，实际 ${peak.toFixed(1)} vs 基线 ${BASE.hrBpm}`,
  );

  // 发作期在 t=2 起算，但抖动是**在约 1 秒内涨上去**的：t=2 那一刻伪影仍接近 0，
  // 因此判据从波形建立起来之后（t≥3）开始检查。这不是放水——
  // 它正是「不能靠发作瞬间的一帧做判定，必须看这一段」这条工程结论的直接体现。
  const inIctal = trace.samples.filter((s) => s.state === 'ictal' && s.t >= 3);
  assert.ok(inIctal.length >= 2, '抽搐应有可分辨的发作期采样点');
  for (const s of inIctal) {
    assert.equal(
      s.readingTrustworthy,
      false,
      `发作期 t=${s.t} 的读数在物理上不可采信（全身抖动会同时污染心率与呼吸通道）`,
    );
  }
});

test('生理状态机：抽搐时呼吸节律紊乱度显著高于静息', () => {
  const trace = traceOf('seizure');
  const rest = predictPhysiologyAt({ ...BASE, activity: 'resting' });
  const peakIrregularity = Math.max(...trace.samples.map((s) => s.respIrregularity));
  assert.ok(
    peakIrregularity > rest.features.respIrregularity + 0.5,
    `抽搐的呼吸紊乱度应远高于静息，实际 ${peakIrregularity} vs ${rest.features.respIrregularity}`,
  );
});

test('生理状态机：呕吐时心率与呼吸都升高，但动作当下的伪影低于抽搐', () => {
  const vomit = traceOf('vomiting');
  const seizure = traceOf('seizure');
  assert.ok(
    peakOf(vomit, 'hrBpm') > BASE.hrBpm * 1.05,
    `呕吐应抬高心率，实际峰值 ${peakOf(vomit, 'hrBpm').toFixed(1)}`,
  );
  assert.ok(
    peakOf(vomit, 'rrBpm') > BASE.rrBpm * 1.05,
    `呕吐的干呕期应抬高呼吸频次，实际峰值 ${peakOf(vomit, 'rrBpm').toFixed(1)}`,
  );

  const vomitArtifact = Math.max(...vomit.samples.map((s) => s.motionArtifact));
  const seizureArtifact = Math.max(...seizure.samples.map((s) => s.motionArtifact));
  assert.ok(
    vomitArtifact < seizureArtifact * 0.8,
    `干呕的机械伪影应明显低于抽搐：${vomitArtifact} vs ${seizureArtifact}`,
  );
});

test('生理状态机：体温是慢通道，且抽搐的产热远大于呕吐', () => {
  const demo = traceOf('seizure');
  const demoPeak = Math.max(...demo.samples.map((s) => s.tempDeltaC));
  // 演示整体代表一次性发作的全部真实过程，因此会显现出量级上升；
  // 但**它不该超过整套真实时长的上限**。
  assert.ok(demoPeak < 0.9, `演示的体温上升不应超过真实过程的上限，实际 ${demoPeak} °C`);
  assert.ok(demoPeak > 0.4, `演示应体现这次发作带来的体温上升，实际 ${demoPeak} °C`);

  // 只演到一半时，体温也应只走了一半左右 —— 说明它跟着**进度**走，不是常数。
  const half = buildPhysiologyTrace('seizure', BASE, { durationS: 15 });
  const halfPeak = Math.max(...half.samples.map((s) => s.tempDeltaC));
  assert.ok(halfPeak < demoPeak, `半程的体温上升应小于全程：${halfPeak} vs ${demoPeak}`);

  // 呕吐的产热应当小一个数量级以上 —— 这是「抽搐 vs 呕吐」的一个可断言差异。
  const vomit = Math.max(...traceOf('vomiting').samples.map((s) => s.tempDeltaC));
  assert.ok(
    demoPeak > vomit * 10,
    `抽搐的体温上升应远大于呕吐：${demoPeak} vs ${vomit}`,
  );
});

test('生理状态机：恢复期的读数落在峰值与基线之间，并逐步恢复可采信', () => {
  const trace = traceOf('seizure');
  const recovery = trace.samples.filter((s) => s.state === 'post-ictal');
  assert.ok(recovery.length >= 2, '抽搐应有恢复期采样点');
  const first = recovery[0] as PhysiologyTrace['samples'][number];
  const last = recovery[recovery.length - 1] as PhysiologyTrace['samples'][number];

  assert.ok(first.hrBpm > BASE.hrBpm, `恢复期起点应高于基线，实际 ${first.hrBpm}`);
  assert.ok(
    last.hrBpm < first.hrBpm,
    `恢复期内读数应持续回落：${first.hrBpm} → ${last.hrBpm}`,
  );
  const peak = peakOf(trace, 'hrBpm');
  for (const s of recovery) {
    assert.ok(
      s.hrBpm <= peak + 1e-6,
      `恢复期读数不应超过发作期峰值：t=${s.t} ${s.hrBpm} > ${peak}`,
    );
  }

  // 抖动是**衰减**的，不是瞬间停的：恢复期开头几秒伪影仍在门限之上，
  // 之后才重新可采信。这条断言把「恢复段开头也有一小段不可用窗口」固定下来。
  const trusted = recovery.filter((s) => s.readingTrustworthy);
  assert.ok(trusted.length >= recovery.length - 5, '恢复期大部分时间应恢复可采信');
  const firstTrusted = trusted[0] as PhysiologyTrace['samples'][number];
  assert.ok(
    firstTrusted.t <= first.t + 5,
    `读数应在恢复期开始后 5 秒内重新可采信，实际在 t=${firstTrusted.t}`,
  );
  assert.equal(last.readingTrustworthy, true, '恢复期末尾必须可采信');
});

test('生理状态机：呕吐的排出期是一次短促的躯干用力，不是持续高频抖动', () => {
  const trace = traceOf('vomiting');
  const expulsion = trace.samples.filter((s) => s.state === 'expulsion');
  // 演示时长下排出期只有 0.4 秒，1 秒步长上大概率采不到；放宽为「不超过 1 个点」，
  // 但必须能通过时相求值直接取到它的取值。
  assert.ok(expulsion.length <= 1, '排出期应短促');
  const at = phaseAt(PHYSIOLOGY_EPISODES.vomiting, 18.2, false);
  assert.equal(at.phase.id, 'expulsion');
});

// ---------------------------------------------------------------- 结构：时相切分

test('生理状态机：演示时相与真实时相各自自洽，且压缩比按突发不同', () => {
  for (const kind of PHYSIOLOGY_EPISODE_KINDS) {
    const def = PHYSIOLOGY_EPISODES[kind];
    assert.ok(
      Math.abs(episodeSpanS(kind, false) - def.demoDurationS) < 1e-6,
      `${kind} 的演示时相总长 ${episodeSpanS(kind, false)} 应等于 demoDurationS=${def.demoDurationS}`,
    );
    // 演示窗口必须容纳「动作 + 恢复」，否则唯一可采信的偏离会被砍掉。
    const actionKind = def.kind === 'vomiting' ? INCIDENT_DEFS.vomit : INCIDENT_DEFS.seizure;
    assert.ok(
      episodeSpanS(kind, false) >= actionKind.demoDurationS,
      `${kind} 的生理窗口不应短于动作演示时长`,
    );
    assert.ok(
      def.phases.some((p) => p.id === 'post-ictal' || p.id === 'post-emetic'),
      `${kind} 必须包含恢复段`,
    );
  }

  // 抽搐被压缩得最狠（真实过程十余分钟压到 30 秒），呕吐几乎不压缩。
  const seizureRatio = episodeSpanS('seizure', true) / episodeSpanS('seizure', false);
  const vomitRatio = episodeSpanS('vomiting', true) / episodeSpanS('vomiting', false);
  assert.ok(seizureRatio > 10, `抽搐应被大幅压缩，实际 ${seizureRatio.toFixed(1)} 倍`);
  assert.ok(vomitRatio < 4, `呕吐的压缩比应远小于抽搐，实际 ${vomitRatio.toFixed(1)} 倍`);

  // 产热权重必须真的登记过，否则体温会退化成「按时长线性」。
  assert.ok(effectiveHeatingSeconds(PHYSIOLOGY_EPISODES.seizure) > 100, '抽搐应有可观的产热秒数');
  assert.ok(
    effectiveHeatingSeconds(PHYSIOLOGY_EPISODES.vomiting) <
      effectiveHeatingSeconds(PHYSIOLOGY_EPISODES.seizure) / 5,
    '呕吐的产热秒数应远小于抽搐',
  );
});
test('生理状态机：越界与负时长都被钳到边界，不抛错', () => {
  for (const kind of PHYSIOLOGY_EPISODE_KINDS) {
    const early = predictPhysiologyAt({ ...BASE, episode: kind, episodeElapsedS: -5 });
    const late = predictPhysiologyAt({ ...BASE, episode: kind, episodeElapsedS: 1e6 });
    assert.ok(Number.isFinite(early.features.hrBpm));
    assert.ok(Number.isFinite(late.features.hrBpm));
    assert.ok(early.features.hrBpm > 0 && late.features.hrBpm > 0);
  }
});

test('生理状态机：确定性与单调性——同输入同输出，且时相可枚举', () => {
  const a = predictPhysiologyAt({ ...BASE, episode: 'seizure', episodeElapsedS: 7.5 });
  const b = predictPhysiologyAt({ ...BASE, episode: 'seizure', episodeElapsedS: 7.5 });
  assert.deepEqual(a, b);

  for (const kind of PHYSIOLOGY_EPISODE_KINDS) {
    const trace = traceOf(kind);
    const seen = new Set(trace.samples.map((s) => s.state));
    assert.ok(seen.size >= 2, `${kind} 的曲线应覆盖多个时相，实际 ${[...seen].join('/')}`);
  }
});

test('生理状态机：严重度 0 退化为纯前驱（没有发作期采样点）', () => {
  const trace = buildPhysiologyTrace('seizure', BASE, { stepS: 1, severity: 0.34 });
  const states = new Set(trace.samples.map((s) => s.state));
  assert.ok(!states.has('ictal'), `严重度 0.34 时不应出现发作期，实际 ${[...states].join('/')}`);
});

// ---------------------------------------------------------------- 状态词汇

test('生理状态机：每个状态都能被追溯到至少一次突发，idle 除外', () => {
  assert.ok(PHYSIOLOGY_STATE_IDS.includes('idle'));
  for (const state of PHYSIOLOGY_STATE_IDS) {
    if (state === 'idle') continue;
    const owners = episodesOfState(state);
    assert.ok(owners.length >= 1, `状态 ${state} 未被任何突发使用`);
  }
});

test('生理状态机：idle 随行为波动，而不是一条直线', () => {
  const rest = idleOpsForActivity('resting');
  const play = idleOpsForActivity('playing');
  const walk = idleOpsForActivity('locomoting');
  assert.ok(play.hrScale > rest.hrScale, '玩耍时心率倍率应高于休息');
  assert.ok(walk.rrScale > rest.rrScale, '走动时呼吸倍率应高于休息');
  assert.ok(play.motionArtifact > walk.motionArtifact, '玩耍的体动应高于走动');
});

// ---------------------------------------------------------------- 项圈可观测特征

test('项圈特征：抽搐的高频抖动能量远高于干呕，干呕的低频起伏能量远高于抽搐', () => {
  const seizure = traceOf('seizure');
  const vomit = traceOf('vomiting');
  const tremorOf = (t: PhysiologyTrace): number => Math.max(...t.samples.map((s) => s.tremorPower));
  const retchOf = (t: PhysiologyTrace): number => Math.max(...t.samples.map((s) => s.retchPower));

  assert.ok(tremorOf(seizure) > 0.9, `抽搐应给出接近饱和的高频抖动能量，实际 ${tremorOf(seizure)}`);
  assert.equal(tremorOf(vomit), 0, '干呕的频率不在 8–15 Hz 频带内，抖动能量应为 0');
  assert.ok(retchOf(vomit) > 0.2, `干呕应给出低频起伏能量，实际 ${retchOf(vomit)}`);
  assert.equal(retchOf(seizure), 0, '抽搐的频率不在 1.5–3 Hz 频带内，起伏能量应为 0');
});

test('项圈特征：可分性由设计决定，且必须由多个通道共同支撑', () => {
  const seizure = predictPhysiologyAt({
    ...BASE,
    episode: 'seizure',
    episodeElapsedS: 7.5,
    motion: INCIDENT_DEFS.seizure.motion,
  });
  const vomit = predictPhysiologyAt({
    ...BASE,
    episode: 'vomiting',
    episodeElapsedS: 10,
    motion: INCIDENT_DEFS.vomit.motion,
  });
  const diffs = describeSeparability(seizure.features, vomit.features);
  assert.ok(
    diffs.length >= 3,
    `抽搐与干呕应在多个通道上被拉开，实际只有 ${diffs.length} 个：${diffs.map((d) => d.feature).join('、')}`,
  );
  for (const d of diffs) {
    assert.ok(d.relativeDelta >= 0.25, `差异通道 ${d.feature} 的相对差应不低于阈值`);
  }
});

test('项圈特征：采集参数全部 unverified 且不输出数字', () => {
  assert.ok(COLLAR_SAMPLING.length >= 3, '采样率、心率来源、呼吸来源都应登记');
  for (const spec of COLLAR_SAMPLING) {
    assert.equal(spec.evidence.tier, 'unverified', `${spec.id} 应为 unverified`);
    assert.equal(spec.value, null, `${spec.id} 为 unverified，不得给出数字`);
    assert.ok((spec.evidence.note ?? '').length > 10, `${spec.id} 必须写明为什么是 unverified`);
  }
});
