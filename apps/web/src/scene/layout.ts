/**
 * 房间布局：**场景与资源清单的共同事实来源**。
 *
 * 为什么把坐标集中在这里：
 *   - 3D 物件摆放与 `summarizeHomeResources()` 的「资源是否相互分离」判定必须用同一组数字，
 *     否则清单说「分开」而画面里挤在一起；
 *   - 保证「按 AAFP 清单配全」这件事是**可核对**的，而不是建模时凭感觉；
 *   - 一处改坐标，画面与清单同时跟着变。
 *
 * 坐标系：X 向右、Z 向观察者（+Z = 入户一侧），Y 向上，单位米。
 *   - 北墙 z = -2.8：整面窗（x ∈ [-1.6, 1.6]）；
 *   - 东墙 x = +3.6：电视墙；
 *   - 南墙 z = +2.8：开放式厨房 + 入户门（x ∈ [2.55, 3.45]）；
 *   - 西墙 x = -3.6：床与衣柜。
 */
import type { HomeResourceItem } from '@camp/core';

export const ROOM = {
  width: 7.2,
  depth: 5.6,
  height: 2.75,
  /** 墙厚（用于窗口留洞与外墙可见面） */
  wallThickness: 0.12,
} as const;

export const WINDOW = {
  /** 北墙 z 坐标 */
  z: -ROOM.depth / 2,
  centerX: 0,
  width: 3.2,
  sillY: 0.5,
  height: 1.8,
} as const;

export const DOOR = {
  z: ROOM.depth / 2,
  centerX: 3,
  width: 0.9,
  height: 2.05,
} as const;

// ---------------------------------------------------------------- 家具锚点

/** 床：床头靠西墙。 */
export const BED = { x: -2.55, z: -1.65, widthX: 1.95, lengthZ: 1.8, frameH: 0.32, mattressH: 0.24 } as const;
/** 床头边几 + 台灯。 */
export const NIGHTSTAND = { x: -1.2, z: -1.5, w: 0.42, h: 0.5 } as const;
/** 衣柜：贴西墙，位于床与厨房之间。 */
export const WARDROBE = { x: -3.28, z: 1.3, depthX: 0.6, widthZ: 2.2, h: 2.4 } as const;
/** 沙发：面向东墙电视，背对着厨房方向。 */
export const SOFA = { x: 1.15, z: 0.35, depthX: 0.9, widthZ: 2.15 } as const;
/** 茶几。 */
export const COFFEE_TABLE = { x: 2.25, z: 0.35, w: 0.75, d: 1.15, h: 0.42 } as const;
/** 地毯。 */
export const RUG = { x: 1.75, z: 0.35, w: 3, d: 2.6 } as const;
/** 电视柜 + 壁挂电视（东墙）。 */
export const TV_CABINET = { x: 3.28, z: 0.4, depthX: 0.42, widthZ: 1.6, h: 0.45 } as const;
export const TV = { x: 3.56, z: 0.4, widthZ: 1.45, height: 0.84, y: 1.35 } as const;
/** 置物架（东墙南段，入户门北侧）。 */
export const SHELF_UNIT = { x: 3.3, z: 1.95, depthX: 0.34, widthZ: 1.2, h: 1.9 } as const;
/** 落地灯。 */
export const FLOOR_LAMP = { x: 0.5, z: -0.85 } as const;
/** 绿植（窗边）。 */
export const PLANT = { x: 0.75, z: -2.25 } as const;
/** 窗帘。 */
export const CURTAIN = { z: -2.7, width: 4.2 } as const;

/** 开放式厨房：南墙一字型台面。 */
export const KITCHEN = {
  x: -0.95,
  z: ROOM.depth / 2,
  widthX: 3.1,
  depthZ: 0.62,
  counterH: 0.9,
  sinkX: -1.9,
  cooktopX: -0.6,
} as const;
/** 冰箱：南墙东段，与厨房同一排。 */
export const FRIDGE = { x: 1.5, z: 2.45, w: 0.92, d: 0.72, h: 1.86 } as const;
/** 岛台 + 吧台凳。 */
export const ISLAND = { x: -1.6, z: 1.05, w: 1.8, d: 0.9, h: 0.92 } as const;
export const STOOLS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -2, z: 0.35 },
  { x: -1.2, z: 0.35 },
];
/** 鞋柜：入户门旁。 */
export const SHOE_CABINET = { x: 2.5, z: 2.62, w: 0.9, d: 0.32, h: 1.1 } as const;

// ---------------------------------------------------------------- 猫用品

/** 猫爬架：窗边东北角，含猫洞、吊床、顶台与剑麻立柱。 */
export const CAT_TREE = {
  x: 2.6,
  z: -2.25,
  baseW: 0.9,
  baseD: 0.9,
  height: 1.75,
  topPerchH: 1.45,
} as const;
/** 壁挂跳台（东墙），与柜顶构成垂直动线。 */
export const CAT_SHELVES: ReadonlyArray<{ z: number; y: number; label: string }> = [
  { z: -1.5, y: 1.25, label: '墙面跳台（低）' },
  { z: -0.9, y: 1.65, label: '墙面跳台（高）' },
];
/** 衣柜顶：猫常用的高处通道。 */
export const WARDROBE_TOP_Y = WARDROBE.h;
/** 封闭式猫窝（卧室与起居之间，安静且不在通道上）。 */
export const CAT_BED = { x: -0.35, z: -0.9, w: 0.62, h: 0.42 } as const;
/** 纸箱躲藏处。 */
export const HIDING_BOX = { x: 2.55, z: 1.45, w: 0.52, h: 0.46 } as const;
/** 猫砂盆：A 在西南角，B 在西墙床与衣柜之间的凹位。 */
export const LITTER_BOXES: ReadonlyArray<{ id: string; label: string; x: number; z: number; rotY: number }> = [
  { id: 'litter-a', label: '猫砂盆 A（西南角）', x: -3.15, z: 2.35, rotY: Math.PI },
  { id: 'litter-b', label: '猫砂盆 B（床与衣柜之间）', x: -3.15, z: -0.28, rotY: Math.PI / 2 },
];
/** 饮水机（窗边东侧）。 */
export const FOUNTAIN = { x: 1.5, z: -2.4 } as const;
/** 第二个饮水点（沙发旁）。 */
export const WATER_BOWL = { x: 0.35, z: 1.55 } as const;
/** 食盆（窗边西侧）。 */
export const FOOD_STATION = { x: -0.75, z: -2.4 } as const;
/** 墙面剑麻抓板（东墙，电视柜以北）。 */
export const WALL_SCRATCHER = { x: 3.5, z: -0.62, y: 0.3 } as const;
/** 地面抓板。 */
export const FLOOR_SCRATCHER = { x: 0.3, z: 0.6 } as const;
/** 玩具。 */
export const TOYS = { x: 1, z: 1.9 } as const;

// ---------------------------------------------------------------- 猫的两个演示状态

export interface CatAnchor {
  x: number;
  z: number;
  y: number;
  /** 朝向（弧度，绕 Y 轴） */
  rotY: number;
  /**
   * 「猫特写」机位相对猫的**世界坐标偏移**。
   *
   * 为什么手写而不是自动算：相机不能落在沙发或茶几内部（第一版按朝向自动算，结果正好钻进沙发里），
   * 而房间布局是固定的，所以由布局作者直接给出安全偏移最可靠、也最容易核对。
   */
  cam: { x: number; y: number; z: number };
}

/**
 * 平静舒适：趴在猫爬架顶台，面朝窗外。
 * 激动不适：下到起居区地面、贴地蹲伏并朝入户方向。
 *
 * 地面锚点刻意选在**空场**（沙发与猫爬架之间的开阔处）：既符合「从高处下来、停在开阔处」的读法，
 * 也保证从多数机位都看得见猫——否则切换状态后在画面里找不到它，演示效果大打折扣。
 */
export const CAT_ANCHORS: Readonly<Record<'calm' | 'agitated', CatAnchor>> = {
  calm: { x: CAT_TREE.x, z: CAT_TREE.z, y: CAT_TREE.topPerchH, rotY: Math.PI, cam: { x: -1.15, y: 0.78, z: 2.1 } },
  agitated: { x: 1.75, z: -1.05, y: 0, rotY: 0, cam: { x: 1.15, y: 0.72, z: 1.3 } },
};

// ---------------------------------------------------------------- 人流通道与相机

/** 人流通道折线：入户门 → 厨房 → 起居区。用于「躲藏处不在通道上」的判定。 */
export const TRAFFIC_PATH: ReadonlyArray<{ x: number; z: number }> = [
  { x: 3, z: 2.6 },
  { x: 0.2, z: 2 },
  { x: -1.6, z: 1.9 },
  { x: 0.4, z: 0.4 },
  { x: 1.5, z: -0.5 },
];

export interface CameraPreset {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

export const CAMERA_PRESETS: ReadonlyArray<CameraPreset> = [
  { id: 'overview', label: '全景', position: [6.1, 3.05, 6.25], target: [0.0, 0.9, -0.3] },
  { id: 'living', label: '客厅', position: [-1.4, 1.75, 1.9], target: [2.6, 1.1, 0.2] },
  { id: 'kitchen', label: '厨房', position: [0.6, 1.75, 0.4], target: [-1.4, 1, 2.5] },
  { id: 'bedroom', label: '睡眠区', position: [-0.2, 1.8, 0.6], target: [-2.7, 0.8, -1.8] },
  { id: 'catZone', label: '猫区', position: [1.15, 1.45, -0.55], target: [2.6, 1.05, -2.25] },
];

// ---------------------------------------------------------------- 资源清单

/**
 * 房间里的关键资源点。1 只猫 → 按 AAFP 清单配全（见 `summarizeHomeResources`）。
 * `apps/web` 用这里的坐标摆放 3D 物件；`@camp/core` 用同一份坐标判定分离度。
 */
export const HOME_RESOURCES: readonly HomeResourceItem[] = [
  ...LITTER_BOXES.map((box) => ({
    id: box.id,
    kind: 'litter' as const,
    label: box.label,
    position: { x: box.x, z: box.z },
  })),
  { id: 'fountain', kind: 'water', label: '饮水机（窗边）', position: { x: FOUNTAIN.x, z: FOUNTAIN.z } },
  { id: 'water-bowl', kind: 'water', label: '第二水碗（沙发旁）', position: { x: WATER_BOWL.x, z: WATER_BOWL.z } },
  { id: 'food-bowls', kind: 'food', label: '食盆（窗边西侧）', position: { x: FOOD_STATION.x, z: FOOD_STATION.z } },
  { id: 'cat-bed', kind: 'sleep', label: '封闭式猫窝', position: { x: CAT_BED.x, z: CAT_BED.z } },
  {
    id: 'tree-perch',
    kind: 'sleep',
    label: '猫爬架顶台',
    position: { x: CAT_TREE.x, z: CAT_TREE.z },
    heightM: CAT_TREE.topPerchH,
  },
  { id: 'tree-posts', kind: 'scratch', label: '猫爬架剑麻立柱', position: { x: CAT_TREE.x, z: CAT_TREE.z } },
  { id: 'wall-scratcher', kind: 'scratch', label: '墙面剑麻抓板', position: { x: WALL_SCRATCHER.x, z: WALL_SCRATCHER.z } },
  { id: 'floor-scratcher', kind: 'scratch', label: '地面抓板', position: { x: FLOOR_SCRATCHER.x, z: FLOOR_SCRATCHER.z } },
  { id: 'cat-bed-hide', kind: 'hide', label: '封闭式猫窝', position: { x: CAT_BED.x, z: CAT_BED.z } },
  { id: 'hiding-box', kind: 'hide', label: '纸箱躲藏处', position: { x: HIDING_BOX.x, z: HIDING_BOX.z } },
  {
    id: 'tree-perch-vertical',
    kind: 'vertical',
    label: '猫爬架顶台',
    position: { x: CAT_TREE.x, z: CAT_TREE.z },
    heightM: CAT_TREE.topPerchH,
  },
  ...CAT_SHELVES.map((shelf, i) => ({
    id: `cat-shelf-${i}`,
    kind: 'vertical' as const,
    label: shelf.label,
    position: { x: 3.45, z: shelf.z },
    heightM: shelf.y,
  })),
  {
    id: 'wardrobe-top',
    kind: 'vertical',
    label: '衣柜顶',
    position: { x: WARDROBE.x, z: WARDROBE.z },
    heightM: WARDROBE_TOP_Y,
  },
  { id: 'toys', kind: 'play', label: '逗猫棒与小球', position: { x: TOYS.x, z: TOYS.z } },
];
