/**
 * 读数层：把「设备报了什么」与「这次报的值能不能用」分开。
 *
 * 三条纪律：
 *   1. **无效读数不是数据。** `validVitals()` 是算法侧唯一的入口；坏值只用于展示原因。
 *   2. **条件必须随读数一起流动。** 不写条件的读数，下游一定会拿它去和别的条件比。
 *   3. **拒答是合法结论。** 呼吸读数在体动窗口没有可用值时，正确输出是「本窗口无可用读数」，
 *      而不是给一个数。
 */
import type {
  MeasurementCondition,
  ReadingQuality,
  ReadingValidity,
  Sample,
  VitalKey,
} from '../types.ts';
import { vitalsConstantValue } from './params.ts';

export const VITAL_KEYS: readonly VitalKey[] = ['hr', 'rr', 'temp'];

/** 读数有效性 → 面向用户的原因说明。刻意只描述**测量过程**，不描述猫的状态。 */
export const VALIDITY_LABELS: Readonly<Record<ReadingValidity, string>> = {
  valid: '本窗口读数可用',
  'motion-artifact': '体动伪迹：本窗口读数不可用',
  'poor-contact': '接触不良：探头未贴稳，本窗口读数不可用',
  'rejected-out-of-range': '超出量程：固件已拒收本次读数',
};

/** 测量条件 → 面向用户的说明。 */
export const CONDITION_LABELS: Readonly<Record<MeasurementCondition, string>> = {
  sleep: '睡眠',
  resting: '静息',
  active: '活动',
  'post-event': '突发动作之后',
  clinic: '诊室环境',
};

export const VITAL_LABELS: Readonly<Record<VitalKey, string>> = {
  hr: '心率',
  rr: '呼吸频率',
  temp: '体表温',
};

export const VITAL_UNITS: Readonly<Record<VitalKey, string>> = {
  hr: '次/分',
  rr: '次/分',
  temp: '°C',
};

/** 每个通道对应的读数数值字段。放在一处，避免各处各写一遍 switch。 */
function rawValueOf(sample: Sample, key: VitalKey): number | undefined {
  switch (key) {
    case 'hr':
      return sample.hrBpm;
    case 'rr':
      return sample.rrBpm;
    case 'temp':
      return sample.tempSurfaceC;
    default:
      return undefined;
  }
}

/** 该采样点该通道的读数质量（未登记视为缺失）。 */
export function qualityOf(sample: Sample, key: VitalKey): ReadingQuality | null {
  return sample.readingQuality?.[key] ?? null;
}

/**
 * 取**可用**读数。
 *
 * `validity !== 'valid'` 或质量未登记时返回 null——这是「无效读数不是数据」的执行点。
 * 注意：即使无效窗口里存在数值字段（真机上设备确实会吐数），这里也不返回它。
 */
export function readingOf(sample: Sample, key: VitalKey): number | null {
  const q = qualityOf(sample, key);
  if (!q || q.validity !== 'valid') return null;
  const v = rawValueOf(sample, key);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 取原始读数（含无效窗口），**仅供展示"坏值 + 原因"**，不得用于分析。 */
export function rawReadingOf(sample: Sample, key: VitalKey): number | null {
  const v = rawValueOf(sample, key);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 测量条件。未登记时按 `resting` 处理，并在可用性报告里记为缺失。 */
export function conditionOf(sample: Sample): MeasurementCondition {
  return sample.measurementCondition ?? 'resting';
}

export interface ChannelAvailability {
  key: VitalKey;
  label: string;
  /** 有读数的窗口占比（分母是全部采样点） */
  reportedShare: number;
  /** 可用窗口占比。这才是"一天里有多少时间真的测到了" */
  validShare: number;
  totalWindows: number;
  validWindows: number;
  /** 各失效原因的次数 */
  reasons: Partial<Record<ReadingValidity, number>>;
}

export interface VitalsAvailability {
  channels: Record<VitalKey, ChannelAvailability>;
  /** 各测量条件的采样点数 */
  conditions: Partial<Record<MeasurementCondition, number>>;
  /** 有效读数占比最低的通道——界面用它来说明"哪个通道最受限" */
  mostLimited: VitalKey | null;
}

/**
 * 可用性报告：三个通道各自有多少窗口是**可用**的。
 *
 * 为什么这是本阶段最重要的一张表：它把"能测"与"能用"的差距变成一个数字。
 * 项圈呼吸频率在体动门限下大概率只有一两成窗口可用，而这个比例本身就是结论。
 */
export function summarizeAvailability(samples: readonly Sample[]): VitalsAvailability {
  const conditions: Partial<Record<MeasurementCondition, number>> = {};
  for (const s of samples) {
    const c = conditionOf(s);
    conditions[c] = (conditions[c] ?? 0) + 1;
  }

  const channels = {} as Record<VitalKey, ChannelAvailability>;
  for (const key of VITAL_KEYS) {
    const reasons: Partial<Record<ReadingValidity, number>> = {};
    let reported = 0;
    let valid = 0;
    for (const s of samples) {
      const raw = rawValueOf(s, key);
      if (typeof raw === 'number' && Number.isFinite(raw)) reported++;
      const q = qualityOf(s, key);
      if (q) reasons[q.validity] = (reasons[q.validity] ?? 0) + 1;
      if (readingOf(s, key) !== null) valid++;
    }
    const total = samples.length;
    channels[key] = {
      key,
      label: VITAL_LABELS[key],
      reportedShare: total > 0 ? reported / total : 0,
      validShare: total > 0 ? valid / total : 0,
      totalWindows: total,
      validWindows: valid,
      reasons,
    };
  }

  let mostLimited: VitalKey | null = null;
  for (const key of VITAL_KEYS) {
    const ch = channels[key];
    if (ch.validWindows === 0) continue;
    if (mostLimited === null || ch.validShare < channels[mostLimited].validShare) mostLimited = key;
  }

  return { channels, conditions, mostLimited };
}

/** 过滤出某通道可用的采样点（含条件过滤）。算法层的唯一入口。 */
export function validVitals(
  samples: readonly Sample[],
  key: VitalKey,
  condition?: MeasurementCondition,
): Sample[] {
  return samples.filter(
    (s) =>
      readingOf(s, key) !== null &&
      (condition === undefined || conditionOf(s) === condition),
  );
}

/** 运动指数门限（操作化常量），供仿真与界面共用同一条口径。 */
export function motionGate(key: VitalKey): number {
  switch (key) {
    case 'hr':
      return vitalsConstantValue('hrMotionGate', 0.6);
    case 'rr':
      return vitalsConstantValue('rrMotionGate', 0.25);
    case 'temp':
      return vitalsConstantValue('tempContactGate', 0.5);
    default:
      return 1;
  }
}

/** 读数聚合窗口（秒）。 */
export function aggregationWindowS(): number {
  return vitalsConstantValue('aggregationWindowS', 60);
}

/**
 * 常驻边界句：任何展示读数的位置都必须原样展示。
 * 与 `behavior/vocabulary.ts` 的 `INCIDENT_BOUNDARY_NOTE` 是同一纪律的两处实例。
 */
export const VITALS_BOUNDARY_NOTE =
  '本页展示的是仿真得到的项圈读数与读数有效性，不是对猫身体状态的判断，也不构成兽医诊断。单次读数不能说明任何问题；任何持续异常或任何疑似急症，请直接联系执业兽医，不要等待本页给出结论。';

/**
 * 仿真声明：本阶段一切读数都是仿真产物。
 *
 * ⚠️ 这一句不是客套：项圈的心率、呼吸频率、体表温在猫上**都没有验证研究**，
 * 因此本页的性能数字只说明"算法与仿真自洽"，不说明任何真实准确度。
 */
export const VITALS_SIM_NOTE =
  '仿真声明：本页数据由仿真器生成，用于验证算法链路是否自洽。项圈的心率、呼吸频率与体表温在猫上均未取得验证研究，因此本页的任何数字都不代表真实设备的准确度，也不能作为临场判断依据。';
