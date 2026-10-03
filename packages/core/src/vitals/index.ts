/**
 * `@camp/core` 生理读数层：证据登记表、读数有效性、分层基线、同条件漂移、睡眠呼吸频率。
 *
 * 导出刻意**逐项列出**而不是 `export *`（与 `behavior/index.ts` 同一纪律）：
 * 本层与 `baseline.ts` / `drift.ts` 同处一个包，且 `core/index.ts` 对二者都用 `export *`，
 * 一旦重名就会触发 TS2308。因此这里只导出前缀明确、不会撞名的符号。
 *
 * ⚠️ 本层**刻意不提供**任何「体表温 → 核心温」的换算函数：
 *   已核实的事实是耳廓红外温与直肠温**无相关**（Kendall τ ≈ −0.01），
 *   任何换算都是伪精度。这不是遗漏，是设计；单测会守卫公共 API 里不出现这类符号。
 */

// 证据登记表与操作化常量
export {
  VITALS_CONSTANTS,
  VITALS_PARAMS,
  isVitalsDisputed,
  vitalsConstant,
  vitalsConstantValue,
  vitalsParam,
  vitalsParamNumber,
  vitalsParamRange,
  vitalsParamText,
  vitalsParamValue,
  vitalsParamsByTier,
} from './params.ts';
export type { VitalsConstant, VitalsParam } from './params.ts';

// 读数与有效性
export {
  CONDITION_LABELS,
  VALIDITY_LABELS,
  VITAL_KEYS,
  VITAL_LABELS,
  VITAL_UNITS,
  VITALS_BOUNDARY_NOTE,
  VITALS_SIM_NOTE,
  aggregationWindowS,
  conditionOf,
  motionGate,
  qualityOf,
  rawReadingOf,
  readingOf,
  summarizeAvailability,
  validVitals,
} from './readings.ts';
export type { ChannelAvailability, VitalsAvailability } from './readings.ts';

// 分层基线
export { describeVitalsBaseline, vitalsBaselineOf } from './baseline.ts';
export type { VitalsBaseline, VitalsBaselineOptions } from './baseline.ts';

// 同条件漂移
export { conditionLabel, describeVitalsDrift, detectVitalsDrift } from './drift.ts';
export type { VitalsDriftInput, VitalsDriftResult, VitalsWindow } from './drift.ts';

// 睡眠呼吸频率
export { SLEEP_RR_QUESTIONS, sleepRespRateSummary } from './sleeprr.ts';
export type { SleepBout, SleepRespRateSummary } from './sleeprr.ts';

// 读数变化提示（App 的数字变红与提醒弹窗）
export {
  VITAL_ALERT_REFERRAL,
  VITAL_ALERT_SUBTITLE,
  VITAL_ALERT_TITLE,
  evaluateVitalAlerts,
  highlightedChannels,
  highestAlertLevel,
} from './alerts.ts';
export type {
  VitalAlertInput,
  VitalAlertLevel,
  VitalAlertSummary,
  VitalChannelAlert,
} from './alerts.ts';
