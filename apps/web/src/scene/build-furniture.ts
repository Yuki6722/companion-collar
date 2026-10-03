/**
 * 家具与陈设。
 *
 * 两种实现方式并存，是有意为之：
 *   - **扫描模型**（沙发/茶几/书架/单人椅/绿植/靠垫）负责「看起来是真家具」；
 *   - **程序化占位件**负责两件事：① 资产没加载完/加载失败时房间依然完整（绝不出现空洞）；
 *     ② 尺寸严格服从布局数据（床、衣柜、电视柜、电视、地毯、落地灯、挂画）。
 *
 * 模型落位时按包围盒**缩放到目标尺寸**，因此上游换资产不会破坏房间比例。
 */
import * as THREE from 'three';
import {
  BED,
  COFFEE_TABLE,
  FLOOR_LAMP,
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
} from './layout.ts';
import type { MaterialLibrary } from './materials.ts';
import { addMesh, box, group, roundedBox } from './util.ts';

export interface ModelPlacement {
  /** 与 assets.ts 的 MODEL_MANIFEST id 对应 */
  id: string;
  x: number;
  z: number;
  rotY: number;
  /** 目标最大水平尺寸（米）：把扫描件缩放到与房间相符的尺度 */
  fitTo: number;
  /** 底部离地高度（吊灯之类需要挂起来） */
  y?: number;
  /** 低画质档可省的装饰件 */
  decorative?: boolean;
}

/**
 * 扫描模型的目标位置与尺度。
 * `rotY` 依据各模型的原始朝向来定，最终以截图核对为准（见 docs/design/03-home-scene-stage1.md）。
 */
export const MODEL_PLACEMENTS: ReadonlyArray<ModelPlacement> = [
  { id: 'coffeeTable', x: COFFEE_TABLE.x, z: COFFEE_TABLE.z, rotY: 0, fitTo: 0.95 },
  { id: 'sideboard', x: TV_CABINET.x, z: TV_CABINET.z, rotY: -Math.PI / 2, fitTo: 1.6 },
  { id: 'plant', x: PLANT.x, z: PLANT.z, rotY: 0.5, fitTo: 1, decorative: true },
  { id: 'pendant', x: ISLAND.x, z: ISLAND.z, rotY: 0, fitTo: 0.6, y: 1.72, decorative: true },
];

/** 沙发朝向：本地 +Z 转到世界 +X，也就是**正对东墙的电视**。 */
const SOFA_FACING = Math.PI / 2;

export interface FurnitureResult {
  /** 各扫描模型对应的程序化占位组；模型到货后隐藏 */
  placeholders: Map<string, THREE.Group>;
}

export function buildFurniture(root: THREE.Group, mats: MaterialLibrary): FurnitureResult {
  const g = group('furniture');
  root.add(g);
  const placeholders = new Map<string, THREE.Group>();

  buildBed(g, mats);
  buildNightstand(g, mats);
  buildWardrobe(g, mats);
  buildModernShelf(g, mats);
  buildModernSofa(g, mats);
  // 电视柜是「边柜」扫描模型的占位件：先用程序化柜体，模型到货后替换
  placeholders.set('sideboard', buildTvWall(g, mats));
  buildRug(g, mats);
  buildFloorLamp(g, mats);
  buildWallArt(g, mats);

  for (const placement of MODEL_PLACEMENTS) {
    const placeholder = buildPlaceholder(placement.id, mats);
    if (!placeholder) continue;
    placeholder.position.set(placement.x, placement.y ?? 0, placement.z);
    placeholder.rotation.y = placement.rotY;
    placeholder.name = `placeholder-${placement.id}`;
    g.add(placeholder);
    placeholders.set(placement.id, placeholder);
  }

  return { placeholders };
}

// ---------------------------------------------------------------- 程序化家具

function buildBed(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('bed');
  parent.add(g);
  const wood = mats.plain('woodWarm');
  const bedding = mats.plain('bedding');
  const duvetMat = mats.plain('cushion');

  const frameH = BED.frameH;
  addMesh(g, box(BED.widthX, frameH, BED.lengthZ, wood), BED.x, frameH / 2, BED.z, { name: 'bed-frame' });
  for (const [dx, dz] of [
    [-BED.widthX / 2 + 0.1, -BED.lengthZ / 2 + 0.1],
    [BED.widthX / 2 - 0.1, -BED.lengthZ / 2 + 0.1],
    [-BED.widthX / 2 + 0.1, BED.lengthZ / 2 - 0.1],
    [BED.widthX / 2 - 0.1, BED.lengthZ / 2 - 0.1],
  ] as const) {
    addMesh(g, box(0.08, 0.14, 0.08, wood), BED.x + dx, 0.07, BED.z + dz, { name: 'bed-leg' });
  }

  // 床头板（贴西墙）
  addMesh(
    g,
    roundedBox(0.08, 0.62, BED.lengthZ * 0.98, 0.03, wood),
    BED.x - BED.widthX / 2 - 0.04,
    0.42,
    BED.z,
    { name: 'bed-headboard' },
  );

  const mattressY = frameH + BED.mattressH / 2;
  addMesh(
    g,
    roundedBox(BED.widthX - 0.08, BED.mattressH, BED.lengthZ - 0.08, 0.04, bedding),
    BED.x,
    mattressY,
    BED.z,
    { name: 'bed-mattress' },
  );

  // 被子：铺在床的三分之二处，留出床头放枕头
  addMesh(
    g,
    roundedBox(BED.widthX - 0.06, 0.12, BED.lengthZ * 0.62, 0.05, duvetMat),
    BED.x + 0.06,
    frameH + BED.mattressH + 0.06,
    BED.z + BED.lengthZ * 0.16,
    { name: 'bed-duvet' },
  );

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

function buildNightstand(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('nightstand');
  parent.add(g);
  const wood = mats.plain('woodLight');
  const seed = NIGHTSTAND;
  addMesh(g, roundedBox(seed.w, seed.h, seed.w, 0.02, wood), seed.x, seed.h / 2, seed.z, {
    name: 'nightstand-body',
  });

  // 台灯
  const shadeMat = mats.plain('ceramic');
  const metal = mats.plain('metalDark');
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.04, 16), metal), seed.x, seed.h + 0.02, seed.z, {
    name: 'lamp-base',
  });
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 10), metal), seed.x, seed.h + 0.13, seed.z, {
    name: 'lamp-stem',
  });
  addMesh(
    g,
    new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.16, 18, 1, true), shadeMat),
    seed.x,
    seed.h + 0.32,
    seed.z,
    { name: 'lamp-shade', receive: false },
  );
  const bulb = new THREE.PointLight(0xffd9a8, 3.2, 3.4, 2);
  bulb.position.set(seed.x, seed.h + 0.3, seed.z);
  bulb.name = 'lamp-point-light';
  g.add(bulb);
}

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
  // 两扇门的分缝与拉手
  addMesh(
    g,
    box(0.014, WARDROBE.h - 0.16, 0.012, dark),
    WARDROBE.x + WARDROBE.depthX / 2 + 0.005,
    WARDROBE.h / 2,
    WARDROBE.z,
    { name: 'wardrobe-seam', cast: false },
  );
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

/** 电视墙：程序化柜体（作为边柜扫描模型的占位件）+ 壁挂电视 + 陈设。返回柜体组以便替换。 */
function buildTvWall(parent: THREE.Group, mats: MaterialLibrary): THREE.Group {
  const g = group('tv-wall');
  parent.add(g);
  const wood = mats.plain('woodDark');
  const screen = mats.plain('screen');
  const dark = mats.plain('plasticDark');

  const cabinet = group('placeholder-sideboard');
  g.add(cabinet);
  addMesh(
    cabinet,
    roundedBox(TV_CABINET.depthX, TV_CABINET.h, TV_CABINET.widthZ, 0.02, wood),
    0,
    TV_CABINET.h / 2,
    0,
    { name: 'tv-cabinet' },
  );
  addMesh(
    cabinet,
    box(0.012, TV_CABINET.h - 0.14, TV_CABINET.widthZ - 0.1, dark),
    -TV_CABINET.depthX / 2 - 0.005,
    TV_CABINET.h / 2,
    0,
    { name: 'tv-cabinet-seam', cast: false },
  );
  cabinet.position.set(TV_CABINET.x, 0, TV_CABINET.z);

  // 壁挂电视
  addMesh(g, box(0.05, TV.height, TV.widthZ, dark), TV.x, TV.y, TV.z, { name: 'tv-body' });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(TV.widthZ - 0.04, TV.height - 0.04), screen);
  panel.rotation.y = -Math.PI / 2;
  panel.position.set(TV.x - 0.028, TV.y, TV.z);
  panel.name = 'tv-screen';
  g.add(panel);

  // 电视柜上的小摆件：书
  const bookA = mats.plain('bookA');
  const bookB = mats.plain('bookB');
  for (const [i, mat] of [bookA, bookB, bookA].entries()) {
    addMesh(
      g,
      box(0.16, 0.035, 0.22, mat),
      TV_CABINET.x,
      TV_CABINET.h + 0.02 + i * 0.035,
      TV_CABINET.z - 0.5,
      { name: `tv-book-${i}` },
    );
  }
  return cabinet;
}

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
  addMesh(g, box(RUG.w, 0.012, RUG.d, fabric), RUG.x, 0.006, RUG.z, {
    name: 'rug-pad',
    cast: false,
    receive: false,
  });
}

function buildFloorLamp(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('floor-lamp');
  parent.add(g);
  const metal = mats.plain('metalDark');
  const shade = mats.plain('ceramic');

  addMesh(
    g,
    new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 20), metal),
    FLOOR_LAMP.x,
    0.015,
    FLOOR_LAMP.z,
    { name: 'lamp-foot' },
  );
  addMesh(
    g,
    new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.5, 12), metal),
    FLOOR_LAMP.x,
    0.78,
    FLOOR_LAMP.z,
    { name: 'lamp-pole' },
  );
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

function buildWallArt(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('wall-art');
  parent.add(g);
  const frame = mats.plain('woodDark');
  const canvasA = mats.plain('bookB');
  const canvasB = mats.plain('cushion');

  // 北墙：窗与东墙之间
  addMesh(g, box(0.9, 0.68, 0.03, frame), 2.55, 1.75, -ROOM.depth / 2 + 0.08, { name: 'art-north-frame' });
  addMesh(g, box(0.82, 0.6, 0.01, canvasA), 2.55, 1.75, -ROOM.depth / 2 + 0.1, {
    name: 'art-north-canvas',
    cast: false,
  });
  // 西墙：床头
  addMesh(g, box(0.03, 0.5, 0.7, frame), -ROOM.width / 2 + 0.08, 1.72, BED.z + 0.2, { name: 'art-west-frame' });
  addMesh(g, box(0.01, 0.42, 0.62, canvasB), -ROOM.width / 2 + 0.1, 1.72, BED.z + 0.2, {
    name: 'art-west-canvas',
    cast: false,
  });
}

// ---------------------------------------------------------------- 扫描模型的占位件

/**
 * 占位件与真模型**同位置同朝向**，加载成功后直接隐藏。
 * 这样首屏（或资产失败时）看到的是完整的房间，而不是缺口。
 */
function buildPlaceholder(id: string, mats: MaterialLibrary): THREE.Group | null {
  switch (id) {
    case 'coffeeTable':
      return placeholderCoffeeTable(mats);
    case 'plant':
      return placeholderPlant(mats);
    case 'pendant':
      return placeholderPendant(mats);
    // sideboard 的占位件就是程序化的电视柜（见 buildTvWall）；
    // 沙发与置物架是程序化常驻件（见 buildModernSofa / buildModernShelf），不是占位件
    default:
      return null;
  }
}

/**
 * 现代简约布艺沙发（程序化常驻件）。
 *
 * 为什么不用 CC0 扫描件：库里的四个沙发（`sofa_03` 深色木框 + 织锦靠垫、
 * `Sofa_01` 奶油色雕花腿、`sofa_02` 黑皮切斯特菲尔德、`painted_wooden_sofa` 灰漆木长凳）
 * 全是复古款，与这套浅橡木/柚木的柜体放不到一起。沙发形体是「低矮方正的软体块」，
 * 程序化能把它控制到与柜体同一套语言：米灰布面、方正的座块与靠垫、细金属脚。
 *
 * 本地朝向：**前面朝 +Z**，再绕 Y 转 `SOFA_FACING`（+90°）正对东墙电视。
 */
function buildModernSofa(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('sofa');
  const fabric = mats.plain('sofaFabric');
  const legMat = mats.plain('metalDark');
  const pillowA = mats.plain('cushion');
  const pillowB = mats.plain('rug');

  const widthX = SOFA.widthZ; // 2.15：本地 X 是沙发宽度，旋转后沿世界 Z
  const depthZ = SOFA.depthX; // 0.90：本地 Z 是坐深，旋转后沿世界 X
  const halfW = widthX / 2;

  // 细金属脚（低矮款：脚高 0.12，整体重心低）
  for (const [dx, dz] of [
    [-halfW + 0.14, -depthZ / 2 + 0.12],
    [halfW - 0.14, -depthZ / 2 + 0.12],
    [-halfW + 0.14, depthZ / 2 - 0.12],
    [halfW - 0.14, depthZ / 2 - 0.12],
  ] as const) {
    addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 14), legMat), dx, 0.06, dz, {
      name: 'sofa-leg',
    });
  }

  // 基座：方正的一块，前面略收，形成「悬浮」观感
  addMesh(g, roundedBox(widthX, 0.2, depthZ, 0.03, fabric), 0, 0.22, 0.015, { name: 'sofa-base' });

  // 座垫三块：留出细缝，是现代款的标志性做法
  for (const [i, dx] of [-0.7, 0, 0.7].entries()) {
    addMesh(
      g,
      roundedBox(0.68, 0.17, depthZ - 0.14, 0.055, fabric),
      dx,
      0.4,
      0.05 + (i === 1 ? 0.01 : 0),
      { name: `sofa-seat-${i}` },
    );
  }

  // 靠背：矮而平的一块，高度只到 0.74
  addMesh(g, roundedBox(widthX, 0.42, 0.16, 0.03, fabric), 0, 0.53, -depthZ / 2 + 0.08, {
    name: 'sofa-back',
  });
  // 靠背垫三块，微微后仰（比默认直立更像现代款的松散靠垫）
  for (const [i, dx] of [-0.7, 0, 0.7].entries()) {
    const cushion = addMesh(
      g,
      roundedBox(0.66, 0.34, 0.15, 0.055, fabric),
      dx,
      0.54,
      -depthZ / 2 + 0.22,
      { name: `sofa-back-cushion-${i}` },
    );
    cushion.rotation.x = -0.1;
  }

  // 扶手：与座面齐平的矮方块
  for (const sx of [-1, 1]) {
    addMesh(
      g,
      roundedBox(0.18, 0.3, depthZ, 0.03, fabric),
      sx * (halfW - 0.09),
      0.47,
      0.015,
      { name: 'sofa-arm' },
    );
  }

  // 两只抱枕：一深一浅，避免整块布面太平
  addMesh(g, roundedBox(0.4, 0.36, 0.14, 0.07, pillowA), -0.62, 0.62, -0.2, { name: 'sofa-pillow-a' });
  addMesh(g, roundedBox(0.36, 0.32, 0.13, 0.07, pillowB), 0.66, 0.6, -0.2, { name: 'sofa-pillow-b' });

  g.position.set(SOFA.x, 0, SOFA.z);
  g.rotation.y = SOFA_FACING;
  parent.add(g);
}

function placeholderCoffeeTable(mats: MaterialLibrary): THREE.Group {
  const g = group('coffee-table');
  const wood = mats.plain('woodWarm');
  const metal = mats.plain('metalDark');
  const r = 0.45;
  const h = COFFEE_TABLE.h;
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 32), wood), 0, h - 0.025, 0, {
    name: 'coffee-table-top',
  });
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h - 0.05, 16), metal), 0, (h - 0.05) / 2, 0, {
    name: 'coffee-table-stem',
  });
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.03, 24), metal), 0, 0.015, 0, {
    name: 'coffee-table-base',
  });
  return g;
}

/**
 * 现代简约置物架（程序化常驻件）。
 *
 * 为什么不用 CC0 扫描件：Poly Haven 的两个开架（`Shelf_01`、`wooden_bookshelf_worn`）
 * 都是做旧的灰蓝金属/风化木，放进这套暖色样板间里最扎眼。开架的形状极简单——
 * 薄侧板 + 薄隔板 + 浅橡木——程序化反而完全可控，也不会掉到「旧货」的观感里。
 */
function buildModernShelf(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('shelf-unit');
  parent.add(g);
  const oak = mats.plain('woodLight');
  const { x, z, depthX, widthZ, h } = SHELF_UNIT;
  const panel = 0.026;

  // 两块薄侧板：不做背板，保持通透
  for (const dz of [-widthZ / 2 + panel / 2, widthZ / 2 - panel / 2]) {
    addMesh(g, box(depthX, h, panel, oak), 0, h / 2, dz, { name: 'shelf-side' });
  }
  // 薄隔板
  const levels = 4;
  for (let i = 0; i <= levels; i++) {
    const y = 0.08 + (i * (h - 0.16)) / levels;
    addMesh(g, box(depthX - 0.01, 0.022, widthZ - panel * 2 - 0.01, oak), 0, y, 0, {
      name: `shelf-board-${i}`,
    });
  }

  // 陈设：竖立的书（书脊朝外）+ 一只陶碗 + 一叠平放的书，克制的摆法才像现代简约
  const spines = [mats.plain('bookA'), mats.plain('bookB'), mats.plain('bookC')];
  const rows: ReadonlyArray<{ level: number; startZ: number; count: number }> = [
    { level: 1, startZ: -0.34, count: 7 },
    { level: 2, startZ: 0.04, count: 5 },
    { level: 3, startZ: -0.2, count: 6 },
  ];
  for (const row of rows) {
    const y = 0.08 + (row.level * (h - 0.16)) / levels;
    for (let i = 0; i < row.count; i++) {
      const mat = spines[(row.level + i) % spines.length];
      if (!mat) continue;
      const hh = 0.21 + ((i * 7) % 5) * 0.012;
      addMesh(
        g,
        box(0.15, hh, 0.03 + ((i * 3) % 3) * 0.006, mat),
        0.005,
        y + 0.011 + hh / 2,
        row.startZ + i * 0.042,
        { name: 'shelf-book' },
      );
    }
  }
  // 平放的一叠书
  const flat = mats.plain('bookB');
  for (let i = 0; i < 3; i++) {
    addMesh(g, box(0.16, 0.026, 0.22, flat), 0, 0.08 + 3 * ((h - 0.16) / levels) + 0.024 + i * 0.026, 0.3, {
      name: 'shelf-book-flat',
    });
  }
  // 陶碗
  addMesh(
    g,
    new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.plain('ceramic')),
    0,
    0.08 + 2 * ((h - 0.16) / levels) + 0.075,
    -0.36,
    { name: 'shelf-bowl' },
  );

  g.position.set(x, 0, z);
}

function placeholderPlant(mats: MaterialLibrary): THREE.Group {
  const g = group('plant');
  const pot = mats.plain('terracotta');
  const leaf = mats.plain('leaf');
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.3, 20), pot), 0, 0.15, 0, {
    name: 'plant-pot',
  });
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.3, 10), mats.plain('woodDark')), 0, 0.42, 0, {
    name: 'plant-trunk',
  });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = 0.16 + (i % 3) * 0.06;
    addMesh(
      g,
      new THREE.Mesh(new THREE.SphereGeometry(0.16 + (i % 2) * 0.05, 14, 10), leaf),
      Math.cos(a) * r,
      0.68 + (i % 4) * 0.13,
      Math.sin(a) * r,
      { name: 'plant-leaf' },
    );
  }
  return g;
}

function placeholderPendant(mats: MaterialLibrary): THREE.Group {
  const g = group('pendant');
  const metal = mats.plain('metalDark');
  const shade = mats.plain('ceramic');
  // 灯线：从天花板垂到 y=1.72（模型落位的底部）
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.75, 8), metal), 0, 0.45, 0, {
    name: 'pendant-cord',
    cast: false,
  });
  addMesh(g, new THREE.Mesh(new THREE.SphereGeometry(0.17, 22, 16), shade), 0, 0.02, 0, {
    name: 'pendant-shade',
  });
  // 刻意不在占位件里放点光源：占位件会被扫描模型替换掉，
  // 光若挂在上面，模型到货的瞬间厨房会暗一下（厨房的补光由场景统一提供）。
  return g;
}
