/**
 * 行为锚点 → 房间坐标的映射。
 *
 * 为什么要有这一层：`@camp/core` 的行为层刻意**不含任何米制坐标**
 * （房间坐标的权威来源是 `layout.ts`，它同时驱动 3D 物件摆放与居家资源清单）。
 * 因此行为层只产出「语义 + 时间」（去哪个锚点、干什么、多久），
 * 由本文件把它落到 `layout.ts` 的真实坐标上，再由 `locomotion.ts` 推进位移。
 *
 * 纪律：本文件**不新增坐标**，一律从 `layout.ts` 的既有常量推导。
 * 一旦在这里手写数字，清单、画面与行为就会开始互相漂移。
 */
import { CAT_ANCHOR_IDS } from '@camp/core';
import type { CatAnchorCapability, CatAnchorSpec } from '@camp/core';
import {
  BED,
  CAT_BED,
  CAT_SHELVES,
  CAT_TREE,
  FOOD_STATION,
  FOUNTAIN,
  HIDING_BOX,
  LITTER_BOXES,
  SOFA,
  WARDROBE,
  WATER_BOWL,
} from '../layout.ts';

export interface CatAnchorPlace extends CatAnchorSpec {
  /** 平面坐标（米）。与 `layout.ts` 同源。 */
  position: { x: number; z: number };
  /** 站在该锚点时猫的朝向（弧度）。猫的建模朝向为 +Z，rotY=0 表示面朝入户方向。 */
  facing: number;
}

/**
 * 朝向常量。
 *
 * 约定（见 `cat-model.ts`）：猫的朝向为 **+Z**（头在 +Z、尾在 -Z），
 * 即 `rotY = 0` 表示面朝 **+Z（南墙 / 入户方向）**。
 * 因此：
 *   - 面朝北墙（窗）= 转过头 → rotY ≈ π
 *   - 面朝西墙 → rotY ≈ +π/2
 *   - 面朝东墙 → rotY ≈ −π/2
 * 这几个值都是从该约定直接推出来的，不是随手取的。
 */
export const FACE = {
  south: 0,
  north: Math.PI,
  west: Math.PI / 2,
  east: -Math.PI / 2,
} as const;

/** 砂盆朝向：A 在西南角、B 在西墙凹位，两处都朝西墙（`layout.ts` 的 rotY 也是 π 与 π/2 同量级）。 */
function litterFacing(index: number): number {
  return index === 0 ? FACE.north : FACE.east;
}

/**
 * 全部锚点。id 取自 core 的 `CAT_ANCHOR_IDS`（跨包契约，单一事实来源），
 * 坐标取自 `layout.ts`。
 */
const PLACES: readonly CatAnchorPlace[] = [
  // 地面锚点：刻意放在**空场**，不压在沙发/床/岛台/猫爬架底座上
  { id: 'floor-living', label: '起居区地面', capabilities: ['floor', 'jump-target'], heightM: 0, position: { x: 1.75, z: -1.05 }, facing: FACE.south },
  { id: 'floor-bedroom', label: '睡眠区地面', capabilities: ['floor', 'jump-target'], heightM: 0, position: { x: -1.3, z: -1.6 }, facing: FACE.east },
  { id: 'floor-kitchen', label: '厨房区地面', capabilities: ['floor', 'jump-target'], heightM: 0, position: { x: 0.4, z: 1.0 }, facing: FACE.south },

  // 猫爬架：一层平台与顶台
  { id: 'tree-platform', label: '猫爬架一层平台', capabilities: ['jump-target', 'vertical'], heightM: 0.72, position: { x: CAT_TREE.x - 0.05, z: CAT_TREE.z - 0.05 }, facing: FACE.north },
  { id: 'tree-top', label: '猫爬架顶台', capabilities: ['vertical', 'sleep', 'jump-target'], heightM: CAT_TREE.topPerchH, position: { x: CAT_TREE.x, z: CAT_TREE.z }, facing: FACE.north },

  // 壁挂跳台（东墙）：坐标与高度直接读 CAT_SHELVES，避免与 3D 物件脱节
  ...CAT_SHELVES.map((shelf, i): CatAnchorPlace => ({
    id: i === 0 ? 'cat-shelf-low' : 'cat-shelf-high',
    label: shelf.label,
    capabilities: ['vertical'],
    heightM: shelf.y,
    position: { x: 3.45, z: shelf.z },
    facing: FACE.west,
  })),

  // 家具面：可以从地面跳上去的落点
  { id: 'wardrobe-top', label: '衣柜顶', capabilities: ['vertical'], heightM: WARDROBE.h, position: { x: WARDROBE.x, z: WARDROBE.z }, facing: FACE.east },
  { id: 'bed-top', label: '床面', capabilities: ['sleep', 'jump-target'], heightM: BED.frameH + BED.mattressH, position: { x: BED.x, z: BED.z }, facing: FACE.east },
  { id: 'sofa-top', label: '沙发面', capabilities: ['sleep', 'jump-target'], heightM: 0.42, position: { x: SOFA.x, z: SOFA.z }, facing: FACE.east },

  // 躲藏点（需要锚点的行为会走到这里）
  { id: 'cat-bed', label: '封闭式猫窝', capabilities: ['sleep', 'hide'], heightM: CAT_BED.h * 0.17, position: { x: CAT_BED.x, z: CAT_BED.z }, facing: FACE.south },
  { id: 'hiding-box', label: '纸箱躲藏处', capabilities: ['hide'], heightM: HIDING_BOX.h * 0.05, position: { x: HIDING_BOX.x, z: HIDING_BOX.z }, facing: FACE.west },

  // 资源点：猫停在**物件前方**而不是物件中心——否则猫会站进碗里/砂盆里
  { id: 'food-bowls', label: '食盆', capabilities: ['food'], heightM: 0, position: { x: FOOD_STATION.x, z: FOOD_STATION.z + 0.42 }, facing: FACE.north },
  { id: 'fountain', label: '饮水机', capabilities: ['water'], heightM: 0, position: { x: FOUNTAIN.x, z: FOUNTAIN.z + 0.4 }, facing: FACE.north },
  { id: 'water-bowl', label: '第二水碗', capabilities: ['water'], heightM: 0, position: { x: WATER_BOWL.x, z: WATER_BOWL.z + 0.35 }, facing: FACE.south },
  ...LITTER_BOXES.map((box, i): CatAnchorPlace => ({
    id: box.id,
    label: `猫砂盆 ${i === 0 ? 'A' : 'B'}`,
    capabilities: ['litter'],
    heightM: 0,
    // 入口在砂盆前方（砂盆贴墙，中心点会把猫摆进墙里）
    position: { x: box.x + (i === 0 ? 0.55 : 0.62), z: box.z },
    facing: litterFacing(i),
  })),
];

const byId: ReadonlyMap<string, CatAnchorPlace> = new Map(PLACES.map((p) => [p.id, p]));

export const CAT_ANCHOR_PLACES: readonly CatAnchorPlace[] = PLACES;

export function anchorPlace(id: string): CatAnchorPlace | undefined {
  return byId.get(id);
}

/** 传给行为引擎的锚点规范（去掉坐标，只留语义与高度）。 */
export const CAT_ANCHOR_SPECS: readonly CatAnchorSpec[] = PLACES.map((p) => ({
  id: p.id,
  label: p.label,
  capabilities: [...p.capabilities] as CatAnchorCapability[],
  heightM: p.heightM,
}));

/** 供自检与文档核对：本表是否覆盖了 core 契约里的全部 id。 */
export function missingAnchorIds(): string[] {
  return CAT_ANCHOR_IDS.filter((id) => !byId.has(id));
}
