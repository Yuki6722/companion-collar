/**
 * 行为层与仿真会话的接缝。
 *
 * 为什么把「锚点表」放在模拟器里而不是 core：
 *   `@camp/core` 的行为层刻意不含任何米制坐标（房间坐标的权威来源是
 *   `apps/web/src/scene/layout.ts`，它同时驱动 3D 摆放与居家资源清单）。
 *   但仿真器在 Node 里跑、拿不到 web 层的 layout，因此这里给出一份
 *   **与 layout 同构的最小锚点清单**：只声明「有哪些锚点、高度多少、具备什么能力」，
 *   用于让时间线里出现真实的位移与攀跳。
 *
 *   ⚠️ 锚点的 `id` 是跨包契约，单一事实来源是 core 的 `CAT_ANCHOR_IDS`（狗是 `DOG_ANCHOR_IDS`）：
 *   本表的 `SIM_CAT_ANCHORS` / `SIM_DOG_ANCHORS` 与 `apps/web/src/scene/cat/anchor-map.ts`、
 *   `apps/web/src/scene/dog/dog-nav.ts` 都按它取 id，
 *   单测会断言两张表的 id 集合与之一致（狗那张还逐字钉住顺序）。
 */
import { INCIDENT_KINDS, DOG_INCIDENT_KINDS, OPERATIVE_CONSTANTS, buildBehaviorTimeline, buildDogTimeline } from '../../core/src/index.ts';
import type {
  CatAnchorSpec,
  CatBehaviorIncidentRequest,
  CatBehaviorTimeline,
  CatIncidentKind,
  DogAnchorSpec,
  DogBehaviorIncidentRequest,
  DogBehaviorTimeline,
  DogIncidentKind,
} from '../../core/src/index.ts';

/**
 * 与 `apps/web/src/scene/layout.ts` 的猫用品坐标对应的锚点。
 *
 * 高度取「猫站上去的台面高度」；地面锚点高度 0。
 * 这里**不写坐标**——仿真只需要高度差来决定「走还是跳」；
 * 真实米制坐标由 web 层的 `anchor-map.ts` 提供（它直接读 `layout.ts`）。
 */
export const SIM_CAT_ANCHORS: readonly CatAnchorSpec[] = [
  { id: 'floor-living', label: '起居区地面', capabilities: ['floor', 'jump-target'], heightM: 0 },
  { id: 'floor-bedroom', label: '睡眠区地面', capabilities: ['floor', 'jump-target'], heightM: 0 },
  { id: 'floor-kitchen', label: '厨房区地面', capabilities: ['floor', 'jump-target'], heightM: 0 },
  { id: 'tree-platform', label: '猫爬架一层平台', capabilities: ['jump-target', 'vertical'], heightM: 0.72 },
  { id: 'tree-top', label: '猫爬架顶台', capabilities: ['vertical', 'sleep', 'jump-target'], heightM: 1.45 },
  { id: 'cat-shelf-low', label: '墙面跳台（低）', capabilities: ['vertical'], heightM: 1.25 },
  { id: 'cat-shelf-high', label: '墙面跳台（高）', capabilities: ['vertical'], heightM: 1.65 },
  { id: 'wardrobe-top', label: '衣柜顶', capabilities: ['vertical'], heightM: 2.4 },
  { id: 'bed-top', label: '床面', capabilities: ['sleep', 'jump-target'], heightM: 0.56 },
  { id: 'sofa-top', label: '沙发面', capabilities: ['sleep', 'jump-target'], heightM: 0.42 },
  { id: 'cat-bed', label: '封闭式猫窝', capabilities: ['sleep', 'hide'], heightM: 0.07 },
  { id: 'hiding-box', label: '纸箱躲藏处', capabilities: ['hide'], heightM: 0.02 },
  { id: 'food-bowls', label: '食盆', capabilities: ['food'], heightM: 0.05 },
  { id: 'fountain', label: '饮水机', capabilities: ['water'], heightM: 0.16 },
  { id: 'water-bowl', label: '第二水碗', capabilities: ['water'], heightM: 0.06 },
  { id: 'litter-a', label: '猫砂盆 A', capabilities: ['litter'], heightM: 0.22 },
  { id: 'litter-b', label: '猫砂盆 B', capabilities: ['litter'], heightM: 0.22 },
];

/**
 * 与 `apps/web/src/scene/dog/dog-nav.ts` 的 `DOG_ANCHOR_SPECS` 对应的狗锚点表。
 *
 * 两条与猫表不同的纪律，都是狗的行为层要求的：
 *   1. **`heightM` 全为 0**：狗不上家具（这不是省略，是场地事实。猫表的 `heightM`
 *      用来判断「走还是跳」，狗没有任何可跳目标，写一个非零高度只会让行为层以为存在攀爬）。
 *   2. **能力里带位置语义**（`yard` / `run` / `elimination`）：狗的「在哪」本身就是行为语义的一部分
 *      ——奔跑只可能发生在院子草坪、排泄只可能落在排泄角、饮水在院内水盆。
 *      这是 `DOG_DESTINATION_RULES` 的硬约束赖以成立的前提，能力漏配不会报错，
 *      只会让某类活动**静默消失**或落到错误的地方。
 *
 * `id` 的顺序**逐字等于** core 的 `DOG_ANCHOR_IDS`（本轮 15 → **20** 个），由
 * `test/dog-session.test.ts` 的跨包契约断言把守——顺序也钉住，因为
 * `dog-nav.ts` 是按这个顺序写死坐标与朝向映射的。
 *
 * 本轮新增的 5 个锚点（草坪中央 / 草坪西侧 / 草坪东侧 / 树下阴影 / 灌木边草地）
 * 是「院子里更多可去的地方」这一条反馈的落点：core 的四种院子互动
 * （玩水 / 打滚 / 刨地 / 晒太阳）各自按**能力**筛目的地，能力漏配不会报错，
 * 只会让那一种互动**静默消失**。另外 `yard-pond` 补上了 `water`——
 * 有了它，池塘才既能被「玩水」选中，又仍然不在「饮水」的白名单里。
 */
export const SIM_DOG_ANCHORS: readonly DogAnchorSpec[] = [
  { id: 'floor-living', label: '起居区', capabilities: ['floor', 'play'], heightM: 0 },
  { id: 'floor-kitchen', label: '厨房前走道', capabilities: ['floor'], heightM: 0 },
  { id: 'floor-entry', label: '玄关', capabilities: ['floor'], heightM: 0 },
  { id: 'floor-bedroom', label: '睡眠区', capabilities: ['floor', 'rest'], heightM: 0 },
  { id: 'floor-east', label: '电视柜北侧走道', capabilities: ['floor', 'play'], heightM: 0 },
  { id: 'floor-north', label: '推拉门前', capabilities: ['floor', 'doorway'], heightM: 0 },
  { id: 'food', label: '食盆前', capabilities: ['food'], heightM: 0 },
  { id: 'bed-main', label: '主软垫', capabilities: ['rest'], heightM: 0 },
  { id: 'bed-sleep', label: '床边软垫', capabilities: ['rest'], heightM: 0 },
  { id: 'outdoor-water', label: '院内水盆', capabilities: ['water', 'yard'], heightM: 0 },
  { id: 'yard-lawn', label: '院内草坪', capabilities: ['yard', 'run', 'play'], heightM: 0 },
  { id: 'elimination', label: '院北草地（排泄角）', capabilities: ['elimination', 'yard'], heightM: 0 },
  { id: 'yard-lounge', label: '休闲区', capabilities: ['yard', 'rest', 'play'], heightM: 0 },
  // `water` 是本轮补上的：dog-nav 的表与 core 的能力联合都必须同时有它，
  // 否则「玩水」找不到目的地（活动消失），或者池塘被「饮水」白名单漏收。
  { id: 'yard-pond', label: '池塘边', capabilities: ['yard', 'play', 'water'], heightM: 0 },
  { id: 'deck', label: '木平台', capabilities: ['yard', 'doorway', 'rest'], heightM: 0 },
  { id: 'yard-lawn-center', label: '草坪中央', capabilities: ['yard', 'run', 'play', 'roll'], heightM: 0 },
  { id: 'yard-lawn-west', label: '草坪西侧', capabilities: ['yard', 'roll', 'sun'], heightM: 0 },
  { id: 'yard-lawn-east', label: '草坪东侧', capabilities: ['yard', 'run', 'play'], heightM: 0 },
  { id: 'yard-shade', label: '树下阴影', capabilities: ['yard', 'rest', 'sun'], heightM: 0 },
  { id: 'yard-dig', label: '灌木边草地', capabilities: ['yard', 'dig'], heightM: 0 },
];

/**
 * 一次突发注入请求，**猫狗共用**。
 *
 * 为什么把 `kind` 放宽成两个种类联合而不是各写一份：
 *   狗的两个突发名（`seizure` / `vomit`）在类型上本来就是猫联合的子集，
 *   但**调用方的写法**完全不同——狗版页面按 `DogIncidentKind` 传参、猫版按 `CatIncidentKind`。
 *   如果这里只写猫的种类，狗版页面就必须在调用点做一次 `as` 断言才能编译通过，
 *   而那种断言恰好会掩盖「把狗的种类注进猫的时间线」这类错误。
 *   统一到一个联合上，两侧都能原样传参，真正的物种分派放到运行时按档案判断。
 *
 * ⚠️ 运行时纪律：`kind` 只有**当前物种合法**的那些才会被采纳
 *   （`seizure` / `vomit` 两个名字两边都有，其余按物种过滤）。
 *   一个物种不认识的名字会被丢弃，而不是硬塞进时间线。
 */
export interface IncidentRequest {
  atS: number;
  kind: CatIncidentKind | DogIncidentKind;
}

/** 该名字是不是猫的行为层认识的突发种类。 */
export function isCatIncidentKind(kind: string): kind is CatIncidentKind {
  return (INCIDENT_KINDS as readonly string[]).includes(kind);
}

/** 该名字是不是狗的行为层认识的突发种类。 */
export function isDogIncidentKind(kind: string): kind is DogIncidentKind {
  return (DOG_INCIDENT_KINDS as readonly string[]).includes(kind);
}

/**
 * 一次会话所需的锚点表之外的选项（猫）。
 *
 * `anchors` 保持**猫的表**类型不变：把它改成 `CatAnchorSpec | DogAnchorSpec` 的联合以后，
 * 每一处猫的调用点都要先收窄一次类型才能用——为了一条狗的新路径，付全仓的代价不划算。
 * 狗的锚点走下面 `DogBehaviorLayerOptions.dogAnchors`。
 */
export interface BehaviorLayerOptions {
  enabled?: boolean;
  seed?: number;
  timeScale?: number;
  awayWindows?: ReadonlyArray<readonly [number, number]>;
  anchors?: readonly CatAnchorSpec[];
  injectIncidents?: ReadonlyArray<IncidentRequest>;
}

/** 狗的行为层选项。与猫版并列而不是合并，理由同上（猫的锚点表类型不该被撑宽）。 */
export interface DogBehaviorLayerOptions {
  seed?: number;
  timeScale?: number;
  /** 缺省用 `SIM_DOG_ANCHORS`。留出口是为了让测试能塞一两块地面的退化场地。 */
  dogAnchors?: readonly DogAnchorSpec[];
  injectIncidents?: ReadonlyArray<IncidentRequest>;
}

/**
 * 行为层默认倍率。
 *
 * ⚠️ 从 core 的操作化常量读取，不在这里写死：倍率同时决定「一个行为片段在屏幕上停留多久」
 * 与「一天能否在一场演示里走完」，写死在多处必然漂移（见 `OPERATIVE_CONSTANTS.behaviorTimeScale`）。
 */
export const DEFAULT_TIME_SCALE =
  OPERATIVE_CONSTANTS.find((c) => c.id === 'behaviorTimeScale')?.value ?? 20;

/**
 * 为一次会话生成**猫**的行为时间线。
 *
 * 与生理采样**共用同一个 `durationS`**，这样 `truth.injectedIncidents` 的时刻
 * 可以直接与 `samples` 对齐做方向断言。
 *
 * `injectIncidents` 在这里过一次物种过滤：类型放宽成联合之后，运行时必须把
 * 「这个物种不认识的突发名」挡在外面（否则它会以 `undefined` 的时长混进时间线）。
 * 对猫而言这一步是恒等的——猫的种类集合本来就包含狗的两个名字。
 */
export function buildSessionBehavior(
  seed: number,
  durationS: number,
  options: Omit<BehaviorLayerOptions, 'enabled' | 'seed'> = {},
): CatBehaviorTimeline {
  return buildBehaviorTimeline({
    seed,
    durationS,
    timeScale: options.timeScale ?? DEFAULT_TIME_SCALE,
    awayWindows: options.awayWindows ?? [],
    anchors: options.anchors ?? SIM_CAT_ANCHORS,
    injectIncidents: (options.injectIncidents ?? []).filter(
      (req): req is CatBehaviorIncidentRequest => isCatIncidentKind(req.kind),
    ),
  });
}

/**
 * 为一次会话生成**狗**的行为时间线（走 core 的 `buildDogTimeline`，不是猫的那条路）。
 *
 * 与猫版的三处差别，每一处都对应一个具体的故障模式：
 *   1. 锚点缺省用 `SIM_DOG_ANCHORS`。**忘了传锚点是最隐蔽的错**：狗的引擎会退化成
 *      「只有一块地面」的场地，时间线照样连续、照样确定，只是狗一整天待在一个点上，
 *      资源定点类活动全部消失——从数据上很难一眼看出，因此单测另加了一条
 *      「至少覆盖 6 个不同锚点」的断言。
 *   2. 不接 `awayWindows`：离家窗口是猫版的行为输入，狗的节律自带一份
 *      （`dogActivityWeights` 内部用 `isOwnerAwayHour`），硬塞一个猫的窗口只会两套参数打架。
 *   3. `injectIncidents` 按狗的突发种类过滤（`DogIncidentKind` 只有两个取值）。
 */
export function buildSessionDogBehavior(
  seed: number,
  durationS: number,
  options: DogBehaviorLayerOptions = {},
): DogBehaviorTimeline {
  return buildDogTimeline({
    seed,
    durationS,
    timeScale: options.timeScale ?? DEFAULT_TIME_SCALE,
    anchors: options.dogAnchors ?? SIM_DOG_ANCHORS,
    injectIncidents: (options.injectIncidents ?? []).filter(
      (req): req is DogBehaviorIncidentRequest => isDogIncidentKind(req.kind),
    ),
  });
}

/**
 * 会话内秒 → 当日小时数。与 core 的 `hourOfDayAt` 同源，这里再导出一次是为了
 * 让仿真侧（例如「离家窗口落在哪几个小时」的报告）不必再 import 一次 core 内部路径。
 */
export { hourOfDayAt, DAY_START_HOUR } from '../../core/src/behavior/contract.ts';
