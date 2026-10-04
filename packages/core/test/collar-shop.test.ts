/**
 * 商城目录与「合不合身」判定的单测。
 *
 * 这里钉住四类性质，每一类都对应一条会被用户看见的结论：
 *   1. **目录完整性**：三项维度的每一项都有中文名与证据等级，维度个数满足要求；
 *   2. **证据政策**：`unverified` 的选项**不许带数值**（类型上的 `null` + 运行时断言）；
 *   3. **克重是纯函数**：同一选择结果确定、对轻重档单调递增、能对得上手算；
 *   4. **小体型更容易超预算**：吉娃娃（2.4 kg）与大丹（60 kg）必须给出不同结论，
 *      且超预算时 `reasons` 里必须有可核查的数字（不是一句"太轻了"）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLAR_POD_WEIGHT_G,
  STRAP_GRADE_OPTIONS,
  STRAP_MATERIAL_OPTIONS,
  STRAP_SIZE_OPTIONS,
  checkStrapFit,
  collarBudgetOf,
  lightestStrapFor,
  strapWeightG,
} from '../src/index.ts';
import type { PetProfile, StrapSelection, Tier } from '../src/index.ts';

const TIERS: readonly Tier[] = ['strong', 'moderate', 'weak', 'unverified', 'disputed'];

/** 断言非空并把它收窄成非空类型（`assert.ok` 不做类型收窄，直接用会在严格模式下报错）。 */
function must<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

/** 吉娃娃：`DOG_BREEDS` 里最轻的一档（2.4 kg）——预算 = 48 g，本功能的主角。 */
const chihuahua: PetProfile = {
  species: 'dog',
  breedId: 'chihuahua',
  weightKg: 2.4,
  heightCm: 17,
  ageMonths: 24,
};

/** 大丹：`DOG_BREEDS` 里最重的一档（60 kg）——预算被 260 g 的上限钳住。 */
const greatDane: PetProfile = {
  species: 'dog',
  breedId: 'great-dane',
  weightKg: 60,
  heightCm: 78,
  ageMonths: 36,
};

/** 猫版默认档案（家养短毛猫 4.2 kg）——猫版页面走的就是这一档。 */
const cat: PetProfile = {
  species: 'cat',
  breedId: 'domestic-shorthair',
  weightKg: 4.2,
  heightCm: 24,
  ageMonths: 36,
};

test('三个维度的选项表：每项都有中文名与证据等级，条数满足要求', () => {
  assert.ok(STRAP_MATERIAL_OPTIONS.length >= 5, '材质至少 5 种');
  assert.ok(STRAP_SIZE_OPTIONS.length >= 4, '大小至少 4 档');
  assert.ok(STRAP_GRADE_OPTIONS.length >= 3, '轻重至少 3 档');

  for (const table of [STRAP_MATERIAL_OPTIONS, STRAP_SIZE_OPTIONS, STRAP_GRADE_OPTIONS]) {
    for (const option of table) {
      assert.ok(option.id.length > 0, `${option.id} 必须有 id`);
      assert.ok(option.label.length > 0, `${option.id} 必须有中文名`);
      assert.ok(TIERS.includes(option.evidence.tier), `${option.id} 的证据等级必须是合法取值`);
      assert.ok((option.evidence.source ?? '').length > 0, `${option.id} 必须写清来源`);
      assert.ok((option.evidence.note ?? '').length > 0, `${option.id} 必须写清它为什么是这个等级`);
    }
  }
});

test('尺寸表与轻重表自身是单调的（区间合法、宽度递增、倍率递增）', () => {
  for (const size of STRAP_SIZE_OPTIONS) {
    assert.ok(size.neckMinCm < size.neckMaxCm, `${size.label} 的颈围区间必须合法`);
    assert.ok(size.widthMm > 0 && size.strapLengthMm > 0, `${size.label} 的几何必须为正`);
    assert.ok(size.fitsSizeClasses.length > 0, `${size.label} 必须给出适用的体型档`);
  }
  const widths = STRAP_SIZE_OPTIONS.map((s) => s.widthMm);
  for (let i = 1; i < widths.length; i++) {
    assert.ok(must(widths[i], 'width') > must(widths[i - 1], 'width'), '带体宽度必须随档位递增');
  }
  const factors = STRAP_GRADE_OPTIONS.map((g) => g.thicknessFactor);
  for (let i = 1; i < factors.length; i++) {
    assert.ok(must(factors[i], 'factor') > must(factors[i - 1], 'factor'), '轻重倍率必须随档位递增');
  }
  assert.equal(STRAP_GRADE_OPTIONS.find((g) => g.id === 'standard')?.thicknessFactor, 1);
});

test('证据政策：标为未核实的选项不许带数值', () => {
  for (const material of STRAP_MATERIAL_OPTIONS) {
    if (material.evidence.tier === 'unverified') {
      assert.equal(material.arealDensityGm2, null, `${material.label} 未核实 → 不得给克重`);
    } else {
      assert.ok(typeof material.arealDensityGm2 === 'number', `${material.label} 有等级就必须有数值`);
      assert.ok(must(material.arealDensityGm2, 'density') > 0, `${material.label} 的面密度必须为正`);
    }
  }
  // 目录里确实存在这样一项，否则上面那条分支等于没跑
  const unverified = STRAP_MATERIAL_OPTIONS.filter((m) => m.evidence.tier === 'unverified');
  assert.ok(unverified.length >= 1, '目录里应有一项"查不到来源"的材质来体现这条政策');
  for (const material of unverified) {
    assert.equal(material.arealDensityGm2, null);
  }
});

test('unverified 的材质：克重给不出数值，判定为不合身且理由非空', () => {
  const selection: StrapSelection = { materialId: 'bio-based-webbing', sizeId: 's', gradeId: 'standard' };
  assert.equal(strapWeightG(selection), null, '未核实的材质不得算出克重');
  const fit = checkStrapFit(cat, selection);
  assert.equal(fit.ok, false);
  assert.equal(fit.strapWeightG, null);
  assert.equal(fit.totalWeightG, null, '算不出带体重就不该编一个总重');
  assert.ok(fit.reasons.length >= 1, '必须说得出为什么不能判定');
  assert.ok(fit.issues.includes('unquantified-material'));
});

test('strapWeightG 是纯函数：同一选择结果确定，且对轻重档单调递增', () => {
  for (const material of STRAP_MATERIAL_OPTIONS) {
    if (material.arealDensityGm2 === null) continue;
    for (const size of STRAP_SIZE_OPTIONS) {
      const light: StrapSelection = { materialId: material.id, sizeId: size.id, gradeId: 'light' };
      const standard: StrapSelection = { materialId: material.id, sizeId: size.id, gradeId: 'standard' };
      const heavy: StrapSelection = { materialId: material.id, sizeId: size.id, gradeId: 'heavy' };
      const wl = must(strapWeightG(light), `${material.label} ${size.label} 轻量应能算出克重`);
      const ws = must(strapWeightG(standard), `${material.label} ${size.label} 标准应能算出克重`);
      const wh = must(strapWeightG(heavy), `${material.label} ${size.label} 加厚应能算出克重`);
      assert.equal(strapWeightG(standard), ws, '同一选择必须每次都得到同一个数');
      assert.ok(wl < ws, `${material.label} ${size.label}：轻量必须轻于标准`);
      assert.ok(ws < wh, `${material.label} ${size.label}：加厚必须重于标准`);
    }
  }
});

test('strapWeightG 对得上"长度 × 宽度 × 面密度 × 倍率"这条手算', () => {
  const nylonXs: StrapSelection = { materialId: 'nylon-webbing', sizeId: 'xs', gradeId: 'standard' };
  // 0.260 m × 0.010 m × 1800 g/m² × 1.0 = 4.68 → 4.7
  assert.equal(strapWeightG(nylonXs), 4.7);
  const leatherXs: StrapSelection = { materialId: 'full-grain-leather', sizeId: 'xs', gradeId: 'standard' };
  // 0.260 × 0.010 × 2700 = 7.02 → 7.0
  assert.equal(strapWeightG(leatherXs), 7.0);
  const nylonSHeavy: StrapSelection = { materialId: 'nylon-webbing', sizeId: 's', gradeId: 'heavy' };
  // 0.325 × 0.015 × 1800 × 1.5 = 13.1625 → 13.2
  assert.equal(strapWeightG(nylonSHeavy), 13.2);
  // 目录里没有的 id：给不出数值，而不是给 0
  const bogus = { materialId: 'nylon-webbing', sizeId: 'xxl', gradeId: 'standard' } as unknown as StrapSelection;
  assert.equal(strapWeightG(bogus), null);
});

test('预算取自 collarBudgetOf：吉娃娃 48 g、大丹被 260 g 上限钳住', () => {
  assert.equal(collarBudgetOf(chihuahua).maxWeightG, 48);
  assert.equal(collarBudgetOf(greatDane).maxWeightG, 260);
  assert.ok(collarBudgetOf(chihuahua).maxWeightG < collarBudgetOf(greatDane).maxWeightG);
});

test('同一个"牛皮 + L + 加厚"：吉娃娃不合身，大丹合身', () => {
  const heavy: StrapSelection = { materialId: 'full-grain-leather', sizeId: 'l', gradeId: 'heavy' };
  const small = checkStrapFit(chihuahua, heavy);
  const large = checkStrapFit(greatDane, heavy);

  assert.equal(small.ok, false, '2.4 kg 的个体配 25 mm × 570 mm 的牛皮带必须被判为不合身');
  assert.equal(large.ok, true, '60 kg 的个体用同一条带应当通过');
  assert.notEqual(small.ok, large.ok, '这正是"小体型更容易超预算"要看到的不同结论');

  // 吉娃娃这一条同时踩了体型档与重量两层，两条理由都要说得出数字
  assert.ok(small.issues.includes('size-class-mismatch'), '超小型体型不该出现 L 档');
  assert.ok(small.issues.includes('over-budget'), '同一条带对吉娃娃必然超预算');
  const smallTotal = must(small.totalWeightG, '吉娃娃这一条应当算得出总重');
  const smallStrap = must(small.strapWeightG, '吉娃娃这一条应当算得出带体克重');
  assert.equal(smallTotal, smallStrap + COLLAR_POD_WEIGHT_G);
  const smallOver = must(small.overByG, '超预算时必须有超出量');
  assert.ok(smallOver > 0);
  for (const reason of small.reasons) {
    assert.ok(reason.length > 0, '理由不能是空字符串');
  }
  assert.ok(
    small.reasons.some((r) => /超预算 \d/.test(r)),
    '超预算的理由里必须写出"超了多少克"',
  );
  assert.ok(
    small.reasons.some((r) => r.includes('2%')),
    '预算规则的出处（体重的 2%）必须写进理由',
  );
});

test('吉娃娃连目录里最轻的一条都超预算，大丹的最轻一条远低于预算', () => {
  const smallLightest = must(lightestStrapFor(chihuahua), '吉娃娃应当至少有一条尺寸上戴得上的组合');
  const largeLightest = must(lightestStrapFor(greatDane), '大丹应当至少有一条尺寸上戴得上的组合');

  const smallBudget = collarBudgetOf(chihuahua).maxWeightG;
  const largeBudget = collarBudgetOf(greatDane).maxWeightG;
  assert.ok(
    smallLightest.totalWeightG > smallBudget,
    `吉娃娃最轻一条 ${smallLightest.totalWeightG} g 仍应超过预算 ${smallBudget} g`,
  );
  assert.ok(
    largeLightest.totalWeightG < largeBudget / 2,
    `大丹最轻一条 ${largeLightest.totalWeightG} g 应远低于预算 ${largeBudget} g`,
  );

  const smallFit = checkStrapFit(chihuahua, smallLightest.selection);
  assert.equal(smallFit.ok, false);
  const over = must(smallFit.overByG, '超预算时必须有超出量');
  assert.ok(over > 0);
  assert.ok(smallFit.reasons.some((r) => /超预算 \d/.test(r)));
});

test('猫的默认档案：标准档通过，加厚皮革档仍然在预算内', () => {
  const ok: StrapSelection = { materialId: 'nylon-webbing', sizeId: 's', gradeId: 'standard' };
  const fit = checkStrapFit(cat, ok);
  assert.equal(fit.ok, true);
  assert.equal(fit.reasons.length, 0, '通过时不该有理由');
  assert.ok(must(fit.totalWeightG, '应当算得出总重') < fit.budgetG);

  const heavy: StrapSelection = { materialId: 'full-grain-leather', sizeId: 's', gradeId: 'heavy' };
  const heavyFit = checkStrapFit(cat, heavy);
  assert.ok(must(heavyFit.totalWeightG, '应当算得出总重') < heavyFit.budgetG);
});

test('尺寸档单独看也自洽：sizeRecommended 只由几何与体型档决定', () => {
  const xs: StrapSelection = { materialId: 'nylon-webbing', sizeId: 'xs', gradeId: 'standard' };
  const l: StrapSelection = { materialId: 'nylon-webbing', sizeId: 'l', gradeId: 'standard' };
  assert.equal(checkStrapFit(chihuahua, xs).sizeRecommended, true, 'XS 适合超小型');
  assert.equal(checkStrapFit(chihuahua, l).sizeRecommended, false, 'L 不适合超小型');
  assert.equal(checkStrapFit(greatDane, l).sizeRecommended, true, 'L 适合超大型');
  assert.equal(checkStrapFit(greatDane, xs).sizeRecommended, false, 'XS 不适合超大型');
  // 与材质无关：换一个已核实的材质，几何判定不该变
  assert.equal(checkStrapFit(chihuahua, { ...xs, materialId: 'silicone' }).sizeRecommended, true);
});
