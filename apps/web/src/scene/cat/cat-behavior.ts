/**
 * 行为运行时：让猫按仿真真值**自主行动**。
 *
 * 数据流：
 *   `Session.behaviorTimeline`（core 产出）
 *     → 本文件按渲染帧时间推进「此刻应在哪个锚点、什么姿势、是否处于突发」
 *     → `locomotion` 把路走完
 *     → `CatController.setExternalTransform()` 落到 rig 上
 *
 * 三条边界（都会出现在界面上）：
 *   1. 自主行为是**演示**，不是对猫的感受或健康状况的判断；
 *   2. 突发演示由用户手动触发或仿真注入，只演示**动作**，不命名任何状况；
 *   3. 时间线与位移按渲染帧推进，每帧上限 0.1 秒，避免加载或后台恢复时瞬移。
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

/**
 * 跳跃门限（米）：高度差超过它就算「跳」，允许直接改目标（不走完整轨迹）。
 *
 * 与 `locomotion` 里 `planTravel` 用的 `OPERATIVE_CONSTANTS.jumpMinHeightM` 是**同一个量**，
 * 这里重复一次是为了避免在热路径上每次都查常量表；两处都由 `AGENTS.md` 的行为常量表定义，
 * 单测会断言它们相等（不一致会导致"该跳的时候走、该走的时候跳"）。
 */
const JUMP_GATE_M = 0.15;

export class CatBehaviorRuntime {
  private readonly timeline: CatBehaviorTimeline;
  private readonly controller: CatController;
  /** 演示倍率：1 秒当多少秒 */
  private readonly timeScale: number;
  private paused = false;
  /** 行为时间线内的当前时刻（秒） */
  private t = 0;
  private gait = new GaitPhase();
  private plan: TravelPlan | null = null;
  /**
   * 当前位移已经花掉的**真实**秒数。
   *
   * ⚠️ 这是本轮修掉的一个真故障：位移时长是按**真实几何**算出来的真实秒数
   * （`planTravel` 里 `naturalS` 是"走过去要几秒"），但推进量原先取的是
   * `this.t - planStartT`——那是**时间线秒**，而时间线在 20× 倍率下走得飞快。
   * 结果一次计划 3 真实秒的走路，0.15 秒就走完了：**看起来就是瞬移**。
   * 现在位移按真实秒推进，并由 `effectiveTimeScale` 让时间线跟着走路一起走
   * （走完这段正好用完这段位移的时间线时长），因此不瞬移、也不落后于时间线。
   */
  private planElapsedS = 0;
  /** 当前位移对应的时间线段结束时刻（会话内秒），用于给时间线"刹车" */
  private planSegmentEndT = 0;
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
    options: {
      startAtS?: number;
      onStatus?: (s: BehaviorStatus) => void;
      /**
       * 起始变换。给了它就从这里继续（用于**运行中换一条时间线**：
       * 若不传，构造时会直接落到时间线给出的锚点上——那就是一次瞬移）。
       */
      startTransform?: CatTransform;
    } = {},
  ) {
    this.timeline = timeline;
    this.controller = controller;
    this.timeScale = timeline.timeScale > 0 ? timeline.timeScale : 1;
    this.paused = false;
    this.t = Math.max(0, Math.min(timeline.durationS, options.startAtS ?? 0));
    this.onStatus = options.onStatus ?? null;

    // 起始位置：优先沿用调用方给的变换（换时间线时用），否则直接落在时间线的锚点上。
    // 首帧不做过渡是刻意的——首屏不该看到猫从别处"飘"过来。
    const first = activityAt(timeline, this.t);
    this.currentSegment = first;
    const place = anchorPlace(first.anchorId) ?? anchorPlace('floor-living');
    this.transform =
      options.startTransform ??
      (place
        ? { x: place.position.x, y: place.heightM, z: place.position.z, rotY: place.facing }
        : { x: 0, y: 0, z: 0, rotY: 0 });
    if (options.startTransform && place) {
      // 换时间线时若猫不在新锚点上，不要瞬移过去——交给 `update` 里的走路逻辑走过去。
      this.plannedArrival = place;
    }
    this.controller.snapPoseFor(first.posture, true);
    this.controller.setActivityMotion(ACTIVITY_MOTION[first.activity] ?? null);
    this.controller.setExternalTransform(this.transform, 0);
    // 立刻推一次状态：否则头顶标签与 HUD 会空白最多 250 ms（emitStatus 的节流），
    // 截图与「第一眼」都会看到空标签。
    this.onStatus?.(this.status());
  }

  /** 首帧就与目标锚点不一致时，记下目标，让 `update` 第一帧开始走过去。 */
  private plannedArrival: CatAnchorPlace | null = null;

  setPaused(on: boolean): void {
    if (this.paused === on) return;
    this.paused = on;
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
    const place = anchorPlace(seg.anchorId);
    const moving = this.plan !== null;
    // 正在走的时候，标签必须说「移动」——即使时间线已经翻到下一段。
    // 这是「标签要与画面一致」这条纪律的落点：猫在走，标签就不该写「休息」。
    const movingDef = ACTIVITY_DEFS.locomoting;
    return {
      activityLabel: moving ? movingDef.label : (ACTIVITY_DEFS[seg.activity]?.label ?? seg.activity),
      postureLabel: postureLabelOf(moving ? 'walking' : seg.posture),
      activity: moving ? 'locomoting' : seg.activity,
      posture: moving ? 'walking' : seg.posture,
      anchorId: seg.anchorId,
      anchorLabel: CAT_ANCHOR_LABELS[seg.anchorId] ?? place?.label ?? seg.anchorId,
      hourOfDay: hourOfDay(this.t),
      timeS: this.t,
      incident: incident?.kind ?? null,
      moving,
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
    // 共用帧时间；模型加载、后台标签恢复和暂停都不能积攒下一帧的位移。
    const step = this.paused ? 0 : Math.min(Math.max(dt, 0), 0.1);

    if (step > 0) {
      // ⚠️ 突发段**不乘演示倍率**。
      //
      // 为什么：`demoDurationS` 已经是「给人看的秒数」（freezing 的 10 分钟真实时长
      // 本来就被压缩成 60 秒）。若再乘一次 20× 倍率，一次 15 秒的抽搐只渲染 0.75 秒，
      // 用户点下去几乎看不到东西——这正是「突发演示没反应」这类反馈的来源。
      // 因此突发段按真实时间推进，其余行为仍按倍率推进节律。
      const current = activityAt(this.timeline, this.t);
      const realTime = current.incidentKind !== undefined;
      this.t = Math.min(this.timeline.durationS, this.t + step * this.effectiveTimeScale(realTime));
      if (this.t >= this.timeline.durationS) this.t = this.timeline.durationS;
    }

    const seg = activityAt(this.timeline, this.t);
    this.currentSegment = seg;
    const key = `${seg.t}:${seg.activity}:${seg.anchorId}`;
    const segChanged = key !== this.currentSegmentKey;

    if (segChanged) {
      this.currentSegmentKey = key;
      this.retargetIfNeeded(seg);

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

    // 首帧若与目标锚点不一致（换时间线的情形），这里把它补成一次走路
    if (this.plannedArrival) {
      const target = this.plannedArrival;
      this.plannedArrival = null;
      if (!this.plan && this.needsWalkTo(target)) this.startPlan(target);
    }

    if (this.plan) {
      this.planElapsedS += step;
      const k = Math.min(1, this.planElapsedS / this.plan.durationS);
      this.transform = travelAt(this.plan, this.planElapsedS);
      // 步态相位只在**真的在移动**时推进；到得早就地站住，不「原地踏步」。
      const phase = k < 1 ? this.gait.advance(step, 1.9) : 0;
      this.controller.setExternalTransform(this.transform, phase);
      if (k >= 1) {
        this.plan = null;
        this.gait.reset();
      }
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

  /**
   * 演示倍率的**局部刹车**：正在走路时放缓时间线，让「走完这段」与「这段位移的时间线时长用完」同时发生。
   *
   * 为什么必须有它：位移时长是按真实几何算的**真实秒数**（一次 3 m 的横穿约 3 秒），
   * 而时间线在 20× 下同样的位移只给 1 秒真实时间。若不刹车，只有两个坏选择：
   *   - 让猫按时间线速度走 → 0.15 秒走完 3 m，就是**瞬移**；
   *   - 让猫按真实速度走 → 它永远落在时间线后面，一路都在追赶，看起来像一直在赶路。
   * 刹车之后两者同时结束：走路看得清、时间线不落后、标签也不会与画面矛盾。
   *
   * 代价是演示总时长略增（实测：一天的位移段合计约 5.5–6.7%，
   * 每段需要补的真实时间中位数约 1.5 秒 → 整场演示约多几分钟）。
   */
  private effectiveTimeScale(realTime: boolean): number {
    if (realTime) return 1;
    if (!this.plan) return this.timeScale;
    const remainReal = Math.max(0, this.plan.durationS - this.planElapsedS);
    const remainSim = Math.max(0, this.planSegmentEndT - this.t);
    if (remainReal <= 0.05) return this.timeScale;
    return Math.min(this.timeScale, remainSim / remainReal);
  }

  /** 当前位置与目标锚点的差距是否值得走一趟（避免为一两厘米的残差规划位移）。 */
  private needsWalkTo(place: CatAnchorPlace): boolean {
    const flat = Math.hypot(place.position.x - this.transform.x, place.position.z - this.transform.z);
    const dy = Math.abs(place.heightM - this.transform.y);
    return flat > 0.05 || dy > 0.03;
  }

  private samePlace(a: CatTransform, place: CatAnchorPlace): boolean {
    return (
      Math.hypot(place.position.x - a.x, place.position.z - a.z) < 0.05 &&
      Math.abs(place.heightM - a.y) < 0.03
    );
  }

  /**
   * 段切换时决定要不要（重新）规划位移。
   *
   * 三条规则：
   *   1. 位移段（`locomoting` 且已解析）→ 一定规划；
   *   2. **非位移段而猫不在该锚点上** → 也规划。这条覆盖"时间线直接在两个锚点之间切换"
   *      的情形：以前这里会 `restAt` 直接落到锚点上，也就是**瞬移**；
   *   3. **跳跃例外**：高度差超过跳跃门限时按跳处理，可以直接改目标（用户要的
   *      「只有跳跃可以忽略轨迹」）。普通走路若目标变了，则从**当前位置**重新规划，
   *      保持轨迹连续——绝不「先瞬移再走」。
   */
  private retargetIfNeeded(seg: CatBehaviorSegment): void {
    const place = anchorPlace(seg.anchorId);
    if (!place) return;
    const isTravel = seg.activity === 'locomoting' && seg.resolved !== false;
    if (!isTravel && !this.needsWalkTo(place)) {
      // 已经在该锚点上：若还在走（例如刚走到）就让它走完，别把残差吃掉
      return;
    }
    const jump = Math.abs(place.heightM - this.transform.y) > JUMP_GATE_M;
    if (this.plan && !jump && this.samePlace(this.plan.to, place)) return; // 已经在去这里的路上
    this.startPlan(place, seg);
  }

  private startPlan(place: CatAnchorPlace, seg?: CatBehaviorSegment): void {
    this.plan = planTravel(this.transform, place, 0);
    this.planElapsedS = 0;
    const endSeg = seg ?? this.currentSegment;
    this.planSegmentEndT = endSeg ? endSeg.t + endSeg.durS : this.t;
    this.gait.reset();
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
