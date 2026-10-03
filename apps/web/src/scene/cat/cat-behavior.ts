/**
 * 行为运行时：让猫按仿真真值**自主行动**。
 *
 * 数据流：
 *   `Session.behaviorTimeline`（core 产出）
 *     → 本文件按 wall clock 求「此刻应在哪个锚点、什么姿势、是否处于突发」
 *     → `locomotion` 把路走完
 *     → `CatController.setExternalTransform()` 落到 rig 上
 *
 * 三条边界（都会出现在界面上）：
 *   1. 自主行为是**演示**，不是对猫的感受或健康状况的判断；
 *   2. 突发演示由用户手动触发或仿真注入，只演示**动作**，不命名任何状况；
 *   3. 时间线的推进由 wall clock 推导——后台降帧不会让猫「卡在半路」。
 */
import { ACTIVITY_DEFS, CAT_ANCHOR_LABELS, activityAt, incidentAt } from '@camp/core';
import type {
  CatActivityId,
  CatBehaviorSegment,
  CatBehaviorTimeline,
  CatIncidentKind,
  CatPosture,
} from '@camp/core';
import type { CatController } from './cat-controller.ts';
import { ACTIVITY_MOTION } from './cat-states.ts';
import { anchorPlace } from './anchor-map.ts';
import type { CatAnchorPlace } from './anchor-map.ts';
import { GaitPhase, planTravel, restAt, travelAt } from './locomotion.ts';
import type { CatTransform, TravelPlan } from './locomotion.ts';

export interface BehaviorStatus {
  /** 当前活动与姿势（中文，供 UI 直接显示） */
  activityLabel: string;
  postureLabel: string;
  activity: CatActivityId;
  posture: CatPosture;
  anchorId: string;
  anchorLabel: string;
  /** 演示时钟（当日小时数，0–24） */
  hourOfDay: number;
  /** 当前突发（若有） */
  incident: CatIncidentKind | null;
  /** 是否在移动中 */
  moving: boolean;
  /** 已解码的行为区间序号（自检用） */
  segmentIndex: number;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

export class CatBehaviorRuntime {
  private readonly timeline: CatBehaviorTimeline;
  private readonly controller: CatController;
  /** 演示倍率：1 秒当多少秒 */
  private readonly timeScale: number;
  private paused = false;
  /** 行为时间线内的当前时刻（秒） */
  private t = 0;
  private lastWallMs: number;
  private gait = new GaitPhase();
  private plan: TravelPlan | null = null;
  private planStartT = 0;
  private currentSegmentKey = '';
  private transform: CatTransform;
  private readonly onStatus: ((s: BehaviorStatus) => void) | null;

  constructor(
    timeline: CatBehaviorTimeline,
    controller: CatController,
    options: { startAtS?: number; onStatus?: (s: BehaviorStatus) => void } = {},
  ) {
    this.timeline = timeline;
    this.controller = controller;
    this.timeScale = timeline.timeScale > 0 ? timeline.timeScale : 1;
    this.paused = false;
    this.t = Math.max(0, Math.min(timeline.durationS, options.startAtS ?? 0));
    this.lastWallMs = now();
    this.onStatus = options.onStatus ?? null;

    // 起始位置直接落在时间线给出的锚点上，不做过渡——
    // 首屏不该看到猫从别处「飘」过来（与第一阶段 snapTo 的理由相同）。
    const first = activityAt(timeline, this.t);
    const place = anchorPlace(first.anchorId) ?? anchorPlace('floor-living');
    this.transform = place
      ? { x: place.position.x, y: place.heightM, z: place.position.z, rotY: place.facing }
      : { x: 0, y: 0, z: 0, rotY: 0 };
    this.controller.snapPoseFor(first.posture, true);
    this.controller.setExternalTransform(this.transform, 0);
  }

  setPaused(on: boolean): void {
    if (this.paused === on) return;
    this.paused = on;
    // 暂停后重新计时，避免恢复时一次性补上暂停期间的全部时间
    this.lastWallMs = now();
  }

  isPaused(): boolean {
    return this.paused;
  }

  getTimeS(): number {
    return this.t;
  }

  status(): BehaviorStatus {
    const seg = activityAt(this.timeline, this.t);
    const incident = incidentAt(this.timeline, this.t);
    const def = ACTIVITY_DEFS[seg.activity];
    const place = anchorPlace(seg.anchorId);
    return {
      activityLabel: def?.label ?? seg.activity,
      postureLabel: postureLabelOf(seg.posture),
      activity: seg.activity,
      posture: seg.posture,
      anchorId: seg.anchorId,
      anchorLabel: CAT_ANCHOR_LABELS[seg.anchorId] ?? place?.label ?? seg.anchorId,
      hourOfDay: hourOfDay(this.t),
      incident: incident?.kind ?? null,
      moving: this.plan !== null,
      segmentIndex: this.timeline.segments.indexOf(seg),
    };
  }

  /** 当前世界坐标（自检与「猫特写」机位使用）。 */
  getTransform(): CatTransform {
    return { ...this.transform };
  }

  update(dt: number): void {
    const wallMs = now();
    // 用 wall clock 推导推进量，而不是累加 dt：dt 在后台标签里会被浏览器压低
    const elapsed = Math.max(0, (wallMs - this.lastWallMs) / 1000);
    this.lastWallMs = wallMs;
    const step = this.paused ? 0 : Math.min(dt, 0.1) + Math.max(0, elapsed - Math.min(dt, 0.1));

    if (step > 0) {
      this.t = Math.min(this.timeline.durationS, this.t + step * this.timeScale);
      if (this.t >= this.timeline.durationS) this.t = this.timeline.durationS;
    }

    const seg = activityAt(this.timeline, this.t);
    const key = `${seg.t}:${seg.activity}:${seg.anchorId}`;
    const segChanged = key !== this.currentSegmentKey;

    if (segChanged) {
      this.currentSegmentKey = key;
      const place = anchorPlace(seg.anchorId);
      const isTravel = seg.activity === 'locomoting' && seg.resolved !== false && place;
      if (isTravel && place) {
        // 位移时长直接取区间长度，保证画面时序与数据一致
        this.plan = planTravel(this.transform, place, seg.durS);
        this.planStartT = this.t;
        this.gait.reset();
      } else {
        this.plan = null;
        this.gait.reset();
      }
      // 姿势切换：由控制器按新姿势重建基准参数；
      // 同时把「在做什么」的头部动作配方叠上去——进食/饮水/用砂盆的姿势都是蹲伏，
      // 只有头部动作能把它们区分开。
      this.controller.snapPoseFor(seg.posture, true);
      this.controller.setActivityMotion(ACTIVITY_MOTION[seg.activity] ?? null);
    }

    if (this.plan) {
      const elapsedS = this.t - Math.max(0, this.planStartT);
      this.transform = travelAt(this.plan, elapsedS);
      // 位移已结束（到得早）时不再走步态，原地站着等下一段——这样猫不会「原地踏步」，
      // 也不会为了拖满时间线而放慢成蜗牛。
      const arrived = elapsedS >= this.plan.durationS;
      const phase = arrived ? 0 : this.gait.advance(step, 1.9);
      this.controller.setExternalTransform(this.transform, phase);
    } else {
      // 静止：位置贴合到当前锚点（位移结束时可能因缓动留有极小残差）
      const place = anchorPlace(seg.anchorId);
      if (place) this.transform = restAt(place, this.transform.rotY);
      this.gait.reset();
      this.controller.setExternalTransform(this.transform, 0);
    }

    this.controller.update(step);
    this.emitStatus();
  }

  private lastStatusAtMs = 0;

  private emitStatus(): void {
    if (!this.onStatus) return;
    // 每 250 ms 推一次即可：HUD 上是一行文字，不需要按帧刷新
    const wallMs = now();
    if (wallMs - this.lastStatusAtMs < 250) return;
    this.lastStatusAtMs = wallMs;
    this.onStatus(this.status());
  }
}

function postureLabelOf(posture: CatPosture): string {
  switch (posture) {
    case 'lying':
      return '趴卧';
    case 'sitting':
      return '坐';
    case 'standing':
      return '站立';
    case 'crouching':
      return '蹲伏';
    case 'walking':
      return '行走';
    case 'climbing':
      return '攀跳';
    default:
      return String(posture);
  }
}

/** 演示时钟：会话起点固定为 09:00，与 `@camp/core` 的 `DAY_START_HOUR` 一致。 */
function hourOfDay(tS: number): number {
  return (9 + tS / 3600) % 24;
}

export type { CatAnchorPlace, CatBehaviorSegment, TravelPlan };
