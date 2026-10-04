/**
 * 位移推进：把行为时间线里的「走到某个锚点」变成逐帧位置。
 *
 * 两条纪律（与第一阶段同源）：
 *   1. **推进由 wall clock 推导，不依赖渲染帧**。后台标签被降帧、或无头环境只渲染几帧时，
 *      猫仍然停在正确位置——否则自检会读到「还在原地」而误判行为层没生效。
 *   2. **一次位移由时间线的区间长度定死**。`locomoting` 区间的 `durS` 就是这段位移的时长，
 *      因此画面与数据的时序一致；不会出现「数据说走了 5 秒、画面滑了 20 秒」。
 */
import { OPERATIVE_CONSTANTS } from '@camp/core';
import type { CatAnchorPlace } from './anchor-map.ts';

function constantValue(id: string, fallback: number): number {
  return OPERATIVE_CONSTANTS.find((c) => c.id === id)?.value ?? fallback;
}

export interface CatTransform {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

/** 一次位移的描述。 */
export interface TravelPlan {
  from: CatTransform;
  to: CatTransform;
  /** 位移总时长（秒），来自时间线的区间长度 */
  durationS: number;
  /** 起跳弧线的额外高度（米）。0 表示贴地走 */
  arcHeight: number;
}

function shortestAngleDelta(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/** 平滑插值：起步与停止稍缓，读起来不像匀速滑行。 */
function easeInOut(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/**
 * 从某锚点走向另一锚点。
 *
 * **为什么位移时长要单独算，而不是直接采用时间线给的那一段时长**：
 *   演示倍率（1 秒当 N 秒）会把时间线的时长整体压缩。在 60× 下，一次移动的时间线时长
 *   折算到真实时间只有 0.3–3 秒，肉眼读起来就是**瞬移**。
 *   若把位移动画也绑到时间线时长上，「看清走路」与「一场演示看完一天」这两个目标
 *   会直接冲突：要么猫瞬移，要么一天永远走不完。
 *   做法是**把两者解耦**——位移只花「自己走得完」的时间，到得早就地站着等下一段。
 *   猫既不加速跑，也不瞬移；时间线仍按倍率推进自己的节律。
 *
 * ⚠️ 这里**不能**用「时间线片段时长 × 倍数」去做动画时长：时间线里存在很长的移动段
 * （例如一次长距离巡逻），乘完会得到上百秒的「慢动作走路」，比瞬移更糟。
 * 因此上限必须由真实几何封顶（`maxTravelAnimS`）。
 */
export function planTravel(from: CatTransform, to: CatAnchorPlace, durationS: number): TravelPlan {
  const target: CatTransform = {
    x: to.position.x,
    y: to.heightM,
    z: to.position.z,
    rotY: to.facing,
  };
  const dy = Math.abs(target.y - from.y);
  const jumpGate = constantValue('jumpMinHeightM', 0.15);
  const climbing = dy > jumpGate;
  // 攀跳的弧顶取高度差的一部分：太高会读成「飞」，太低则看不出跳
  const arcHeight = climbing ? Math.min(0.55, 0.25 + dy * 0.35) : 0;

  // 按真实步速算需要多久；攀跳额外给一点蹬地与落地的时间
  const walkSpeed = constantValue('walkSpeedMps', 0.45);
  const flat = Math.hypot(target.x - from.x, target.z - from.z);
  const naturalS = flat / walkSpeed + (climbing ? 0.9 : 0.25) + 0.35;
  const cap = constantValue('maxTravelAnimS', 12);
  // 用 `durationS` 只是为了在片段极短时别把动画压到读不出来；
  // 真正的上限由真实几何封顶，绝不让长片段把走路拖成慢动作。
  void durationS;

  return {
    from: { ...from },
    to: target,
    durationS: Math.max(0.9, Math.min(naturalS, cap)),
    arcHeight,
  };
}

/** 由真实几何估算走得用多久；只用于「时间线没给时长」的兜底。 */
export function estimateTravelS(from: CatTransform, to: CatAnchorPlace): number {
  const speed = constantValue('walkSpeedMps', 0.45);
  const flat = Math.hypot(to.position.x - from.x, to.position.z - from.z);
  const dy = Math.abs(to.heightM - from.y);
  const jumpGate = constantValue('jumpMinHeightM', 0.15);
  return (flat / speed) * (dy > jumpGate ? 1.6 : 1) + 0.4;
}

/**
 * 求位移过程中的变换。
 *
 * @param elapsedS 从位移开始起算的秒数（wall clock 推导）
 */
export function travelAt(plan: TravelPlan, elapsedS: number): CatTransform {
  const k = Math.min(1, Math.max(0, elapsedS / plan.durationS));
  const e = easeInOut(k);
  const arc = plan.arcHeight * Math.sin(Math.PI * k);
  const dx = plan.to.x-plan.from.x, dz = plan.to.z-plan.from.z;
  const heading = Math.hypot(dx,dz) > 0.001 ? Math.atan2(dx,dz) : plan.to.rotY;
  // Turn towards the path before moving; turn towards the resource after arriving.
  const turnIn = smoothstep(Math.min(1, k/0.12));
  const turnOut = smoothstep(Math.max(0, (k-0.88)/0.12));
  const travelHeading = plan.from.rotY + shortestAngleDelta(plan.from.rotY,heading)*turnIn;
  return {
    x: plan.from.x + dx*e,
    y: plan.from.y + (plan.to.y-plan.from.y)*e + arc,
    z: plan.from.z + dz*e,
    rotY: travelHeading + shortestAngleDelta(travelHeading,plan.to.rotY)*turnOut,
  };
}

/** 未在位移时的静止变换：直接落在锚点上，朝向取锚点朝向。 */
export function restAt(place: CatAnchorPlace, currentRotY: number): CatTransform {
  return {
    x: place.position.x,
    y: place.heightM,
    z: place.position.z,
    rotY: currentRotY,
  };
}

/**
 * 步态相位（0–1 的周期量），用于行走时的躯干起伏与迈步。
 *
 * 单独抽出来是因为它**是纯视觉量**：由时间累积而不是由位移距离推导，
 * 这样即使猫被暂停、或帧率极低，腿部动作也不会突然加速。
 */
export class GaitPhase {
  private phase = 0;

  advance(dt: number, speedHz = 1.6): number {
    this.phase = (this.phase + dt * speedHz) % 1;
    return this.phase;
  }

  reset(): void {
    this.phase = 0;
  }

  get value(): number {
    return this.phase;
  }
}

function smoothstep(k: number): number { return k*k*(3-2*k); }
