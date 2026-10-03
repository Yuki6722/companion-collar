/**
 * 生理状态机接入会话链路的回归断言。
 *
 * 这一组要守住的是那个具体问题的答案：**抽搐与呕吐时，心率与呼吸各自怎么变**，
 * 以及这些变化在**项圈可观测的通道**上留下什么。
 *
 * ⚠️ 全部数值都是仿真注入真值，不是对真实猫的测量：
 *   猫用项圈的心率与呼吸频率未取得任何验证研究。这些断言证明的是
 *   「模型与算法链路自洽」，**不是**「能识别抽搐」。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSession } from '../src/index.ts';
import { motionGate } from '../../core/src/index.ts';
import type { PetProfile, Sample, Session } from '@camp/core';

const profile: PetProfile = {
  species: 'cat',
  breedId: 'domestic-shorthair',
  weightKg: 4.2,
  heightCm: 24,
  ageMonths: 36,
};

/**
 * 生成带一次注入突发的会话。
 *
 * ⚠️ 采样间隔取 **2 秒**而不是默认的 10 秒：抽搐的前驱相位只有 2 秒，
 * 10 秒步长下**必然**采不到它。这不是模型问题，而是采样率问题——
 * 一条真实的产品约束：想看清前驱，采样间隔必须短于最短相位。
 */
function genWith(kind: 'seizure' | 'vomit', atS = 4 * 3600, sampleIntervalSec = 2): Session {
  return generateSession({
    profile,
    seed: 42,
    durationMin: 720,
    scenario: 'living-room-day',
    sampleIntervalSec,
    behavior: { injectIncidents: [{ atS, kind }] },
  });
}

/**
 * 采集步长（秒）。
 *
 * ⚠️ 断言里的窗口必须按它放宽，否则会把采样率问题误读成模型问题。
 */
const STEP_S = 2;
/** 生理窗口会**跨过**动作演示的末尾（恢复段），因此要往后多留一点。 */
const TAIL_S = 60;

function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? (s[mid] as number) : (((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

/**
 * 一次突发的完整生理窗口（含前驱与恢复段）。
 *
 * 左边界多减一个步长：生理窗口从**前驱**开始，而前驱落在动作演示起点之前，
 * 若从 `inc.t` 起算就永远采不到它（1 秒步长下也一样，相位会整体右移）。
 */
function inEpisode(s: Session, kind: string): Sample[] {
  const inc = (s.truth!.injectedIncidents ?? []).find((i) => i.kind === kind);
  assert.ok(inc, `注入的 ${kind} 应出现在真值里`);
  return s.samples.filter((x) => x.t >= inc.t - STEP_S && x.t < inc.t + inc.durationS + TAIL_S);
}

// ---------------------------------------------------------------- 时相可辨

test('生理状态机接入：抽搐的生理窗口覆盖前驱、发作与恢复三个时相', () => {
  const s = genWith('seizure');
  const states = new Set(inEpisode(s, 'seizure').map((x) => x.physiologyState));
  assert.ok(states.has('pre-ictal'), `应记录到前驱时相，实际 ${[...states].join('/')}`);
  assert.ok(states.has('ictal'), `应记录到发作期，实际 ${[...states].join('/')}`);
  // 动作演示只有 15 秒，而生理窗口 30 秒：恢复段**必须**跨过动作末尾存在，
  // 否则唯一可被采信的偏离就不在数据里了。
  assert.ok(
    states.has('post-ictal'),
    `恢复段必须出现在会话里（它跨过动作演示的末尾），实际 ${[...states].join('/')}`,
  );
});

test('生理状态机接入：呕吐的生理窗口覆盖干呕、排出与恢复三个时相', () => {
  const s = genWith('vomit');
  const states = new Set(inEpisode(s, 'vomit').map((x) => x.physiologyState));
  assert.ok(states.has('retching'), `应记录到干呕期，实际 ${[...states].join('/')}`);
  assert.ok(states.has('post-emetic'), `应记录到恢复期，实际 ${[...states].join('/')}`);
});

test('生理状态机接入：未处于突发时不得写入状态标记', () => {
  const s = genWith('seizure');
  const idle = s.samples.filter((x) => x.physiologyState === undefined);
  assert.ok(idle.length > s.samples.length * 0.8, '绝大多数采样点应是常驻状态，不写标记');
  // 标记过的点必须落在该突发的**生理窗口**内（含前驱与恢复段）——
  // 否则就是状态机与时间线脱节。
  const inc = (s.truth!.injectedIncidents ?? []).find((i) => i.kind === 'seizure')!;
  const lo = inc.t - STEP_S;
  const hi = inc.t + inc.durationS + TAIL_S;
  for (const x of s.samples) {
    if (x.physiologyState === undefined) continue;
    assert.ok(
      x.t >= lo && x.t < hi,
      `t=${x.t} 标了状态却不在生理窗口 [${lo}, ${hi}) 内`,
    );
  }
});

// ---------------------------------------------------------------- 方向与幅度

test('生理状态机接入：抽搐期间真值心率与呼吸都上升，恢复期仍高于基线', () => {
  const s = genWith('seizure');
  const truth = s.truth!.vitals ?? [];
  const inc = (s.truth!.injectedIncidents ?? []).find((i) => i.kind === 'seizure')!;
  const duringSlice = truth.filter((v) => v.t >= inc.t && v.t < inc.t + inc.durationS);
  const beforeSlice = truth.filter((v) => v.t >= inc.t - 1800 && v.t < inc.t);
  assert.ok(duringSlice.length >= 2 && beforeSlice.length > 10);

  const hrBase = median(beforeSlice.map((v) => v.hrTrueBpm));
  const rrBase = median(beforeSlice.map((v) => v.rrTrueBpm));
  assert.ok(
    Math.max(...duringSlice.map((v) => v.hrTrueBpm)) > hrBase * 1.4,
    `抽搐期间真值心率应明显上升：基线 ${hrBase.toFixed(1)}`,
  );
  assert.ok(
    Math.max(...duringSlice.map((v) => v.rrTrueBpm)) > rrBase * 1.5,
    `抽搐期间真值呼吸应明显上升：基线 ${rrBase.toFixed(1)}`,
  );
});

test('生理状态机接入：呕吐期间心率与呼吸上升的幅度小于抽搐', () => {
  const seizure = genWith('seizure');
  const vomit = genWith('vomit');
  const peakOf = (s: Session, kind: string, key: 'hrTrueBpm' | 'rrTrueBpm'): number => {
    const inc = (s.truth!.injectedIncidents ?? []).find((i) => i.kind === kind)!;
    return Math.max(
      ...(s.truth!.vitals ?? [])
        .filter((v) => v.t >= inc.t && v.t < inc.t + inc.durationS)
        .map((v) => v[key]),
    );
  };
  assert.ok(
    peakOf(seizure, 'seizure', 'hrTrueBpm') > peakOf(vomit, 'vomit', 'hrTrueBpm'),
    '抽搐的心率峰值应高于呕吐',
  );
  assert.ok(
    peakOf(seizure, 'seizure', 'rrTrueBpm') > peakOf(vomit, 'vomit', 'rrTrueBpm'),
    '抽搐的呼吸峰值应高于呕吐',
  );
});

// ---------------------------------------------------------------- 项圈可观测面

test('生理状态机接入：抽搐动作当下心率与呼吸读数都不可用（机械伪影）', () => {
  const s = genWith('seizure');
  const ictal = inEpisode(s, 'seizure').filter((x) => x.physiologyState === 'ictal');
  assert.ok(ictal.length >= 1, '应有发作期采样点');

  let flagged = 0;
  for (const x of ictal) {
    const motion = x.motionIndex ?? 0;
    // 抖动是在约 1 秒内涨上去的：发作期第一个采样点可能刚起步。
    // 因此判据挂在**体动门限**上，而不是「只要标了 ictal 就必须作废」——
    // 后者是拿标签代替物理量，正是本项目最忌讳的写法。
    if (motion > motionGate('hr')) {
      flagged++;
      assert.notEqual(x.readingQuality!.hr!.validity, 'valid', `体动 ${motion} 时心率不应可用`);
      assert.notEqual(x.readingQuality!.rr!.validity, 'valid', `体动 ${motion} 时呼吸不应可用`);
    }
  }
  assert.ok(flagged >= 1, '发作期必须存在体动超门限、读数作废的窗口');
});

test('生理状态机接入：发作期作废的窗口对应体动峰值，且不是孤点', () => {
  const s = genWith('seizure');
  const episode = inEpisode(s, 'seizure');
  const peak = Math.max(...episode.map((x) => x.motionIndex ?? 0));
  assert.ok(peak > 0.9, `发作期体动峰值应接近饱和，实际 ${peak}`);
  const invalid = episode.filter((x) => x.readingQuality!.rr!.validity !== 'valid');
  assert.ok(invalid.length >= 1, '应存在呼吸读数作废的窗口');
  // 作废窗口的体动必须都高于呼吸门限（呼吸门限比心率严）。
  for (const x of invalid) {
    assert.ok(
      (x.motionIndex ?? 0) > motionGate('rr') ||
        x.readingQuality!.rr!.validity === 'poor-contact' ||
        x.readingQuality!.rr!.validity === 'rejected-out-of-range',
      `t=${x.t} 呼吸作废但体动仅 ${x.motionIndex}`,
    );
  }
});

test('项圈特征：抽搐给出 8–15 Hz 抖动能量，呕吐给出 1.5–3 Hz 起伏能量——两者互斥', () => {
  const seizure = inEpisode(genWith('seizure'), 'seizure');
  const vomit = inEpisode(genWith('vomit'), 'vomit');

  const maxTremor = Math.max(...seizure.map((x) => x.tremorPower ?? 0));
  const maxRetch = Math.max(...vomit.map((x) => x.retchPower ?? 0));
  assert.ok(maxTremor > 0.9, `抽搐应给出高频抖动能量，实际 ${maxTremor}`);
  assert.ok(maxRetch > 0.1, `干呕应给出低频起伏能量，实际 ${maxRetch}`);

  // 互斥：抽搐不在低频带、干呕不在高频带。这是两个状态在颈部**最可分**的一点。
  const seizureRetch = Math.max(...seizure.map((x) => x.retchPower ?? 0));
  const vomitTremor = Math.max(...vomit.map((x) => x.tremorPower ?? 0));
  assert.equal(seizureRetch, 0, '抽搐不应出现在 1.5–3 Hz 频带');
  assert.equal(vomitTremor, 0, '干呕不应出现在 8–15 Hz 频带');
});

test('生理状态机接入：核心温只在真值里变化，且抽搐远大于呕吐', () => {
  const seizure = genWith('seizure');
  const vomit = genWith('vomit');
  const coreDelta = (s: Session, kind: string): number => {
    const inc = (s.truth!.injectedIncidents ?? []).find((i) => i.kind === kind)!;
    const truth = s.truth!.vitals ?? [];
    const duringSlice = truth.filter((v) => v.t >= inc.t && v.t < inc.t + inc.durationS);
    const beforeSlice = truth.filter((v) => v.t >= inc.t - 1800 && v.t < inc.t);
    return (
      Math.max(...duringSlice.map((v) => v.tempCoreC)) - median(beforeSlice.map((v) => v.tempCoreC))
    );
  };
  const sz = coreDelta(seizure, 'seizure');
  const vm = coreDelta(vomit, 'vomit');
  assert.ok(sz > 0, `抽搐应抬升核心温真值，实际 ${sz.toFixed(3)}`);
  assert.ok(sz > vm * 3, `抽搐的温升应远大于呕吐：${sz.toFixed(3)} vs ${vm.toFixed(3)}`);
});

test('生理状态机接入：同种子字节级一致（不引入任何非确定性）', () => {
  assert.equal(JSON.stringify(genWith('seizure')), JSON.stringify(genWith('seizure')));
  assert.equal(JSON.stringify(genWith('vomit')), JSON.stringify(genWith('vomit')));
});
