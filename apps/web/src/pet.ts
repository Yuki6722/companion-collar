import type { PetProfile } from '@camp/core';

/**
 * 演示用宠物档案：一只 4.2 kg 的成年家短毛猫（肩高 24 cm）。
 * 两个屏共用同一份档案，项圈相机高度等推导值也因此一致。
 */
export const DEMO_PROFILE: PetProfile = {
  species: 'cat',
  breedId: 'domestic-shorthair',
  weightKg: 4.2,
  heightCm: 24,
  ageMonths: 36,
};
