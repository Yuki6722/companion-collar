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
import { ACTIVITY_DEFS, CAT_ANCHOR_LABELS, INCIDENT_DEFS, activityAt, incidentAt } from '@camp/core';
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
  /**
   * 行为时间线内的当前时刻（会话内秒）。
   *
   * 为什么单独给一个"原始秒数"：手机预览要按同一时刻去查仿真会话的生理读数，
   * 而 `hourOfDay` 是被 24 取模过的、无法反推会话内的绝对时刻。
   */
  timeS: number;
  /** 当前突发（若有） */
  incident: CatIncidentKind | null;
  /** 是否在移动中 */
  moving: boolean;
  /** 已解码的行为区间序号（自检用） */
  segmentIndex: number;
  /**
   * 当前行为段已进行的**真实**秒数与整段真实时长。
   *
   * 为什么需要它：`resting` 段平均 56 秒、最长可达 2 分钟以上，而整段时间里
   * 「活动」文字是不变的——用户会以为标签卡住了。把段内进展显示出来，
   * 才能让人看出**时间线在走**，而不是只有文字跳变时才觉得活着。
   */
  segmentElapsedS: number;
  segmentRealDurationS: number;
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
  /** 当前区间（缓存，避免每帧重新二分查找） */
  private currentSegment: CatBehaviorSegment | null = null;
  /** 段内已进行的**真实**秒数（不是时间线秒），供标签显示进展 */
  private segmentElapsedS = 0;
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
    this.currentSegment = first;
    const place = anchorPlace(first.anchorId) ?? anchorPlace('floor-living');
    this.transform = place
      ? { x: place.position.x, y: place.heightM, z: place.position.z, rotY: place.facing }
      : { x: 0, y: 0, z: 0, rotY: 0 };
    this.controller.snapPoseFor(first.posture, true);
    this.controller.setActivityMotion(ACTIVITY_MOTION[first.activity] ?? null);
    this.controller.setExternalTransform(this.transform, 0);
    // 立刻推一次状态：否则头顶标签与 HUD 会空白最多 250 ms（emitStatus 的节流），
    // 截图与「第一眼」都会看到空标签。
    this.onStatus?.(this.status());
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
    const seg = this.currentSegment ?? activityAt(this.timeline, this.t);
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
      timeS: this.t,
      incident: incident?.kind ?? null,
      moving: this.plan !== null,
      segmentIndex: this.timeline.segments.indexOf(seg),
      segmentElapsedS: this.segmentElapsedS,
      // 段的**真实**时长：突发段本来就按真实时间推进，其余段要除以倍率
      segmentRealDurationS: seg.incidentKind !== undefined ? seg.durS : seg.durS / this.timeScale,
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
      // ⚠️ 突发段**不乘演示倍率**。
      //
      // 为什么：`demoDurationS` 已经是「给人看的秒数」（freezing 的 10 分钟真实时长
      // 本来就被压缩成 60 秒）。若再乘一次 20× 倍率，一次 15 秒的抽搐只渲染 0.75 秒，
      // 用户点下去几乎看不到东西——这正是「突发演示没反应」这类反馈的来源。
      // 因此突发段按真实时间推进，其余行为仍按倍率推进节律。
      const current = activityAt(this.timeline, this.t);
      const realTime = current.incidentKind !== undefined;
      this.t = Math.min(this.timeline.durationS, this.t + step * (realTime ? 1 : this.timeScale));
      if (this.t >= this.timeline.durationS) this.t = this.timeline.durationS;
    }

    const seg = activityAt(this.timeline, this.t);
    this.currentSegment = seg;
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
      // 突发必须给出一套**身体动作**，否则「抽搐」在画面上就是一只趴着不动的猫
      // （标签写着抽搐、身体毫无变化——这正是「点了突发没反应」的原因）。
      this.controller.setIncidentMotion(
        seg.incidentKind ? INCIDENT_DEFS[seg.incidentKind]?.motion ?? null : null,
      );
      // 段一换，已进行时长立刻归零
      this.segmentElapsedS = 0;
    } else if (step > 0) {
      // 段内累计**真实**已进行时长。
      //
      // 为什么按真实秒而不是时间线秒：标签上的「已进行 X 秒」是给眼睛看的，
      // 时间线秒在 20× 倍率下会跳得飞快（20 秒一跳），读起来像计数器坏了。
      // 按真实秒计数与呼吸、抖动的观感节奏一致。
      this.segmentElapsedS += step;
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

  private emitStatus(): void {
    if (!this.onStatus) return;
    // 逐帧推送，**不在运行时层节流**。
    //
    // 为什么去掉这里的 250 ms 节流：`locomoting` 段的真实时长平均只有 1.2 秒、
    // 最短 0.2 秒，比节流间隔还短——那样「移动 行走」根本来不及显示，
    // 用户会以为标签停了。改为逐帧推送后，消费方各按自己的节奏节流：
    // 头顶标签只在**内容变化**时改文本、按 1 秒改进度；HUD 面板另按 1 秒节流。
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
