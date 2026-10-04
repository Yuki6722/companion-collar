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

/**
 * 狗版演示档案：一只 3 岁的柴犬（肩高 40 cm、10 kg）。
 *
 * 与猫版**分开一份**而不是复用同一个对象：档案驱动的是「这只宠物自己的基线」
 * （见 `packages/simulator` 的 `baselines()`：猫 hr 160 / 狗 hr 95），
 * 复用一份档案会让两个页面算出同一条基线 —— 那正是"万能宠物滤镜"，
 * 而本项目的决策是「共用机制、分开参数」。
 *
 * `heightCm` 用于体型档位与项圈相机高度推导，取值按柴犬的实际肩高量级。
 */
export const DEMO_DOG_PROFILE: PetProfile = {
  species: 'dog',
  breedId: 'shiba',
  weightKg: 10,
  heightCm: 40,
  ageMonths: 36,
};
