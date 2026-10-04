/**
 * 狗的生活场景布局：**房间、院子与所有物件的共同事实来源**。
 *
 * 为什么把坐标集中在这里（与 `../layout.ts` 同一条纪律）：
 *   - 3D 物件摆放、HUD 的场景清单、以及 `scripts/check-layout-dog.mjs` 的机械审计
 *     必须用同一组数字，否则「清单说有」而画面里挤在一起或压在墙上；
 *   - 一处改坐标，画面与审计同时跟着变。
 *
 * 坐标系：X 向右、Z 向观察者（+Z = 入户一侧），Y 向上，单位米。
 *   - **北墙 z = -3.5**：朝院子的一面 —— 四扇推拉玻璃门 + 一扇窗；
 *   - **南墙 z = +3.5**：开放式厨房 + 入户门；
 *   - **东墙 x = +4.8**：电视墙（含高窗）；
 *   - **西墙 x = -4.8**：床与衣柜（含卧室窗）；
 *   - **院子 z ∈ [-11.7, -3.5]**：出推拉门是木平台，再往北是草坪、石板路、池塘、
 *     休闲区（躺椅 + 小桌 + 藤架）、树木灌木与花坛。
 *
 * 四个墙面都是**轴对齐**的（这是本文件里洞口用世界坐标而不是「沿墙距离」的前提）。
 * 狗版房间刻意比猫版大：猫版 7.2 × 5.6 × 2.75，这里 9.6 × 7.0 × 3.0，再加 9.6 × 8.2 的院子。
 */

// ---------------------------------------------------------------- 房间与院子

export const ROOM = {
  width: 9.6,
  depth: 7.0,
  height: 3.0,
  /** 墙厚（用于窗台板、门套与外墙可见面） */
  wallThickness: 0.14,
} as const;

export const HALF_W = ROOM.width / 2;
export const HALF_D = ROOM.depth / 2;

/** 院子：紧邻北墙之外。地面比室内低 0.12 m（木平台是过渡台阶）。 */
export const YARD = {
  width: ROOM.width,
  depth: 8.2,
  /** 院子地面（草坪上表面）的高度 */
  groundY: -0.12,
  /** 北侧栅栏所在的 z */
  fenceZ: -HALF_D - 8.2,
  fenceHeight: 1.75,
} as const;

/** 木平台（縁側）：室外，与室内地面齐平，是进院子的第一步。 */
export const ENGAWA = {
  minX: -1.1,
  maxX: 3.7,
  minZ: -4.7,
  maxZ: -HALF_D,
  /** 面层厚度（上表面在 y = 0） */
  thickness: 0.1,
} as const;

// ---------------------------------------------------------------- 墙体与洞口

export interface WallOpening {
  id: string;
  kind: 'window' | 'sliding-door' | 'entry-door';
  /** 洞口中心在**沿墙轴**上的世界坐标（南北墙给 x，东西墙给 z） */
  center: number;
  width: number;
  sillY: number;
  height: number;
}

export interface WallSpec {
  id: string;
  label: string;
  /** 墙面所在的平面坐标（`normalAxis` 为 'z' 时是 z，为 'x' 时是 x） */
  at: number;
  /** 墙面垂直于哪一根轴 */
  normalAxis: 'x' | 'z';
  /** 沿墙方向的起止（另一端轴上的世界坐标） */
  start: number;
  end: number;
  /** 内侧法线相对墙面位置的符号：+1 表示法线朝正方向 */
  inwardSign: 1 | -1;
  /** 大面积墙面材质：乳胶漆 / 强调色（电视墙） */
  material: 'plaster' | 'accent';
  openings: readonly WallOpening[];
}

/** 四扇推拉玻璃门：出这个门就是院子，是整幕戏的接缝。 */
export const SLIDING_DOOR: WallOpening = {
  id: 'sliding-door',
  kind: 'sliding-door',
  center: 1.3,
  width: 4.2,
  sillY: 0,
  height: 2.4,
};
/** 推拉门每扇的宽度。 */
export const SLIDING_DOOR_PANEL_W = SLIDING_DOOR.width / 4;
/**
 * 推拉门**开着的那一格**：西端一格。
 *
 * 为什么必须和 `TRAFFIC_PATH` 一起改：动线要真的从这个洞走出去，
 * 否则通道会横穿玻璃（`check-layout-dog.mjs` 有一条断言专门盯这件事）。
 */
export const SLIDING_DOOR_OPEN = {
  minX: SLIDING_DOOR.center - SLIDING_DOOR.width / 2,
  maxX: SLIDING_DOOR.center - SLIDING_DOOR.width / 2 + SLIDING_DOOR_PANEL_W,
  center: SLIDING_DOOR.center - SLIDING_DOOR.width / 2 + SLIDING_DOOR_PANEL_W / 2,
  width: SLIDING_DOOR_PANEL_W,
} as const;
/** 北墙窗（起居区西侧）。 */
export const WINDOW_NORTH: WallOpening = {
  id: 'window-north',
  kind: 'window',
  center: -2.7,
  width: 2.2,
  sillY: 0.8,
  height: 1.4,
};
/** 南墙入户门。 */
export const ENTRY_DOOR: WallOpening = {
  id: 'entry-door',
  kind: 'entry-door',
  center: 3.6,
  width: 0.95,
  sillY: 0,
  height: 2.1,
};
/** 西墙卧室窗。 */
export const WINDOW_WEST: WallOpening = {
  id: 'window-west',
  kind: 'window',
  center: -1.7,
  width: 2.0,
  sillY: 0.75,
  height: 1.35,
};
/** 东墙高窗（起居区北段，给电视墙一带补光）。 */
export const WINDOW_EAST: WallOpening = {
  id: 'window-east',
  kind: 'window',
  center: -2.6,
  width: 1.4,
  sillY: 1.15,
  height: 1.05,
};

export const WALLS: readonly WallSpec[] = [
  {
    id: 'north',
    label: '北墙（朝院子）',
    at: -HALF_D,
    normalAxis: 'z',
    start: -HALF_W,
    end: HALF_W,
    inwardSign: 1,
    material: 'plaster',
    openings: [WINDOW_NORTH, SLIDING_DOOR],
  },
  {
    id: 'south',
    label: '南墙（入户 + 厨房）',
    at: HALF_D,
    normalAxis: 'z',
    start: -HALF_W,
    end: HALF_W,
    inwardSign: -1,
    material: 'plaster',
    openings: [ENTRY_DOOR],
  },
  {
    id: 'west',
    label: '西墙（床与衣柜）',
    at: -HALF_W,
    normalAxis: 'x',
    start: -HALF_D,
    end: HALF_D,
    inwardSign: 1,
    material: 'plaster',
    openings: [WINDOW_WEST],
  },
  {
    id: 'east',
    label: '东墙（电视墙）',
    at: HALF_W,
    normalAxis: 'x',
    start: -HALF_D,
    end: HALF_D,
    inwardSign: -1,
    material: 'accent',
    openings: [WINDOW_EAST],
  },
];

// ---------------------------------------------------------------- 家具锚点

/** 床：床头靠西墙，日式低台床（框架 0.30 + 床垫 0.26）。 */
export const BED = {
  x: -3.5,
  z: -1.4,
  widthX: 2.1,
  lengthZ: 1.9,
  frameH: 0.3,
  mattressH: 0.26,
} as const;
/** 床头边几（床南侧，贴西墙）。 */
export const NIGHTSTAND = { x: -4.4, z: -0.05, w: 0.46, d: 0.46, h: 0.52 } as const;
/** 衣柜：贴西墙，位于床与厨房之间。 */
export const WARDROBE = { x: -4.45, z: 1.6, depthX: 0.62, widthZ: 2.2, h: 2.35 } as const;
/** 沙发：面向东墙电视。 */
export const SOFA = { x: 1.3, z: 0.5, depthX: 0.98, widthZ: 2.7 } as const;
/** 茶几。 */
export const COFFEE_TABLE = { x: 2.85, z: 0.5, w: 0.9, d: 1.35, h: 0.4 } as const;
/** 地毯（贴地装饰，不参与「挡道」判定）。 */
export const RUG = { x: 2.55, z: 0.5, w: 3.4, d: 3.4 } as const;
/** 电视柜 + 壁挂电视（东墙）。 */
export const TV_CABINET = { x: 4.5, z: 0.5, depthX: 0.45, widthZ: 2.1, h: 0.42 } as const;
export const TV = { x: 4.72, z: 0.5, widthZ: 1.85, height: 1.04, y: 1.5 } as const;
/** 置物架（东墙，电视柜以南）。 */
export const SHELF_UNIT = { x: 4.55, z: 2.4, depthX: 0.36, widthZ: 1.5, h: 2.0 } as const;
/** 落地灯（推拉门东侧的玻璃前，避开通道路径）。 */
export const FLOOR_LAMP = { x: 2.05, z: -2.55, r: 0.25 } as const;
/** 绿植（北墙窗与推拉门之间的墙垛前）。 */
export const PLANT = { x: -1.35, z: -3.05, r: 0.3 } as const;
/** 窗帘（西墙卧室窗）。 */
export const CURTAIN = { axis: 'west', width: 2.6 } as const;

/** 开放式厨房：南墙一字型台面。 */
export const KITCHEN = {
  x: -2.2,
  z: HALF_D,
  widthX: 4.4,
  depthZ: 0.65,
  counterH: 0.92,
  sinkX: -3.4,
  cooktopX: -1.0,
} as const;
/** 冰箱：南墙，厨房与入户门之间。 */
export const FRIDGE = { x: 1.1, z: 3.1, w: 0.95, d: 0.75, h: 1.95 } as const;
/** 岛台 + 三张吧台凳。 */
export const ISLAND = { x: -1.5, z: 1.65, w: 2.2, d: 0.95, h: 0.94 } as const;
export const STOOLS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -2.1, z: 0.9 },
  { x: -1.5, z: 0.9 },
  { x: -0.9, z: 0.9 },
];
/** 鞋柜：入户门西侧。 */
export const SHOE_CABINET = { x: 2.6, z: 3.33, w: 1.0, d: 0.34, h: 1.1 } as const;

// ---------------------------------------------------------------- 狗的用品

/**
 * 食盆 + 水盆（东墙，电视柜与置物架之间的凹位）。
 *
 * 为什么放这儿：它不在入户 → 厨房 → 起居 → 院子的主通道上，
 * 但又在视线可达处 —— 「放在没人走的角落里」是这类物件最基本的摆放纪律。
 */
export const FOOD_STATION = { x: 4.32, z: -1.15, matW: 0.66, matD: 0.7 } as const;
/** 院里的水盆：木平台东端（出门就能喝，且不在门口正中间）。 */
export const OUTDOOR_WATER = { x: 3.35, z: -4.25, r: 0.19 } as const;
/** 主软垫：北墙窗下的日光位。 */
export const DOG_BED_MAIN = { x: -2.55, z: -2.85, w: 0.95, d: 0.78 } as const;
/** 第二张软垫：卧室床边（狗喜欢贴着主人睡）。 */
export const DOG_BED_SLEEP = { x: -1.85, z: -1.35, w: 0.85, d: 0.68 } as const;
/** 玩具篮：北墙窗下西侧。 */
export const TOY_BASKET = { x: -3.75, z: -3.05, r: 0.23 } as const;
/** 牵引绳与项圈挂钩（入户门东侧的南墙）。 */
export const LEASH_HOOK = { x: 4.45, z: 3.42, y: 1.4 } as const;

// ---------------------------------------------------------------- 院子

/** 藤架（休闲区顶棚）。 */
export const PERGOLA = { x: 3.35, z: -6.8, w: 2.5, d: 2.6, postH: 2.35 } as const;
/** 休闲区的砾石地坪（贴地装饰）。 */
export const LOUNGE_PAD = { x: 3.35, z: -6.9, w: 2.5, d: 2.8 } as const;
/** 休闲躺椅：面朝 +X（东），在藤架下、小桌之南。 */
export const LOUNGE_CHAIR = { x: 3.35, z: -7.0, w: 0.62, len: 1.7, rotY: Math.PI / 2 } as const;
/** 休闲区小桌（躺椅北侧，伸手够得到）。 */
export const SIDE_TABLE = { x: 3.5, z: -7.95, r: 0.28, h: 0.45 } as const;
/** 小池塘：椭圆，草地上**挖洞**（见 build-yard.ts 的 ShapeGeometry）。 */
export const POND = { x: -2.55, z: -8.55, rx: 1.35, rz: 1.05 } as const;
/** 石灯笼（池塘南岸，日式点睛）。 */
export const STONE_LANTERN = { x: -3.6, z: -6.25, h: 1.1 } as const;

export interface TreeSpec {
  id: string;
  label: string;
  x: number;
  z: number;
  /** 树干高度（地面到主枝分叉） */
  trunkH: number;
  /** 树冠整体高度 */
  canopyY: number;
  canopyR: number;
  /** 'green' = 常绿阔叶；'warm' = 红枫 */
  foliage: 'green' | 'warm';
  /** 树冠团块数量 */
  blobs: number;
}

export const TREES: readonly TreeSpec[] = [
  { id: 'tree-a', label: '大树（西侧）', x: -3.85, z: -5.3, trunkH: 2.3, canopyY: 3.3, canopyR: 1.85, foliage: 'green', blobs: 7 },
  { id: 'tree-b', label: '大树（东北角）', x: 3.6, z: -10.2, trunkH: 1.9, canopyY: 2.8, canopyR: 1.5, foliage: 'green', blobs: 6 },
  { id: 'tree-c', label: '红枫（西北角）', x: -4.2, z: -10.5, trunkH: 1.4, canopyY: 2.1, canopyR: 1.15, foliage: 'warm', blobs: 5 },
  { id: 'tree-d', label: '小乔木（北侧）', x: 0.55, z: -10.3, trunkH: 1.6, canopyY: 2.35, canopyR: 1.25, foliage: 'green', blobs: 5 },
];

export interface BushSpec {
  id: string;
  label: string;
  x: number;
  z: number;
  r: number;
  h: number;
}

/** 灌木丛：北侧一排做绿篱，另外几丛做点景。 */
export const BUSHES: readonly BushSpec[] = [
  ...[-3.4, -2.55, -1.7, -0.85, 0, 0.85, 1.7, 2.55, 3.4].map((x, i) => ({
    id: `hedge-${i}`,
    label: '北侧绿篱',
    x,
    z: -11.15,
    r: 0.46,
    h: 0.8,
  })),
  { id: 'bush-a', label: '点景灌木（平台西侧）', x: -1.15, z: -5.35, r: 0.5, h: 0.72 },
  { id: 'bush-b', label: '点景灌木（平台东侧）', x: 4.3, z: -4.85, r: 0.46, h: 0.68 },
  { id: 'bush-c', label: '点景灌木（东侧）', x: 4.28, z: -9.3, r: 0.48, h: 0.78 },
  { id: 'bush-d', label: '点景灌木（池边）', x: -0.35, z: -10.05, r: 0.48, h: 0.74 },
];

/** 石板路：三条折线（主路 + 西去池塘 + 东去休闲区）。石板是贴地装饰，不挡道。 */
export const PATHS: ReadonlyArray<{ id: string; label: string; points: ReadonlyArray<readonly [number, number]> }> = [
  {
    id: 'path-main',
    label: '主路（木平台 → 院心）',
    points: [
      [1.3, -4.78],
      [1.2, -5.5],
      [0.9, -6.2],
      [0.35, -6.9],
      [-0.45, -7.35],
    ],
  },
  {
    id: 'path-pond',
    label: '西支路（院心 → 池塘）',
    points: [
      [-0.45, -7.35],
      [-1.45, -7.62],
      [-2.35, -7.3],
      [-2.75, -6.55],
    ],
  },
  {
    id: 'path-lounge',
    label: '东支路（院心 → 休闲区）',
    points: [
      [0.9, -6.2],
      [1.6, -6.1],
      [2.2, -6.4],
    ],
  },
];

/** 草坪庭院灯（矮柱灯）。 */
export const PATH_LIGHTS: ReadonlyArray<{ x: number; z: number }> = [
  { x: 1.62, z: -5.15 },
  { x: 1.02, z: -6.62 },
  { x: 2.2, z: -5.85 },
  { x: -0.2, z: -7.92 },
];

/** 池塘边的置石。 */
export const BOULDERS: ReadonlyArray<{ x: number; z: number; r: number }> = [
  { x: -3.62, z: -9.32, r: 0.42 },
  { x: -1.42, z: -9.55, r: 0.3 },
  { x: -0.85, z: -8.15, r: 0.24 },
];

// ---------------------------------------------------------------- 通道与机位

/**
 * 人流通道折线：入户门 → 厨房前 → 起居区 → 北墙推拉门（**开着的那一格**）→ 木平台。
 *
 * 它被 `scripts/check-layout-dog.mjs` 用来判定「通道上没有固体物件」——
 * 「狗的东西不许摆在过道上」这条纪律必须可核对，不能靠在建模时凭手感。
 */
export const TRAFFIC_PATH: ReadonlyArray<readonly [number, number]> = [
  [3.6, 3.05],
  [2.0, 2.75],
  [0.95, 2.3],
  [0.45, 1.2],
  [0.45, 0.2],
  [0.3, -1.5],
  [0.0, -2.9],
  [-0.3, -4.3],
];

export interface CameraPreset {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  hint?: string;
}

export const CAMERA_PRESETS: ReadonlyArray<CameraPreset> = [
  {
    id: 'overview',
    label: '全景（房 + 院）',
    position: [11.4, 9.2, 9.8],
    target: [0.0, 0.5, -3.8],
    hint: '一眼看全：房间在南、院子在北，中间由四扇推拉玻璃门相接。',
  },
  { id: 'room', label: '室内全景', position: [5.8, 3.7, 6.4], target: [-0.4, 0.9, -0.9] },
  { id: 'living', label: '客厅', position: [3.4, 1.7, 3.4], target: [1.7, 0.6, 0.2] },
  { id: 'kitchen', label: '开放厨房', position: [0.6, 2.0, 0.2], target: [-2.2, 0.9, 3.3] },
  { id: 'bedroom', label: '睡眠区', position: [-1.2, 1.9, 0.7], target: [-3.7, 0.7, -1.6] },
  {
    id: 'dogZone',
    label: '狗的软垫',
    position: [0.7, 1.5, -0.8],
    target: [-2.5, 0.3, -2.75],
    hint: '主软垫在北墙窗下的日光位，第二张在卧室床边。',
  },
  {
    id: 'dogFeed',
    label: '狗的食盆',
    position: [3.1, 1.25, 0.5],
    target: [4.3, 0.22, -1.15],
    hint: '食盆与水盆放在东墙凹位：不在主通道上，但随时看得见。',
  },
  { id: 'terrace', label: '从室内看院子', position: [1.3, 1.55, 1.1], target: [1.0, 0.9, -8.6] },
  { id: 'garden', label: '院子', position: [6.8, 4.4, -15.4], target: [0.0, 0.5, -7.2] },
  { id: 'pond', label: '小池塘', position: [-0.2, 1.5, -6.3], target: [-2.6, -0.05, -8.75] },
  { id: 'lounge', label: '休闲区', position: [1.0, 1.6, -4.9], target: [3.4, 0.55, -6.9] },
];

// ---------------------------------------------------------------- 场景清单与占地

/**
 * 场景清单：这一屏「应该有什么」的**可核对列表**。
 *
 * 它同时喂两个消费者：HUD 左栏的「场景清单」面板（给人看），
 * 与 `scripts/check-layout-dog.mjs` 的齐全性断言（给门禁看）。
 */
export interface ProgramItem {
  id: string;
  group: 'room' | 'dog' | 'yard';
  label: string;
}

export const PROGRAM: readonly ProgramItem[] = [
  { id: 'kitchen', group: 'room', label: '开放式厨房（台面 / 灶 / 水槽 / 吊柜 / 油烟机 / 冰箱）' },
  { id: 'island', group: 'room', label: '岛台与三张吧台凳' },
  { id: 'tv', group: 'room', label: '电视与电视柜' },
  { id: 'sofa', group: 'room', label: '沙发、茶几与地毯' },
  { id: 'bed', group: 'room', label: '床、床头边几与床头灯' },
  { id: 'cabinets', group: 'room', label: '衣柜、置物架、鞋柜' },
  { id: 'dining', group: 'room', label: '餐桌/岛台用餐位' },
  { id: 'floorlamp', group: 'room', label: '落地灯与绿植' },
  { id: 'bowls', group: 'dog', label: '食盆与水盆（室内 + 院内各一处）' },
  { id: 'dogbed', group: 'dog', label: '柔软垫子两处（起居日光位 + 卧室床边）' },
  { id: 'toys', group: 'dog', label: '玩具篮（绳结与球）' },
  { id: 'leash', group: 'dog', label: '牵引绳与项圈挂钩' },
  { id: 'lawn', group: 'yard', label: '绿色草地' },
  { id: 'trees', group: 'yard', label: '树木（含红枫）' },
  { id: 'bushes', group: 'yard', label: '灌木丛与绿篱' },
  { id: 'lounge', group: 'yard', label: '休闲躺椅与藤架' },
  { id: 'sidetable', group: 'yard', label: '休闲区小桌' },
  { id: 'stonePath', group: 'yard', label: '石板路' },
  { id: 'pond', group: 'yard', label: '小池塘（含岸边置石与水生植物）' },
  { id: 'fence', group: 'yard', label: '木栅栏围合' },
  { id: 'lantern', group: 'yard', label: '石灯笼与草坪灯' },
  { id: 'engawa', group: 'yard', label: '木平台（室内到院子的过渡）' },
];

/**
 * 占地矩形。`kind` 决定它参不参与哪一类判定：
 *   - `solid`：实心占地，不可通行 —— 参与「两两不重叠」与「不压通道」两条断言；
 *   - `water`：水面 —— 不参与重叠判定（岸边置石本来就压在池边），但**挡路**；
 *   - `flat`：贴地装饰（地毯、花坛、石板）—— 既不重叠也不挡路；
 *   - `canopy`：只在高度上占用（树冠、藤架顶）—— 两条断言都不参与。
 *
 * `group` 表示「同一个物件的多个组成部分」：绿篱是一排灌木、藤架是四根立柱，
 * 它们内部互相接触是设计意图，不算冲突。同组之间跳过重叠判定。
 */
export interface Footprint {
  id: string;
  label: string;
  kind: 'solid' | 'flat' | 'canopy' | 'water';
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  heightM?: number;
  group?: string;
  /** 非矩形占地（目前只有椭圆的池塘）：审计用它在椭圆内做精确判定，避免误报 */
  ellipse?: { x: number; z: number; rx: number; rz: number };
}

function rect(
  id: string,
  label: string,
  x: number,
  z: number,
  w: number,
  d: number,
  kind: Footprint['kind'],
  extra: { heightM?: number; group?: string; ellipse?: Footprint['ellipse'] } = {},
): Footprint {
  const out: Footprint = { id, label, kind, minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
  if (extra.heightM !== undefined) out.heightM = extra.heightM;
  if (extra.group !== undefined) out.group = extra.group;
  if (extra.ellipse !== undefined) out.ellipse = extra.ellipse;
  return out;
}

function circle(
  id: string,
  label: string,
  x: number,
  z: number,
  r: number,
  kind: Footprint['kind'],
  extra: { heightM?: number; group?: string } = {},
): Footprint {
  return rect(id, label, x, z, r * 2, r * 2, kind, extra);
}

/** 藤架四根立柱的位置（由藤架尺寸派生，建模与审计共用）。 */
export const PERGOLA_POSTS: ReadonlyArray<{ x: number; z: number }> = [
  { x: PERGOLA.x - PERGOLA.w / 2, z: PERGOLA.z - PERGOLA.d / 2 },
  { x: PERGOLA.x + PERGOLA.w / 2, z: PERGOLA.z - PERGOLA.d / 2 },
  { x: PERGOLA.x - PERGOLA.w / 2, z: PERGOLA.z + PERGOLA.d / 2 },
  { x: PERGOLA.x + PERGOLA.w / 2, z: PERGOLA.z + PERGOLA.d / 2 },
];

/**
 * 全部占地矩形：**由上面的锚点派生**，不重复抄数字。
 *
 * 审计脚本用它做三件事：① 两个 solid 不许重叠；② 全部不许出界；
 * ③ 人流通道与院内小径不许被 solid 压住。
 */
export const FOOTPRINTS: readonly Footprint[] = [
  rect('bed', '床', BED.x, BED.z, BED.widthX, BED.lengthZ, 'solid', { heightM: BED.frameH + BED.mattressH }),
  rect('nightstand', '床头边几', NIGHTSTAND.x, NIGHTSTAND.z, NIGHTSTAND.w, NIGHTSTAND.d, 'solid', { heightM: NIGHTSTAND.h }),
  rect('wardrobe', '衣柜', WARDROBE.x, WARDROBE.z, WARDROBE.depthX, WARDROBE.widthZ, 'solid', { heightM: WARDROBE.h }),
  rect('sofa', '沙发', SOFA.x, SOFA.z, SOFA.depthX, SOFA.widthZ, 'solid', { heightM: 0.82 }),
  rect('coffeeTable', '茶几', COFFEE_TABLE.x, COFFEE_TABLE.z, COFFEE_TABLE.w, COFFEE_TABLE.d, 'solid', { heightM: COFFEE_TABLE.h }),
  rect('rug', '地毯', RUG.x, RUG.z, RUG.w, RUG.d, 'flat'),
  rect('tvCabinet', '电视柜', TV_CABINET.x, TV_CABINET.z, TV_CABINET.depthX, TV_CABINET.widthZ, 'solid', { heightM: TV_CABINET.h }),
  rect('shelfUnit', '置物架', SHELF_UNIT.x, SHELF_UNIT.z, SHELF_UNIT.depthX, SHELF_UNIT.widthZ, 'solid', { heightM: SHELF_UNIT.h }),
  circle('floorLamp', '落地灯', FLOOR_LAMP.x, FLOOR_LAMP.z, FLOOR_LAMP.r, 'solid', { heightM: 1.65 }),
  circle('plant', '绿植', PLANT.x, PLANT.z, PLANT.r, 'solid', { heightM: 1.4 }),
  rect('kitchenRun', '厨房台面', KITCHEN.x, KITCHEN.z - KITCHEN.depthZ / 2, KITCHEN.widthX, KITCHEN.depthZ, 'solid', { heightM: KITCHEN.counterH }),
  rect('fridge', '冰箱', FRIDGE.x, FRIDGE.z, FRIDGE.w, FRIDGE.d, 'solid', { heightM: FRIDGE.h }),
  rect('island', '岛台', ISLAND.x, ISLAND.z, ISLAND.w, ISLAND.d, 'solid', { heightM: ISLAND.h }),
  ...STOOLS.map((s, i) => circle(`stool-${i}`, `吧台凳 ${i + 1}`, s.x, s.z, 0.18, 'solid', { heightM: 0.68, group: 'stools' })),
  rect('shoeCabinet', '鞋柜', SHOE_CABINET.x, SHOE_CABINET.z, SHOE_CABINET.w, SHOE_CABINET.d, 'solid', { heightM: SHOE_CABINET.h }),
  // 狗的用品
  rect('foodStation', '食盆水盆', FOOD_STATION.x, FOOD_STATION.z, FOOD_STATION.matW, FOOD_STATION.matD, 'solid', { heightM: 0.16 }),
  circle('outdoorWater', '院内水盆', OUTDOOR_WATER.x, OUTDOOR_WATER.z, OUTDOOR_WATER.r, 'solid', { heightM: 0.14 }),
  rect('dogBedMain', '主软垫', DOG_BED_MAIN.x, DOG_BED_MAIN.z, DOG_BED_MAIN.w, DOG_BED_MAIN.d, 'solid', { heightM: 0.24 }),
  rect('dogBedSleep', '床边软垫', DOG_BED_SLEEP.x, DOG_BED_SLEEP.z, DOG_BED_SLEEP.w, DOG_BED_SLEEP.d, 'solid', { heightM: 0.22 }),
  circle('toyBasket', '玩具篮', TOY_BASKET.x, TOY_BASKET.z, TOY_BASKET.r, 'solid', { heightM: 0.26 }),
  // 院子的构筑物与自然物
  ...PERGOLA_POSTS.map((p, i) => circle(`pergolaPost-${i}`, `藤架立柱 ${i + 1}`, p.x, p.z, 0.07, 'solid', { heightM: PERGOLA.postH, group: 'pergola' })),
  rect('pergolaRoof', '藤架顶棚', PERGOLA.x, PERGOLA.z, PERGOLA.w, PERGOLA.d, 'canopy', { heightM: PERGOLA.postH + 0.12, group: 'pergola' }),
  rect('loungePad', '休闲区砾石地坪', LOUNGE_PAD.x, LOUNGE_PAD.z, LOUNGE_PAD.w, LOUNGE_PAD.d, 'flat'),
  rect('loungeChair', '躺椅', LOUNGE_CHAIR.x, LOUNGE_CHAIR.z, LOUNGE_CHAIR.len, LOUNGE_CHAIR.w, 'solid', { heightM: 0.72 }),
  circle('sideTable', '休闲小桌', SIDE_TABLE.x, SIDE_TABLE.z, SIDE_TABLE.r, 'solid', { heightM: SIDE_TABLE.h }),
  rect('pond', '池塘水面', POND.x, POND.z, POND.rx * 2, POND.rz * 2, 'water', {
    ellipse: { x: POND.x, z: POND.z, rx: POND.rx, rz: POND.rz },
  }),
  circle('stoneLantern', '石灯笼', STONE_LANTERN.x, STONE_LANTERN.z, 0.34, 'solid', { heightM: STONE_LANTERN.h }),
  ...TREES.map((t) => circle(`trunk-${t.id}`, `${t.label} 树干`, t.x, t.z, 0.28, 'solid', { heightM: t.trunkH })),
  ...TREES.map((t) => circle(`canopy-${t.id}`, `${t.label} 树冠`, t.x, t.z, t.canopyR, 'canopy', { heightM: t.canopyY + 1 })),
  ...BUSHES.map((b) => circle(b.id, b.label, b.x, b.z, b.r, 'solid', { heightM: b.h, group: b.id.startsWith('hedge') ? 'hedge' : b.id })),
  ...BOULDERS.map((b, i) => circle(`boulder-${i}`, '池边置石', b.x, b.z, b.r, 'solid', { heightM: b.r * 2 })),
  ...PATH_LIGHTS.map((p, i) => circle(`pathLight-${i}`, '草坪灯', p.x, p.z, 0.13, 'solid', { heightM: 0.72 })),
];

/** 室内地面的世界边界（审计用：家具不许压墙、不许出屋）。 */
export const ROOM_BOUNDS = {
  minX: -HALF_W,
  maxX: HALF_W,
  minZ: -HALF_D,
  maxZ: HALF_D,
} as const;

/** 院子的世界边界（含栅栏）。 */
export const YARD_BOUNDS = {
  minX: -HALF_W,
  maxX: HALF_W,
  minZ: YARD.fenceZ,
  maxZ: -HALF_D,
} as const;
