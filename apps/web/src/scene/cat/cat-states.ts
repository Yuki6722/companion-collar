/**
 * 猫的两种**演示状态**参数。
 *
 * ⚠️ 边界（务必与代码一起读）：这两个状态是**作者编写的动画档位**，由用户手动切换，
 * 不是系统对猫感受、情绪或健康状态的识别或推断。本项目不做情绪识别，
 * 也不把状态差异当作临床依据（不构成诊断）。UI 必须原样展示 `BOUNDARY_NOTE`。
 *
 * 参数取值依据可观察的外部表现（姿态、耳位、尾频、瞳孔、呼吸节奏、动作幅度），
 * 刻意不做「内部状态」建模——那种建模既不可证伪，也不是本项目的交付面。
 */

export type CatStateId = 'calm' | 'agitated';

/**
 * 姿势词汇（与 `@camp/core` 的 `CatPosture` 逐字一致）。
 *
 * ⚠️ 刻意不 import core 的这个类型：`cat-states.ts` 是纯渲染参数表，
 * 让它能脱离 core 单独阅读。下面的 `CAT_BASE_POSES` 的单测会断言两边覆盖同一组取值。
 */
export type CatPosture = 'lying' | 'sitting' | 'standing' | 'crouching' | 'walking' | 'climbing';

export const BOUNDARY_NOTE =
  '手动演示状态：以下两种姿态与动画由你选择，不是系统对猫的感受、情绪或健康状况的推断，也不构成任何诊断。';

export interface CatPoseParams {
  /**
   * 躯干中心的**绝对离地高度**（米）。站立约 0.215；趴卧约 0.115（腹部贴地）。
   * 用它而不是「抬升量」，是为了让两种状态的贴地程度可以直接比较。
   */
  bodyLift: number;
  /** 躯干俯仰：正值为前低后高 */
  bodyPitch: number;
  /** 背部拱起程度 */
  arch: number;
  /** 头部俯仰 */
  headPitch: number;
  /** 头部左右扫视幅度（弧度） */
  headYawAmp: number;
  /** 头部扫视频率（次/秒） */
  headYawFreq: number;
  /** 耳朵后压程度：0 前立，1 完全压平 */
  earFlatten: number;
  /** 耳朵抽动幅度 */
  earTwitchAmp: number;
  /** 眼睛开启程度：0.35 半闭，1 全开 */
  eyeOpen: number;
  /** 眨眼间隔（秒）；0 表示几乎不眨 */
  blinkIntervalS: number;
  /** 瞳孔缩放：1 为默认竖裂，>1 放大 */
  pupilScale: number;
  /** 尾根摆动幅度（弧度） */
  tailAmp: number;
  /** 尾摆频率（次/秒） */
  tailFreq: number;
  /** 尾尖上卷程度 */
  tailCurl: number;
  /** 呼吸幅度（躯干缩放的相对量） */
  breathAmp: number;
  /** 呼吸节奏（次/秒） */
  breathFreq: number;
  /** 换重心幅度（米） */
  weightShiftAmp: number;
  /** 换重心频率（次/秒） */
  weightShiftFreq: number;
  /** 腿部收拢程度：1 完全收拢，0.4 支撑站立 */
  legFold: number;
  /** 前爪踩奶（平静时的小动作） */
  knead: boolean;
  /**
   * 低头进食/饮水的幅度（米）。0 表示不做。
   *
   * 为什么需要它：进食与饮水在渲染上就是「蹲下」，与「蹲伏观察」几乎看不出区别，
   * 只有头部上下起伏才读得出「在吃/在喝」。数值是操作化常量，不是文献数字。
   */
  headBobAmp?: number;
  /** 低头起伏频率（次/秒） */
  headBobFreq?: number;
}

export interface CatStateDef {
  id: CatStateId;
  label: string;
  /** 一句话说明「看什么」——只描述外部表现 */
  hint: string;
  pose: CatPoseParams;
}

export const CAT_STATES: Readonly<Record<CatStateId, CatStateDef>> = {
  calm: {
    id: 'calm',
    label: '平静舒适',
    hint: '趴在猫爬架顶台：耳朵前立、尾巴小幅慢摆、半闭眼、呼吸慢而深',
    pose: {
      bodyLift: 0.115,
      bodyPitch: 0.02,
      arch: 0,
      headPitch: 0.06,
      headYawAmp: 0.1,
      headYawFreq: 0.09,
      earFlatten: 0,
      earTwitchAmp: 0.05,
      eyeOpen: 0.45,
      blinkIntervalS: 5,
      pupilScale: 0.85,
      tailAmp: 0.1,
      tailFreq: 0.4,
      tailCurl: 0.4,
      breathAmp: 0.028,
      breathFreq: 0.42,
      weightShiftAmp: 0.004,
      weightShiftFreq: 0.05,
      legFold: 1.05,
      knead: true,
    },
  },
  agitated: {
    id: 'agitated',
    label: '激动不适',
    hint: '贴地蹲伏、面朝入户方向：耳朵后压、尾巴高频大幅拍打、瞳孔放大、呼吸快而浅',
    pose: {
      bodyLift: 0.15,
      bodyPitch: 0.1,
      arch: 0.16,
      headPitch: -0.1,
      headYawAmp: 0.42,
      headYawFreq: 1.5,
      earFlatten: 1,
      earTwitchAmp: 0.02,
      eyeOpen: 1,
      blinkIntervalS: 0,
      pupilScale: 1.4,
      tailAmp: 0.5,
      tailFreq: 2.4,
      tailCurl: 0.05,
      breathAmp: 0.07,
      breathFreq: 1.05,
      weightShiftAmp: 0.03,
      weightShiftFreq: 1.1,
      legFold: 0.82,
      knead: false,
    },
  },
};

/** 状态切换的参数混合时长（秒）。可被中途打断：反向切换时从当前混合值继续。 */
export const TRANSITION_S = 0.8;

/** 切换到「激动不适」时的惊起过冲强度与衰减时间常数。 */
export const STARTLE_STRENGTH = 1;
export const STARTLE_DECAY_S = 0.28;

/**
 * 六个**姿势基准**：自主行为（行为时间线）用它作为姿势参数，
 * 再由 `locomotion` 的位移与步态相位叠加出连续观感。
 *
 * 与 `CAT_STATES` 的关系（务必分清，否则会把两套东西搞混）：
 *   - `CAT_STATES` 是**手动演示档位**（平静舒适 / 激动不适），由用户点击切换，
 *     自检与文档截图依赖它，语义上是「两套完整状态」；
 *   - `CAT_BASE_POSES` 是**姿势词汇**（趴卧/坐/站立/蹲伏/行走/攀跳），
 *     由 `@camp/core` 的行为时间线驱动，语义上是「身体摆成什么形状」。
 * 两者共用同一组参数，但**不互相替代**。
 *
 * ⚠️ 边界：这些参数只描述**外部可观察的姿态**，不代表猫的感受或健康状况。
 */
export const CAT_BASE_POSES: Readonly<Record<CatPosture, CatPoseParams>> = {
  /** 趴卧：腹部贴地、四肢完全收拢 */
  lying: {
    bodyLift: 0.115,
    bodyPitch: 0.02,
    arch: 0,
    headPitch: 0.06,
    headYawAmp: 0.1,
    headYawFreq: 0.09,
    earFlatten: 0,
    earTwitchAmp: 0.05,
    eyeOpen: 0.5,
    blinkIntervalS: 5,
    pupilScale: 0.85,
    tailAmp: 0.1,
    tailFreq: 0.4,
    tailCurl: 0.4,
    breathAmp: 0.028,
    breathFreq: 0.42,
    weightShiftAmp: 0.004,
    weightShiftFreq: 0.05,
    legFold: 1.05,
    knead: false,
  },
  /** 坐：后躯着地、前肢支撑、腿部半收 */
  sitting: {
    bodyLift: 0.16,
    bodyPitch: 0,
    arch: 0.02,
    headPitch: 0.04,
    headYawAmp: 0.16,
    headYawFreq: 0.16,
    earFlatten: 0,
    earTwitchAmp: 0.06,
    eyeOpen: 0.7,
    blinkIntervalS: 4,
    pupilScale: 0.9,
    tailAmp: 0.14,
    tailFreq: 0.5,
    tailCurl: 0.25,
    breathAmp: 0.03,
    breathFreq: 0.5,
    weightShiftAmp: 0.006,
    weightShiftFreq: 0.12,
    legFold: 0.72,
    knead: false,
  },
  /** 站立：四爪着地、腿伸展 */
  standing: {
    bodyLift: 0.215,
    bodyPitch: 0,
    arch: 0,
    headPitch: 0.02,
    headYawAmp: 0.2,
    headYawFreq: 0.2,
    earFlatten: 0,
    earTwitchAmp: 0.07,
    eyeOpen: 0.8,
    blinkIntervalS: 4,
    pupilScale: 0.9,
    tailAmp: 0.16,
    tailFreq: 0.6,
    tailCurl: 0.1,
    breathAmp: 0.03,
    breathFreq: 0.55,
    weightShiftAmp: 0.008,
    weightShiftFreq: 0.2,
    legFold: 0.42,
    knead: false,
  },
  /** 蹲伏：身体压低、四肢半收、头略抬（观察姿态） */
  crouching: {
    bodyLift: 0.15,
    bodyPitch: 0.06,
    arch: 0.1,
    headPitch: -0.02,
    headYawAmp: 0.26,
    headYawFreq: 0.5,
    earFlatten: 0.15,
    earTwitchAmp: 0.05,
    eyeOpen: 0.9,
    blinkIntervalS: 3,
    pupilScale: 1,
    tailAmp: 0.2,
    tailFreq: 0.8,
    tailCurl: 0.05,
    breathAmp: 0.034,
    breathFreq: 0.7,
    weightShiftAmp: 0.01,
    weightShiftFreq: 0.4,
    legFold: 0.7,
    knead: false,
  },
  /** 行走：腿伸展、头部随行进轻微晃动 */
  walking: {
    bodyLift: 0.205,
    bodyPitch: 0.01,
    arch: 0,
    headPitch: 0.02,
    headYawAmp: 0.14,
    headYawFreq: 0.6,
    earFlatten: 0,
    earTwitchAmp: 0.06,
    eyeOpen: 0.85,
    blinkIntervalS: 4,
    pupilScale: 0.95,
    tailAmp: 0.22,
    tailFreq: 0.9,
    tailCurl: 0,
    breathAmp: 0.032,
    breathFreq: 0.75,
    weightShiftAmp: 0.006,
    weightShiftFreq: 1.4,
    legFold: 0.4,
    knead: false,
  },
  /** 攀跳：蹬地起跳、前肢先向前再收拢 */
  climbing: {
    bodyLift: 0.24,
    bodyPitch: 0.14,
    arch: -0.06,
    headPitch: -0.04,
    headYawAmp: 0.08,
    headYawFreq: 0.4,
    earFlatten: 0.1,
    earTwitchAmp: 0.03,
    eyeOpen: 1,
    blinkIntervalS: 2.5,
    pupilScale: 1.1,
    tailAmp: 0.3,
    tailFreq: 1.2,
    tailCurl: 0,
    breathAmp: 0.04,
    breathFreq: 0.95,
    weightShiftAmp: 0.004,
    weightShiftFreq: 0.6,
    legFold: 0.35,
    knead: false,
  },
};

/** 姿势词汇的中文名；UI 直接显示。 */
export const POSTURE_LABELS: Readonly<Record<CatPosture, string>> = {
  lying: '趴卧',
  sitting: '坐',
  standing: '站立',
  crouching: '蹲伏',
  walking: '行走',
  climbing: '攀跳',
};

/**
 * 「在做事」的头部动作配方：让进食、饮水、用猫砂盆三件事**在画面上可分**。
 *
 * 为什么不能只靠姿势区分：三者的姿势都是《蹲伏》。没有头部与躯干的小幅度差异，
 * 用户在演示里看到的永远是「猫蹲着」——这也正是「看不到喝水/吃粮/用砂盆」的原因之一。
 * 数值是操作化常量，不是文献数字。
 *
 * ⚠️ 边界：这些只是**动作幅度**，不表示猫在表达什么。
 */
export const ACTIVITY_MOTION: Readonly<
  Record<string, { headBobAmp: number; headBobFreq: number; tailFreq: number; weightShiftFreq: number }>
> = {
  // 进食：低头咬取，头部有节奏地小幅上下
  feeding: { headBobAmp: 0.026, headBobFreq: 2.2, tailFreq: 0.8, weightShiftFreq: 0.5 },
  // 饮水：低头更久更低，舌部动作更快、幅度更小
  drinking: { headBobAmp: 0.014, headBobFreq: 4.2, tailFreq: 0.5, weightShiftFreq: 0.3 },
  // 用砂盆：刨砂与蹲下的前后重心移动较明显
  eliminating: { headBobAmp: 0.018, headBobFreq: 1.2, tailFreq: 0.4, weightShiftFreq: 1.1 },
};
