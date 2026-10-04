/**
 * 柴犬骨架的**接口契约**（只有类型，没有几何）。
 *
 * 为什么把接口单独放一个文件：
 *   模型（`dog-model.ts`）与动画控制器（`dog-controller.ts`）是两个独立的大件，
 *   而它们之间唯一的耦合面就是这个 `DogRig`。把接口先定下来，两边可以各自推进，
 *   且任何一方漏配关节都会在 `pnpm typecheck` 当场暴露 —— 而不是等到画面上看不出问题、
 *   却怎么调都不对。
 *
 * 命名与朝向约定（与 `scene/util.ts` 的 `facing()` 一致）：
 *   **狗的朝向为 +Z**（头在 +Z、尾在 -Z），因此 `rotY = 0` 表示面朝 +Z。
 *   运行时把世界位置与朝向写到 `root` 上，姿态写到 `body` 及其子节点上 —— 两层分工明确，
 *   姿态动画永远不会污染世界变换（这是「倒着走」这类故障的常见来源）。
 */
import type * as THREE from 'three';

/** 一条腿。`hip → knee → paw` 是三级链，绕各自 X 轴摆动即可做出迈步与收腿。 */
export interface DogLeg {
  /** 肩关节 / 髋关节：绕 X 轴摆动 = 前后摆腿 */
  hip: THREE.Group;
  /** 大腿（后腿）/ 上臂（前腿） */
  upper: THREE.Mesh;
  /** 膝关节：绕 X 轴摆动 = 收放小腿 */
  knee: THREE.Group;
  /** 小腿（后腿）/ 前臂（前腿） */
  lower: THREE.Mesh;
  /** 爪 */
  paw: THREE.Mesh;
}

/** 腿的四个位置；键名即前后左右，动画按对角对耦合（小跑）或前后对耦合（奔跑）。 */
export interface DogLegs {
  frontL: DogLeg;
  frontR: DogLeg;
  hindL: DogLeg;
  hindR: DogLeg;
}

export interface DogRig {
  /** 世界变换层：位置 + 朝向。**只有运行时可以写它。** */
  root: THREE.Group;
  /** 姿态层：起伏 / 俯仰 / 侧倾 / 呼吸。所有姿势动画写这一层及其子节点。 */
  body: THREE.Group;
  /** 腰椎：弓背、坐下、伸展时弯折的位置（子节点是 chest / hips） */
  spine: THREE.Group;
  /** 胸腔（前躯） */
  chest: THREE.Mesh;
  /** 腰胯（后躯） */
  hips: THREE.Mesh;
  /** 颈根：抬头 / 低头的中继 */
  neck: THREE.Group;
  /** 头 */
  head: THREE.Group;
  /** 吻部（柴犬的短吻与饱满脸颊靠它 + cheek） */
  muzzle: THREE.Mesh;
  /** 左右脸颊（柴犬的"棉花糖"感主要来自这两块） */
  cheekL: THREE.Mesh;
  cheekR: THREE.Mesh;
  /** 鼻头 */
  nose: THREE.Mesh;
  /** 下颌：张嘴 / 喘气 / 呕吐时的干呕动作 */
  jaw: THREE.Group;
  /** 舌头：喘气与舔食时可见 */
  tongue: THREE.Mesh;
  eyeL: THREE.Mesh;
  eyeR: THREE.Mesh;
  pupilL: THREE.Mesh;
  pupilR: THREE.Mesh;
  /** 眉点（柴犬的浅色眉斑，是"表情"读得出来的关键） */
  browL: THREE.Mesh;
  browR: THREE.Mesh;
  /** 立耳：绕 Z 轴压平 / 绕 X 轴前倾 */
  earL: THREE.Group;
  earR: THREE.Group;
  /** 尾根：卷尾的整体朝向（上翘 / 夹尾） */
  tailRoot: THREE.Group;
  /** 卷曲的尾巴，5 段，从尾根到尖端 */
  tail: THREE.Group[];
  legs: DogLegs;
  /** 呼吸用的可缩放网格（胸 / 腹） */
  breathParts: THREE.Object3D[];
  /**
   * 毛壳层（低画质档整体隐藏的那些）。
   *
   * 与猫版同一条理由：写实轮廓靠"逐层放大 + alphaTest 切边"的软边壳来柔化，
   * 但它是纯装饰，画质档要能整体关掉。每个壳的 `userData.furLayer` 记录层号。
   */
  furShells: THREE.Object3D[];
  /**
   * 项圈（本项目的产品形态）：带体 + 电子仓 + 电极 + 摄像头。
   * 与猫版一样挂在 `body` 上而不是呼吸件上 —— 项圈不会随呼吸一起变形。
   */
  collar: THREE.Group;
}

/** 柴犬的体尺（米），供控制器与自检共用：肩高、体长、头高。 */
export interface DogMetrics {
  /** 肩高（前肢到肩胛顶） */
  shoulderHeightM: number;
  /** 体长（肩端到尾根，不含尾） */
  bodyLengthM: number;
  /** 站姿时头顶离地高度 */
  headTopY: number;
  /** 站姿时躯干中心离地高度 */
  bodyCenterY: number;
}
