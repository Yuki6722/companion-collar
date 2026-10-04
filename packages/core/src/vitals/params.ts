/**
 * 生理读数参数登记表：项圈三通道（心率 / 呼吸 / 体表温）的**证据**与**操作化常量**。
 *
 * 为什么单独一张表、而不是继续塞进 `BEHAVIOR_PARAMS`：
 *   行为层的数字（一天跳几次、一次抓挠多久）与生理层的数字（静息心率区间、
 *   睡眠呼吸频率阈值）证据来源完全不同、读者也不同。混在一张表里，
 *   「文献给了区间的量」与「文献根本没给的量」会看起来同级。
 *
 * 三类取值与行为层同规则：
 *   - `strong` / `moderate` / `weak`：可以给数值，UI 必须同时显示等级与来源；
 *   - `disputed`：**必须是二元区间** `[lo, hi]`，并写明来源冲突；
 *   - `unverified`：**必须是 `null`**，UI 显示「未取得可靠来源」，不得显示数字。
 *
 * ⚠️ 本表最重要的三条 `unverified`：**项圈的心率、呼吸频率、体表温在猫上都没有
 *   验证研究**。它们不是"已知精度较低"，而是"没有任何清醒居家猫 vs 金标准的验证"。
 *   因此任何面向用户的读数展示，都必须同时给出测量条件与"未取得猫用项圈验证"。
 */
import type { EvidenceTag, Tier } from '../types.ts';

/**
 * 操作化常量：文献没给数值、本项目为了能跑起来自行选定，**必须写明为什么**。
 *
 * ⚠️ 为什么不复用 `behavior/params.ts` 的 `OperativeConstant`：
 *   `core/index.ts` 用的是 `export *`，两个模块导出同名类型会触发
 *   TS2308（"has already exported a member named …"）。这个接口只有 6 个字段，
 *   复制一份的代价远低于改动整条导出链。这是 core 内**第 4 处刻意保留的重复**
 *   （前 3 处：`drift.ts` 的 shuffle RNG、`simulator/src/prng.ts` 的 Rng、
 *   `core/test/helpers.ts` 的确定性抽样器）。
 */
export interface VitalsConstant {
  id: string;
  label: string;
  value: number;
  unit: string;
  why: string;
}

export interface VitalsParam {
  id: string;
  /** 面向用户的中文名——只描述可测量的量，不描述原因或感受 */
  label: string;
  /** `unverified` 强制为 null；`disputed` 强制为二元数组 */
  value: number | [number, number] | null;
  unit?: string;
  evidence: EvidenceTag;
}

// ---------------------------------------------------------------- 来源

const SOURCES = {
  acvim2020:
    'ACVIM 2020 心肌病猫共识（经 docs/research/07 §2.3 汇总核实）：睡眠呼吸频率「均值 >30，或多次测量 >30，likely warrant additional evaluation」',
  dijkstra2018:
    'Dijkstra, Teske & Szatmári 2018, Vet J 234: 96–101（诊室 88 只健康猫 + 家中视频观察 n=32/38）',
  griffin2021: 'Griffin et al. 2021, JFMS 23(4): 364–369（n=21 健康猫，教学医院三个区域实测）',
  merck: "MSD/Merck Veterinary Manual 汇总表（引自 Dukes' Physiology of Domestic Animals, 12th ed.）",
  barton2022:
    'Barton JC, et al. 2022, JAVMA 260(7): 752–757（n=61 猫，耳廓红外 vs 直肠温）',
  sousa2013: 'Sousa MG, et al. 2013, JFMS 15(4): 275–279（认为耳温可替代直肠温）',
  owlet2026:
    '（经 docs/research/07 §2.7 汇总核实）20 只健康猫全身麻醉 20 分钟，307 对同步读数，设备为人用婴儿血氧袜 Owlet Smart Sock',
  ajvr2024:
    'Commercially available wearable health monitor in dogs is unreliable for tracking energy intake and expenditure. Am J Vet Res 2024;85(3). PMID 38109848',
  collarReport:
    'docs/research/01-collar-multimodal（产品页面逐页核对 + 厂商规格页；项目自有的工程约束汇总）',
  petpaceSpec: 'PetPace 官网规格页（厂商页面所载，未经独立核验）',
} as const;

// ---------------------------------------------------------------- 登记表

export const VITALS_PARAMS: readonly VitalsParam[] = [
  // ---------- 呼吸频率：唯一有居家阈值的协议
  {
    id: 'sleepRespRateThreshold',
    label: '睡眠呼吸频率的评估阈值',
    value: 30,
    unit: '次/分',
    evidence: {
      tier: 'moderate',
      source: SOURCES.acvim2020,
      note: '健康猫与轻中度左房扩大的猫睡眠呼吸频率均值一致 <30、中位约 21；严重左房扩大的猫有时超过 30。原文给定的行动规则是「均值 >30，或多次测量 >30」。⚠️ 该阈值**只在睡眠语境成立**；这是本项目检索范围内唯一一条「居家可执行 + 有阈值 + 有同行评审」的预警协议，且它的原始做法是**主人用眼睛数**。',
    },
  },
  {
    id: 'respRateByCondition',
    label: '呼吸频率（按测量条件）',
    value: [16, 60],
    unit: '次/分',
    evidence: {
      tier: 'disputed',
      source: `${SOURCES.merck}；${SOURCES.dijkstra2018}`,
      note: '不是数值冲突而是**测量条件冲突**：教科书静息 16–40；家中静息（视频 n=32）中位 27、区间 16–60；家中午睡（n=38）中位 20、区间 9–28；诊室（n=88）中位 64、区间 28–176。本项目一律**按条件分层**展示，绝不给单一数字，也绝不用诊室读数当基线。',
      range: [16, 60],
    },
  },

  // ---------- 心率
  {
    id: 'restingHeartRate',
    label: '静息心率',
    value: [120, 140],
    unit: '次/分',
    evidence: {
      tier: 'disputed',
      source: `${SOURCES.merck}；${SOURCES.griffin2021}`,
      note: '语境冲突：MSD 静息表 120–140；MSD 分诊表给 150–220；教学医院实测门诊入口 176±35、检查室 195、处置区 226。「140–220」这一常见版本未取得可读一手来源，因此不使用。',
      range: [120, 140],
    },
  },
  {
    id: 'clinicStressHeartRate',
    label: '诊室环境下的实测心率（门诊入口）',
    value: 176,
    unit: '次/分',
    evidence: {
      tier: 'moderate',
      source: SOURCES.griffin2021,
      note: 'n=21 健康猫：门诊入口 176±35，检查室 195，处置区 226 bpm。这是「诊室读数不能当基线」的直接依据——同一条链路上，读数的变化方向由**情境**决定，不由病情决定。',
    },
  },

  // ---------- 体温
  {
    id: 'auricularVsRectalTempBias',
    label: '耳廓红外温与直肠温的平均偏差',
    value: [-4.1, -1.3],
    unit: '°C',
    evidence: {
      tier: 'disputed',
      source: `${SOURCES.barton2022}；${SOURCES.sousa2013}`,
      note: '来源冲突：Barton 2022 测得 n=61 猫耳廓红外中位 35.7 °C vs 直肠 38.3 °C，Kendall τ ≈ −0.01，平均偏差 −2.7 ± 1.44 °C，原文结论「cannot be recommended」；Sousa 2013 则认为耳温可替代直肠温。本项目据此**只报体表温相对自身基线的变化**，不得换算为核心温。',
      range: [-4.1, -1.3],
    },
  },

  // ---------- 项圈三通道的验证状态（全部 unverified）
  {
    id: 'collarHeartRateValidation',
    label: '猫用项圈心率的验证状态',
    value: null,
    evidence: {
      tier: 'unverified',
      source: SOURCES.owlet2026,
      note: '未检索到任何「清醒、客户自有的居家猫」上把项圈/穿戴心率对金标准（Holter / ECG）做验证的前瞻研究。目前唯一的猫心肺可穿戴验证是 20 只**麻醉**猫、20 分钟，且用的是**人用婴儿血氧袜**（心率 r=0.995、血氧 r=0.634）——麻醉、短时、非猫用产品，三者都不可外推到居家清醒猫。',
    },
  },
  {
    id: 'collarRespRateValidation',
    label: '猫用项圈呼吸频率的验证状态',
    value: null,
    evidence: {
      tier: 'unverified',
      source: '（未检索到任何验证研究）',
      note: '这是本项目最重要的一处宣称落差：**没有任何一篇研究验证过猫用项圈的呼吸频率**，而呼吸频率恰恰是唯一被共识写进居家监测建议的指标。项圈产品页面把它列为监测项，那是「宣称」，不是验证。',
    },
  },
  {
    id: 'collarSurfaceTempValidation',
    label: '猫用项圈体温读数的验证状态',
    value: null,
    evidence: {
      tier: 'unverified',
      source: '（未检索到任何验证研究）',
      note: '项圈只能测颈部**体表温**。体表温与核心温无相关（见 auricularVsRectalTempBias），因此它既不能换算为核心温，也不能用于任何急症级提示。可展示的只有「相对自身基线的变化」。',
    },
  },

  // ---------- 形态与工程约束
  {
    id: 'collarWeightBudgetShare',
    label: '项圈重量上限（占体重比例）',
    value: 0.02,
    unit: '体重比例',
    evidence: {
      tier: 'weak',
      source: SOURCES.collarReport,
      note: '**工程经验值**，不是同行评审结论。项目用它推导重量预算（4.2 kg 猫 → 84 g），UI 必须标为弱证据。',
    },
  },
  {
    id: 'collarFormWeight',
    label: '在售同类产品的重量',
    value: [60, 100],
    unit: '克',
    evidence: {
      tier: 'weak',
      source: `${SOURCES.petpaceSpec}；${SOURCES.collarReport}`,
      note: '多参数传感项圈 60 / 90 / 100 g（厂商规格页）；摄像头型项圈约 100 g（供应链侧物料）。两者合一会显著超过体重 2% 的预算——这正是「摄像头与健康传感从未合一」的工程原因。',
      range: [60, 100],
    },
  },

  // ---------- 已被证伪的方向（登记下来，免得日后重做）
  {
    id: 'energyExpenditureEstimate',
    label: '用消费级穿戴估算能量摄入与消耗',
    value: null,
    evidence: {
      tier: 'unverified',
      source: SOURCES.ajvr2024,
      note: 'AJVR 2024 的标题即为结论：市售可穿戴健康监测设备在追踪犬的能量摄入与消耗方面**不可靠**。因此本项目不输出热量或能量消耗估算。',
    },
  },
];

// ---------------------------------------------------------------- 操作化常量

/**
 * 读数仿真的**操作化常量**：文献没有给出"运动到多大程度读数就该作废"这类工程阈值，
 * 本项目为了能跑起来自行选定，每项必须写明为什么这么选，UI 与文档都标为工程常量。
 */
export const VITALS_CONSTANTS: readonly VitalsConstant[] = [
  {
    id: 'aggregationWindowS',
    label: '读数聚合窗口',
    value: 60,
    unit: '秒',
    why: '三个通道都用 60 秒聚合：比采样间隔（10 秒）长一个量级，才能让"运动伪迹整段作废"这件事可表达；又远短于任何生理漂移的时间尺度，不会把漂移平均掉。',
  },
  {
    id: 'hrMotionGate',
    label: '心率读数的体动门限',
    value: 0.6,
    unit: '体动指数',
    why: 'ECG 电极在体动下接触会瞬时改变，产生与心率无关的大幅基线漂移。0.6 对应"快走及以上"的体动强度；超过它的窗口读数标为运动伪迹。取值是工程判断，不是文献数字。',
  },
  {
    id: 'rrMotionGate',
    label: '呼吸读数可采信的体动门限',
    value: 0.25,
    unit: '体动指数',
    why: '呼吸在颈部只有微弱的胸廓传导，体动是同一量级的干扰源。0.25 对应"静息或睡眠"。这条门限的直接后果是：**项圈呼吸频率基本只在睡眠/静息窗口可用**——这既是仿真里的现实，也正是本项目最想展示的诚实边界。',
  },
  {
    id: 'tempContactGate',
    label: '体表温读数的最低接触质量',
    value: 0.5,
    unit: '接触质量',
    why: '热敏电阻离开皮肤后测的就是被毛与空气，读数会向环境温漂移。0.5 是"探头仍贴皮"的下限，低于它标为接触不良。',
  },
  {
    id: 'sleepStintMinS',
    label: '判定为「睡眠」所需的最短连续静息时长',
    value: 300,
    unit: '秒',
    why: '睡眠呼吸频率协议的前提是猫真的睡着了。取 5 分钟：短于此的静息更像"趴着发呆"，用它算出来的频率不是共识意义上的睡眠呼吸频率。',
  },
  {
    id: 'postEventWindowS',
    label: '突发动作之后按「事后」计时的时长',
    value: 600,
    unit: '秒',
    why: '一次突发动作结束后的若干分钟内，生理读数仍可能受其影响（应激消退不是瞬时的）。取 10 分钟作为工程分界：短于此仍算「突发之后」，不参与静息/睡眠基线。文献没有给这个分界值。',
  },
  {
    id: 'clinicHrContextFactor',
    label: '诊室情境下的心率读数倍数',
    value: 1.35,
    unit: '倍',
    why: '依据教学医院实测（门诊入口 176 / 检查室 195 / 处置区 226 vs 静息 120–140）反推的中间值。作用是让"同一只猫、真值不变、读数大幅上移"这件事在仿真里可复现，不是对任何真实设备的精度宣称。',
  },
  {
    id: 'clinicRrContextFactor',
    label: '诊室情境下的呼吸读数倍数',
    value: 2.4,
    unit: '倍',
    why: '依据诊室中位 64 vs 家中静息中位 27（比值约 2.37）。同样只用于复现情境偏移。',
  },
  {
    id: 'tempSurfaceOwnDriftSdC',
    label: '体表温自身的慢漂标准差',
    value: 0.15,
    unit: '°C',
    why: '体表温的日常波动主要来自环境与被毛，而不是核心温。取 0.15 而不是 Barton 的 ±1.44：后者是**耳廓红外与直肠之间、跨个体**的偏差，不是"同一只猫、同一个探头、三十分钟内"的波动；用跨个体的偏差当短期噪声，会让体表温通道永远在报警。取值只影响"体表温这一路稳不稳"，不影响它与核心温无相关这条结构。',
  },
  {
    id: 'tempSurfaceAmbientCoupling',
    label: '体表温与环境温的耦合系数',
    value: 0.12,
    unit: '系数',
    why: '热敏电阻压在毛下贴皮，**被毛是隔热层**：环境温度的变化只有一小部分传到探头上。取 0.12 而不是更大值，是因为取大之后体表温读数会被房间的昼夜温差主导（读数标准差 0.67 °C 里有 0.55 来自环境项），任何亚度级阈值都会变成噪声探测。这是工程取值，不是文献数字；它只影响"体表温这一路稳不稳"。',
  },
  {
    id: 'hrTruthDailyAmplitude',
    label: '心率真值的日节律幅度',
    value: 0.06,
    unit: '比例',
    why: '真值也不该是一条直线，否则"读数在动、真值不动"的对照会失真。取 ±6% 是量级合理的操作化取值，不代表任何实测日节律。',
  },
  {
    id: 'manyOverThresholdCount',
    label: '共识原文「多次测量 >30」中「多次」的取值',
    value: 3,
    unit: '次',
    why: 'ACVIM 原文没有定义"多次"的具体次数。本项目取 3 次并在 UI 写明这是操作化取值，避免把一个文献没给的数字伪装成文献给的。',
  },

  // ---------- App 端「读数变化」提示（第三阶段补）
  {
    id: 'alertReferenceWindowS',
    label: '读数变化的参考窗口',
    value: 1800,
    unit: '秒',
    why: '比较"现在的读数"与"这只猫最近一段时间的读数"。取 30 分钟：短于它则参考值本身跟着波动（体表温自身慢漂就能满足小阈值），长于它则会把几小时前的情境带进来。工程取值，不是文献数字。',
  },
  {
    id: 'alertMinReferenceWindows',
    label: '参考值所需的最少可用窗口数',
    value: 5,
    unit: '个',
    why: '少于 5 个可用读数时不给任何提示——不能拿两三个点当基线。这是「数据不足就不猜」这条纪律在提示层的落点。',
  },
  {
    id: 'alertHrDeviation',
    label: '心率偏离的提示阈值',
    value: 0.15,
    unit: '比例',
    why: '与**行为对照后的期望值**相比（走动、玩耍这类正常活动的心率升高已经在期望值里扣掉）。15% 是演示用的工程阈值：既能让发作后的恢复段被提示，又不会被每天的作息波动误触发。不是临床阈值。',
  },
  {
    id: 'alertRrDeviation',
    label: '呼吸频率偏离的提示阈值',
    value: 0.2,
    unit: '比例',
    why: '同上，取 20%：呼吸在同一行为下的变异比心率大。⚠️ 呼吸读数只在低体动窗口可用，因此这条阈值实际只在静息/恢复窗口起作用。',
  },
  {
    id: 'alertTempDeviationC',
    label: '体表温偏离的提示阈值',
    value: 0.5,
    unit: '°C',
    why: '体表温用它自己的尺度（不比比例）。取 0.5 °C 是**用仿真数据量出来的**：在"安静 + 低体动"的同条件参考下，这只猫体表温偏离的 p99 约 0.5 °C，因此阈值定在这里可以把误报压到远低于 1%，同时让抽搐进入后段（体表温是慢通道）越过阈值——这条"先不发、后段才越线"的时序本身就是热惯性的体现。',
  },
  {
    id: 'alertNoiseLimitDbA',
    label: '做读数比较所允许的环境噪声上限',
    value: 50,
    unit: 'dB(A)',
    why: '噪声本身就是一次应激源，会话里的噪声突发会把心率抬高十几个百分点。拿噪声中的读数与安静时的参考值比，得到的是"外面在装修"，不是身体变化。取 50 dB(A) 作为"环境安静"的工程分界（会话静息基线约 38 dB(A)），项圈自带麦克风，真机上同样可判。',
  },
  {
    id: 'alertWatchRatio',
    label: '「留意」级 = 提示阈值的几成',
    value: 0.6,
    unit: '比例',
    why: '把提示分成两级：达到阈值 60% 记为「留意」（只改配色、不打扰），达到 100% 才弹提醒。避免阈值附近反复弹窗。',
  },
  {
    id: 'surfaceEpisodeEffectC',
    label: '发作期的体表温上升幅度上限（抽搐）',
    value: 0.8,
    unit: '°C',
    why: '抽搐是持续的全身肌肉用力，整个身体都在产热：核心温量级约 0.9 °C（见生理层的 `TEMP_RISE_C`），贴皮读数被被毛衰减后取 0.8 °C。⚠️ 它是一个**固定幅度**，不是由核心温实时推算的函数——一旦写成函数，"体表温与核心温无相关"这条结论就在仿真里作废了，之后任何"换算算法"都会显得很准。未取得猫的一手来源，标为操作化常量。',
  },
  {
    id: 'surfaceEpisodeEffectVomitC',
    label: '发作期的体表温上升幅度上限（呕吐）',
    value: 0.15,
    unit: '°C',
    why: '呕吐的用力时间与产热量级都远小于抽搐，因此体表温几乎不动。取值同样是操作化常量。',
  },
  {
    id: 'surfaceEpisodeTauS',
    label: '体表温发作期响应的时间常数',
    value: 20,
    unit: '秒（演示时相）',
    why: '热惯性：贴皮温度不会瞬间跟上，取 20 秒演示时相达到约 63%。只影响"看得见的快慢"，不影响最终幅度。',
  },
];

// ---------------------------------------------------------------- 查询接口

const PARAM_INDEX: ReadonlyMap<string, VitalsParam> = new Map(VITALS_PARAMS.map((p) => [p.id, p]));

export function vitalsParam(id: string): VitalsParam | undefined {
  return PARAM_INDEX.get(id);
}

export function vitalsParamsByTier(tier: Tier): readonly VitalsParam[] {
  return VITALS_PARAMS.filter((p) => p.evidence.tier === tier);
}

/** 取数值。`unverified` 恒返回 null（其 value 本身就必须是 null）。 */
export function vitalsParamValue(id: string): number | [number, number] | null {
  return vitalsParam(id)?.value ?? null;
}

/** 取 `disputed` 的区间。判据用 value 的结构，不依赖可选的 `evidence.range`。 */
export function vitalsParamRange(id: string): [number, number] | null {
  const p = vitalsParam(id);
  if (!p || !Array.isArray(p.value)) return null;
  return p.value;
}

/** 数值型参数（单一数字）取值；非单一数字返回 null。 */
export function vitalsParamNumber(id: string): number | null {
  const v = vitalsParam(id)?.value;
  return typeof v === 'number' ? v : null;
}

/**
 * 面向用户的数值文本。
 *
 * 这是「`unverified` 不得展示具体数值」这条纪律在生理层的**执行点**：
 * 任何界面要显示生理参数值都应该走这里，而不是直接读 `value`。
 */
export function vitalsParamText(id: string): string {
  const p = vitalsParam(id);
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
  return v.toFixed(Math.abs(v) < 1 ? 2 : 1);
}

/** 是否需要在界面上打出「来源冲突」提示。 */
export function isVitalsDisputed(p: VitalsParam): boolean {
  return p.evidence.tier === 'disputed';
}

/** 取操作化常量（不存在返回 undefined）。 */
export function vitalsConstant(id: string): VitalsConstant | undefined {
  return VITALS_CONSTANTS.find((c) => c.id === id);
}

/** 取操作化常量的数值，缺省值由调用方给（避免 undefined 渗进算法）。 */
export function vitalsConstantValue(id: string, fallback: number): number {
  return vitalsConstant(id)?.value ?? fallback;
}
