/**
 * 猫的状态控制器：参数混合、可打断切换、位置过渡与惊起过冲。
 *
 * 为什么要有「可打断」：用户随时可能连点两下切换按钮。若实现成「过渡期间忽略输入」，
 * 手一快就会点不动；若实现成「直接跳到目标姿势」，画面会突跳。这里的做法是
 * **从当前混合值继续**——任何时刻切换都从眼下的姿态出发，姿势连续。
 */
import { CAT_ANCHORS } from '../layout.ts';
import type { CatRig } from './cat-model.ts';
import { CAT_BASE_POSES, CAT_STATES, STARTLE_DECAY_S, STARTLE_STRENGTH, TRANSITION_S } from './cat-states.ts';
import type { CatPoseParams, CatPosture, CatStateId } from './cat-states.ts';
import type { IncidentMotion } from '@camp/core';

interface Transform {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

const POSE_KEYS = Object.keys(CAT_STATES.calm.pose) as (keyof CatPoseParams)[];

/**
 * 头的基准高度（相对躯干）。
 *
 * 与 `cat-model.ts` 里 `head.position.set(0, 0.05, 0.285)` 的 y 必须一致：
 * 低头起伏是相对这个基准做偏移，写错会让猫的头整体上移或陷进躯干。
 */
const HEAD_BASE_Y = 0.05;

/**
 * 呼吸幅度上限（米）。
 *
 * 躯干半径只有约 0.1 m、体长仅约 0.3 m。呼吸幅度取大一点「更明显」，
 * 但一旦超过这个量级，读起来就不是「急促呼吸」而是**猫在膨胀**，毛壳也会穿出躯干。
 * 这是**视觉安全线**，不是生理参数——突发配方再大也越不过它。
 */
const MAX_BREATH_AMP = 0.05;

/**
 * 驱动模式。
 *
 * 为什么必须显式区分：两种模式的**位置来源根本不同**——
 *   - `manual`：位置由 `CAT_ANCHORS` 的两套演示档位插值（第一阶段的行为，保持不变）；
 *   - `external`：位置由行为运行时按 wall clock 给出（自主行为）。
 * 若不区分，`update()` 会用手动路径的插值覆盖行为路径算出的位置，
 * 现象就是「猫换好了姿势但一直在原地」。
 */
export type CatDriveMode = 'manual' | 'external';

export interface CatControllerOptions {
  /** 系统开启「减少动态效果」时，关闭一切高频微动作，只保留状态姿态差异 */
  reducedMotion?: boolean;
}

export class CatController {
  readonly rig: CatRig;
  private target: CatStateId;
  private fromPose: CatPoseParams;
  private fromTransform: Transform;
  /** 过渡起点（wall clock，毫秒）；null 表示不在过渡中 */
  private transitionStartMs: number | null = null;
  private startle = 0;
  private time = 0;
  private blinkTimer = 0;
  private blinkPhase = 1;
  private reducedMotion: boolean;
  private listeners: Array<(id: CatStateId) => void> = [];
  /** 驱动模式：手动演示档位 / 行为运行时给出的外部变换 */
  private mode: CatDriveMode = 'manual';
  /** 外部模式下的姿势基准（由行为时间线给出） */
  private externalPose: CatPoseParams = { ...CAT_STATES.calm.pose };
  /** 当前突发演示的身体动作；null 表示不在突发中 */
  private incidentMotion: IncidentMotion | null = null;
  /** 外部模式的朝向，用于手动↔自主切换时保持朝向连续 */
  private externalRotY = 0;

  constructor(rig: CatRig, opts: CatControllerOptions = {}) {
    this.rig = rig;
    this.reducedMotion = opts.reducedMotion ?? false;
    this.target = 'calm';
    this.fromPose = { ...CAT_STATES.calm.pose };
    this.fromTransform = { ...CAT_ANCHORS.calm };
    this.applyTransform(CAT_ANCHORS.calm, 0);
    this.applyPose({ ...CAT_STATES.calm.pose }, 0);
  }

  getState(): CatStateId {
    return this.target;
  }

  getMode(): CatDriveMode {
    return this.mode;
  }

  /**
   * 当前**显示中**的参数快照。
   *
   * 刻意由 wall clock 推导而不是「上一帧算出来的值」：状态推进不该依赖渲染帧率
   * （页面隐藏、后台标签都会被降帧）。这样自检、测试与首帧都能拿到正确值。
   */
  getCurrentPose(): CatPoseParams {
    return lerpPose(this.fromPose, CAT_STATES[this.target].pose, easeOutCubic(this.blendNow()));
  }

  onStateChange(fn: (id: CatStateId) => void): void {
    this.listeners.push(fn);
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
  }

  setState(next: CatStateId): void {
    if (next === this.target && this.transitionStartMs === null) return;
    // 从当前姿态与当前位置继续，保证切换永远连续（可打断）
    this.fromPose = this.getCurrentPose();
    this.fromTransform = {
      x: this.rig.root.position.x,
      y: this.rig.root.position.y,
      z: this.rig.root.position.z,
      rotY: this.rig.root.rotation.y,
    };
    this.target = next;
    this.transitionStartMs = now();
    if (next === 'agitated' && !this.reducedMotion) {
      this.startle = STARTLE_STRENGTH;
    }
    for (const fn of this.listeners) fn(next);
  }

  /**
   * 外部（行为运行时）给出的变换与姿势。
   *
   * 语义：位置与朝向**完全**由调用方给出；本方法只负责把它落到 rig 上，
   * 并叠加呼吸/眨眼/尾摆等微动作。切换进外部模式时立刻生效，不做过渡——
   * 调用方（`CatBehaviorRuntime`）已经算好了连续轨迹。
   */
  setExternalTransform(t: Transform, gaitPhase: number): void {
    this.mode = 'external';
    this.externalRotY = t.rotY;
    this.applyTransform(t, 1, gaitPhase);
  }

  /**
   * 按行为时间线给出的姿势重建参数基准。
   *
   * `immediate` 为 true 时不做混合，直接采用——行为区间切换是离散的，
   * 而姿势由 `locomotion` 的位移连续性负责观感，不需要额外的 0.8 s 过渡。
   */
  snapPoseFor(posture: CatPosture, immediate = false): void {
    const base = CAT_BASE_POSES[posture] ?? CAT_BASE_POSES.standing;
    // 叠加「在做事」的头部动作配方（只有进食/饮水/用砂盆有）。
    // 注意：本次调用带 `activity` 时用活动配方覆盖姿势基准，避免上一种行为的头部动作残留。
    this.externalPose = { ...base };
    if (immediate) this.fromPose = { ...this.externalPose };
  }

  /**
   * 设置当前「在做什么」用于头部动作。
   *
   * 与 `snapPoseFor` 分开是为了让姿势切换（离散）与行为配方（可叠加）互不干扰：
   * 姿势决定四肢与躯干，配方只补头部/尾部的小幅差异。
   */
  setActivityMotion(recipe: { headBobAmp: number; headBobFreq: number; tailFreq: number; weightShiftFreq: number } | null): void {
    const base = { ...this.externalPose };
    if (!recipe) {
      this.externalPose = base;
      return;
    }
    this.externalPose = {
      ...base,
      headBobAmp: recipe.headBobAmp,
      headBobFreq: recipe.headBobFreq,
      tailFreq: recipe.tailFreq,
      weightShiftFreq: recipe.weightShiftFreq,
      // 进食/饮水时尾巴基本不摆：大幅摆尾会让画面读起来像「不耐烦」而不是「在吃」
      tailAmp: Math.min(base.tailAmp, 0.05),
      headPitch: base.headPitch + 0.14,
    };
  }

  /**
   * 设置突发演示的身体动作。
   *
   * **这是「突发点了没反应」的修复点**：在它之前，突发只把活动换成 `resting`/`hiding`、
   * 姿势换成普通趴卧/蹲伏，于是「抽搐」在画面上就是**一只趴着不动的猫**——
   * 标签写着「抽搐」而身体毫无变化。现在突发必须在姿态之外给出一套身体动作。
   *
   * 传 `null` 即清除（回到普通行为）。
   */
  setIncidentMotion(motion: IncidentMotion | null): void {
    this.incidentMotion = motion ? { ...motion } : null;
  }

  /** 回到手动演示档位：从当前姿态与位置继续，保证不跳变。 */
  useManualMode(): void {
    if (this.mode === 'manual') return;
    this.fromPose = { ...this.externalPose };
    this.fromTransform = {
      x: this.rig.root.position.x,
      y: this.rig.root.position.y,
      z: this.rig.root.position.z,
      rotY: this.externalRotY,
    };
    this.target = 'calm';
    this.transitionStartMs = now();
    this.mode = 'manual';
  }

  /**
   * 立即切到某状态，**不做过渡**。
   *
   * 两个用途：① 首屏直接以某状态开场（用户不该看到猫从别处「飘」过来）；
   * ② 文档截图与自动化验证——过渡依赖渲染帧推进，而无头环境可能只渲染很少几帧。
   */
  snapTo(id: CatStateId): void {
    this.mode = 'manual';
    this.target = id;
    this.transitionStartMs = null;
    this.fromPose = { ...CAT_STATES[id].pose };
    this.fromTransform = { ...CAT_ANCHORS[id] };
    this.startle = 0;
    this.applyTransform(this.fromTransform, 1);
    this.applyPose(this.fromPose, 0);
    for (const fn of this.listeners) fn(id);
  }

  update(dt: number, gaitPhase = 0): void {
    const step = Math.min(dt, 0.1);
    this.time += step;
    if (this.transitionStartMs !== null && this.blendNow() >= 1) this.transitionStartMs = null;
    if (this.startle > 0) {
      this.startle *= Math.exp(-step / STARTLE_DECAY_S);
      if (this.startle < 0.01) this.startle = 0;
    }

    if (this.mode === 'external') {
      // 位置/朝向已由 `setExternalTransform` 落好；这里推进姿态与微动作即可。
      // 必须**跳过**手动的 `applyTransform`，否则会把行为算出的位置覆盖掉。
      this.applyPose(this.externalPose, step, gaitPhase);
      return;
    }

    const k = easeOutCubic(this.blendNow());
    this.applyTransform(this.getCurrentTransform(), k);
    this.applyPose(this.getCurrentPose(), step);
  }

  /**
   * 当前应处的变换。
   *
   * 与姿态一样由 wall clock 推导（不是「上一帧算出来的位置」）：位置与姿态的推进都不该依赖渲染帧。
   * 好处有二：后台标签页被降帧时状态不会卡住；自检与测试能在没有帧的情况下断言位置。
   */
  getCurrentTransform(): Transform {
    const k = easeOutCubic(this.blendNow());
    const to = CAT_ANCHORS[this.target];
    // 位置过渡：高度差或水平距离较大时走一段弧线，读起来像「跳下来/跳上去」而不是滑行
    const flatDist = Math.hypot(to.x - this.fromTransform.x, to.z - this.fromTransform.z);
    const dy = Math.abs(to.y - this.fromTransform.y);
    const arc = Math.max(0.12, Math.min(0.55, flatDist * 0.25 + dy * 0.2)) * Math.sin(Math.PI * k);
    return {
      x: lerp(this.fromTransform.x, to.x, k),
      y: lerp(this.fromTransform.y, to.y, k) + arc,
      z: lerp(this.fromTransform.z, to.z, k),
      rotY: lerpAngle(this.fromTransform.rotY, to.rotY, k),
    };
  }

  private blendNow(): number {
    if (this.transitionStartMs === null) return 1;
    const elapsed = (now() - this.transitionStartMs) / 1000;
    return elapsed <= 0 ? 0 : elapsed >= TRANSITION_S ? 1 : elapsed / TRANSITION_S;
  }

  private applyTransform(t: Transform, k: number, gaitPhase = 0): void {
    const rig = this.rig;
    rig.root.position.set(t.x, t.y, t.z);
    rig.root.rotation.y = t.rotY;
    // 落地/起跳时轻微压缩，增强重量感（过渡中段不做，避免和弧线打架）
    const squash = 1 - 0.06 * Math.sin(Math.PI * Math.min(1, k * 1.4));
    // 行走时的躯干起伏：一次步幅一个周期。纯视觉量，不参与行为推进。
    const bob = gaitPhase > 0 ? Math.abs(Math.sin(gaitPhase * Math.PI * 2)) * 0.012 : 0;
    rig.root.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    rig.body.position.y += bob;
  }

  private applyPose(pose: CatPoseParams, dt: number, gaitPhase = 0): void {
    const rig = this.rig;
    const t = this.time;
    const omega = (freq: number): number => t * freq * Math.PI * 2;
    const still = this.reducedMotion;
    const micro = (value: number, fallback = 0): number => (still ? fallback : value);

    // 惊起过冲：一次性叠加在耳位、瞳孔、尾幅与贴地程度上
    const s = this.startle;
    const earFlatten = clamp01(pose.earFlatten + 0.3 * s);
    const pupil = pose.pupilScale + 0.3 * s;
    const tailAmp = pose.tailAmp + 0.18 * s;
    const bodyLift = pose.bodyLift - 0.02 * s;

    // ---------------- 突发演示的身体动作 ----------------
    //
    // 这一段是「点了突发没反应」的修复点。此前突发只换姿势，于是「抽搐」＝趴着不动的猫；
    // 现在突发必须真的产生身体动作。三个通道：
    //   ① 高频抖动（tremor）——抽搐的主要表现，直接叠加在躯干位置与旋转上
    //   ② 四肢抽动（limbJitter）——与抖动同频，但相位错开，避免四肢整齐划一（那样像机械）
    //   ③ 僵直（rigidity）——freezing 靠它区别于「放松趴着」：静止本身是没有动作的，
    //      只能通过身体被拉平、四肢绷直来表达
    const inc = this.incidentMotion;
    const tremorAmp = inc ? inc.tremorAmp : 0;
    const tremorFreq = inc ? inc.tremorFreq : 0;
    const tremor = inc && !still ? Math.sin(omega(tremorFreq)) * tremorAmp : 0;
    // 次级抖动用更高频、相位错开，避免读成单一正弦（那样像在「摇」而不是「抽」）
    const tremor2 = inc && !still ? Math.sin(omega(tremorFreq * 1.7) + 1.3) * tremorAmp * 0.5 : 0;
    const twist = inc && !still ? Math.sin(omega(tremorFreq * 0.6) + 0.7) * inc.bodyTwist : 0;
    const limbJitter = inc && !still ? Math.sin(omega(tremorFreq * 1.35) + 2.1) * inc.limbJitter : 0;
    // 呼吸的幅度与频率也由突发改写：呼吸急促就是靠这一条读出来的。
    // ⚠️ 必须有上限：躯干半径只有约 0.1 m，`breathAmp` 一旦超过 0.05 m 就会把躯干
    // 缩放成肉眼可见的「膨胀」（毛壳也会跟着穿出去）。突发配方再加也越不过这道线。
    const breathAmp = Math.max(
      0,
      Math.min(MAX_BREATH_AMP, pose.breathAmp + (inc ? inc.breathAmpAdd : 0)),
    );
    const breathFreq = pose.breathFreq * (inc ? inc.breathFreqScale : 1);
    const rigidity = inc ? inc.rigidity : 0;
    const incEar = inc ? inc.earFlatten : 0;

    // 躯干
    rig.body.position.y =
      bodyLift - rigidity * 0.035 + tremor + micro(Math.sin(omega(pose.weightShiftFreq)) * pose.weightShiftAmp * 0.35);
    rig.body.position.x = tremor2 + micro(Math.sin(omega(pose.weightShiftFreq)) * pose.weightShiftAmp);
    rig.body.rotation.x = pose.bodyPitch - 0.08 * s - rigidity * 0.06;
    rig.body.rotation.z = twist + micro(Math.sin(omega(pose.weightShiftFreq * 0.7)) * 0.02);

    // 拱背：胸部与臀部沿相反方向微转，配合躯干压低读起来像弓背
    rig.chest.rotation.x = -pose.arch * 0.6;
    rig.hips.rotation.x = pose.arch * 0.5;

    // 呼吸：整组轻微起伏（幅度很小，不会让毛壳穿出躯干）。
    // 幅度与频率都取自**可能被突发改写过的**值——「呼吸急促」这个突发就是靠这一条读出来的。
    const breath = micro(Math.sin(omega(breathFreq)) * breathAmp, 0);
    rig.body.scale.set(1 + breath * 0.35, 1 + breath, 1 + breath * 0.45);

    // 头：俯仰 + 左右扫视 + 「在做事」的低头起伏。
    // 进食/饮水/用砂盆三者的姿势都是蹲伏，只有头部动作能把它们区分开——
    // 没有这一项，演示里看到的永远是「猫蹲着」（这正是「看不到喝水/吃粮/用砂盆」的原因之一）。
    const bobAmp = pose.headBobAmp ?? 0;
    const bobFreq = pose.headBobFreq ?? 0;
    const headBob = bobAmp > 0 && !still ? Math.sin(omega(bobFreq)) * bobAmp : 0;
    // 突发期间头也跟着抖：抽搐的读法很大程度来自头部，只有躯干在动会显得像「身体在震」
    const headTremor = inc && !still ? Math.sin(omega(tremorFreq * 1.25)) * tremorAmp * 0.8 : 0;
    rig.head.rotation.x = pose.headPitch + headBob * 1.6 + headTremor * 3 - rigidity * 0.12 + micro(Math.sin(omega(0.35)) * 0.02);
    rig.head.rotation.y = headTremor * 2 + micro(Math.sin(omega(pose.headYawFreq)) * pose.headYawAmp);
    rig.head.rotation.z = micro(Math.sin(omega(pose.headYawFreq * 0.6)) * pose.headYawAmp * 0.12);
    // 头部整体也随之下沉一点，读起来像「低头去够食盆」而不只是「点头」
    rig.head.position.y = HEAD_BASE_Y + headBob + headTremor;

    // 耳朵：后压 + 抽动 + 突发带来的额外后压
    const twitch = micro(Math.sin(omega(6.5)) * pose.earTwitchAmp);
    const ears = clamp01(earFlatten + incEar);
    rig.earL.rotation.x = ears * 1.3 + twitch;
    rig.earR.rotation.x = ears * 1.3 - twitch * 0.7;
    rig.earL.rotation.z = ears * 0.25;
    rig.earR.rotation.z = -ears * 0.25;

    // 眨眼：interval 为 0 时几乎不眨（激动时眼睛睁大）
    if (pose.blinkIntervalS > 0 && !still) {
      this.blinkTimer += dt;
      if (this.blinkTimer >= pose.blinkIntervalS) {
        this.blinkTimer = 0;
        this.blinkPhase = 0;
      }
      if (this.blinkPhase < 1) this.blinkPhase = Math.min(1, this.blinkPhase + dt / 0.18);
    } else {
      this.blinkPhase = 1;
    }
    const blink = this.blinkPhase < 0.5 ? this.blinkPhase * 2 : (1 - this.blinkPhase) * 2;
    const lid = Math.max(0.08, pose.eyeOpen * (1 - blink * 0.9));
    for (const eye of [rig.eyeL, rig.eyeR]) {
      eye.scale.set(1, lid, 1);
    }
    // 瞳孔：竖裂 → 放大
    const px = 0.28 + (pupil - 0.85) * 0.8;
    for (const pupilMesh of [rig.pupilL, rig.pupilR]) {
      pupilMesh.scale.set(Math.max(0.16, Math.min(0.9, px)), 1, 0.5);
      pupilMesh.visible = lid > 0.25;
    }

    // 尾巴：振幅沿尾尖放大，形成甩动；静止时保留一段自然下垂
    for (const [i, seg] of rig.tail.entries()) {
      const r = i / (rig.tail.length - 1);
      const wave = micro(Math.sin(omega(pose.tailFreq) - i * 0.55) * tailAmp * (0.3 + 0.9 * r));
      seg.rotation.y = wave;
      seg.rotation.x = -pose.tailCurl * 0.3 * (1 - r) - 0.09 - 0.05 * r;
      seg.rotation.z = micro(Math.sin(omega(pose.tailFreq * 0.5) - i * 0.4) * tailAmp * 0.25 * r);
    }

    // 腿：收拢程度 + 平静时的踩奶 + 行走时的迈步。
    // 趴卧/蹲伏时除了向后折，还要**缩短**——只旋转的话短腿会像木棍一样支棱在身体两侧，
    // 近距离看非常像玩具。缩到一半配合收腿，腿就藏进身体轮廓里了。
    //
    // 迈步：对角腿同相（前左与后右、前右与后左），这是四足动物小跑的相位关系，
    // 比四条腿同相（读起来像蹦）自然得多。相位由行为运行时按步态累积给出。
    const fold = pose.legFold;
    const knead = pose.knead && !still ? Math.sin(omega(1.6)) * 0.09 : 0;
    const stepping = gaitPhase > 0 && !still;
    for (const [i, leg] of rig.legs.entries()) {
      const hind = i >= 2;
      const base = hind ? -fold * 1.0 : fold * 1.1;
      const pump = !hind ? knead : 0;
      // 对角相位：前左(1)/后右(2) 一组，前右(0)/后左(3) 另一组
      const diagonal = i === 0 || i === 3 ? 0 : Math.PI;
      const stepSwing = stepping ? Math.sin(gaitPhase * Math.PI * 2 + diagonal) * 0.22 : 0;
      // 突发期间四肢抽动：每条腿的相位错开，否则四条腿整齐划一会读成「机械」
      const legJitter = inc && !still ? Math.sin(omega(tremorFreq * 1.35) + i * 1.9) * limbJitter : 0;
      // 僵直：四肢被绷直、腿形拉长，与「放松收腿」有明显轮廓差
      const rigidFold = fold * (1 - rigidity * 0.9);
      leg.rotation.x = base + pump + stepSwing + legJitter - rigidity * 0.5;
      leg.rotation.z = (i % 2 === 0 ? 1 : -1) * fold * 0.16 + legJitter * 0.3;
      const shrink = 1 - Math.min(0.55, rigidFold * 0.5);
      leg.scale.set(1 - rigidFold * 0.12, shrink + rigidity * 0.25, 1 - rigidFold * 0.12);
    }
  }
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/** 允许在无 window 的环境（如构建期静态检查）下退化到 0。 */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

function lerpAngle(a: number, b: number, k: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * k;
}

function easeOutCubic(k: number): number {
  return 1 - Math.pow(1 - k, 3);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerpPose(a: CatPoseParams, b: CatPoseParams, k: number): CatPoseParams {
  const out = {} as Record<keyof CatPoseParams, number | boolean | undefined>;
  for (const key of POSE_KEYS) {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'boolean' || typeof bv === 'boolean') {
      // 布尔项（踩奶）按进度过半切换
      out[key] = k < 0.5 ? av : bv;
    } else if (av === undefined && bv === undefined) {
      // 可选的动作配方字段（headBobAmp 等）：两边都没有就不写入，
      // 让 `?? 0` 的兜底逻辑继续生效，而不是被插值成 0。
      continue;
    } else {
      out[key] = lerp(av ?? 0, bv ?? 0, k);
    }
  }
  return out as unknown as CatPoseParams;
}

/** 便于外部（自检）读取锚点。 */
export const CAT_ANCHOR_TABLE = CAT_ANCHORS;

export type { CatPoseParams, CatStateId };
