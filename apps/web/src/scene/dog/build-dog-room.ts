/**
 * 建筑外壳：地板、四面墙（带洞口）、天花板、踢脚线、木平台、
 * 四扇推拉玻璃门、三扇窗、入户门与窗帘。
 *
 * 三条从 `../build-room.ts` 继承下来的做法，理由仍然成立：
 *   1. **墙面用单面平面**而不是盒体，法线朝屋内 —— 相机在屋外能直接看进屋里（娃娃屋剖面），
 *      不必写任何遮挡剔除逻辑。⚠️ 这也是为什么墙**不能**改用薄盒体：
 *      盒体有外表面，从屋外看就是一面实墙，剖面效果立刻消失。
 *   2. **天花板同样单面朝下**，因此俯视全景时天花板自动不可见，室内一览无余。
 *   3. 墙只接收阴影、不投影（`cast: false`）：否则单面墙会在室外视角下投出奇怪剪影。
 *
 * 与猫版最大的结构差异：这里多了一个**通用的「带洞口的墙」生成器**。
 * 猫版每面墙的洞口是手写四段拼出来的（墙少、洞少还扛得住）；狗版有 4 面墙、6 个洞口，
 * 手写拼接必然出错且无法核对。改成「按沿墙轴切段」之后，洞口位置直接来自 `layout-dog.ts`，
 * 加一扇窗就是往数组里加一项。
 */
import * as THREE from 'three';
import {
  ENTRY_DOOR,
  ENGAWA,
  ROOM,
  SLIDING_DOOR,
  SLIDING_DOOR_OPEN,
  WALLS,
  WINDOW_EAST,
  WINDOW_NORTH,
  WINDOW_WEST,
  YARD,
  type WallOpening,
  type WallSpec,
} from './layout-dog.ts';
import type { MaterialLibrary } from '../materials.ts';
import { addMesh, box, group } from '../util.ts';

const T = ROOM.wallThickness;
/**
 * 洞口构件（窗框、门框、玻璃）沿法线的位置：**墙厚的一半**。
 *
 * 为什么不是贴在墙面平面上：墙是零厚度的平面，而洞口需要一个"洞壁"。
 * 把框体做成 `T + 0.04` 厚、居中放在墙厚中央，框体自己就把洞壁填满了 ——
 * 否则从稍微侧一点的角度看过去，窗洞两侧会露出两道直通屋外的缝。
 */
const MID_WALL = -T / 2;
/** 洞口框体的穿墙厚度。 */
const FRAME_DEPTH = T + 0.04;

/** 墙面的局部坐标系：`u` 是沿墙方向的世界坐标，`y` 是高度。 */
interface WallFrame {
  rotY: number;
  /** 沿墙坐标 + 高度 → 世界坐标（落在墙面平面上） */
  place(u: number, y: number): [number, number, number];
  /** 墙面内侧法线 */
  normal: [number, number, number];
}

/**
 * 由「墙面垂直于哪根轴 + 内侧法线朝哪边」推出旋转角、放置函数与法线。
 *
 * 推导（three 的 `R_y` 把默认法线 +Z 映到 `(sinθ, 0, cosθ)`）：
 *   - 北/南墙（法线沿 ±Z）：θ = 0（朝 +Z）或 π（朝 -Z）；
 *   - 东墙（法线朝 -X）：θ = -π/2；西墙（法线朝 +X）：θ = +π/2。
 * 两种轴的 `place` 都让**构件中心**落在给定的 u 上，因此调用方不必区分轴。
 */
function wallFrame(spec: WallSpec): WallFrame {
  const zAxis = spec.normalAxis === 'z';
  const rotY = zAxis ? (spec.inwardSign === 1 ? 0 : Math.PI) : spec.inwardSign === 1 ? Math.PI / 2 : -Math.PI / 2;
  return {
    rotY,
    place: (u, y) => (zAxis ? [u, y, spec.at] : [spec.at, y, u]),
    normal: zAxis ? [0, 0, spec.inwardSign] : [spec.inwardSign, 0, 0],
  };
}

/** 沿墙面法线把构件推进屋内 `d` 米。 */
function pushInside(obj: THREE.Object3D, frame: WallFrame, d: number): void {
  obj.position.x += frame.normal[0] * d;
  obj.position.y += frame.normal[1] * d;
  obj.position.z += frame.normal[2] * d;
}

/**
 * 单面墙板（**平面**，法线朝屋内）。宽 `w` 沿墙、高 `h` 竖直。
 *
 * 用平面而非盒体是硬约束，见文件头注释第 1 条。
 */
function wallPanel(
  parent: THREE.Object3D,
  frame: WallFrame,
  u: number,
  y: number,
  w: number,
  h: number,
  material: THREE.Material,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(...frame.place(u, y));
  mesh.rotation.y = frame.rotY;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

/** 墙面上的小构件（窗框、窗台、踢脚、门扇）：**盒体**，宽沿墙、厚穿墙。 */
function panelBox(
  parent: THREE.Object3D,
  frame: WallFrame,
  u: number,
  y: number,
  alongU: number,
  height: number,
  through: number,
  material: THREE.Material,
  name: string,
  opts: { cast?: boolean; receive?: boolean } = {},
): THREE.Mesh {
  const mesh = box(alongU, height, through, material);
  mesh.position.set(...frame.place(u, y));
  mesh.rotation.y = frame.rotY;
  mesh.name = name;
  mesh.castShadow = opts.cast ?? false;
  mesh.receiveShadow = opts.receive ?? true;
  parent.add(mesh);
  return mesh;
}

export function buildDogRoom(root: THREE.Group, mats: MaterialLibrary): void {
  const shell = group('dog-room-shell');
  root.add(shell);

  const floorMat = mats.surface('woodFloor', ROOM.width / 1.6, ROOM.depth / 1.6);
  const wallMat = mats.surface('plaster', ROOM.width / 2.4, ROOM.height / 2.4, { color: 0xf4eee5 });
  const accentMat = mats.surface('plaster', ROOM.depth / 2.4, ROOM.height / 2.4, { color: 0xe6dcc9 });
  const ceilingMat = mats.surface('plaster', ROOM.width / 2.4, ROOM.depth / 2.4, { color: 0xfaf6f0 });
  const trimMat = mats.plain('woodLight');

  buildFloorAndCeiling(shell, floorMat, ceilingMat);

  for (const spec of WALLS) {
    buildWall(shell, wallFrame(spec), spec, spec.material === 'accent' ? accentMat : wallMat);
    buildBaseboard(shell, wallFrame(spec), spec, trimMat);
  }

  buildSlidingDoor(shell, mats);
  // 窗挂在「含该洞口的那面墙」上：由洞口 id 反查，杜绝手写墙号对错位
  for (const op of [WINDOW_NORTH, WINDOW_WEST, WINDOW_EAST]) {
    const spec = WALLS.find((w) => w.openings.some((o) => o.id === op.id));
    if (spec) buildWindow(shell, mats, wallFrame(spec), op);
  }
  buildEntryDoor(shell, mats, trimMat);
  buildSlatFeature(shell, mats);
  buildCurtain(shell, mats);
  buildGardenFacade(shell, mats);
  buildEngawa(root, mats);
}

/**
 * 朝院子那一侧的**外墙皮**。
 *
 * 为什么只有北墙需要它，而其余三面墙仍然只有内侧一层单面平面：
 *
 *   - 娃娃屋剖视（能从屋外直接看进屋里）依赖「墙是单面平面、法线朝屋内」这条性质；
 *   - 而站在院子里往南看，需要看到的是一面**实墙**（带推拉门洞），否则屋子像没盖外墙；
 *   - 这两件事对**近侧墙**是冲突的（外皮会挡住视线），对**远侧墙**不冲突。
 *     而「朝院子」那一面恰好永远是全景机位的远侧 —— 相机在南边俯视，
 *     北墙的外皮法线朝北、背对相机，自动被背面剔除。于是两全其美：
 *     南/东/西三面保持剖视，北面在院子里是一面真墙。
 *
 * 代价（如实写明）：把相机绕到院子以北回头看，北墙外皮会挡住室内。
 * 那一刻看到的是房子的**外立面**而不是剖面 —— 这是刻意选择的行为，不是缺陷。
 */
function buildGardenFacade(parent: THREE.Group, mats: MaterialLibrary): void {
  const spec = WALLS[0];
  if (!spec) return;
  const outer = exteriorFrame(spec);
  const siding = mats.surface('plaster', ROOM.width / 2.4, ROOM.height / 2.4, { color: 0xe3dccd });
  const trim = mats.plain('woodWarm');

  const g = group('garden-facade');
  parent.add(g);
  buildWall(g, outer, spec, siding);

  /**
   * 勒脚（外墙下沿的一圈深色木板）：没有它，墙与草地直接相接会读成"贴纸"。
   *
   * 它**必须按洞口的落地情况切段** —— 通高的推拉门洞口下方不能有勒脚，
   * 而窗下（窗台 0.8 m）可以继续走。这正是 `solidRanges()` 在做的事。
   */
  for (const [i, [uMin, uMax]] of solidRanges(spec, 0, 0.32).entries()) {
    const plinth = panelBox(g, outer, (uMin + uMax) / 2, 0.16, uMax - uMin, 0.32, T + 0.07, trim, `facade-plinth-${i}`, {
      cast: true,
    });
    pushInside(plinth, outer, -0.035);
  }

  /**
   * 檐口：只做北侧一条，且**完全落在室内墙面以外**（内沿离室内墙面还有约 0.07 m）。
   * 为什么不做一圈：南侧檐口会从全景机位遮住整条厨房台面（台面正贴着南墙）。
   */
  const eaveZ = spec.at - T;
  addMesh(g, box(ROOM.width + 1.0, 0.14, 0.5, siding), 0, ROOM.height + 0.07, eaveZ - 0.2, {
    name: 'facade-eave',
    cast: false,
  });
  addMesh(g, box(ROOM.width + 1.0, 0.1, 0.09, trim), 0, ROOM.height - 0.03, eaveZ - 0.41, {
    name: 'facade-eave-fascia',
    cast: false,
  });
  // 两根墙面木柱：给大面积外墙一点尺度参照
  for (const sx of [-1, 1]) {
    addMesh(g, box(0.12, ROOM.height, 0.1, trim), sx * (ROOM.width / 2 - 0.3), ROOM.height / 2, spec.at - T - 0.05, {
      name: 'facade-post',
    });
  }
}

/**
 * 在高度带 `[yMin, yMax]` 上，墙**实际存在**的沿墙区段。
 *
 * 判定：一个洞口只要与这个高度带相交，就在它的 u 区间上把墙挖掉。
 * 踢脚线（带 = [0, 0.09]）与外墙勒脚（带 = [0, 0.32]）都靠它切段 ——
 * 通高的门洞下方不该有东西，窗下则应该继续。
 */
function solidRanges(spec: WallSpec, yMin: number, yMax: number): Array<[number, number]> {
  const blockers = spec.openings
    .filter((o) => o.sillY < yMax && o.sillY + o.height > yMin)
    .sort((a, b) => a.center - a.width / 2 - (b.center - b.width / 2));

  const ranges: Array<[number, number]> = [];
  let cursor = spec.start;
  for (const b of blockers) {
    ranges.push([cursor, b.center - b.width / 2]);
    cursor = b.center + b.width / 2;
  }
  ranges.push([cursor, spec.end]);
  return ranges.filter(([a, b]) => b - a > 1e-3);
}

/**
 * 与 `wallFrame` 相对的外墙坐标系：`place` 把构件推到**室外一侧**一个墙厚，
 * `rotY` 再转 180°，于是平面的法线朝屋外。
 */
function exteriorFrame(spec: WallSpec): WallFrame {
  const inner = wallFrame(spec);
  const outward = -T;
  return {
    rotY: inner.rotY + Math.PI,
    place: (u, y) => {
      const p = inner.place(u, y);
      return [p[0] + inner.normal[0] * outward, p[1], p[2] + inner.normal[2] * outward];
    },
    normal: [-inner.normal[0], 0, -inner.normal[2]],
  };
}

// ---------------------------------------------------------------- 地面与顶棚

/**
 * 地板与天花板。
 *
 * **刻意不做露明木梁**（第一版做了 4 道，横跨房间四等分）。
 * 原因不是风格，是**观察**：梁在天花板下方，而天花板是单面朝下的平面 ——
 * 俯视时天花板被背面剔除，梁却不会，于是四个不透明的盒子正好横在
 * 「看进房间」的视线中央，把全景机位切成了四条。
 * 这一屏的用途是核对布置，任何在此高度上的实体都是在跟用途作对。
 * 想要结构语言，靠墙上的木格栅与木质家具已经足够。
 */
function buildFloorAndCeiling(shell: THREE.Group, floorMat: THREE.Material, ceilingMat: THREE.Material): void {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'dog-floor';
  shell.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), ceilingMat);
  // 法线朝下：俯视时被背面剔除，因此从上方能直接看进屋里
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM.height;
  ceiling.name = 'dog-ceiling';
  shell.add(ceiling);
}

// ---------------------------------------------------------------- 墙体与洞口

/**
 * 按沿墙轴把墙面切成「垛 + 洞下 + 洞上」。
 *
 * 算法：把洞口按起点排序后线性扫一遍 —— 洞口之间是整高墙垛，
 * 洞口自身在下方（窗台）与上方（过梁）各补一段。任何洞口组合都不会漏面或重叠。
 */
function buildWall(parent: THREE.Group, frame: WallFrame, spec: WallSpec, material: THREE.Material): void {
  const H = ROOM.height;
  const sorted = [...spec.openings].sort((a, b) => a.center - a.width / 2 - (b.center - b.width / 2));

  const panel = (uMin: number, uMax: number, yMin: number, yMax: number, name: string): void => {
    if (uMax - uMin < 1e-3 || yMax - yMin < 1e-3) return;
    wallPanel(parent, frame, (uMin + uMax) / 2, (yMin + yMax) / 2, uMax - uMin, yMax - yMin, material, name);
  };

  let cursor = spec.start;
  for (const [i, op] of sorted.entries()) {
    const uMin = op.center - op.width / 2;
    const uMax = op.center + op.width / 2;
    panel(cursor, uMin, 0, H, `wall-${spec.id}-pier-${i}`);
    panel(uMin, uMax, 0, op.sillY, `wall-${spec.id}-sill-${op.id}`);
    panel(uMin, uMax, op.sillY + op.height, H, `wall-${spec.id}-head-${op.id}`);
    cursor = uMax;
  }
  panel(cursor, spec.end, 0, H, `wall-${spec.id}-pier-end`);
}

/**
 * 踢脚线：只被**门**打断，窗下继续走。
 * 因而这里单独按「门类洞口」切段，而不是复用 `buildWall` 的分段结果。
 */
function buildBaseboard(parent: THREE.Group, frame: WallFrame, spec: WallSpec, trimMat: THREE.Material): void {
  const h = 0.09;
  const thick = 0.022;
  const doors = spec.openings
    .filter((o) => o.kind !== 'window')
    .sort((a, b) => a.center - a.width / 2 - (b.center - b.width / 2));

  const segments: Array<[number, number]> = [];
  let cursor = spec.start;
  for (const d of doors) {
    segments.push([cursor, d.center - d.width / 2]);
    cursor = d.center + d.width / 2;
  }
  segments.push([cursor, spec.end]);

  for (const [i, [uMin, uMax]] of segments.entries()) {
    if (uMax - uMin < 1e-3) continue;
    const mesh = panelBox(parent, frame, (uMin + uMax) / 2, h / 2, uMax - uMin, h, thick, trimMat, `base-${spec.id}-${i}`);
    // 贴墙面往屋内偏一个墙厚 + 半个踢脚厚：看起来像「有厚度的墙脚」
    pushInside(mesh, frame, T / 2 + thick / 2);
  }
}

// ---------------------------------------------------------------- 窗与门

function buildWindow(parent: THREE.Group, mats: MaterialLibrary, frame: WallFrame, op: WallOpening): void {
  const g = group(`window-${op.id}`);
  parent.add(g);

  const frameMat = mats.plain('metalDark');
  const glassMat = mats.plain('glass');
  const sillMat = mats.plain('woodLight');
  const fw = 0.055;
  const yc = op.sillY + op.height / 2;

  /** 洞口构件：建好之后一律推到墙厚中央（见 `MID_WALL` 的说明）。 */
  const member = (
    u: number,
    y: number,
    along: number,
    h: number,
    through: number,
    material: THREE.Material,
    name: string,
    opts: { cast?: boolean } = {},
  ): THREE.Mesh => {
    const mesh = panelBox(g, frame, u, y, along, h, through, material, name, opts);
    pushInside(mesh, frame, MID_WALL);
    return mesh;
  };

  member(op.center, op.sillY + fw / 2, op.width, fw, FRAME_DEPTH, frameMat, `${op.id}-frame-bottom`, { cast: true });
  member(op.center, op.sillY + op.height - fw / 2, op.width, fw, FRAME_DEPTH, frameMat, `${op.id}-frame-top`, { cast: true });
  member(op.center - op.width / 2 + fw / 2, yc, fw, op.height, FRAME_DEPTH, frameMat, `${op.id}-frame-left`, { cast: true });
  member(op.center + op.width / 2 - fw / 2, yc, fw, op.height, FRAME_DEPTH, frameMat, `${op.id}-frame-right`, { cast: true });
  // 中竖梃：把一扇窗读成两扇，比例更像住宅
  member(op.center, yc, fw * 0.7, op.height - fw * 2, FRAME_DEPTH * 0.8, frameMat, `${op.id}-mullion`);
  member(op.center, yc, op.width - fw, op.height - fw, 0.012, glassMat, `${op.id}-glass`);

  const sill = panelBox(g, frame, op.center, op.sillY + 0.018, op.width + 0.14, 0.036, 0.3, sillMat, `${op.id}-sill`, {
    cast: true,
  });
  pushInside(sill, frame, MID_WALL + 0.08);
}

/**
 * 四扇推拉玻璃门：出这道门就是院子，它是整幕戏的接缝。
 *
 * 开门位置放在**西端**（见 `layout-dog.ts` 的 `SLIDING_DOOR_OPEN`）：
 * 从入户门进来的动线本来就沿着起居区西侧走，把门开在西端，通道才不必横穿玻璃 ——
 * 这件事在 `check-layout-dog.mjs` 里是一条断言。
 */
function buildSlidingDoor(parent: THREE.Group, mats: MaterialLibrary): void {
  const spec = WALLS[0];
  if (!spec) return;
  const frame = wallFrame(spec);
  const g = group('sliding-door');
  parent.add(g);

  const frameMat = mats.plain('metalDark');
  const glassMat = mats.plain('glass');
  const trackMat = mats.plain('woodDark');
  const { center, width, height } = SLIDING_DOOR;
  const uMin = center - width / 2;
  const uMax = center + width / 2;

  panelBox(g, frame, center, height - 0.035, width + 0.1, 0.07, FRAME_DEPTH, trackMat, 'door-top-track', { cast: true });
  panelBox(g, frame, center, 0.02, width + 0.1, 0.04, FRAME_DEPTH, trackMat, 'door-bottom-track');
  panelBox(g, frame, uMin + 0.04, height / 2, 0.08, height, FRAME_DEPTH, frameMat, 'door-jamb-west', { cast: true });
  panelBox(g, frame, uMax - 0.04, height / 2, 0.08, height, FRAME_DEPTH, frameMat, 'door-jamb-east', { cast: true });
  // 上下轨道与门套推到墙厚中央，填满洞壁（见 `MID_WALL`）
  for (const child of [...g.children]) {
    if (child.name.startsWith('door-top-track') || child.name.startsWith('door-bottom-track') ||
        child.name.startsWith('door-jamb')) {
      pushInside(child, frame, MID_WALL);
    }
  }

  /**
   * 四扇门的分轨与「开着的那一扇」。
   *
   * 轨 A 在室外侧、轨 B 在室内侧，各挂两扇。把西端那扇（轨 A）沿轨推**东**一格：
   * 轨 A 的那个位置本来是空的（轨 A 的邻位是轨 B 的板），于是西端留下 1.06 m 的洞。
   * 这是推拉门真实的工作方式 —— 不是把一扇玻璃凭空挪走。
   */
  const pw = width / 4;
  const open = SLIDING_DOOR_OPEN;
  const panels: ReadonlyArray<{ u: number; track: -1 | 1; name: string }> = [
    { u: open.center + pw, track: -1, name: 'panel-slid-open' },
    { u: uMin + pw * 1.5, track: 1, name: 'panel-2' },
    { u: uMin + pw * 2.5, track: -1, name: 'panel-3' },
    { u: uMin + pw * 3.5, track: 1, name: 'panel-4' },
  ];
  for (const p of panels) {
    const pane = group(p.name);
    pane.position.set(...frame.place(p.u, height / 2));
    pane.rotation.y = frame.rotY;
    // 轨 A 在室外侧（法线反向）、轨 B 在室内侧
    pushInside(pane, frame, p.track * 0.045);
    g.add(pane);
    panelBox(pane, IDENTITY_FRAME, 0, 0, pw - 0.02, height - 0.08, 0.035, frameMat, `${p.name}-frame`, { cast: true });
    panelBox(pane, IDENTITY_FRAME, 0, 0, pw - 0.12, height - 0.2, 0.012, glassMat, `${p.name}-glass`);
  }
}

/**
 * 「已经摆好位置和朝向的父节点」用的空坐标系。
 *
 * 门扇这类构件先定位于世界坐标，再在**它自己的局部坐标**里加零件：
 * 若继续用墙面的 `place()`，子件会被重复平移一次（踩过的坑：
 * 玻璃跑到门框外面去）。这里给一个恒等 frame，语义就是「父节点已经是世界坐标了」。
 */
const IDENTITY_FRAME: WallFrame = {
  rotY: 0,
  place: (u, y) => [u, y, 0],
  normal: [0, 0, 0],
};

function buildEntryDoor(parent: THREE.Group, mats: MaterialLibrary, trimMat: THREE.Material): void {
  const spec = WALLS[1];
  if (!spec) return;
  const frame = wallFrame(spec);
  const g = group('entry-door');
  parent.add(g);
  const panelMat = mats.plain('woodWarm');
  const metal = mats.plain('metal');
  const { center, width, height } = ENTRY_DOOR;

  panelBox(g, frame, center, height + 0.03, width + 0.12, 0.07, FRAME_DEPTH, trimMat, 'entry-frame-top', { cast: true });
  panelBox(g, frame, center - width / 2 - 0.03, height / 2, 0.06, height, FRAME_DEPTH, trimMat, 'entry-frame-west', { cast: true });
  panelBox(g, frame, center + width / 2 + 0.03, height / 2, 0.06, height, FRAME_DEPTH, trimMat, 'entry-frame-east', { cast: true });
  for (const child of [...g.children]) {
    if (child.name.startsWith('entry-frame')) pushInside(child, frame, MID_WALL);
  }

  /**
   * 门扇：以**西侧铰链**为原点绕 Y 微开。
   *
   * 关键在于门扇组自己的朝向不能直接沿用墙面的 `rotY`：墙面 `rotY` 只保证
   * 「盒体的中心落在正确的 u 上」，对**不对称**的门扇并不成立 ——
   * 南墙的 `rotY = π` 会把局部 +X 映射到世界 -X，门扇就会朝铰链的反方向长出去。
   * 所以这里用一个专门的 `hingeRotY()`：它保证「局部 +X = 沿墙 +u」，
   * 并且让**正的开启角一定朝屋内转**（两侧朝向都成立）。
   */
  const leaf = group('entry-leaf');
  const hingeU = center - width / 2 + 0.03;
  leaf.position.set(...frame.place(hingeU, 0));
  leaf.rotation.y = hingeRotY(spec, 0.34);
  g.add(leaf);
  const leafW = width - 0.06;
  panelBox(leaf, IDENTITY_FRAME, leafW / 2, (height - 0.02) / 2, leafW, height - 0.02, 0.05, panelMat, 'entry-panel', {
    cast: true,
  });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.15, 12), metal);
  const handleMesh = addMesh(leaf, handle, leafW - 0.12, 1.02, 0.04, { name: 'entry-handle' });
  handleMesh.rotation.z = Math.PI / 2;
}

/**
 * 铰链朝向：局部 +X 对齐「沿墙 +u」，且 `swing > 0` 时门扇**朝屋内**转。
 *
 * 推导见 `wallFrame()` 的注释：`R_y(φ)` 把 +X 映到 `(cosφ, 0, -sinφ)`。
 *   - 南北墙（u = 世界 +X）：取 φ ≈ 0，开启角符号 = `-inwardSign`；
 *   - 东西墙（u = 世界 +Z）：取 φ ≈ -π/2（此时 +X 映到 +Z），符号 = `+inwardSign`。
 */
function hingeRotY(spec: WallSpec, swing: number): number {
  return spec.normalAxis === 'z' ? -swing * spec.inwardSign : -Math.PI / 2 + swing * spec.inwardSign;
}

/**
 * 北墙墙垛上的木格栅：日式空间里最典型的「一段木头」。
 *
 * 它落在窗与推拉门之间的实墙上（x ∈ [-1.6, -0.8]），因此不需要为它开洞。
 */
function buildSlatFeature(parent: THREE.Group, mats: MaterialLibrary): void {
  const spec = WALLS[0];
  if (!spec) return;
  const frame = wallFrame(spec);
  const g = group('slat-feature');
  parent.add(g);
  const backdrop = wallPanel(g, frame, -1.2, 1.5, 0.8, 2.2, mats.plain('woodWarm'), 'slat-backdrop');
  void backdrop;
  pushInside(backdrop, frame, 0.02);
  for (let i = 0; i < 6; i++) {
    const slat = panelBox(g, frame, -1.55 + i * 0.14, 1.5, 0.055, 2.2, 0.05, mats.plain('woodLight'), `slat-${i}`, {
      cast: true,
    });
    pushInside(slat, frame, 0.05);
  }
}

function buildCurtain(shell: THREE.Group, mats: MaterialLibrary): void {
  const spec = WALLS[2];
  if (!spec) return;
  const frame = wallFrame(spec);
  const g = group('curtain');
  shell.add(g);

  const rodY = WINDOW_WEST.sillY + WINDOW_WEST.height + 0.24;
  const rod = panelBox(g, frame, WINDOW_WEST.center, rodY, 2.6, 0.03, 0.18, mats.plain('metal'), 'curtain-rod', {
    cast: true,
  });
  pushInside(rod, frame, 0.18);

  // 布帘：两块带正弦褶皱的平面。褶皱是几何而不是贴图 —— 侧光下才有层次
  const cloth = mats.plain('curtain');
  for (const side of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(0.8, WINDOW_WEST.height + 0.6, 12, 1);
    const pos = geo.attributes.position;
    if (pos) {
      for (let i = 0; i < pos.count; i++) {
        pos.setZ(i, Math.sin(pos.getX(i) * 14) * 0.035);
      }
      pos.needsUpdate = true;
    }
    geo.computeVertexNormals();
    const panel = new THREE.Mesh(geo, cloth);
    const u = WINDOW_WEST.center + side * (WINDOW_WEST.width / 2 + 0.4);
    panel.position.set(...frame.place(u, rodY - 0.3));
    panel.rotation.y = frame.rotY;
    pushInside(panel, frame, 0.2);
    panel.castShadow = true;
    panel.name = `curtain-panel-${side > 0 ? 'n' : 's'}`;
    g.add(panel);
  }
}

// ---------------------------------------------------------------- 木平台

/**
 * 木平台（縁側）：室内与院子之间的过渡面，也是狗最常趴的地方。
 *
 * 它的上表面与室内地面齐平（y = 0），院子地面低 0.12 m，所以「出门」在画面上
 * 有一次可见的下沉 —— 刻意保留：平的接缝会让人看不出哪里是室内、哪里是室外。
 */
function buildEngawa(root: THREE.Group, mats: MaterialLibrary): void {
  const g = group('engawa');
  root.add(g);
  const deck = mats.surface('woodFloor', 6, 1, { color: 0xd8b184 });
  const fascia = mats.plain('woodWarm');
  const w = ENGAWA.maxX - ENGAWA.minX;
  const d = ENGAWA.maxZ - ENGAWA.minZ;
  const cx = (ENGAWA.minX + ENGAWA.maxX) / 2;
  const cz = (ENGAWA.minZ + ENGAWA.maxZ) / 2;

  addMesh(g, box(w, ENGAWA.thickness, d, deck), cx, -ENGAWA.thickness / 2, cz, { name: 'engawa-deck' });
  // 前缘挡板：把平台下方的空隙封住，否则从院子的低机位能看穿到地底
  addMesh(g, box(w, 0.24, 0.05, fascia), cx, -0.14, ENGAWA.minZ + 0.025, { name: 'engawa-fascia-north' });
  for (const sx of [-1, 1]) {
    addMesh(g, box(0.05, 0.24, d, fascia), sx > 0 ? ENGAWA.maxX - 0.025 : ENGAWA.minX + 0.025, -0.14, cz, {
      name: 'engawa-fascia-side',
    });
  }
  // 落脚板：正对石板路的起点（`PATHS[0]` 的第一点 x = 1.3）。
  // 位置必须对齐，否则画面读成「从平台西端下来、却从东边冒出一条路」。
  // 只有 0.12 m 落差，因此不做真正的踏步，就是一块踏脚板。
  addMesh(g, box(1.1, 0.07, 0.36, deck), 1.3, YARD.groundY + 0.035, ENGAWA.minZ - 0.2, { name: 'engawa-step' });
}
