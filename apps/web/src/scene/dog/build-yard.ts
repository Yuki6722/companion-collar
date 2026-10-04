/**
 * 狗版院子：草坪（带池塘洞）、木栅栏、石板路、树木、灌木与绿篱、
 * 休闲区（藤架 + 躺椅 + 小桌）、池塘、石灯笼、草坪灯。
 *
 * 三条贯穿全文件的取舍：
 *
 * 1. **成片重复的东西一律实例化**。栅栏竖板、草簇、花、池边卵石、树冠团块、灌木叶球
 *    合计上千个实例。全部当独立网格的话绘制调用会翻十倍，而它们的几何与材质完全相同
 *    —— 正是 `InstancedMesh` 的用例（见 `instancing.ts`）。
 *
 * 2. **散布必须可复现**。所有随机取自固定种子，同一版代码每次打开草簇位置完全一致；
 *    否则「截图核对」这件事失去意义。
 *
 * 3. **草坪是带洞的 ShapeGeometry，不是一块盖住池塘的方板**。
 *    池塘必须真的是一个坑：水面低于地面、能看到池壁 —— 用一块平板把水面盖住的做法，
 *    在任何低机位下都会露馅。
 *
 * ⚠️ ShapeGeometry 的 UV 是**形状坐标本身（米）**而不是 0–1，因此草坪的贴图平铺次数
 * 传 `1 / 每格米数`（`GardenMaterials.surface` 刻意不取整，就是为了这条路）。
 * 另外 `rotation.x = -π/2` 把局部 (x, y) 映到世界 (x, 0, **-y**)，所以洞里用的
 * 局部 y 是 **世界 z 取负**。
 */
import * as THREE from 'three';
import type { MaterialLibrary } from '../materials.ts';
import { addMesh, box, group, roundedBox } from '../util.ts';
import {
  BOULDERS,
  BUSHES,
  LOUNGE_CHAIR,
  LOUNGE_PAD,
  PATH_LIGHTS,
  PATHS,
  PERGOLA,
  PERGOLA_POSTS,
  POND,
  ROOM,
  SIDE_TABLE,
  STONE_LANTERN,
  TREES,
  YARD,
  type TreeSpec,
} from './layout-dog.ts';
import type { GardenMaterials } from './garden-materials.ts';
import { addInstanced, between, seededRng, type Placement } from './instancing.ts';

/** 草坪贴图一格代表多少米。 */
const GRASS_TILE_M = 1.8;
/** 院子地面的高度（= 草坪上表面）。 */
const G = YARD.groundY;
/** 池塘水面相对地面的下沉量。 */
const POND_WATER_DROP = 0.12;
/** 池底相对地面的下沉量。 */
const POND_FLOOR_DROP = 0.3;

export interface YardResult {
  /** 需要深度细分（草簇 / 花）的实例宿主：低画质档整体隐藏 */
  detail: THREE.Group;
}

/**
 * @param detail 低画质档传 false：跳过草簇与花这类纯装饰实例（省掉上千个实例的填充开销）
 */
export function buildYard(
  root: THREE.Group,
  mats: MaterialLibrary,
  garden: GardenMaterials,
  detail: boolean,
): YardResult {
  const yard = group('dog-yard');
  root.add(yard);
  const detailGroup = group('yard-detail');
  detailGroup.visible = detail;
  yard.add(detailGroup);

  buildLawn(yard, garden);
  buildDistantGround(yard, garden);
  buildPond(yard, garden, mats);
  buildPaths(yard, garden);
  buildFence(yard, garden);
  buildTrees(yard, garden);
  buildBushes(yard, garden);
  buildLounge(yard, garden, mats);
  buildStoneLantern(yard, garden);
  buildPathLights(yard, garden, mats);
  if (detail) buildGrassTufts(detailGroup, garden);

  return { detail: detailGroup };
}

// ---------------------------------------------------------------- 草坪

/** 世界 z → ShapeGeometry 局部 y。见文件头第 3 条。 */
function localY(worldZ: number): number {
  return -worldZ;
}

function buildLawn(yard: THREE.Group, garden: GardenMaterials): void {
  const halfW = YARD.width / 2;
  const zNear = -ROOM.depth / 2;
  const zFar = YARD.fenceZ;

  const shape = new THREE.Shape();
  shape.moveTo(-halfW, localY(zNear));
  shape.lineTo(halfW, localY(zNear));
  shape.lineTo(halfW, localY(zFar));
  shape.lineTo(-halfW, localY(zFar));
  shape.closePath();

  const hole = new THREE.Path();
  hole.absellipse(POND.x, localY(POND.z), POND.rx, POND.rz, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ShapeGeometry(shape, 48);
  const mesh = new THREE.Mesh(geo, garden.surface('grass', 1 / GRASS_TILE_M, 1 / GRASS_TILE_M));
  mesh.rotation.x = -Math.PI / 2; // 局部 (x, y) → 世界 (x, 0, -y)
  mesh.position.y = G;
  mesh.receiveShadow = true;
  mesh.name = 'yard-lawn';
  yard.add(mesh);
}

/**
 * 院子之外的远景地面。
 *
 * 为什么必须有：没有它，院子与房子就是**悬在天上的一块板** —— 从院子机位
 * （相机在院外、y ≈ 4.4 m）越过栅栏看过去，地平线会露出天空底色，
 * 「房子盖在地上」这条最基本的读法当场断掉。
 *
 * 它与草坪共用同一张带池塘洞的形状（比草坪低 2 cm、范围放大到 280 m）：
 * 洞必须跟着挖，否则这层远景地面会从草坪的洞底下冒出来、把池塘填平。
 * 平铺格放大到 6 m：远景不需要细节，格太小还会在远处闪。
 */
function buildDistantGround(yard: THREE.Group, garden: GardenMaterials): void {
  const span = 140;

  const shape = new THREE.Shape();
  shape.moveTo(-span, -span);
  shape.lineTo(span, -span);
  shape.lineTo(span, span);
  shape.lineTo(-span, span);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absellipse(POND.x, localY(POND.z), POND.rx, POND.rz, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), garden.surface('grass', 1 / 6, 1 / 6, { color: 0xa9bb8a }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = G - 0.02;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.name = 'yard-distant-ground';
  yard.add(mesh);
  // 这一层不接收阴影：2048 的阴影贴图摊到 280 m 上必然糊，反而出现条纹
}

// ---------------------------------------------------------------- 池塘

/**
 * 池塘：池壁 + 池底 + 水面 + 岸边压顶石 + 睡莲 + 水生植物 + 置石。
 *
 * 水面刻意**低于草坪 0.12 m**：这 0.12 m 的落差是「这是一个坑」的全部视觉证据。
 * 池壁用开口圆柱并给材质开双面（见 `garden-materials.ts` 的 `basin` 分支）。
 */
function buildPond(yard: THREE.Group, garden: GardenMaterials, mats: MaterialLibrary): void {
  const g = group('yard-pond');
  yard.add(g);

  const wallTop = G + 0.02;
  const wallH = 0.36;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.84, wallH, 44, 1, true), garden.plain('basin'));
  // 池口半径比草坪洞略大 2%：从任何角度看都不会露出草坪与池壁之间的缝
  wall.scale.set(POND.rx * 1.02, 1, POND.rz * 1.02);
  wall.position.set(POND.x, wallTop - wallH / 2, POND.z);
  wall.name = 'pond-wall';
  wall.receiveShadow = true;
  g.add(wall);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 44), garden.plain('pebble'));
  floor.rotation.x = -Math.PI / 2;
  floor.scale.set(POND.rx * 0.86, POND.rz * 0.86, 1);
  floor.position.set(POND.x, G - POND_FLOOR_DROP, POND.z);
  floor.name = 'pond-floor';
  floor.receiveShadow = true;
  g.add(floor);

  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 44), mats.plain('water'));
  water.rotation.x = -Math.PI / 2;
  water.scale.set(POND.rx * 0.97, POND.rz * 0.97, 1);
  water.position.set(POND.x, G - POND_WATER_DROP, POND.z);
  water.name = 'pond-water';
  water.receiveShadow = false;
  g.add(water);

  const rand = seededRng(9001);
  // 岸边压顶石：沿椭圆一圈，逐块错开角度与埋深（等距排一圈会读成"齿轮"）
  const rim: Placement[] = [];
  const rimCount = 34;
  for (let i = 0; i < rimCount; i++) {
    const a = (i / rimCount) * Math.PI * 2 + between(rand, -0.05, 0.05);
    const rx = POND.rx * between(rand, 1.0, 1.07);
    const rz = POND.rz * between(rand, 1.0, 1.07);
    rim.push({
      x: POND.x + Math.cos(a) * rx,
      y: G + between(rand, -0.06, -0.01),
      z: POND.z + Math.sin(a) * rz,
      rotX: between(rand, 0, Math.PI),
      rotY: between(rand, 0, Math.PI * 2),
      rotZ: between(rand, 0, Math.PI),
      scale: [between(rand, 0.13, 0.2), between(rand, 0.08, 0.12), between(rand, 0.13, 0.2)],
    });
  }
  addInstanced(g, 'pond-rim-stones', new THREE.IcosahedronGeometry(1, 1), garden.plain('pebble'), rim);

  // 睡莲：贴着水面，几片圆叶 + 两朵花
  const pads: Placement[] = [];
  for (let i = 0; i < 7; i++) {
    const a = between(rand, 0, Math.PI * 2);
    const r = between(rand, 0.1, 0.72);
    pads.push({
      x: POND.x + Math.cos(a) * POND.rx * r,
      y: G - POND_WATER_DROP + 0.012,
      z: POND.z + Math.sin(a) * POND.rz * r,
      rotY: between(rand, 0, Math.PI * 2),
      scale: [between(rand, 0.1, 0.16), 1, between(rand, 0.1, 0.16)],
    });
  }
  addInstanced(g, 'pond-lily-pads', new THREE.CylinderGeometry(1, 1, 0.012, 12), garden.plain('foliage'), pads, {
    cast: false,
  });

  // 水生植物（芦苇 / 鸢尾叶）：集中在池的西北侧，成丛
  const reeds: Placement[] = [];
  for (let i = 0; i < 42; i++) {
    const a = between(rand, Math.PI * 0.35, Math.PI * 1.55);
    const rx = POND.rx * between(rand, 0.92, 1.16);
    const rz = POND.rz * between(rand, 0.92, 1.16);
    const h = between(rand, 0.34, 0.72);
    reeds.push({
      x: POND.x + Math.cos(a) * rx,
      y: G + h / 2 - 0.05,
      z: POND.z + Math.sin(a) * rz,
      rotZ: between(rand, -0.16, 0.16),
      rotY: between(rand, 0, Math.PI * 2),
      scale: [between(rand, 0.6, 1.1), h, between(rand, 0.6, 1.1)],
    });
  }
  addInstanced(g, 'pond-reeds', new THREE.ConeGeometry(0.022, 1, 5), garden.plain('foliage'), reeds);

  // 池边置石：用不规则多面体 + 各轴不同缩放，避免读成"球"
  const boulders: Placement[] = BOULDERS.map((b, i) => ({
    x: b.x,
    y: G + b.r * 0.35,
    z: b.z,
    rotX: between(rand, 0, Math.PI),
    rotY: between(rand, 0, Math.PI * 2),
    rotZ: between(rand, 0, Math.PI),
    scale: [b.r * 1.15, b.r * 0.8, b.r * 0.95] as [number, number, number],
    color: i % 2 === 0 ? 0x8f8c86 : 0x7d7a74,
  }));
  addInstanced(g, 'pond-boulders', new THREE.IcosahedronGeometry(1, 1), garden.plain('lanternStone'), boulders);
}

// ---------------------------------------------------------------- 石板路

/**
 * 石板路：沿折线每 0.62 m 铺一块，逐块错开角度、尺寸与横向偏移。
 *
 * 为什么要错开：等距同向铺出来的是一条"斑马线"，而院子里的汀步是**踩出来的**。
 * 石板只是略微高出草面 3–4 cm，不构成踏步（也不参与「挡道」判定，见布局的 `flat`）。
 */
function buildPaths(yard: THREE.Group, garden: GardenMaterials): void {
  const g = group('yard-paths');
  yard.add(g);
  const rand = seededRng(9002);
  const slabs: Placement[] = [];

  for (const path of PATHS) {
    const pts = path.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) continue;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      const steps = Math.max(1, Math.round(len / 0.62));
      for (let k = 0; k < steps; k++) {
        const t = (k + 0.5) / steps;
        // 垂直于前进方向的小偏移：让石板不是钉在一条直线上
        const nx = -dz / len;
        const nz = dx / len;
        const off = between(rand, -0.07, 0.07);
        const yaw = Math.atan2(dx, dz) + between(rand, -0.16, 0.16);
        slabs.push({
          x: a[0] + dx * t + nx * off,
          y: G + 0.014,
          z: a[1] + dz * t + nz * off,
          rotY: yaw,
          rotZ: between(rand, -0.02, 0.02),
          scale: [between(rand, 0.86, 1.12), 1, between(rand, 0.88, 1.15)],
        });
      }
    }
  }
  addInstanced(
    g,
    'yard-path-slabs',
    new THREE.BoxGeometry(0.5, 0.055, 0.42),
    garden.surface('paving', 1, 1),
    slabs,
  );
}

// ---------------------------------------------------------------- 栅栏

/**
 * 木栅栏：三段（西、北、东）围合，只在南侧留出房屋本身。
 *
 * 板面用一张**竖向板条贴图**而不是逐根竖板实例化：两者观感接近，
 * 但贴图版只需 3 个盒体 —— 而栅栏在这个场景里几乎从不进入近景。
 * 立柱与压顶另行建出，于是「一排柱子 + 一道板墙 + 一道压顶」的读法成立。
 */
function buildFence(yard: THREE.Group, garden: GardenMaterials): void {
  const g = group('yard-fence');
  yard.add(g);
  const wood = garden.plain('gardenWood');
  const zNear = -ROOM.depth / 2;
  const zFar = YARD.fenceZ;
  const halfW = YARD.width / 2;
  const boardH = 1.42;
  const boardBottom = G + 0.16;
  const capY = G + YARD.fenceHeight - 0.04;

  const runs: ReadonlyArray<{ id: string; x: number; z: number; len: number; alongX: boolean }> = [
    { id: 'west', x: -halfW, z: (zNear + zFar) / 2, len: zNear - zFar, alongX: false },
    { id: 'east', x: halfW, z: (zNear + zFar) / 2, len: zNear - zFar, alongX: false },
    { id: 'north', x: 0, z: zFar, len: YARD.width, alongX: true },
  ];

  for (const run of runs) {
    // 板面：沿墙方向的平铺次数按板条宽度（约 9 cm）折算，贴图里一格里 8 根板
    const repeatAlong = run.len / (0.09 * 8);
    const mat = garden.surface('fence', repeatAlong, boardH / 1.2);
    const panel = run.alongX
      ? box(run.len, boardH, 0.045, mat)
      : box(0.045, boardH, run.len, mat);
    addMesh(g, panel, run.x, boardBottom + boardH / 2, run.z, { name: `fence-board-${run.id}` });
    // 压顶（比板面宽一点，形成一道影子线）
    const cap = run.alongX ? box(run.len + 0.1, 0.07, 0.14, wood) : box(0.14, 0.07, run.len + 0.1, wood);
    addMesh(g, cap, run.x, capY, run.z, { name: `fence-cap-${run.id}` });
    // 底梁
    const rail = run.alongX ? box(run.len, 0.07, 0.1, wood) : box(0.1, 0.07, run.len, wood);
    addMesh(g, rail, run.x, boardBottom + 0.04, run.z, { name: `fence-rail-${run.id}` });
  }

  // 立柱：约每 1.9 m 一根
  const posts: Placement[] = [];
  const addPosts = (fromX: number, fromZ: number, toX: number, toZ: number, len: number): void => {
    const count = Math.max(2, Math.round(len / 1.9) + 1);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      posts.push({
        x: fromX + (toX - fromX) * t,
        y: G + YARD.fenceHeight / 2,
        z: fromZ + (toZ - fromZ) * t,
        scale: [0.1, YARD.fenceHeight, 0.1],
      });
    }
  };
  addPosts(-halfW, zNear, -halfW, zFar, zNear - zFar);
  addPosts(halfW, zNear, halfW, zFar, zNear - zFar);
  addPosts(-halfW, zFar, halfW, zFar, YARD.width);
  addInstanced(g, 'fence-posts', new THREE.BoxGeometry(1, 1, 1), wood, posts, { receive: true });
}

// ---------------------------------------------------------------- 树与灌木

/**
 * 树：树干 + 三根主枝 + 一组树冠团块。
 *
 * 树冠刻意用**多个不规则团块**而不是一棵球：单个球在轮廓上立刻读成"棒棒糖"。
 * 团块用二级二十面体（`IcosahedronGeometry(1, 2)`）——面数够出圆润轮廓，
 * 又比 UV 球省一半顶点，且不需要正确的 UV（树叶贴图是各向同性的）。
 */
function buildTrees(yard: THREE.Group, garden: GardenMaterials): void {
  const g = group('yard-trees');
  yard.add(g);
  const rand = seededRng(9003);

  for (const tree of TREES) {
    const tg = group(tree.id);
    tg.position.set(tree.x, G, tree.z);
    g.add(tg);

    // 树干：底粗上细，微微倾斜
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.21, tree.trunkH, 12),
      garden.plain('bark'),
    );
    trunk.position.set(0, tree.trunkH / 2, 0);
    trunk.name = `${tree.id}-trunk`;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tg.add(trunk);

    // 主枝：从树干顶端向外斜出三根
    const branchCount = 3;
    for (let i = 0; i < branchCount; i++) {
      const a = (i / branchCount) * Math.PI * 2 + tree.x * 0.7;
      const len = tree.canopyY - tree.trunkH + 0.7;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, len, 8), garden.plain('bark'));
      branch.position.set(Math.cos(a) * len * 0.16, tree.trunkH + len * 0.42, Math.sin(a) * len * 0.16);
      branch.rotation.set(Math.sin(a) * 0.42, 0, -Math.cos(a) * 0.42);
      branch.name = `${tree.id}-branch-${i}`;
      branch.castShadow = true;
      tg.add(branch);
    }

    const blobs: Placement[] = [];
    for (let i = 0; i < tree.blobs; i++) {
      // 第一团压在树冠中心，其余绕它错落，形成不规则的团簇
      const first = i === 0;
      const a = (i / Math.max(1, tree.blobs - 1)) * Math.PI * 2 + 0.6;
      const radial = first ? 0 : between(rand, 0.22, 0.5) * tree.canopyR;
      const scale = first ? tree.canopyR * 0.78 : between(rand, 0.42, 0.66) * tree.canopyR;
      blobs.push({
        x: Math.cos(a) * radial,
        y: tree.canopyY + (first ? 0 : between(rand, -0.34, 0.34) * tree.canopyR),
        z: Math.sin(a) * radial,
        rotX: between(rand, 0, Math.PI),
        rotY: between(rand, 0, Math.PI * 2),
        scale: [scale, scale * between(rand, 0.7, 0.92), scale],
      });
    }
    addInstanced(
      tg,
      `${tree.id}-canopy`,
      new THREE.IcosahedronGeometry(1, 2),
      garden.plain(tree.foliage === 'warm' ? 'foliageWarm' : 'foliage'),
      blobs,
    );
  }
}

/** 灌木与绿篱：每丛 3 个叶球，压在近地高度（灌木的剪影是"矮而宽"）。 */
function buildBushes(yard: THREE.Group, garden: GardenMaterials): void {
  const g = group('yard-bushes');
  yard.add(g);
  const rand = seededRng(9004);
  const blobs: Placement[] = [];

  for (const bush of BUSHES) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + bush.x;
      const radial = i === 0 ? 0 : bush.r * 0.42;
      const scale = i === 0 ? bush.r * 0.92 : bush.r * between(rand, 0.55, 0.78);
      blobs.push({
        x: bush.x + Math.cos(a) * radial,
        y: G + bush.h * (i === 0 ? 0.52 : between(rand, 0.34, 0.62)),
        z: bush.z + Math.sin(a) * radial,
        rotX: between(rand, 0, Math.PI),
        rotY: between(rand, 0, Math.PI * 2),
        scale: [scale, scale * between(rand, 0.72, 0.95), scale],
      });
    }
  }
  addInstanced(g, 'yard-bush-blobs', new THREE.IcosahedronGeometry(1, 1), garden.plain('foliage'), blobs);
}

// ---------------------------------------------------------------- 休闲区

/**
 * 休闲区：砾石地坪（含木压边）+ 藤架 + 木条躺椅 + 小圆桌。
 *
 * 藤架的立柱位置直接取自 `PERGOLA_POSTS` —— 布局文件里那四个点同时被
 * `check-layout-dog.mjs` 用作「立柱不许压住石板路与小径」的判定依据。
 */
function buildLounge(yard: THREE.Group, garden: GardenMaterials, mats: MaterialLibrary): void {
  const g = group('yard-lounge');
  yard.add(g);
  const wood = garden.plain('gardenWood');
  const stone = garden.plain('lanternStone');

  // 砾石地坪：比草面高 5 mm，四周一圈木压边
  addMesh(
    g,
    box(LOUNGE_PAD.w, 0.03, LOUNGE_PAD.d, garden.surface('gravel', LOUNGE_PAD.w / 1.1, LOUNGE_PAD.d / 1.1)),
    LOUNGE_PAD.x,
    G + 0.013,
    LOUNGE_PAD.z,
    { name: 'lounge-pad', cast: false },
  );
  const edge = 0.06;
  addMesh(g, box(LOUNGE_PAD.w + edge * 2, 0.07, edge, wood), LOUNGE_PAD.x, G + 0.01, LOUNGE_PAD.z - LOUNGE_PAD.d / 2, {
    name: 'lounge-pad-edge-n',
    cast: false,
  });
  addMesh(g, box(LOUNGE_PAD.w + edge * 2, 0.07, edge, wood), LOUNGE_PAD.x, G + 0.01, LOUNGE_PAD.z + LOUNGE_PAD.d / 2, {
    name: 'lounge-pad-edge-s',
    cast: false,
  });
  for (const sx of [-1, 1]) {
    addMesh(g, box(edge, 0.07, LOUNGE_PAD.d, wood), LOUNGE_PAD.x + (sx * LOUNGE_PAD.w) / 2, G + 0.01, LOUNGE_PAD.z, {
      name: 'lounge-pad-edge-w',
      cast: false,
    });
  }

  // 藤架
  const postH = PERGOLA.postH;
  for (const [i, post] of PERGOLA_POSTS.entries()) {
    addMesh(g, box(0.1, postH, 0.1, wood), post.x, G + postH / 2, post.z, { name: `pergola-post-${i}` });
    // 柱脚石：木柱直接插进土里会读成"临时搭的"
    addMesh(g, box(0.18, 0.09, 0.18, stone), post.x, G + 0.045, post.z, { name: `pergola-foot-${i}` });
  }
  // 两根主梁（沿 Z）+ 一排横条（沿 X）
  for (const sx of [-1, 1]) {
    addMesh(g, box(0.09, 0.12, PERGOLA.d + 0.24, wood), PERGOLA.x + (sx * PERGOLA.w) / 2, G + postH + 0.06, PERGOLA.z, {
      name: 'pergola-beam',
    });
  }
  const slatCount = 9;
  for (let i = 0; i < slatCount; i++) {
    const z = PERGOLA.z - PERGOLA.d / 2 + (i / (slatCount - 1)) * PERGOLA.d;
    addMesh(g, box(PERGOLA.w + 0.34, 0.05, 0.07, wood), PERGOLA.x, G + postH + 0.14, z, {
      name: `pergola-slat-${i}`,
      cast: true,
    });
  }

  buildLoungeChair(g, garden, mats);
  buildSideTable(g, garden, mats);
}

/**
 * 木条躺椅：两侧边梁 + 座面木条 + 后仰靠背 + 扶手。
 *
 * 本地朝向：**椅长沿局部 +Z、脚在 +Z 端**，再由 `LOUNGE_CHAIR.rotY` 转成面朝东。
 * 靠背角度取 58°（坐深 1.7 m 的躺椅在 55°–62° 之间最好读）。
 */
function buildLoungeChair(parent: THREE.Group, garden: GardenMaterials, mats: MaterialLibrary): void {
  const g = group('lounge-chair');
  g.position.set(LOUNGE_CHAIR.x, G, LOUNGE_CHAIR.z);
  g.rotation.y = LOUNGE_CHAIR.rotY;
  parent.add(g);
  const wood = garden.plain('gardenWood');
  const canvas = garden.plain('canvas');

  const w = LOUNGE_CHAIR.w;
  const len = LOUNGE_CHAIR.len;
  const halfW = w / 2 - 0.03;
  const seatY = 0.34;

  // 四腿
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addMesh(g, box(0.05, seatY, 0.05, wood), sx * halfW, seatY / 2, sz * (len / 2 - 0.16), {
        name: 'lounge-leg',
      });
    }
  }
  // 两条边梁（座面骨架）
  for (const sx of [-1, 1]) {
    addMesh(g, box(0.055, 0.06, len - 0.1, wood), sx * halfW, seatY + 0.03, 0, { name: 'lounge-rail' });
  }
  // 座面木条：从局部 z = +0.62（脚端）排到 -0.22（坐骨处），留出靠背交界
  const seatSlats = 9;
  for (let i = 0; i < seatSlats; i++) {
    const z = 0.62 - (i / (seatSlats - 1)) * 0.86;
    addMesh(g, box(w, 0.028, 0.062, wood), 0, seatY + 0.075, z, { name: `lounge-seat-slat-${i}` });
  }
  // 靠背木条：绕座面后端上仰
  const backAngle = 1.01; // ≈58°
  const backSlats = 7;
  for (let i = 0; i < backSlats; i++) {
    const d = 0.09 + i * 0.088;
    const slat = addMesh(
      g,
      box(w, 0.028, 0.062, wood),
      0,
      seatY + 0.075 + Math.cos(backAngle) * d,
      -0.26 - Math.sin(backAngle) * d,
      { name: `lounge-back-slat-${i}` },
    );
    slat.rotation.x = -backAngle + Math.PI / 2;
  }
  // 靠背侧撑 + 扶手
  for (const sx of [-1, 1]) {
    const strut = addMesh(g, box(0.05, 0.05, 0.86, wood), sx * halfW, seatY + 0.45, -0.62, {
      name: 'lounge-back-strut',
    });
    strut.rotation.x = -backAngle + Math.PI / 2;
    addMesh(g, box(0.05, 0.045, 0.72, wood), sx * halfW, seatY + 0.26, 0.06, { name: 'lounge-armrest' });
    addMesh(g, box(0.05, 0.24, 0.05, wood), sx * halfW, seatY + 0.15, -0.28, { name: 'lounge-armrest-post' });
  }
  // 搭在椅背上的一条折好的毛巾：空椅子看起来像展品
  const towel = addMesh(g, roundedBox(0.3, 0.05, 0.42, 0.02, canvas), 0, seatY + 0.31, -0.52, {
    name: 'lounge-towel',
  });
  towel.rotation.x = -backAngle + Math.PI / 2;
  void mats;
}

/** 休闲小桌：圆桌面 + 三条斜腿 + 桌上的一只杯子和一本书。 */
function buildSideTable(parent: THREE.Group, garden: GardenMaterials, mats: MaterialLibrary): void {
  const g = group('side-table');
  g.position.set(SIDE_TABLE.x, G, SIDE_TABLE.z);
  parent.add(g);
  const wood = garden.plain('gardenWood');
  const h = SIDE_TABLE.h;
  const r = SIDE_TABLE.r;

  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 28), wood), 0, h - 0.02, 0, {
    name: 'side-table-top',
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, h - 0.04, 10), wood);
    leg.position.set(Math.cos(a) * r * 0.62, (h - 0.04) / 2, Math.sin(a) * r * 0.62);
    leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    leg.name = `side-table-leg-${i}`;
    leg.castShadow = true;
    g.add(leg);
  }
  // 杯子
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.033, 0.09, 18), mats.plain('ceramic')), -0.09, h + 0.045, 0.04, {
    name: 'side-table-cup',
  });
  // 书
  addMesh(g, box(0.15, 0.026, 0.21, mats.plain('bookA')), 0.07, h + 0.013, -0.05, { name: 'side-table-book' });
}

// ---------------------------------------------------------------- 石灯笼与草坪灯

/** 石灯笼：基础 + 柱 + 中台 + 火袋（四角柱撑起的灯室）+ 笠 + 宝顶。 */
function buildStoneLantern(yard: THREE.Group, garden: GardenMaterials): void {
  const g = group('stone-lantern');
  g.position.set(STONE_LANTERN.x, G, STONE_LANTERN.z);
  yard.add(g);
  const stone = garden.plain('lanternStone');
  const h = STONE_LANTERN.h;

  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.12, 8), stone), 0, 0.06, 0, { name: 'lantern-base' });
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, h * 0.42, 10), stone), 0, 0.12 + h * 0.21, 0, {
    name: 'lantern-shaft',
  });
  const platformY = 0.12 + h * 0.42;
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.07, 8), stone), 0, platformY + 0.035, 0, {
    name: 'lantern-platform',
  });
  const boxY = platformY + 0.07;
  // 火袋：四角立柱 + 顶板（做成立柱是让它真的像"能透光的灯室"）
  for (const [dx, dz] of [
    [-0.12, -0.12],
    [0.12, -0.12],
    [-0.12, 0.12],
    [0.12, 0.12],
  ] as const) {
    addMesh(g, box(0.045, 0.16, 0.045, stone), dx, boxY + 0.08, dz, { name: 'lantern-post' });
  }
  addMesh(g, box(0.32, 0.04, 0.32, stone), 0, boxY + 0.18, 0, { name: 'lantern-box-roof' });
  // 笠：四角锥
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.18, 4), stone);
  roof.position.set(0, boxY + 0.29, 0);
  roof.rotation.y = Math.PI / 4;
  roof.name = 'lantern-roof';
  roof.castShadow = true;
  g.add(roof);
  addMesh(g, new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), stone), 0, boxY + 0.42, 0, {
    name: 'lantern-finial',
  });
}

/** 草坪灯：一根矮柱 + 灯罩（自发光材质，白天也读得出是灯）。 */
function buildPathLights(yard: THREE.Group, garden: GardenMaterials, mats: MaterialLibrary): void {
  const g = group('yard-path-lights');
  yard.add(g);
  const post = mats.plain('metalDark');
  for (const [i, p] of PATH_LIGHTS.entries()) {
    addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.04, 16), post), p.x, G + 0.02, p.z, {
      name: `path-light-base-${i}`,
    });
    addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.62, 12), post), p.x, G + 0.33, p.z, {
      name: `path-light-post-${i}`,
    });
    addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.16, 14), garden.plain('lampGlow')), p.x, G + 0.72, p.z, {
      name: `path-light-lens-${i}`,
      cast: false,
    });
    addMesh(g, new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.08, 14), post), p.x, G + 0.84, p.z, {
      name: `path-light-cap-${i}`,
    });
  }
}

// ---------------------------------------------------------------- 草簇

/**
 * 草簇：草坪上撒一批细锥，让草地不只是"贴了张绿图"。
 *
 * 排布必须**避开**池塘、石板路与砾石地坪 —— 从草里长出来的石板
 * 是这一类程序化散布最常见的穿帮。这里用最朴素的拒绝采样：
 * 撒点 → 逐个判据 → 命中就丢弃。
 */
function buildGrassTufts(detailGroup: THREE.Group, garden: GardenMaterials): void {
  const rand = seededRng(9006);
  const tufts: Placement[] = [];
  const target = 260;
  let attempts = 0;

  while (tufts.length < target && attempts < target * 12) {
    attempts += 1;
    const x = between(rand, -YARD.width / 2 + 0.3, YARD.width / 2 - 0.3);
    const z = between(rand, YARD.fenceZ + 0.35, -ROOM.depth / 2 - 1.25);
    if (isOccupied(x, z)) continue;
    const h = between(rand, 0.09, 0.2);
    tufts.push({
      x,
      y: G + h / 2,
      z,
      rotZ: between(rand, -0.22, 0.22),
      rotY: between(rand, 0, Math.PI * 2),
      scale: [between(rand, 0.7, 1.3), h, between(rand, 0.7, 1.3)],
    });
  }
  addInstanced(detailGroup, 'yard-grass-tufts', new THREE.ConeGeometry(0.035, 1, 4), garden.plain('foliage'), tufts, {
    cast: false,
  });
}

/** 该点是否已被别的元素占住（草坪上不该再长草的地方）。 */
function isOccupied(x: number, z: number): boolean {
  // 池塘（按椭圆精确判定，用外接矩形会误杀一大圈草）
  const ex = (x - POND.x) / (POND.rx + 0.25);
  const ez = (z - POND.z) / (POND.rz + 0.25);
  if (ex * ex + ez * ez < 1) return true;

  // 石板路
  for (const path of PATHS) {
    if (distanceToPolyline(x, z, path.points) < 0.42) return true;
  }
  // 砾石地坪
  if (
    Math.abs(x - LOUNGE_PAD.x) < LOUNGE_PAD.w / 2 + 0.15 &&
    Math.abs(z - LOUNGE_PAD.z) < LOUNGE_PAD.d / 2 + 0.15
  ) {
    return true;
  }
  // （花坛与花丛已按用户反馈移除，因此这里不再需要避开花坛）
  // 树干与灌木根部
  for (const tree of TREES) {
    if (Math.hypot(x - tree.x, z - tree.z) < 0.5) return true;
  }
  for (const bush of BUSHES) {
    if (Math.hypot(x - bush.x, z - bush.z) < bush.r + 0.1) return true;
  }
  return false;
}

/** 点到折线的最短距离。 */
function distanceToPolyline(x: number, z: number, pts: ReadonlyArray<readonly [number, number]>): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    const t = len2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)));
  }
  return best;
}

/** 树冠团块的参考尺寸（供自检打印，不参与建模）。 */
export function treeCanopySpan(tree: TreeSpec): number {
  return tree.canopyR * 2;
}
