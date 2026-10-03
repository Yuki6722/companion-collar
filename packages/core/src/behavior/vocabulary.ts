/**
 * 猫行为词汇表：行为状态、姿势、突发动作的**单一事实来源**。
 *
 * 为什么把词汇单独放一层：
 *   行为模型有三条互相独立的轴（姿势 / 行为状态 / 位置锚点），突发动作是叠加在它们之上
 *   的第四层。三轴 + 突发的取值必须由渲染层、仿真层、文档共用同一份定义，否则
 *   「行为引擎说的是 `perching`、画面画的是 `sitting`」这类漂移会到处冒。
 *
 * ⚠️ 边界（务必与代码一起读）：
 *   本文件只描述**外部可观察的动作与姿势**。它刻意**没有**任何情绪、感受、疾病或疼痛的
 *   取值——不是遗漏，是设计。`CatIncidentKind` 的五个取值全部是**动作名**（抽搐、呼吸急促、
 *   僵直不动、躲藏退避、干呕），不是诊断名。关联不等于因果，更不等于诊断。
 */

/** 姿势：猫此刻身体在摆什么形状。 */
export type CatPosture =
  | 'lying'
  | 'sitting'
  | 'standing'
  | 'crouching'
  | 'walking'
  | 'climbing';

/** 行为状态：猫此刻在做什么。 */
export type CatActivityId =
  | 'resting'
  | 'alert'
  | 'grooming'
  | 'locomoting'
  | 'playing'
  | 'feeding'
  | 'drinking'
  | 'eliminating'
  | 'scratching'
  | 'hiding'
  | 'perching'
  | 'vomit';

/**
 * 突发演示动作。
 *
 * 为什么全部是动作名：文献里记录的是一批**可观察变化**与某些状况**同时出现**，
 * 没有任何一项是特异的（见 `docs/research/06-cat-acute-observables.md`）。
 * 因此本项目只演示动作本身，不命名任何状况。UI 必须原样展示 `INCIDENT_BOUNDARY_NOTE`。
 */
export type CatIncidentKind =
  | 'seizure'
  | 'labored-breathing'
  | 'freezing'
  | 'withdrawal'
  | 'vomit';

/**
 * 锚点能力。刻意用字符串联合而不是 `HomeResourceKind`：
 *   行为层只关心「能不能跳上去」「是不是躲藏点」，不关心那是猫爬架还是壁挂跳台。
 * 声明位置在词汇层（而不是 `contract.ts`），因为 `ACTIVITY_DEFS` 与 `INCIDENT_DEFS`
 * 都要引用它；这样依赖方向是 `contract → vocabulary` 的单向引用，不会成环。
 */
export type CatAnchorCapability =
  | 'floor'
  | 'jump-target'
  | 'hide'
  | 'food'
  | 'water'
  | 'litter'
  | 'vertical'
  | 'sleep';

export interface ActivityDef {
  id: CatActivityId;
  /** 面向用户的中文名——只描述外部可观察量 */
  label: string;
  /** 一句话说明「看什么」 */
  hint: string;
  /** 该行为的默认姿势 */
  posture: CatPosture;
  /**
   * true = 需要移动到指定的资源锚点才会发生（吃、喝、排泄、躲藏）。
   * false = 原地发生（理毛、抓挠、玩耍、高处停留、休息），不产生位移。
   */
  requiresAnchor: boolean;
  /**
   * 该行为把猫带到哪类锚点。空数组表示原地发生。
   */
  anchorCapability: readonly CatAnchorCapability[];
}

export const ACTIVITY_DEFS: Readonly<Record<CatActivityId, ActivityDef>> = {
  resting: {
    id: 'resting',
    label: '休息',
    hint: '卧下、肌肉放松、呼吸平稳，只在换姿势时移动',
    posture: 'lying',
    requiresAnchor: false,
    anchorCapability: [],
  },
  alert: {
    id: 'alert',
    label: '静坐观察',
    hint: '坐姿、头抬起、视线缓慢扫过房间',
    posture: 'sitting',
    requiresAnchor: false,
    anchorCapability: [],
  },
  grooming: {
    id: 'grooming',
    label: '理毛',
    hint: '低头舔舐前肢与胸腹，身体偶有侧倾',
    posture: 'sitting',
    requiresAnchor: false,
    anchorCapability: [],
  },
  locomoting: {
    id: 'locomoting',
    label: '移动',
    hint: '从一处走到或跳到另一处',
    posture: 'walking',
    requiresAnchor: false,
    anchorCapability: [],
  },
  playing: {
    id: 'playing',
    label: '玩耍',
    hint: '短促扑击、侧身前扑、对物件挥爪',
    posture: 'standing',
    requiresAnchor: false,
    anchorCapability: [],
  },
  feeding: {
    id: 'feeding',
    label: '进食',
    hint: '低头在食盆前咬取，头部有节奏起伏',
    posture: 'crouching',
    requiresAnchor: true,
    anchorCapability: ['food'],
  },
  drinking: {
    id: 'drinking',
    label: '饮水',
    hint: '低头靠近水碗，舌部快速卷动',
    posture: 'crouching',
    requiresAnchor: true,
    anchorCapability: ['water'],
  },
  eliminating: {
    id: 'eliminating',
    label: '使用猫砂盆',
    hint: '进入砂盆、刨砂、蹲下，随后掩埋',
    posture: 'crouching',
    requiresAnchor: true,
    anchorCapability: ['litter'],
  },
  scratching: {
    id: 'scratching',
    label: '抓挠',
    hint: '前肢交替刮擦竖向或平放的抓挠面，身体伸展',
    posture: 'standing',
    requiresAnchor: false,
    anchorCapability: [],
  },
  hiding: {
    id: 'hiding',
    label: '躲藏',
    hint: '进入封闭躲藏点后不再出现在开阔处',
    posture: 'lying',
    requiresAnchor: true,
    anchorCapability: ['hide'],
  },
  perching: {
    id: 'perching',
    label: '高处停留',
    hint: '停在高处台面，前肢收拢、头部跟随移动物',
    posture: 'lying',
    requiresAnchor: true,
    // 只取 'vertical'：`sleep` 能力同时标在**地面**猫窝上，
    // 若一并作为候选，「高处停留」会落到地面的猫窝，与行为语义矛盾。
    // 高处的可跳上能力已由 'vertical' 表达。
    anchorCapability: ['vertical'],
  },
  vomit: {
    id: 'vomit',
    label: '干呕',
    hint: '前低后高的「祈祷」姿态、腹部反复起伏，随后舔唇',
    posture: 'crouching',
    requiresAnchor: false,
    anchorCapability: [],
  },
};

/** 便于遍历的稳定顺序（不依赖对象键顺序）。 */
export const ACTIVITY_IDS: readonly CatActivityId[] = [
  'resting',
  'alert',
  'grooming',
  'locomoting',
  'playing',
  'feeding',
  'drinking',
  'eliminating',
  'scratching',
  'hiding',
  'perching',
  'vomit',
];

export const POSTURE_DEFS: Readonly<Record<CatPosture, { label: string; hint: string }>> = {
  lying: { label: '趴卧', hint: '腹部贴地、四肢收拢' },
  sitting: { label: '坐', hint: '后躯着地、前肢支撑' },
  standing: { label: '站立', hint: '四爪着地、腿部伸展' },
  crouching: { label: '蹲伏', hint: '身体压低、四肢半收拢' },
  walking: { label: '行走', hint: '四爪交替着地、躯干有起伏' },
  climbing: { label: '攀跳', hint: '蹬地起跳、四肢先向前再收拢' },
};

export interface IncidentDef {
  kind: CatIncidentKind;
  /** 只描述动作，不描述原因 */
  label: string;
  hint: string;
  /** 覆盖期间使用的姿势 */
  posture: CatPosture;
  /**
   * 演示时长（秒）。真实时长见 `BEHAVIOR_PARAMS` 的同名注记；
   * 演示刻意压缩，避免演示时长时间看不到变化。
   */
  demoDurationS: number;
  /** 触发后强制移动到哪类锚点；null 表示原地 */
  anchorCapability: CatAnchorCapability | null;
}

export const INCIDENT_DEFS: Readonly<Record<CatIncidentKind, IncidentDef>> = {
  seizure: {
    kind: 'seizure',
    label: '抽搐',
    hint: '倒卧、全身与四肢高频抖动，瞳孔放大，呼吸节律被打乱',
    posture: 'lying',
    demoDurationS: 15,
    anchorCapability: null,
  },
  'labored-breathing': {
    kind: 'labored-breathing',
    label: '呼吸急促',
    hint: '蹲伏不动、头部前伸、呼吸幅度与频率明显升高',
    posture: 'crouching',
    demoDurationS: 60,
    anchorCapability: null,
  },
  freezing: {
    kind: 'freezing',
    label: '僵直不动',
    hint: '长时间完全不移动（仅保留眨眼与呼吸）、弓背、头低垂、耳后压',
    posture: 'crouching',
    demoDurationS: 60,
    anchorCapability: null,
  },
  withdrawal: {
    kind: 'withdrawal',
    label: '躲藏退避',
    hint: '迅速移动到躲藏点、随后不再出现在开阔处',
    posture: 'lying',
    demoDurationS: 90,
    anchorCapability: 'hide',
  },
  vomit: {
    kind: 'vomit',
    label: '干呕',
    hint: '前低后高的「祈祷」姿态、腹部反复起伏，随后舔唇',
    posture: 'crouching',
    demoDurationS: 30,
    anchorCapability: null,
  },
};

export const INCIDENT_KINDS: readonly CatIncidentKind[] = [
  'seizure',
  'labored-breathing',
  'freezing',
  'withdrawal',
  'vomit',
];

/**
 * 常驻边界句。UI 必须原样展示，不得改写成「识别」「检出」这类措辞。
 * 与 `cat-states.ts` 的 `BOUNDARY_NOTE` 是同一纪律的两处实例。
 */
export const INCIDENT_BOUNDARY_NOTE =
  '突发演示：以上是你手动触发的动画演示，不是系统对猫的感受、情绪或身体状况的识别，也不构成任何诊断。若你的猫真的出现类似表现，请录像并联系兽医。';

/** 转诊路径（固定文案）。来源见 docs/research/06 的急诊红旗清单。 */
export const INCIDENT_REFERRAL_NOTE =
  '以下情形在权威兽医资料中列为需要尽快就诊：张口呼吸或呼吸费力、公猫反复蹲砂盆却排不出尿、反复呕吐、食欲下降持续三天以上。请录像并联系兽医，不要等待。';
