/**
 * 档案推导：把用户填写的品种 / 体型 / 年龄，转成下游可用的分档与工程预算。
 *
 * 重要：本文件中所有**工程经验值**（如项圈重量上限）都标注为 weak，
 * 它们不是文献结论，UI 必须据此显示对应等级。
 */
import type { AgeBand, CollarBudget, PetProfile, SizeClass, Species } from './types.ts';

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
