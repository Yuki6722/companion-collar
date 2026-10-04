/**
 * 狗版开放式厨房：底柜 + 台面 + 灶台 + 水槽 + 挡水墙 + 吊柜 + 油烟机
 * + 沥水架 + 岛台与三张吧台凳 + 冰箱 + 鞋柜。
 *
 * 全部程序化（与猫版 `../build-kitchen.ts` 同一套手法）：CC0 模型库里没有尺寸合适的整体厨房，
 * 而厨房必须严格贴合南墙（z = +3.5）与入户门之间的走道，尺寸只能按 `layout-dog.ts` 算。
 *
 * 日式温暖风的三条做法，决定了下面每一件的比例：
 *   1. **浅橡木柜体 + 石材台面 + 哑光黑五金**，只用这三类材质（`woodLight` / `surface('stone')` /
 *      `metalDark`），不再引入第四种颜色 —— 日式的「暖」靠木材与光，不靠配色。
 *      唯一一处例外是鞋柜台面上那只陶碗（`ceramicBlue`）：全屋没有一点釉色会显得像样板间。
 *   2. **方正、克制**：柜门缝、拉手、炉架都做到刚好能读出来的尺寸（缝 12 mm、拉手 26 mm 宽），
 *      再加细节就会变成「欧式整装厨房」，与推拉门、木格栅那套语言打架。
 *   3. 所有尺度按人体与锅具反推，锚点全部取自 `layout-dog.ts`：台面 0.92（`KITCHEN.counterH`，
 *      成人肘高）、吊柜底边 1.55（不挡视线又能抬手开门）、油烟机拢烟面与吊柜底边齐平。
 *
 * 两件**刻意不做**的事：
 *   - 岛台上方的吊灯：吊灯由扫描模型 `pendant` 负责，这里再画一盏会在同一位置打架；
 *   - 真实光源：场景统一布光，多一盏 PointLight 会把台面打曝 —— 灯带只做自发光条。
 */
import * as THREE from 'three';
import { FRIDGE, ISLAND, KITCHEN, ROOM, SHOE_CABINET, STOOLS } from './layout-dog.ts';
import type { MaterialLibrary } from '../materials.ts';
import { addMesh, box, cylinder, group, roundedBox } from '../util.ts';

const HALF_D = ROOM.depth / 2;

/**
 * 底柜中心线 z：南墙内侧（`HALF_D` = +3.5）退半个柜深。
 * 底柜 x ∈ [-4.4, 0] 由 `KITCHEN.x ± widthX / 2` 给出，贴墙那一面正好落在 z = 3.5。
 */
const RUN_Z = HALF_D - KITCHEN.depthZ / 2;

/** 吊柜底边离地高度：1.55 —— 比台面高 0.63，抬手够得到、又不挡从起居区看过来的视线。 */
const UPPER_BOTTOM_Y = 1.55;

/** 油烟机：正对 `KITCHEN.cooktopX`，宽 0.9（家用 60/90 两档里取大的那档，罩得住炒锅）。 */
const HOOD_W = 0.9;
const HOOD_X = KITCHEN.cooktopX;

/**
 * 水槽几何：盆体内空 + 壁厚，**同时决定台面上那个洞**。
 *
 * 为什么把洞也写在这里：台面绕着洞切了四块（见 `buildBaseRun`），
 * 若开洞尺寸与盆体尺寸各写一份，改一处就会漏缝或穿插。共用一组数字，改一个全跟着改。
 */
const SINK = {
  innerW: 0.52,
  innerD: 0.36,
  /**
   * 盆深 0.19：由「盆沿 0.912 − 柜体下段顶面 0.70 − 壁厚 0.022」推出来的，
   * 也就是洗炒锅不溅水、又不至于弯腰够底的高度。盆底因此正好坐在柜体底板上。
   */
  depth: 0.19,
  wall: 0.022,
  /** 盆沿比台面低 8 mm：从上方看得到一圈石材切口，是**台下盆**的做法 */
  rimDrop: 0.008,
  /** 洞口每边比盆体外壳小 2 mm —— 刻意留干涉，避免两个共面互相闪烁（z-fighting） */
  fit: 0.002,
} as const;

const SINK_OUTER_W = SINK.innerW + SINK.wall * 2;
const SINK_OUTER_D = SINK.innerD + SINK.wall * 2;
const SINK_HOLE_W = SINK_OUTER_W - SINK.fit * 2;
const SINK_HOLE_D = SINK_OUTER_D - SINK.fit * 2;

/**
 * 底柜**下段**的顶面高度：0.70。
 *
 * 水槽柜在真实厨房里就是没有顶板的 —— 盆体要吊进柜子里。所以柜体分成下段（整条通铺到 0.70）
 * 与上段（0.70–0.88，水槽那一跨只留前挡板与背板），盆底正好坐在这条线上。
 * 这个数字同时被 `buildBaseRun`（切柜体）与 `buildSink`（放盆体）使用，写一份。
 */
const BASE_CARCASS_TOP_Y = 0.7;

/**
 * 厨房用到的全部材质。
 *
 * 打成一个包传，是因为九个构件函数都要用到同一批材质；逐个当参数传会写出
 * 七参数函数，读起来比材质本身还长。
 */
interface KitchenMats {
  /** 浅橡木：柜体、柜门、鞋柜、吧台凳座面 */
  cabinet: THREE.MeshStandardMaterial;
  /** 柚木色：岛台柜体（与靠墙那一排拉开一个色阶，否则岛台会读成「从墙上掉下来的一块」） */
  island: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  /** 岛台台面：尺寸只有 2.2 m，平铺密度要单独给一份，否则石材纹路会被拉大 */
  islandStone: THREE.MeshStandardMaterial;
  /** 挡水墙：比台面深一档的石材，让竖直面在漫射光下也能读出体积 */
  stoneWall: THREE.MeshStandardMaterial;
  /** 鞋柜台面：只有 1 m 长，平铺次数必须单独给（贴图按面重复，共用一份会被拉成细纹） */
  shoeStone: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  /** 哑光黑五金：拉手、炉架、风管、凳杆 */
  hardware: THREE.MeshStandardMaterial;
  /** 黑色玻璃（灶面）与踢脚 */
  black: THREE.MeshStandardMaterial;
  /** 吊柜下方灯带 */
  strip: THREE.MeshStandardMaterial;
  /** 鞋柜台面上的陶碗（日式釉色，全厨房唯一一处非木/石/黑） */
  glaze: THREE.MeshStandardMaterial;
}

export function buildDogKitchen(root: THREE.Group, mats: MaterialLibrary): void {
  const g = group('dog-kitchen');
  root.add(g);

  const m = kitchenMats(mats);
  buildBaseRun(g, m);
  buildUpperCabinets(g, m);
  buildHood(g, m);
  buildCooktop(g, m);
  buildSink(g, m);
  buildDishRack(g, m);
  buildIsland(g, m);
  buildFridge(g, m);
  buildShoeCabinet(g, m);
}

function kitchenMats(mats: MaterialLibrary): KitchenMats {
  /**
   * 灯带：材质库里唯一带自发光的是 `screen`，但它同时是电视/屏幕的深蓝黑，
   * 直接拿来当灯带会在暖色木柜下发一片冷蓝。按 `../build-room.ts` 里天花板的做法
   * **克隆一份改色**，不动原件 —— 原件还被起居区的屏幕共用着。
   */
  const strip = mats.plain('screen').clone();
  strip.color.setHex(0xfff2d8);
  strip.emissive = new THREE.Color(0xffdca6);
  strip.emissiveIntensity = 1.15;

  return {
    cabinet: mats.plain('woodLight'),
    island: mats.plain('woodWarm'),
    stone: mats.surface('stone', 3, 1, { color: 0xf2efea, roughness: 0.35 }),
    islandStone: mats.surface('stone', 2, 1, { color: 0xf2efea, roughness: 0.35 }),
    stoneWall: mats.surface('stone', 4, 1, { color: 0xece6dd, roughness: 0.45 }),
    shoeStone: mats.surface('stone', 1, 1, { color: 0xf2efea, roughness: 0.35 }),
    metal: mats.plain('metal'),
    hardware: mats.plain('metalDark'),
    black: mats.plain('plasticDark'),
    strip,
    glaze: mats.plain('ceramicBlue'),
  };
}

// ---------------------------------------------------------------- 底柜、台面与挡水墙

function buildBaseRun(g: THREE.Group, m: KitchenMats): void {
  const counterT = 0.04;
  /** 踢脚高 0.10：留出脚趾与扫地机器人的空间，也让柜体看起来「站在地上」而不是插进地板 */
  const toeH = 0.1;
  const bodyTopY = KITCHEN.counterH - counterT;
  const bodyY = (toeH + bodyTopY) / 2;
  const bodyH = bodyTopY - toeH;
  /** 柜门所在的平面：朝屋内那一面（南墙在 +z，所以门面在 -z 侧） */
  const faceZ = RUN_Z - KITCHEN.depthZ / 2;

  /**
   * 柜体**分两段**做，而不是一整块到 0.88。
   *
   * 为什么：水槽盆体要吊到 0.70。若柜体实心到 0.88，从台面洞口往下看，
   * 视线先撞上的是柜体顶面（0.88）—— 盆只剩 3 cm 深，水槽立刻假掉。
   * 真实的台下盆柜本来就是「盆体吊进柜子里」：下段整条通铺到盆底以下，
   * 上段（0.70–0.88）水槽两侧是实心，水槽那一跨只在门面留前挡板、贴墙留背板。
   */
  const bandH = bodyTopY - BASE_CARCASS_TOP_Y;
  const bandY = (BASE_CARCASS_TOP_Y + bodyTopY) / 2;
  /** 水槽跨的两端：洞口外再放 2 cm，门缝因此都落在挡板上，门看起来仍是整扇 */
  const bayMinX = KITCHEN.sinkX - SINK_HOLE_W / 2 - 0.02;
  const bayMaxX = KITCHEN.sinkX + SINK_HOLE_W / 2 + 0.02;
  const runMinX = KITCHEN.x - KITCHEN.widthX / 2;
  const runMaxX = KITCHEN.x + KITCHEN.widthX / 2;

  /**
   * 下段用**直角盒**而不是圆角盒：上段要正好压在它顶上，
   * 圆角会让下段的门面在 y = 0.70 处往后收 2 cm，交界处就多出一道莫名其妙的凹槽。
   */
  addMesh(g, box(KITCHEN.widthX, BASE_CARCASS_TOP_Y - toeH, KITCHEN.depthZ, m.cabinet), KITCHEN.x, (toeH + BASE_CARCASS_TOP_Y) / 2, RUN_Z, {
    name: 'dog-kitchen-base-carcass',
  });
  addMesh(g, box(bayMinX - runMinX, bandH, KITCHEN.depthZ, m.cabinet), (runMinX + bayMinX) / 2, bandY, RUN_Z, {
    name: 'dog-kitchen-base-band-west',
  });
  addMesh(g, box(runMaxX - bayMaxX, bandH, KITCHEN.depthZ, m.cabinet), (bayMaxX + runMaxX) / 2, bandY, RUN_Z, {
    name: 'dog-kitchen-base-band-east',
  });
  // 前挡板：合页挂在它上面，也是门面那块板 —— 前沿必须正好落在门面（z = faceZ）上，即中心退后 1.5 cm
  addMesh(g, box(bayMaxX - bayMinX, bandH, 0.03, m.cabinet), (bayMinX + bayMaxX) / 2, bandY, faceZ + 0.015, {
    name: 'dog-kitchen-base-band-front',
  });
  // 背板：不封的话，从院子那一侧的剖面视角看过去，水槽这一跨会是一个通到屋里的洞
  addMesh(g, box(bayMaxX - bayMinX, bandH, 0.03, m.cabinet), (bayMinX + bayMaxX) / 2, bandY, HALF_D - 0.015, {
    name: 'dog-kitchen-base-band-back',
  });

  // 踢脚内收：比柜体浅 6 cm、两端各窄 6 cm，背面仍顶到 z = 3.5（看不见的那面不留缝，免得漏光）
  addMesh(g, box(KITCHEN.widthX - 0.12, toeH, KITCHEN.depthZ - 0.06, m.black), KITCHEN.x, toeH / 2, RUN_Z + 0.03, {
    name: 'dog-kitchen-toe',
  });

  /**
   * 门缝：**四道竖缝 = 五扇门**，每扇 0.88 m。
   *
   * 为什么不是四扇（每扇 1.1 m）：0.88 已经是家用柜门的上限（再宽合页会垂头），
   * 而 4.4 m 的跑道切七扇（0.63 m）又会在 3 m 的观看距离上碎成一片横线。
   */
  const doorCount = 5;
  const doorW = KITCHEN.widthX / doorCount;
  // 缝与拉手都比门面**多嵌进 1 mm**（下面所有 `- 0.004` / `- 0.010` 都是这个意思）：
  // 贴片如果正好停在门面上，两个面会共面，掠射角下会闪。
  for (let i = 1; i < doorCount; i++) {
    addMesh(g, box(0.012, bodyH - 0.06, 0.01, m.black), KITCHEN.x - KITCHEN.widthX / 2 + doorW * i, bodyY, faceZ - 0.004, {
      name: `dog-kitchen-seam-${i}`,
      cast: false,
    });
  }
  // 台面下沿一道横缝：读作「假抽屉面板」，日式整体厨房最常见的一道分缝
  addMesh(g, box(KITCHEN.widthX, 0.012, 0.01, m.black), KITCHEN.x, bodyTopY - 0.1, faceZ - 0.004, {
    name: 'dog-kitchen-drawer-seam',
    cast: false,
  });
  // 拉手：哑光黑，竖装在每扇门顶部、紧贴竖缝 12 cm —— 手从台面边缘落下来正好抓到
  for (let i = 0; i < doorCount; i++) {
    const doorRightX = KITCHEN.x - KITCHEN.widthX / 2 + doorW * (i + 1);
    addMesh(g, box(0.018, 0.2, 0.022, m.hardware), doorRightX - 0.12, bodyTopY - 0.2, faceZ - 0.01, {
      name: `dog-kitchen-handle-${i}`,
    });
  }

  /**
   * 台面：石材，比柜体各边出挑 2 cm，**绕水槽切成四块**。
   *
   * 为什么必须开洞：整块台面板会把盆体整个盖住，从任何机位都看不见水槽，
   * 水槽就白建了。不用 CSG，改用「把台面当成四面墙来切段」——
   * 与 `./build-dog-room.ts` 里带洞口的墙是同一个办法，切口共面，视觉上仍是一整块台面。
   */
  const cMinX = KITCHEN.x - (KITCHEN.widthX + 0.04) / 2;
  const cMaxX = KITCHEN.x + (KITCHEN.widthX + 0.04) / 2;
  const cMinZ = RUN_Z - (KITCHEN.depthZ + 0.04) / 2;
  const cMaxZ = RUN_Z + (KITCHEN.depthZ + 0.04) / 2;
  const hMinX = KITCHEN.sinkX - SINK_HOLE_W / 2;
  const hMaxX = KITCHEN.sinkX + SINK_HOLE_W / 2;
  const hMinZ = RUN_Z - SINK_HOLE_D / 2;
  const hMaxZ = RUN_Z + SINK_HOLE_D / 2;

  const slab = (minX: number, maxX: number, minZ: number, maxZ: number, name: string): void => {
    addMesh(g, box(maxX - minX, counterT, maxZ - minZ, m.stone), (minX + maxX) / 2, KITCHEN.counterH - counterT / 2, (minZ + maxZ) / 2, {
      name,
    });
  };
  // 台面东段一直铺到 x = 0.02，再往东是冰箱前的地面，中间留出 0.6 m 站人的位置
  slab(cMinX, hMinX, cMinZ, cMaxZ, 'dog-kitchen-counter-west');
  slab(hMaxX, cMaxX, cMinZ, cMaxZ, 'dog-kitchen-counter-east');
  slab(hMinX, hMaxX, cMinZ, hMinZ, 'dog-kitchen-counter-front');
  slab(hMinX, hMaxX, hMaxZ, cMaxZ, 'dog-kitchen-counter-back');

  // 挡水墙：台面到吊柜底边（1.55）之间的石材条，厚 2 cm 贴在 z = 3.5 的墙面上
  addMesh(
    g,
    box(KITCHEN.widthX, UPPER_BOTTOM_Y - KITCHEN.counterH, 0.02, m.stoneWall),
    KITCHEN.x,
    (KITCHEN.counterH + UPPER_BOTTOM_Y) / 2,
    HALF_D - 0.01,
    { name: 'dog-kitchen-backsplash', cast: false },
  );
}

// ---------------------------------------------------------------- 吊柜、油烟机、灶台

/**
 * 吊柜：深度 0.36、底边 1.55、高 0.70（顶边 2.25，上面还留 0.75 m 乳胶漆到 3.0 m 的顶棚，
 * 「柜子不顶天」是日式厨房最好认的比例）。**分成左右两组**，中间留 1 m 给油烟机 ——
 * 灶台正上方必须是油烟机，吊柜只能夹着它挂。
 */
function buildUpperCabinets(g: THREE.Group, m: KitchenMats): void {
  const depth = 0.36;
  const h = 0.7;
  const zc = HALF_D - depth / 2;
  const yc = UPPER_BOTTOM_Y + h / 2;
  const faceZ = zc - depth / 2;
  /** 油烟机两侧各留 5 cm：柜门要能开到 90° 以上，贴着油烟机壳体会磕门 */
  const gap = 0.05;

  const runs: ReadonlyArray<{ minX: number; maxX: number; doors: number }> = [
    { minX: KITCHEN.x - KITCHEN.widthX / 2, maxX: HOOD_X - HOOD_W / 2 - gap, doors: 3 },
    { minX: HOOD_X + HOOD_W / 2 + gap, maxX: KITCHEN.x + KITCHEN.widthX / 2, doors: 1 },
  ];

  for (const [i, run] of runs.entries()) {
    const w = run.maxX - run.minX;
    const cx = (run.minX + run.maxX) / 2;
    addMesh(g, roundedBox(w, h, depth, 0.02, m.cabinet), cx, yc, zc, { name: `dog-kitchen-upper-${i}` });

    const doorW = w / run.doors;
    for (let k = 1; k < run.doors; k++) {
      addMesh(g, box(0.012, h - 0.06, 0.01, m.black), run.minX + doorW * k, yc, faceZ - 0.004, {
        name: `dog-kitchen-upper-seam-${i}-${k}`,
        cast: false,
      });
    }
    // 吊柜拉手装在门的下沿：人站在台面前，手是从下面往上够的
    for (let k = 0; k < run.doors; k++) {
      addMesh(g, box(0.018, 0.16, 0.022, m.hardware), run.minX + doorW * (k + 1) - 0.1, UPPER_BOTTOM_Y + 0.14, faceZ - 0.01, {
        name: `dog-kitchen-upper-handle-${i}-${k}`,
      });
    }
  }

  /**
   * 吊柜下方的短灯带（加分项）：只做一条自发光条，**不加真实光源**。
   *
   * 它挂在最宽那组吊柜的前沿下方 8 mm 处：从起居区看过去，就是台面上方那道
   * 亮的横线，正是「有人在用的厨房」的信号；而真加一盏灯，台面会立刻过曝。
   */
  const main = runs[0];
  if (main) {
    addMesh(
      g,
      box(main.maxX - main.minX - 0.3, 0.016, 0.05, m.strip),
      (main.minX + main.maxX) / 2,
      UPPER_BOTTOM_Y - 0.008,
      faceZ + 0.05,
      { name: 'dog-kitchen-light-strip', cast: false, receive: false },
    );
  }
}

/**
 * 油烟机：灶台正上方。机身下沿与吊柜底边齐平（1.55），装锅时不会碰头，
 * 视觉上又和吊柜连成一条水平线；风管从机身顶一直走到顶棚。
 */
function buildHood(g: THREE.Group, m: KitchenMats): void {
  const canopyH = 0.09;
  const bodyH = 0.36;
  /** 机身进深 0.52：比吊柜深 0.16，拢烟靠的就是这一圈多出来的边；前沿停在 2.97，不挡炒菜 */
  const depth = 0.52;
  const zc = HALF_D - depth / 2 - 0.01;
  const faceZ = zc - depth / 2;

  addMesh(g, roundedBox(HOOD_W, canopyH, depth, 0.02, m.metal), HOOD_X, UPPER_BOTTOM_Y + canopyH / 2, zc, {
    name: 'dog-kitchen-hood-canopy',
  });
  addMesh(g, box(0.6, bodyH, 0.4, m.metal), HOOD_X, UPPER_BOTTOM_Y + canopyH + bodyH / 2, zc, {
    name: 'dog-kitchen-hood-body',
  });
  // 控制面板：哑光黑的一条，贴在拢烟罩前沿 —— 机身四面都是不锈钢时，需要一处深色把轮廓收住
  addMesh(g, box(0.26, 0.025, 0.018, m.black), HOOD_X, UPPER_BOTTOM_Y + 0.05, faceZ - 0.008, {
    name: 'dog-kitchen-hood-panel',
    cast: false,
  });

  /**
   * 风管：从机身顶（2.0）走到顶棚（3.0）。
   *
   * 为什么不断在吊柜上方：断在半空会读成「没装完」。它穿过吊柜顶上方那 0.75 m 空白，
   * 正好把「吊柜不顶天」留下的那段空隙填上，也让 3.0 m 的层高有话可说。
   */
  const ductTop = ROOM.height;
  addMesh(g, box(0.34, ductTop - (UPPER_BOTTOM_Y + canopyH + bodyH), 0.28, m.hardware), HOOD_X, (UPPER_BOTTOM_Y + canopyH + bodyH + ductTop) / 2, zc, {
    name: 'dog-kitchen-hood-duct',
  });
}

/** 灶台：黑色玻璃面板 + 四个圆形炉架，位置取自 `KITCHEN.cooktopX`。 */
function buildCooktop(g: THREE.Group, m: KitchenMats): void {
  const topY = KITCHEN.counterH;

  /**
   * 面板用 `plasticDark` 而不是 `screen`：材质库里唯一的深色玻璃质感 `screen` 带自发光，
   * 摆在灶面上会在背光处泛一片蓝光，反而假。哑光黑在这里也更符合哑光五金那一套语言。
   */
  addMesh(g, box(0.62, 0.012, 0.52, m.black), HOOD_X, topY + 0.006, RUN_Z, {
    name: 'dog-kitchen-cooktop',
    cast: false,
  });

  // 四个炉架：圆形锅架（torus 压平）+ 中心火盖，2×2 排布。
  // 偏移 ±0.15 / ±0.13 让两个锅之间留出 0.30 × 0.26 的锅距（两口 28 cm 的锅不会打架），
  // 同时炉架外缘离面板边还有 8 cm —— 溢锅时那圈玻璃就是接水的台阶。
  const burners = [
    [-0.15, -0.13],
    [0.15, -0.13],
    [-0.15, 0.13],
    [0.15, 0.13],
  ] as const;
  for (const [i, [dx, dz]] of burners.entries()) {
    const grate = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.009, 8, 20), m.hardware);
    grate.rotation.x = Math.PI / 2;
    addMesh(g, grate, HOOD_X + dx, topY + 0.012 + 0.009, RUN_Z + dz, {
      name: `dog-kitchen-grate-${i}`,
      cast: false,
    });
    addMesh(g, cylinder(0.03, 0.034, 0.014, m.hardware, 16), HOOD_X + dx, topY + 0.019, RUN_Z + dz, {
      name: `dog-kitchen-burner-${i}`,
      cast: false,
    });
  }
}

// ---------------------------------------------------------------- 水槽与沥水架

/** 水槽：不锈钢盆体（四壁 + 盆底 + 排水口）+ 龙头（底座 + 立管 + 鹅颈 + 起泡器 + 手柄）。 */
function buildSink(g: THREE.Group, m: KitchenMats): void {
  const rimY = KITCHEN.counterH - SINK.rimDrop;
  const botY = rimY - SINK.depth;
  const wallY = (rimY + botY) / 2;
  const ix = SINK.innerW / 2;
  const iz = SINK.innerD / 2;
  const t = SINK.wall;
  const x = KITCHEN.sinkX;

  /**
   * 盆体做成**真的开口盒子**（四壁 + 盆底）而不是猫版那种「一块金属贴片 + 一个暗盒」：
   * 台面已经开了洞，从上方必须真的看得见盆的内壁与盆底，贴片在这里会一眼假。
   */
  addMesh(g, box(SINK.innerW + t * 2, SINK.depth, t, m.metal), x, wallY, RUN_Z - (iz + t / 2), {
    name: 'dog-kitchen-sink-wall-front',
    cast: false,
  });
  addMesh(g, box(SINK.innerW + t * 2, SINK.depth, t, m.metal), x, wallY, RUN_Z + (iz + t / 2), {
    name: 'dog-kitchen-sink-wall-back',
    cast: false,
  });
  addMesh(g, box(t, SINK.depth, SINK.innerD, m.metal), x - (ix + t / 2), wallY, RUN_Z, {
    name: 'dog-kitchen-sink-wall-west',
    cast: false,
  });
  addMesh(g, box(t, SINK.depth, SINK.innerD, m.metal), x + (ix + t / 2), wallY, RUN_Z, {
    name: 'dog-kitchen-sink-wall-east',
    cast: false,
  });
  // 盆底的下沿正好落在柜体下段的顶面（0.70）上：盆体不是悬空的，它坐在水槽柜的底板上
  addMesh(g, box(SINK.innerW + t * 2, t, SINK.innerD + t * 2, m.metal), x, botY - t / 2, RUN_Z, {
    name: 'dog-kitchen-sink-bottom',
    cast: false,
  });
  // 排水口坐在盆底上（底面 0.722 + 半个盘厚）
  addMesh(g, cylinder(0.036, 0.036, 0.008, m.hardware, 16), x, botY + 0.004, RUN_Z, {
    name: 'dog-kitchen-sink-drain',
    cast: false,
  });

  /**
   * 龙头：立管落在盆后壁与挡水墙之间那 9 cm 台面上 —— 那是全场唯一同时满足
   * 「不被盆体压住」与「不穿进挡水墙」的位置，所以 z 由盆体半深 + 0.075 推出来。
   */
  const fz = RUN_Z + iz + 0.075;
  const faucet = group('dog-kitchen-faucet');
  addMesh(faucet, cylinder(0.035, 0.042, 0.02, m.metal, 20), 0, 0.01, 0, { name: 'faucet-base' });
  addMesh(faucet, cylinder(0.018, 0.018, 0.32, m.metal, 14), 0, 0.18, 0, { name: 'faucet-riser' });

  /**
   * 鹅颈出水管：四分之一圆环，局部 +X 经 `rotation.y = -π/2` 映到世界 +Z。
   * 于是环心放在立管顶前方 -R 处时，θ=0 的那端正好套在立管顶上（切线竖直），
   * θ=π/2 的那端朝 -z 弯出 R —— 出水口因此落在盆体正上方，而不是墙里。
   */
  const R = 0.11;
  const neck = new THREE.Mesh(new THREE.TorusGeometry(R, 0.016, 8, 18, Math.PI / 2), m.metal);
  neck.rotation.y = -Math.PI / 2;
  addMesh(faucet, neck, 0, 0.34, -R, { name: 'faucet-neck' });
  addMesh(faucet, cylinder(0.016, 0.016, 0.05, m.metal, 12), 0, 0.34 + R - 0.025, -R, {
    name: 'faucet-aerator',
  });
  // 单柄手柄：从立管西侧伸出，是这一片里唯一「会动」的零件，深色让它在不锈钢里读得出来
  const lever = addMesh(faucet, cylinder(0.012, 0.012, 0.11, m.hardware, 10), -0.055, 0.3, 0, {
    name: 'faucet-lever',
  });
  lever.rotation.z = Math.PI / 2;
  faucet.position.set(KITCHEN.sinkX, KITCHEN.counterH, fz);
  g.add(faucet);
}

/**
 * 沥水架（加分项）：**跨在水槽上方**。
 *
 * 为什么不摆在台面角落：盆体已经吃掉台面正中，立式沥水架再占一段台面，
 * 从起居区看过来的那条 4.4 m 台面线就被切成两段；跨在盆上则完全不占地，
 * 洗完的碗滴水直接滴回盆里 —— 这是这套做法真正的好处。
 */
function buildDishRack(g: THREE.Group, m: KitchenMats): void {
  const barR = 0.008;
  const railR = 0.011;
  const barY = KITCHEN.counterH + barR;
  const railY = KITCHEN.counterH + barR * 2 + railR;
  /** 两条纵杆落在洞口之外的 4 cm 石材上 —— 跨度必须大于洞口，否则杆会架空 */
  const halfX = SINK_HOLE_W / 2 + 0.04;

  for (const [i, sx] of [-1, 1].entries()) {
    addMesh(
      g,
      cylinder(railR, railR, 0.42, m.metal, 10),
      KITCHEN.sinkX + sx * halfX,
      railY,
      RUN_Z,
      { name: `dog-kitchen-rack-rail-${i}`, cast: false },
    );
  }
  for (let i = 0; i < 5; i++) {
    const bar = cylinder(barR, barR, halfX * 2 + 0.02, m.metal, 8);
    bar.rotation.z = Math.PI / 2;
    // 横条间距 8 cm：碗口朝下能卡住，盘子立着也不会互相压
    addMesh(g, bar, KITCHEN.sinkX, barY, RUN_Z - 0.16 + i * 0.08, {
      name: `dog-kitchen-rack-bar-${i}`,
      cast: false,
    });
  }
}

// ---------------------------------------------------------------- 岛台与吧台凳

function buildIsland(g: THREE.Group, m: KitchenMats): void {
  const topT = 0.05;
  const toeH = 0.1;
  const bodyTopY = ISLAND.h - topT;
  const bodyY = (toeH + bodyTopY) / 2;
  const bodyH = bodyTopY - toeH;

  addMesh(g, roundedBox(ISLAND.w, bodyH, ISLAND.d, 0.02, m.island), ISLAND.x, bodyY, ISLAND.z, {
    name: 'dog-island-body',
  });
  // 踢脚四面内收 8 cm：岛台四面都能看到，两个方向都得缩，否则站在座位侧会看到柜体直接坐在砖缝上
  addMesh(g, box(ISLAND.w - 0.16, toeH, ISLAND.d - 0.16, m.black), ISLAND.x, toeH / 2, ISLAND.z, {
    name: 'dog-island-toe',
  });
  // 出挑台面：四周各 6 cm。座位侧是膝位，另外三面是为了让台面「压住」柜体（悬挑也让岛台显轻）
  addMesh(g, box(ISLAND.w + 0.12, topT, ISLAND.d + 0.12, m.islandStone), ISLAND.x, ISLAND.h - topT / 2, ISLAND.z, {
    name: 'dog-island-top',
  });

  /**
   * 门缝与拉手放在**朝厨房跑道的那一面**（+z）：座位侧（-z，三张凳子那边）留白，
   * 坐着的人腿前面是一整块木板，而不是一排拉手硌膝盖。
   * 三扇门是 2.2 m 的合理切法（0.73 m/扇），和靠墙那排五扇门同一个尺度感。
   */
  const faceZ = ISLAND.z + ISLAND.d / 2;
  const doorCount = 3;
  const doorW = ISLAND.w / doorCount;
  for (let i = 1; i < doorCount; i++) {
    addMesh(g, box(0.012, bodyH - 0.06, 0.01, m.black), ISLAND.x - ISLAND.w / 2 + doorW * i, bodyY, faceZ + 0.004, {
      name: `dog-island-seam-${i}`,
      cast: false,
    });
  }
  for (let i = 0; i < doorCount; i++) {
    addMesh(g, box(0.018, 0.18, 0.022, m.hardware), ISLAND.x - ISLAND.w / 2 + doorW * (i + 1) - 0.1, bodyTopY - 0.15, faceZ + 0.01, {
      name: `dog-island-handle-${i}`,
    });
  }

  /**
   * 三张吧台凳：细金属杆 + 圆形木座 + 脚踏圈。
   *
   * 座高 0.66（top 0.68）配 0.94 的岛台，是「座面比台面低 0.26」这条吧台标准比例；
   * 座面用与柜门同一块浅橡木（`m.cabinet`），把凳子读成柜体的延伸而不是另一套家具；
   * 脚踏圈放在 0.24 —— 0.68 的座高脚是悬空的，没有脚踏圈坐不住。
   */
  for (const [i, stool] of STOOLS.entries()) {
    addMesh(g, cylinder(0.17, 0.17, 0.045, m.cabinet, 22), stool.x, 0.66, stool.z, { name: `dog-stool-seat-${i}` });
    addMesh(g, cylinder(0.018, 0.022, 0.62, m.hardware, 12), stool.x, 0.34, stool.z, {
      name: `dog-stool-stem-${i}`,
    });
    addMesh(g, cylinder(0.155, 0.175, 0.03, m.hardware, 20), stool.x, 0.015, stool.z, {
      name: `dog-stool-base-${i}`,
      cast: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.009, 8, 22), m.hardware);
    ring.rotation.x = Math.PI / 2;
    addMesh(g, ring, stool.x, 0.24, stool.z, { name: `dog-stool-ring-${i}`, cast: false });
  }
}

// ---------------------------------------------------------------- 冰箱与鞋柜

function buildFridge(g: THREE.Group, m: KitchenMats): void {
  /** 机身抬起 5 cm 坐在深色底座上：真机的门不许擦地，画面上也让冰箱「落」得稳 */
  const plinthH = 0.05;
  const bodyH = FRIDGE.h - plinthH;
  const faceZ = FRIDGE.z - FRIDGE.d / 2;

  addMesh(g, roundedBox(FRIDGE.w, bodyH, FRIDGE.d, 0.03, m.metal), FRIDGE.x, plinthH + bodyH / 2, FRIDGE.z, {
    name: 'dog-fridge-body',
  });
  addMesh(g, box(FRIDGE.w - 0.08, plinthH, FRIDGE.d - 0.1, m.black), FRIDGE.x, plinthH / 2, FRIDGE.z + 0.02, {
    name: 'dog-fridge-plinth',
    cast: false,
  });

  // 上下门分缝：取 0.62 h（冷藏门在上、冷冻抽屉在下），0.012 的缝在这台 1.95 高的柜体上刚好读得出来
  addMesh(g, box(FRIDGE.w + 0.012, 0.012, 0.012, m.black), FRIDGE.x, FRIDGE.h * 0.62, faceZ - 0.004, {
    name: 'dog-fridge-seam',
    cast: false,
  });
  /**
   * 两个竖向拉手：都靠**西侧**（厨房那一侧）。人是从厨房跑道过来开冰箱的，
   * 拉手放在远端就得绕到冰箱东边的入户门前面去 —— 一条本来不存在的动线。
   */
  for (const [i, y] of [FRIDGE.h * 0.78, FRIDGE.h * 0.4].entries()) {
    addMesh(g, box(0.026, 0.42, 0.03, m.hardware), FRIDGE.x - FRIDGE.w / 2 + 0.1, y, faceZ - 0.014, {
      name: `dog-fridge-handle-${i}`,
    });
  }
}

function buildShoeCabinet(g: THREE.Group, m: KitchenMats): void {
  const topT = 0.03;
  const toeH = 0.08;
  const bodyTopY = SHOE_CABINET.h - topT;
  const bodyY = (toeH + bodyTopY) / 2;
  const bodyH = bodyTopY - toeH;
  /** 门面朝屋内（南墙在 +z 侧） */
  const faceZ = SHOE_CABINET.z - SHOE_CABINET.d / 2;

  addMesh(g, roundedBox(SHOE_CABINET.w, bodyH, SHOE_CABINET.d, 0.02, m.cabinet), SHOE_CABINET.x, bodyY, SHOE_CABINET.z, {
    name: 'dog-shoe-cabinet-body',
  });
  // 内收踢脚比柜体浅 5 cm：鞋柜是要踢着关门的，底下留出脚伸进去的空间
  addMesh(g, box(SHOE_CABINET.w - 0.08, toeH, SHOE_CABINET.d - 0.06, m.black), SHOE_CABINET.x, toeH / 2, SHOE_CABINET.z + 0.02, {
    name: 'dog-shoe-cabinet-toe',
    cast: false,
  });
  /**
   * 台面：石材，每边比柜体大 1.5 cm。
   * 不做石材台面而只留木板的话，1.1 m 高的鞋柜会被读成「一个矮柜子」；
   * 加上这 3 cm 厚的石头，它才像进门处那条「可以放东西的边」。
   */
  addMesh(g, box(SHOE_CABINET.w + 0.03, topT, SHOE_CABINET.d + 0.03, m.shoeStone), SHOE_CABINET.x, SHOE_CABINET.h - topT / 2, SHOE_CABINET.z, {
    name: 'dog-shoe-cabinet-top',
  });

  const doorW = SHOE_CABINET.w / 2;
  addMesh(g, box(0.012, bodyH - 0.06, 0.01, m.black), SHOE_CABINET.x, bodyY, faceZ - 0.004, {
    name: 'dog-shoe-cabinet-seam',
    cast: false,
  });
  for (const [i, sx] of [-1, 1].entries()) {
    addMesh(g, box(0.018, 0.14, 0.022, m.hardware), SHOE_CABINET.x + sx * (doorW / 2 - 0.05), bodyTopY - 0.14, faceZ - 0.01, {
      name: `dog-shoe-cabinet-handle-${i}`,
    });
  }

  /**
   * 摆件：一只陶碗 + 一个钥匙盘。
   *
   * 鞋柜台面是全屋最容易被「随手放东西」的地方：空着不像有人住，堆满又不像日式。
   * 两个小件刚好 —— 陶碗（`ceramicBlue`，日式釉色）在西端，钥匙盘正对入户门，
   * 是进门第一件放下的东西。陶碗用实心锥体 + 一圈口沿，不做中空：
   * 单面材质下，中空碗的内壁会被背面剔除，从上方看会直接看穿。
   */
  const topY = SHOE_CABINET.h;
  addMesh(g, cylinder(0.085, 0.05, 0.07, m.glaze, 24), SHOE_CABINET.x - 0.28, topY + 0.035, SHOE_CABINET.z, {
    name: 'dog-shoe-bowl',
  });
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.006, 8, 24), m.glaze);
  lip.rotation.x = Math.PI / 2;
  addMesh(g, lip, SHOE_CABINET.x - 0.28, topY + 0.07, SHOE_CABINET.z, { name: 'dog-shoe-bowl-lip', cast: false });
  addMesh(g, box(0.17, 0.014, 0.12, m.hardware), SHOE_CABINET.x + 0.26, topY + 0.007, SHOE_CABINET.z, {
    name: 'dog-shoe-key-tray',
    cast: false,
  });
}
