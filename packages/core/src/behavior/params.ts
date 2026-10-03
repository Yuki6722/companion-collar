/**
 * 行为参数登记表：**行为模型里每一个面向用户的数值都必须在这里登记**。
 *
 * 为什么要有这张表：
 *   证据政策要求「凡面向用户展示的参数值，其类型必须携带 EvidenceTag」。行为层的风险比
 *   感知参数层更高——因为「猫一天跳几次」「一次抓挠多久」这类数字**看起来应该有**，
 *   但一手来源里根本没有。没有登记表，这些数字会在实现时被凭手感补上。
 *
 * 三类取值，处理方式严格不同：
 *   - `strong` / `moderate` / `weak`：可以给出数值，但 UI 必须同时显示等级与来源。
 *   - `disputed`：**必须**是二元区间 `[lo, hi]`，并给出「来源冲突」提示，不打单一数字。
 *   - `unverified`：**必须**是 `null`。UI 显示「未取得可靠来源」，**不得显示数字**。
 *     约束由 `behaviorParamText()` 与单测共同保证。
 *
 * 来源缩写见文件末尾 `SOURCES`。
 */
import type { EvidenceTag, Tier } from '../types.ts';

/** 操作化常量：指南/文献没给数值，本项目为了能跑起来自行选定，**标 weak 并写明理由**。 */
export interface OperativeConstant {
  id: string;
  label: string;
  value: number;
  unit: string;
  why: string;
}

export interface BehaviorParam {
  id: string;
  /** 面向用户的中文名——只描述外部可观察量 */
  label: string;
  /**
   * 数值。`unverified` 强制为 null，`disputed` 强制为二元数组。
   * 结构化类型只写到 `Tier` 一层（这也是 `EvidenceTag` 本身的类型），
   * 因此要判「是不是 conflict」只能走 `behaviorParamRange()`。
   */
  value: number | [number, number] | null;
  unit?: string;
  evidence: EvidenceTag;
}

// ---------------------------------------------------------------- 来源

const SOURCES = {
  yamazaki2020:
    'Yamazaki et al. 2020, PLoS ONE 15(7): e0236795（n=61 客户饲养猫；三轴加速度计 + 气压传感器）',
  sharon2020: 'Sharon et al. 2020, AJVR 81(4): 334–343（n=13，实验室观察室 + 3 机位同步录像）',
  eckstein2000: 'Eckstein & Hart 2000, Appl Anim Behav Sci 68(2): 131–140（n=11，录像研究）',
  smit2023: 'Smit et al. 2023, Sensors 23(16): 7165（n=12 家养短毛猫，项圈 + 胸背带 + 连续 7 天录像）',
  wilson2016: 'Wilson et al. 2016, JFMS 18(10): 791–797（n=4105 分析样本，36 国互联网问卷）',
  migny2026:
    'Migny, Concordet & Reynolds 2026, JFMS 28(2): 1098612X251414320（n=9 健康室内猫，联网喂食器 + 联网砂盆，63–289 天）',
  hare2025:
    'Hare, Marsilio, Halperin, Stellato & Moody 2025, Appl Anim Behav Sci（n=33 猫-主配对，受试内交叉设计）',
  piccione2014: 'Piccione et al. 2014, Biological Rhythm Research 45(4): 615–623（n=5 猫，Actiwatch-Mini 连续 1 周）',
  vanderleij2019: 'van der Leij et al. 2019, PLoS ONE 14(10): e0223492（随机对照试验，n=23 荷兰收容所猫）',
  isfm2022: '2022 ISFM 猫急性疼痛共识指南，JFMS 24(1): 4–30（PMC10845386）',
  ennoshima: 'Enomoto, Lascelles & Gruen 2020, JFMS 22(12): 1137–1147（汇总 n=249 DJD 疼痛猫 + 53 对照）',
  dijkstra2018: 'Dijkstra, Teske & Szatmári 2018, Vet J 234: 96–101（诊室 88 只健康猫 + 家中视频观察）',
  merck: 'MSD/Merck Veterinary Manual 汇总表（引自 Dukes\' Physiology of Domestic Animals, 12th ed.）',
} as const;

/** 需要在界面/文档里连带披露的利益冲突。 */
const NOTE_COI_YAMAZAKI =
  '⚠️ 利益冲突：设备由 JARMeC 借出，两名作者为其雇员，JARMeC 就相关设备申请专利（JP2017-514095，pending）。';
const NOTE_COI_WILSON = '⚠️ 利益冲突：作者为 Ceva Animal Health 员工，数据分析在 CEVA Santé Animale 完成。';
const NOTE_COI_MIGNY = '⚠️ 限制：设备由 Ceva 与 Novandsat 免费提供；n=9，作者自称 preliminary study。';

// ---------------------------------------------------------------- 登记表

export const BEHAVIOR_PARAMS: readonly BehaviorParam[] = [
  // ---------- 时间预算
  {
    id: 'restAndSleepShare',
    label: '休息与睡眠占时间预算',
    value: 0.5,
    unit: '比例',
    evidence: {
      tier: 'moderate',
      source: SOURCES.eckstein2000,
      note: '⚠️ 该研究的猫是「为录像而限制活动」的实验条件，不是家庭环境；直接搬到居家场景需要标注这一限制。',
    },
  },
  {
    id: 'groomingShare',
    label: '理毛占时间预算',
    value: 0.04,
    unit: '比例',
    evidence: {
      tier: 'moderate',
      source: SOURCES.eckstein2000,
      note: '理毛由若干短片段组成；单次片段的秒级时长未取得可靠来源，因此不在此登记。',
    },
  },
  {
    id: 'activeShare',
    label: '「活动」占时间预算',
    value: null,
    evidence: {
      tier: 'unverified',
      source: SOURCES.eckstein2000,
      note: '未取得可靠一手来源能在真实家庭环境给出「睡眠/休息/活动」三分占比，因此不展示数字。',
    },
  },

  // ---------- 节律
  {
    id: 'crepuscularRhythm',
    label: '24 小时活动节律的稳健性',
    value: [0, 1],
    evidence: {
      tier: 'disputed',
      source: `${SOURCES.yamazaki2020}；${SOURCES.piccione2014}`,
      note: '来源冲突：n=61 的研究显示日间/夜间静息时长随年龄有差异，而 n=5 的研究未检出总活动量的日节律（作者称主人存在使猫「失去节律」）。本项目因此只输出**相对倾向权重**，不输出峰值时刻。',
      range: [0, 1],
    },
  },

  // ---------- 跳跃
  {
    id: 'jumpDetectMinHeightM',
    label: '跳跃计数的物理下限',
    value: 0.4,
    unit: '米',
    evidence: {
      tier: 'moderate',
      source: SOURCES.yamazaki2020,
      note: `原文判定规则：气压变化对应 ≥40 cm 才计一次跳跃。低于该高度的跳跃不会被计入。${NOTE_COI_YAMAZAKI}`,
    },
  },
  {
    id: 'jumpTypeAccuracy',
    label: '跳跃类型（上跳/下跳/横跳）分类正确率',
    value: 0.946,
    unit: '比例',
    evidence: {
      tier: 'moderate',
      source: SOURCES.sharon2020,
      note: '731 次跳跃事件中 29 次误分类；每猫误分类率 5.4%（范围 0%–12.5%）。跳跃为实验者主动诱导，不等于自然频次。',
    },
  },
  {
    id: 'jumpsPerDay',
    label: '每日自然跳跃次数',
    value: null,
    evidence: {
      tier: 'unverified',
      source: SOURCES.sharon2020,
      note: '已知数据全部来自被诱导条件下的跳跃（实验室、5–8 小时、n=13），不可外推为自然日频次。',
    },
  },
  {
    id: 'maxJumpHeightM',
    label: '最大跳跃高度',
    value: null,
    evidence: {
      tier: 'unverified',
      source: '（未取得可靠来源）',
      note: '流传的「约 150 cm」「5–6 倍体长」均出自宠物内容站，非同行评审，因此不使用该数字。',
    },
  },
  {
    id: 'activityBoutCountPerDay',
    label: '每日活动片段数',
    value: null,
    evidence: {
      tier: 'unverified',
      source: '（未取得可靠来源）',
      note: '本仓库检索范围内没有任何一手研究给出该计数，因此不展示数字；仿真器只保证「短促活动 + 长休息交替」这一结构。',
    },
  },
  {
    id: 'boutDurationS',
    label: '活动/休息片段的典型时长',
    value: null,
    unit: '秒',
    evidence: {
      tier: 'unverified',
      source: '（未取得可靠来源）',
      note: '未取得可靠一手来源。行为引擎的时长区间属**操作化常量**，见 OPERATIVE_CONSTANTS。',
    },
  },

  // ---------- 随年龄的方向性结论
  {
    id: 'activityAgeCorrelation',
    label: '每日平均活动量与年龄的相关',
    value: -0.32,
    unit: 'r',
    evidence: { tier: 'moderate', source: SOURCES.yamazaki2020, note: 'p < 0.05，n=61。' },
  },
  {
    id: 'jumpCountAgeCorrelation',
    label: '每日跳跃次数与年龄的相关',
    value: -0.26,
    unit: 'r',
    evidence: { tier: 'moderate', source: SOURCES.yamazaki2020, note: 'p < 0.05，n=61。' },
  },
  {
    id: 'restSleepAgeCorrelation',
    label: '静息与睡眠总时长与年龄的相关',
    value: 0.45,
    unit: 'r',
    evidence: {
      tier: 'moderate',
      source: SOURCES.yamazaki2020,
      note: 'p < 0.05。日间 r=+0.41、夜间 r=+0.25。这是「跨猫比较会被年龄主导、自身基线对比可忽略年龄」的依据。',
    },
  },

  // ---------- 抓挠
  {
    id: 'scratchDailyAtLeastOnce',
    label: '存在不当抓挠的猫中，每日至少抓挠一次的占比',
    value: 0.65,
    unit: '比例',
    evidence: {
      tier: 'moderate',
      source: SOURCES.wilson2016,
      note: `问卷数据；不当抓挠者中含每日多次者 35.4%。${NOTE_COI_WILSON}`,
      range: [0.354, 0.65],
    },
  },
  {
    id: 'scratchBoutDurationS',
    label: '单次抓挠片段时长',
    value: null,
    unit: '秒',
    evidence: {
      tier: 'unverified',
      source: SOURCES.wilson2016,
      note: '现有研究测量的是频次等级与强度评分，没有任何一项测量秒级时长，因此不使用数字。',
    },
  },

  // ---------- 进食与排泄
  {
    id: 'feedingBimodalWindows',
    label: '进食的日周期窗口',
    value: [4, 20],
    unit: '小时（当日 0–24）',
    evidence: {
      tier: 'moderate',
      source: SOURCES.migny2026,
      note: `9/9 猫存在日周期剖面，8/9 呈双峰，主要落在约 04:00–08:00 与 16:00–20:00。⚠️ 6/9 猫为定时喂食，双峰部分由饲喂制度决定，不能当作猫的内生节律。${NOTE_COI_MIGNY}`,
      range: [4, 20],
    },
  },
  {
    id: 'eliminationBimodalWindows',
    label: '使用猫砂盆的日周期窗口',
    value: [4, 24],
    unit: '小时（当日 0–24）',
    evidence: {
      tier: 'moderate',
      source: SOURCES.migny2026,
      note: `9/9 猫呈双峰，主要落在约 04:00–08:00 与 20:00–24:00，即主人不活动或不在家时。${NOTE_COI_MIGNY}`,
      range: [4, 24],
    },
  },
  {
    id: 'eliminationVisitsPerDay',
    label: '每日排尿与排粪次数',
    value: null,
    evidence: {
      tier: 'unverified',
      source: SOURCES.migny2026,
      note: '该研究只报告合并访问次数的日周期形状，未给出绝对次数，也未区分排尿与排粪，因此不使用数字。',
    },
  },
  {
    id: 'waterIntakeMlPerKgDay',
    label: '每日饮水量',
    value: null,
    unit: 'ml/kg/日',
    evidence: {
      tier: 'unverified',
      source: '（未取得可靠来源）',
      note: '且饮水量在**物理上不经过颈部**，项圈无法测量（需要称重水碗或微芯片饮水机）。',
    },
  },

  // ---------- 躲藏与高处
  {
    id: 'hidingShare',
    label: '躲藏时长占比',
    value: null,
    evidence: {
      tier: 'unverified',
      source: '（未取得可靠来源）',
      note: '未取得量化「病猫 vs 健康猫躲藏时长」的同行评审研究，且项圈无法区分躲藏与安静休息。',
    },
  },
  {
    id: 'hidingBoxRecoveryDays',
    label: '提供躲藏箱后应激评分达到稳态提前的天数',
    value: 7,
    unit: '天',
    evidence: {
      tier: 'moderate',
      source: SOURCES.vanderleij2019,
      note: '⚠️ 外推限制：人群是**新入收容所的猫**（急性应激、陌生环境），不能直接外推到已定居的家庭猫。',
    },
  },
  {
    id: 'verticalSpaceShare',
    label: '在垂直空间停留的时长占比',
    value: null,
    evidence: {
      tier: 'unverified',
      source: '（未取得可靠来源）',
      note: '唯一相关的定量研究是猫咖人群（8–9 只猫合笼、访客密集），其数值不可外推到家猫。',
    },
  },

  // ---------- 主人在场 / 不在场
  {
    id: 'absentVocalizationIRR',
    label: '主人不在场时发声率的变化',
    value: 3.2,
    unit: '发病率比 IRR',
    evidence: {
      tier: 'moderate',
      source: SOURCES.hare2025,
      note: '⚠️ 场景限制：该研究是**兽医体检**情境（高应激、陌生环境），不是居家。本项目只把它当作「发声事件计数存在差异」的方向性依据，不解释原因，更不解释语义。',
    },
  },
  {
    id: 'absentActivityDirection',
    label: '主人不在场时活动量的变化方向',
    value: null,
    evidence: {
      tier: 'unverified',
      source: '（未取得可靠来源）',
      note: '仿真器可以生成该通道，但产品文案必须标为待验证假设，而不是文献结论。',
    },
  },
  {
    id: 'absentScratchDirection',
    label: '主人不在场时抓挠的变化方向',
    value: null,
    evidence: {
      tier: 'unverified',
      source: '（未取得可靠来源）',
      note: '未取得一手来源。',
    },
  },
  {
    id: 'absentHidingDirection',
    label: '主人不在场时躲藏的变化方向',
    value: null,
    evidence: {
      tier: 'unverified',
      source: '（未取得可靠来源）',
      note: '未取得一手来源。',
    },
  },

  // ---------- 突发（急性）相关
  {
    id: 'freezingAmbiguity',
    label: '长时间不动能否区分为疼痛或恐惧',
    value: null,
    evidence: {
      tier: 'disputed',
      source: SOURCES.isfm2022,
      note: '来源冲突/无法区分：指南原文指出猫会在**恐惧**时减少移动并僵住，因此「长时间低活动」既可能来自疼痛也可能来自恐惧。这不是「两个数值之争」而是「该现象无法被可靠归因」，因此**不给区间、不给数值**——这正是本模型最重要的假阳性来源，写入漂移报告的边界文案。',
    },
  },
  {
    id: 'vocalizationAsPainSign',
    label: '发声能否作为独立的疼痛征象',
    value: null,
    evidence: {
      tier: 'disputed',
      source: `${SOURCES.isfm2022}；UFEPS-SF（PeerJ 10:e13134）；Feline Grimace Scale（Sci Rep 9:19128）`,
      note: '来源冲突：Glasgow 量表与 2022 ISFM 指南把它算作征象，而 UFEPS 短表**明确删除**该项、FGS **完全没有**该项；AAHA 与 iCatCare 反而强调猫更少表现出明显疼痛（例如发声）。因此**无法列为**独立征象，本项目只把发声当作「有声/无声」事件计数，也不作语义解读。',
    },
  },
  {
    id: 'ownerUnderreportSensitivity',
    label: '未被引导时，主人对骨关节疼痛清单的敏感度',
    value: 0.55,
    unit: '比例',
    evidence: {
      tier: 'moderate',
      source: SOURCES.ennoshima,
      note: '同一份 6 题清单：已受引导（DJD-informed）的主人为 99%，未受引导者为 55%（特异度 97%）。即约 45% 的信号未被主人报告。⚠️ 必须按疾病分述，不得写成「X% 的主人发现不了疾病」这种单一标题句。',
      range: [0.55, 0.99],
    },
  },
  {
    id: 'restingRespiratoryRate',
    label: '静息呼吸频率',
    value: [16, 40],
    unit: '次/分',
    evidence: {
      tier: 'disputed',
      source: `${SOURCES.merck}；${SOURCES.dijkstra2018}`,
      note: '来源/语境冲突：教科书静息参考 16–40；同一批研究在**诊室**测得中位 64（区间 28–176），家中静息中位 27（16–60），家中午睡中位 20（9–28）。不是数值冲突而是**测量条件**差异。⚠️ 猫用项圈的呼吸频率**未取得验证研究**。',
      range: [16, 40],
    },
  },
  {
    id: 'restingHeartRate',
    label: '静息心率',
    value: [120, 140],
    unit: '次/分',
    evidence: {
      tier: 'disputed',
      source: `${SOURCES.merck}；Griffin et al. 2021, JFMS 23(4): 364–369`,
      note: '来源/语境冲突：MSD 静息表 120–140；MSD 分诊表给 150–220；教学医院实测门诊入口 176±35、检查室 195、处置区 226。「140–220」这一常见版本在本次检索中未取得可读一手来源，因此不使用。本项目只做**相对自身基线**的偏离。',
      range: [120, 140],
    },
  },
];

// ---------------------------------------------------------------- 操作化常量

/**
 * 行为引擎里那些**文献没给数值、但我们为了能跑起来必须选定**的量。
 *
 * 为什么不混进 `BEHAVIOR_PARAMS`：混在一起会让「有文献来源的数字」和「我们拍的数字」
 * 看起来同级。这里单独一张表，每项必须写明为什么这么选，UI 与文档都标为**工程操作化常量**。
 */
export const OPERATIVE_CONSTANTS: readonly OperativeConstant[] = [
  {
    id: 'walkSpeedMps',
    label: '移动速度',
    value: 0.45,
    unit: '米/秒',
    why: '房间是 7.2 × 5.6 m 的固定样板间，锚点之间距离很短。文献没有给「家猫悠闲走动速度」的可靠一手值，因此按演示可读性选定，并由房间尺度反推移动时长。',
  },
  {
    id: 'stintRestS',
    label: '单次原地行为时长区间（下限）',
    value: 20,
    unit: '秒',
    why: '片段时长本身标 unverified（见 BEHAVIOR_PARAMS 的 boutDurationS）。这里给出的是**演示用区间**，只保证「短促行为 + 长休息交替」这一结构，不代表真实片段时长分布。',
  },
  {
    id: 'stintActiveS',
    label: '单次原地行为时长区间（上限）',
    value: 180,
    unit: '秒',
    why: '同上：片段时长本身标 unverified。上限取 180 秒是为了让「抓挠、理毛、玩耍」这类小片段在演示里真的短促，与「休息片段」拉开量级差；不代表真实片段时长分布。',
  },
  {
    id: 'jumpMinHeightM',
    label: '算作「攀跳」的最小高度差',
    value: 0.15,
    unit: '米',
    why: '高度差低于此值一律当走路（例如从地面到沙发面）。取值的理由是「需要明显蹬地才算跳」，不是文献结论。',
  },
  {
    id: 'anchorVerticalReachM',
    label: '可达的最高台面高度',
    value: 2.4,
    unit: '米',
    why: '不引用任何「最大跳跃高度」数字（该项 unverified）。这里只做一条**房间可达性**约束：本样板间最高的猫用台面是衣柜顶 2.4 m，因此取该值作为上限。',
  },
];

// ---------------------------------------------------------------- 查询接口

const PARAM_INDEX: ReadonlyMap<string, BehaviorParam> = new Map(
  BEHAVIOR_PARAMS.map((p) => [p.id, p]),
);

export function behaviorParam(id: string): BehaviorParam | undefined {
  return PARAM_INDEX.get(id);
}

export function behaviorParamsByTier(tier: Tier): readonly BehaviorParam[] {
  return BEHAVIOR_PARAMS.filter((p) => p.evidence.tier === tier);
}

/** 取数值。`unverified` 恒返回 null；`disputed` 返回区间。 */
export function behaviorParamValue(id: string): number | [number, number] | null {
  return behaviorParam(id)?.value ?? null;
}

/**
 * 取 `disputed` 的区间。
 *
 * 为什么不看 `evidence.range`：那个字段是**可选的**（类型上 tier 只到 Tier 一层），
 * 靠它判冲突会得到一个「可能为 undefined」的分支。这里直接用 value 的结构判断，
 * 同时用单测强制「tier === 'disputed' 的项，value 必须是二元数组」。
 */
export function behaviorParamRange(id: string): [number, number] | null {
  const p = behaviorParam(id);
  if (!p || !Array.isArray(p.value)) return null;
  return p.value;
}

/** 数值型参数（单一数字）取值；非单一数字返回 null。 */
export function behaviorParamNumber(id: string): number | null {
  const v = behaviorParam(id)?.value;
  return typeof v === 'number' ? v : null;
}

/**
 * 面向用户的数值文本。
 *
 * 这是「`unverified` 不得展示具体数值」这条纪律的**执行点**：任何界面要显示参数值，
 * 都应该走这里，而不是直接读 `value`。单测会断言 `unverified` 项绝不输出数字。
 */
export function behaviorParamText(id: string): string {
  const p = behaviorParam(id);
  if (!p) return '未登记';
  if (p.value === null) {
    if (p.evidence.tier === 'unverified') return '未取得可靠来源';
    if (p.evidence.tier === 'disputed') return '未取得可裁决的来源';
    return '未登记数值';
  }
  if (Array.isArray(p.value)) {
    const [lo, hi] = p.value;
    const unit = p.unit ? ` ${p.unit}` : '';
    return `${formatNumber(lo)}–${formatNumber(hi)}${unit}`;
  }
  const unit = p.unit ? ` ${p.unit}` : '';
  return `${formatNumber(p.value)}${unit}`;
}

function formatNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(v < 1 ? 2 : 1);
}

/** 是否需要在界面上打出「来源冲突」提示。 */
export function isDisputed(p: BehaviorParam): boolean {
  return p.evidence.tier === 'disputed';
}
