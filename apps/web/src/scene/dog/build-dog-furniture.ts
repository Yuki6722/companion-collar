/**
 * 狗版家居场景的**客厅 + 卧室 + 陈设**：日式温暖风格（浅橡木 / 米灰布面 / 低矮方正 / 克制陈设）。
 *
 * 与猫版 `../build-furniture.ts` 是同一条纪律的两份实现，做法照搬、数字全部换掉：
 *   - **扫描模型**（圆茶几 / 边柜 / 绿植 / 吊灯）负责「看起来是真家具」；
 *   - **程序化家具**负责两件事：① 资产没到货或加载失败时房间依然完整（绝不出现空洞）；
 *     ② 形状简单但尺寸必须精确的常驻件（低台床、床头柜、衣柜、电视柜与壁挂电视、
 *     地毯、置物架、落地灯、沙发、挂画）。
 *
 * 三条狗版独有的取舍，写在这里免得以后被"优化"掉：
 *   1. **所有锚点坐标一律从 `./layout-dog.ts` 导入**，本文件里只允许出现"局部细节偏移"
 *      （比如靠垫从座面缩进 0.1 m）。房间比猫版大（9.6 × 7.0 × 3.0），
 *      抄数字的那份实现迟早会和 `FOOTPRINTS` 审计判定打架。
 *   2. **床的轴向沿用猫版约定**：`widthX` 沿世界 X、`lengthZ` 沿世界 Z，
 *      于是"床头贴西墙"等价于床头板放在 **x 较小**的一侧 —— 与 `BED` 的注释一致。
 *   3. **挂画绕开两扇窗与电视**：西墙 z ∈ [-2.7, -0.7]、东墙 z ∈ [-3.3, -1.9] 是洞口，
 *      东墙剩下的实墙又被电视（z ∈ [-0.43, 1.43]）占满，所以亮面只交给北墙与南墙，
 *      东墙留白 —— 留白本来就是日式陈设的一部分，比硬塞一幅画更"对"。
 */
import * as THREE from 'three';
import {
  BED,
  COFFEE_TABLE,
  FLOOR_LAMP,
  HALF_D,
  HALF_W,
  ISLAND,
  NIGHTSTAND,
  PLANT,
  ROOM,
  RUG,
  SHELF_UNIT,
  SOFA,
  TV,
  TV_CABINET,
  WARDROBE,
} from './layout-dog.ts';
import type { MaterialLibrary } from '../materials.ts';
import { addMesh, box, cylinder, group, roundedBox } from '../util.ts';

export interface DogModelPlacement {
  /** 与 `assets.ts` 的 MODEL_MANIFEST id 对应 */
  id: string;
  x: number;
  z: number;
  rotY: number;
  /** 目标最大水平尺寸（米）：把扫描件缩放到与狗版房间相符的尺度 */
  fitTo: number;
  /** 底部离地高度（吊灯之类需要挂起来） */
  y?: number;
  /** 低画质档可省的装饰件 */
  decorative?: boolean;
}

/**
 * 扫描模型的目标位置与尺度。
 *
 * 尺度依据：狗版房间比猫版大一圈（9.6 × 7.0 vs 7.2 × 5.6），
 * 所以同一批 CC0 资产的 `fitTo` 同步放大（茶几 0.95→1.05、边柜 1.6→1.8），
 * 否则"大房间里摆小家具"会立刻读出不协调。`rotY` 依各模型原始朝向定，最终以截图核对为准。
 */
export const DOG_MODEL_PLACEMENTS: ReadonlyArray<DogModelPlacement> = [
  { id: 'coffeeTable', x: COFFEE_TABLE.x, z: COFFEE_TABLE.z, rotY: 0, fitTo: 1.05 },
  { id: 'sideboard', x: TV_CABINET.x, z: TV_CABINET.z, rotY: -Math.PI / 2, fitTo: 1.8 },
  { id: 'plant', x: PLANT.x, z: PLANT.z, rotY: 0.5, fitTo: 1.05, decorative: true },
  { id: 'pendant', x: ISLAND.x, z: ISLAND.z, rotY: 0, fitTo: 0.6, y: 1.85, decorative: true },
];

/**
 * 沙发朝向：本地 +Z 转到世界 +X，也就是**正对东墙的壁挂电视**。
 * 绕 Y 转 +90° 时，`R_y(π/2)` 把 (0,0,1) 映到 (1,0,0) —— 与 `layout-dog.ts` 里
 * "沙发面向东墙电视"这条注释互为核对。
 */
const SOFA_FACING = Math.PI / 2;

export interface DogFurnitureResult {
  /** 各扫描模型对应的程序化占位组；模型到货后隐藏 */
  placeholders: Map<string, THREE.Group>;
}

export function buildDogFurniture(root: THREE.Group, mats: MaterialLibrary): DogFurnitureResult {
  const g = group('dog-furniture');
  root.add(g);
  const placeholders = new Map<string, THREE.Group>();

  buildBed(g, mats);
  buildNightstand(g, mats);
  buildWardrobe(g, mats);
  buildModernShelf(g, mats);
  buildModernSofa(g, mats);
  // 电视柜是「边柜」扫描模型的占位件：先用程序化柜体，模型到货后整组替换
  placeholders.set('sideboard', buildTvWall(g, mats));
  buildRug(g, mats);
  buildFloorLamp(g, mats);
  buildWallArt(g, mats);

  for (const placement of DOG_MODEL_PLACEMENTS) {
    const placeholder = buildPlaceholder(placement.id, mats);
    if (!placeholder) continue;
    // 与真模型**同位置同朝向**：替换的瞬间不该有任何位移或转身
    placeholder.position.set(placement.x, placement.y ?? 0, placement.z);
    placeholder.rotation.y = placement.rotY;
    placeholder.name = `placeholder-${placement.id}`;
    g.add(placeholder);
    placeholders.set(placement.id, placeholder);
  }

  return { placeholders };
}

// ---------------------------------------------------------------- 程序化家具

/**
 * 日式低台床：框架 + 四角床腿 + 床头板 + 床垫 + 被子 + 两只枕头。
 *
 * 为什么框架只有 0.30 高、床腿只露 0.14：这是低台床的语言 —— 重心贴地、床面接近坐姿高度，
 * 房间层高 3.0 m 时低床反而显得空间大。床垫与被子各留一点内缩（0.08 / 0.06），
 * 让软体看起来是**搭在**框架上而不是与木框齐平（齐平会读成一块实心方箱）。
 */
function buildBed(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('bed');
  parent.add(g);
  const wood = mats.plain('woodWarm');
  const bedding = mats.plain('bedding');
  const duvetMat = mats.plain('cushion');
  const frameH = BED.frameH;

  addMesh(g, box(BED.widthX, frameH, BED.lengthZ, wood), BED.x, frameH / 2, BED.z, { name: 'bed-frame' });
  // 四角床腿：从框架边缘内缩 0.1（缩进去才看得到"腿"这一段，齐边就会被框架完全盖住）
  for (const [dx, dz] of [
    [-BED.widthX / 2 + 0.1, -BED.lengthZ / 2 + 0.1],
    [BED.widthX / 2 - 0.1, -BED.lengthZ / 2 + 0.1],
    [-BED.widthX / 2 + 0.1, BED.lengthZ / 2 - 0.1],
    [BED.widthX / 2 - 0.1, BED.lengthZ / 2 - 0.1],
  ] as const) {
    addMesh(g, box(0.08, 0.14, 0.08, wood), BED.x + dx, 0.07, BED.z + dz, { name: 'bed-leg' });
  }

  // 床头板：贴西墙 = x 较小的一侧。0.62 高是"能靠、但不抢戏"的高度（人靠坐时刚好过肩）
  addMesh(
    g,
    roundedBox(0.08, 0.62, BED.lengthZ * 0.98, 0.03, wood),
    BED.x - BED.widthX / 2 - 0.04,
    0.42,
    BED.z,
    { name: 'bed-headboard' },
  );

  // 床垫：0.26 厚，四边缩进 0.08
  addMesh(
    g,
    roundedBox(BED.widthX - 0.08, BED.mattressH, BED.lengthZ - 0.08, 0.04, bedding),
    BED.x,
    frameH + BED.mattressH / 2,
    BED.z,
    { name: 'bed-mattress' },
  );

  // 被子：只盖 62% 的长度，剩下的长度留给枕头。这一条"留白"是床看起来像床的关键
  addMesh(
    g,
    roundedBox(BED.widthX - 0.06, 0.12, BED.lengthZ * 0.62, 0.05, duvetMat),
    BED.x + 0.06,
    frameH + BED.mattressH + 0.06,
    BED.z + BED.lengthZ * 0.16,
    { name: 'bed-duvet' },
  );

  // 两只枕头：沿世界 Z 前后排（床的短边方向），贴着床头板那一侧
  for (const dz of [-0.42, 0.42]) {
    addMesh(
      g,
      roundedBox(BED.widthX * 0.62, 0.14, 0.5, 0.07, bedding),
      BED.x - BED.widthX * 0.16,
      frameH + BED.mattressH + 0.09,
      BED.z + dz,
      { name: 'bed-pillow' },
    );
  }
}

/**
 * 床头边几 + 台灯（含一盏暖色 PointLight）。
 *
 * 位置依据：边几在床的**南侧**、贴西墙 —— `BED` 的南边缘是 z = -0.45，
 * 边几 0.46 深，中心 z = -0.05 正好让北边缘落在 -0.28，与床留 0.17 m 的伸手缝，
 * 又不与衣柜（z 从 0.5 起）打架。台灯点光源参数照猫版（3.2 / 3.4）：这是**阅读灯**，
 * 只该照亮床头一小片，照太远会把"夜里只开一盏床头灯"的氛围冲掉。
 */
function buildNightstand(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('nightstand');
  parent.add(g);
  const seed = NIGHTSTAND;
  const wood = mats.plain('woodLight');
  const metal = mats.plain('metalDark');

  addMesh(g, roundedBox(seed.w, seed.h, seed.w, 0.02, wood), seed.x, seed.h / 2, seed.z, {
    name: 'nightstand-body',
  });

  addMesh(g, cylinder(0.05, 0.07, 0.04, metal, 16), seed.x, seed.h + 0.02, seed.z, { name: 'lamp-base' });
  addMesh(g, cylinder(0.012, 0.012, 0.22, metal, 10), seed.x, seed.h + 0.13, seed.z, { name: 'lamp-stem' });
  // 开口朝下的锥台灯罩（openEnded）：从床上看进去能看到灯口，而不是一顶实心帽子
  addMesh(
    g,
    new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.16, 18, 1, true), mats.plain('ceramic')),
    seed.x,
    seed.h + 0.32,
    seed.z,
    { name: 'lamp-shade', receive: false },
  );

  const bulb = new THREE.PointLight(0xffd9a8, 3.2, 3.4, 2);
  // 光源放进灯罩内部（比灯罩中心低 0.02），这样灯罩的轮廓会被自己打亮
  bulb.position.set(seed.x, seed.h + 0.3, seed.z);
  bulb.name = 'lamp-point-light';
  g.add(bulb);
}

/**
 * 衣柜：贴西墙、位于床与厨房之间。
 *
 * 门缝与拉手做在 `x + depthX/2` 一侧 —— 衣柜是背靠西墙（x = -4.8）站的，
 * 柜门自然开在朝屋内的那一面（+X）。2.35 高不到顶：留 0.65 m 的墙，
 * 顶部不封板是日式收纳的常见处理，也让 3.0 m 的层高显得更高。
 */
function buildWardrobe(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('wardrobe');
  parent.add(g);
  const wood = mats.plain('woodLight');
  const dark = mats.plain('metalDark');

  addMesh(
    g,
    roundedBox(WARDROBE.depthX, WARDROBE.h, WARDROBE.widthZ, 0.02, wood),
    WARDROBE.x,
    WARDROBE.h / 2,
    WARDROBE.z,
    { name: 'wardrobe-body' },
  );
  // 两扇门的分缝：0.014 宽的深色薄片贴在柜门上，比"留几何缝"便宜且不会漏光
  addMesh(
    g,
    box(0.014, WARDROBE.h - 0.16, 0.012, dark),
    WARDROBE.x + WARDROBE.depthX / 2 + 0.005,
    WARDROBE.h / 2,
    WARDROBE.z,
    { name: 'wardrobe-seam', cast: false },
  );
  // 两个拉手：分缝两侧各一个，间距 0.18 正好是一握的宽度
  for (const dz of [-0.09, 0.09]) {
    addMesh(
      g,
      box(0.03, 0.32, 0.03, dark),
      WARDROBE.x + WARDROBE.depthX / 2 + 0.03,
      1.15,
      WARDROBE.z + dz,
      { name: 'wardrobe-handle' },
    );
  }
}

/**
 * 电视墙：程序化柜体（作为 `sideboard` 扫描模型的**占位件**）+ 壁挂电视 + 屏幕面 + 柜上摆件。
 *
 * 两处朝向依据：
 *   - 屏幕朝 **-X**（屋内的方向）：`PlaneGeometry` 默认法线是 +Z，绕 Y 转 -90° 后
 *     法线变成 -X，于是从沙发上（x = 1.3 一带）看过去正是正面；
 *   - 柜门分缝同样做在 **-X** 一侧，与电视同侧，朝向沙发。
 *
 * 本组返回柜体本身（`placeholder-sideboard`），因为**扫描模型替换的是柜子、不是电视**；
 * 电视与摆件挂在 `tv-wall` 组上，模型到货后依然留着。
 */
function buildTvWall(parent: THREE.Group, mats: MaterialLibrary): THREE.Group {
  const g = group('tv-wall');
  parent.add(g);
  const wood = mats.plain('woodDark');
  const screen = mats.plain('screen');
  const dark = mats.plain('plasticDark');

  const cabinet = group('placeholder-sideboard');
  g.add(cabinet);
  addMesh(cabinet, roundedBox(TV_CABINET.depthX, TV_CABINET.h, TV_CABINET.widthZ, 0.02, wood), 0, TV_CABINET.h / 2, 0, {
    name: 'tv-cabinet',
  });
  addMesh(
    cabinet,
    box(0.012, TV_CABINET.h - 0.14, TV_CABINET.widthZ - 0.1, dark),
    -TV_CABINET.depthX / 2 - 0.005,
    TV_CABINET.h / 2,
    0,
    { name: 'tv-cabinet-seam', cast: false },
  );
  // 占位组落到锚点上；里面的构件因此都用局部坐标（0,0,0 为中心）
  cabinet.position.set(TV_CABINET.x, 0, TV_CABINET.z);

  // 壁挂电视：面板 0.05 厚，贴在东墙上；y = 1.5 是坐姿视线略高一点的高度
  addMesh(g, box(0.05, TV.height, TV.widthZ, dark), TV.x, TV.y, TV.z, { name: 'tv-body' });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(TV.widthZ - 0.04, TV.height - 0.04), screen);
  panel.rotation.y = -Math.PI / 2;
  panel.position.set(TV.x - 0.028, TV.y, TV.z);
  panel.name = 'tv-screen';
  g.add(panel);

  // 柜上陈设：一叠书（三种书脊色循环）+ 一对陶碗。
  // 书朝南放（贴 `TV_CABINET.z - widthZ*0.3`），把柜面北段留空 —— 日式陈设的"一侧留白"
  const cabinetBooks = [mats.plain('bookA'), mats.plain('bookB'), mats.plain('bookA')] as const;
  for (const [i, mat] of cabinetBooks.entries()) {
    addMesh(g, box(0.16, 0.035, 0.22, mat), TV_CABINET.x, TV_CABINET.h + 0.02 + i * 0.035, TV_CABINET.z - TV_CABINET.widthZ * 0.3, {
      name: `tv-book-${i}`,
    });
  }
  for (const [i, dz] of [0.4, 0.5].entries()) {
    addMesh(
      g,
      new THREE.Mesh(new THREE.SphereGeometry(0.07 + i * 0.015, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.plain('ceramic')),
      TV_CABINET.x - 0.04,
      TV_CABINET.h + 0.02,
      TV_CABINET.z + dz,
      { name: `tv-bowl-${i}` },
    );
  }
  return cabinet;
}

/**
 * 地毯：贴地平面 + 一层薄垫。
 *
 * 用 `PlaneGeometry` 而不是薄盒体，是猫版就定下的做法：地毯是**贴地装饰**
 * （`FOOTPRINTS` 里 kind = 'flat'），不参与"挡道"判定，因此不需要厚度去撑体积感；
 * 0.006 的抬升刚好压住地板纹理的 z-fighting。
 *
 * 尺寸依据：3.4 × 3.4 覆盖沙发（x 0.81 起）到茶几（x 3.3 止）整段，
 * 前缘离电视柜还有约 1 m 的通道 —— 地毯铺到柜子脚下会把客厅读成"塞满"。
 */
function buildRug(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('rug');
  parent.add(g);
  const fabric = mats.plain('rug');
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(RUG.w, RUG.d), fabric);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(RUG.x, 0.006, RUG.z);
  rug.receiveShadow = true;
  rug.name = 'rug-surface';
  g.add(rug);
  // 薄垫：不投影、不接收，纯粹给地毯一点"厚度"，免得读成贴纸
  addMesh(g, box(RUG.w, 0.012, RUG.d, fabric), RUG.x, 0.006, RUG.z, {
    name: 'rug-pad',
    cast: false,
    receive: false,
  });
}

/**
 * 落地灯（含一盏暖色 PointLight），放在推拉门东侧的玻璃前。
 *
 * 灯罩上沿 1.75、光源 1.55：比坐姿视线略高，光从上方压下来而不是直射眼睛；
 * 9 / 6.5 的功率与半径照猫版 —— 这是全屋唯一的"氛围主光"，
 * 但和床头灯一样是**克制**的：狗版场景整体由 HDRI 环境光供亮，灯只补一层暖调。
 */
function buildFloorLamp(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('floor-lamp');
  parent.add(g);
  const metal = mats.plain('metalDark');
  const shade = mats.plain('ceramic');

  addMesh(g, cylinder(0.16, 0.18, 0.03, metal, 20), FLOOR_LAMP.x, 0.015, FLOOR_LAMP.z, { name: 'lamp-foot' });
  addMesh(g, cylinder(0.018, 0.018, 1.5, metal, 12), FLOOR_LAMP.x, 0.78, FLOOR_LAMP.z, { name: 'lamp-pole' });
  addMesh(
    g,
    new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.26, 22, 1, true), shade),
    FLOOR_LAMP.x,
    1.62,
    FLOOR_LAMP.z,
    { name: 'lamp-shade', receive: false },
  );

  const light = new THREE.PointLight(0xffd2a0, 9, 6.5, 2);
  light.position.set(FLOOR_LAMP.x, 1.55, FLOOR_LAMP.z);
  light.name = 'floor-lamp-light';
  g.add(light);
}

/**
 * 现代简约置物架（程序化常驻件）。
 *
 * 为什么不用 CC0 扫描件（与猫版同一判断）：Poly Haven 的两个开架都是做旧的灰蓝金属/风化木，
 * 放进这套浅橡木里最扎眼。开架的形状极简单 —— 薄侧板 + 薄隔板 —— 程序化反而完全可控。
 *
 * 陈设刻意**不满摆**：三成隔板放书、一格放平摞的书与陶碗，其余留空。
 * 日式陈设的密度靠"空"来衬，摆满会立刻变成杂货铺。
 */
function buildModernShelf(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('shelf-unit');
  parent.add(g);
  const oak = mats.plain('woodLight');
  const { x, z, depthX, widthZ, h } = SHELF_UNIT;
  const panel = 0.026;
  const levels = 4;
  const shelfY = (i: number): number => 0.08 + (i * (h - 0.16)) / levels;

  // 两块薄侧板：不做背板，保持通透（背板会把东墙的高窗挡掉一半）
  for (const dz of [-widthZ / 2 + panel / 2, widthZ / 2 - panel / 2]) {
    addMesh(g, box(depthX, h, panel, oak), 0, h / 2, dz, { name: 'shelf-side' });
  }
  // 五块隔板（含顶底）：0.022 厚，比侧板薄一线，视觉上"层"比"框"轻
  for (let i = 0; i <= levels; i++) {
    addMesh(g, box(depthX - 0.01, 0.022, widthZ - panel * 2 - 0.01, oak), 0, shelfY(i), 0, {
      name: `shelf-board-${i}`,
    });
  }

  // 竖立的书：书脊朝外（-X），高度按 (i*7)%5 做轻微错落，避免整齐得像砖墙
  const spines = [mats.plain('bookA'), mats.plain('bookB'), mats.plain('bookC')] as const;
  const rows: ReadonlyArray<{ level: number; startZ: number; count: number }> = [
    { level: 1, startZ: -0.34, count: 7 },
    { level: 2, startZ: 0.04, count: 5 },
    { level: 3, startZ: -0.2, count: 6 },
  ];
  for (const row of rows) {
    const y = shelfY(row.level);
    for (let i = 0; i < row.count; i++) {
      // noUncheckedIndexedAccess：下标取出来的可能是 undefined，必须判空
      const mat = spines[(row.level + i) % spines.length];
      if (!mat) continue;
      const bookH = 0.21 + ((i * 7) % 5) * 0.012;
      addMesh(
        g,
        box(0.15, bookH, 0.03 + ((i * 3) % 3) * 0.006, mat),
        0.005,
        y + 0.011 + bookH / 2,
        row.startZ + i * 0.042,
        { name: 'shelf-book' },
      );
    }
  }

  // 第三层：平摞的书 + 一只陶碗（两种"非书"的陈设，让架子不只剩书脊的竖线）
  const flat = mats.plain('bookB');
  for (let i = 0; i < 3; i++) {
    addMesh(g, box(0.16, 0.026, 0.22, flat), 0, shelfY(3) + 0.024 + i * 0.026, 0.3, { name: 'shelf-book-flat' });
  }
  addMesh(
    g,
    // 半球（phiStart 0 → phiLength π 的下半球）就是一个碗的形体，比"圆柱 + 掏空"便宜得多
    new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      mats.plain('ceramic'),
    ),
    0,
    shelfY(2) + 0.075,
    -0.36,
    { name: 'shelf-bowl' },
  );

  g.position.set(x, 0, z);
}

/**
 * 现代简约布艺沙发（程序化常驻件）。
 *
 * 为什么不用 CC0 扫描件（照猫版的判断）：库里的四个沙发全是复古款，
 * 与浅橡木/柚木的柜体放不到一起。而沙发的形体本来就是"低矮方正的软体块"，
 * 程序化能把它控制到与柜体同一套语言：米灰布面、方正座块与靠垫、细金属脚。
 *
 * 尺寸全部**由 `SOFA` 现场派生**（本地 X = 沙发宽度 = `widthZ = 2.7`，
 * 本地 Z = 坐深 = `depthX = 0.98`）：猫版那套 ±0.7 的硬编码块位在 2.7 m 宽上
 * 会让三块座垫之间裂出两道大缝，所以按宽度均分再留细缝。
 *
 * 本地朝向：**前面朝 +Z**，再绕 Y 转 `SOFA_FACING`（+90°）正对东墙电视。
 */
function buildModernSofa(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('sofa');
  const fabric = mats.plain('sofaFabric');
  const legMat = mats.plain('metalDark');
  const pillowA = mats.plain('cushion');
  const pillowB = mats.plain('rug');

  const widthX = SOFA.widthZ; // 2.7：本地 X 是沙发宽度，旋转后沿世界 Z
  const depthZ = SOFA.depthX; // 0.98：本地 Z 是坐深，旋转后沿世界 X
  const halfW = widthX / 2;

  // 细金属脚：0.12 高。脚一细一短，整个沙发才有"低矮款"的比例
  for (const [dx, dz] of [
    [-halfW + 0.14, -depthZ / 2 + 0.12],
    [halfW - 0.14, -depthZ / 2 + 0.12],
    [-halfW + 0.14, depthZ / 2 - 0.12],
    [halfW - 0.14, depthZ / 2 - 0.12],
  ] as const) {
    addMesh(g, cylinder(0.022, 0.022, 0.12, legMat, 14), dx, 0.06, dz, { name: 'sofa-leg' });
  }

  // 基座：方正一块，中心比座垫**后移**，座垫因此微微探出基座前缘，看着更松软
  addMesh(g, roundedBox(widthX, 0.2, depthZ, 0.03, fabric), 0, 0.22, 0.015, { name: 'sofa-base' });

  // 三块座垫：均分宽度，每块之间留 ~0.1 的细缝（现代款的标志性做法）。
  // 中间那块略靠前 0.01，打破三条完全平行的横线
  const seatSplit = widthX / 3 - 0.02;
  const seatOffset = widthX / 3 - 0.02;
  for (const [i, dx] of [-seatOffset, 0, seatOffset].entries()) {
    addMesh(
      g,
      roundedBox(seatSplit, 0.17, depthZ - 0.14, 0.055, fabric),
      dx,
      0.4,
      0.05 + (i === 1 ? 0.01 : 0),
      { name: `sofa-seat-${i}` },
    );
  }

  // 靠背：矮而平的一块，上沿到 0.74 —— 低矮沙发的"矮"就矮在这里，不靠缩短坐深
  addMesh(g, roundedBox(widthX, 0.42, 0.16, 0.03, fabric), 0, 0.53, -depthZ / 2 + 0.08, { name: 'sofa-back' });
  // 三块靠背垫：比座垫窄一线，并向后仰 0.1 rad，读起来是"松散的靠垫"而不是砌起来的砖
  const backOffset = widthX / 3 - 0.14;
  for (const [i, dx] of [-backOffset, 0, backOffset].entries()) {
    const cushion = addMesh(
      g,
      roundedBox(seatSplit - 0.04, 0.34, 0.15, 0.055, fabric),
      dx,
      0.54,
      -depthZ / 2 + 0.22,
      { name: `sofa-back-cushion-${i}` },
    );
    cushion.rotation.x = -0.1;
  }

  // 扶手：与座面齐平的矮方块，比坐深略窄（0.04）以露出基座的边线
  for (const sx of [-1, 1]) {
    addMesh(g, roundedBox(0.16, 0.3, depthZ - 0.04, 0.03, fabric), sx * (halfW - 0.08), 0.47, 0.015, {
      name: 'sofa-arm',
    });
  }

  // 两只抱枕：一暖（cushion 驼色）一浅（rug），靠近两端扶手并各转一点角度
  const pillowA0 = addMesh(g, roundedBox(0.4, 0.36, 0.14, 0.07, pillowA), -0.84, 0.62, -0.21, {
    name: 'sofa-pillow-a',
  });
  pillowA0.rotation.y = 0.16;
  const pillowB0 = addMesh(g, roundedBox(0.36, 0.32, 0.13, 0.07, pillowB), 0.88, 0.6, -0.21, {
    name: 'sofa-pillow-b',
  });
  pillowB0.rotation.y = -0.14;

  // 整组落到锚点再转身：所有构件仍在布局给出的占地矩形内（±widthZ/2、±depthX/2）
  g.position.set(SOFA.x, 0, SOFA.z);
  g.rotation.y = SOFA_FACING;
  parent.add(g);
}

// ---------------------------------------------------------------- 扫描模型的占位件

/**
 * 占位件与真模型**同位置同朝向**，加载成功后直接隐藏。
 * 这样首屏（或资产失败时）看到的是完整的房间，而不是缺口。
 *
 * `sideboard` 的占位件不在这里：它就是程序化的电视柜本体（见 `buildTvWall`）；
 * 沙发与置物架是程序化常驻件（见 `buildModernSofa` / `buildModernShelf`），永远不替换。
 */
function buildPlaceholder(id: string, mats: MaterialLibrary): THREE.Group | null {
  switch (id) {
    case 'coffeeTable':
      return placeholderCoffeeTable(mats);
    case 'plant':
      return placeholderPlant(mats);
    case 'pendant':
      return placeholderPendant(mats);
    default:
      return null;
  }
}

/** 圆茶几占位件：φ0.9 的圆面（对应 `fitTo = 1.05`）+ 中柱 + 圆盘底座。 */
function placeholderCoffeeTable(mats: MaterialLibrary): THREE.Group {
  const g = group('coffee-table');
  const r = 0.45;
  const h = COFFEE_TABLE.h;
  addMesh(g, cylinder(r, r, 0.05, mats.plain('woodWarm'), 32), 0, h - 0.025, 0, { name: 'coffee-table-top' });
  addMesh(g, cylinder(0.05, 0.05, h - 0.05, mats.plain('metalDark'), 16), 0, (h - 0.05) / 2, 0, {
    name: 'coffee-table-stem',
  });
  addMesh(g, cylinder(0.24, 0.26, 0.03, mats.plain('metalDark'), 24), 0, 0.015, 0, { name: 'coffee-table-base' });
  return g;
}

/**
 * 盆栽占位件：陶盆 + 短干 + 九团叶球。
 *
 * 比猫版大一号（盆半径 0.22 对 `PLANT.r = 0.3`，叶团最高到 y ≈ 1.1）：
 * `fitTo = 1.05` 的扫描件放进来就是这个量级，占位件若矮一半，
 * 模型到货时植物会"突然长高"，反而露馅。
 */
function placeholderPlant(mats: MaterialLibrary): THREE.Group {
  const g = group('plant');
  addMesh(g, cylinder(0.22, 0.17, 0.34, mats.plain('terracotta'), 20), 0, 0.17, 0, { name: 'plant-pot' });
  addMesh(g, cylinder(0.025, 0.05, 0.34, mats.plain('woodDark'), 10), 0, 0.5, 0, { name: 'plant-trunk' });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = 0.18 + (i % 3) * 0.07;
    addMesh(
      g,
      new THREE.Mesh(new THREE.SphereGeometry(0.18 + (i % 2) * 0.06, 14, 10), mats.plain('leaf')),
      Math.cos(a) * r,
      0.78 + (i % 4) * 0.14,
      Math.sin(a) * r,
      { name: 'plant-leaf' },
    );
  }
  return g;
}

/**
 * 吊灯占位件：挂在岛台正上方（`y = 1.85` 是模型落位的底部）。
 *
 * 灯线从天花板（3.0）垂到灯口，所以长度取 3.0 - 1.85 = 1.15，中心在局部 y = 0.575。
 * **刻意不放点光源**：占位件会被真模型替换掉，光若挂在上面，
 * 替换的一瞬间厨房会闪一下暗（该处补光由场景统一提供）。
 */
function placeholderPendant(mats: MaterialLibrary): THREE.Group {
  const g = group('pendant');
  const metal = mats.plain('metalDark');
  const ceilingY = ROOM.height;
  const bottomY = 1.85;
  const cordLen = ceilingY - bottomY;
  addMesh(g, cylinder(0.006, 0.006, cordLen, metal, 8), 0, cordLen / 2, 0, { name: 'pendant-cord', cast: false });
  addMesh(g, new THREE.Mesh(new THREE.SphereGeometry(0.17, 22, 16), mats.plain('ceramic')), 0, 0.02, 0, {
    name: 'pendant-shade',
  });
  return g;
}

// ---------------------------------------------------------------- 挂画

/** 挂画的三种朝向：北墙 / 西墙 / 南墙各一幅。 */
type WallAxis = 'north' | 'west' | 'south';

interface WallArtSpec {
  name: string;
  axis: WallAxis;
  /** 沿墙轴的世界坐标（北/南墙是 x，西墙是 z） */
  along: number;
  /** 画心离地高度 */
  y: number;
  /** 画布宽（沿墙）与高 */
  w: number;
  h: number;
  frame: THREE.Material;
  canvas: THREE.Material;
}

/**
 * 挂画：在**不含窗的墙面**上各挂一幅，尺寸统一克制到 0.9 × 0.68。
 *
 * 为什么只挂北墙 x ≈ 4.1、南墙 x = -4.0、西墙床头这三处：
 *   - 北墙可用实墙只有两端（窗洞 x ∈ [-3.8, -1.6]、推拉门 x ∈ [-0.8, 3.4]），
 *     东端 x ∈ [3.4, 4.8] 里去掉贴边余量只剩 x ≈ 4.1 这一段；画心 4.1、半宽 0.45
 *     → 占 [3.65, 4.55]，两端都留够余量；
 *   - 东墙**放弃**：高窗占了 z ∈ [-3.3, -1.9]，剩下 z ∈ [-1.9, 3.5] 的实墙又被
 *     电视（z ∈ [-0.43, 1.43]）和置物架（z ∈ [1.65, 3.15]）夹住，
 *     塞画只能塞进 0.45 m 的缝 —— 与其硬塞，不如留白（日式陈设本来靠空来衬）；
 *   - 西墙窗洞 z ∈ [-2.7, -0.7] 正好压在床头上，所以画挂在**床头板正上方**：
 *     画心 z = BED.z，y = 2.0，画的下沿 1.66 高于床头板上沿 0.73，不打架也不压窗。
 *
 * 这里不旋转任何网格：画框与画心都直接用**轴对齐盒体**（北/南墙的画是"薄在 Z 上"的板，
 * 西墙的画是"薄在 X 上"的板），朝向由几何本身决定。少一次旋转就少一个能写错的地方。
 */
function buildWallArt(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('wall-art');
  parent.add(g);
  const frameMat = mats.plain('woodDark');

  const arts: readonly WallArtSpec[] = [
    {
      name: 'art-north',
      axis: 'north',
      along: 4.1,
      y: 1.75,
      w: 0.9,
      h: 0.68,
      frame: frameMat,
      canvas: mats.plain('bookB'),
    },
    {
      name: 'art-west',
      axis: 'west',
      along: BED.z,
      y: 2.0,
      w: 0.68,
      h: 0.9,
      frame: frameMat,
      canvas: mats.plain('cushion'),
    },
    {
      name: 'art-south',
      axis: 'south',
      along: -4.0,
      y: 1.85,
      w: 0.9,
      h: 0.68,
      frame: frameMat,
      canvas: mats.plain('bookC'),
    },
  ];

  for (const spec of arts) {
    const art = group(spec.name);
    const frameT = 0.03;
    const canvasT = 0.01;
    // 画框**背面贴墙**：中心离墙 = 半个框厚，再往屋内推 `gap` 就与墙脱开（脱开会被看出悬空）
    const frameCenter = frameT / 2;
    // 画心压在画框前面 0.012：两层错开是防共面闪烁的标准做法（与墙不平齐、与框也不平齐）
    const canvasCenter = frameT + canvasT / 2 + 0.002;
    // 该幅画所在的墙面平面：北墙 z = -HALF_D、南墙 z = +HALF_D、西墙 x = -HALF_W
    const wallAt = spec.axis === 'north' ? -HALF_D : spec.axis === 'south' ? HALF_D : -HALF_W;
    // 沿墙坐标 u + 离墙距离 d（>0 = 朝屋内）→ 世界坐标
    const put = (u: number, y: number, d: number): [number, number, number] => {
      // 北墙的屋内方向是 +Z，南墙是 -Z，西墙是 +X
      if (spec.axis === 'north') return [u, y, wallAt + d];
      if (spec.axis === 'south') return [u, y, wallAt - d];
      return [wallAt + d, y, u];
    };
    // 北/南墙的画沿世界 X 展开（宽 = spec.w），西墙的画沿世界 Z 展开
    const alongX = spec.axis !== 'west';

    addMesh(
      art,
      alongX ? box(spec.w, spec.h, frameT, spec.frame) : box(frameT, spec.h, spec.w, spec.frame),
      ...put(spec.along, spec.y, frameCenter),
      { name: `${spec.name}-frame`, cast: false },
    );
    addMesh(
      art,
      alongX
        ? box(spec.w - 0.08, spec.h - 0.08, canvasT, spec.canvas)
        : box(canvasT, spec.h - 0.08, spec.w - 0.08, spec.canvas),
      ...put(spec.along, spec.y, canvasCenter),
      { name: `${spec.name}-canvas`, cast: false },
    );
    g.add(art);
  }
}
