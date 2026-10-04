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

/** 年龄选项（月）。刻意覆盖四个年龄段，让「年龄 → 分档」这件事在界面上可验证。 */
export const AGE_OPTIONS_MONTHS: readonly number[] = [6, 12, 36, 72, 108, 144, 180];
