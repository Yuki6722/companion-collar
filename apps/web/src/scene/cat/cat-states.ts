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
