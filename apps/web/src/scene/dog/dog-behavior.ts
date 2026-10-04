/**
 * 狗的行为运行时：把**时间线（语义）**翻译成**位置、朝向与姿态**。
 *
 * 这一层是三件事的接线处：
 *   `@camp/core` 的狗行为时间线（"接下来 40 秒在院子奔跑"）
 *     → `dog-nav.ts` 的导航图与路径跟随（"怎么走过去、朝向哪边"）
 *       → `dog-controller.ts` 的姿态（"四条腿怎么摆"）
 *
 * 两条时间纪律（都是踩过坑之后定下来的）：
 *
 *   1. **位移按真实秒推进，不按时间线秒。** 猫版曾经按时间线秒推进位移，
 *      20× 倍率下"3 秒的走路"在 0.15 秒内走完 —— 肉眼看就是瞬移。
 *      这里反过来：先把该走的路按 `距离 / 速度` 算出**真实需要几秒**，
 *      再让这一段在真实时间里占这么久；时间线秒只用来决定"这一段的语义长度"。
 *      于是**走不到就一定会等**，而不是"压缩时间把路走完"。
 *
 *   2. **每段分「走过去」与「做这件事」两个阶段。** 不是到了锚点就立刻切姿态、
 *      也不是在锚点上凭空开始喝水 —— 先沿导航图走到位、转好朝向，再做动作。
 *      这两阶段的真实秒数加起来就是这一段的总时长，演示时钟在段内**线性**推进，
 *      因此时钟不会跳、时间线也不会漂。
 */
import type { DogActivityId, DogBehaviorSegment, DogBehaviorTimeline, DogIncidentKind } from '@camp/core';
import { DOG_ACTIVITY_DEFS, DOG_ANCHOR_IDS, hourOfDayAt } from '@camp/core';
import { DogController, SEIZURE_TOTAL_S, VOMIT_TOTAL_S } from './dog-controller.ts';
import type { DogPoseId } from './dog-controller.ts';
import {
  DOG_ANCHOR_SPECS,
  advance,
  navNode,
  polylineLength,
  resolveAnchorNode,
  routeBetween,
  startFollow,
  turnToward,
  type FollowState,
  type Point2,
} from './dog-nav.ts';
import { ENGAWA, HALF_D, YARD } from './layout-dog.ts';

/** 各移动活动的速度（米/秒）。柴犬：慢走接近人快步，奔跑是短时冲刺。 */
const SPEED_BY_ACTIVITY: Partial<Record<DogActivityId, number>> = {
  walking: 0.9,
  trotting: 1.8,
  running: 4.2,
  sniffing: 0.6,
  // 以下都是"定点做某事"，但它们同样要先走到那个锚点 —— 走过去用这个速度
  resting: 0.9,
  sleeping: 0.9,
  sitting: 0.9,
  alerting: 0.9,
  drinking: 0.9,
  eating: 0.9,
  playing: 1.4,
  eliminating: 0.9,
  // ---- 院子里的四个新活动（本轮）
  //
  // ⚠️ 这四个的值是**走过去的速度**，不是"做这件事时的速度"：它们是"到点后原地做"，
  // 而"原地"这件事由运行时保证 —— 到位之后 `travelDone` 为真，`status().speedMps` 直接报 0、
  // 位移一帧都不再产生。给定的值因此取与 `resting`/`sleeping` 完全同类的那一档（0.9）。
  //
  // 为什么不给 0：这张表里的数在 `startSegment` 里同时决定 `travelS = 距离 / 速度`
  // 与路径推进的步长。给 0 会让 `travelS = 0` 且 `advance()` 每帧步长为 0 ——
  // 狗**永远走不到锚点**，而是"就地"开始玩水/刨地（在厨房里扒水花）。
  // 那不是"原地做"，是"到不了"。所以四个新活动沿用与 resting/sleeping 同一档。
  'water-play': 0.9,
  rolling: 0.9,
  digging: 0.9,
  sunning: 0.9,
};

/**
 * 「做这件事」的最短真实时长（秒）。
 *
 * 为什么需要它：时间线给每段的 `durS` 是**演示秒**，换算成真实秒可能只有一两秒 ——
 * 对"喝一次水"来说太短，看上去像没喝就走了。这里给一个下限，
 * 让动作至少完整做一遍；代价是这一段的真实时长被撑长，演示时钟在这一段走得更慢，
 * 但**时间线本身不变**（时钟只是按比例映射到段内）。
 */
const MIN_PERFORM_S = 1.6;

/** 到位后转身的时长（秒）。原地转身不产生位移，因此不受"不许倒着走"的约束。 */
const TURN_IN_PLACE_S = 0.45;

/**
 * 手动触发一次活动时的**整段真实时长**（秒），含"走过去"。
 *
 * 取 22 的理由（三段拼出来的，不是拍的）：
 *   - **下面界**：最远的锚点也在 20 m 以内，而这一档的走过去速度是 0.9 m/s（见
 *     `SPEED_BY_ACTIVITY`）——20 m 需要约 22 s。这一段的路线**复用自主行为那套寻路**，
 *     走不到就一定会等（绝不允许瞬移），所以窗口必须真的容得下这段路，
 *     否则用户点完只看到它迈了两步就被切走。
 *   - **动作那一段**：扒水 3.8 次/秒、刨地 4.4 次/秒、打滚 0.55 Hz，都要几个完整循环才读得出
 *     "它在做这件事"；两三秒只够一次抖动。整段扣掉走路之后剩十几秒，动作都做足了。
 *   - **上面界**：再长就等于把演示卡在这一件事上；用户点按钮是为了**验收**，
 *     不是要它在这儿待一分钟。22 s 恰好是"走一段 + 做一遍"的可看窗口。
 * 与自主行为的关系：这个数**只决定手动这一段的窗口**，时间线本身一个字节都没动。
 */
const MANUAL_TOTAL_S = 22;

/**
 * 允许**手动触发**的活动清单（HUD 的四个按钮 = 这一组的顺序）。
 *
 * 为什么单独列一份而不是给 `DogActivityId` 全量做按钮：手动入口的语义是
 * 「走过去、然后做这件事」，只对"到点后原地做"的活动成立 ——
 * `walking` / `trotting` / `running` 这类**移动本身就是行为**的活动没有"做这件事"那一段，
 * 时间线驱动才是它们唯一正确的发生方式。四个院子互动（玩水/打滚/刨地/晒太阳）
 * 正是本轮用户看不到的那四个，因此由它们组成手动清单。
 */
export const DOG_MANUAL_ACTIVITY_IDS = ['water-play', 'rolling', 'digging', 'sunning'] as const satisfies readonly DogActivityId[];

/** 手动触发清单里的活动 id 类型（HUD 与自检出口共用它）。 */
export type DogManualActivityId = (typeof DOG_MANUAL_ACTIVITY_IDS)[number];

export interface DogBehaviorStatus {
  activity: DogActivityId;
  activityLabel: string;
  poseId: DogPoseId;
  anchorId: string;
  anchorLabel: string;
  /** 当日时刻（小时），由演示时钟推出来 */
  hourOfDay: number;
  /** 当前突发种类（无则 null） */
  incident: DogIncidentKind | null;
  /** 本段已进行的真实秒数 */
  segmentElapsedS: number;
  /** 本段的真实总时长 */
  segmentRealDurationS: number;
  /** 是否正在移动（用于区分"在原地做动作"与"在走过去"） */
  moving: boolean;
  /** 当前速度（米/秒） */
  speedMps: number;
  /**
   * 这一段是不是**手动触发**的（`goDo`）。
   *
   * 它取的是"**进入这一段时**这一段属不属于手动"，而不是"现在心里是不是想着手动"：
   * 手动这一段跑完、时间线自己接了下一段之后，这个值必须立刻变回 false，
   * 否则 UI 的"正在执行"提示会一直挂着，而画面上那只狗早就在做别的事了。
   */
  manual: boolean;
  /** 手动触发过的总次数（自检用；与 `manual` 一起证明"按钮真的接上了"） */
  manualCount: number;
  /** 演示时刻（会话内秒） */
  demoS: number;
}

/**
 * 手动触发时的**首选锚点顺序**（HUD 四个按钮各自一个列表）。
 *
 * 为什么 web 侧需要这样一张表，而不是直接去问 core：
 *   core 的 `DOG_DESTINATION_RULES` 是**模块私有**的（那是引擎内部的目的地规则），
 *   只导出 `DOG_ACTIVITY_IDS` / `DOG_ANCHOR_IDS` / `DOG_ACTIVITY_DEFS`。
 *   web 这一侧不能反向依赖 core 的内部结构（包边界纪律）。
 *   所以这里只写下"**先去哪儿**"的顺序，**允许集合仍然由 core 说了算**：
 *   真正被选中的锚点必须落在 `core` 允许的那几个里面（`scripts/check-dog-anchors.mjs`
 *   与临时探针都按 core 的规则逐条核对）。表里如果写进一个 core 不允许的锚点，
 *   表现是"选中的地方 core 并不认可" —— 那是一条能被审计抓到的错误，而不是一条沉默的分歧。
 *
 * 顺序依据与 `core/src/behavior/dog.ts` 的 `preferIds` 一致，并补齐**同类的合法备选**：
 *   玩水   → 池塘边（用户点名的地点）→ 院内水盆
 *   打滚   → 草坪中央 → 草坪西侧
 *   刨地   → 灌木边草地
 *   晒太阳 → 树下阴影 → 草坪西侧 → 木平台
 * 列表之后的兜底顺序是 `DOG_ANCHOR_IDS` 的规范顺序，因此"一个都解析不出来"才会返回 false。
 */
const MANUAL_ANCHOR_PREFERENCE: Readonly<Partial<Record<DogActivityId, readonly string[]>>> = {
  'water-play': ['yard-pond', 'outdoor-water'],
  rolling: ['yard-lawn-center', 'yard-lawn-west'],
  digging: ['yard-dig'],
  sunning: ['yard-shade', 'yard-lawn-west', 'deck'],
};

/**
 * 活动 → 姿态。这张表是行为层与动画层之间**唯一**的耦合面。
 *
 * 键就是 core 的 `DogActivityId`（院子里的四个新活动：玩水 / 打滚 / 刨地 / 晒太阳，
 * 由 core 侧同一轮加入词表）。正因为它是 `Record<>` 而不是 `Partial<>`：
 * **core 加了一个活动而这里没给映射，会当场编译失败** —— 不会退化成"跑到那个活动时
 * 找不到姿态"的静默失效。
 */
const POSE_BY_ACTIVITY: Record<DogActivityId, DogPoseId> = {
  resting: 'down',
  sleeping: 'sleep',
  walking: 'walk',
  trotting: 'trot',
  running: 'run',
  sniffing: 'sniff',
  drinking: 'drink',
  eating: 'eat',
  playing: 'play',
  eliminating: 'eliminate',
  sitting: 'sit',
  alerting: 'stand',
  // ---- 院子里的四个新活动（本轮）
  'water-play': 'water-play',
  rolling: 'rolling',
  digging: 'digging',
  // 晒太阳**复用已有的 `down`**：动作与趴卧逐帧一致，差别只在锚点（草坪日光位）与时段，
  // 因此不为它单独做姿态 —— 多一个只改标签不改关节的姿态，只会多一处漂移点。
  sunning: 'down',
};

export interface DogRuntimeOptions {
  /** 从时间线的第几秒开始（换时间线时用它续上） */
  startAtS?: number;
  /** 演示倍率：1 秒真实当多少秒演示。缺省取时间线自带的 `timeScale` */
  timeScale?: number;
  onStatus?: (status: DogBehaviorStatus) => void;
  /** 起始位置（缺省用玄关节点） */
  startNodeId?: string;
}

interface SegmentPlan {
  segment: DogBehaviorSegment;
  /**
   * 这一段的**演示时钟基准**（会话内秒）：段内推进的起点。
   *
   * 时间线给的段取它自己的 `t`；手动触发的段取**触发那一刻的演示时刻**（见 `goDo`）；
   * 段边界那一步取"上一段走满之后的时刻"，让时钟跨段连续（见 `update` 的段切换处）。
   */
  clockS: number;
  /** 走到位需要几秒真实时间 */
  travelS: number;
  /** 做这件事需要几秒真实时间 */
  performS: number;
  /** 这一段的总真实时长 */
  totalS: number;
  /** 到位后要转向的朝向（null = 保持路径末端朝向） */
  faceHeading: number | null;
  speedMps: number;
  /**
   * 这一段是不是**手动触发**的（`goDo`）。
   *
   * 为什么运行时要知道这件事：这一段在时间线上**不存在**，它的时长与时钟基准都由
   * `goDo` 现给（见 `clockS`），而报告出去的状态要让 UI 能分清
   * "它自己走到那儿去做"与"你让它现在去做"。
   */
  manual: boolean;
}

/**
 * 最近一次手动触发的**实测结果**（`goDo` 的自检出口）。
 *
 * 与 `incidentDrift()` 同一套仪器风格，但记的是**相反**的事实：
 * 突发那一条要证明"一帧都没动"（drift 恒为 0），这一条要证明
 * "它真的走过去、并且走到了"（`arrived` + `driftM` = 走过的距离）。
 */
export interface DogManualTrigger {
  activity: DogActivityId;
  /** 触发时选中的锚点 id（选不到就不会有这条记录） */
  anchorId: string;
  /** 解析出来的导航节点 id */
  targetNodeId: string;
  /** 从触发到到位，狗实际走了多少米（逐帧累加的真实路程） */
  driftM: number;
  /** 是否走到过锚点（在窗口内到位 = true；窗口耗尽仍没走到 = false） */
  arrived: boolean;
  /** 这一段的总真实窗口（秒） */
  windowS: number;
  /** 其中"走过去"分到几秒 */
  travelS: number;
}

export class DogBehaviorRuntime {
  private readonly timeline: DogBehaviorTimeline;
  private readonly controller: DogController;
  private readonly timeScale: number;
  private readonly onStatus: ((s: DogBehaviorStatus) => void) | null;

  private demoS = 0;
  private segmentIndex = 0;
  private elapsedInSegment = 0;
  private plan: SegmentPlan | null = null;
  private follow: FollowState;
  private currentNodeId: string;
  private paused = false;
  private travelDone = false;
  private turnDone = false;
  /** 当前这一段是不是手动触发的（在 `startSegment` 里按类型定，见 `status().manual`）。 */
  private segmentIsManual = false;
  /** `goDo` 在调用 `startSegment` 之前打下的"这一段是手动触发的"标记。 */
  private pendingManual = false;
  /** 手动这一段的时钟基准（触发那一刻的演示时刻，见 `goDo`）。 */
  private manualClockS = 0;
  /**
   * 突发期间的**位移追踪**：段开始时记下位置，之后记录最大偏离。
   *
   * 为什么要有这个仪器：用户的要求是「点抽搐/呕吐时狗**原地发生**，不许瞬移/跑开」。
   * 这是渲染层的事实，而沙箱里跑不了浏览器（AGENTS.md §6）——
   * 离线门禁能证明导航图与路径跟随的数学性质，但证明不了"这一次点击之后它没动"。
   * 所以把它做成一个可在页面上读到的数：`?debug=1` 的徽章里 `dogIncidentDrift`
   * 永远应该是 0.000（原地）——不是"应该"，而是每次点击都会被记一次账。
   */
  private incidentAnchor: { x: number; z: number; kind: DogIncidentKind } | null = null;
  private incidentDriftM = 0;
  /**
   * 手动活动（`goDo`）的**路程记账**。
   *
   * 为什么用"逐帧累加实际走过的距离"而不是"起点到终点的直线距离"：
   * 路线是折线，两点直线距离会把绕行的路程算少；而这一条仪器要回答的是
   * "它是不是真的走过去的"，逐帧累加给出的是**沿路线走了多少米**，不依赖任何几何假设。
   */
  private manualAnchor: { x: number; z: number; activity: DogActivityId; anchorId: string; targetNodeId: string } | null =
    null;
  private manualMovedM = 0;
  private manualArrived = false;
  private lastManual: DogManualTrigger | null = null;
  private goDoCount = 0;
  /**
   * 已经请求过的姿态。
   *
   * ⚠️ 为什么必须有这个字段：`setPose()` 是**带过渡**的（控制器内部记过渡进度）。
   * 逐帧无条件调它会把过渡每一帧重置一次 —— 表现是"姿态永远停在过渡的起点"，
   * 也就是"看起来根本没动"。所以只在目标变了的时候才请求。
   */
  private requestedPose: DogPoseId | null = null;

  /** 轨迹探针：逐帧位置，用来在浏览器里也留下"没有瞬移"的证据 */
  private probe: Array<{ t: number; x: number; z: number; heading: number; moving: boolean }> = [];
  private probeUntilMs = 0;

  constructor(timeline: DogBehaviorTimeline, controller: DogController, opts: DogRuntimeOptions = {}) {
    this.timeline = timeline;
    this.controller = controller;
    this.timeScale = opts.timeScale ?? timeline.timeScale ?? 20;
    this.onStatus = opts.onStatus ?? null;

    const startNodeId = opts.startNodeId ?? 'entry';
    const node = navNode(startNodeId) ?? navNode('entry');
    this.currentNodeId = node?.id ?? 'entry';
    const startPoint: Point2 = { x: node?.x ?? 0, z: node?.z ?? 0 };
    this.follow = startFollow(startPoint.x, startPoint.z, 0, [startPoint]);

    this.demoS = Math.max(0, opts.startAtS ?? 0);
    this.segmentIndex = this.segmentIndexAt(this.demoS);
    this.startSegment(this.currentSegment());
    this.applyTransform();
  }

  getTimeS(): number {
    return this.demoS;
  }

  setPaused(on: boolean): void {
    this.paused = on;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** 当前世界变换（供场景写 `root`，也供自检断言）。 */
  getTransform(): { x: number; y: number; z: number; heading: number } {
    return { x: this.follow.x, y: groundHeightAt(this.follow.x, this.follow.z), z: this.follow.z, heading: this.follow.heading };
  }

  status(): DogBehaviorStatus {
    const segment = this.currentSegment();
    const def = DOG_ACTIVITY_DEFS[segment.activity];
    // 锚点取 `activeAnchorId`（进入这一段时定下的那个），而不是现查时间线：
    // 手动触发的那一段在时间线上不存在（见 `activeAnchorId` 的说明）。
    const anchorId = this.activeAnchorId ?? segment.anchorId;
    const anchor = DOG_ANCHOR_SPECS.find((a) => a.id === anchorId);
    return {
      activity: segment.activity,
      activityLabel: def?.label ?? segment.activity,
      poseId: this.controller.getPose(),
      anchorId,
      anchorLabel: anchor?.label ?? anchorId,
      hourOfDay: hourOfDayAt(this.demoS),
      incident: segment.incidentKind ?? null,
      segmentElapsedS: this.elapsedInSegment,
      segmentRealDurationS: this.plan?.totalS ?? 0,
      moving: !this.travelDone,
      speedMps: this.travelDone ? 0 : (this.plan?.speedMps ?? 0),
      manual: this.segmentIsManual,
      manualCount: this.goDoCount,
      demoS: this.demoS,
    };
  }

  // ---------------------------------------------------------------- 逐帧

  update(dtRaw: number): void {
    const dt = Math.min(Math.max(dtRaw, 0), 0.1);
    if (this.paused || dt <= 0) {
      this.applyTransform();
      return;
    }
    const plan = this.plan;
    if (!plan) return;

    this.elapsedInSegment += dt;
    /**
     * 演示时钟在段内推进：**这一段真实花了多久，时钟就走多久 × 倍率**。
     *
     * 为什么是"按已用真实秒 × `timeScale`"而不是"按这一段的计划时长线性映射"：
     *   后者把"这一段计划 22 秒、实际提前到位只花了 16 秒"这种情况映射成
     *   时钟走到 `plan.totalS × 倍率`，而段边界那一步又会把时钟拨到下一段的 `t` ——
     *   两边对不上就会**在段边界上跳一小截**（实测 0.07 演示秒，是既有的一段老账）。
     *   改成"真实花了多久就走多久"之后，段边界前后严格连续：时钟既不会跳、也不会回退
     *   （`2×0.9×160/96` 那种"计划与实际"的差被消掉）。
     * 手动触发的那一段走的是同一个式子，因此不需要任何特例 —— 它只是"这一段有多长、
     * 时钟就走多久"，而它有多长由 `MANUAL_TOTAL_S` 决定（见 `goDo`）。
     */
    this.demoS = plan.clockS + this.elapsedInSegment * this.timeScale;

    // 阶段一：走过去
    if (!this.travelDone) {
      const beforeX = this.follow.x;
      const beforeZ = this.follow.z;
      this.follow = advance(this.follow, dt, plan.speedMps, this.route);
      // 手动活动的路程记账：逐帧累加**实际走过的**距离（见 `manualMovedM`）
      if (this.manualAnchor) this.manualMovedM += Math.hypot(this.follow.x - beforeX, this.follow.z - beforeZ);
      if (this.follow.arrived || this.elapsedInSegment >= plan.travelS + plan.performS) {
        this.travelDone = true;
        // 到位：这一段的终点就是"当前所在节点"，下一次寻路从它出发
        if (this.targetNodeId) this.currentNodeId = this.targetNodeId;
        // 只有"路径真的走完了"才算到位：窗口耗尽被强行收尾的那种情况，
        // 报成"到达"就是假证据（`lastGoDo` 的 `arrived` 因此取 `follow.arrived`）。
        if (this.manualAnchor && this.follow.arrived) this.manualArrived = true;
        this.requestPose(POSE_BY_ACTIVITY[plan.segment.activity]);
      } else {
        // 走路/小跑/奔跑的姿态由速度决定，而不是由活动名决定 ——
        // 这样"跑去食盆"与"在院子里奔跑"用的是同一套步态。
        this.requestPose(gaitPose(plan.speedMps));
      }
      this.controller.update(dt, { phaseSpeed: gaitPhaseSpeed(plan.speedMps), moving: true });
    } else {
      // 阶段二：到位后先原地转向，再做动作
      if (!this.turnDone) {
        if (plan.faceHeading !== null) {
          this.follow = turnToward(this.follow, plan.faceHeading, dt);
          const done = Math.abs(angleDiff(plan.faceHeading, this.follow.heading)) < 0.05;
          if (done || this.elapsedInSegment >= plan.travelS + TURN_IN_PLACE_S) this.turnDone = true;
        } else {
          this.turnDone = true;
        }
        this.controller.update(dt, { phaseSpeed: 0, moving: false });
      } else {
        this.controller.update(dt, { phaseSpeed: 0, moving: false });
      }
    }

    this.applyTransform();
    if (this.incidentAnchor) {
      this.incidentDriftM = Math.max(
        this.incidentDriftM,
        Math.hypot(this.follow.x - this.incidentAnchor.x, this.follow.z - this.incidentAnchor.z),
      );
    }
    this.sampleProbe();
    this.onStatus?.(this.status());

    // 本段结束 → 进入下一段
    if (this.elapsedInSegment >= plan.totalS) {
      // 手动这一段结束时把仪器收口（写进 `lastGoDo()` 的那条记录）
      this.finalizeManual();
      /**
       * 段边界上的**时钟连续**：先把这一段的时钟走满，再让下一段从它接着走。
       *
       * 为什么不能像原来那样直接把 `demoS` 拨到下一段的 `t`：
       *   ① 手动那一段在时间线上**不存在**，`segmentIndex + 1` 因此会跳到"22 真实秒之后"
       *      那一段 —— 时钟若拨到它的 `t`，就与刚走完的手动段对不上（实测 0 → 105 演示秒的硬跳）。
       *   ② 即便不考虑手动段，"提前到位"也会让这一段提前结束，拨到 `next.t` 同样是回退一格
       *      再往前，段边界上那 0.07 演示秒的抖动就是这么来的。
       * 现在改成"这一段真实花了多久，时钟就走多久"（见 `update`），然后：
       *   时钟 = 这一段起点 + 这一段总时长 × 倍率，下一段从**这个值**起算（`clockOverrideS`）。
       *   于是时钟在段边界严格连续、不回跳，而 `segmentIndex` 照旧向前走
       *   （它读的是时间线本身，"哪一段"这件事没有被手动触发改写）。
       */
      this.demoS = plan.clockS + plan.totalS * this.timeScale;
      this.segmentIndex = Math.min(this.segmentIndex + 1, this.timeline.segments.length - 1);
      this.startSegment(this.currentSegment(), this.demoS);
    }
  }

  /** 轨迹探针（`?probe=<ms>`）：记录接下来这段时间的逐帧位置与朝向。 */
  startProbe(durationS: number): void {
    this.probe = [];
    this.probeUntilMs = performance.now() + Math.max(0.2, durationS) * 1000;
  }

  /**
   * 探针统计。**这是"不瞬移 / 不倒着走"在浏览器里的证据**：
   * 沙箱里跑不了浏览器（见 AGENTS.md §6），所以除了 `check-dog-motion.mjs` 的离线断言之外，
   * 还要留一个能在真实页面上读到的仪器 —— 两者测的是同一件事，但一个测纯函数、一个测实跑。
   */
  probeResult(): {
    frames: number;
    durationS: number;
    maxSpeedMps: number;
    minForwardCos: number;
    distinctPositions: number;
    movedMeters: number;
  } | null {
    if (this.probe.length < 2) return null;
    let maxSpeed = 0;
    let minCos = 1;
    let moved = 0;
    const seen = new Set<string>();
    for (let i = 0; i < this.probe.length; i++) {
      const s = this.probe[i];
      if (!s) continue;
      seen.add(`${s.x.toFixed(2)},${s.z.toFixed(2)}`);
      const prev = this.probe[i - 1];
      if (!prev) continue;
      const dt = Math.max(1e-3, (s.t - prev.t) / 1000);
      const dx = s.x - prev.x;
      const dz = s.z - prev.z;
      const step = Math.hypot(dx, dz);
      moved += step;
      maxSpeed = Math.max(maxSpeed, step / dt);
      if (step > 1e-6) {
        const cos = (Math.sin(s.heading) * dx + Math.cos(s.heading) * dz) / step;
        minCos = Math.min(minCos, cos);
      }
    }
    const first = this.probe[0];
    const last = this.probe[this.probe.length - 1];
    const span = first && last ? (last.t - first.t) / 1000 : 0;
    return {
      frames: this.probe.length,
      durationS: Number(span.toFixed(2)),
      maxSpeedMps: Number(maxSpeed.toFixed(2)),
      minForwardCos: Number(minCos.toFixed(3)),
      distinctPositions: seen.size,
      movedMeters: Number(moved.toFixed(2)),
    };
  }

  /**
   * 自检用：**最近一次突发期间的位移**（米）。
   *
   * 用户要求突发"原地发生"。这个数永远应该是 0.000：
   * 非 0 就说明"点了抽搐，狗先跑开了一段"，正是要拦住的那种故障。
   */
  incidentDrift(): { kind: DogIncidentKind; driftM: number } | null {
    if (!this.incidentAnchor) return null;
    return { kind: this.incidentAnchor.kind, driftM: Number(this.incidentDriftM.toFixed(4)) };
  }

  // ---------------------------------------------------------------- 手动触发活动

  /**
   * **立刻改为"走到该活动的锚点 → 在那里做这件事"**（HUD 四个按钮的出口）。
   *
   * 为什么这么做（而不是直接把狗摆到锚点上、或者就地切姿态）：
   *   ① **不许瞬移、不许倒着走、位移 ≤ 速度 × 帧时**是三条硬不变量，它们唯一的实现处是
   *      `dog-nav.ts` 的路径跟随 + `startSegment` 的算路分支。任何"直接设坐标"的写法都会
   *      绕开这三条保证 —— 用户上一轮已经因为"点一下狗就换了个地方"提出过意见。
   *   ② 所以这里**合成一段临时的 segment**（字段与时间线的 `DogBehaviorSegment` 完全一致：
   *      `{ t, durS, activity, posture, anchorId }`），交给与自主行为**同一个** `startSegment`
   *      去算路、算时长、切姿态。手动与自主的差别因此只剩"这一段从哪来"，
   *      而不是"这一段怎么走"。
   *   ③ 当前这一段的剩余部分**作废**：`startSegment` 会把 `elapsedInSegment` 归零、
   *      重新算路线与 `plan`，起点就是狗现在站着的位置 —— 段边界上位置不跳变。
   *
   * 时钟：手动这一段照**演示倍率**推进（22 真实秒 = 264 演示秒），但**时间线本身一个字节没动**。
   *   为什么不让它冻结或者跳：演示时钟的规矩是"真实过了多久、时钟就走多久 × 倍率"，
   *   而且**不许回跳、不许在段边界上跳**。冻结会让时钟落后时间线 22 秒，接下一段时只能硬跳
   *   （实测 0 → 105 演示秒）；按倍率走则前后严格连续（`plan.totalS` 恒为 `MANUAL_TOTAL_S`，
   *   于是"段内按已用秒走"与"段边界按总时长走满"是同一件事）。
   *   后果只有一条、而且是诚实的：这 22 秒里时间线被推着往前走了 264 演示秒，
   *   即"这段时间它在做你点的那件事，时间线照常流逝"——时间线内容没有被改写。
   *
   * 选不到目的地就返回 `false` 并且**什么都不做**：不抛异常、不改任何状态 ——
   * 该活动（在当前的锚点表下）没有可用锚点时，狗应当继续做它本来在做的事。
   */
  goDo(activity: DogActivityId): boolean {
    // ① 目的地：**按 core 的锚点 id 顺序**（优先项在前）逐个试，选中第一个
    //    "web 侧真的能解析成导航节点"的锚点 —— 挑法与自主行为同一份：
    //    同样是 core 给的 id 顺序 + web 的 `resolveAnchorNode`（见 `pickManualAnchor`）。
    const picked = this.pickManualAnchor(activity);
    if (!picked) return false;

    const def = DOG_ACTIVITY_DEFS[activity];
    const nowS = this.demoS + this.elapsedInSegment;
    /**
     * 合成段。字段与时间线的段**完全一致**（`{ t, durS, activity, posture, anchorId }`）。
     *
     * `durS` 取 `MANUAL_TOTAL_S × timeScale`：`startSegment` 里那条 `nominalS = durS / timeScale`
     * 读到的正是 22 真实秒 —— 整段窗口（走过去 + 做这件事）就落在 `MANUAL_TOTAL_S` 上，
     * 不需要给它开一条"手动专用"的时长分支。这个 `totalS` 随后同时用于两件事：
     * 段内按已用真实秒推进时钟、段边界按总时长把时钟走满 —— 两者因为 `totalS` 恒为 22
     * 而给出同一个值，时钟因此在手动段的两端都不跳（见 `update` 的段切换处）。
     * `t` 写 `nowS`：语义上这段是从当前演示时刻起的。
     */
    const segment: DogBehaviorSegment = {
      t: nowS,
      durS: MANUAL_TOTAL_S * this.timeScale,
      activity,
      posture: def.posture,
      anchorId: picked.anchorId,
    };

    // ② 上一条手动记录先收口（连点两个按钮时，前一次的路程不能凭空丢掉），
    //    再把这一段的实测记账清空，由 `startSegment` 建计划、逐帧累加
    this.finalizeManual();
    this.lastManual = null;
    this.manualAnchor = { x: this.follow.x, z: this.follow.z, activity, anchorId: picked.anchorId, targetNodeId: picked.targetNodeId };
    this.manualMovedM = 0;
    this.manualArrived = false;
    this.goDoCount += 1;
    // ③ 标记 + 时钟基准，然后走与"进入新的一段"**完全同一条路径**
    //    （含 `elapsedInSegment` 归零与路线重算 —— 当前这一段的剩余部分就此作废）
    this.pendingManual = true;
    this.manualClockS = nowS;
    this.startSegment(segment);
    this.applyTransform();
    return true;
  }

  /**
   * 自检用：**最近一次手动触发是什么、当时到没到、走了多远**。
   *
   * 与 `incidentDrift()` 配成一对：
   *   突发那一条要证明"一帧都没动"（`driftM` 恒为 0），
   *   这一条要证明"点了之后它真的走过去、并且走到了"（`driftM` = 走过的米数、`arrived` = true）。
   */
  lastGoDo(): DogManualTrigger | null {
    return this.lastManual;
  }

  /** 手动触发过的总次数（`?debug=1` 徽章里一行就能看出按钮接没接上）。 */
  manualTriggerCount(): number {
    return this.goDoCount;
  }

  /**
   * 这一段的**目的导航节点** id（可能在移动中）。
   *
   * 为什么要有它：`lastGoDo()` 只在段结束时才成文，而"**它正朝哪个节点走**"是过程量 ——
   * 自检（与临时探针）要在段进行中就断言"终点就是那个锚点解析出来的节点"。
   */
  targetNode(): string | null {
    return this.targetNodeId;
  }

  /**
   * 手动触发的目的地挑选：**复用 core 的锚点顺序 + web 的锚点解析**。
   *
   * 顺序的规则与自主行为一致：core 的"优先 id"在前、"允许 id"在后（见 `dog.ts` 的
   * `DOG_DESTINATION_RULES`），逐个交给 `resolveAnchorNode`（与 `startSegment` 同一个调用）
   * 解析成导航节点；解析不出来（该锚点在 web 层没有映射）或解析到的节点不可达就跳过。
   *
   * ⚠️ 这里**只做加法、不做替换**：优先项一个都解析不出来时，才按 `DOG_ANCHOR_IDS` 的规范顺序
   * 在整张锚点表里继续找。这样"**挑不到就返回 false、什么都不做**"这句话才有内容 ——
   * 而不是"找不到就随便挑一个"。
   */
  private pickManualAnchor(activity: DogActivityId): { anchorId: string; targetNodeId: string } | null {
    const prefer = MANUAL_ANCHOR_PREFERENCE[activity] ?? [];
    const ordered = [...prefer, ...DOG_ANCHOR_IDS.filter((id) => !prefer.includes(id))];
    const here: Point2 = { x: this.follow.x, z: this.follow.z };
    // 自主行为遇到"唯一候选就是当前位置"时会退化为原地行为，手动触发则更愿意去**别的**锚点：
    // 用户在院子里点"刨地"时，狗十有八九正站在某个草坪锚点上；一个"走过去 0 米"的
    // 手动触发等于没有走过去那一段。所以第一遍跳过脚下那个节点，第二遍才允许它。
    const reachable: Array<{ anchorId: string; targetNodeId: string }> = [];
    for (const anchorId of ordered) {
      const node = resolveAnchorNode(anchorId, here);
      if (node) reachable.push({ anchorId, targetNodeId: node });
    }
    const elsewhere = reachable.find((c) => c.targetNodeId !== this.currentNodeId);
    return elsewhere ?? reachable[0] ?? null;
  }

  /** 手动这一段结束（或被打断）时，把记账收成一条可读的记录。 */
  private finalizeManual(): void {
    if (!this.manualAnchor) return;
    const plan = this.plan;
    this.lastManual = {
      activity: this.manualAnchor.activity,
      anchorId: this.manualAnchor.anchorId,
      targetNodeId: this.manualAnchor.targetNodeId,
      driftM: Number(this.manualMovedM.toFixed(3)),
      arrived: this.manualArrived,
      windowS: MANUAL_TOTAL_S,
      travelS: Number((plan?.manual ? plan.travelS : 0).toFixed(2)),
    };
    this.manualAnchor = null;
  }

  // ---------------------------------------------------------------- 内部

  private route: Point2[] = [];
  /** 本段的目的导航节点；到位后它就是"当前所在节点"，下一次寻路从它出发。 */
  private targetNodeId: string | null = null;
  /**
   * 本段**目的地的行为锚点 id**（与 `targetNodeId` 一起在 `startSegment` 里定）。
   *
   * 为什么不能像原来那样去 `status()` 里现查 `segment.anchorId`：`status()` 的"当前段"
   * 是从**时间线**上按 `segmentIndex` 取的，而手动触发的那一段在时间线上不存在 ——
   * 于是"它正朝哪个锚点走"这件事在时间线上查不到。存在这里之后，
   * 无论这一段是手动触发的还是时间线给的，问的都是同一件已定的事实。
   */
  private activeAnchorId: string | null = null;

  private currentSegment(): DogBehaviorSegment {
    return (
      this.timeline.segments[this.segmentIndex] ?? {
        t: 0,
        durS: 1,
        activity: 'resting',
        posture: 'lying',
        anchorId: 'floor-living',
      }
    );
  }

  private segmentIndexAt(tS: number): number {
    const segs = this.timeline.segments;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s && tS >= s.t && tS < s.t + s.durS) return i;
    }
    return Math.max(0, segs.length - 1);
  }

  /** 进入一段：算路、算真实时长、切姿态。
   *
   * `segment` 由调用方给出（缺省 = 时间线上的当前段）。手动触发（`goDo`）给的是**合成的**
   * 段 —— 合成了段的形状之后，它就走这条与自主行为完全相同路径：同一次算路、同一套时长换算、
   * 同一个姿态切换。这是"手动活动不许另写一套推进"这句话在代码上的落点。
   */
  private startSegment(segment: DogBehaviorSegment = this.currentSegment(), clockOverrideS?: number): void {
    this.elapsedInSegment = 0;
    this.travelDone = false;
    this.turnDone = false;
    /**
     * 这一段是不是手动触发的：**由 `goDo` 打标记**，而不是由活动名推。
     *
     * 为什么不能按活动名推：这四个活动**也会被时间线自己选中**（那正是上一轮实装的东西），
     * 那种段与手动触发无关 —— 它的时钟该照常推进，UI 也不该报"正在执行你点的动作"。
     * 所以标记在进入这一段之前就定好，`startSegment` 只负责传达。
     */
    const manual = this.pendingManual;
    this.pendingManual = false;
    this.segmentIsManual = manual;

    /**
     * ★ 突发**原地发生**（用户明确要求）。
     *
     * 为什么必须在这一层拦：时间线上的突发段也带一个 `anchorId`（那只是"姿势语义"，
     * 例如抽搐记 `resting`），如果照常寻路，狗会**先走到那个锚点再发作** ——
     * 用户看到的就是"点了抽搐，狗先跑开一段，然后才发抖"。
     * 这既不真实（发作不会等你走到某个位置），也不符合"原地发生"的要求。
     *
     * 所以：突发段的路线就是"当前这一点"，`travelS = 0`，到位与转身直接置真，
     * 位置与朝向**一帧都不动**，只有姿态切过去。演示时钟仍在段内线性推进，
     * 因此突发结束后时间线与画面依然对齐。
     */
    if (segment.incidentKind) {
      this.route = [{ x: this.follow.x, z: this.follow.z }];
      const nominalIncidentS = Math.max(0.1, segment.durS / this.timeScale);
      // `clockS` / `manual` 是手动活动引入的两个字段：突发段一律按**时间线自己的时刻**
      // 起算（`clockS = segment.t`、`manual = false`），于是"时钟在突发段内照常推进"
      // 这条既有行为逐字保持；其余字段与突发那一段完全一样。
      this.segmentIsManual = false;
      this.plan = {
        segment,
        clockS: segment.t,
        travelS: 0,
        performS: Math.max(nominalIncidentS, incidentRealSeconds(segment.incidentKind)),
        totalS: Math.max(nominalIncidentS, incidentRealSeconds(segment.incidentKind)),
        faceHeading: null,
        speedMps: 0,
        manual: false,
      };
      this.follow = { ...this.follow, index: 0, arrived: true, travelled: 0 };
      this.travelDone = true;
      this.turnDone = true;
      // 记账起点：这一段期间任何位移都会被 `incidentDrift()` 报出来
      this.incidentAnchor = { x: this.follow.x, z: this.follow.z, kind: segment.incidentKind };
      this.incidentDriftM = 0;
      this.requestPose(incidentPose(segment.incidentKind));
      return;
    }

    const targetNodeId = resolveAnchorNode(segment.anchorId, { x: this.follow.x, z: this.follow.z });
    this.targetNodeId = targetNodeId;
    this.activeAnchorId = segment.anchorId;
    const spec = DOG_ANCHOR_SPECS.find((a) => a.id === segment.anchorId);
    const speedMps = SPEED_BY_ACTIVITY[segment.activity] ?? 0.9;
    // 手动触发的段不来自时间线：它在时间线上"没有位置"，因此时钟基准只能是
    // **触发那一刻的演示时刻**（`goDo` 把它记在 `manualClockS` 里）。
    // `clockOverrideS` 是段边界那一步传进来的"时钟接着走"的值（见 `update` 段切换处）。
    const clockS = manual ? this.manualClockS : clockOverrideS ?? segment.t;

    let route: Point2[] = [{ x: this.follow.x, z: this.follow.z }];
    if (targetNodeId && targetNodeId !== this.currentNodeId) {
      const ids = routeBetween(this.currentNodeId, targetNodeId);
      if (ids.length >= 2) route = route.concat(ids.slice(1));
    } else if (targetNodeId) {
      const node = navNode(targetNodeId);
      if (node) route = [...route, { x: node.x, z: node.z }];
    }
    this.route = route;

    const distance = polylineLength(route);
    const nominalS = Math.max(0.1, segment.durS / this.timeScale);
    /**
     * 「走过去」与「做这件事」怎么分这 22 秒。
     *
     * ⚠️ 手动那一段必须**恰好**是 `MANUAL_TOTAL_S`：时钟按"真实花了多久 × 倍率"走
     * （见 `update`），而段边界那一步又按 `totalS × 倍率` 把它推满 —— 两者只有在
     * `totalS` 恒等于 22 时才一致。`distance / speed` 做不到这一点：路径跟随有对齐死区，
     * 转弯时会先停下来转，实际用时总比这个估计值长（实测 13.23 m 的路线要 15.2 s，
     * 估计值只有 14.7 s）。所以这里把"走过去"的预算给成"整窗减去最短动作时长"，
     * 让到位这一支（`follow.arrived`）自己决定什么时候进入第二阶段：
     * 到了就开始做，没到就把这 20.4 秒用完，整段仍然是 22 秒。
     */
    const travelS = manual ? Math.max(0, MANUAL_TOTAL_S - MIN_PERFORM_S) : speedMps > 0 ? distance / speedMps : 0;
    const performS = Math.max(MIN_PERFORM_S, nominalS - travelS);

    this.plan = {
      segment,
      clockS,
      travelS,
      performS,
      totalS: travelS + performS,
      faceHeading: spec?.faceHeading ?? null,
      speedMps,
      manual,
    };
    this.follow = startFollow(
      this.follow.x,
      this.follow.z,
      this.follow.heading,
      route.length >= 2 ? route : [{ x: this.follow.x, z: this.follow.z }, { x: this.follow.x, z: this.follow.z }],
    );
    if (route.length < 2) {
      this.travelDone = true;
      this.turnDone = true;
      this.currentNodeId = targetNodeId ?? this.currentNodeId;
    }

    // 走路/小跑/奔跑按速度给步态；定点活动（含手动触发的四个）到位后给该活动的姿态
    if (!this.travelDone) this.requestPose(gaitPose(speedMps));
    else this.requestPose(POSE_BY_ACTIVITY[segment.activity]);
  }

  /** 只在目标姿态变化时请求过渡（见 `requestedPose` 的说明）。 */
  private requestPose(id: DogPoseId): void {
    if (this.requestedPose === id) return;
    this.requestedPose = id;
    this.controller.setPose(id);
  }

  private applyTransform(): void {
    const rig = this.controller.rig;
    // ⚠️ 只有这一处写世界变换（与 dog-controller.ts 的纪律配对）
    rig.root.position.set(this.follow.x, groundHeightAt(this.follow.x, this.follow.z), this.follow.z);
    rig.root.rotation.y = this.follow.heading;
  }

  private sampleProbe(): void {
    if (performance.now() > this.probeUntilMs) return;
    this.probe.push({
      t: performance.now(),
      x: this.follow.x,
      z: this.follow.z,
      heading: this.follow.heading,
      moving: !this.travelDone,
    });
  }
}

/** 速度 → 步态姿态。 */
function gaitPose(speedMps: number): DogPoseId {
  if (speedMps >= 3) return 'run';
  if (speedMps >= 1.4) return 'trot';
  return 'walk';
}

/** 速度 → 步态相位推进速率（每秒的循环数）。步频随速度提高，但不是线性 —— 步幅也在变大。 */
function gaitPhaseSpeed(speedMps: number): number {
  return 0.9 + speedMps * 0.55;
}

function incidentPose(kind: DogIncidentKind): DogPoseId {
  return kind === 'seizure' ? 'seizure' : 'vomit';
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * 脚下地面的高度。
 *
 * 为什么需要一个函数而不是直接用 0：室内地面与木平台在 y = 0，**草坪低 0.12 m**。
 * 不区分的话，狗在院子里会**浮在草地上方 12 cm** —— 这种错误正是"看截图才发现"的典型，
 * 所以把它写成一个可测的纯函数，并让场景每帧调用同一份。
 */
export function groundHeightAt(x: number, z: number): number {
  const deckNear = -HALF_D;
  const deckFar = ENGAWA.minZ;
  const onDeckFootprint = x >= ENGAWA.minX - 0.2 && x <= ENGAWA.maxX + 0.2;
  if (z >= deckNear) return 0; // 室内
  if (onDeckFootprint) {
    if (z >= deckFar) return 0; // 木平台上
    // 平台前缘到草坪之间给一段 0.3 m 的缓坡，避免"一脚踩空"
    const t = Math.min(1, (deckFar - z) / 0.3);
    return 0 + (YARD.groundY - 0) * t;
  }
  return z >= deckFar ? 0 : YARD.groundY;
}

/**
 * 突发的**真实动画时长**（秒）。
 *
 * ⚠️ 这里必须取**动画层**的时长，而不是 core 时间线上那个 `durS`：
 * 时间线上的 `durS` 是**演示秒**（抽搐 30 演示秒），而在 12× 倍率下只有 2.5 真实秒 ——
 * 拿它当段落长度，抽搐动画会在先兆期就被切掉，用户点"抽搐"什么也看不到。
 * 因此运行时把这一段撑到动画真正走完，演示时钟在这一段里走得更慢（见 `startSegment`）。
 */
export function incidentRealSeconds(kind: DogIncidentKind): number {
  return kind === 'seizure' ? SEIZURE_TOTAL_S : VOMIT_TOTAL_S;
}
