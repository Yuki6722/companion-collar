/**
 * 猫的状态控制器：参数混合、可打断切换、位置过渡与惊起过冲。
 *
 * 为什么要有「可打断」：用户随时可能连点两下切换按钮。若实现成「过渡期间忽略输入」，
 * 手一快就会点不动；若实现成「直接跳到目标姿势」，画面会突跳。这里的做法是
 * **从当前混合值继续**——任何时刻切换都从眼下的姿态出发，姿势连续。
 */
import { CAT_ANCHORS } from '../layout.ts';
import type { CatRig } from './cat-model.ts';
import { CAT_STATES, STARTLE_DECAY_S, STARTLE_STRENGTH, TRANSITION_S } from './cat-states.ts';
import type { CatPoseParams, CatStateId } from './cat-states.ts';

interface Transform {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

const POSE_KEYS = Object.keys(CAT_STATES.calm.pose) as (keyof CatPoseParams)[];

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
   * 立即切到某状态，**不做过渡**。
   *
   * 两个用途：① 首屏直接以某状态开场（用户不该看到猫从别处「飘」过来）；
   * ② 文档截图与自动化验证——过渡依赖渲染帧推进，而无头环境可能只渲染很少几帧。
   */
  snapTo(id: CatStateId): void {
    this.target = id;
    this.transitionStartMs = null;
    this.fromPose = { ...CAT_STATES[id].pose };
    this.fromTransform = { ...CAT_ANCHORS[id] };
    this.startle = 0;
    this.applyTransform(this.fromTransform, 1);
    this.applyPose(this.fromPose, 0);
    for (const fn of this.listeners) fn(id);
  }

  update(dt: number): void {
    const step = Math.min(dt, 0.1);
    this.time += step;
    if (this.transitionStartMs !== null && this.blendNow() >= 1) this.transitionStartMs = null;
    if (this.startle > 0) {
      this.startle *= Math.exp(-step / STARTLE_DECAY_S);
      if (this.startle < 0.01) this.startle = 0;
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

  private applyTransform(t: Transform, k: number): void {
    const rig = this.rig;
    rig.root.position.set(t.x, t.y, t.z);
    rig.root.rotation.y = t.rotY;
    // 落地/起跳时轻微压缩，增强重量感（过渡中段不做，避免和弧线打架）
    const squash = 1 - 0.06 * Math.sin(Math.PI * Math.min(1, k * 1.4));
    rig.root.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
  }

  private applyPose(pose: CatPoseParams, dt: number): void {
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

    // 躯干
    rig.body.position.y = bodyLift + micro(Math.sin(omega(pose.weightShiftFreq)) * pose.weightShiftAmp * 0.35);
    rig.body.position.x = micro(Math.sin(omega(pose.weightShiftFreq)) * pose.weightShiftAmp);
    rig.body.rotation.x = pose.bodyPitch - 0.08 * s;
    rig.body.rotation.z = micro(Math.sin(omega(pose.weightShiftFreq * 0.7)) * 0.02);

    // 拱背：胸部与臀部沿相反方向微转，配合躯干压低读起来像弓背
    rig.chest.rotation.x = -pose.arch * 0.6;
    rig.hips.rotation.x = pose.arch * 0.5;

    // 呼吸：整组轻微起伏（幅度很小，不会让毛壳穿出躯干）
    const breath = micro(Math.sin(omega(pose.breathFreq)) * pose.breathAmp, 0);
    rig.body.scale.set(1 + breath * 0.35, 1 + breath, 1 + breath * 0.45);

    // 头：俯仰 + 左右扫视
    rig.head.rotation.x = pose.headPitch + micro(Math.sin(omega(0.35)) * 0.02);
    rig.head.rotation.y = micro(Math.sin(omega(pose.headYawFreq)) * pose.headYawAmp);
    rig.head.rotation.z = micro(Math.sin(omega(pose.headYawFreq * 0.6)) * pose.headYawAmp * 0.12);

    // 耳朵：后压 + 抽动
    const twitch = micro(Math.sin(omega(6.5)) * pose.earTwitchAmp);
    rig.earL.rotation.x = earFlatten * 1.3 + twitch;
    rig.earR.rotation.x = earFlatten * 1.3 - twitch * 0.7;
    rig.earL.rotation.z = earFlatten * 0.25;
    rig.earR.rotation.z = -earFlatten * 0.25;

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

    // 腿：收拢程度 + 平静时的踩奶。
    // 趴卧/蹲伏时除了向后折，还要**缩短**——只旋转的话短腿会像木棍一样支棱在身体两侧，
    // 近距离看非常像玩具。缩到一半配合收腿，腿就藏进身体轮廓里了。
    const fold = pose.legFold;
    const knead = pose.knead && !still ? Math.sin(omega(1.6)) * 0.09 : 0;
    for (const [i, leg] of rig.legs.entries()) {
      const hind = i >= 2;
      const base = hind ? -fold * 1.0 : fold * 1.1;
      const pump = !hind ? knead : 0;
      leg.rotation.x = base + pump;
      leg.rotation.z = (i % 2 === 0 ? 1 : -1) * fold * 0.16;
      const shrink = 1 - Math.min(0.55, fold * 0.5);
      leg.scale.set(1 - fold * 0.12, shrink, 1 - fold * 0.12);
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
  const out = {} as Record<keyof CatPoseParams, number | boolean>;
  for (const key of POSE_KEYS) {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'boolean' || typeof bv === 'boolean') {
      // 布尔项（踩奶）按进度过半切换
      out[key] = k < 0.5 ? av : bv;
    } else {
      out[key] = lerp(av as number, bv as number, k);
    }
  }
  return out as unknown as CatPoseParams;
}

/** 便于外部（自检）读取锚点。 */
export const CAT_ANCHOR_TABLE = CAT_ANCHORS;

export type { CatPoseParams, CatStateId };
