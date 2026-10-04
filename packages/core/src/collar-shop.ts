/**
 * 项圈商城：**项圈带（带体 / 表带）**的目录，以及「这条带装在这只宠物身上合不合身」的判定规则。
 *
 * ## 这个模块回答的问题
 *
 * 商城只有一条业务规则，而它恰好是本项目最诚实的一条工程规则：
 *
 * > 一条项圈的**总重**（带体 + 表盘）不能超过这只宠物体重的 **2%**。
 *
 * 于是「选一条带子」不是审美问题，而是一道**重量预算**的算术题：材质决定面密度、
 * 大小决定宽度与下料长度、轻重决定厚度倍率，三者相乘得到带体克重，再加上表盘（电子仓）的克重，
 * 与 `collarBudgetOf()` 给出的预算比较——**小体型更容易超预算**，这正是这个功能存在的意义。
 *
 * ## 为什么这些数字住在 `core`，而不是写在界面里
 *
 * 1. **它是判据，不是装饰**。「合不合身」必须有一个唯一的事实来源：界面、将来的 CLI、
 *    以及任何导出报表都要得出同一个结论。放在界面里就迟早会出现两套阈值。
 * 2. **它必须可按证据等级审查**。每个数字都带 `EvidenceTag`，证据等级为「未核实」的选项
 *    **连数值都没有**（类型上是 `null`），于是「未核实不得展示数值」这条政策不是靠自觉，
 *    而是**没法绕过**：`strapWeightG()` 对这类选项直接返回 `null`。
 * 3. **它要能单测**。维度表的完整性、克重的单调性、小体型与大丹的不同结论，
 *    都是纯函数的性质，可以在 `packages/core/test/collar-shop.test.ts` 里钉住。
 *
 * ## ⚠️ 诚实边界（与代码一起读，别只读代码）
 *
 * - 本项目**不造真硬件**。下面所有克重都是**工程方案里的量级**（材料密度 × 常见厚度、
 *   或在售产品的规格页量级反推），**不是实测值**，也没有做过称重或佩戴测试。
 * - 这些数只用来演示「重量预算怎么算」这件事，**不构成任何产品性能或佩戴舒适度的结论**。
 * - 目录里的三项维度是**带体**的选项；表盘（电子仓）重量是一个按在售产品量级建模的常数，
 *   见 `COLLAR_POD_WEIGHT_G`。
 * - 「合不合身」只回答**重量与几何**，不回答任何一个个体戴上去会不会舒服、会不会摩擦。
 *   那是真机与福利审查的问题（见 `docs/hardware/01-collar-spec.md` §2）。
 */
import { collarBudgetOf, sizeClassOf } from './profile.ts';
import type { EvidenceTag, PetProfile, SizeClass } from './types.ts';

/**
 * 表盘（电子仓）重量，克。
 *
 * ⚠️ 建模依据（`weak`）：`docs/hardware/01-collar-spec.md` §2 汇总的在售多参数传感项圈
 * 整圈重量是 **60 / 90 / 100 g**（厂商规格页，未经同行评审）。取其中**最小的一档 60 g**，
 * 减去带体与调整尾段约 10–15 g，得到表盘约 48 g；另一条独立的量级核对是
 * 「3.8 V 500 mAh 电芯约 10 g + 电路板 / 外壳 / 卡扣 / 传感器」。
 *
 * 为什么把它写成一个**常数**而不是按尺寸档给：电池与电路板的重量与带体宽窄基本无关，
 * 按尺寸缩放会造出一个不存在的精度。它的作用是让「小体型超预算」这件事在算术上真的发生。
 */
export const COLLAR_POD_WEIGHT_G = 48;

/** 表盘重量的证据标签。与 `COLLAR_POD_WEIGHT_G` 一起使用，界面必须原样展示等级。 */
export const COLLAR_POD_WEIGHT_EVIDENCE: EvidenceTag = {
  tier: 'weak',
  source:
    'docs/hardware/01-collar-spec.md §2 汇总的在售多参数传感项圈整圈 60 / 90 / 100 g（厂商规格页），取其最小档减去带体量级后的反推',
  note: '工程方案里的量级，不是实测值；电芯按 3.8 V 500 mAh 约 10 g 量级核对。',
};

// ---------------------------------------------------------------- 维度一：材质

/** 材质 id。刻意用字面量联合：查表时不需要 `undefined` 兜底，也不会写错字符串。 */
export type StrapMaterialId =
  | 'nylon-webbing'
  | 'organic-cotton'
  | 'silicone'
  | 'full-grain-leather'
  | 'reflective-webbing'
  | 'bio-based-webbing';

/** 材质档：这一档带体每平方米多重（面密度），以及这个数是怎么来的。 */
export interface StrapMaterialOption {
  id: StrapMaterialId;
  label: string;
  /**
   * 面密度（g/m²）= 材料密度 × 带体厚度。
   *
   * `null` 表示**证据等级为「未核实」**，按本项目的证据政策**不给数值**——
   * 这不是懒，是纪律：没有可靠来源就不填推测值（见 `claims.ts` 与 `AGENTS.md` §4.1）。
   * 于是 `strapWeightG()` 对它返回 `null`，界面只能显示「未核实，暂不给克重」。
   */
  arealDensityGm2: number | null;
  evidence: EvidenceTag;
}

/**
 * 材质档。
 *
 * 全部标 `weak` 是**如实**：面密度靠「材料密度 × 常见厚度」估算，或在售产品规格页汇总，
 * 本项目**没有取得同行评审的一手来源**（项圈形态领域本来就没有这类公开测量）。
 * 标成 `moderate` 会让界面上的徽章说谎，那比数字不准更糟。
 */
export const STRAP_MATERIAL_OPTIONS: readonly StrapMaterialOption[] = [
  {
    id: 'nylon-webbing',
    label: '尼龙织带',
    arealDensityGm2: 1800,
    evidence: {
      tier: 'weak',
      source: '尼龙密度约 1.14 g/cm³（材料手册）× 常见织带厚度 1.6 mm，属工程估算',
      note: '织造密度与厚度随厂商规格变化，个体差异较大。',
    },
  },
  {
    id: 'organic-cotton',
    label: '有机棉',
    arealDensityGm2: 900,
    evidence: {
      tier: 'weak',
      source: '棉织带厚度约 2 mm、松散编织体密度按 0.45 g/cm³ 估算',
      note: '棉带吸水后增重明显，本模型未计入吸水与干燥周期。',
    },
  },
  {
    id: 'silicone',
    label: '硅胶',
    arealDensityGm2: 2300,
    evidence: {
      tier: 'weak',
      source: '硅胶密度约 1.15 g/cm³（材料手册）× 带体厚度 2 mm',
      note: '硅胶常见于防水型带体，弹性与厚度关系未建模。',
    },
  },
  {
    id: 'full-grain-leather',
    label: '头层牛皮',
    arealDensityGm2: 2700,
    evidence: {
      tier: 'weak',
      source: '皮革密度约 0.9 g/cm³ × 常见项圈皮厚 3 mm',
      note: '皮厚在 2–4 mm 之间浮动，因此这一档的误差比织带类大。',
    },
  },
  {
    id: 'reflective-webbing',
    label: '反光织带',
    arealDensityGm2: 1300,
    evidence: {
      tier: 'weak',
      source: '尼龙基带（较薄，约 1.0 mm）+ 反光膜层，按厂商规格页的克重量级汇总',
      note: '反光层的逆反射系数与耐洗次数未建模；这里只算克重。',
    },
  },
  {
    id: 'bio-based-webbing',
    label: '生物基可降解织带',
    // ★ 证据政策：未核实 → 不给数值。测试会断言这一项没有克重数字。
    arealDensityGm2: null,
    evidence: {
      tier: 'unverified',
      source: '未取得可靠克重来源',
      note: '本项目没有检索到可核对的材料规格，因此不填推测值，也不参与任何克重比较。',
    },
  },
];

// ---------------------------------------------------------------- 维度二：大小（尺寸）

/** 尺寸档 id。 */
export type StrapSizeId = 'xs' | 's' | 'm' | 'l';

/**
 * 尺寸档：颈围区间 + 带体宽度 + 下料长度。
 *
 * 「颈围区间」是**几何适用性**（能不能绕上脖子），「带体宽度」是**克重的一半输入**，
 * 「下料长度」是另一半——三者在同一张表里，因为现实里它们就是同一条带子的参数。
 */
export interface StrapSizeOption {
  id: StrapSizeId;
  label: string;
  /** 建议颈围区间（cm，含端点） */
  neckMinCm: number;
  neckMaxCm: number;
  /** 带体宽度（mm）——克重与接触压强都由它决定 */
  widthMm: number;
  /** 下料长度（mm）：颈围区间中值 × 1.25（扣合重叠 + 调整尾段） */
  strapLengthMm: number;
  /**
   * 这一档适用的**体型档**（`sizeClassOf` 的取值）。
   *
   * 为什么要有它，而不是只看颈围：颈围是由体重**近似**出来的（`profile.ts` 的 `neckCmOf`），
   * 近似值在小体型上误差最大。体型档是另一条独立的、直接来自体重的判据，
   * 两条判据一起用才挡得住「2.4 kg 的狗配 25 mm 宽的带子」这种组合。
   */
  fitsSizeClasses: readonly SizeClass[];
  evidence: EvidenceTag;
}

/**
 * 尺寸档。
 *
 * 颈围区间取自**常见项圈规格**的分档习惯（XS 约小猫/幼犬、L 约大型犬），
 * 带体宽度取该档常见的 10 / 15 / 20 / 25 mm。标 `weak`：这是规格分档惯例，不是测量结论。
 */
export const STRAP_SIZE_OPTIONS: readonly StrapSizeOption[] = [
  {
    id: 'xs',
    label: 'XS',
    neckMinCm: 18,
    neckMaxCm: 24,
    widthMm: 10,
    strapLengthMm: 260,
    fitsSizeClasses: ['toy', 'cat-small'],
    evidence: {
      tier: 'weak',
      source: '常见项圈规格分档惯例（超小型犬与偏小体型猫），本仓库未取得测量来源',
      note: '颈围区间与带体宽度是规格惯例值，用于适配判定，不代表任何个体的实测颈围。',
    },
  },
  {
    id: 's',
    label: 'S',
    neckMinCm: 22,
    neckMaxCm: 30,
    widthMm: 15,
    strapLengthMm: 325,
    fitsSizeClasses: ['toy', 'small', 'cat-small', 'cat-standard'],
    evidence: {
      tier: 'weak',
      source: '常见项圈规格分档惯例（小型犬与标准体型猫）',
      note: '与 XS 刻意留出重叠区间：可调节项圈本来就会跨档。',
    },
  },
  {
    id: 'm',
    label: 'M',
    neckMinCm: 28,
    neckMaxCm: 40,
    widthMm: 20,
    strapLengthMm: 425,
    fitsSizeClasses: ['small', 'medium', 'cat-standard', 'cat-large'],
    evidence: {
      tier: 'weak',
      source: '常见项圈规格分档惯例（中型犬）',
      note: '20 mm 是中型犬最常见的带体宽度。',
    },
  },
  {
    id: 'l',
    label: 'L',
    neckMinCm: 36,
    neckMaxCm: 55,
    widthMm: 25,
    strapLengthMm: 570,
    fitsSizeClasses: ['medium', 'large', 'giant', 'cat-large'],
    evidence: {
      tier: 'weak',
      source: '常见项圈规格分档惯例（大型犬）',
      note: '25 mm 宽度的带体配 2.4 kg 个体在几何上就绕不住，因此体型档判据必须一起用。',
    },
  },
];

// ---------------------------------------------------------------- 维度三：轻重

/** 轻重档 id。 */
export type StrapGradeId = 'light' | 'standard' | 'heavy';

/**
 * 轻重档：相对厚度倍率。
 *
 * 为什么用「相对倍率」而不是直接给单位长度克重：面密度已经在材质档里了，
 * 再叠一层绝对克重会出现两个真值来源。倍率表达的是**同材质下的厚度选择**，
 * 与材质正交，这也是用户实际做决定的方式（「我要更结实一点的」）。
 */
export interface StrapGradeOption {
  id: StrapGradeId;
  label: string;
  /** 相对增量倍率：以「标准」为 1.0 */
  thicknessFactor: number;
  evidence: EvidenceTag;
}

/** 轻重档。倍率是工程约定（薄/标准/加厚三档），标 `weak`。 */
export const STRAP_GRADE_OPTIONS: readonly StrapGradeOption[] = [
  {
    id: 'light',
    label: '轻量',
    thicknessFactor: 0.75,
    evidence: {
      tier: 'weak',
      source: '工程约定：同材质薄档，厚度约为标准档的 0.75 倍',
      note: '更轻但更易磨损，本模型不评估寿命。',
    },
  },
  {
    id: 'standard',
    label: '标准',
    thicknessFactor: 1,
    evidence: {
      tier: 'weak',
      source: '工程约定：标准档，倍率定义为 1.0（材质档的面密度即按这一档给）',
      note: '这是一个**定义**，不是测量值。',
    },
  },
  {
    id: 'heavy',
    label: '加厚',
    thicknessFactor: 1.5,
    evidence: {
      tier: 'weak',
      source: '工程约定：加厚档，厚度约为标准档的 1.5 倍',
      note: '更耐用但显著增重，正是小体型最容易超预算的那一档。',
    },
  },
];

// ---------------------------------------------------------------- 查表（纯函数）

/** 按 id 取材质档；id 不在目录里时为 `undefined`（界面按「目录里没有这一项」处理）。 */
export function materialOptionOf(id: string): StrapMaterialOption | undefined {
  return STRAP_MATERIAL_OPTIONS.find((o) => o.id === id);
}

/** 按 id 取尺寸档。 */
export function sizeOptionOf(id: string): StrapSizeOption | undefined {
  return STRAP_SIZE_OPTIONS.find((o) => o.id === id);
}

/** 按 id 取轻重档。 */
export function gradeOptionOf(id: string): StrapGradeOption | undefined {
  return STRAP_GRADE_OPTIONS.find((o) => o.id === id);
}

/** 一次选择：三个维度各取一项。 */
export interface StrapSelection {
  materialId: StrapMaterialId;
  sizeId: StrapSizeId;
  gradeId: StrapGradeId;
}

// ---------------------------------------------------------------- 克重

/**
 * 这条带体多重（克）。
 *
 * 模型（三个维度各出一项，相乘）：
 *
 * ```
 * 克重 = 下料长度(m) × 带体宽度(m) × 材质面密度(g/m²) × 轻重倍率
 * ```
 *
 * 纯函数、可预测：同一个选择永远得到同一个数（测试钉住这一点，并钉住它对轻重档单调递增）。
 *
 * 返回 `null` 的三种情形，都必须说得出理由：
 *   1. 选项不在目录里（id 写错）；
 *   2. 材质档的证据等级是「未核实」——按证据政策**不给数值**；
 *   3. 上述任一项缺失。
 * 界面因此不能"顺手显示一个 0"，只能显示「无法给出克重」。
 */
export function strapWeightG(selection: StrapSelection): number | null {
  const material = materialOptionOf(selection.materialId);
  const size = sizeOptionOf(selection.sizeId);
  const grade = gradeOptionOf(selection.gradeId);
  if (!material || !size || !grade) return null;
  if (material.arealDensityGm2 === null) return null;
  const lengthM = size.strapLengthMm / 1000;
  const widthM = size.widthMm / 1000;
  return round1(lengthM * widthM * material.arealDensityGm2 * grade.thicknessFactor);
}

// ---------------------------------------------------------------- 合不合身

/** 「不合身」的可核查理由的分类（界面据此选词组，不必解析文案）。 */
export type StrapFitIssueCode =
  | 'unknown-option'
  | 'unquantified-material'
  | 'over-budget'
  | 'size-neck-mismatch'
  | 'size-class-mismatch';

/**
 * 判定结果。
 *
 * 三个字段是**要求的**（`ok` / `strapWeightG` / `budgetG` / `reasons`），其余是同一批计算的
 * 中间量——把它们一起回传，界面就不必再算第二遍，也就不会算出第二个答案。
 */
export interface StrapFitResult {
  /** 重量与几何都通过才为 true；不能给出克重（证据未核实）时也是 false */
  ok: boolean;
  /** 带体克重；`null` = 按证据政策不能给数值 */
  strapWeightG: number | null;
  /** 重量预算（克）= 这只宠物体重的 2%，由 `collarBudgetOf` 给出 */
  budgetG: number;
  /** 可核查的理由（超了多少克、预算规则出自哪里、尺寸为什么不合适） */
  reasons: readonly string[];
  /** 理由的分类代码，供界面按物种词表再渲染一遍更细的句子 */
  issues: readonly StrapFitIssueCode[];
  /** 表盘（电子仓）克重——总重 = 带体 + 表盘 */
  podWeightG: number;
  /** 总重（带体 + 表盘）；不能给数值时为 `null` */
  totalWeightG: number | null;
  /** 超预算多少克（未超或无法比较时为 `null`） */
  overByG: number | null;
  /** 这只宠物可用的带长区间（mm），由颈围推出；来自 `collarBudgetOf` */
  strapRangeMm: readonly [number, number];
  /** 选中尺寸档的颈围区间（cm） */
  neckRangeCm: readonly [number, number] | null;
  /** 选中尺寸档的带体宽度（mm） */
  strapWidthMm: number | null;
  /** 尺寸档**单独**看是否适用于这只宠物（颈围重叠 + 体型档命中） */
  sizeRecommended: boolean;
  /** 由体重推出的体型档（界面用词表把它渲染成中文） */
  sizeClass: SizeClass;
}

/**
 * 这条带合不合身。
 *
 * 判定分两层，**两层都必须过**：
 *
 * 1. **几何层**：尺寸档的颈围区间要和这只宠物的可用带长区间（`collarBudgetOf` 由颈围推出）
 *    有重叠；并且这只宠物的体型档要在该尺寸档的适用列表里。小体型配 L 档就是在这里被挡下的。
 * 2. **重量层**：带体重 + 表盘重 ≤ 预算（= 体重的 2%）。超了就把超出的克数写进 `reasons`。
 *
 * 预算规则本身标 `weak`（工程经验值），`reasons` 里会把它连同出处一起说出来——
 * 一个会被用户看到的阈值，必须同时告诉用户它是怎么来的。
 */
export function checkStrapFit(profile: PetProfile, selection: StrapSelection): StrapFitResult {
  const budget = collarBudgetOf(profile);
  const sizeClass = sizeClassOf(profile.species, profile.weightKg);
  const material = materialOptionOf(selection.materialId);
  const size = sizeOptionOf(selection.sizeId);
  const grade = gradeOptionOf(selection.gradeId);
  const strapRangeMm: [number, number] = [budget.strapMinMm, budget.strapMaxMm];

  const reasons: string[] = [];
  const issues: StrapFitIssueCode[] = [];

  // ---- 几何层
  let sizeRecommended = false;
  if (!size) {
    issues.push('unknown-option');
    reasons.push(`尺寸档「${selection.sizeId}」不在商城目录里，无法判断是否绕得住脖子。`);
  } else {
    const neckRangeMm: [number, number] = [size.neckMinCm * 10, size.neckMaxCm * 10];
    const neckOk = rangesOverlap(neckRangeMm, strapRangeMm);
    const classOk = size.fitsSizeClasses.includes(sizeClass);
    sizeRecommended = neckOk && classOk;
    if (!neckOk) {
      issues.push('size-neck-mismatch');
      reasons.push(
        `尺寸档「${size.label}」的颈围区间是 ${size.neckMinCm}–${size.neckMaxCm} cm，` +
          `与这只宠物的可用带长 ${budget.strapMinMm}–${budget.strapMaxMm} mm（由颈围推出）不重叠。`,
      );
    }
    if (!classOk) {
      issues.push('size-class-mismatch');
      reasons.push(
        `体型档不匹配：这只宠物体重 ${profile.weightKg} kg，不在「${size.label}」这一档的设计范围内` +
          `（该档带体宽 ${size.widthMm} mm、下料长 ${size.strapLengthMm} mm）。`,
      );
    }
  }

  if (!material) {
    issues.push('unknown-option');
    reasons.push(`材质「${selection.materialId}」不在商城目录里。`);
  } else if (material.arealDensityGm2 === null) {
    issues.push('unquantified-material');
    reasons.push(
      `材质「${material.label}」的证据等级为未核实（${material.evidence.source ?? '未取得来源'}），` +
        '按本项目的证据政策不给克重数字，因此无法与预算比较。',
    );
  }
  if (!grade) {
    issues.push('unknown-option');
    reasons.push(`轻重档「${selection.gradeId}」不在商城目录里。`);
  }

  // ---- 重量层
  const strapWeight = strapWeightG(selection);
  const totalWeight = strapWeight === null ? null : round1(strapWeight + COLLAR_POD_WEIGHT_G);
  let overBy: number | null = null;
  if (totalWeight !== null && totalWeight > budget.maxWeightG) {
    overBy = round1(totalWeight - budget.maxWeightG);
    issues.push('over-budget');
    // 体重 2% 的原始值被 25–260 g 钳住时要说出来：否则「60 kg 的 2% 却是 260 g」看起来像算错了。
    const rawBudget = profile.weightKg * 1000 * 0.02;
    const clamped = Math.round(rawBudget) !== budget.maxWeightG ? '（该值已被 25–260 g 的上下限钳制）' : '';
    reasons.push(
      `超预算 ${overBy} g：带体 ${strapWeight} g + 表盘 ${COLLAR_POD_WEIGHT_G} g = ${totalWeight} g，` +
        `而重量预算是 ${budget.maxWeightG} g${clamped}。预算规则是体重的 2%（工程经验值，证据等级 weak；` +
        `出处：docs/hardware/01-collar-spec.md §2「重量预算」与 profile.ts 的 collarBudgetOf）。`,
    );
  }

  return {
    ok: strapWeight !== null && sizeRecommended && overBy === null,
    strapWeightG: strapWeight,
    budgetG: budget.maxWeightG,
    reasons,
    issues,
    podWeightG: COLLAR_POD_WEIGHT_G,
    totalWeightG: totalWeight,
    overByG: overBy,
    strapRangeMm,
    neckRangeCm: size ? [size.neckMinCm, size.neckMaxCm] : null,
    strapWidthMm: size ? size.widthMm : null,
    sizeRecommended,
    sizeClass,
  };
}

/** 目录里的一条"最轻"记录（见 `lightestStrapFor`）。 */
export interface StrapLightestResult {
  selection: StrapSelection;
  strapWeightG: number;
  totalWeightG: number;
}

/**
 * 目录里**这只宠物戴得上**的最轻组合。
 *
 * 为什么要它：小体型用户看到"超预算"时，第一个问题一定是「那有没有轻一点的？」。
 * 这个函数把那个问题回答成一句可核查的话——「目录里最轻的一条是 X g，仍超 Y g」。
 *
 * 「戴得上」= 尺寸档通过几何层的两条判据（颈围重叠 + 体型档命中），并且材质的克重可给。
 * 若目录里没有任何一条戴得上（或全部未核实），返回 `null`。
 */
export function lightestStrapFor(profile: PetProfile): StrapLightestResult | null {
  let best: StrapLightestResult | null = null;
  for (const size of STRAP_SIZE_OPTIONS) {
    for (const material of STRAP_MATERIAL_OPTIONS) {
      for (const grade of STRAP_GRADE_OPTIONS) {
        const selection: StrapSelection = { materialId: material.id, sizeId: size.id, gradeId: grade.id };
        const fit = checkStrapFit(profile, selection);
        if (!fit.sizeRecommended) continue;
        const strap = strapWeightG(selection);
        if (strap === null) continue;
        const total = round1(strap + COLLAR_POD_WEIGHT_G);
        if (!best || total < best.totalWeightG) {
          best = { selection, strapWeightG: strap, totalWeightG: total };
        }
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------- 小工具

/** 两个闭区间是否重叠（含端点相接触也算）。 */
function rangesOverlap(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

/** 保留一位小数：界面上的克重只到 0.1 g，避免"精确到小数点后 12 位"的伪精度。 */
function round1(value: number): number {
  return Number(value.toFixed(1));
}
