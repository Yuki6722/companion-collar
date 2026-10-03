/**
 * 读数变化提示：App 上「数字变红 + 弹一条提醒」的**唯一判据来源**。
 *
 * 这一层要回答的问题很小，但很容易做错：
 *   > 什么时候值得打扰主人？
 *
 * 三条纪律（每一条都是为了让提示既不变成噪音、也不变成越界结论）：
 *
 * 1. **与"这只猫最近的读数"比，不与种群平均值比。**
 *    参考值是近 30 分钟内**低体动窗口**（静息/睡眠）的稳健中位数。
 *    用低体动窗口而不是全部窗口：走动中的读数会把参考值抬高，之后的静息读数
 *    就会看起来"偏低"，从而产生一堆反向假阳性。
 *
 * 2. **先扣掉当前行为的预期升高。**
 *    走动、玩耍本身就会让心率升高（生理层的 `idleOpsForActivity` 已登记这件事）。
 *    不扣的话，正常玩耍会被判成异常——那是这类提示最坏的假阳性，因为它每天都发生。
 *
 * 3. **提示的是"读数变化"，不是"身体状态"。**
 *    判据全部可核查：哪个通道、当前读数、参考值、偏离多少。弹窗标题沿用产品口径，
 *    但正文只列事实 + 边界说明 + 转诊路径，绝不出现任何病名。
 */
import { median } from '../baseline.ts';
import type { Sample, VitalKey } from '../types.ts';
import { VITALS_BOUNDARY_NOTE, conditionOf, readingOf } from './readings.ts';
import { vitalsConstantValue } from './params.ts';

export type VitalAlertLevel = 'none' | 'watch' | 'alert';

/** 单通道的提示结果。所有字段都是可核查的事实，没有一个是"结论"。 */
export interface VitalChannelAlert {
  key: VitalKey;
  label: string;
  level: VitalAlertLevel;
  /** 当前读数（可用时）；不可用时为 null */
  current: number | null;
  /** 参考值（近 30 分钟低体动窗口的中位数）；不足时为 null */
  reference: number | null;
  /** 偏离比例（心率/呼吸） */
  deviationPct: number | null;
  /** 偏离绝对量（体表温，°C） */
  deviationAbs: number | null;
  /** 当前窗口的读数是否可用；不可用时**不给数值判断**，只给"不可用"这一事实 */
  usable: boolean;
  /** 界面是否该把这一路标红（达到阈值，或处于急性窗口且读数不可用） */
  highlight: boolean;
  /** 该通道为什么被标出来（面向用户的一句话，只描述读数与测量条件） */
  reason: string;
}

export interface VitalAlertSummary {
  atS: number;
  channels: readonly VitalChannelAlert[];
  /** 是否处于一次急性动作的生理窗口内（由 `Sample.physiologyState` 判定，不是由读数判定） */
  acuteWindow: boolean;
  /** 急性窗口内是否出现"读不到"（这也是一条证据：设备在此期间测不到） */
  readingTrustworthinessLimited: boolean;
  /** 是否应该弹提醒 */
  shouldNotify: boolean;
  /** 提醒标题（产品口径，按需求固定为「宠物状态异常」） */
  title: string;
  /** 副标题：把标题落回"读数变化"这件事上 */
  subtitle: string;
  /** 逐条理由（哪条证据成立） */
  details: readonly string[];
  /** 常驻边界句 */
  boundary: string;
  /** 转诊路径 */
  referral: string;
}

/**
 * 提醒标题。**按产品要求固定为这句话**，但它是这一层唯一的"判断式"文案，
 * 因此旁边必须永远跟着 `subtitle`（读数口径）与 `boundary`（边界说明）。
 */
export const VITAL_ALERT_TITLE = '宠物状态异常';

/** 副标题：把「异常」这个说法落回可证伪的读数描述上。 */
export const VITAL_ALERT_SUBTITLE = '心率 / 呼吸频率 / 体表温出现相对自身基线的显著变化';

/** 转诊路径（与突发演示共用同一口径，来自 `docs/research/06` 的急诊红旗清单）。 */
export const VITAL_ALERT_REFERRAL =
  '以下情形在权威兽医资料中列为需要尽快就诊：张口呼吸或呼吸费力、公猫反复蹲砂盆却排不出尿、反复呕吐、食欲下降持续三天以上。请录像并联系兽医，不要等待。';

const LEVEL_RANK: Record<VitalAlertLevel, number> = { none: 0, watch: 1, alert: 2 };

const CHANNEL_LABELS: Record<VitalKey, string> = {
  hr: '心率',
  rr: '呼吸频率',
  temp: '体表温',
};

export interface VitalAlertInput {
  /** 当前采样点 */
  sample: Sample;
  /** 同一会话的其它采样点（用于算参考值），含当前点也可以 */
  samples: readonly Sample[];
  /** 会话内秒 */
  atS: number;
}

/**
 * 逐个通道评估提示级别。
 *
 * 返回的三个通道永远齐备（缺数据时 `level: 'none'` 并写明原因），
 * 这样界面不需要判断"这个通道在不在结果里"。
 */
export function evaluateVitalAlerts(input: VitalAlertInput): VitalAlertSummary {
  const { sample, samples, atS } = input;
  const windowS = vitalsConstantValue('alertReferenceWindowS', 1800);
  const minWindows = vitalsConstantValue('alertMinReferenceWindows', 5);
  const watchRatio = vitalsConstantValue('alertWatchRatio', 0.6);
  const thresholds: Record<VitalKey, number> = {
    hr: vitalsConstantValue('alertHrDeviation', 0.15),
    rr: vitalsConstantValue('alertRrDeviation', 0.2),
    temp: vitalsConstantValue('alertTempDeviationC', 0.35),
  };

  const acuteWindow = typeof sample.physiologyState === 'string' && sample.physiologyState !== 'idle';
  /**
   * 只在**低体动窗口**做数值比较。
   *
   * 为什么：中等体动（快走）下读数虽然可能被标为"可用"，但它本身就带着伪迹；
   * 拿它去和静息参考值比，会得到"走路时心率忽高忽低"的假提示。
   * 门限取最严的一路（呼吸通道），即"猫安静下来时才做比较"——
   * 这与睡眠呼吸频率协议只要睡眠窗口是同一条思路。
   *
   * 急性窗口例外：那一段本来就要把"读不到"标出来，不能因为体动大就不评。
   */
  const motionIndex = sample.motionIndex ?? 0;
  const quietEnough = motionIndex <= vitalsConstantValue('rrMotionGate', 0.25);
  /**
   * 只在**环境安静**的窗口做数值比较。
   *
   * 为什么：噪声本身就是一次应激源，会话里的噪声突发会把心率抬高十几个百分点
   * （`stressIndex` 通道）。拿噪声中的读数去和安静时的参考值比，会得到
   * "外面在装修、App 说宠物异常"——这是同一类错误：**比的是情境，不是身体**。
   * 项圈本来就带麦克风，这条判断在真机上同样成立。
   */
  const noiseLimit = vitalsConstantValue('alertNoiseLimitDbA', 50);
  const quietEnvironment = (sample.noiseDbA ?? 0) <= noiseLimit;

  const channels: VitalChannelAlert[] = (['hr', 'rr', 'temp'] as const).map((key) =>
    evaluateChannel(key, {
      sample,
      samples,
      atS,
      windowS,
      minWindows,
      watchRatio,
      threshold: thresholds[key],
      quietEnough: (quietEnough && quietEnvironment) || acuteWindow,
      acuteWindow,
    }),
  );

  const anyAlert = channels.some((c) => c.level === 'alert');
  const anyWatch = channels.some((c) => c.level === 'watch');
  const readingTrustworthinessLimited = acuteWindow && channels.some((c) => !c.usable);

  const details: string[] = [];
  for (const c of channels) {
    if (c.level === 'none') continue;
    details.push(c.reason);
  }
  if (acuteWindow) {
    details.push(
      `当前窗口处于一次急性动作的生理过程内（状态：${sample.physiologyState}）：这一段的读数可能因体动不可采信，因此"读不到"本身也是需要留意的证据。`,
    );
  }
  if (!anyAlert && anyWatch) {
    details.push('有通道接近提示阈值，本次只改配色、不打扰。');
  }

  return {
    atS,
    channels,
    acuteWindow,
    readingTrustworthinessLimited,
    // 弹窗条件：①读数偏离达到阈值；或 ②处于急性窗口且该窗口读不到。
    // 两条都是可核查的事实，也都不是任何诊断结论。
    shouldNotify: anyAlert || readingTrustworthinessLimited,
    title: VITAL_ALERT_TITLE,
    subtitle: VITAL_ALERT_SUBTITLE,
    details,
    boundary: VITALS_BOUNDARY_NOTE,
    referral: VITAL_ALERT_REFERRAL,
  };
}

interface ChannelInput {
  sample: Sample;
  samples: readonly Sample[];
  atS: number;
  windowS: number;
  minWindows: number;
  watchRatio: number;
  threshold: number;
  /** 低体动（或处于急性窗口）：只有这时才做数值比较 */
  quietEnough: boolean;
  acuteWindow: boolean;
}

function evaluateChannel(key: VitalKey, input: ChannelInput): VitalChannelAlert {
  const { sample, samples, atS, windowS, minWindows, watchRatio, threshold } = input;
  const label = CHANNEL_LABELS[key];
  const current = readingOf(sample, key);
  const usable = current !== null;

  /**
   * 参考窗口必须**同条件**。
   *
   * 这一条是踩出来的：第一版把"静息 + 睡眠"混在一起取中位数，而睡眠的心率系统性
   * 低约 12%、呼吸低约 22%（生理层的 `sleepFactor` / 睡眠因子）。混在一起的结果是
   * **只要猫醒了，读数就"偏高"**——24 小时里 25% 的窗口会误弹提醒。
   * 这与漂移层「跨条件不比较」是同一条纪律，提示层也必须守。
   */
  const currentCondition = conditionOf(sample);
  const referenceConditions: ReadonlyArray<string> =
    currentCondition === 'sleep' ? ['sleep'] : ['resting'];

  const collect = (fromT: number, toT: number): number[] => {
    const out: number[] = [];
    for (const s of samples) {
      if (s.t > toT || s.t < fromT) continue;
      if (!referenceConditions.includes(conditionOf(s))) continue;
      // 参考值同样只在安静环境里取：否则一次噪声突发会把参考值抬上去，
      // 之后的安静读数就会看起来"偏低"。
      if ((s.noiseDbA ?? 0) > vitalsConstantValue('alertNoiseLimitDbA', 50)) continue;
      const v = readingOf(s, key);
      if (v !== null) out.push(v);
    }
    return out;
  };

  // ① 近 30 分钟的同条件窗口；② 不够就回退到"本次会话开头到此刻"（注入之前的那一段）；
  // ③ 仍然不够则不给数值判断。
  let refValues = collect(atS - windowS, atS);
  if (refValues.length < minWindows) refValues = collect(Number.NEGATIVE_INFINITY, atS);
  const base = refValues.length >= minWindows ? median(refValues) : null;

  /**
   * 为什么**不做**「当前行为的预期升高」校正：
   *
   * 生理层确实登记了每种行为的 `idle` 取值（走动 ×1.25、玩耍 ×1.5…），但当前数据链路里
   * 它**没有**被注入到会话中（调用方只在突发窗口传 `physiology`）。若提示层擅自按
   * 「走动应该已经高 25%」去校正，就会把正常的走动读成"偏低"，反向误报。
   *
   * 这是一条**有意的耦合**：提示层的判据必须与实际数据模型一致。若将来把 `idle`
   * 取值接进会话，`packages/core/test/vitals.test.ts` 里那条「无突发会话不得弹提醒」
   * 的断言会立刻失败，提示层必须同时改——不允许两处悄悄漂移。
   */
  if (!input.quietEnough) {
    return {
      key,
      label,
      level: 'none',
      current,
      reference: base,
      deviationPct: null,
      deviationAbs: null,
      usable,
      highlight: false,
      reason: `${label}：当前体动较大（${(sample.motionIndex ?? 0).toFixed(2)}），这一段不做数值比较。`,
    };
  }

  if (!usable || current === null) {
    return {
      key,
      label,
      level: 'none',
      current: null,
      reference: base,
      deviationPct: null,
      deviationAbs: null,
      usable: false,
      // 急性窗口里"读不到"要标红：设备在这段时间失去了测量能力，本身就是信息。
      highlight: input.acuteWindow,
      reason: `${label}：本窗口读数不可用（${sample.readingQuality?.[key]?.validity ?? '未登记'}），因此不对它做数值判断。`,
    };
  }

  if (base === null) {
    return {
      key,
      label,
      level: 'none',
      current,
      reference: null,
      deviationPct: null,
      deviationAbs: null,
      usable: true,
      highlight: false,
      reason: `${label}：参考窗口内可用读数少于 ${minWindows} 个，暂不比较。`,
    };
  }

  if (key === 'temp') {
    const deviationAbs = Number((current - base).toFixed(2));
    const ratio = Math.abs(deviationAbs) / threshold;
    const level: VitalAlertLevel = ratio >= 1 ? 'alert' : ratio >= watchRatio ? 'watch' : 'none';
    return {
      key,
      label,
      level,
      current,
      reference: base,
      deviationPct: null,
      deviationAbs,
      usable: true,
      highlight: level === 'alert',
      reason: `${label}：当前 ${current.toFixed(1)} °C，参考值 ${base.toFixed(1)} °C（近 30 分钟静息/睡眠窗口），${deviationAbs >= 0 ? '高' : '低'} ${Math.abs(deviationAbs).toFixed(2)} °C。体表温不是核心体温。`,
    };
  }

  const deviationPct = Number((current / base - 1).toFixed(3));
  const ratio = Math.abs(deviationPct) / threshold;
  const level: VitalAlertLevel = ratio >= 1 ? 'alert' : ratio >= watchRatio ? 'watch' : 'none';
  return {
    key,
    label,
    level,
    current,
    reference: base,
    deviationPct,
    deviationAbs: null,
    usable: true,
    highlight: level === 'alert',
    reason:
      `${label}：当前 ${current.toFixed(0)} 次/分，比同期静息/睡眠窗口的参考值（${base.toFixed(0)} 次/分）` +
      `${deviationPct >= 0 ? '高' : '低'} ${Math.abs(deviationPct * 100).toFixed(0)}%。`,
  };
}

/** 汇总一行：给界面用的「最高级别」。 */
export function highestAlertLevel(summary: VitalAlertSummary): VitalAlertLevel {
  let level: VitalAlertLevel = 'none';
  for (const c of summary.channels) {
    if (LEVEL_RANK[c.level] > LEVEL_RANK[level]) level = c.level;
  }
  return level;
}

/** 需要标红的通道（达到阈值，或急性窗口内读不到）。 */
export function highlightedChannels(summary: VitalAlertSummary): VitalKey[] {
  return summary.channels.filter((c) => c.highlight).map((c) => c.key);
}
