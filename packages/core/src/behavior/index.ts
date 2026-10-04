/**
 * `@camp/core` 行为层：猫的行为词汇、证据参数登记表、节律、调度与时间线引擎。
 *
 * 这一层刻意**不含任何 three.js 与房间坐标**：
 *   - 行为规则要能脱开浏览器单测（`packages/core/test/behavior.test.ts`）；
 *   - 房间坐标的权威来源是 `apps/web/src/scene/layout.ts`（它同时驱动 3D 摆放与资源清单），
 *     再加一份坐标必然漂移。
 * 因此这里只产出「语义 + 时间」，由 `apps/web` 翻译成位置与姿态参数。
 *
 * 导出刻意**逐项列出**而不是 `export *`：`schedule.ts` 里的加权细节与 `params.ts` 里的
 * `isDisputed` 之类属于内部实现，暴露出去会让公共 API 面变宽且易与既有导出重名。
 */

// 词汇：行为、姿势、突发动作、事件名
export {
  ACTIVITY_DEFS,
  ACTIVITY_IDS,
  INCIDENT_BOUNDARY_NOTE,
  INCIDENT_DEFS,
  INCIDENT_KINDS,
  INCIDENT_REFERRAL_NOTE,
  POSTURE_DEFS,
  SIM_EVENT_LABELS,
  simEventLabel,
} from './vocabulary.ts';
export type {
  ActivityDef,
  CatActivityId,
  CatIncidentKind,
  CatPosture,
  IncidentDef,
  IncidentMotion,
} from './vocabulary.ts';

// 参数登记表与操作化常量
export {
  BEHAVIOR_PARAMS,
  OPERATIVE_CONSTANTS,
  behaviorParam,
  behaviorParamNumber,
  behaviorParamRange,
  behaviorParamText,
  behaviorParamValue,
  behaviorParamsByTier,
} from './params.ts';
export type { BehaviorParam, OperativeConstant } from './params.ts';

// 节律
export { OWNER_ACTIVE_HOURS, RHYTHM_DEFS, activityWeightAt, isOwnerAwayHour } from './rhythm.ts';
export type { RhythmDef } from './rhythm.ts';

// 契约
export { CAT_ANCHOR_IDS, CAT_ANCHOR_LABELS, DAY_START_HOUR, hourOfDayAt } from './contract.ts';
export type {
  CatAnchorCapability,
  CatAnchorSpec,
  CatBehaviorIncident,
  CatBehaviorIncidentRequest,
  CatBehaviorInput,
  CatBehaviorSegment,
  CatBehaviorTimeline,
} from './contract.ts';

// 引擎
export {
  BEHAVIOR_STRIDE_S,
  activityAt,
  activityShare,
  buildBehaviorTimeline,
  incidentAt,
  tendencyAt,
} from './engine.ts';

// 狗的行为层（词汇、节律、时间线）。
// 与猫层并列而不是合并：仓库纪律是「共用机制、分开参数」——机制（确定性采样、
// 连续覆盖、突发覆盖层）在两边形状一致，但权重与硬约束各一套，混用等于两套参数漂移。
export {
  DOG_ACTIVITY_DEFS,
  DOG_ACTIVITY_IDS,
  DOG_ANCHOR_IDS,
  DOG_ANCHOR_LABELS,
  DOG_BEHAVIOR_STRIDE_S,
  DOG_INCIDENT_BOUNDARY_NOTE,
  DOG_INCIDENT_DEFS,
  DOG_INCIDENT_KINDS,
  DOG_INCIDENT_REFERRAL_NOTE,
  DOG_POSTURE_LABELS,
  buildDogTimeline,
  chooseDogActivity,
  dogActivityAt,
  dogActivityShare,
  dogActivityWeightAt,
  dogActivityWeights,
  dogIncidentAt,
  dogNightFactor,
  dogTendencyAt,
} from './dog.ts';
export type {
  DogActivityDef,
  DogActivityId,
  DogAnchorCapability,
  DogAnchorSpec,
  DogBehaviorIncident,
  DogBehaviorIncidentRequest,
  DogBehaviorInput,
  DogBehaviorSegment,
  DogBehaviorTimeline,
  DogIncidentDef,
  DogIncidentKind,
  DogIncidentPhase,
  DogPosture,
} from './dog.ts';
