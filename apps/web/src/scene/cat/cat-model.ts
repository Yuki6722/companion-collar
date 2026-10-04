/** Shared semantic controls. Visible geometry is a continuous, weighted feline mesh. */
import * as THREE from 'three';
import type { MaterialLibrary } from '../materials.ts';
import { createRealisticCat } from './cat-realistic.ts';

export interface CatAnimationInput {
  posture: string;
  gaitPhase: number;
  activity?: string;
  reducedMotion?: boolean;
  incident?: Record<string, number> | null;
  /** Studio only: show a walk cycle without moving through the room. */
  previewWalk?: boolean;
}

export interface CatRig {
  root: THREE.Group;
  ready?: Promise<void>;
  animate?: (dt: number, input: CatAnimationInput) => void;
  dispose?: () => void;
  debugInfo?: () => Record<string, unknown>;
  /** 躯干容器：承载 bodyLift / 拱背 / 换重心 */
  body: THREE.Group;
  torso: THREE.Mesh;
  chest: THREE.Mesh;
  hips: THREE.Mesh;
  head: THREE.Group;
  earL: THREE.Group;
  earR: THREE.Group;
  pupilL: THREE.Mesh;
  pupilR: THREE.Mesh;
  eyeL: THREE.Mesh;
  eyeR: THREE.Mesh;
  nose: THREE.Mesh;
  /** 尾巴 6 段，从尾根到尾尖 */
  tail: THREE.Group[];
  /** 四条腿：前左、前右、后左、后右 */
  legs: THREE.Group[];
  /** 呼吸用的可缩放网格（躯干 + 胸 + 臀） */
  breathParts: THREE.Object3D[];
  /** 毛壳层，便于画质切换时整体显隐 */
  furShells: THREE.Object3D[];
  /**
   * 项圈硬件（第三阶段的可视化）：带体、电子仓、ECG 电极、体表热敏电阻。
   *
   * 为什么把它做进模型而不是只在文档里画示意图：三个通道的**选型位置**决定了它们
   * 各自能测到什么、测不到什么。把电极放在颈侧、把热敏电阻放在颈腹侧，
   * 看的人一眼就能明白为什么"核心温"不在这个位置上。
   */
  collar: THREE.Group;
  /**
   * 触须无干涉区：面部触须是独立感觉器官，任何佩戴硬件都不许进入这个体积。
   *
   * 它默认隐藏（只在讲解/截图时打开），因为它是一个**约束标注**，不是外观。
   */
  whiskerZone: THREE.Group;
  /**
   * 项圈相机的机位锚点（世界变换由场景每帧读取）。
   *
   * 为什么要有它：项圈前端那颗摄像头**拍到的画面**是产品的一部分
   * （App 的「实时」页就是它）。把机位做成 rig 里的一个空节点，
   * 就自然跟着猫的身体与朝向走，不需要在场景里再算一遍三角函数。
   */
  povAnchor: THREE.Object3D;
}

export function buildCat(_mats: MaterialLibrary, _furLayers: number): CatRig {
  return createRealisticCat('bengal');
}
