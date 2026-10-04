/**
 * 生理状态机：**状态 → 心率 / 呼吸 / 体动** 的注入规则。
 *
 * 这一层回答的是那个具体问题：**「猫在抽搐时心率、呼吸怎么变；呕吐时又怎么变」**。
 *
 * ⚠️ 三条必读边界（代码与文档必须一起读）：
 *   1. 这些取值是**仿真注入规则**，不是对真实猫的测量。仿真器用它造出「知道答案的数据」，
 *      供下游识别算法做回归断言——它的用途是验证算法管线，不是描述真实动物。
 *   2. **没有一项是特异指标。** 同一组读数变化在文献里与多种状况同时出现；
 *      关联不等于因果，更不等于诊断。本项目不提供任何面向用户的判定。
 *   3. 状态名（`seizure` / `vomiting`）沿用 `CatIncidentKind` 的**动作名习惯**，
 *      指「正在发生的一组可观察动作」，不是疾病名，也不代表任何诊断。
 *
 * 时相结构的依据：文献记录「呕吐是主动用力过程，前面有反复吞咽与干呕、腹部与膈肌
 * 强力收缩」，而抽搐是「一阵发作 + 之后一段时间的意识模糊与步态不稳」。
 * 因此两个突发都不是方波，而是**带前驱与恢复段的多相过程**——这一点直接决定了
 * 「按一次瞬时阈值报警」会误报，也是把恢复段写进模型的原因。
 */
import type { EvidenceTag } from '../types.ts';

// ---------------------------------------------------------------- 突发种类

/**
 * 会改变生理读数的突发动作。
 *
 * 刻意**不等于** `CatIncidentKind`：`freezing`（僵直不动）与 `withdrawal`（躲藏退避）
 * 在本模型里按各自的姿势与呼吸参数处理，不建立单独的生理时相结构。
 * 两者的生理变化都很弱（静息心率偏低、呼吸慢而浅），不足以支撑一条时相曲线，
 * 硬造一条只会伪造精度。
 */
export type PhysiologyEpisodeKind = 'seizure' | 'vomiting';

export const PHYSIOLOGY_EPISODE_KINDS: readonly PhysiologyEpisodeKind[] = ['seizure', 'vomiting'];

// ---------------------------------------------------------------- 状态

/**
 * 生理状态。`idle` 是**唯一的常驻状态**，其余全部只能经由突发时相进入。
 *
 * 心率/呼吸的绝对值由**个体基线**给出（见 `PhysiologyBaseline`），
 * 状态只给相对基线的倍率与张力——这是本项目「只做相对自身基线的变化」这条纪律的执行点。
 */
export type PhysiologyStateId =
  /** 常驻：随当前行为（休息 / 走动 / 玩耍…）小幅波动 */
  | 'idle'
  /** 抽搐前驱：短暂警觉、心率开始上行 */
  | 'pre-ictal'
  /** 抽搐发作期：全身高频抖动，呼吸节律被打断 */
  | 'ictal'
  /** 抽搐后恢复期：逐步回落到基线，是最容易被误报的一段 */
  | 'post-ictal'
  /** 呕吐的干呕/恶心期：腹部与膈肌反复用力，呼吸节律被打断 */
  | 'retching'
  /** 呕吐的排出期：一次用力的躯干挤压 */
  | 'expulsion'
  /** 呕吐后的恢复期：心率与呼吸回落 */
  | 'post-emetic';

export const PHYSIOLOGY_STATE_IDS: readonly PhysiologyStateId[] = [
  'idle',
  'pre-ictal',
  'ictal',
  'post-ictal',
  'retching',
  'expulsion',
  'post-emetic',
];

/**
 * 一个生理状态相对**个体静息基线**的取值。
 *
 * 倍率相乘、偏移相加：`取值 = 基线 × 倍率 + 偏移`。
 * 偏移只在「呼吸幅度」上使用（基线可能很小，纯倍率会放大到不可信），其余通道一律用倍率。
 */
export interface PhysiologyStateOps {
  /** 心率倍率。1 表示与静息基线相同 */
  hrScale: number;
  /** 心率绝对值偏移（次/分）。用于前驱这类「只抬一点点」的情形 */
  hrOffset: number;
  /** HRV（RMSSD）倍率。自主神经张力上升时通常下降 */
  hrvScale: number;
  /** 呼吸频率倍率 */
  rrScale: number;
  /** 呼吸幅度倍率 */
  breathDepthScale: number;
  /**
   * 呼吸节律紊乱度 0–1：呼吸间隔本身的离散程度。
   *
   * 为什么它与呼吸频率**分开**建模：抽搐时呼吸不只是变快，而是**节律被打断**
   * （不规则、可短暂停顿）；干呕时呼吸是**被主动用力打断**。
   * 只看频率会把两者与「跑动后喘气」混为一谈。
   */
  respIrregularity: number;
  /**
   * 体动伪影 0–1：颈部在该时刻的机械运动强度。
   *
   * 它不是「数据质量标志」，而是**给下游的输入**：伪影越大，同一条心率/呼吸读数
   * 越不可信。下游据此决定「这一秒的读数要不要采信」。
   *
   * ⚠️ 它同时也是「读数是否还可采信」的**唯一判据**（见
   * `MOTION_ARTIFACT_UNUSABLE`）：不再单独维护一个布尔字段，
   * 否则「伪影 0.2 但标着不可采信」这种自相矛盾的状态迟早会出现。
   */
  motionArtifact: number;
}

/**
 * 判定「这一段在物理上已经拿不到可信读数」的伪影门限（0–1）。
 *
 * 取 0.8：强于「走动」（约 0.35）与「玩耍」（约 0.55），
 * 因此干呕（峰值约 0.7）仍然可读，而抽搐发作期（0.95–1.0）判为不可采信。
 * **操作化常量**，真机需按实际伪影水平重新标定。
 */
export const MOTION_ARTIFACT_UNUSABLE = 0.8;

// ---------------------------------------------------------------- 时相

/**
 * 时相内的取值斜坡。
 *
 * 全部为可选：某个通道在某时相里没有定义时，就**沿用上一个定义了它的时相**。
 * 这样「前驱只抬心率、不动呼吸」这类描述不用把每条通道都填满。
 */
export interface PhysiologyPhaseRamp {
  /** 本时相时长（**真实秒**：0.0005 = 瞬间切换） */
  durationS: number;
  hrScale?: number;
  hrOffset?: number;
  hrvScale?: number;
  rrScale?: number;
  breathDepthScale?: number;
  respIrregularity?: number;
  motionArtifact?: number;
  /**
   * 产热权重 0–1：该时相里肌肉活动有多强。
   *
   * 为什么需要它：核心温的偏离是**慢通道**（分钟到小时量级），而抽搐的症状期
   * 只占整个真实过程的一小段。若按整段时长算产热，会得到远大于真实的升温。
   * 因此体温按「Σ(时相真实时长 × 产热权重)」推进，恢复期反而是产热主力。
   */
  heating?: number;
}

export interface PhysiologyPhaseDef {
  id: PhysiologyStateId;
  label: string;
  /** 一句话说明「这一段看什么」——只描述外部可观察量 */
  hint: string;
  ops: PhysiologyPhaseRamp;
}

export interface PhysiologyEpisodeDef {
  kind: PhysiologyEpisodeKind;
  label: string;
  hint: string;
  /**
   * 生理演示时相的总长（秒）——等于 `phases` 各段之和。
   *
   * ⚠️ **它刻意可以不等于 `INCIDENT_DEFS.demoDurationS`**，两者是两件事：
   *   - `INCIDENT_DEFS.demoDurationS` 是**动作演示**给眼睛看多久（抽搐 15 秒）；
   *   - 这里是**生理曲线**需要的窗口，必须额外容纳「发作之后仍偏高」的恢复段
   *     （抽搐 15 秒 + 15 秒恢复）。
   * 把恢复段砍掉，等于把唯一可被采信的偏离砍掉——识别算法就只剩下一段无读数的黑箱。
   * 因此渲染层按动作时长演、分析层按生理窗口算，两者各自正确。
   */
  demoDurationS: number;
  /** 真实世界里这个过程通常持续多久（秒）。仅用于文档与取值说明，**不用于演示推进** */
  realDurationS: number;
  /** 演示时长下的时相序列 */
  phases: readonly PhysiologyPhaseDef[];
  /** 真实时长下的时相序列（同一套生理规则，只是时间轴不同） */
  realPhases: readonly PhysiologyPhaseDef[];
  evidence: EvidenceTag;
}

// ---------------------------------------------------------------- 取值辅助

const INSTANT_S = 0.0005;

/** 演示时长下标。真实时长下同一时相会被拉长到分钟量级。 */
function phasesOf(def: PhysiologyEpisodeDef, realTime: boolean): readonly PhysiologyPhaseDef[] {
  return realTime ? def.realPhases : def.phases;
}

// ---------------------------------------------------------------- 突发定义

export const PHYSIOLOGY_EPISODES: Readonly<Record<PhysiologyEpisodeKind, PhysiologyEpisodeDef>> = {
  seizure: {
    kind: 'seizure',
    label: '抽搐',
    hint: '一阵发作 + 之后一段时间的意识模糊：心率急升、呼吸节律被打断，发作当下读数不可采信',
    demoDurationS: 30,
    realDurationS: 720,
    phases: [
      {
        id: 'pre-ictal',
        label: '发作前驱',
        hint: '短暂警觉，心率开始上行',
        ops: { durationS: 2, hrScale: 1.12, hrOffset: 6, rrScale: 1.15, respIrregularity: 0.12, motionArtifact: 0.05, heating: 0.1 },
      },
      {
        id: 'ictal',
        label: '发作期',
        hint: '全身高频抖动，呼吸节律被打断，读数不可采信',
        ops: {
          durationS: 1,
          hrScale: 1.55,
          hrOffset: 0,
          hrvScale: 0.45,
          rrScale: 1.85,
          breathDepthScale: 1.3,
          respIrregularity: 0.75,
          motionArtifact: 0.95,
          heating: 1,
        },
      },
      {
        id: 'ictal',
        label: '发作期',
        hint: '持续抖动，呼吸不规则',
        ops: {
          durationS: 14,
          hrScale: 1.8,
          hrvScale: 0.35,
          rrScale: 2.1,
          breathDepthScale: 1.35,
          respIrregularity: 0.85,
          motionArtifact: 1,
          heating: 1,
        },
      },
      {
        id: 'post-ictal',
        label: '发作后恢复期',
        hint: '逐步回落到基线；这一段读数恢复可采信，但心率仍高于基线',
        ops: {
          // 演示里留 13 秒的尾巴（前三个时相占了 17 秒），因此它只是「开始回落」的一小段；
          // 完整的恢复过程在真实时长里（数分钟到数十分钟）。
          durationS: 13,
          hrScale: 1.2,
          hrOffset: 0,
          hrvScale: 0.7,
          rrScale: 1.25,
          breathDepthScale: 1.1,
          respIrregularity: 0.3,
          motionArtifact: 0.1,
          heating: 0.8,
        },
      },
    ],
    realPhases: [
      {
        id: 'pre-ictal',
        label: '发作前驱（真实时长）',
        hint: '数秒到数十秒的警觉与心率上行',
        ops: { durationS: 20, hrScale: 1.12, hrOffset: 6, rrScale: 1.15, respIrregularity: 0.12, motionArtifact: 0.05, heating: 0.1 },
      },
      {
        id: 'ictal',
        label: '发作期（真实时长）',
        hint: '通常数十秒到两分钟',
        ops: {
          durationS: 60,
          hrScale: 1.8,
          hrvScale: 0.35,
          rrScale: 2.1,
          breathDepthScale: 1.35,
          respIrregularity: 0.85,
          motionArtifact: 1,
          heating: 1,
        },
      },
      {
        id: 'post-ictal',
        label: '发作后恢复期（真实时长）',
        hint: '数分钟到数十分钟的意识模糊与步态不稳',
        ops: {
          durationS: 640,
          hrScale: 1.15,
          hrvScale: 0.75,
          rrScale: 1.2,
          breathDepthScale: 1.05,
          respIrregularity: 0.3,
          motionArtifact: 0.15,
          heating: 0.8,
        },
      },
    ],
    evidence: {
      tier: 'moderate',
      source:
        'MSD Veterinary Manual, Seizure Disorders in Cats（https://www.msdvetmanual.com/cat-owners/brain-spinal-cord-and-nerve-disorders-of-cats/seizure-disorders-in-cats）；MSD, Anticonvulsants for Emergency Treatment of Seizures（发作后 recovery 期与「再次发作」风险）',
      note: '证据只覆盖**方向与结构**：发作期的全身肌肉活动、呼吸节律的改变、以及「发作之后有一段时间不正常」。**方向性由文献支持；幅度是本模型设定的仿真值**，因为检索范围内没有取得「猫抽搐时心率升高的幅度」的一手数字。',
    },
  },
  vomiting: {
    kind: 'vomiting',
    label: '呕吐',
    hint: '主动用力过程：先反复干呕（腹部与膈肌强力收缩），再排出，随后心率与呼吸回落',
    demoDurationS: 30,
    realDurationS: 60,
    // 演示时长是 30 s（与动作演示一致），真实时长取 60 s：干呕本身常持续数十秒，
    // 而「排出以后多久回落」没有取得可靠数字，因此只声明量级，不声称精确。
    phases: [
      {
        id: 'retching',
        label: '干呕期',
        hint: '反复吞咽与腹部用力，呼吸被一次次用力打断',
        ops: { durationS: 18, hrScale: 1.18, hrOffset: 4, rrScale: 1.3, respIrregularity: 0.6, motionArtifact: 0.5, heating: 0.8 },
      },
      {
        id: 'expulsion',
        label: '排出期',
        hint: '一次用力的躯干挤压与腹壁收缩',
        ops: {
          durationS: 0.4,
          hrScale: 1.4,
          hrvScale: 0.6,
          rrScale: 0.6,
          breathDepthScale: 1.4,
          respIrregularity: 1,
          motionArtifact: 0.7,
          heating: 1,
        },
      },
      {
        id: 'post-emetic',
        label: '呕吐后恢复期',
        hint: '心率与呼吸回落，动作上常表现为舔唇与吞咽',
        ops: {
          durationS: 11.6,
          hrScale: 1.1,
          hrvScale: 0.8,
          rrScale: 1.05,
          breathDepthScale: 1.05,
          respIrregularity: 0.2,
          motionArtifact: 0.15,
          heating: 0.8,
        },
      },
    ],
    realPhases: [
      {
        id: 'retching',
        label: '干呕期（真实时长）',
        hint: '通常数十秒',
        ops: { durationS: 40, hrScale: 1.18, hrOffset: 4, rrScale: 1.3, respIrregularity: 0.6, motionArtifact: 0.5, heating: 0.8 },
      },
      {
        id: 'expulsion',
        label: '排出期（真实时长）',
        hint: '数次用力的排出，每次很短',
        ops: {
          durationS: 5,
          hrScale: 1.4,
          hrvScale: 0.6,
          rrScale: 0.6,
          breathDepthScale: 1.4,
          respIrregularity: 1,
          motionArtifact: 0.7,
          heating: 1,
        },
      },
      {
        id: 'post-emetic',
        label: '呕吐后恢复期（真实时长）',
        hint: '随后数分钟',
        ops: {
          durationS: 15,
          hrScale: 1.1,
          hrvScale: 0.8,
          rrScale: 1.05,
          breathDepthScale: 1.05,
          respIrregularity: 0.2,
          motionArtifact: 0.15,
          heating: 0.8,
        },
      },
    ],
    evidence: {
      tier: 'moderate',
      source:
        'MSD Veterinary Manual, Vomiting in Cats（https://www.msdvetmanual.com/cat-owners/digestive-disorders-of-cats/vomiting-in-cats）',
      note: '原文把呕吐描述为「normally preceded by excessive salivation, repeated swallowing, retching, and forceful contractions of the abdominal muscles and the diaphragm」——**「先干呕、再用力排出、不是被动反流」这一结构由文献支持**；心率与呼吸的**幅度**是本模型设定的仿真值，未取得一手数字。',
    },
  },
};

/**
 * 项圈可用的采集参数。**全部标 `unverified`**，理由写在 `note` 里。
 *
 * 为什么必须登记在一个地方：采样率、位数、通道清单会同时出现在固件需求、
 * 通知阈值推导、文档三处，各写一份必然漂移。
 */
export interface CollarSamplingSpec {
  id: string;
  label: string;
  value: number | null;
  unit?: string;
  evidence: EvidenceTag;
}

export const COLLAR_SAMPLING: readonly CollarSamplingSpec[] = [
  {
    id: 'imuRateHz',
    label: '颈部加速度计采样率',
    value: null,
    unit: '赫兹',
    evidence: {
      tier: 'unverified',
      source: '（未取得猫用项圈验证研究）',
      note: '本仓库检索范围内没有猫用项圈的采样率与检出性能研究，因此不展示数字。可以确定的只有**下界约束**：抖动约 11 Hz，按奈奎斯特定理采样率必须显著高于 22 Hz 才可能不混淆——但这是信号处理常识，不是对任何产品的性能宣称。',
    },
  },
  {
    id: 'hrSource',
    label: '心率采集方式',
    value: null,
    evidence: {
      tier: 'unverified',
      source: '（未取得猫用项圈 PPG 验证研究）',
      note: '颈部毛发浓密、项圈可滑动、运动伪影大；未取得猫用项圈 PPG 心率/HRV 的验证研究。因此本模型只输出**相对自身基线的偏离**，并且明确标出「发作当下读数不可采信」。',
    },
  },
  {
    id: 'rrSource',
    label: '呼吸频率采集方式',
    value: null,
    evidence: {
      tier: 'unverified',
      source: '（未取得猫用项圈呼吸频率验证研究）',
      note: '现有最强的量化来自**人做视频观察**（睡眠呼吸频率中位约 20、静息约 24–27）。项圈侧的呼吸频率没有任何验证研究，因此这一通道在本项目里只能作为仿真真值，不作为宣称。',
    },
  },
];

// ---------------------------------------------------------------- 核心温的慢响应

/**
 * 各突发在**持续一整个真实时长、且全程满产热**时的核心温偏离（°C）。
 *
 * ⚠️ 为什么需要这个函数、而不是让体温跟着演示时长走：
 *   发热（或应激性体温升高）的时间尺度是**分钟到小时**，而演示把一次抽搐压缩成 30 秒。
 *   如果让体温按演示时长线性变化，会得到「抽搐 30 秒体温升 1 °C」——
 *   一个在真实猫身上不存在的事实。因此体温一律按**真实秒数 × 产热权重**推进。
 */
const TEMP_RISE_C: Readonly<Record<PhysiologyEpisodeKind, number>> = {
  // 抽搐：持续数十分钟的肌肉活动，量级取「可达 1 °C 上下」
  seizure: 0.9,
  // 呕吐：用力与腹压，产热量级小得多
  vomiting: 0.05,
};

/** 达到约 63% 稳态所需的**有效产热**秒数。操作化常量：5 分钟。 */
const TEMP_TAU_S = 300;

/** 累加「时相真实时长 × 产热权重」 = 有效产热秒数。 */
export function effectiveHeatingSeconds(def: PhysiologyEpisodeDef, realTime = true): number {
  const phases = realTime ? def.realPhases : def.phases;
  return phases.reduce((sum, p) => sum + p.ops.durationS * (p.ops.heating ?? 0), 0);
}

/**
 * 核心温偏离（°C）。
 *
 * 形式是**饱和型**：短时突发几乎为 0，持续一整个真实时长时趋近 `TEMP_RISE_C`。
 * 它把「为什么体温不该参与急性识别」这件事编码成了模型性质——
 * 短暂抽搐不会给出可用的体温信号。
 */
export function coreTempDeltaC(
  kind: PhysiologyEpisodeKind,
  realSecondsElapsed: number,
  severity = 1,
): number {
  if (!(realSecondsElapsed > 0)) return 0;
  const peak = (TEMP_RISE_C[kind] ?? 0) * Math.min(1, Math.max(0, severity));
  return Math.round(peak * (1 - Math.exp(-realSecondsElapsed / TEMP_TAU_S)) * 1000) / 1000;
}

/**
 * 会话内的「突发内已过演示秒」换算成**真实秒**。
 *
 * 演示时间线是**压缩**出来的：抽搐的真实时相总长 720 秒被压进 30 秒（24 倍）。
 * 因此演示里走过 `x` 秒，对应真实过程 `24x` 秒——体温这类慢通道只按后者推进，
 * 于是一段 30 秒的演示能表现出十余分钟的产热。
 *
 * ⚠️ 分母必须是 `episodeSpanS(kind, false)`（**登记过**的演示总长），
 * 不能用调用方当前的曲线长度：那样会算出「曲线多长、体温就涨多少」，
 * 把体温重新绑回演示时长，而这正是本函数要切断的关系。
 *
 * @param realDurationS 本次突发实际推进的真实秒数；缺省取该突发的真实时相总长。
 */
export function realSecondsAt(
  kind: PhysiologyEpisodeKind,
  elapsedS: number,
  realTime: boolean,
  severity = 1,
  realDurationS?: number,
): number {
  const factor = Math.min(1, Math.max(0, severity));
  if (realTime) return elapsedS * factor;
  const demoTotal = episodeSpanS(kind, false);
  if (!(demoTotal > 0)) return 0;
  const realTotal = (realDurationS ?? episodeSpanS(kind, true)) * factor;
  return Math.min(1, Math.max(0, elapsedS / demoTotal)) * realTotal;
}

/**
 * 体温的**便捷入口**：把「演示进度 → 真实产热秒数 → 饱和温升」串在一处。
 *
 * 因此「体温是慢通道、且抽搐的产热远大过呕吐」这条性质只在这一个地方成立，
 * 调用方（曲线、仿真器）不必各自复算一遍。
 *
 * 两级折算都在这里：`realSecondsAt` 把演示进度换算成真实**进程**秒数，
 * 各时相的 `heating` 权重则已经体现在 `TEMP_RISE_C` 的取值里
 * （抽搐 0.9 °C vs 呕吐 0.05 °C）——两者相乘才是最终偏离。
 */
export function coreTempDeltaAt(
  kind: PhysiologyEpisodeKind,
  elapsedS: number,
  realTime: boolean,
  severity = 1,
): number {
  const real = realSecondsAt(kind, elapsedS, realTime, severity);
  return coreTempDeltaC(kind, real, severity);
}

// ---------------------------------------------------------------- 时相求值

export interface PhaseAt {
  phase: PhysiologyPhaseDef;
  /** 时相内进度 0–1 */
  u: number;
  /** 本次突发内已过的演示秒数 */
  elapsedS: number;
  /** 0 = 第一个时相，1 = 最后一个时相 */
  index: number;
  total: number;
}

/**
 * 求某一时刻落在哪个时相。
 *
 * ⚠️ 最后一段**不做钳制**：故意让调用方拿到 `u > 1` 的能力已经不需要了——
 * 恢复期的回落由 `predictPhysiologyAt` 线性衰减到突发结束时的目标值来保证，
 * 因此这里在最后一个时相之后仍返回最后一个时相，`u` 上限为 1。
 */
export function phaseAt(
  def: PhysiologyEpisodeDef,
  elapsedS: number,
  realTime = false,
): PhaseAt {
  const phases = phasesOf(def, realTime);
  const total = phases.length;
  if (total === 0) {
    throw new Error(`突发 ${def.kind} 未登记任何时相`);
  }
  let acc = 0;
  for (let i = 0; i < total; i++) {
    const phase = phases[i] as PhysiologyPhaseDef;
    const dur = Math.max(INSTANT_S, phase.ops.durationS);
    if (elapsedS < acc + dur || i === total - 1) {
      const u = Math.min(1, Math.max(0, (elapsedS - acc) / dur));
      return { phase, u, elapsedS, index: i, total };
    }
    acc += dur;
  }
  // 不可达：上面的循环必然在最后一个时相返回
  const last = phases[total - 1] as PhysiologyPhaseDef;
  return { phase: last, u: 1, elapsedS, index: total - 1, total };
}

/** 全部时相的总时长（演示或真实时长）。 */
export function episodeSpanS(kind: PhysiologyEpisodeKind, realTime = false): number {
  const phases = phasesOf(PHYSIOLOGY_EPISODES[kind], realTime);
  return phases.reduce((sum, p) => sum + Math.max(INSTANT_S, p.ops.durationS), 0);
}

/** 某个状态属于哪些突发——供 UI 把状态名映射回动作名，避免文案漂移。 */
export function episodesOfState(state: PhysiologyStateId): readonly PhysiologyEpisodeKind[] {
  const out: PhysiologyEpisodeKind[] = [];
  for (const kind of PHYSIOLOGY_EPISODE_KINDS) {
    const def = PHYSIOLOGY_EPISODES[kind];
    if (def.phases.some((p) => p.id === state)) out.push(kind);
  }
  return out;
}
