/**
 * 生理读数仿真器的单测。
 *
 * 这一组测试要守住的核心事实只有一条：
 * **读数里包含"与身体无关"的部分**（运动伪迹、项圈移位、测量情境），
 * 而真值里没有。如果这条守不住，项目就会开始宣称"项圈能测猫的身体状态"。
 *
 * 其中最有价值的两条是：
 *   - 体表温读数与核心温真值**无相关**（因此任何"换算"都没有信息基础）；
 *   - 诊室情境下读数大幅上移，而**真值一模一样**。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, generateSession } from '../src/index.ts';
import { evaluateVitalAlerts, motionGate } from '../../core/src/index.ts';
import type { PetProfile, Sample, Session } from '@camp/core';

const profile: PetProfile = {
  species: 'cat',
  breedId: 'domestic-shorthair',
  weightKg: 4.2,
  heightCm: 24,
  ageMonths: 36,
};

function gen(over: Partial<Parameters<typeof generateSession>[0]> = {}): Session {
  return generateSession({
    profile,
    seed: 42,
    durationMin: 360,
    scenario: 'living-room-day',
    ...over,
  });
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? (s[mid] as number) : (((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

function pearson(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  const ma = a.reduce((p, c) => p + c, 0) / n;
  const mb = b.reduce((p, c) => p + c, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = (a[i] as number) - ma;
    const y = (b[i] as number) - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return num / Math.sqrt(da * db || 1);
}

/** 最小二乘拟合并返回 R² 与平均绝对误差。 */
function fitR2(xs: readonly number[], ys: readonly number[]): { r2: number; mae: number } {
  const n = Math.min(xs.length, ys.length);
  const mx = xs.reduce((p, c) => p + c, 0) / n;
  const my = ys.reduce((p, c) => p + c, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - mx;
    const dy = (ys[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let err = 0;
  for (let i = 0; i < n; i++) err += Math.abs((ys[i] as number) - (intercept + slope * (xs[i] as number)));
  return { r2: syy === 0 ? 0 : (sxy * sxy) / (sxx * syy), mae: err / n };
}

const byTime = (s: Session): Sample[] => s.samples;

// ---------------------------------------------------------------- 分离

test('读数与真值分开存放：读数只有体表温，核心温只在 truth 里', () => {
  const s = gen();
  const truth = s.truth!.vitals;
  assert.ok(truth, '会话必须带生理真值序列');
  assert.equal(truth.length, s.samples.length, '真值序列应与采样一一对应');

  for (const x of s.samples) {
    assert.equal(typeof x.tempSurfaceC, 'number', '读数里应有体表温');
    assert.equal((x as unknown as Record<string, unknown>).tempC, undefined, '读数里不得再有"核心温"字段');
    assert.ok(x.readingQuality, '每个采样点都必须登记读数有效性');
    assert.equal(typeof x.measurementCondition, 'string', '读数必须带测量条件');
  }
  for (let i = 0; i < truth.length; i++) {
    assert.equal(truth[i]!.t, s.samples[i]!.t, '真值与采样应按时间对齐');
  }
});

test('体表温读数与核心温真值无相关——这是"不得换算"的结构保证', () => {
  const s = gen({ durationMin: 720 });
  const surface: number[] = [];
  const core: number[] = [];
  for (let i = 0; i < s.samples.length; i++) {
    const x = s.samples[i] as Sample;
    const v = s.truth!.vitals![i];
    if (x.tempSurfaceC !== undefined && v) {
      surface.push(x.tempSurfaceC);
      core.push(v.tempCoreC);
    }
  }
  assert.ok(surface.length > 2000, `样本量应足够（实际 ${surface.length}）`);

  const r = pearson(surface, core);
  const fit = fitR2(core, surface);
  assert.ok(Math.abs(r) < 0.2, `体表温与核心温不应相关，实际 r=${r.toFixed(3)}`);
  assert.ok(fit.r2 < 0.02, `线性拟合不应解释任何方差，实际 R²=${fit.r2.toFixed(4)}`);

  /**
   * 误差断言要**尺度无关**：不能用「MAE ≥ 某个绝对温度」。
   *
   * 为什么：体表温读数的噪声水平是由操作化常量决定的（耦合与自身慢漂），
   * 把绝对阈值写死会变成"改了噪声模型就得改测试"，而那正好是把断言的意义搞反。
   * 真正要断言的是——**拟合不比直接猜均值更好**，而均值预测的误差就是目标本身的标准差。
   */
  const meanCore = core.reduce((p, c) => p + c, 0) / core.length;
  const sdCore = Math.sqrt(core.reduce((p, c) => p + (c - meanCore) ** 2, 0) / core.length);
  assert.ok(
    fit.mae >= 0.6 * sdCore,
    `即便强行拟合，误差也应接近核心温自身的波动：MAE=${fit.mae.toFixed(2)} vs 0.6×sd(core)=${(0.6 * sdCore).toFixed(2)}`,
  );

  // 中位数层面也要分开：体表温比核心温低一截，这是"测量部位不同"的直接后果。
  assert.ok(median(surface) < median(core) - 1.5, `体表温(${median(surface)}) 不应接近核心温(${median(core)})`);
});

test('诊室情境只抬高读数，真值一模一样', () => {
  const home = gen({ scenario: 'living-room-day', durationMin: 240 });
  const clinic = gen({ scenario: 'vet-visit', durationMin: 240 });

  const readMed = (s: Session, key: 'hrBpm' | 'rrBpm'): number =>
    median(byTime(s).map((x) => x[key]).filter((v): v is number => typeof v === 'number'));
  const trueMed = (s: Session, key: 'hrTrueBpm' | 'rrTrueBpm'): number =>
    median((s.truth!.vitals ?? []).map((v) => v[key]));

  const homeHr = readMed(home, 'hrBpm');
  const clinicHr = readMed(clinic, 'hrBpm');
  const homeRr = readMed(home, 'rrBpm');
  const clinicRr = readMed(clinic, 'rrBpm');
  assert.ok(clinicHr / homeHr > 1.2, `诊室心率读数应明显更高：${homeHr.toFixed(1)} → ${clinicHr.toFixed(1)}`);
  assert.ok(clinicRr / homeRr > 1.8, `诊室呼吸读数应明显更高：${homeRr.toFixed(1)} → ${clinicRr.toFixed(1)}`);

  // 同种子下真值序列不受情境影响——同一只猫，读数在动，猫没变。
  assert.equal(trueMed(home, 'hrTrueBpm'), trueMed(clinic, 'hrTrueBpm'));
  assert.equal(trueMed(home, 'rrTrueBpm'), trueMed(clinic, 'rrTrueBpm'));

  // 全部采样点都标成诊室条件，避免被误当成居家基线。
  assert.ok(
    clinic.samples.every((x) => x.measurementCondition === 'clinic'),
    '诊室场景的每个采样点都应标注 clinic 条件',
  );
  assert.ok(home.samples.every((x) => x.measurementCondition !== 'clinic'));
});

// ---------------------------------------------------------------- 失效

test('体动超过门限时读数必须被标为不可用', () => {
  const s = gen({ durationMin: 240 });
  const gates = { hr: motionGate('hr'), rr: motionGate('rr') };
  let motionFlagged = 0;

  for (const x of s.samples) {
    const m = x.motionIndex ?? 0;
    if (m > gates.hr) {
      assert.notEqual(x.readingQuality!.hr!.validity, 'valid', `体动 ${m} 时心率不应被标为可用`);
    }
    if (m > gates.rr) {
      assert.notEqual(x.readingQuality!.rr!.validity, 'valid', `体动 ${m} 时呼吸不应被标为可用`);
      motionFlagged++;
    }
  }
  assert.ok(motionFlagged > 0, '本会话里应存在体动超门限的窗口');
});

test('项圈移位造成的失效与体动无关，也会成段出现', () => {
  const s = gen({ durationMin: 720 });
  const poor = s.samples.filter(
    (x) => x.readingQuality!.rr!.validity === 'poor-contact' && (x.motionIndex ?? 0) <= motionGate('rr'),
  );
  assert.ok(poor.length > 0, '低体动窗口里也应有接触不良导致的不可用读数（项圈会移位）');

  // 成段：相邻的不可用窗口应连在一起，而不是孤立散点。
  const runs: number[] = [];
  let run = 0;
  for (const x of s.samples) {
    if (x.readingQuality!.rr!.validity === 'poor-contact') run++;
    else if (run > 0) {
      runs.push(run);
      run = 0;
    }
  }
  assert.ok(runs.some((n) => n > 1), `接触不良应成段出现，实际连续段长：${runs.slice(0, 8).join(',')}`);
});

test('可用性：三通道都既不是全天候可用，也不是永久失效', () => {
  const s = gen({ durationMin: 1440 });
  for (const key of ['hr', 'rr', 'temp'] as const) {
    let valid = 0;
    for (const x of s.samples) if (x.readingQuality![key]!.validity === 'valid') valid++;
    const share = valid / s.samples.length;
    assert.ok(share > 0.5, `${key} 可用比例过低：${share.toFixed(3)}——通道不应永久失效`);
    assert.ok(share < 0.999, `${key} 可用比例过高：${share.toFixed(3)}——不应宣称全天候可用`);
  }
});

// ---------------------------------------------------------------- 真值

test('注入抽搐后，真值心率升高、核心温上升（hyperthermia 机制）', () => {
  const s = gen({
    durationMin: 720,
    behavior: { injectIncidents: [{ atS: 4 * 3600, kind: 'seizure' }] },
  });
  const inc = (s.truth!.injectedIncidents ?? []).find((i) => i.kind === 'seizure');
  assert.ok(inc, '注入的抽搐应出现在真值里');

  const truth = s.truth!.vitals ?? [];
  const during = truth.filter((v) => v.t >= inc.t && v.t < inc.t + inc.durationS);
  const before = truth.filter((v) => v.t >= inc.t - 1800 && v.t < inc.t);
  assert.ok(during.length >= 1 && before.length > 10);

  assert.ok(
    median(during.map((v) => v.hrTrueBpm)) > median(before.map((v) => v.hrTrueBpm)),
    '抽搐期间真值心率应升高',
  );
  assert.ok(
    median(during.map((v) => v.tempCoreC)) > median(before.map((v) => v.tempCoreC)),
    '抽搐期间核心温真值应升高',
  );
});

test('睡眠窗口真的存在（否则睡眠呼吸频率这条协议无从谈起）', () => {
  const s = gen({ durationMin: 1440 });
  const sleep = s.samples.filter((x) => x.measurementCondition === 'sleep');
  const share = sleep.length / s.samples.length;
  assert.ok(share > 0.2, `睡眠窗口占比过低：${share.toFixed(3)}`);
  const validSleepRr = sleep.filter((x) => x.readingQuality!.rr!.validity === 'valid');
  assert.ok(validSleepRr.length > 30, '睡眠中的呼吸读数应足够建立基线');
});

test('新增场景已登记，且同种子生成结果可复现', () => {
  assert.ok(SCENARIOS['vet-visit'], 'vet-visit 场景应登记在 SCENARIOS 里');
  const a = gen({ scenario: 'vet-visit' });
  const b = gen({ scenario: 'vet-visit' });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

// ---------------------------------------------------------------- 手动触发的急性动作（App 演示的行为）

const profileForAlerts = profile;

function withIncident(kind: 'seizure' | 'vomit', atS = 600): Session {
  return generateSession({
    profile: profileForAlerts,
    seed: 42,
    durationMin: 720,
    scenario: 'living-room-day',
    behavior: { seed: 42, timeScale: 20, injectIncidents: [{ atS, kind }] },
  });
}

test('注入抽搐：进入急性生理窗口，体表温读数随之抬升（这一路是慢通道）', () => {
  const s = withIncident('seizure');
  const window = s.samples.filter((x) => x.t >= 600 && x.t <= 630);
  assert.ok(window.length >= 3, '急性窗口内应有足够采样');
  assert.ok(
    window.some((x) => typeof x.physiologyState === 'string' && x.physiologyState !== 'idle'),
    '窗口内应带生理状态名',
  );

  const before = median(s.samples.filter((x) => x.t >= 300 && x.t < 600).map((x) => x.tempSurfaceC ?? 0));
  const late = s.samples.filter((x) => x.t >= 615 && x.t <= 625).map((x) => x.tempSurfaceC ?? 0);
  assert.ok(late.length > 0);
  // 体表温是慢通道：窗口后段才越线。这里只要求"确实抬升"，幅度由操作化常量决定。
  assert.ok(
    Math.max(...late) - before > 0.3,
    `抽搐后段体表温应明显高于窗口前基线：${before.toFixed(2)} → ${Math.max(...late).toFixed(2)}`,
  );
});

test('注入呕吐：心率读数在恢复段明显高于参考值（可用的红字就是这一处）', () => {
  const s = withIncident('vomit');
  const ref = median(
    s.samples.filter((x) => x.t >= 300 && x.t < 600 && x.readingQuality?.hr?.validity === 'valid').map((x) => x.hrBpm ?? 0),
  );
  const peak = Math.max(
    ...s.samples.filter((x) => x.t >= 600 && x.t <= 630).map((x) => x.hrBpm ?? 0),
  );
  assert.ok(peak / ref - 1 > 0.25, `呕吐期间心率读数应明显升高：参考 ${ref.toFixed(0)} → 峰值 ${peak.toFixed(0)}`);
});

test('★ App 提示层：无注入的 24 小时会话里几乎不弹提醒（误报率 < 1%）', () => {
  // 这条断言把「提示层的判据」与「会话的数据模型」钉在一起。
  // 如果将来把行为级的生理取值（`idleOpsForActivity`）接进会话，
  // 而提示层仍按"静息参考值"比较，误报率会立刻飙升，这条会失败——那正是我们要的提醒。
  for (const seed of [42, 7, 99]) {
    const s = generateSession({
      profile,
      seed,
      durationMin: 1440,
      scenario: 'living-room-day',
      behavior: { seed, timeScale: 20 },
    });
    let notify = 0;
    for (const sample of s.samples) {
      const a = evaluateVitalAlerts({ sample, samples: s.samples, atS: sample.t });
      if (a.shouldNotify) notify++;
    }
    const rate = notify / s.samples.length;
    assert.ok(rate < 0.01, `seed=${seed} 误报率 ${(rate * 100).toFixed(2)}% 过高（${notify} 个窗口）`);
  }
});

test('★ App 提示层：注入的抽搐/呕吐一定会弹提醒，且给出可核查的理由', () => {
  for (const kind of ['seizure', 'vomit'] as const) {
    const s = withIncident(kind);
    const hits = s.samples.filter((x) => {
      const a = evaluateVitalAlerts({ sample: x, samples: s.samples, atS: x.t });
      return a.shouldNotify;
    });
    assert.ok(hits.length > 0, `${kind}：注入后应至少有一个窗口触发提醒`);
    const a = evaluateVitalAlerts({ sample: hits[0] as Sample, samples: s.samples, atS: (hits[0] as Sample).t });
    assert.equal(a.title, '宠物状态异常');
    assert.ok(a.details.length > 0, '提醒必须给出理由');
    assert.match(a.boundary, /不构成/);
  }
});
