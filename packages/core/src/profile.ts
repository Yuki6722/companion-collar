/**
 * 档案推导：把用户填写的品种 / 体型 / 年龄，转成下游可用的分档与工程预算。
 *
 * 重要：本文件中所有**工程经验值**（如项圈重量上限）都标注为 weak，
 * 它们不是文献结论，UI 必须据此显示对应等级。
 */
import type { AgeBand, CollarBudget, EvidenceTag, PetProfile, SizeClass, Species } from './types.ts';

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * 年龄分档。阈值为猫狗通用近似值，标注 moderate——
 * 不同体型犬种的「老年」起点差异很大（大型犬更早）。
 */
export function ageBandOf(ageMonths: number): AgeBand {
  if (ageMonths < 12) return 'junior';
  if (ageMonths < 96) return 'adult'; // < 8 岁
  if (ageMonths < 156) return 'senior'; // 8–13 岁
  return 'geriatric';
}

export function isSenior(ageMonths: number): boolean {
  const band = ageBandOf(ageMonths);
  return band === 'senior' || band === 'geriatric';
}

export function sizeClassOf(species: Species, weightKg: number): SizeClass {
  if (species === 'cat') {
    if (weightKg < 3.2) return 'cat-small';
    if (weightKg <= 5.5) return 'cat-standard';
    return 'cat-large';
  }
  if (weightKg < 5) return 'toy';
  if (weightKg < 10) return 'small';
  if (weightKg < 25) return 'medium';
  if (weightKg < 45) return 'large';
  return 'giant';
}

/**
 * 项圈工程预算。
 *
 * ⚠️ 重量上限取体重的 2%：这是**工程经验值**（`weak`），不是同行评审结论。
 * 现有带摄像头产品约 100 g、多参数传感项圈大号也约 100 g——两者合一会显著超重，
 * 这正是「摄像头与健康传感从未合一」的工程原因。
 */
export function collarBudgetOf(profile: PetProfile): CollarBudget {
  const maxWeightG = clamp(profile.weightKg * 1000 * 0.02, 25, 260);
  // 颈围以体重近似：cat 约 20–30 cm；犬随体重增长
  const neckCm =
    profile.species === 'cat'
      ? clamp(18 + profile.weightKg * 1.6, 18, 32)
      : clamp(20 + Math.pow(profile.weightKg, 0.62) * 4.2, 20, 62);
  return {
    maxWeightG: Math.round(maxWeightG),
    strapMinMm: Math.round(neckCm * 10 * 0.85),
    strapMaxMm: Math.round(neckCm * 10 * 1.25),
  };
}

/** 项圈相机离地高度：项圈位于肩高附近，取肩高的 85%，并限制在合理区间。 */
export function cameraHeightOf(heightCm: number): number {
  return Number(clamp((heightCm / 100) * 0.85, 0.15, 0.7).toFixed(3));
}

// ---------------------------------------------------------------- 可选的品种与年龄

/**
 * 品种选项。
 *
 * ⚠️ 体型取值是**概略值**（标 `weak`）：品种标准的身高/体重范围来自公开的品种资料与常识，
 * 本项目**未取得同行评审一手来源**。它的用途只有一个——让"换品种 → 基线跟着变"这件事
 * 在仿真里成立（`baselines()` 用心率/呼吸的体型因子推导），**不是**对任何个体的度量宣称。
 * 身高取"肩高"（猫约 20–30 cm），体重取成年典型值。
 */
export interface BreedOption {
  id: string;
  label: string;
  heightCm: number;
  weightKg: number;
  evidence: EvidenceTag;
}

const BREED_EVIDENCE: EvidenceTag = {
  tier: 'weak',
  source: '公开品种资料与常识汇总（本仓库未取得同行评审一手来源）',
  note: '品种体型概略值；只用于推导仿真基线与展示，不代表任何个体的实测值。',
};

export const CAT_BREEDS: readonly BreedOption[] = [
  { id: 'domestic-shorthair', label: '家养短毛猫', heightCm: 24, weightKg: 4.2, evidence: BREED_EVIDENCE },
  { id: 'domestic-longhair', label: '家养长毛猫', heightCm: 25, weightKg: 4.5, evidence: BREED_EVIDENCE },
  { id: 'british-shorthair', label: '英国短毛猫', heightCm: 26, weightKg: 5.5, evidence: BREED_EVIDENCE },
  { id: 'american-shorthair', label: '美国短毛猫', heightCm: 25, weightKg: 4.8, evidence: BREED_EVIDENCE },
  { id: 'siamese', label: '暹罗猫', heightCm: 24, weightKg: 3.6, evidence: BREED_EVIDENCE },
  { id: 'ragdoll', label: '布偶猫', heightCm: 27, weightKg: 6.0, evidence: BREED_EVIDENCE },
  { id: 'maine-coon', label: '缅因猫', heightCm: 30, weightKg: 7.0, evidence: BREED_EVIDENCE },
  { id: 'scottish-fold', label: '苏格兰折耳猫', heightCm: 25, weightKg: 4.6, evidence: BREED_EVIDENCE },
  { id: 'sphynx', label: '斯芬克斯猫（无毛）', heightCm: 25, weightKg: 3.8, evidence: BREED_EVIDENCE },
  { id: 'bengal', label: '孟加拉豹猫', heightCm: 26, weightKg: 5.0, evidence: BREED_EVIDENCE },
  { id: 'persian', label: '波斯猫', heightCm: 24, weightKg: 4.4, evidence: BREED_EVIDENCE },
  { id: 'munchkin', label: '曼基康猫（短腿）', heightCm: 20, weightKg: 3.4, evidence: BREED_EVIDENCE },
];

/**
 * 犬种选项。形状与 `CAT_BREEDS` **完全一致**（同一个 `BreedOption`、同一份 `BREED_EVIDENCE`）。
 *
 * 取值口径（与猫版对齐，便于两边逐条对账）：
 *   - `heightCm` 取**肩高**（不含头颈），成年典型值；
 *   - `weightKg` 取成年典型值。
 *
 * 为什么这批值要**刻意覆盖多个体重档位**：`sizeClassOf('dog', weightKg)` 按 5 / 10 / 25 / 45 kg
 * 分五档，而档位同时喂给两处下游——`baselines()` 的体型因子（肩高）与 `collarBudgetOf()`
 * 的项圈工程预算（体重 2%）。若所有犬种都落在同一档，「换个品种基线跟着变」这件事在仿真里
 * 就等于没发生，单测也测不出任何东西。因此这里让体重从 2.4 kg 一路铺到 60 kg。
 *
 * 主角是**柴犬**（`id: 'shiba'`，肩高约 40 cm、体重约 10 kg）：`#/dog` 场景里那只。
 * 40 / 10 是柴犬成年个体的常见量级（肩高 38–41 cm、体重 8–11 kg），落在 `medium` 档。
 *
 * ⚠️ 与猫版同一条边界：这些是**公开品种资料的概略值**（`weak`），
 * 本项目**未取得同行评审一手来源**，它们不代表任何个体的实测值，也不是任何度量宣称。
 */
export const DOG_BREEDS: readonly BreedOption[] = [
  // 玩具档（< 5 kg）：贵宾的玩具型与吉娃娃，肩高 15–30 cm
  { id: 'chihuahua', label: '吉娃娃', heightCm: 17, weightKg: 2.4, evidence: BREED_EVIDENCE },
  { id: 'toy-poodle', label: '玩具贵宾犬', heightCm: 25, weightKg: 3.2, evidence: BREED_EVIDENCE },
  // 小型档（5–10 kg）：日本狐狸犬（银狐）约 7 kg
  { id: 'japanese-spitz', label: '日本狐狸犬', heightCm: 35, weightKg: 7.0, evidence: BREED_EVIDENCE },
  // 中型档（10–25 kg）：柴犬是这一档的主角；柯基与法斗都是**矮身但结实**的体型，
  // 因此肩高比柴犬低、体重反而略高——这正是「肩高与体重不同向」的典型，单测用它守住
  // 「分档看体重、体型因子看肩高」这条两者不能互相替代的性质。
  { id: 'shiba', label: '柴犬', heightCm: 40, weightKg: 10.0, evidence: BREED_EVIDENCE },
  { id: 'welsh-corgi', label: '威尔士柯基犬', heightCm: 27, weightKg: 12.0, evidence: BREED_EVIDENCE },
  { id: 'french-bulldog', label: '法国斗牛犬', heightCm: 30, weightKg: 12.5, evidence: BREED_EVIDENCE },
  { id: 'beagle', label: '比格犬', heightCm: 38, weightKg: 11.0, evidence: BREED_EVIDENCE },
  { id: 'border-collie', label: '边境牧羊犬', heightCm: 53, weightKg: 19.0, evidence: BREED_EVIDENCE },
  { id: 'standard-poodle', label: '标准贵宾犬', heightCm: 55, weightKg: 23.0, evidence: BREED_EVIDENCE },
  // 大型档（25–45 kg）
  { id: 'labrador-retriever', label: '拉布拉多寻回犬', heightCm: 57, weightKg: 30.0, evidence: BREED_EVIDENCE },
  { id: 'golden-retriever', label: '金毛寻回犬', heightCm: 58, weightKg: 31.0, evidence: BREED_EVIDENCE },
  { id: 'german-shepherd', label: '德国牧羊犬', heightCm: 62, weightKg: 36.0, evidence: BREED_EVIDENCE },
  { id: 'akita', label: '秋田犬', heightCm: 65, weightKg: 40.0, evidence: BREED_EVIDENCE },
  // 巨型档（≥ 45 kg）：没有这一档，`sizeClassOf` 的最后一个分档就永远测不到
  { id: 'great-dane', label: '大丹犬', heightCm: 78, weightKg: 60.0, evidence: BREED_EVIDENCE },
];

/** 年龄选项（月）。刻意覆盖四个年龄段，让「年龄 → 分档」这件事在界面上可验证。 */
export const AGE_OPTIONS_MONTHS: readonly number[] = [6, 12, 36, 72, 108, 144, 180];
