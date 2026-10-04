/**
 * 狗的行为词汇与时间线生成器。
 *
 * 为什么狗自成一套，而不是给猫的参数加一个 `species` 开关：
 *   仓库纪律是「**共用机制、分开参数**」（AGENTS.md §8）。猫的行为层一行不改，
 *   狗在这里自带词汇与权重。理由有三条，都是具体的：
 *     1. **作息不同**。猫版 `rhythm.ts` 的曲线是晨昏两个尖峰、白天大量时间在睡；
 *        家犬在主人作息下是两个**宽肩**——清晨一次（散步/喂食）、傍晚一次（散步/互动），
 *        夜间连续睡眠。把狗的权重塞进猫的曲线，等于让两套参数互相拉扯，最后谁都不对。
 *     2. **活动词汇不同**。猫的高处停留、抓挠、砂盆，在狗这里没有对应物；
 *        狗有牵引散步、小跑、嗅闻、户外排泄这类猫版不存在的段。
 *     3. **硬约束不同**。狗的进食只发生在食盆、饮水只发生在院内水盆（或食盆旁的
 *        那只水碗）、排泄只发生在院子里的排泄角——这些「资源定点」约束在猫版里
 *        并不存在，必须由狗版自己断言。
 *
 * ⚠️ 边界（与代码一起读，不要跳）：
 *   本文件只描述**外部可观察的动作、姿势与时间**。它刻意**没有**情绪、感受、疼痛或
 *   任何状况的取值。突发类型的取值全部是**动作名**（抽搐、呕吐），不是状况名。
 *   权重与时长是**操作化常量**（本项目为了能跑起来自行选定），不是文献数字：
 *   一手来源里没有「家犬一天走多少比例」这类可直接引用的占比，因此这里只保证结构性结论
 *   （白天活动多于夜间、夜间睡眠占主体、奔跑短促）成立，界面上也不展示这些数值。
 *
 * 与房间坐标的关系（与猫版同一条边界）：
 *   本文件**不含任何米制坐标**。锚点坐标的权威来源是 `apps/web/src/scene/dog/layout-dog.ts`，
 *   这里只声明「需要一个具备哪些能力的锚点」（可睡 / 可排泄 / 能在院子里跑）。
 */
import { DAY_START_HOUR, hourOfDayAt } from './contract.ts';
import { OWNER_ACTIVE_HOURS, isOwnerAwayHour } from './rhythm.ts';
import type { BehaviorRng } from './rng.ts';
import { makeBehaviorRng } from './rng.ts';

// ---------------------------------------------------------------- 词汇

/**
 * 姿势：狗此刻身体在摆什么形状。
 *
 * 后四个名字（`down` / `water-play` / `rolling` / `digging`）**与 web 控制器的姿态 id 同名**
 * （`apps/web/src/scene/dog/dog-controller.ts` 的 `DogPoseId`）。core 不 import 那份声明
 * ——包边界与运行时导入纪律都不允许——但名字必须一致：段落的 `posture` 最终要落到
 * 控制器里某一种姿态上，名字对不上就等于「行为层说的姿势画面上不存在」。
 *
 * `down` **不是新造的身体形状**：它表达的就是 `lying` 那一类趴卧，沿用控制器里已有的
 * 那个名字，让「晒太阳」的段落在姿态通道上与「休息」分开记（同一个身体形状、不同的发生条件）。
 * 原有五个名字一个字未动——猫版与既有断言都依赖它们的取值集合。
 */
export type DogPosture =
  | 'standing'
  | 'sitting'
  | 'lying'
  | 'moving'
  | 'lowered'
  | 'down'
  | 'water-play'
  | 'rolling'
  | 'digging';

/** 行为状态：狗此刻在做什么。全部是外部可观察的动作名。 */
export type DogActivityId =
  | 'resting'
  | 'sleeping'
  | 'walking'
  | 'trotting'
  | 'running'
  | 'sniffing'
  | 'drinking'
  | 'eating'
  | 'playing'
  | 'eliminating'
  | 'sitting'
  | 'alerting'
  | 'water-play'
  | 'rolling'
  | 'digging'
  | 'sunning';

export interface DogActivityDef {
  id: DogActivityId;
  /** 面向用户的中文名——只描述外部可观察量 */
  label: string;
  /** 该行为的默认姿势 */
  posture: DogPosture;
  /**
   * 基准权重。真实抽样时按当日时刻与确定性抖动再变形；
   * `weight: 0` 表示「基准上不由随机调度产生」，由可用性判定临时给权重
   * （奔跑就是这种：只在院子里、只在活跃时段）。
   */
  weight: number;
  /** 一句话说明「看什么」 */
  hint: string;
}

export const DOG_ACTIVITY_IDS: readonly string[] = [
  'resting',
  'sleeping',
  'walking',
  'trotting',
  'running',
  'sniffing',
  'drinking',
  'eating',
  'playing',
  'eliminating',
  'sitting',
  'alerting',
  'water-play',
  'rolling',
  'digging',
  'sunning',
];

export const DOG_ACTIVITY_DEFS: Readonly<Record<DogActivityId, DogActivityDef>> = {
  resting: {
    id: 'resting',
    label: '休息',
    posture: 'lying',
    weight: 0.5,
    hint: '卧下、头部抬起或侧放，仍会注意门口与走动的人',
  },
  sleeping: {
    id: 'sleeping',
    label: '睡眠',
    posture: 'lying',
    weight: 0.8,
    hint: '卧下不动、呼吸平稳、对普通脚步声无反应',
  },
  walking: {
    id: 'walking',
    label: '走动',
    posture: 'moving',
    weight: 0.6,
    hint: '四爪匀速交替着地，鼻子靠近地面或前方',
  },
  trotting: {
    id: 'trotting',
    label: '小跑',
    posture: 'moving',
    weight: 0.35,
    hint: '对角步、身体有弹性起伏，比走动明显快',
  },
  running: {
    id: 'running',
    label: '奔跑',
    posture: 'moving',
    // 基准权重给 0 是**刻意的**：奔跑只能落在院子里，且是短时冲刺。
    // 它由「锚点表里存在可奔跑的院子锚点」在采样时临时给权重（见 dogActivityWeights）。
    weight: 0,
    hint: '短时冲刺，四肢同时离地、转弯幅度大',
  },
  sniffing: {
    id: 'sniffing',
    label: '嗅闻',
    posture: 'moving',
    weight: 0.5,
    hint: '低头贴地、鼻部快速抽动，移动缓慢且多停顿',
  },
  drinking: {
    id: 'drinking',
    label: '饮水',
    posture: 'lowered',
    weight: 0.1,
    hint: '低头在水盆边，舌部向后卷水',
  },
  eating: {
    id: 'eating',
    label: '进食',
    posture: 'lowered',
    weight: 0.12,
    hint: '低头在食盆前咬取，尾部摆幅减小',
  },
  playing: {
    id: 'playing',
    label: '玩耍',
    posture: 'standing',
    weight: 0.3,
    hint: '前肢压低、后躯抬高（邀玩），或对物件甩咬',
  },
  eliminating: {
    id: 'eliminating',
    label: '排泄',
    posture: 'lowered',
    weight: 0.06,
    hint: '在固定角落嗅地转圈后蹲下，公犬可能抬腿',
  },
  sitting: {
    id: 'sitting',
    label: '坐',
    posture: 'sitting',
    weight: 0.4,
    hint: '后躯着地、前肢支撑，头抬起看着人或门',
  },
  alerting: {
    id: 'alerting',
    label: '警觉张望',
    posture: 'standing',
    weight: 0.3,
    hint: '站立、头颈抬起、耳与视线朝向声源或门口',
  },
  // ---- 院子里的四种互动（本轮新增）----
  // 四者的 `weight` 都写 0，与奔跑同一条纪律：它们的发生**前提是院子里存在对应锚点**
  // （池塘/草坪/灌木边/阴影），基准权重给 0，由 `dogActivityWeights` 在可用性成立时
  // 临时给权重。写成非零基准会让「场地里没有那个地方」时也选中，只能原地退化——
  // 那就是「加了活动却从不真的发生」的那一类静默失效。
  'water-play': {
    id: 'water-play',
    label: '玩水',
    posture: 'water-play',
    weight: 0,
    hint: '站在浅水边，前肢交替拍打水面、低头啃咬溅起的水花',
  },
  rolling: {
    id: 'rolling',
    label: '草地打滚',
    posture: 'rolling',
    weight: 0,
    hint: '侧身倒下、背部贴地来回翻滚，四爪在空中交替划动',
  },
  digging: {
    id: 'digging',
    label: '刨地',
    posture: 'digging',
    weight: 0,
    hint: '前肢交替向后刨土、鼻部贴近新翻开的土面',
  },
  sunning: {
    id: 'sunning',
    label: '晒太阳',
    posture: 'down',
    weight: 0,
    hint: '在日光里侧卧伸展、长时间不动，只在换姿势时调整',
  },
};

/** 姿势的中文名。与活动名同一条纪律：面向用户的词只定义一处。 */
export const DOG_POSTURE_LABELS: Readonly<Record<DogPosture, string>> = {
  standing: '站立',
  sitting: '坐',
  lying: '卧',
  moving: '移动',
  lowered: '低头压低',
  // `down` 与 `lying` 是同一个身体形状的两种记法：前者沿用 web 控制器里已有的姿态 id，
  // 让「晒太阳」这一段在姿态通道上与「休息」分开（同一个形状、不同的发生条件）。
  down: '趴卧',
  'water-play': '前肢拍水',
  rolling: '侧身翻滚',
  digging: '前肢刨地',
};

/**
 * 突发演示动作。全部是动作名，不是状况名。
 *
 * 只保留两个：狗版场景的演示按钮就是「抽搐 / 呕吐」两个，与界面入口一一对应。
 * 猫版的 `labored-breathing` / `freezing` / `withdrawal` 在狗这里没有演示出口，
 * 与其留一个没有出口的取值，不如让词汇表与界面保持一致。
 */
export type DogIncidentKind = 'seizure' | 'vomit';

/** 突发的一个时相。`phases` 的 `durS` 之和必须等于 `durationS`（由单测钉住）。 */
export interface DogIncidentPhase {
  name: string;
  durS: number;
}

export interface DogIncidentDef {
  kind: DogIncidentKind;
  /** 只描述动作，不描述原因 */
  label: string;
  hint: string;
  /**
   * 覆盖期间的姿势。与单测的「突发与活动相符」断言绑定：
   *   抽搐 → `lying`（侧卧不动）；呕吐 → `lowered`（站立低头）。
   */
  posture: DogPosture;
  /** 演示时长（秒）——**给人看的绝对秒数**，等于 `phases` 各时相之和。 */
  durationS: number;
  phases: readonly DogIncidentPhase[];
}

export const DOG_INCIDENT_DEFS: Readonly<Record<DogIncidentKind, DogIncidentDef>> = {
  seizure: {
    kind: 'seizure',
    label: '抽搐发作',
    hint: '倒卧、四肢与躯干不自主抽动，随后有一段站立不稳的恢复期',
    posture: 'lying',
    durationS: 30,
    // 时相划分的依据是**现场可观察的动作顺序**，不是病理描述：
    // 先僵直 → 再抽动 → 最后有一段恢复。按这个顺序分配时长，
    // 画面上才「不是从头到尾都在抖」。
    phases: [
      { name: '僵直期', durS: 5 },
      { name: '抽动期', durS: 15 },
      { name: '恢复期', durS: 10 },
    ],
  },
  vomit: {
    kind: 'vomit',
    label: '呕吐',
    hint: '站立低头、腹部反复收缩，随后舔唇与吞咽',
    posture: 'lowered',
    durationS: 60,
    // 呕吐的腹部收缩本身只有几次，绝大部分时长落在**前兆与恢复**上。
    // 时相划分如实反映这一点：不做成「60 秒一直在吐」。
    phases: [
      { name: '前兆期', durS: 20 },
      { name: '呕吐期', durS: 15 },
      { name: '恢复期', durS: 25 },
    ],
  },
};

export const DOG_INCIDENT_KINDS: readonly DogIncidentKind[] = ['seizure', 'vomit'];

/**
 * 常驻边界句。UI 必须原样展示，不得改写成「识别」「检出」这类措辞。
 * 注意否定标记（不是 / 也不构成）与词本身**在同一行**——这是措辞门禁的例外条件。
 */
export const DOG_INCIDENT_BOUNDARY_NOTE =
  '突发演示：以上是你手动触发的动画演示，不是系统对狗的感受、情绪或身体状况的识别，也不构成任何诊断；演示时长是为了让人看清而被压缩的，不代表真实发作时长。若你的狗真的出现类似表现，请录像并联系兽医。';

/** 转诊路径（固定文案）。与猫版同一条纪律：给边界，也给下一步该做什么。 */
export const DOG_INCIDENT_REFERRAL_NOTE =
  '以下情形在权威兽医资料中列为需要尽快就诊：发作持续不缓解或短时间内反复发作、呕吐反复不止或伴随精神沉郁、腹部膨大却吐不出东西、呼吸费力或站立不稳。请录像并联系兽医，不要等待。';

// ---------------------------------------------------------------- 锚点契约

/**
 * 狗的锚点 id 清单：跨包契约的单一事实来源。
 *
 * `apps/web/src/scene/dog/dog-nav.ts` 已按这份 id 写死了坐标与朝向映射，
 * 两边必须逐字一致，否则画面上的狗会「走进一个行为层不存在的锚点」。
 * 顺序也与 web 层保持一致，便于人工对账。
 */
export const DOG_ANCHOR_IDS: readonly string[] = [
  'floor-living',
  'floor-kitchen',
  'floor-entry',
  'floor-bedroom',
  'floor-east',
  'floor-north',
  'food',
  'bed-main',
  'bed-sleep',
  'outdoor-water',
  'yard-lawn',
  'elimination',
  'yard-lounge',
  'yard-pond',
  'deck',
  // ---- 院子里的互动锚点（本轮新增 5 个）----
  // 追加在末尾而不是插进院子那一段中间：`apps/web` 的 `DOG_ANCHOR_SPECS` 与
  // `simulator` 的 `SIM_DOG_ANCHORS` 都按这个顺序写死映射，追加式改动最不容易错位。
  'yard-lawn-center',
  'yard-lawn-west',
  'yard-lawn-east',
  'yard-shade',
  'yard-dig',
];

/** 锚点 id → 中文名；供 UI 显示「狗现在在哪」。 */
export const DOG_ANCHOR_LABELS: Readonly<Record<string, string>> = {
  'floor-living': '起居区',
  'floor-kitchen': '厨房前走道',
  'floor-entry': '玄关',
  'floor-bedroom': '睡眠区',
  'floor-east': '电视柜北侧走道',
  'floor-north': '推拉门前',
  food: '食盆前',
  'bed-main': '主软垫',
  'bed-sleep': '床边软垫',
  'outdoor-water': '院内水盆',
  'yard-lawn': '院内草坪',
  elimination: '院北草地（排泄角）',
  'yard-lounge': '休闲区',
  'yard-pond': '池塘边',
  deck: '木平台',
  'yard-lawn-center': '草坪中央',
  'yard-lawn-west': '草坪西侧',
  'yard-lawn-east': '草坪东侧',
  'yard-shade': '树下阴影',
  'yard-dig': '灌木边草地',
};

/**
 * 锚点能力。
 *
 * ⚠️ 与猫版的**关键差别**：狗的「在哪」本身就是行为语义的一部分。
 * 奔跑只可能发生在院子里、排泄只可能发生在固定的排泄角、饮水在院内水盆，
 * 因此能力里必须有 `yard` / `run` / `elimination` 这类**位置语义**，
 * 而不能只像猫那样按「可跳上 / 可躲藏」分类。
 *
 * 取值与 `apps/web/src/scene/dog/dog-nav.ts` 的 `DogAnchorCapability` 一致；
 * 这里不 import 那份声明，是因为 `core` 不得在运行时导入其它包，
 * 类型上的耦合由单测的锚点表断言兜住（见 `dog-behavior.test.ts`）。
 */
export type DogAnchorCapability =
  | 'floor'
  | 'rest'
  | 'food'
  | 'water'
  | 'yard'
  | 'elimination'
  | 'play'
  | 'run'
  | 'doorway'
  // ---- 院子互动新增的三项能力（本轮）----
  // 取值与 `apps/web/src/scene/dog/dog-nav.ts` 的 `DogAnchorCapability` 逐字一致：
  // 能力是**语义**（这里能不能翻滚 / 有没有太阳 / 地面能不能刨），id 是**坐标**。
  | 'roll'
  | 'sun'
  | 'dig';

/**
 * 锚点规范。`capabilities` 声明为 `readonly string[]` 而不是能力联合：
 * 消费方（web 层）有自己更严格的能力类型，宽接收窄赋值是安全的；
 * 反过来要求它 import core 的能力联合则会把类型耦合变成运行时耦合。
 */
export interface DogAnchorSpec {
  id: string;
  label: string;
  capabilities: readonly string[];
  heightM: number;
}

// ---------------------------------------------------------------- 目的地规则

/**
 * 各类活动的**目的地规则**。
 *
 * 为什么要三样东西（能力 / 优先 id / 允许 id）而不是只写能力：
 *   能力是**语义**（「有没有食盆」），id 是**坐标**（「哪个是食盆」）。
 *   只按能力挑，一旦锚点表里出现第二个具备同一能力的锚点（例如院内水盆与池塘都被标成
 *   `water`），狗就会去喝池塘的水——这正是本文件必须把它排除掉的那一类错误。
 *   因此资源定点类活动同时给出「优先 id」与「允许 id」，只有**同时**满足语义与位置
 *   的锚点才会被选中；两者都不满足时宁可就地退化，也不随便挑一个。
 *
 * `allowed: null` 表示这一类活动没有位置限制（走动、嗅闻、休息、玩耍……）。
 */
interface DogDestinationRule {
  /** 能力：任一满足即可 */
  capabilities: readonly DogAnchorCapability[];
  /** 优先 id（按顺序优先）。用于把资源定点类活动钉在指定位置 */
  preferIds?: readonly string[];
  /** 允许 id。非 null 表示**只能**落在这些锚点上 */
  allowedIds?: readonly string[];
}

const DOG_DESTINATION_RULES: Readonly<Record<DogActivityId, DogDestinationRule>> = {
  // 休息/睡眠优先软垫；没有软垫时任何地面都成立（退化为就地卧下）
  resting: { capabilities: ['rest'] },
  sleeping: { capabilities: ['rest'] },
  // 走动：任何地面或院子
  walking: { capabilities: ['floor', 'yard'] },
  // 小跑：优先院子（室内走道跑不开），没有院子才退回室内地面
  trotting: { capabilities: ['yard'], preferIds: ['yard-lawn', 'yard-lounge'] },
  // 奔跑：只可能在院子里，且只钉在草坪——短时冲刺需要直线距离。
  // ⚠️ 三个草坪锚点都带 `run`，允许集合必须**写全**（与 `playing` 同一条纪律）：
  //    白名单漏掉一个，狗在「草坪中央」想跑时会因为找不到别处而原地退化。
  running: {
    capabilities: ['run'],
    preferIds: ['yard-lawn', 'yard-lawn-center', 'yard-lawn-east'],
    allowedIds: ['yard-lawn', 'yard-lawn-center', 'yard-lawn-east'],
  },
  // 嗅闻：草地与走道都成立
  sniffing: { capabilities: ['floor', 'yard'] },
  // 饮水：院内水盆优先，食盆旁的那只水碗是合法备选。
  // ⚠️ 池塘**不在允许列表里**——让狗去喝池塘的水是场景里不该出现的动作。
  drinking: { capabilities: ['water', 'food'], preferIds: ['outdoor-water'], allowedIds: ['outdoor-water', 'food'] },
  // 进食：只可能在食盆前
  eating: { capabilities: ['food'], preferIds: ['food'], allowedIds: ['food'] },
  // 玩耍：草坪 → 休闲区 → 起居区。
  // ⚠️ 允许集合必须写**全部具备 play 能力的锚点**，不能只写三个优先项：
  //    优先项只影响抽签偏好，若把其余 play 锚点排除在允许集合外，
  //    「狗已经在池塘边玩耍」时就会因为找不到「别处」而原地退化，行为凭空消失。
  playing: {
    capabilities: ['play'],
    preferIds: ['yard-lawn', 'yard-lounge', 'floor-living'],
    // 本轮新增的两个草坪锚点也带 `play`，同样必须写进允许集合（理由见上）
    allowedIds: [
      'yard-lawn',
      'yard-lawn-center',
      'yard-lawn-east',
      'yard-lounge',
      'floor-living',
      'floor-east',
      'yard-pond',
    ],
  },
  // 排泄：硬约束——只可能在院内排泄角
  eliminating: { capabilities: ['elimination'], preferIds: ['elimination'], allowedIds: ['elimination'] },
  sitting: { capabilities: ['rest', 'floor', 'yard'] },
  alerting: { capabilities: ['floor', 'yard'] },
  // ---- 院子里的四种互动 ----
  // 玩水（用户点名的交互）：走到池塘边用前肢拍水。
  // ⚠️ 允许集合是两个**具备 `water` 且属于院子**的锚点：池塘是用户点名的地点，
  //    院内水盆是既有的合法备选。`drinking` 的允许集合**不含池塘**（见上），
  //    两份白名单互不串门——「池塘可以玩水，但不在那里喝水」这条区分全写在这里。
  'water-play': {
    capabilities: ['water'],
    preferIds: ['yard-pond', 'outdoor-water'],
    allowedIds: ['yard-pond', 'outdoor-water'],
  },
  // 草地打滚：只在两块标了 `roll` 的草坪上（能力是「地面够平够软」的仿真语义）
  rolling: {
    capabilities: ['roll'],
    preferIds: ['yard-lawn-center', 'yard-lawn-west'],
    allowedIds: ['yard-lawn-center', 'yard-lawn-west'],
  },
  // 刨地：只有灌木边那一块标了 `dig`，与排泄角、草坪都不重合
  digging: { capabilities: ['dig'], preferIds: ['yard-dig'], allowedIds: ['yard-dig'] },
  // 晒太阳：树下阴影 / 草坪西侧 / 木平台。
  // ⚠️ 能力写 `['sun', 'rest']` 而不是只写 `['sun']`：`deck`（木平台）具备 `rest`
  //    但**没有** `sun`——能力表是跨包契约，本轮只允许给 `yard-pond` 加 `water`，
  //    不能顺手给 deck 补一个能力。若这里只写 `sun`，能力池会先把 deck 滤掉，
  //    白名单写得再全也选不中它。这正是「能力是语义、id 是坐标」两层过滤最容易踩空的一处。
  sunning: {
    capabilities: ['sun', 'rest'],
    preferIds: ['yard-shade', 'yard-lawn-west', 'deck'],
    allowedIds: ['yard-shade', 'yard-lawn-west', 'deck'],
  },
};

/** 移动类活动：这些活动的 `anchorId` 是**目的地**锚点。 */
const MOVEMENT_ACTIVITIES: ReadonlySet<DogActivityId> = new Set<DogActivityId>([
  'walking',
  'trotting',
  'running',
  'sniffing',
]);

/** 移动段时长区间（秒）。规则要求 8–40 s 的短段；奔跑再压一档，读作「冲刺」。 */
const MOVE_SECONDS: Readonly<Record<string, readonly [number, number]>> = {
  walking: [10, 40],
  trotting: [8, 24],
  running: [8, 14],
  sniffing: [10, 40],
};

/** 定点段时长区间（秒）。休息与睡眠可以长（60–300 s），吃喝与排泄是短窗口。 */
const STAY_SECONDS: Readonly<Record<string, readonly [number, number]>> = {
  resting: [60, 300],
  sleeping: [60, 300],
  sitting: [60, 240],
  playing: [60, 180],
  eating: [60, 150],
  drinking: [60, 120],
  eliminating: [60, 120],
  // ---- 院子里四种互动的**整段窗口**（含走过去的那一小段）----
  // ⚠️ 为什么给的是「窗口」而不是「动作本身几秒」：引擎把一次选定拆成
  //    「走过去（≤ 窗口的 40%，8–40 s 硬区间）+ 到位后的动作（剩下的）」。
  //    因此窗口必须大于「最短移动 10 s + 动作时长」，否则整段会被记成 walking、
  //    活动**一次都不会发生**（这是本轮实测到的坑：窗口取 12 s 时打滚零次）。
  //    由此反推，下面三个窗口对应的动作时长落在**十几秒**量级；
  //    晒太阳给到 5–15 分钟，它本来就是「长时间不动的日照停留」。
  'water-play': [20, 34],
  rolling: [18, 30],
  digging: [20, 34],
  sunning: [300, 900],
  // 到达目的地后的短暂停留：它属于移动段的收尾，用短段即可
  walking: [20, 60],
  trotting: [20, 60],
  running: [20, 60],
  sniffing: [20, 60],
};

/** 行为推进的步长（秒）。与猫版同量级：让注入的突发得到足够多的求值采样点。 */
export const DOG_BEHAVIOR_STRIDE_S = 30;

/**
 * 注入突发前预留的推进余量（秒）。
 *
 * 事件循环先推进到 `atS - 该余量`，再把游标**裁短**对齐到 `atS`。
 * 余量不能取 1 s：那样裁短会把末段切成 1 秒的碎片，而「休息/睡眠段 60–300 s、
 * 移动段 8–40 s」是行为层的时长纪律，不该被一次注入破坏。
 */
const INCIDENT_BACKOFF_S = 60;

/**
 * 定点段的**下限**（秒）：到达目的地之后，值得为之停留的最短时间。
 *
 * 与 `STAY_SECONDS` 的区别：那里是「一次完整停留抽多长」，这里是「窗口不够时还值不值得拆出
 * 一段停留」。它同时被用作拆分判据——窗口容不下「最短移动 + 最短停留」就不再拆分，
 * 避免产生「坐 0.8 秒」这类碎片段。
 */
const STAY_FLOOR_S: Readonly<Partial<Record<DogActivityId, number>>> = {
  resting: 60,
  sleeping: 60,
  playing: 60,
  eating: 60,
  drinking: 60,
  eliminating: 60,
  // 四种院子互动的下限就是「这次值不值得拆出一段动作」的判据。
  // ⚠️ 这三个数（8 / 10 s）与上面的窗口区间是**配对**的：`canSplit` 要求
  //    窗口 ≥ 最短移动（10 s）+ 这里的地板，窗口区间正是按这个不等式取的。
  //    改动其中一边，另一边必须跟着改，否则活动会静默退化成 walking。
  'water-play': 10,
  rolling: 8,
  digging: 10,
  sunning: 120,
};

/**
 * 缺省锚点表：**只有一块地面**。
 *
 * 为什么不是空数组：`DOG_ANCHOR_IDS[0]` 是 `floor-living`，web 层的退化路径也指它。
 * 有了它，`anchors` 缺省时行为仍然有效——只是不产生任何真实位移，资源定点类活动
 * 因为找不到对应锚点而不会被选中（不会出现「在起居区排泄」这种假象）。
 */
const FALLBACK_ANCHORS: readonly DogAnchorSpec[] = [
  { id: 'floor-living', label: '起居区', capabilities: ['floor', 'play'], heightM: 0 },
];

// ---------------------------------------------------------------- 节拍（最短间隔）

/**
 * **节拍上限**：某些行为不按权重随便出现，而是有最短间隔。
 *
 * 为什么必须有这一条：采样器每几十秒就要重新选一次活动，一个 0.5% 权重的行为在一天里
 * 仍会被选中上百次——「一天排泄 100 次」显然荒谬。权重负责**什么时候更容易发生**，
 * 节拍负责**多久才能再来一次**，两者缺一不可。
 * 取值是操作化常量（本项目自定，用于让时间线看起来像一只真的狗），不代表任何生理
 * 测量值；`eliminating` 的 4 小时只保证「一天数次」，不声称真实排空频率。
 */
const DOG_MIN_INTERVAL_S: Readonly<Partial<Record<DogActivityId, number>>> = {
  running: 25 * 60,
  eliminating: 4 * 3600,
  // ---- 院子里的四种互动（本轮新增）----
  // 取值依据：先定「一天大概几次」，再按白昼窗（06:00–21:59，约 16 h）反推最短间隔。
  // ⚠️ 这四个数是**仿真参数**（本项目自定，用来让一天看起来像一只真的狗），
  //    不是任何行为学频率——一手来源里没有「家犬一天玩几次水 / 打几次滚」这类可引用的数字：
  //      玩水   2 h   → 白昼上限约 8 次
  //      打滚   100 min → 上限约 9–10 次；它比玩水更容易被选中，因此权重压得低一档
  //      刨地   2 h   → 上限约 8 次
  //      晒太阳 4 h   → 上限约 4 次（日照窗只有 13 h，一次还占 5–15 分钟）
  // 实测（30 个种子 × 24 h，`buildDogTimeline` 默认锚点表）：
  //   玩水 7–8 次、打滚 8–10 次、刨地 7–9 次、晒太阳 4 次。
  // 「不让玩水一小时出现 200 次」靠的正是这一条：采样器每几十秒就重选一次活动，
  // 没有最短间隔时，一个低权重的行为一天也会被选中上百次；
  // 反过来，上限也不是「一天一次」——玩水是用户点名要看到的互动，必须反复出现。
  'water-play': 2 * 3600,
  rolling: 100 * 60,
  digging: 2 * 3600,
  sunning: 4 * 3600,
};

/**
 * 节拍上下文：各活动**上一次发生**的会话内秒数 + 当前时刻。
 *
 * 单独抽成一个可选参数，是为了不改变 `dogActivityWeights(hour, anchors, rng)` 这个
 * 签名——直接调用它只拿到「按时刻的权重」，只有引擎才会额外套上节拍约束。
 */
export interface DogActivityCooldown {
  lastAtS: Partial<Record<DogActivityId, number>>;
  nowS: number;
}

/** 该活动此刻是否已经过了最短间隔。 */
function offCooldown(activity: DogActivityId, cooldown: DogActivityCooldown | undefined): boolean {
  const min = DOG_MIN_INTERVAL_S[activity];
  if (!min || !cooldown) return true;
  const last = cooldown.lastAtS[activity];
  if (last === undefined) return true;
  return cooldown.nowS - last >= min;
}

// ---------------------------------------------------------------- 狗的节律（自带一份）

/**
 * 各时段的**基准活动倾向**（0–1），相邻整点之间做 smoothstep 插值。
 *
 * ⚠️ 这是操作化常量，不是文献数字。文献能给的只是方向性结论：家犬的活动集中在
 * 主人活动时段、夜间以睡眠为主；是否存在稳健的日节律、峰值在几点，现有研究样本量
 * 都很小且结论不一致（属 `disputed`）。因此本函数**只输出相对权重**，界面上
 * **不展示它的数值**，也不声称任何「峰值时刻」。这条纪律与猫版 `rhythm.ts` 一致。
 *
 * 曲线形状（为什么这样取）：
 *   - 00–05：最低，夜间连续睡眠；
 *   - 06–08：清晨一个峰（出门散步与喂食都在这时）；
 *   - 11–15：午后回落（一条平缓的午睡谷）；
 *   - 16–19：傍晚峰，且比清晨更宽——这是狗一天里活动量最大的时段；
 *   - 20–23：逐步收敛到休息。
 * 与猫版的差别正在这里：猫是晨昏两个**尖峰**、白天大量时间在睡；狗的高活动区贴着
 * 主人的作息，是两个**宽肩**。因此必须自带一份，不能复用猫的数组。
 */
const DOG_RHYTHM_BASE_BY_HOUR: readonly number[] = [
  0.06, 0.05, 0.05, 0.06, 0.1, 0.22, // 00–05
  0.55, 0.88, 0.82, 0.6, 0.48, 0.42, // 06–11
  0.34, 0.32, 0.38, 0.52, 0.78, 0.9, // 12–17
  0.78, 0.62, 0.45, 0.3, 0.18, 0.1, // 18–23
];

/** 狗的 24 小时活动倾向（0–1）。越界小时自动取模。 */
export function dogActivityWeightAt(hourOfDay: number): number {
  const h = ((hourOfDay % 24) + 24) % 24;
  const i0 = Math.floor(h);
  const i1 = (i0 + 1) % 24;
  const frac = h - i0;
  const a = DOG_RHYTHM_BASE_BY_HOUR[i0] ?? 0.3;
  const b = DOG_RHYTHM_BASE_BY_HOUR[i1] ?? 0.3;
  const k = frac * frac * (3 - 2 * frac);
  return a + (b - a) * k;
}

/** `dogActivityWeightAt(hourOfDayAt(tS))` 的捷径，供 UI 与断言使用。 */
export function dogTendencyAt(tS: number): number {
  return dogActivityWeightAt(hourOfDayAt(tS));
}

/**
 * 夜间程度（0–1）：1 = 深夜。
 *
 * 为什么不复用 `1 - dogActivityWeightAt()`：活动倾向里已经包含「散步/互动」这类
 * **外部驱动**的成分，而睡眠是**内生**的——两者不是同一条曲线。例如 20:00 的倾向仍有
 * 0.62（主人还在家、会互动），但睡眠概率应当明显上升。
 * 用阶跃而不是平滑曲线是刻意的：睡眠是**状态**而非倾向，跨过这个界就该换挡。
 */
export function dogNightFactor(hourOfDay: number): number {
  const h = ((hourOfDay % 24) + 24) % 24;
  // 22:00 起算的「入夜小时数」：22 → 0，次日 05 → 7
  const sinceNightStart = (h + 24 - 22) % 24;
  return sinceNightStart <= 7 ? 1 : 0;
}

// ---------------------------------------------------------------- 契约（时间线）

/** 单个行为区间。`t` 与 `t + durS` 连续覆盖整个时间线，无空洞、无重叠。 */
export interface DogBehaviorSegment {
  /** 区间起点（会话内秒） */
  t: number;
  /** 区间时长（秒），恒 > 0 */
  durS: number;
  activity: DogActivityId;
  posture: DogPosture;
  /**
   * 该区间发生的锚点。
   * 移动类活动（walking / trotting / running / sniffing）这里是**目的地**；
   * 定点类活动这里是**所在地**。这条区分是渲染层的位移契约。
   */
  anchorId: string;
  /**
   * 位移是否真的发生。缺省（undefined）= 已发生。
   *
   * 为什么需要它：`anchors` 缺省或只有一个锚点时，狗可能「想移动」却没有可去的地方。
   * 此时区间仍然连续、姿势仍然贴地，但空间上并没有移动——消费方（寻路、自检）
   * 必须能区分这两种情况，否则会把「原地选了个移动行为」误读成「狗在走动」。
   */
  resolved?: boolean;
  /** 非空表示该区间处于突发演示覆盖之下 */
  incidentKind?: DogIncidentKind;
}

/** 一次突发演示。`injected === true` 表示由调用方主动注入（仿真真值）。 */
export interface DogBehaviorIncident {
  t: number;
  durationS: number;
  kind: DogIncidentKind;
  injected: boolean;
}

export interface DogBehaviorTimeline {
  seed: number;
  durationS: number;
  /** 按 `t` 严格递增的区间序列 */
  segments: readonly DogBehaviorSegment[];
  incidents: readonly DogBehaviorIncident[];
  /** 逐活动累计时长（秒），用于断言与漂移基线 */
  budgetS: Partial<Record<DogActivityId, number>>;
  /** 展示倍率；1 = 真实时间。仅用于画面推进，不改变时间线本身 */
  timeScale: number;
}

/** 一次注入请求。同一时刻重复注入时只保留第一条。 */
export interface DogBehaviorIncidentRequest {
  atS: number;
  kind: DogIncidentKind;
}

export interface DogBehaviorInput {
  seed: number;
  /** 时间线长度（会话内秒） */
  durationS: number;
  timeScale?: number;
  /** 主动注入的突发演示（真值） */
  injectIncidents?: readonly DogBehaviorIncidentRequest[];
  /** 可用锚点。缺省时退化为单一地面锚点（行为仍然有效，只是不移动） */
  anchors?: readonly DogAnchorSpec[];
}

// ---------------------------------------------------------------- 调度辅助

/** 某锚点是否具备所需能力中的任一项（空清单 = 无要求）。 */
function hasAnyCapability(anchor: DogAnchorSpec, capabilities: readonly DogAnchorCapability[]): boolean {
  return capabilities.length === 0 || capabilities.some((c) => anchor.capabilities.includes(c));
}

/**
 * 按目的地规则筛出**允许**的锚点。
 *
 * `allowedIds` 为空数组是「无限制」；非空则是硬白名单——这是 `eating` 只落在食盆、
 * `eliminating` 只落在排泄角、`running` 只落在草坪的实现点。
 */
function allowedAnchors(anchors: readonly DogAnchorSpec[], rule: DogDestinationRule): DogAnchorSpec[] {
  const byCapability = anchors.filter((a) => hasAnyCapability(a, rule.capabilities));
  const pool = byCapability.length > 0 ? byCapability : anchors.slice();
  if (!rule.allowedIds || rule.allowedIds.length === 0) return pool;
  const allowed = new Set(rule.allowedIds);
  return pool.filter((a) => allowed.has(a.id));
}

/**
 * 该活动此刻是否存在可达目的地。不存在就不给它权重，避免选中后只能原地退化
 * （「选中了奔跑却一步没跑」会让 16 种活动的出现率断言失去意义）。
 */
function canReach(anchors: readonly DogAnchorSpec[], activity: DogActivityId): boolean {
  return allowedAnchors(anchors, DOG_DESTINATION_RULES[activity]).length > 0;
}

/**
 * 从允许集合里挑一个目的地：优先 id 按顺序插到队首，其余保持原顺序。
 *
 * 为什么优先项要放在抽签池里而不是「有就直接用」：资源定点类活动（吃、喝、排泄）
 * 本来就只有一两个候选，插队与否都不影响正确性；而走动、嗅闻这类活动需要随机性，
 * 否则狗会永远只去同一个地方。
 */
function selectDogAnchor(
  anchors: readonly DogAnchorSpec[],
  activity: DogActivityId,
  rng: BehaviorRng,
  fromId: string,
): DogAnchorSpec | undefined {
  if (anchors.length === 0) return undefined;
  const rule = DOG_DESTINATION_RULES[activity];
  const pool = allowedAnchors(anchors, rule);
  if (pool.length === 0) return undefined;
  const fresh = pool.filter((a) => a.id !== fromId);
  const candidates = fresh.length > 0 ? fresh : pool;
  const preferred: DogAnchorSpec[] = [];
  for (const id of rule.preferIds ?? []) {
    const hit = candidates.find((a) => a.id === id);
    if (hit && !preferred.includes(hit)) preferred.push(hit);
  }
  const ordered = preferred.length > 0 ? [...preferred, ...candidates] : candidates;
  return rng.pick(ordered);
}

/** 由锚点 id 派生一个稳定整数；只用于伪距离与时长，不用于任何展示。 */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000;
}

/**
 * 两点之间的移动时长（秒）。
 *
 * 行为层不使用米制坐标，因此这里用一个由锚点 id 派生的**伪距离**（归一化到 0–1）：
 * 它确定、与顺序无关，`apps/web` 拿到真实坐标后自行校正。
 * 时长区间由 `MOVE_SECONDS` 给出，规则要求移动段是 8–40 s 的短段。
 */
function dogTravelDurationS(
  activity: DogActivityId,
  from: DogAnchorSpec | undefined,
  to: DogAnchorSpec | undefined,
  rng: BehaviorRng,
): number {
  const [lo, hi] = MOVE_SECONDS[activity] ?? [10, 40];
  if (!from || !to) return rng.range(lo, hi);
  const dx = Math.abs(hashId(from.id) - hashId(to.id)) % 40;
  const fraction = Math.min(1, Math.max(0, dx / 39));
  const jitter = 0.9 + 0.2 * rng.next();
  return Math.min(hi, Math.max(lo, (lo + (hi - lo) * fraction) * jitter));
}

/**
 * 定点段的时长（秒）。
 *
 * 规则：休息/睡眠类可以长（60–300 s），吃喝与排泄是短窗口。
 * ⚠️ 这些是操作化常量，不代表任何真实时长分布——一手来源里没有家犬「一个行为片段
 * 持续多久」的可引用数字，这里只保证「短促动作 + 长休息交替」的结构成立。
 */
function dogStayDurationS(activity: DogActivityId, rng: BehaviorRng): number {
  const [lo, hi] = STAY_SECONDS[activity] ?? [60, 180];
  return rng.range(lo, hi);
}

/**
 * 各活动在当前时刻的**未归一化权重**。
 *
 * 规则（每条都对应一条可检验的结论，数值本身是操作化常量）：
 *   - 白天（主人活动时段）活动量大：walking / trotting / sniffing / alerting 权重高；
 *   - 夜间：sleeping 最高、resting 次之；
 *   - running 只在存在可奔跑的院子锚点时才有权重，且权重低、只在活跃时段出现
 *     （但**保证一天里真的会发生若干次**——「奔跑」是用户点名要看到的行为）；
 *   - eliminating 只在存在排泄角时才有权重，且频次压到一天数次
 *     （这是生理事实：一天不该出现十几次）；
 *   - drinking 落在院内水盆或食盆旁的水碗，eating 落在食盆，playing 落在
 *     草坪 / 休闲区 / 起居区（见 `DOG_DESTINATION_RULES`）；
 *   - 院子里四种互动（玩水/打滚/刨地/晒太阳）只在**存在对应能力的锚点**时才有权重，
 *     且一律乘白昼因子；晒太阳还额外限定在日照窗内（见下面的 `daylight`）——
 *     夜里出现晒太阳是荒谬的，这一条由权重直接归零实现，不靠节拍兜底。
 */
export function dogActivityWeights(
  hour: number,
  anchors: readonly DogAnchorSpec[],
  rng: BehaviorRng,
  cooldown?: DogActivityCooldown,
): Readonly<Record<DogActivityId, number>> {
  const act = dogActivityWeightAt(hour);
  const restful = 1 - act;
  const night = dogNightFactor(hour);
  const canRun = canReach(anchors, 'running');
  const canEliminate = canReach(anchors, 'eliminating');
  const canWaterPlay = canReach(anchors, 'water-play');
  const canRoll = canReach(anchors, 'rolling');
  const canDig = canReach(anchors, 'digging');
  const canSun = canReach(anchors, 'sunning');
  // 白昼因子（0/1）：`dogNightFactor` 是 22:00 起的阶跃，夜间为 1。
  // 四种院子互动都乘上它——夜里的院子互动既不在节律里、也没有可用的日照。
  const day = 1 - night;
  // 日照窗（仿真参数，07:00–19:59）：只靠 `day` 的话，狗可以在 21:59 起一段「晒太阳」。
  // 这里再收一个更窄的窗，让日照停留落在真的还有太阳的时段；
  // 它与 `dogActivityWeightAt` 的曲线无关，纯粹是「太阳在不在」的场地设定。
  const h = ((hour % 24) + 24) % 24;
  const daylight = h >= 7 && h < 20 ? 1 : 0;
  // 夜间几乎不再出门：用「主人不在活动时段」表达，而不是硬编码「22:00 之后不许走动」，
  // 这样时间线跨越午夜时仍然平滑。
  const outdoorAllowed = isOwnerAwayHour(hour) ? 0.18 : 1;

  const raw: Record<DogActivityId, number> = {
    // 夜间睡眠占主体：`0.3 + 5.2 * night` 在夜里给到约 5.5，白天只剩 0.3
    sleeping: 0.3 + 5.2 * night,
    // 休息与活动互为镜像，但基线高于睡眠——白天的主要「不动」形态是休息
    resting: 0.45 + 1.1 * restful,
    // 走动：白天高。它是狗最基础的活动，因此基线不低
    walking: (0.35 + 1.5 * act) * outdoorAllowed,
    // 小跑：比走动更依赖活跃度（平方项）
    trotting: (0.2 + 1.3 * act * act) * outdoorAllowed,
    // 奔跑：院子限定 + 活跃时段限定。
    // 权重取到「一天几次」的量级：按当前分布约 0.7 秒/次选中的比例，
    // 24 小时内会出现数次，但不会变成整天在冲刺。
    running: canRun ? 1.4 * act * act * act : 0,
    // 嗅闻：狗的嗅闻占总活动时间的比例很高，权重接近走动；
    // 散步时段（活跃度高）最高——这是唯一一处刻意让嗅闻压过走动的活动。
    sniffing: (0.3 + 1.7 * act) * outdoorAllowed,
    // 饮水：全天不缺席，活动后略增
    drinking: 0.4 + 0.3 * act,
    // 进食：贴着主人的喂食时刻（清晨与傍晚各一次，与饲喂制度一致，
    // 而不是声称「狗在某个时刻一定饿」）
    eating: 0.4 + 0.6 * (hour < 3 || hour > 21 ? 0.2 : 1) * (0.4 + act),
    // 玩耍：主人互动时段最高；狗会主动邀玩
    playing: 0.15 + 0.85 * act * act,
    // 排泄：固定角落，次数少但**一天必须真的发生**；
    // 主人不活动时略高（早起/睡前各一次）
    eliminating: canEliminate ? 0.9 * (isOwnerAwayHour(hour) ? 1.4 : 1) : 0,
    // 坐着：一天里很常见但不占主导，中等活跃度时最高（太困就睡、太活跃就在动）
    sitting: 0.3 + 0.5 * (1 - Math.abs(act - 0.45)),
    // 警觉张望：白天窗外/门外动静多，权重明确高于夜间
    alerting: 0.2 + 0.9 * act,
    // ---- 院子里的四种互动 ----
    // 四条都只在「院子里存在对应锚点」时才有权重（场地前提），且都乘白昼因子。
    // 数值是操作化常量：与 running 同一量级。真正的次数由权重与
    // `DOG_MIN_INTERVAL_S` 的节拍**共同**决定——这里给的是「什么时候更容易被选中」，
    // 上限在那里（实测落在一天几次，见节拍表的注释）。
    // 玩水：用户点名的交互，权重取到「一天会反复出现几次」的量级。
    'water-play': canWaterPlay ? (0.4 + 0.8 * act) * day : 0,
    // 打滚：比玩水更容易被选中，因此权重略低，让两者次数落在同一量级。
    rolling: canRoll ? (0.3 + 0.7 * act) * day : 0,
    // 刨地：三种短互动里最少的那个。
    digging: canDig ? (0.25 + 0.55 * act) * day : 0,
    // 晒太阳：权重给得高——它是白天**持续不动**的主要形态之一，
    // 但一次就占 5–15 分钟，加上 3 小时的最短间隔，实际落在一天几次。
    sunning: canSun ? 1.7 * daylight * (0.4 + act) : 0,
  };

  const out = {} as Record<DogActivityId, number>;
  for (const id of DOG_ACTIVITY_IDS as readonly DogActivityId[]) {
    // 抖动**无条件**先抽一次，保证「种子 → 随机流」的推进与权重是否被节拍归零无关；
    // 否则同一种子会因为时间线长度不同而走出完全不同的随机流，跨长度对账会失效。
    const jitter = 0.85 + 0.3 * rng.next();
    const base = raw[id];
    // 还在最短间隔内的一律归零——节拍约束优先于权重（见 DOG_MIN_INTERVAL_S）
    out[id] = base > 0 && offCooldown(id, cooldown) ? base * jitter : 0;
  }
  return out;
}

/** 按权重选下一个活动，并避免与上一段完全相同。 */
export function chooseDogActivity(
  weights: Readonly<Record<DogActivityId, number>>,
  previousId: DogActivityId | null,
  rng: BehaviorRng,
): DogActivityId {
  const all = DOG_ACTIVITY_IDS as readonly DogActivityId[];
  const narrowed = all.filter((id) => id !== previousId);
  const pool = narrowed.length > 0 ? narrowed : all;
  const idx = rng.weightedIndex(pool.map((id) => weights[id] ?? 0));
  return pool[Math.min(idx, pool.length - 1)] ?? 'resting';
}

// ---------------------------------------------------------------- 引擎

/** 注入突发的排序与去重（同一时刻只保留第一条，越界的丢弃）。 */
function normalizeDogIncidents(
  requested: readonly DogBehaviorIncidentRequest[] | undefined,
  durationS: number,
): DogBehaviorIncidentRequest[] {
  if (!requested || requested.length === 0) return [];
  const seen = new Set<number>();
  const out: DogBehaviorIncidentRequest[] = [];
  for (const item of [...requested].sort((a, b) => a.atS - b.atS)) {
    if (!(item.atS >= 0) || item.atS >= durationS) continue;
    if (seen.has(item.atS)) continue;
    seen.add(item.atS);
    out.push({ atS: item.atS, kind: item.kind });
  }
  return out;
}

/** 突发覆盖期间「算作什么活动」：抽搐是侧卧不动，呕吐是站立低头。 */
function dogActivityOfIncident(kind: DogIncidentKind): DogActivityId {
  return kind === 'vomit' ? 'sitting' : 'resting';
}

/**
 * 构建一条狗的行为时间线。
 *
 * 三条不变量（与猫版一致，也是回归断言的判据）：
 *   1. `segments` 首尾相接、无空洞、无重叠，`Σ durS === durationS`；
 *   2. `Σ budgetS === durationS`（每一秒都被计入某个活动，不重不漏）；
 *   3. 同一 `(seed, durationS, injectIncidents, anchors)` 必然产出完全一致的时间线。
 * 第 1 条必须成立的理由：有了它 `dogActivityAt(t)` 才有唯一正确答案——
 * 否则「狗此刻在做什么」在空洞里就没有定义，画面与自检会各自猜一个。
 */
export function buildDogTimeline(input: DogBehaviorInput): DogBehaviorTimeline {
  const durationS = Math.max(0, input.durationS);
  const timeScale = input.timeScale ?? 1;
  const anchors: readonly DogAnchorSpec[] =
    input.anchors && input.anchors.length > 0 ? input.anchors : FALLBACK_ANCHORS;
  const rng = makeBehaviorRng(input.seed);
  const requested = normalizeDogIncidents(input.injectIncidents, durationS);

  const segments: DogBehaviorSegment[] = [];
  const incidentsOut: DogBehaviorIncident[] = [];
  const budgetS: Record<string, number> = {};
  /** 各活动上一次发生的会话内秒数（节拍约束的输入，见 DOG_MIN_INTERVAL_S） */
  const lastActivityAtS: Partial<Record<DogActivityId, number>> = {};
  let cursor = 0;

  /** 上一段所在的锚点。移动段记录的是**目的地**，因此它天然是「现在在哪」。 */
  let prevAnchorId = '';
  let prevActivity: DogActivityId | null = null;

  function currentAnchorId(): string {
    return prevAnchorId || anchors[0]?.id || 'floor-living';
  }

  function findAnchor(id: string): DogAnchorSpec | undefined {
    return anchors.find((a) => a.id === id);
  }

  /**
   * 追加一段区间并推进游标。
   *
   * 为什么把「推进 + 计预算 + 更新当前位置」收在一处：时间线的不变量是**三者同时**
   * 成立的，任何一处单独改动都会让 `dogActivityAt` 与 `budgetS` 对不上。
   */
  function pushSegment(
    t: number,
    dur: number,
    activity: DogActivityId,
    posture: DogPosture,
    anchorId: string,
    incidentKind?: DogIncidentKind,
  ): void {
    if (!(dur > 0)) return;
    const seg: DogBehaviorSegment = { t, durS: dur, activity, posture, anchorId };
    if (incidentKind) seg.incidentKind = incidentKind;
    segments.push(seg);
    cursor = t + dur;
    budgetS[activity] = (budgetS[activity] ?? 0) + dur;
    lastActivityAtS[activity] = t;
    prevAnchorId = anchorId;
    prevActivity = activity;
  }

  /**
   * 推进常规行为，直到 `untilT` 或时间线结束。
   *
   * 形状与猫版引擎刻意保持平行（共用机制）：选活动 → 定时长 → 需要移动就先走一段 →
   * 走完在原地做剩余时长。差别只在活动集合与锚点约束（分开参数）。
   */
  function stride(untilT: number): void {
    while (cursor < durationS) {
      if (cursor >= untilT) return;
      const hour = hourOfDayAt(cursor);
      // 这一轮的可用窗口。`capAt` 是「推进目标或时间线末尾」——用不着卡在推进边界上：
      // 边界本身不是行为事件，选出来的活动段直接跨过去即可（它只影响推进目标，
      // 不该影响行为片段该多长）。早期版本让窗口止于边界，于是边界前会挤出一段
      // 不足 8 秒的「走路 0.9 秒」碎片。
      const capAt = Math.min(untilT, durationS);
      const remainingWindow = capAt - cursor;
      if (!(remainingWindow > 0)) return;

      const weights = dogActivityWeights(hour, anchors, rng, { lastAtS: lastActivityAtS, nowS: cursor });
      const activity = chooseDogActivity(weights, prevActivity, rng);
      const fallbackPosture = DOG_ACTIVITY_DEFS[activity].posture;
      // 估算时长只用于给这一轮定窗口；真实移动时长在知道目的地的距离之后再算一次
      const wanted = MOVEMENT_ACTIVITIES.has(activity)
        ? dogTravelDurationS(activity, findAnchor(prevAnchorId), undefined, rng)
        : dogStayDurationS(activity, rng);
      const remaining = Math.min(wanted, durationS - cursor, remainingWindow);
      if (!(remaining > 0)) return;

      const from = findAnchor(prevAnchorId) ?? anchors[0];
      const target = selectDogAnchor(anchors, activity, rng, prevAnchorId);

      if (!target || !from || target.id === from.id) {
        // 没有可去的锚点，或唯一候选就是当前位置：退化为**原地**行为。
        // 不能把移动活动原样推出去——原地不动却报「走动」会让寻路与自检自相矛盾。
        const local: DogActivityId = MOVEMENT_ACTIVITIES.has(activity) ? 'sitting' : activity;
        pushSegment(cursor, remaining, local, DOG_ACTIVITY_DEFS[local].posture, currentAnchorId());
        if (MOVEMENT_ACTIVITIES.has(activity)) segments[segments.length - 1]!.resolved = false;
        continue;
      }

      // 移动段短、定点段长：先把「走过去」的时间算出来。
      const moveActivity: DogActivityId = MOVEMENT_ACTIVITIES.has(activity) ? activity : 'walking';
      const travelWanted = dogTravelDurationS(moveActivity, from, target, rng);
      // 下限取 `MOVE_SECONDS` 的最小值（8 s），并让它在必要时收缩到剩余窗口——
      // 推进步长的余量会让最后一段窗口变窄，若不设下限，移动段会被切成 5 s 的碎片，
      // 与「移动段 8–40 s」这条时长纪律相矛盾。
      const [moveFloorLo, moveCeilHi] = MOVE_SECONDS[moveActivity] ?? [10, 40];
      // 窗口连一段**最短移动**都容不下：直接结束这一轮，让外层循环去处理边界。
      // 若强行推出去，就会得到「走了 0.9 秒」这种碎片段——它既违反时长纪律，
      // 画面上也只是一次抖动。
      // ⚠️ 判据必须用**固定下限** `moveFloorLo`（8–10 s），不能用被窗口钳过的
      //    `min(moveFloorLo, remainingWindow)`：后者在窄窗口下等于窗口本身，
      //    于是「remaining >= 下限」恒成立，碎片段照样冒出来（这是踩过的坑）。
      if (remaining < moveFloorLo - 1e-9) return;
      const minMoveS = Math.min(moveFloorLo, remainingWindow);
      // 移动段（含「走到资源点」的那一段）**必须**落在 8–40 s 之内：
      // 连续走 60 s 以上已经不是「走动」，而且与「短促移动 + 长停留」的结构矛盾。
      const maxMoveS = Math.min(moveCeilHi, remaining);
      // 移动段短、定点段长：移动最多吃掉窗口的 40%，剩下至少 60% 留给「到了之后做什么」，
      // 否则「去喝水」会变成一路走过去而没有停留（移动段本身另有 8–40 s 的硬区间）。
      const moveDurWanted = Math.max(Math.min(travelWanted, remaining * 0.4), Math.min(minMoveS, remaining));
      // 只有在「最短移动 + 最短停留」都放得下时才拆成两段；否则让移动吃掉整个窗口
      // （仍受 40 s 上限约束，超出部分交给到达后的定点状态承接）。
      const stayFloor = STAY_FLOOR_S[activity] ?? 20;
      const canSplit = remaining >= minMoveS + stayFloor;
      const moveDur = Math.min(canSplit ? moveDurWanted : remaining, maxMoveS);
      if (moveDur > 0) {
        pushSegment(cursor, moveDur, moveActivity, DOG_ACTIVITY_DEFS[moveActivity].posture, target.id);
      }
      const left = remaining - moveDur;
      if (left > 0) {
        if (MOVEMENT_ACTIVITIES.has(activity)) {
          // 到达后的收尾：用「警觉张望」这类定点状态，避免把移动段拉长成漫步。
          // 收尾段是**移动的尾巴**（距离远、窗口紧时可能不到 20 s），
          // 因此统一用没有停留下限的 `alerting`；`sitting` 保留给「坐下待一会儿」，
          // 那才是真正需要下限的定点行为。
          pushSegment(cursor, left, 'alerting', DOG_ACTIVITY_DEFS.alerting.posture, target.id);
        } else {
          pushSegment(cursor, left, activity, fallbackPosture, target.id);
        }
      }
    }
  }

  /**
   * 依据当前区间序列**重算**「各活动上一次发生」。
   *
   * 为什么必须重算而不是回滚旧值：`rewindTo` 会裁短甚至丢弃末尾区间，
   * 被裁掉的那部分时间里发生的活动在时间线上**已经不存在**了。
   * 若不同步，节拍约束会以为「刚奔跑过」，从而在事后的一段里压掉本该发生的奔跑。
   */
  function recomputeLastActivity(): void {
    for (const key of Object.keys(lastActivityAtS)) {
      delete lastActivityAtS[key as DogActivityId];
    }
    for (const seg of segments) lastActivityAtS[seg.activity] = seg.t;
  }

  /**
   * 把游标回退到目标时刻，通过**裁短**末段实现（而不是丢弃整段）。
   *
   * 为什么需要：突发必须精确落在请求的时刻上。若只是「推进到事发时刻再开始」，
   * 注入点会被当前片段的剩余时长整体后推，而片段本身长度是要算进时间预算的。
   * 裁短末段可以同时满足两件事：事发时刻对齐 + 预算守恒。
   */
  function rewindTo(targetT: number): void {
    while (segments.length > 0) {
      const seg = segments[segments.length - 1]!;
      const start = seg.t;
      // 末段起于目标时刻之后（或恰好等于）：时间轴已经对齐，只把游标挪到段首。
      // ⚠️ 这个分支必须**独立**于下面的裁短分支、并且自己 return——
      // 早期版本把 return 误放进「末段起于目标之前」的分支里，于是「末段恰好起于
      // 事发时刻」这一种情况会一路走到 pop，把整条时间线清空、游标被打回 0。
      if (start >= targetT) {
        cursor = start;
        recomputeLastActivity();
        return;
      }
      const cut = targetT - start;
      if (cut >= seg.durS) {
        // 整段都在事发时刻之前：丢掉它，继续往前找
        segments.pop();
        budgetS[seg.activity] = Math.max(0, (budgetS[seg.activity] ?? 0) - seg.durS);
        cursor = start;
        continue;
      }
      // 末段横跨事发时刻：裁短到目标时刻，预算同步减掉被裁掉的部分
      segments[segments.length - 1] = { ...seg, durS: cut };
      budgetS[seg.activity] = Math.max(0, (budgetS[seg.activity] ?? 0) - (seg.durS - cut));
      cursor = targetT;
      recomputeLastActivity();
      return;
    }
    recomputeLastActivity();
  }

  for (const event of requested) {
    const def = DOG_INCIDENT_DEFS[event.kind];
    // 一段一段地推进到事发时刻，然后把末段裁短，让突发起点精确等于 `atS`。
    // 三个细节都不能省（每一条都是踩过的坑）：
    //   1. **循环而不是单次推进**：`stride(target)` 只推进到「下一段越过 target」，
    //      一次调用前进不了多少。早期版本只推进一次，游标停在 atS 前很远，
    //      随后的 rewindTo 就把整条时间线裁空，注入点落在 0 而不是请求的时刻。
    //   2. **每轮目标不超过 `cursor + BACKOFF_S`**：`stride` 的每段都不越过目标，
    //      于是末段至少跨过 `atS − BACKOFF`，裁短之后仍有可观时长——
    //      否则 300 s 的睡眠段会被切成 1 s 的碎片。
    //   3. **只在越过 `atS` 时才回退**：若游标恰好等于 `atS`，末段正是上一轮停在
    //      `atS` 上的那一段，此时回退是错的（会把刚注入的上一段突发事件裁回去）。
    let guard = 0;
    while (cursor + 1e-6 < event.atS && cursor < durationS && guard < 20000) {
      const before = cursor;
      stride(Math.min(event.atS, cursor + INCIDENT_BACKOFF_S));
      if (cursor <= before + 1e-9) {
        // 推进没有进展：补一小段，保证循环一定收敛（正常路径不会走到这里）
        pushSegment(cursor, Math.min(1, durationS - cursor), 'resting', DOG_ACTIVITY_DEFS.resting.posture, currentAnchorId());
      }
      guard++;
    }
    if (cursor >= durationS) break;
    if (cursor > event.atS + 1e-9) rewindTo(event.atS);
    const bodyStart = Math.min(Math.max(cursor, 0), durationS);
    const dur = Math.min(def.durationS, durationS - bodyStart);
    if (!(dur > 0)) break;
    pushSegment(bodyStart, dur, dogActivityOfIncident(event.kind), def.posture, currentAnchorId(), event.kind);
    incidentsOut.push({ t: bodyStart, durationS: dur, kind: event.kind, injected: true });
  }

  // 收尾：补满剩余时间，保证 Σ durS === durationS
  if (cursor < durationS) stride(Number.POSITIVE_INFINITY);
  if (cursor < durationS) {
    pushSegment(cursor, durationS - cursor, 'resting', DOG_ACTIVITY_DEFS.resting.posture, currentAnchorId());
  }

  return {
    seed: input.seed,
    durationS,
    segments,
    incidents: incidentsOut,
    budgetS: budgetS as Partial<Record<DogActivityId, number>>,
    timeScale,
  };
}

/**
 * 求某个时刻的行为区间。
 *
 * 用二分查找：自检与 UI 每帧都会调用它，线性扫描在长会话（数千个区间）上会明显拖慢帧率。
 */
export function dogActivityAt(timeline: DogBehaviorTimeline, tS: number): DogBehaviorSegment {
  const segs = timeline.segments;
  if (segs.length === 0) {
    return { t: 0, durS: 0, activity: 'resting', posture: 'lying', anchorId: 'floor-living' };
  }
  const last = segs[segs.length - 1]!;
  const t = Math.min(Math.max(tS, 0), Math.max(timeline.durationS, 0));
  let lo = 0;
  let hi = segs.length - 1;
  let found = last;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segs[mid]!;
    if (seg.t <= t && seg.t + seg.durS > t) {
      found = seg;
      break;
    }
    if (seg.t > t) hi = mid - 1;
    else lo = mid + 1;
  }
  return found;
}

/** 求某个时刻是否处于突发演示中。 */
export function dogIncidentAt(timeline: DogBehaviorTimeline, tS: number): DogBehaviorIncident | null {
  for (const inc of timeline.incidents) {
    if (tS >= inc.t && tS < inc.t + inc.durationS) return inc;
  }
  return null;
}

/** 逐活动的占比（0–1）。UI 与断言共用，避免各自算一遍。 */
export function dogActivityShare(timeline: DogBehaviorTimeline, activity: DogActivityId): number {
  if (timeline.durationS <= 0) return 0;
  return (timeline.budgetS[activity] ?? 0) / timeline.durationS;
}

export { DAY_START_HOUR, OWNER_ACTIVE_HOURS, hourOfDayAt, isOwnerAwayHour };
