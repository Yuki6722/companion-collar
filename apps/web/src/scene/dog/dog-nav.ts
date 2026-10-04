/**
 * 狗的活动导航：**节点图 + 路径跟随**（纯数学，不依赖 three，也不碰 DOM）。
 *
 * 为什么不用「直接插值到目标点」：
 *   用户对狗提出了两条硬要求 —— **不能倒着走**、**不能从一个位置闪到另一个位置**。
 *   这两件事靠"动画时小心一点"是保不住的（猫版就踩过：位移按时间线秒推进，
 *   20× 倍率下 3 秒的走路在 0.15 秒内走完，肉眼看就是瞬移）。这里改成结构性保证：
 *
 *   1. **一切移动都走节点图**。节点是房间里被核对过的空地，边是核对过的走廊。
 *      狗只能在边上走，于是「穿墙」「穿过沙发」这类错误在数据层就不成立。
 *      通往院子的边**只有一条**（穿过推拉门开着的那一格），由审计断言把守。
 *
 *   2. **朝向恒等于前进方向**。`advance()` 每帧先按最大转头速率把朝向转向下一段路径的
 *      切线方向，**只有朝向与前进方向夹角足够小（cos > 0）时才推进位移**。
 *      于是位移永远落在朝向的前方：倒着走在数学上不可能发生，
 *      而"转弯时先停下来转、再走"恰好也是真狗的行为。
 *
 *   3. **位移上限 = 速度 × 真实帧时**。每帧最多走 `speed * dt`，没有任何捷径分支。
 *
 * 这三条都由 `scripts/check-dog-motion.mjs` 在 60 Hz 上逐帧模拟后断言 ——
 * 它们是**渲染层的事实**，而渲染层在沙箱里跑不起来，所以只能把它们做成纯函数再测。
 *
 * 坐标：与 `layout-dog.ts` 同一套（X 向右、Z 向观察者、单位米）。
 */
import {
  ENGAWA,
  FOOTPRINTS,
  HALF_D,
  SLIDING_DOOR_OPEN,
  YARD_BOUNDS,
  type Footprint,
} from './layout-dog.ts';

// ---------------------------------------------------------------- 节点

export interface NavNode {
  id: string;
  label: string;
  x: number;
  z: number;
  /**
   * 该节点允许"落在"哪些占地矩形里面。
   *
   * 为什么需要例外：狗的软垫与食盆本来就是**给它用的**，
   * 站到自己的垫子上、把鼻子伸进碗里都是正确行为，不该被判成"撞进家具"。
   * 其余所有实体（沙发、床、树、池塘…）一律不许进。
   */
  occupiable?: readonly string[];
  /** 节点语义，供 UI 与自检读 */
  kind: 'floor' | 'gear' | 'doorway' | 'deck' | 'lawn' | 'path';
}

/**
 * 推拉门开着的那一格的中心 x —— 进出院子的唯一通道。
 *
 * 它取自 `SLIDING_DOOR_OPEN` 而不是再抄一个数字：开门位置一旦挪动，
 * 导航节点、通道审计与画面必须同时跟着动，抄一份就必然漂移。
 */
const DOOR_X = SLIDING_DOOR_OPEN.center;
/** 北墙所在的 z（室内外分界）。 */
const WALL_Z = -HALF_D;
/** 木平台靠近房屋那一侧的 z。 */
const DECK_NEAR_Z = WALL_Z - 0.62;

/**
 * 手工核对过的节点：室内、门洞、木平台、石板路与狗自己的用品。
 *
 * ⚠️ 这一段**一个都不许删**：它们是室内外动线的骨架，也是门禁里
 * 「进院子只有推拉门这一条路」「每条边净距 ≥ 5 cm」这些断言长期核对过的走廊。
 * 下面的草坪格点是在它们**之外**补的一层，不是替换。
 */
const HAND_NODES: readonly NavNode[] = [
  // ---- 室内
  { id: 'entry', label: '玄关', x: 3.0, z: 2.65, kind: 'floor' },
  { id: 'south', label: '厨房前走道', x: 0.6, z: 2.4, kind: 'floor' },
  { id: 'living', label: '起居区', x: 0.5, z: 0.6, kind: 'floor' },
  { id: 'living-north', label: '起居区北侧', x: 0.4, z: -1.3, kind: 'floor' },
  { id: 'living-south', label: '沙发南侧', x: 2.6, z: 2.15, kind: 'floor' },
  { id: 'east-south', label: '电视柜南侧走道', x: 3.8, z: 1.2, kind: 'floor' },
  { id: 'east-north', label: '电视柜北侧走道', x: 3.8, z: -1.1, kind: 'floor' },
  { id: 'north', label: '推拉门前', x: 0.2, z: -2.85, kind: 'floor' },
  { id: 'north-west', label: '北窗与床之间', x: -1.9, z: -2.2, kind: 'floor' },
  // 卧室软垫的东侧绕行点：从北侧进睡眠区必须绕过狗自己的床边软垫
  { id: 'bedroom-east', label: '床边软垫东侧', x: -1.1, z: -1.9, kind: 'floor' },
  { id: 'bedroom', label: '睡眠区', x: -1.3, z: -0.6, kind: 'floor' },
  // ---- 门洞
  {
    id: 'doorway',
    label: '推拉门（开着的那一格）',
    x: DOOR_X,
    z: WALL_Z,
    kind: 'doorway',
  },
  // ---- 木平台
  { id: 'deck-in', label: '木平台（门内一步）', x: DOOR_X, z: DECK_NEAR_Z, kind: 'deck' },
  { id: 'deck-east', label: '木平台东端（台阶）', x: 1.3, z: ENGAWA.minZ + 0.35, kind: 'deck' },
  { id: 'yard-water', label: '院内水盆', x: 2.85, z: -4.25, kind: 'gear', occupiable: ['outdoorWater'] },
  // ---- 院子（沿石板路）
  { id: 'step', label: '台阶下', x: 1.3, z: -5.05, kind: 'lawn' },
  { id: 'path-a', label: '石板路 · 一', x: 1.2, z: -5.5, kind: 'path' },
  { id: 'path-b', label: '石板路 · 二', x: 0.9, z: -6.2, kind: 'path' },
  { id: 'path-c', label: '石板路 · 院心', x: 0.35, z: -6.9, kind: 'path' },
  { id: 'path-d', label: '石板路 · 西段', x: -0.45, z: -7.35, kind: 'path' },
  { id: 'pond-north', label: '池北岸', x: -2.35, z: -7.3, kind: 'path' },
  { id: 'pond-view', label: '池边（石灯笼旁）', x: -2.75, z: -6.55, kind: 'path' },
  { id: 'lounge-a', label: '东支路 · 一', x: 1.6, z: -6.1, kind: 'path' },
  { id: 'lounge-b', label: '东支路 · 二', x: 2.2, z: -6.4, kind: 'path' },
  { id: 'lounge', label: '休闲区', x: 3.4, z: -5.9, kind: 'lawn' },
  { id: 'meadow', label: '草坪西侧', x: -0.3, z: -9.2, kind: 'lawn' },
  { id: 'meadow-east', label: '草坪东侧', x: 1.3, z: -9.6, kind: 'lawn' },
  {
    id: 'elimination',
    label: '排泄角（院北草地）',
    x: 2.6,
    z: -10.4,
    kind: 'lawn',
  },
  // ---- 狗的用品（可以站上去 / 凑过去）
  { id: 'food', label: '食盆水盆前', x: 3.72, z: -1.15, kind: 'gear', occupiable: ['foodStation'] },
  { id: 'bed-main', label: '主软垫', x: -2.55, z: -2.85, kind: 'gear', occupiable: ['dogBedMain'] },
  { id: 'bed-sleep', label: '床边软垫', x: -1.85, z: -1.35, kind: 'gear', occupiable: ['dogBedSleep'] },
];

// ---------------------------------------------------------------- 草坪：几何判据

interface Rect2 {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * 点到占地的净距（椭圆按半轴归一化后按圆算，与 `check-dog-motion.mjs` 同一个公式）。
 *
 * 为什么生成器要自带一份距离函数：布点必须在**运行时**确定，因为障碍坐标来自
 * `layout-dog.ts` —— 那里挪一棵树、加一丛灌木，这里就得跟着重新剔点。
 * 门禁读的是同一份 `FOOTPRINTS`、用的是同一个公式（逐边按 5 cm 采样），
 * 所以这里提前剔掉不合格的候选，只是把门禁的判据前移，不是另立一套标准。
 */
function distanceToFootprint(x: number, z: number, f: Footprint): number {
  const e = f.ellipse;
  if (e) {
    const dx = (x - e.x) / e.rx;
    const dz = (z - e.z) / e.rz;
    const r = Math.hypot(dx, dz);
    return r <= 1 ? 0 : (r - 1) * Math.min(e.rx, e.rz);
  }
  const dx = Math.max(f.minX - x, 0, x - f.maxX);
  const dz = Math.max(f.minZ - z, 0, z - f.maxZ);
  return Math.hypot(dx, dz);
}

/** 挡路的占地：实心物件与水面。贴地装饰（石板、砾石地坪）与树冠**不挡道**。 */
const LAWN_BLOCKERS: readonly Footprint[] = FOOTPRINTS.filter(
  (f) => f.kind === 'solid' || f.kind === 'water',
);

/**
 * 木平台（含 0.15 m 余量）：草坪格点不铺到台上。
 *
 * 两个理由：① 台上已经有 `deck-in` / `deck-east` 两个核对过的节点，重复铺点只会在同一块
 * 木板上堆出一串零长边；② 平台前缘到草地之间有 0.3 m 的缓坡（见 `dog-behavior.ts` 的
 * `groundHeightAt`），节点落在缓坡上会让"脚下高度"变成一个含糊的值。
 */
const DECK_KEEPOUT: Rect2 = {
  minX: ENGAWA.minX - 0.15,
  maxX: ENGAWA.maxX + 0.15,
  minZ: ENGAWA.minZ - 0.15,
  maxZ: ENGAWA.maxZ,
};

function rectClearance(x: number, z: number, r: Rect2): number {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}

/** 点到**挡路实物**的净距（不含木平台）。连边判据用它 —— 平台本身是可以走上去的。 */
function blockerClearance(x: number, z: number): number {
  let worst = Number.POSITIVE_INFINITY;
  for (const f of LAWN_BLOCKERS) {
    const d = distanceToFootprint(x, z, f);
    if (d < worst) worst = d;
  }
  return worst;
}

/** 站位判据：还要额外离木平台边缘有余量（见 `DECK_KEEPOUT`）。 */
function nodeClearance(x: number, z: number): number {
  return Math.min(blockerClearance(x, z), rectClearance(x, z, DECK_KEEPOUT));
}

/**
 * 一条直线段全程的最小净距（每 5 cm 取一个样点）。
 *
 * 为什么按采样而不是按端点：两个端点都合格，中间照样可能贴着树干或草坪灯擦过去 ——
 * 门禁就是这么逐点判的，这里必须用同一把尺子，否则会出现"生成时合格、门禁说不合格"。
 */
function segmentClearance(a: Point2, b: Point2): number {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(len / 0.05));
  let worst = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const d = blockerClearance(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    if (d < worst) worst = d;
  }
  return worst;
}

// ---------------------------------------------------------------- 草坪：可达判据

/** 草坪格点域：院子边界内缩 5 cm（让开栅栏），南到北墙外 0.25 m，北到栅栏前。 */
const LAWN_DOMAIN: Rect2 = {
  minX: YARD_BOUNDS.minX + 0.05,
  maxX: YARD_BOUNDS.maxX - 0.05,
  minZ: YARD_BOUNDS.minZ + 0.05,
  maxZ: YARD_BOUNDS.maxZ - 0.25,
};

/**
 * 站得住的判据：节点中心到任何挡路占地的净距下限（米）。
 *
 * 0.30 m ≈ 柴犬半身宽（约 0.15 m）的一倍余量：站位中心离树丛、置石、草坪灯还有 30 cm 时，
 * 身体边缘仍有约 15 cm，转头、摆尾、趴下都不会插进实物里。
 * 它同时是"可达空地"的门槛（见 `LAWN_REACH`），于是覆盖率断言的取样域与布点判据是同一个。
 */
const NODE_CLEARANCE = 0.3;
/** 连边允许的最小净距（米）。门禁的底线是 0.05，这里多留 3 cm，不贴着阈值。 */
const EDGE_CLEARANCE = 0.08;
/** 可达判据的格子边长（米）。 */
const REACH_CELL = 0.1;
/** 种子半径：手工节点附近多远内的可站格算"已知进得去"。 */
const REACH_SEED_RADIUS = 0.6;

interface ReachGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cells: ReadonlySet<string>;
}

/**
 * 草坪上**狗真的进得去**的那片空地（四邻洪水填充）。
 *
 * 为什么需要这个判据 —— 本轮生成过程里唯一一处需要解释的东西：
 *   草坪矩形里存在**被灌木方块封死的死角**。院子东北角（绿篱以东、点景灌木以北那一小片）
 *   与围栏之间，在 `FOOTPRINTS` 的矩形模型下通道只有约 4 cm —— 没有任何一只狗挤得进去。
 *   在那里布点只有两条路：让节点与主图不连通（门禁的"全图从 entry 可达"当场失败），
 *   或者连一条穿过灌木的边（"每条边净距 ≥ 5 cm"当场失败）。两条都是在骗门禁。
 *   正确的做法是**承认那块地方去不了**：不布点，也不把覆盖率断言的要求加在它头上 ——
 *   覆盖率要回答的是"用户希望狗能去的地方都去得了"，不是"草坪矩形里每个数学点都有节点"。
 *
 * 做法：在 0.1 m 格子上做四邻洪水填充。可站 = 净距 ≥ `NODE_CLEARANCE`；
 * 种子 = 手工核对过的院内节点附近的可站格（它们是长期核对过的走廊，一定是进得去的）。
 * 取四邻而不是八邻：对角缝隙在几何上比看起来窄，不让它算通路。
 */
const LAWN_REACH: ReachGrid = (() => {
  const spanX = LAWN_DOMAIN.maxX - LAWN_DOMAIN.minX;
  const spanZ = LAWN_DOMAIN.maxZ - LAWN_DOMAIN.minZ;
  const cols = Math.ceil(spanX / REACH_CELL);
  const rows = Math.ceil(spanZ / REACH_CELL);
  const stepX = spanX / cols;
  const stepZ = spanZ / rows;
  const xAt = (i: number): number => LAWN_DOMAIN.minX + i * stepX;
  const zAt = (j: number): number => LAWN_DOMAIN.maxZ - j * stepZ;

  const standable = new Set<string>();
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      if (nodeClearance(xAt(i), zAt(j)) >= NODE_CLEARANCE) standable.add(`${i},${j}`);
    }
  }

  const yardSeeds = HAND_NODES.filter((n) => n.z < -HALF_D - 0.05);
  const reached = new Set<string>();
  const stack: Array<readonly [number, number]> = [];
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      const key = `${i},${j}`;
      if (!standable.has(key)) continue;
      const x = xAt(i);
      const z = zAt(j);
      if (!yardSeeds.some((n) => Math.hypot(n.x - x, n.z - z) <= REACH_SEED_RADIUS)) continue;
      reached.add(key);
      stack.push([i, j]);
    }
  }
  while (stack.length > 0) {
    const cell = stack.pop();
    if (!cell) break;
    const [i, j] = cell;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni > cols || nj > rows) continue;
      const key = `${ni},${nj}`;
      if (reached.has(key) || !standable.has(key)) continue;
      reached.add(key);
      stack.push([ni, nj]);
    }
  }
  return { cols, rows, cells: reached };
})();

/**
 * 该点是否落在「狗进得去的草坪空地」里。
 *
 * 查 3×3 邻域而不是单个格：调用方（门禁的覆盖率断言）按 0.5 m 采样，与 0.1 m 的格
 * 不必然对齐，取邻域可以避免"点正好落在格缝上"造成的假否。
 */
export function lawnReachable(x: number, z: number): boolean {
  const spanX = LAWN_DOMAIN.maxX - LAWN_DOMAIN.minX;
  const spanZ = LAWN_DOMAIN.maxZ - LAWN_DOMAIN.minZ;
  const ci = Math.round(((x - LAWN_DOMAIN.minX) / spanX) * LAWN_REACH.cols);
  const cj = Math.round(((LAWN_DOMAIN.maxZ - z) / spanZ) * LAWN_REACH.rows);
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i > LAWN_REACH.cols || j > LAWN_REACH.rows) continue;
      if (LAWN_REACH.cells.has(`${i},${j}`)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- 草坪：格点

/**
 * 草坪格点的**目标**格距（米）。
 *
 * 取值理由是一条不等式：格内最坏距离是半对角线 `0.5·√(sx² + sz²)`，而覆盖率断言要求
 * ≤ 0.7 m。0.9 m 落到实际网格上是 0.86 × 0.88（格数向上取整后会被平摊一点），
 * 半对角线 ≈ 0.62 m —— 留出约 8 cm 的余量给"被障碍剔掉几个格点"留下的洞；
 * 洞由下面的补点那一遍补掉。再粗就补不过来，再细则节点数翻倍而覆盖率几乎不变。
 */
const LAWN_STEP = 0.9;
/** 补点触发距离（米）：探针点离任何已有节点都超过它，就在那里补一个节点。 */
const FILL_TRIGGER = 0.55;
/** 补点探针的格距（米）。比目标覆盖率半径细一半，保证"洞"不会被跨过去。 */
const FILL_PROBE = 0.25;

interface LawnCell {
  readonly row: number;
  readonly col: number;
  readonly node: NavNode;
}

/** 八邻的**半集**：只连"后向"的四个方向，同一条边不会加两次。 */
const GRID_NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/**
 * 草坪格点：**确定性生成 + 逐个障碍剔除**，不是手写坐标。
 *
 * 为什么生成而不是手写：草坪 9.5 × 7.9 m，要让"草坪上任何位置都能作为目标"就得几十个点。
 * 手写一份坐标清单之后，`layout-dog.ts` 里挪一棵树、加一丛灌木，就得人工重算一遍，
 * 而漏算的那一格恰恰是狗会撞上去的那一格 —— 本轮之前的后果就是这个：
 * 全图 31 个节点里，院子里那十来个几乎全落在三条石板路上，草坪几乎没有节点，
 * 于是"狗只在石板路上走"不是行为层的偏好，而是**导航图只有路**。
 * 生成让"障碍物挪了"与"格点重算"自动同步 —— 这是一个纯函数，输入只有布局常量。
 *
 * 确定性：只读 `layout-dog.ts` 的常量与本节写死的数字，不取随机数 —— 同输入必同输出。
 * 可审计性：生成结果照样逐边过门禁（门禁读的就是编译产物里的这张表），
 * 所以"生成"不是把判据挪走，而是把判据前移。
 *
 * 命名：`lawn-r<行>c<列>`，行 0 = 院子南端（靠房子），列 0 = 西端。
 */
const LAWN_CELLS: readonly LawnCell[] = (() => {
  const spanX = LAWN_DOMAIN.maxX - LAWN_DOMAIN.minX;
  const spanZ = LAWN_DOMAIN.maxZ - LAWN_DOMAIN.minZ;
  const cols = Math.ceil(spanX / LAWN_STEP);
  const rows = Math.ceil(spanZ / LAWN_STEP);
  const stepX = spanX / cols;
  const stepZ = spanZ / rows;
  const out: LawnCell[] = [];
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const x = LAWN_DOMAIN.minX + col * stepX;
      const z = LAWN_DOMAIN.maxZ - row * stepZ;
      if (nodeClearance(x, z) < NODE_CLEARANCE) continue;
      if (!lawnReachable(x, z)) continue;
      out.push({
        row,
        col,
        node: { id: `lawn-r${row}c${col}`, label: `草坪 · 行${row}列${col}`, x, z, kind: 'lawn' },
      });
    }
  }
  return out;
})();

/**
 * 用户点名的**互动点位**。
 *
 * 坐标是挑出来的，不是算出来的：每个点都要同时满足三件事 ——
 * ① 站得住（净距 ≥ 0.30 m，`pond-edge` 是唯一的例外，理由见它自己那一行）；
 * ② 落在可达空地里（`lawnReachable`）；③ 语义上真的是那个地方
 * （树下要在树冠投影里、灌木边要贴着灌木、池塘边要贴着水）。
 * 每个点的取值理由写在旁边；门禁另外断言它们各自至少 2 个邻居、且从 `deck-in` 可达。
 */
const INTERACTION_NODES: readonly NavNode[] = [
  // 院心那片最开阔的草：离最近的实物（池边置石 0.72 m、草坪灯 0.58 m）都远，跑得开。
  { id: 'lawn-c', label: '草坪中央', x: 0.0, z: -8.6, kind: 'lawn' },
  // 西侧草地：在池的西面、石灯笼与大树之南，净距 0.44 m（最近的实物是石灯笼）。
  { id: 'lawn-w', label: '草坪西侧', x: -4.1, z: -7.0, kind: 'lawn' },
  // 东侧草地：休闲区之南、点景灌木与北侧小乔木之间，净距 0.37 m（最近的是小乔木树干）。
  { id: 'lawn-e', label: '草坪东侧', x: 3.4, z: -9.55, kind: 'lawn' },
  // 北侧草地：北侧小乔木的树冠边缘、绿篱之前，净距 0.29 m（离绿篱方块最近）——
  // 刻意贴着北边但不越界（栅栏在 z = -11.7，这里 z = -10.4）。
  { id: 'lawn-n', label: '草坪北侧', x: 1.275, z: -10.4, kind: 'lawn' },
  // 树下阴影：取西侧大树的树冠投影内（离树干 1.03 m < 树冠半径 1.85 m），
  // 但离树干净距 0.75 m —— 狗趴在树荫里，不撞树。
  { id: 'shade-tree', label: '树下阴影', x: -2.9, z: -4.9, kind: 'lawn' },
  // 灌木边草地：贴着平台西侧那丛点景灌木（丛心 -1.15,-5.35，半径 0.5），
  // 站在它南边 0.30 m 的草地上 —— 刨土时鼻子正好在灌木根部。
  { id: 'dig-bush', label: '灌木边草地', x: -1.15, z: -6.15, kind: 'lawn' },
  /**
   * 池塘岸边（玩水那一格）。
   *
   * 它到水面的净距只有 **0.10 m** —— 全图最紧的一个节点，也是本轮唯一一个净距小于
   * `NODE_CLEARANCE` 的节点，这是刻意的：用户点名要"紧贴水面"的一格。
   *
   * 为什么是 0.10 m 而不是贴着门禁的下限 0.05 m：
   *   水面比草地低 0.12 m（见 `build-yard.ts` 的 `POND_WATER_DROP`），
   *   狗的爪子落在草坪上、鼻子探到水线上方才算"在岸边玩水"；留 0.10 m 是给
   *   "前爪不踩进水里"这件事一倍余量，也给后面的布局微调留一点空间。
   * 为什么不能是 0：门禁的「行进途中不会穿进实体」判的是**狗的中心点**是否落在水面里，
   *   中心贴到水面上就是踩进池塘了（而且那也正是"饮水"要排除掉的动作）。
   * 为什么选池的东南岸：锚点 `yard-pond` 的到位朝向是 π（朝北）——
   *   站在水面的南侧、朝北看，朝向正对着水；站到北岸就会背对水面。
   */
  { id: 'pond-edge', label: '池塘岸边', x: -1.5, z: -7.74, kind: 'lawn' },
];

/**
 * 补点：格点被障碍剔掉的地方会留下洞。
 *
 * 为什么不直接把格距压小：0.9 m 的格点最多只能保证"格心 0.62 m 内有节点"，
 * 一旦某个格点被树/灌木/草坪灯挤掉，洞的直径就可能超过 0.7 m（覆盖率断言的线）。
 * 把格距压到 0.6 m 能让洞变小，但节点数几乎翻倍，换来的覆盖率提升还不到 5 cm。
 * 所以改成**只在洞上补点**：在 0.25 m 的探针格上找"可达、站得住、却离任何节点都超过
 * 0.55 m"的位置，就地补一个。探针比覆盖率半径细一半，洞不会被跨过去。
 *
 * 补点的扫描顺序是固定的（自北向南、自西向东），所以补出来的图每次完全一样。
 */
const LAWN_FILL_NODES: readonly NavNode[] = (() => {
  const known: NavNode[] = [...HAND_NODES, ...INTERACTION_NODES, ...LAWN_CELLS.map((c) => c.node)];
  const distanceToKnown = (x: number, z: number): number => {
    let best = Number.POSITIVE_INFINITY;
    for (const n of known) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < best) best = d;
    }
    return best;
  };
  const spanX = LAWN_DOMAIN.maxX - LAWN_DOMAIN.minX;
  const spanZ = LAWN_DOMAIN.maxZ - LAWN_DOMAIN.minZ;
  const cols = Math.ceil(spanX / FILL_PROBE);
  const rows = Math.ceil(spanZ / FILL_PROBE);
  const out: NavNode[] = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const x = LAWN_DOMAIN.minX + (i * spanX) / cols;
      const z = LAWN_DOMAIN.maxZ - (j * spanZ) / rows;
      if (nodeClearance(x, z) < NODE_CLEARANCE) continue;
      if (!lawnReachable(x, z)) continue;
      if (distanceToKnown(x, z) <= FILL_TRIGGER) continue;
      const node: NavNode = { id: `lawn-f${out.length}`, label: `草坪 · 补点 ${out.length}`, x, z, kind: 'lawn' };
      known.push(node);
      out.push(node);
    }
  }
  return out;
})();

/**
 * 生成出来的草坪节点（格点 + 补点）。
 *
 * 「草坪」的语义边界就在这里：另有 `meadow` / `meadow-east` / `path-c` / `lounge` 等
 * 手工节点也长在草地上，但它们是**走廊上的站位**，语义上属于石板路与休闲区，不重复计入。
 */
const LAWN_NODES: readonly NavNode[] = [...LAWN_CELLS.map((c) => c.node), ...LAWN_FILL_NODES];

/**
 * 全部导航节点：**手工核对过的在前，生成的在后**。
 *
 * 顺序是有意义的：出问题时先读前面那一段（人写的、带语义的），
 * 后面的格点只是同一片草坪上的站位。`entry` 依然是第一个 —— 寻路的起点。
 */
export const NAV_NODES: readonly NavNode[] = [
  ...HAND_NODES,
  ...INTERACTION_NODES,
  ...LAWN_NODES,
];

/**
 * 手工核对过的边：**室内外动线的骨架**，每条都是核对过的走廊，不是随便连的。
 * 与 `HAND_NODES` 一样，这一段一个都不许删。
 */
const HAND_EDGES: ReadonlyArray<readonly [string, string]> = [
  // 室内环线：玄关 → 厨房前 → 起居 → 北侧 → 推拉门
  ['entry', 'south'],
  ['south', 'living'],
  ['living', 'living-north'],
  ['living-north', 'north'],
  ['living-south', 'south'],
  ['living-south', 'east-south'],
  ['east-south', 'east-north'],
  ['east-north', 'food'],
  ['east-north', 'north'],
  // ⚠️ 刻意**没有** `north → bed-main` 这条直连：那条直线会横穿北墙窗下的绿植
  //    （x = -1.35, z = -3.05），审计在 72 个采样点上抓到净距 0。
  //    去主软垫一律绕 `north-west`。
  ['north', 'north-west'],
  ['north-west', 'bed-main'],
  ['north-west', 'bed-sleep'],
  ['north-west', 'bedroom-east'],
  ['bedroom-east', 'bedroom'],
  ['bedroom', 'living'],
  // 门洞（进出院子的唯一通道）
  ['north', 'doorway'],
  ['doorway', 'deck-in'],
  // 木平台
  ['deck-in', 'deck-east'],
  ['deck-in', 'yard-water'],
  ['deck-east', 'yard-water'],
  ['deck-east', 'step'],
  // 院内：沿石板路
  ['step', 'path-a'],
  ['path-a', 'path-b'],
  ['path-b', 'path-c'],
  ['path-c', 'path-d'],
  ['path-d', 'pond-north'],
  ['pond-north', 'pond-view'],
  ['path-b', 'lounge-a'],
  ['lounge-a', 'lounge-b'],
  ['lounge-b', 'lounge'],
  // ⚠️ 刻意**没有** `path-c → lounge-a`：那条草坪对角线会压到 2 号草坪灯。
  //    绕 `path-b → lounge-a` 走，路程略长但全程在核对过的走廊上。
  ['path-d', 'meadow'],
  ['meadow', 'meadow-east'],
  ['meadow-east', 'elimination'],
  // ⚠️ 刻意**没有** `lounge → meadow-east`：那条对角线会穿过休闲躺椅。
];

// ---------------------------------------------------------------- 草坪：生成边

/** 补点接入最近节点的搜寻半径（米）。 */
const FILL_LINK_RADIUS = 1.4;
/** 具名互动点接入最近草坪节点的搜寻半径（米）。 */
const NAMED_LINK_RADIUS = 1.8;
/** 原有院内节点接入最近草坪节点的搜寻半径（米）——草坪与走廊的缝合处。 */
const HAND_LINK_RADIUS = 2.2;
/** 连通兜底的候选边长上限（米）。 */
const MAX_LINK_RADIUS = 2.2;

/** 节点是否在院子里（严格在推拉门之外）。室内↔院子的边绝不在这里生成 —— 那是门洞的职责。 */
function inYard(n: NavNode): boolean {
  return n.z < -HALF_D - 0.05;
}

/**
 * 生成草坪部分的边。
 *
 * 四类，按顺序：
 *   ① 格点之间：八邻。对角边同样按 5 cm 采样判净距 —— 八邻更自然，但"贴着障碍斜切过去"
 *      这种错误只有逐点采样才拦得住。
 *   ② 补点：接进最近的一批节点（格点 / 具名点 / 原有节点），最多 3 条。
 *   ③ 具名互动点：接进最近的草坪节点，最多 3 条 —— 门禁会断言每个点至少 2 个邻居。
 *   ④ 原有院内节点：接进最近的草坪节点，最多 3 条。这是**草坪与已核对走廊之间的缝合**：
 *      没有它，新铺的格点会是一块与推拉门动线不相连的飞地。
 *
 * 最后是**连通兜底**（并查集 + Kruskal 式的最近合格边）：生成过程可能因为障碍把某一块草地
 * 切出去（例如池西那条 0.76 m 宽的窄道），兜底按"最近的合格边"把它接回主图。
 * 于是门禁的「全图从 entry 可达」不依赖运气，而是这段逻辑的直接后果。
 *
 * 所有边都过 `segmentClearance ≥ EDGE_CLEARANCE`；室内节点不参与（`inYard`），
 * 因此"进院子只有推拉门这一条路"这条不变量在生成层就不会被破坏。
 */
function buildLawnEdges(): ReadonlyArray<readonly [string, string]> {
  const byId = new Map(NAV_NODES.map((n) => [n.id, n]));
  const out: Array<readonly [string, string]> = [];
  const seen = new Set<string>();

  const add = (a: string, b: string): boolean => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) return false;
    const na = byId.get(a);
    const nb = byId.get(b);
    if (!na || !nb) return false;
    if (segmentClearance(na, nb) < EDGE_CLEARANCE) return false;
    seen.add(key);
    out.push([a, b]);
    return true;
  };

  /** 把 `from` 接进 `pool` 里最近的若干节点（按距离、再按 id 定序，保证确定性）。 */
  const linkNearest = (from: NavNode, pool: readonly NavNode[], maxDistance: number, maxCount: number): void => {
    const near = pool
      .filter((n) => n.id !== from.id)
      .map((n) => ({ n, d: Math.hypot(n.x - from.x, n.z - from.z) }))
      .filter((c) => c.d <= maxDistance)
      .sort((p, q) => p.d - q.d || (p.n.id < q.n.id ? -1 : 1));
    let linked = 0;
    for (const c of near) {
      if (linked >= maxCount) break;
      if (add(from.id, c.n.id)) linked += 1;
    }
  };

  const gridNodes = LAWN_CELLS.map((c) => c.node);
  const lawnNodes = LAWN_NODES;
  const yardHandNodes = HAND_NODES.filter(inYard);

  // ① 格点八邻
  const cellByKey = new Map(LAWN_CELLS.map((c) => [`${c.row},${c.col}`, c.node]));
  for (const cell of LAWN_CELLS) {
    for (const [dr, dc] of GRID_NEIGHBOR_OFFSETS) {
      const other = cellByKey.get(`${cell.row + dr},${cell.col + dc}`);
      if (other) add(cell.node.id, other.id);
    }
  }
  // ② 补点
  const fillPool = [...gridNodes, ...INTERACTION_NODES, ...yardHandNodes];
  for (const n of LAWN_FILL_NODES) linkNearest(n, fillPool, FILL_LINK_RADIUS, 3);
  // ③ 具名互动点
  const namedPool = [...lawnNodes, ...yardHandNodes];
  for (const n of INTERACTION_NODES) linkNearest(n, namedPool, NAMED_LINK_RADIUS, 3);
  // ④ 原有院内节点
  for (const n of yardHandNodes) linkNearest(n, lawnNodes, HAND_LINK_RADIUS, 3);

  // ⑤ 连通兜底
  const parent = new Map<string, string>(NAV_NODES.map((n) => [n.id, n.id]));
  const find = (id: string): string => {
    let root = id;
    for (;;) {
      const up = parent.get(root);
      if (up === undefined || up === root) break;
      root = up;
    }
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor);
      if (next === undefined) break;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    parent.set(find(a), find(b));
  };
  for (const [a, b] of HAND_EDGES) union(a, b);
  for (const [a, b] of out) union(a, b);

  const candidates: Array<{ a: string; b: string; d: number }> = [];
  for (const a of yardHandNodes.concat(lawnNodes)) {
    for (const b of yardHandNodes.concat(lawnNodes)) {
      if (a.id >= b.id) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d <= MAX_LINK_RADIUS) candidates.push({ a: a.id, b: b.id, d });
    }
  }
  candidates.sort((p, q) => p.d - q.d || (p.a < q.a ? -1 : 1) || (p.b < q.b ? -1 : 1));
  for (const c of candidates) {
    if (find(c.a) === find(c.b)) continue;
    if (!add(c.a, c.b)) continue;
    union(c.a, c.b);
  }

  return out;
}

/** 无向边 = 手工核对过的骨架 + 生成的草坪边。 */
export const NAV_EDGES: ReadonlyArray<readonly [string, string]> = [...HAND_EDGES, ...buildLawnEdges()];

const NODE_BY_ID = new Map(NAV_NODES.map((n) => [n.id, n]));

export function navNode(id: string): NavNode | undefined {
  return NODE_BY_ID.get(id);
}

/** 邻接表（无向）。构建一次，之后寻路只查表。 */
const ADJACENCY: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const node of NAV_NODES) map.set(node.id, []);
  for (const [a, b] of NAV_EDGES) {
    map.get(a)?.push(b);
    map.get(b)?.push(a);
  }
  return map;
})();

// ---------------------------------------------------------------- 寻路

/**
 * 最短路径（Dijkstra，按欧氏距离加权）。
 *
 * 为什么不用 A*：节点只有三十来个，Dijkstra 的常数完全够，
 * 而 A* 需要一个不能出错的启发式 —— 在这个规模上不值得。
 * 返回的 id 序列**含起点与终点**；找不到路径时返回空数组（调用方必须处理）。
 */
export function findPath(fromId: string, toId: string): string[] {
  if (!NODE_BY_ID.has(fromId) || !NODE_BY_ID.has(toId)) return [];
  if (fromId === toId) return [fromId];

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const done = new Set<string>();
  for (const node of NAV_NODES) dist.set(node.id, Number.POSITIVE_INFINITY);
  dist.set(fromId, 0);

  for (;;) {
    let best: string | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const [id, d] of dist) {
      if (done.has(id) || d >= bestD) continue;
      best = id;
      bestD = d;
    }
    if (best === null) break;
    if (best === toId) break;
    done.add(best);
    const here = NODE_BY_ID.get(best);
    if (!here) continue;
    for (const nextId of ADJACENCY.get(best) ?? []) {
      if (done.has(nextId)) continue;
      const there = NODE_BY_ID.get(nextId);
      if (!there) continue;
      const step = bestD + Math.hypot(there.x - here.x, there.z - here.z);
      if (step < (dist.get(nextId) ?? Number.POSITIVE_INFINITY)) {
        dist.set(nextId, step);
        prev.set(nextId, best);
      }
    }
  }

  if (!prev.has(toId) && fromId !== toId) return [];
  const out: string[] = [toId];
  let cursor = toId;
  while (cursor !== fromId) {
    const p = prev.get(cursor);
    if (!p) return [];
    out.unshift(p);
    cursor = p;
  }
  return out;
}

export interface Point2 {
  x: number;
  z: number;
}

/** 把节点 id 序列转成世界折线（去掉重复点）。 */
export function routePoints(ids: readonly string[]): Point2[] {
  const out: Point2[] = [];
  for (const id of ids) {
    const node = NODE_BY_ID.get(id);
    if (!node) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - node.x) < 1e-6 && Math.abs(last.z - node.z) < 1e-6) continue;
    out.push({ x: node.x, z: node.z });
  }
  return out;
}

/** 折线总长（米）。 */
export function polylineLength(points: readonly Point2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

// ---------------------------------------------------------------- 路径跟随

export interface FollowState {
  /** 已到达的折线顶点下标（下一个目标点是 index + 1） */
  index: number;
  x: number;
  z: number;
  /** 朝向（弧度，绕 Y）。与 `util.facing()` 同一约定：朝向 +Z 时为 0 */
  heading: number;
  /** 已走距离（米） */
  travelled: number;
  arrived: boolean;
}

/** 每帧最大转头速率（弧度/秒）。狗转头很快，但快到"瞬移式转身"就不像了。 */
export const MAX_TURN_RATE = 4.5;

/**
 * 放行位移所需的**最小对齐度**（`cos(朝向 − 前进方向)`）。
 *
 * 为什么要一个死区而不是"只要 cos > 0 就走"：那样会出现"朝向差 89°、以近乎垂直的姿态
 * 一点点蹭过去"的帧 —— 数学上确实没倒着走（cos 恒为正），画面上却是横向平移。
 * 取 0.2（约 78°）之后，狗会**先转过来再迈步**：这既是真狗的做法，
 * 也让"位移方向落在朝向正前方"这件事有一个可断言的余量（审计断言 cos > 0.19）。
 */
export const ALIGN_DEADBAND = 0.2;

export function startFollow(x: number, z: number, heading: number, points: readonly Point2[]): FollowState {
  const state: FollowState = { index: 0, x, z, heading, travelled: 0, arrived: points.length <= 1 };
  if (state.arrived) state.index = Math.max(0, points.length - 1);
  return state;
}

/** 把角度规范到 (-π, π]。 */
export function wrapAngle(a: number): number {
  let out = a;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out <= -Math.PI) out += Math.PI * 2;
  return out;
}

/**
 * 推进一帧。
 *
 * 三条不变量（`check-dog-motion.mjs` 逐帧断言）：
 *   A. 位移 ≤ `speed * dt`；
 *   B. 若发生位移，则 `cos(朝向 − 前进方向) > 0` —— 也就是**不可能倒着走**；
 *   C. 朝向变化 ≤ `MAX_TURN_RATE * dt`（不会"啪"地转向）。
 *
 * 做法：先转头（按上限逼近切线方向），再按"朝向与切线的对齐程度"放行位移。
 * 对齐度 ≤ 0 时位移为 0 —— 狗会先转过来再走，这正是真实动物的做法。
 */
export function advance(state: FollowState, dt: number, speed: number, points: readonly Point2[]): FollowState {
  const next = { ...state };
  if (next.arrived || points.length === 0) return next;

  const targetIndex = Math.min(next.index + 1, points.length - 1);
  const target = points[targetIndex];
  const here = points[next.index];
  if (!target || !here) {
    next.arrived = true;
    return next;
  }

  const dx = target.x - next.x;
  const dz = target.z - next.z;
  const remaining = Math.hypot(dx, dz);

  // 到达当前目标点：推进到下一段
  if (remaining < 1e-6) {
    next.index = targetIndex;
    if (targetIndex >= points.length - 1) next.arrived = true;
    return next;
  }

  // 朝向：朝切线方向转，但不超过最大转头速率
  const desired = Math.atan2(dx, dz);
  const turn = wrapAngle(desired - next.heading);
  const maxTurn = MAX_TURN_RATE * dt;
  const applied = Math.abs(turn) <= maxTurn ? turn : Math.sign(turn) * maxTurn;
  next.heading = wrapAngle(next.heading + applied);

  // 只有朝向基本对上前进方向才放行位移（对齐度 ≤ 死区则原地转身）
  const align = Math.cos(wrapAngle(desired - next.heading));
  const gate =
    align <= ALIGN_DEADBAND ? 0 : (align - ALIGN_DEADBAND) / (1 - ALIGN_DEADBAND);
  const step = Math.max(0, Math.min(speed * dt * gate, remaining));
  if (step > 0) {
    const ux = dx / remaining;
    const uz = dz / remaining;
    next.x += ux * step;
    next.z += uz * step;
    next.travelled += step;
  }

  if (Math.abs(remaining - step) < 1e-6) {
    next.index = targetIndex;
    if (targetIndex >= points.length - 1) next.arrived = true;
  }
  return next;
}

/**
 * 到位之后把朝向对齐到某个指定方向（例如低头对着食盆、面朝池塘）。
 * 这是**原地转身**：不产生位移，因此不受"不许倒着走"的约束。
 */
export function turnToward(state: FollowState, heading: number, dt: number): FollowState {
  const next = { ...state };
  const turn = wrapAngle(heading - next.heading);
  const maxTurn = MAX_TURN_RATE * dt;
  next.heading = wrapAngle(next.heading + (Math.abs(turn) <= maxTurn ? turn : Math.sign(turn) * maxTurn));
  return next;
}

// ---------------------------------------------------------------- 与行为层的接口

/**
 * 行为锚点的**能力声明**（无坐标）。
 *
 * 契约与猫版一致：行为引擎（`@camp/core`）只声明"需要一个具备哪些能力的锚点"，
 * 坐标留在本文件 —— 因为房间坐标的权威来源是 `layout-dog.ts`，
 * 再往 core 里放一份必然漂移。
 */
export interface DogAnchorSpec {
  id: string;
  label: string;
  capabilities: readonly DogAnchorCapability[];
  heightM: number;
  /** 到位之后狗应该朝哪个方向（世界弧度）；`null` 表示保持路径末端的朝向 */
  faceHeading: number | null;
}

export type DogAnchorCapability =
  | 'floor'
  | 'rest'
  | 'food'
  | 'water'
  | 'yard'
  | 'elimination'
  | 'play'
  | 'run'
  | 'doorway'
  // ---- 院子互动新增的三项（本轮）----
  // 与 `@camp/core` 的 `DogAnchorCapability`、`SIM_DOG_ANCHORS` 逐字一致；
  // 能力是**语义**（这里能不能翻滚 / 有没有太阳 / 地面能不能刨），id 是**坐标**。
  | 'roll'
  | 'sun'
  | 'dig';

/**
 * 锚点表：**导航节点的一个子集**，也就是"狗会去的地方"。
 * 每个锚点都绑定到一个已核对过的导航节点，`faceHeading` 是到位后的朝向。
 */
export const DOG_ANCHOR_SPECS: readonly DogAnchorSpec[] = [
  { id: 'floor-living', label: '起居区', capabilities: ['floor', 'play'], heightM: 0, faceHeading: Math.PI },
  { id: 'floor-kitchen', label: '厨房前走道', capabilities: ['floor'], heightM: 0, faceHeading: Math.PI },
  { id: 'floor-entry', label: '玄关', capabilities: ['floor'], heightM: 0, faceHeading: -Math.PI / 2 },
  { id: 'floor-bedroom', label: '睡眠区', capabilities: ['floor', 'rest'], heightM: 0, faceHeading: Math.PI / 2 },
  { id: 'floor-east', label: '电视柜北侧走道', capabilities: ['floor', 'play'], heightM: 0, faceHeading: Math.PI / 2 },
  { id: 'floor-north', label: '推拉门前', capabilities: ['floor', 'doorway'], heightM: 0, faceHeading: 0 },
  { id: 'food', label: '食盆前', capabilities: ['food'], heightM: 0, faceHeading: Math.PI / 2 },
  { id: 'bed-main', label: '主软垫', capabilities: ['rest'], heightM: 0, faceHeading: -Math.PI / 2 },
  { id: 'bed-sleep', label: '床边软垫', capabilities: ['rest'], heightM: 0, faceHeading: -Math.PI / 2 },
  { id: 'outdoor-water', label: '院内水盆', capabilities: ['water', 'yard'], heightM: 0, faceHeading: Math.PI / 2 },
  { id: 'yard-lawn', label: '院内草坪', capabilities: ['yard', 'run', 'play'], heightM: 0, faceHeading: null },
  { id: 'elimination', label: '院北草地（排泄角）', capabilities: ['elimination', 'yard'], heightM: 0, faceHeading: Math.PI },
  { id: 'yard-lounge', label: '休闲区', capabilities: ['yard', 'rest', 'play'], heightM: 0, faceHeading: Math.PI },
  // `water` 是本轮补上的：没有它，「玩水」这类互动找不到目的地，会**静默消失**；
  // 同时它仍然不在「饮水」的白名单里（`@camp/core` 的 `drinking.allowedIds`），
  // 所以"能玩水"与"能喝池塘的水"是两件事。
  { id: 'yard-pond', label: '池塘边', capabilities: ['yard', 'play', 'water'], heightM: 0, faceHeading: Math.PI },
  { id: 'deck', label: '木平台', capabilities: ['yard', 'doorway', 'rest'], heightM: 0, faceHeading: 0 },
  // ---- 院子里的互动锚点（本轮新增 5 个）----
  // 追加在末尾而不是插进院子那一段中间：core 的 `DOG_ANCHOR_IDS`、simulator 的
  // `SIM_DOG_ANCHORS` 与本表按同一个顺序写死映射，追加式改动最不容易错位。
  { id: 'yard-lawn-center', label: '草坪中央', capabilities: ['yard', 'run', 'play', 'roll'], heightM: 0, faceHeading: null },
  { id: 'yard-lawn-west', label: '草坪西侧', capabilities: ['yard', 'roll', 'sun'], heightM: 0, faceHeading: null },
  { id: 'yard-lawn-east', label: '草坪东侧', capabilities: ['yard', 'run', 'play'], heightM: 0, faceHeading: null },
  { id: 'yard-shade', label: '树下阴影', capabilities: ['yard', 'rest', 'sun'], heightM: 0, faceHeading: Math.PI },
  { id: 'yard-dig', label: '灌木边草地', capabilities: ['yard', 'dig'], heightM: 0, faceHeading: Math.PI },
];

/**
 * 某个位置周围 `radius` 米内的草坪节点 id（按距离、再按 id 定序，可复现）。
 *
 * 为什么锚点映射用"算出来的邻居"而不是手抄一串 id：草坪格点是生成的，
 * 手抄一份 id 清单在障碍物一挪、格点重排之后就会指向不存在的节点
 * （门禁的「锚点映射指向的节点都存在」会当场失败）。算出来的邻居永远与图同步。
 */
function lawnNodesNear(x: number, z: number, radius: number): string[] {
  return LAWN_NODES.filter((n) => Math.hypot(n.x - x, n.z - z) <= radius)
    .map((n) => ({ id: n.id, d: Math.hypot(n.x - x, n.z - z) }))
    .sort((p, q) => p.d - q.d || (p.id < q.id ? -1 : 1))
    .map((c) => c.id);
}

/**
 * 行为锚点 id → 导航节点 id。
 *
 * 为什么两者不合并成一张表：一个行为锚点可能对应**多个**导航节点
 * （例如"院内草坪"可以是院心、也可以是草坪西侧），运行时从中挑一个；
 * 而导航节点是物理位置，不该带行为语义。这张映射就是那层翻译。
 */
export const ANCHOR_NODES: Readonly<Record<string, readonly string[]>> = {
  'floor-living': ['living'],
  'floor-kitchen': ['south'],
  'floor-entry': ['entry'],
  'floor-bedroom': ['bedroom'],
  'floor-east': ['east-north', 'east-south'],
  'floor-north': ['north'],
  food: ['food'],
  'bed-main': ['bed-main'],
  'bed-sleep': ['bed-sleep'],
  'outdoor-water': ['yard-water'],
  // 草坪锚点：原有的四个走廊站位 + **全部草坪节点**（格点与补点）。
  // 这一条是「狗不该只在石板路上走」在锚点层的兑现：行为层要"去草坪"时，
  // 目的地可以是草坪上任何一格，而不是只有那四个点。
  'yard-lawn': ['meadow', 'meadow-east', 'path-c', 'lounge', ...LAWN_NODES.map((n) => n.id)],
  elimination: ['elimination'],
  'yard-lounge': ['lounge'],
  // 玩水点：原有的池边节点 + 紧贴水面的那一格（`pond-edge`）。
  // 门禁有一条**决策守卫**断言这里必须含 pond-edge，防止以后有人把它删掉。
  'yard-pond': ['pond-view', 'pond-edge'],
  deck: ['deck-east', 'deck-in'],
  // ---- 本轮新增的互动锚点：各自绑到那个具名点 + 它周围的草坪格点 ----
  'yard-lawn-center': ['lawn-c', ...lawnNodesNear(0.0, -8.6, 1.6)],
  'yard-lawn-west': ['lawn-w', ...lawnNodesNear(-4.1, -7.0, 1.6)],
  'yard-lawn-east': ['lawn-e', ...lawnNodesNear(3.4, -9.55, 1.6)],
  'yard-shade': ['shade-tree', ...lawnNodesNear(-2.9, -4.9, 1.2)],
  'yard-dig': ['dig-bush', ...lawnNodesNear(-1.15, -6.15, 1.2)],
};

/**
 * 目标点的最小路程（米）：候选锚点里只要还有一个离狗至少这么远的，就不选"脚下那一格"。
 *
 * 为什么需要它：`yard-lawn` 这一轮从 4 个走廊站位扩到了**全部草坪节点**（60+ 个），
 * 于是"去草坪"几乎总能解析到狗**正站着的那一格** —— 路程 0，
 * 运行时那一整段就只剩"到位之后的原地动作"（`travelS = 0` 分支），
 * 表现是狗摆着奔跑/玩耍的姿势不动。锚点的语义是"去哪"，不是"就地站着"。
 * 候选全都太近时（例如"草坪中央"那一小片格点彼此只隔一米），退化为取**最远**的那一个
 * —— 一段短移动也远好过"原地不动"。
 *
 * ⚠️ 只对候选 ≥ 3 的锚点生效：候选只有一两个的锚点（`food` / `deck` / `yard-pond` …）
 * 保持原样 —— 那时"就近取一个"就是它全部的含义，不该被这条规则改写。
 */
const MIN_TARGET_TRAVEL_M = 1.5;

/** 行为锚点 → 目标导航节点（就近取一个；`preferNear` 给了就从它附近挑）。 */
export function resolveAnchorNode(anchorId: string, preferNear?: Point2): string | null {
  const candidates = ANCHOR_NODES[anchorId];
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1 || !preferNear) return candidates[0] ?? null;
  let best: string | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  let farthest: string | null = null;
  let farthestD = Number.NEGATIVE_INFINITY;
  for (const id of candidates) {
    const node = NODE_BY_ID.get(id);
    if (!node) continue;
    const d = Math.hypot(node.x - preferNear.x, node.z - preferNear.z);
    if (d > farthestD) {
      farthestD = d;
      farthest = id;
    }
    if (candidates.length >= 3 && d < MIN_TARGET_TRAVEL_M) continue;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best ?? farthest;
}

/** 两个导航节点之间的世界折线（含起终点）。找不到路返回空数组。 */
export function routeBetween(fromNodeId: string, toNodeId: string): Point2[] {
  return routePoints(findPath(fromNodeId, toNodeId));
}
