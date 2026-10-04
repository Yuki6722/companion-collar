/**
 * App 机模的**物种词表**：把「写死猫」的那些字收进一份可注入的参数。
 *
 * 为什么要有这个文件，而不是复制一份 `app-phone-dog.ts`：
 *   仓库纪律是「**共用机制、分开参数**」（`AGENTS.md` §8）。机模的结构——四个模块
 *   **建一次 + 就地刷新**、机身高度固定、内容在机身内滚动、读数变红与弹窗的判据——
 *   是**机制**，两个物种完全一样；真正不同的只是这一批面向用户的**词**：
 *   品种表、锚点名、活动名、年龄段与体型档、以及以物种为主语的边界句。
 *   于是机制留在 `app-phone.ts`，词留在本文件，狗版页面只需要 `vocab: DOG_APP_VOCAB` 一行。
 *
 * ⚠️ 四条纪律：
 *   1. **读数那套措辞逐字不变**：锚点、突发、读数、边界句的名词**直接引用 `@camp/core` 的常量**，
 *      因此界面词汇与 core 之间也不会漂移。
 *      ★ 本轮（`档案` → `我的` + 商城）**猫版与原版有意不同**：第四个页签改名、
 *      原档案页整体搬进「宠物档案」子视图，并新增电量 / 定位 / 商城三个子视图。
 *      搬走的是**结构**，档案那几句文案（品种年龄、"改档案会重建会话"、仿真声明）一个字没删。
 *   2. **不新增对物种的判断**：本文件只提供**词**，不提供判据。突发该不该提醒、
 *      读数算不算变化、一条带子合不合身，仍然只由 `@camp/core` 的
 *      `*_DEFS` / `evaluateVitalAlerts` / `checkStrapFit` 决定。
 *   3. **边界句只换主语**：指到物种的边界句，狗版只把主语从猫换成狗，
 *      否定结构（不是 / 不构成 / 非诊断 / 不能）与整句语义一字不动；
 *      能直接引用 core 的狗版常量时优先引用，不自己另写一套。
 *   4. **契约放在 UI 层**：这是**界面呈现**契约（只有 `app-phone.ts` 消费），
 *      不是领域类型，因此不进 `@camp/core`——core 是共享领域类型的唯一定义处，
 *      而 UI 措辞不该反向变成 core 的依赖。
 */
import {
  CAT_ANCHOR_LABELS,
  CAT_BREEDS,
  DOG_ACTIVITY_DEFS,
  DOG_ANCHOR_LABELS,
  DOG_BREEDS,
  DOG_INCIDENT_DEFS,
  DOG_INCIDENT_KINDS,
  DOG_INCIDENT_REFERRAL_NOTE,
  INCIDENT_DEFS,
  INCIDENT_KINDS,
  VITAL_ALERT_REFERRAL,
  VITALS_BOUNDARY_NOTE,
  VITALS_SIM_NOTE,
} from '@camp/core';
import type { AgeBand, BreedOption, SizeClass } from '@camp/core';

/** 漂移页展示的四路通道；`key` 与 `detectDrifts` 的输入一一对应。 */
export type DriftChannelKey = 'hr' | 'rr' | 'activity' | 'vocalization';

/**
 * 一个物种的 App 词表。
 *
 * 字段全部是**面向用户的词**（或词的来源）；没有任何一个字段是判据。
 * 新增字段时请同时给猫、狗两个实例各一个取值——缺一个就会在类型检查阶段报错。
 */
export interface AppSpeciesVocab {
  /** 档案页的品种下拉（core 的品种表：猫一份、狗一份） */
  breeds: readonly BreedOption[];
  /** `'猫'` / `'狗'`：句子里做主语的短名词（「这只…（可选）」） */
  speciesNoun: string;
  /** `'猫'` / `'柴犬'`：说「相对这只…自己的基线」时更自然的那个名词 */
  speciesNounFull: string;
  /** 实时页「位置：xxx」——锚点 id → 中文名（core 的锚点表） */
  anchorLabels: Readonly<Record<string, string>>;
  /** 活动 id → 中文名（事件流的主导行为，以及次数格子上的标签） */
  activityLabels: Readonly<Record<string, string>>;
  /** 事件流顶部次数格子显示哪几项（顺序即显示顺序；活动的 id 两个物种不同） */
  eventCountActivities: readonly string[];
  /** 突发 id → 中文名（实时页那一行） */
  incidentLabels: Readonly<Record<string, string>>;
  /**
   * 突发 id → 一句话说明。
   *
   * 挂在实时页那一行的 `title` 上——**不加新文字**：猫版画面必须逐字不变，
   * 说明只能借已有的节点露出（鼠标悬停可见，读屏也能读到）。
   */
  incidentHints: Readonly<Record<string, string>>;
  /** 年龄段 → 中文名（阈值由 core 的 `ageBandOf` 决定，词表只换物种说法） */
  ageBandLabels: Readonly<Record<AgeBand, string>>;
  /**
   * 体型档 → 中文名。
   *
   * ⚠️ 取值以 core 的 `SizeClass` 联合类型为准，共八档：猫三档、狗五档。
   * 两个实例各交出一份**完整**的 Record（各自多带对方那几档），
   * 这样类型上不需要 `undefined` 兜底——多出来的项在界面上永远不会被命中，
   * 因为 `sizeClassOf()` 由档案的物种决定只会推出本物种的档位。
   */
  sizeClassLabels: Readonly<Record<SizeClass, string>>;
  /** 漂移页四路通道的中文名 */
  driftLabels: Readonly<Record<DriftChannelKey, string>>;
  /** 「实时」页的边界句：项圈相机拍的是环境影像，不等价于这个物种眼中的世界 */
  povBoundaryNote: string;
  /** 「健康」页漂移那一节的边界句：只描述相对自身前半段基线的变化 */
  driftBoundaryNote: string;
  /** 「健康」页底部的读数边界句（猫版引用 core 原文，逐字不变） */
  vitalsBoundaryNote: string;
  /** 「档案」页底部的仿真声明（猫版引用 core 原文，逐字不变） */
  vitalsSimNote: string;
  /** 提醒弹窗里的转诊路径（判据仍来自 core，这里只提供**措辞**） */
  alertReferralNote: string;
  /** 「档案」页那句「改档案会重建整段会话、档案驱动的是这只…自己的基线」 */
  profileRebuildNote: string;
  /** 实时页「演示时钟 HH:MM（…）」里那句倍率说明（猫版 20×、狗版 12×） */
  demoTimeScaleNote: string;

  // ---------------------------------------------------------------- 「我的」页（原「档案」页）
  /**
   * 底部第四个页签的名字：`档案` → **`我的`**。
   *
   * ⚠️ 只换**显示文案**：页签的 id 仍然是 `'profile'`（`selectTab` / URL / 自检动作都按 id 走），
   * 因此这次改造不会动到任何既有调用点。
   */
  tabMine: string;
  /** 「我的」页第一个子项的标题与一句话描述（宠物档案＝原来的整个档案页） */
  mineItemProfileTitle: string;
  mineItemProfileDesc: string;
  /** 第二个子项：项圈电量 */
  mineItemBatteryTitle: string;
  mineItemBatteryDesc: string;
  /** 第三个子项：定位 */
  mineItemLocationTitle: string;
  mineItemLocationDesc: string;
  /** 第四个子项：商城（本轮新增） */
  mineItemShopTitle: string;
  mineItemShopDesc: string;
  /** 子视图里的返回入口文案 */
  mineBackLabel: string;

  /** 商城的标题 */
  shopTitle: string;
  /** 商城的一句话说明（**按物种换主语**：这只猫 / 这只狗） */
  shopIntro: string;
  /** 商城的三个维度分组标题 */
  shopMaterialTitle: string;
  shopSizeTitle: string;
  shopGradeTitle: string;
  /** 购买确认：按钮文案 + 确认后的一行状态文字（本项目不做真实下单流程） */
  shopConfirmLabel: string;
  shopConfirmedNote: string;
  /** 商城的证据政策说明：每个数字都带等级，未核实的项不给数值 */
  shopEvidenceNote: string;
  /** 商城的边界句：克重只用于演示预算怎么算，不构成任何性能或舒适度结论 */
  shopBoundaryNote: string;
  /** 「为什么这只…的预算这么小」——按物种措辞，解释体重 2% 这条规则的后果 */
  budgetScaleNote: string;

  /** 「项圈电量」子视图：标题 / 说明 / 仿真边界句 */
  batteryTitle: string;
  batteryDesc: string;
  batterySimNote: string;
  /** 「定位」子视图：标题 / 说明 / 数据来源说明 / 边界句 */
  locationTitle: string;
  locationDesc: string;
  locationSourceNote: string;
  locationBoundaryNote: string;
}

// ---------------------------------------------------------------- 共用：由 core 派生的词

/**
 * 突发名与说明：**从 core 的词表派生**，不在这里重抄一遍。
 *
 * 为什么：突发是**动作名**，它的中文只该在 `@camp/core` 定义一处
 * （`INCIDENT_DEFS` / `DOG_INCIDENT_DEFS`）。UI 重抄一次就会在 core 改动时漂移，
 * 而这类漂移只会以「手机上写抽搐、按钮上写抽动」的形式被人肉发现。
 */
function incidentVocab<K extends string>(
  kinds: readonly K[],
  defs: Readonly<Record<K, { label: string; hint: string }>>,
): { labels: Record<string, string>; hints: Record<string, string> } {
  const labels: Record<string, string> = {};
  const hints: Record<string, string> = {};
  for (const kind of kinds) {
    const def = defs[kind];
    labels[kind] = def.label;
    hints[kind] = def.hint;
  }
  return { labels, hints };
}

/**
 * 实时页边界句：**主语随物种变**，整句结构与边界语义一字不动。
 *
 * 「环境影像」是本项目允许的宣称之一（`core/src/claims.ts` 的 `ALLOWED_CLAIMS`）：
 * 它说的是「摄像头记录的是环境」，而不是「我们复刻了它看到的世界」。
 */
function povNoteOf(noun: string): string {
  return `这是**项圈相机拍到的环境影像**，用来判断它在哪、周围有什么。它不等于${noun}眼中的世界——帧率、视野、色觉与嗅觉通道都不等价。`;
}

/** 漂移页边界句：同样只换主语。 */
function driftNoteOf(noun: string): string {
  return `漂移只描述"相对这只${noun}自己前半段基线"的变化，不判断原因，也不区分正常波动与异常。`;
}

/** 档案页那句「重建会话」的说明：同样只换主语。 */
function rebuildNoteOf(noun: string): string {
  return `改品种或年龄会**按新档案重建整段仿真会话**（同一种子），因此读数基线会跟着变——档案驱动的是"这只${noun}自己的基线"，不是种群平均值。`;
}

// ---------------------------------------------------------------- 我的页与商城：按物种措辞的句子

/**
 * 商城说明：只换主语。
 *
 * 它必须把「卖的是带体、不是整机」说在前面：商城里的克重只是带体 + 表盘，
 * 不含摄像头等任何附加模块，否则用户会拿它去对整机重量。
 */
function shopIntroOf(noun: string): string {
  return `这里卖的是项圈带（带体），不是整机。按材质 / 大小 / 轻重各选一项，屏上会实时算出这条带多重、加上表盘多重、以及它合不合这只${noun}的项圈重量预算。`;
}

/**
 * 「为什么这只宠物的预算这么小」——按物种换主语，解释的是 core 的规则而不是界面的偏好。
 *
 * 这句话是这一页存在的理由：预算 = 体重 2% 是个**乘法**，于是越轻的个体，
 * 允许的整圈重量越小，同一条带子对小体型更容易超预算。
 */
function budgetScaleNoteOf(noun: string): string {
  return `预算按体重的 2% 缩放（工程经验值，证据等级 weak）：这只${noun}越轻，允许的整圈重量越小。所以同一条带子，小体型更容易超预算——这是重量规则的直接后果，不是这条带子的质量问题。`;
}

// ---------------------------------------------------------------- 猫

const CAT_NOUN = '猫';
const CAT_NOUN_FULL = '猫';

/**
 * 猫的活动名。
 *
 * ⚠️ **刻意照抄**，不从 core 的 `ACTIVITY_DEFS` 派生：界面上这几句话是**界面口径**，
 * 与 core 的行为词表有两处不同（core 的 `locomoting` 是「移动」，这里是「走动」；
 * core 的 `eliminating` 是「使用猫砂盆」，这里是「用猫砂盆」）。
 * 本轮硬要求是猫版画面**逐字不变**，所以这里保留原文；狗版则直接从 core 派生。
 */
const CAT_ACTIVITY_LABELS: Readonly<Record<string, string>> = {
  resting: '休息',
  alert: '静坐观察',
  grooming: '理毛',
  locomoting: '走动',
  playing: '玩耍',
  feeding: '进食',
  drinking: '喝水',
  eliminating: '用猫砂盆',
  scratching: '抓挠',
  hiding: '躲藏',
  perching: '高处停留',
  vomit: '干呕',
};

/** 事件流次数格子里的六项（顺序即显示顺序）。 */
const CAT_EVENT_COUNT_ACTIVITIES: readonly string[] = [
  'drinking',
  'feeding',
  'playing',
  'eliminating',
  'scratching',
  'hiding',
];

const CAT_INCIDENTS = incidentVocab(INCIDENT_KINDS, INCIDENT_DEFS);

const CAT_AGE_BAND_LABELS: Readonly<Record<AgeBand, string>> = {
  junior: '幼猫（<1 岁）',
  adult: '成猫（1–8 岁）',
  senior: '初老（8–13 岁）',
  geriatric: '高龄（>13 岁）',
};

// ---------------------------------------------------------------- 狗

const DOG_NOUN = '狗';
/** 狗版场景里的个体就是柴犬，句子说「相对这只柴犬自己的基线」比「狗」更自然。 */
const DOG_NOUN_FULL = '柴犬';

/**
 * 狗的活动名：**直接从 core 的狗活动表派生**（单一事实来源），只在语义有物种差别时覆盖。
 *
 * 唯一被覆盖的是 `eliminating`：猫版是「用猫砂盆」（砂盆在屋内），
 * 而狗只去院子里的固定排泄角——词表要把「在哪」说清楚，否则主人会以为屋里有砂盆。
 */
const DOG_ACTIVITY_LABELS: Readonly<Record<string, string>> = {
  resting: DOG_ACTIVITY_DEFS.resting.label,
  sleeping: DOG_ACTIVITY_DEFS.sleeping.label,
  walking: DOG_ACTIVITY_DEFS.walking.label,
  trotting: DOG_ACTIVITY_DEFS.trotting.label,
  running: DOG_ACTIVITY_DEFS.running.label,
  sniffing: DOG_ACTIVITY_DEFS.sniffing.label,
  drinking: DOG_ACTIVITY_DEFS.drinking.label,
  eating: DOG_ACTIVITY_DEFS.eating.label,
  playing: DOG_ACTIVITY_DEFS.playing.label,
  eliminating: '在院内排泄',
  sitting: DOG_ACTIVITY_DEFS.sitting.label,
  alerting: DOG_ACTIVITY_DEFS.alerting.label,
};

/**
 * 狗的事件流次数格子。
 *
 * 与猫版**刻意不同**：猫版的六项里有抓挠与躲藏（砂盆、抓挠面、躲藏点是猫的环境资源），
 * 狗的对应物是「在院内排泄」与「奔跑/嗅闻」这类户外行为。共用同一套格子等于
 * 给狗安一个它在场景里不会做的行为。
 */
const DOG_EVENT_COUNT_ACTIVITIES: readonly string[] = [
  'drinking',
  'eating',
  'playing',
  'eliminating',
  'sniffing',
  'running',
];

const DOG_INCIDENTS = incidentVocab(DOG_INCIDENT_KINDS, DOG_INCIDENT_DEFS);

/**
 * 狗的年龄档。
 *
 * 阈值沿用 core 的 `ageBandOf`（它对猫狗是同一套近似，core 自己注明大型犬的老年来得更早）
 * ——界面**不另定阈值**，否则「档案页的档位」与「基线按档分层」会各自说一套。
 */
const DOG_AGE_BAND_LABELS: Readonly<Record<AgeBand, string>> = {
  junior: '幼犬（<1 岁）',
  adult: '成犬（1–8 岁）',
  senior: '初老（8–13 岁）',
  geriatric: '高龄（>13 岁）',
};

// ---------------------------------------------------------------- 体型档（八档，两套各补全）

/** 猫的三档。括号里的阈值与 core 的 `sizeClassOf` 一致。 */
const CAT_SIZE_ONLY: Readonly<Record<'cat-small' | 'cat-standard' | 'cat-large', string>> = {
  'cat-small': '偏小（<3.2 kg）',
  'cat-standard': '标准（3.2–5.5 kg）',
  'cat-large': '偏大（>5.5 kg）',
};

/** 狗的五档。阈值同样取自 core 的 `sizeClassOf`。 */
const DOG_SIZE_ONLY: Readonly<Record<'toy' | 'small' | 'medium' | 'large' | 'giant', string>> = {
  toy: '超小型（<5 kg）',
  small: '小型（5–10 kg）',
  medium: '中型（10–25 kg）',
  large: '大型（25–45 kg）',
  giant: '超大型（>45 kg）',
};

/**
 * 两份完整表：各自带上对方那几档，只为让 `Record<SizeClass, …>` 成立。
 * 为什么不用 `Partial` + 运行时兜底：兜底会把「漏配一个档位」变成界面上直接露出
 * 英文 id（`cat-standard`）的静默故障；让类型检查当场拦下更省事。
 */
const CAT_SIZE_LABELS: Readonly<Record<SizeClass, string>> = { ...CAT_SIZE_ONLY, ...DOG_SIZE_ONLY };
const DOG_SIZE_LABELS: Readonly<Record<SizeClass, string>> = { ...DOG_SIZE_ONLY, ...CAT_SIZE_ONLY };

// ---------------------------------------------------------------- 其余共用词

/**
 * 漂移页四路通道名。
 *
 * 两个物种**共用同一份**：心率、呼吸频率是生理量，活动量、发声次数是行为量，
 * 没有一句是物种措辞。这里刻意不造一个假的差异——需要差异时再加字段，
 * 而不是先复制两份一样的字符串等着它们漂移。
 */
const DRIFT_LABELS: Readonly<Record<DriftChannelKey, string>> = {
  hr: '心率',
  rr: '呼吸频率',
  activity: '活动量',
  vocalization: '发声次数',
};

// ---------------------------------------------------------------- 我的页 / 商城：两物种共用的词

/**
 * 「我的」页与商城里**没有一句是物种措辞**的那些词，两个物种共用一份。
 *
 * 为什么共用而不是复制两份：这四句子项名、商城的维度标题、确认文案、以及电池与定位的
 * 边界句，说的都是同一件事（项圈电量是仿真值、定位来自行为时间线、克重是工程估算）。
 * 复制两份只会等着它们漂移——而漂移的表现形式恰好是"猫版说仿真、狗版忘了说"这类最不该出现的事。
 * 只有**句子里出现物种**的那三处（`shopIntro` / `budgetScaleNote`）才按物种分别生成。
 *
 * ⚠️ 边界句里必须同时出现「仿真 / 推导」与否定结构，缺一不可（见 `claims.ts` 的政策）。
 */
const MINE_SHARED = {
  /** 页签名：猫狗都是「我的」 */
  tabMine: '我的',
  mineItemProfileTitle: '宠物档案',
  mineItemProfileDesc: '品种与年龄（可选）：改档案会按新档案重建整段仿真会话',
  mineItemBatteryTitle: '项圈电量',
  mineItemBatteryDesc: '表盘电量与充电状态（仿真值）',
  mineItemLocationTitle: '定位',
  mineItemLocationDesc: '它现在所在的位置，以及本会话到过的地方',
  mineItemShopTitle: '商城',
  mineItemShopDesc: '项圈带：材质 / 大小 / 轻重，并算出合不合身',
  mineBackLabel: '返回',

  shopTitle: '项圈商城 · 项圈带',
  shopMaterialTitle: '材质',
  shopSizeTitle: '大小（颈围）',
  shopGradeTitle: '轻重',
  shopConfirmLabel: '选择这条',
  shopConfirmedNote: '已记下这次选择（本项目不做真实下单与支付流程，这只是界面上的确认动作）。',
  shopEvidenceNote:
    '每个数字都带证据等级：本页克重是工程方案里的量级（材料密度 × 常见厚度，或在售产品规格页汇总），不是实测值；证据等级为「未核实」的材质按本项目政策不给克重数字。',
  shopBoundaryNote:
    '这些克重只用于演示"重量预算怎么算"，不构成任何产品性能或佩戴舒适度的结论；本项目不造真硬件，也没有做过称重或佩戴测试。',

  batteryTitle: '项圈电量',
  batteryDesc: '表盘电量与充电状态：百分比由演示时钟推出，是仿真值。',
  batterySimNote:
    '仿真值：这条曲线由演示时钟推出（满电按约 18 演示小时线性放电，会话开头 30 分钟视作在充电座上），不是实测续航，也不代表任何真实设备的电池表现。',

  locationTitle: '定位',
  locationDesc: '它现在所在的位置（房间 / 院子里的具名锚点），以及本会话到过的地方。',
  locationSourceNote:
    '数据来源：场景推来的行为状态（当前锚点）与同一条行为时间线里的锚点序列——画面、事件流与这一页读的是同一份时间线，所以它每次都能复现。',
  locationBoundaryNote:
    '这里的"定位"是由行为时间线推出的所在位置（房间 / 院子里的具名锚点），不是卫星定位，也没有坐标精度；室内场景下更不该把它当成定位精度来读。',
} as const;

// ---------------------------------------------------------------- 两个实例

/**
 * 猫的词表：**重构前 `app-phone.ts` 的原文**。
 *
 * 不传 `vocab` 时 `AppPhone` 就用它，因此猫版页面一行都不用改，渲染逐字不变。
 */
export const CAT_APP_VOCAB: AppSpeciesVocab = {
  breeds: CAT_BREEDS,
  speciesNoun: CAT_NOUN,
  speciesNounFull: CAT_NOUN_FULL,
  anchorLabels: CAT_ANCHOR_LABELS,
  activityLabels: CAT_ACTIVITY_LABELS,
  eventCountActivities: CAT_EVENT_COUNT_ACTIVITIES,
  incidentLabels: CAT_INCIDENTS.labels,
  incidentHints: CAT_INCIDENTS.hints,
  ageBandLabels: CAT_AGE_BAND_LABELS,
  sizeClassLabels: CAT_SIZE_LABELS,
  driftLabels: DRIFT_LABELS,
  povBoundaryNote: povNoteOf(CAT_NOUN),
  driftBoundaryNote: driftNoteOf(CAT_NOUN_FULL),
  // 读数边界句与仿真声明直接引用 core 的常量：措辞的单一事实来源仍然在 core
  vitalsBoundaryNote: VITALS_BOUNDARY_NOTE,
  vitalsSimNote: VITALS_SIM_NOTE,
  alertReferralNote: VITAL_ALERT_REFERRAL,
  profileRebuildNote: rebuildNoteOf(CAT_NOUN),
  demoTimeScaleNote: '约 20×',
  // 「我的」页（原「档案」页）：档案那一套文案全部保留，成为「宠物档案」子视图的内容
  ...MINE_SHARED,
  shopIntro: shopIntroOf(CAT_NOUN),
  budgetScaleNote: budgetScaleNoteOf(CAT_NOUN),
};

/**
 * 狗版的读数边界句与仿真声明。
 *
 * ⚠️ 为什么不是引用 core：`VITALS_BOUNDARY_NOTE` / `VITALS_SIM_NOTE` 的主语写的是猫
 * （「不是对猫身体状态的判断」「在猫上均未取得验证研究」），而 core 目前没有狗版。
 * 这里**只换主语**：否定结构（不是 / 不构成 / 均未 / 不能）与整句语义逐字保留，
 * 一句也没有被削弱。core 将来若导出狗版常量，把这两项改成引用它即可。
 *
 * 关于「在本项目中」：仿真声明只说**本项目**没有取得验证研究，
 * 不去宣称犬用项圈在整个领域里没有研究——那是另一个命题，本项目没有依据。
 */
const DOG_VITALS_BOUNDARY_NOTE =
  '本页展示的是仿真得到的项圈读数与读数有效性，不是对狗身体状态的判断，也不构成兽医诊断。单次读数不能说明任何问题；任何持续异常或任何疑似急症，请直接联系执业兽医，不要等待本页给出结论。';
const DOG_VITALS_SIM_NOTE =
  '仿真声明：本页数据由仿真器生成，用于验证算法链路是否自洽。项圈的心率、呼吸频率与体表温在本项目中均未取得验证研究，因此本页的任何数字都不代表真实设备的准确度，也不能作为临场判断依据。';

/**
 * 狗的词表：结构与猫版逐项对应，只有词与品种是狗的。
 *
 * 转诊路径**原样引用 core 的狗版句子**（`DOG_INCIDENT_REFERRAL_NOTE`）：
 * 它列的是「需要尽快就诊」的可核查情形，UI 不得改写（见 `docs/design/11-shiba-dog-and-behaviors.md`）。
 */
export const DOG_APP_VOCAB: AppSpeciesVocab = {
  breeds: DOG_BREEDS,
  speciesNoun: DOG_NOUN,
  speciesNounFull: DOG_NOUN_FULL,
  anchorLabels: DOG_ANCHOR_LABELS,
  activityLabels: DOG_ACTIVITY_LABELS,
  eventCountActivities: DOG_EVENT_COUNT_ACTIVITIES,
  incidentLabels: DOG_INCIDENTS.labels,
  incidentHints: DOG_INCIDENTS.hints,
  ageBandLabels: DOG_AGE_BAND_LABELS,
  sizeClassLabels: DOG_SIZE_LABELS,
  driftLabels: DRIFT_LABELS,
  povBoundaryNote: povNoteOf(DOG_NOUN),
  driftBoundaryNote: driftNoteOf(DOG_NOUN_FULL),
  vitalsBoundaryNote: DOG_VITALS_BOUNDARY_NOTE,
  vitalsSimNote: DOG_VITALS_SIM_NOTE,
  alertReferralNote: DOG_INCIDENT_REFERRAL_NOTE,
  profileRebuildNote: rebuildNoteOf(DOG_NOUN),
  demoTimeScaleNote: '约 12×',
  // 与猫版**同一份**结构：只有带物种主语的两句换成狗的（见 `MINE_SHARED` 的说明）
  ...MINE_SHARED,
  shopIntro: shopIntroOf(DOG_NOUN),
  budgetScaleNote: budgetScaleNoteOf(DOG_NOUN),
};
