/**
 * 柴犬（Shiba Inu）的程序化建模。
 *
 * 为什么程序化（与猫版同一条理由）：CC0 资产库里没有可核实授权的活体犬模型，
 * 程序化重建保证许可干净、可确定性构建、姿态完全可控；代价是「写实比例 + 写实毛色，
 * 但不是扫描级细节」——这一点在设计文档里如实写明，替换缝也留在 `buildShibaRig()`
 * 这一个函数上（换有授权的 GLTF 时只换几何装配，控制器不用改）。
 *
 * 柴犬的「像不像」由六件事决定，本文件按这个顺序建：
 *   1. **立耳**：三角、前倾、可见浅色内耳；
 *   2. **卷尾**：5 段，从尾根明显上翘再向前卷成环，比躯干更蓬松；
 *   3. **双层短毛**：底毛深 / 上毛浅，赤色背毛 + 白色腹、胸、四肢、脸颊、眉点，分区干净；
 *   4. **面部**：短吻 + 饱满双颊（"棉花糖"感的来源）+ 白口罩 + 眉点；
 *   5. **体尺**：肩高 0.400 / 体长 0.550 / 站姿耳尖高 0.520（NIPPO 柴犬标准取整）；
 *   6. **零位即站姿**：`root.position.y = 0` 时四爪底恰好落在 y = 0。
 *
 * ------------------------------------------------------------------ 零位与关节的约定
 * 运行时只写 `root` 的世界变换、控制器只写 `body` 及以下的姿态，因此**模型自身的零位必须
 * 就是"站在地面上"**。又因为 `dog-controller.ts` 把 `body.position.y` 当**绝对离地高度**写
 * （站立 `DOG_STAND_BODY_Y = 0.32`），所以本文件的 `body` 静止值也必须取 0.32：
 * 两者一旦不一致，接手的第一帧狗就会整只弹起来或陷进地里。
 * `body` 的原点因此落在**躯干中轴**上（肩胛最高点之上 0.08、胸骨之下 0.12），
 * 这既是俯仰/侧倾的自然枢轴（绕重心转，而不是绕地面打转），也正好落在控制器给的高度上。
 *
 * 朝向约定与 `DogRig` / `util.ts` 一致：**头在 +Z、尾在 -Z**，`rotY = 0` 面朝 +Z；
 * 面朝 +Z 时狗自己的**左侧是 +X**（right = forward × up），`legs.frontL` 因此挂在 +X。
 *
 * ⚠️ 关节链的静止姿态要按控制器的语义安排：`dog-controller.ts` 对
 * `body / spine / chest / hips / neck / head / jaw / earL·R / tailRoot / tail[i] /
 * hip / knee` 全是**绝对赋值**。因此这些组里凡是"静止就该有的角度"（耳的前倾外张、
 * 尾巴的卷曲、后肢的股骨-胫骨夹角）一律放进**控制器不会碰的内层**：
 *   - 四肢：静止角度放在 `upper` / `lower` 网格自身的 rotation 上（关节组保持 0）——
 *     顺带让"爪底正好在 y = 0"可以精确算出来，不受关节旋转影响；
 *   - 耳：`ear` 里再套一层静止姿态组；
 *   - 尾：每段里再套一层 carrier 组承载静止卷曲（见尾巴一节的长注释）。
 * 两处**例外**，都是"静止值 = 控制器站姿档的取值"，即"零位 = 站姿"：
 * `body.position.y = BODY_Y` 与 `tailRoot.rotation.x = TAIL_REST_LIFT`。
 */
import * as THREE from 'three';
import type { DogLeg, DogLegs, DogMetrics, DogRig } from './dog-rig.ts';
import { group, roundedBox } from '../util.ts';

// ================================================================ 尺寸基准（米）
//
// 全部尺寸来自柴犬标准与站立姿态实测：肩高 0.400、体长（肩端到尾根）0.550、
// 站姿耳尖高 0.520。**先写成常量、再让 SHIBA_METRICS 引用它们**，而不是两处各写一遍：
// 自检读的是 SHIBA_METRICS，几何一改指标必须跟着变，否则"报的数"与"看到的狗"会悄悄分开。

/** 躯干中轴（= `body` 组静止值）离地高度。必须等于控制器的 `DOG_STAND_BODY_Y`。 */
const BODY_Y = 0.32;

/** 爪：半径 / 竖向压扁 / 前后拉长。压扁后的竖向半径决定"爪底落在哪"。 */
const PAW_R = 0.035;
const PAW_SQUASH = 0.62;
const PAW_STRETCH = 1.26;
const PAW_RY = PAW_R * PAW_SQUASH;
/** 爪心在 body 空间的 y：爪底 = PAW_Y - PAW_RY = -BODY_Y，即 root 空间的 y = 0。 */
const PAW_Y = -BODY_Y + PAW_RY;

type Vec3 = readonly [number, number, number];

// 躯干四块：柴犬是"筒状"身，没有细腰 —— 四块重叠成一截圆筒，上缘几乎水平（背线平）。
// 数值全部在 body 空间。胸块上缘 = -0.02 + 0.10 = +0.08，故肩高 = 0.32 + 0.08 = 0.400。
const CHEST_POS: Vec3 = [0, -0.02, 0.12];
const CHEST_SCALE: Vec3 = [0.105, 0.1, 0.15];
const BELLY_POS: Vec3 = [0, -0.018, -0.01];
const BELLY_SCALE: Vec3 = [0.098, 0.09, 0.145];
const HIPS_POS: Vec3 = [0, -0.015, -0.15];
const HIPS_SCALE: Vec3 = [0.1, 0.09, 0.15];
/** 荐部（臀部上缘）：柴犬的屁股是圆的，而且尾根要有个落点，否则尾巴只能插在骨盆末端下方 */
const CROUP_POS: Vec3 = [0, -0.007, -0.22];
const CROUP_SCALE: Vec3 = [0.09, 0.085, 0.095];
/** 腰椎枢轴：弓背 / 坐下 / 伸展绕它折（`spine` 的子节点是躯干三块，不含四肢与头颈） */
const SPINE_POS: Vec3 = [0, -0.005, -0.04];

/**
 * 颈根 = 头颈链的枢轴。
 *
 * 控制器的 `HEAD_BASE_Y_REL` / `MUZZLE_REACH_M` 是拿它估算"低头时吻部离地多高"的，
 * 那两个常量与本文件的实测值对不上（控制器 0.08 / 0.17，本模型 **0.06 / 0.26**）：
 * 只影响自检报出来的那个估算数字，画面不受影响，但控制器里那两处应改成这里的实测值。
 */
const NECK_POS: Vec3 = [0, 0.06, 0.16];
/** 头（`head` 组）相对颈根的偏移：头心在 body 空间 (0, 0.105, 0.305) */
const HEAD_OFFSET: Vec3 = [0, 0.045, 0.145];
const HEAD_Y = NECK_POS[1] + HEAD_OFFSET[1];

/**
 * 立耳：底在头顶偏前偏外，锥高 0.0675、前倾 0.22 rad、外张 0.16 rad。
 *
 * 高度是为了让**耳尖正好落在 0.520** 反解出来的（前倾与外张都会把尖端压低，
 * 所以不能只按锥高算）。柴犬的"头顶"就是耳尖：忽略这两个角度会把身高多报近 1 cm。
 */
const EAR_BASE: Vec3 = [0.044, 0.03, -0.01];
const EAR_H = 0.0675;
const EAR_TILT = 0.22;
const EAR_SPLAY = 0.16;

/** 尾根：落在荐部上缘（-0.28 与肩端 +0.27 之间正好 0.55 = 体长） */
const TAIL_ROOT_POS: Vec3 = [0, 0.05, -0.28];
/** 单段长度：5 段共 0.19 m，与柴犬尾长（约体高的一半）相符 */
const TAIL_LEN = 0.038;
/** 逐段变细：尾根比脖子还粗是柴犬的辨识点，只允许轻微收细 */
const TAIL_RADII: readonly number[] = [0.041, 0.04, 0.038, 0.035, 0.031];
/**
 * 每段内层 carrier 组的静止卷曲（弧度）。
 *
 * 取值方法：先定**画面里的目标环线**，再减去控制器会给的量。
 * 站立时控制器给出 `tailRoot.rotation.x = 0.55`、每段再叠加 `curl·0.5·(0.35+0.65r)`
 * ≈ [0.0875, 0.128, 0.169, 0.209, 0.25]，于是
 *   A₀ = 0.55 + 0.0875 = 0.6375（尾根上翘 36.5°，"从尾根明显上翘"这条就是它）
 * 再让 A 依次走到 1.75 / 2.60 / 3.35 / 3.90 —— 尾尖累计 3.90 rad ≈ 223°，
 * 正好是柴犬那种**绕回背上、尾巴尖搭在后腰**的环（再卷就会把管子挤成实心团）。
 * 差多少补多少：φ₀=0.9845、φ₁=0.681、φ₂=0.541、φ₃=0.30。
 *
 * 好处不只是"静止也像柴犬"：控制器把 `tailCurl` 调小（趴卧 / 排泄 / 玩耍）时，
 * 卷曲会**从完整的环自然松开**成一条上翘的尾巴 —— 这正是想要的联动，
 * 而不是"尾巴被压平了"。
 */
const TAIL_CARRIER_CURL: readonly number[] = [0.9845, 0.681, 0.541, 0.3];

/** 项圈：套在颈下三分之一处（再往下会被前胸淹没，再往上会顶到耳朵后面） */
const COLLAR_POS: Vec3 = [0, 0.082, 0.232];
/** 颈轴仰角（rad）：带体要垂直于颈轴，电子仓/镜头的位置也按它算 */
const NECK_TILT = 0.301;

/**
 * 尾根的静止上翘量 = 控制器站立档的 `tailLift`（`STAND_POSE.tailLift = 0.55`）。
 *
 * 与 `body.position.y = BODY_Y` 同一条理由：**模型的零位就是站姿**。
 * 控制器逐帧对 `tailRoot.rotation.x` 绝对赋值，站姿写的正是这个数，
 * 因此这里写它就是"零位 = 站姿"，而不是"多转了一点"；控制器换档位时照样覆盖。
 * ⚠️ 控制器改了 `STAND_POSE.tailLift`，这里要跟着改。
 */
const TAIL_REST_LIFT = 0.55;

/** 毛壳每层放大的比例：柴犬是短毛，壳体必须比猫贴得多，否则会读成毛绒玩具 */
const FUR_STEP = 0.01;

/** 毫米取整：指标是给自检脚本读的，不该带浮点尾数 */
const mm = (v: number): number => Math.round(v * 1000) / 1000;

const WITHERS_Y = BODY_Y + CHEST_POS[1] + CHEST_SCALE[1];
const CHEST_FRONT_Z = CHEST_POS[2] + CHEST_SCALE[2];
/** 耳尖的竖直分量：前倾与外张各压掉一点，两段余弦都要算进去 */
const HEAD_TOP_Y = BODY_Y + HEAD_Y + EAR_BASE[1] + EAR_H * Math.cos(EAR_TILT) * Math.cos(EAR_SPLAY);

/**
 * 柴犬的体尺（米）。
 *
 * `headTopY` 取的是**立耳耳尖**——站姿时狗头上的最高点就是它，不是颅顶：
 * 柴犬的耳朵立起来有 6 cm 多，忽略耳朵会把身高少报一大截。
 * `bodyCenterY` 就是 `body` 的静止高度，也是控制器写 `body.position.y` 的基准值。
 */
export const SHIBA_METRICS: DogMetrics = {
  shoulderHeightM: mm(WITHERS_Y), // 0.400
  bodyLengthM: mm(CHEST_FRONT_Z - TAIL_ROOT_POS[2]), // 0.550
  headTopY: mm(HEAD_TOP_Y), // 0.520
  bodyCenterY: mm(BODY_Y), // 0.320
};

// ================================================================ 毛贴图（本文件内自绘）
//
// 为什么不复用 `textures.ts` 的 `catFurTextures()`：
//   1. 猫是长毛虎斑（长笔触 + 条纹），柴犬是**短而顺滑的双层毛**（密而短的笔触、
//      底毛深上毛浅、无条纹），两套笔触画法完全不同，混用一定会画出"柴犬皮的猫"；
//   2. 白斑分区必须画在**对应网格自己的 UV** 上（胸前白斑要落在胸腔球的 u≈0.25/v≈0.2，
//      颈腹白要落在颈部胶囊的 u≈0），这是几何相关的，不属于通用贴图工厂的职责。
// 因此本文件自带一张贴图工厂，只服务这只狗（不碰共用的 `textures.ts`）。

/** mulberry32：固定种子 → 每次打开画面的毛色一致，便于截图回归 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  size: number;
}

function surface(size: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器未提供 2D 画布上下文，柴犬毛贴图不可用');
  return { canvas, ctx, size };
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function grain(s: Surface, seed: number, strength: number): void {
  const rand = rng(seed);
  const img = s.ctx.getImageData(0, 0, s.size, s.size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * strength;
    d[i] = clamp255((d[i] ?? 0) + n);
    d[i + 1] = clamp255((d[i + 1] ?? 0) + n);
    d[i + 2] = clamp255((d[i + 2] ?? 0) + n);
  }
  s.ctx.putImageData(img, 0, 0);
}

function colorTexture(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

/** 高度图 → 法线图（Sobel）。短毛的"毛流起伏"靠它，不靠几何。 */
function normalFromHeight(height: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const size = height.width;
  const src = height.getContext('2d');
  if (!src) throw new Error('高度图上下文不可用');
  const data = src.getImageData(0, 0, size, size).data;
  const out = surface(size);
  const img = out.ctx.createImageData(size, size);

  const at = (x: number, y: number): number => {
    const xi = (x + size) % size;
    const yi = (y + size) % size;
    return (data[(yi * size + xi) * 4] ?? 0) / 255;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      const nx = -dx * strength;
      const ny = -dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * size + x) * 4;
      img.data[i] = clamp255(((nx / len) * 0.5 + 0.5) * 255);
      img.data[i + 1] = clamp255(((ny / len) * 0.5 + 0.5) * 255);
      img.data[i + 2] = clamp255(((nz / len) * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  out.ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out.canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

interface CoatMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  /** 供毛壳层 `alphaTest` 切边用的软边遮罩 */
  alphaMap: THREE.CanvasTexture;
}

/**
 * 一层毛：**底毛色（深）打底 + 上毛色（浅）的密集短笔触**。
 *
 * 这就是"双层毛"在贴图上的表达：深色底只在笔触缝里透出来，读起来是"毛有厚度"，
 * 而不是"刷了一层漆"。笔触沿画布的纵向（= 网格的 v 方向 = 躯干上下），
 * 与真实毛流一致；**短**是关键——柴犬没有长毛垂坠感，笔触一长立刻变成博美。
 *
 * `patch` 用来在毛色之上画"干净的分区"（白胸、白颈腹、嘴缝）。它必须在**取样高度图之前**
 * 调用：否则白斑边缘会被 Sobel 读成一条脊线，胸前会多出一道折痕。
 */
function coatMaps(
  base: string,
  tip: string,
  seed: number,
  patch?: (ctx: CanvasRenderingContext2D, size: number) => void,
  size = 256,
): CoatMaps {
  const s = surface(size);
  s.ctx.fillStyle = base;
  s.ctx.fillRect(0, 0, size, size);
  const rand = rng(seed);

  for (let i = 0; i < 5200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 2.5 + rand() * 4.5;
    s.ctx.globalAlpha = 0.1 + rand() * 0.28;
    // 少量深色笔触 = 底毛从上层透出来；上毛色占多数
    s.ctx.strokeStyle = rand() > 0.22 ? tip : base;
    s.ctx.lineWidth = 0.6 + rand() * 1.1;
    s.ctx.beginPath();
    s.ctx.moveTo(x, y);
    s.ctx.lineTo(x + (rand() - 0.5) * 1.6, y + len);
    s.ctx.stroke();
  }
  s.ctx.globalAlpha = 1;
  grain(s, seed + 1, 14);

  // 高度图在白斑之前取样（见函数注释）
  const height = surface(size);
  height.ctx.drawImage(s.canvas, 0, 0);
  patch?.(s.ctx, size);

  const rough = surface(size);
  rough.ctx.fillStyle = '#d8d8d8';
  rough.ctx.fillRect(0, 0, size, size);
  grain(rough, seed + 2, 30);

  // alpha 遮罩**必须从纯白起手**：three 用它的绿通道做 alphaTest，
  // 若照抄毛色画布，深色底毛（绿通道 ≈ 0.34）会被整片裁掉。
  const alpha = surface(size);
  const ar = rng(seed + 3);
  alpha.ctx.fillStyle = '#ffffff';
  alpha.ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 3000; i++) {
    alpha.ctx.fillStyle = '#000000';
    alpha.ctx.fillRect(ar() * size, ar() * size, 1 + ar() * 2.4, 3 + ar() * 7);
  }

  return {
    map: colorTexture(s.canvas),
    normalMap: normalFromHeight(height.canvas, 1.0),
    roughnessMap: colorTexture(rough.canvas, false),
    alphaMap: colorTexture(alpha.canvas, false),
  };
}

/**
 * 一块边缘不规则的毛色斑（真犬的白斑边界从来不是几何椭圆）。
 *
 * 先铺一圈半透明的羽化环，再铺实心椭圆，最后沿椭圆撒一圈小圆把边界顶乱 ——
 * 三级就够：多画几级在 256² 上只会糊成软边，"干净的分区"反而没了。
 */
function furBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  seed: number,
): void {
  const rand = rng(seed);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.34;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 1.16, ry * 1.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const jx = cx + Math.cos(a) * rx * (0.96 + rand() * 0.1);
    const jy = cy + Math.sin(a) * ry * (0.96 + rand() * 0.1);
    const r = 0.07 * Math.min(rx, ry) * (0.6 + rand() * 0.9);
    ctx.beginPath();
    ctx.arc(jx, jy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 胸前白斑（画在胸腔球的 UV 上）。
 *
 * 球体 UV 的 u = 0.25 是网格本地 +Z（正前方），v = 0 是南极点（胸底）；
 * 画布 y 与 v 反向（flipY），所以"下前方"落在画布左下偏下处。
 * 柴犬的白胸是从喉部一路下到胸骨、两侧收在胸前三分之一的一整块，不是几撮杂白。
 */
function bibPatch(ctx: CanvasRenderingContext2D, size: number): void {
  furBlob(ctx, size * 0.25, size * 0.8, size * 0.135, size * 0.26, '#f7efe2', 411);
}

/** 颈腹白（画在颈部胶囊的 UV 上：胶囊 u = 0 正对腹侧，v 沿颈长） */
function throatPatch(ctx: CanvasRenderingContext2D, size: number): void {
  const rand = rng(509);
  ctx.fillStyle = '#f7efe2';
  ctx.globalAlpha = 1;
  const w = size * 0.085;
  const steps = 20;
  // 腹侧正中就是 u = 0 的接缝，所以左右各画一条；外缘沿 v 抖动，避免出现一条直边
  for (const dir of [1, -1] as const) {
    const seam = dir > 0 ? 0 : size;
    ctx.beginPath();
    ctx.moveTo(seam, 0);
    ctx.lineTo(seam, size);
    for (let i = steps; i >= 0; i--) {
      ctx.lineTo(seam + dir * w * (0.72 + rand() * 0.55), (i / steps) * size);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/** 嘴缝：画在吻部自己的 UV 上（u = 0.25 是正前方，v ≈ 0.35 是下前方） */
function mouthPatch(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.strokeStyle = '#43302a';
  ctx.lineWidth = size * 0.018;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.135, size * 0.585);
  ctx.quadraticCurveTo(size * 0.25, size * 0.71, size * 0.365, size * 0.585);
  ctx.stroke();
}

// ================================================================ 材质

interface Coat {
  base: THREE.MeshStandardMaterial;
  shell: THREE.MeshStandardMaterial;
}

/**
 * 一组毛材质：**基础网格 + 毛壳层**。
 *
 * 毛壳与基础网格共用同一张颜色贴图（所以白斑在壳上也在同一个位置，边界不会错位），
 * 只有 `alphaMap + alphaTest` 的切边与逐层放大不同 —— 这就是"写实 3D 卡通材质"的手法：
 * 轮廓被一层层带毛尖缺口的壳柔化，但颜色分区仍然干净。
 */
function coatMaterials(m: CoatMaps): Coat {
  return {
    base: new THREE.MeshStandardMaterial({
      map: m.map,
      normalMap: m.normalMap,
      roughnessMap: m.roughnessMap,
      // 短毛的起伏很浅：法线强度给大了会变成"搓衣板"，不是柴犬
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.88,
      metalness: 0,
    }),
    shell: new THREE.MeshStandardMaterial({
      map: m.map,
      alphaMap: m.alphaMap,
      roughness: 0.92,
      metalness: 0,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
    }),
  };
}

// ================================================================ 装配

/**
 * 建一只站立的柴犬。
 *
 * @param furLayers 毛壳层数（低画质档给 0 = 完全不建壳层）
 */
export function buildShibaRig(furLayers: number): DogRig {
  const layers = Math.max(0, Math.floor(furLayers));

  // ---- 毛色：赤柴（橙棕背毛）+ 奶油白（腹、胸、四肢、脸颊、眉点、内耳）
  const redCoat = coatMaterials(coatMaps('#a85618', '#eaa45c', 11));
  const creamCoat = coatMaterials(coatMaps('#cbb69a', '#fdf7ec', 17));
  const chestCoat = coatMaterials(coatMaps('#a85618', '#eaa45c', 11, bibPatch));
  const neckCoat = coatMaterials(coatMaps('#a85618', '#eaa45c', 11, throatPatch));
  const muzzleCoat = coatMaterials(coatMaps('#cbb69a', '#fdf7ec', 17, mouthPatch));

  const noseMat = new THREE.MeshStandardMaterial({ color: 0x241d1a, roughness: 0.3, metalness: 0.05 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x3d2718, roughness: 0.16 }); // 柴犬是深褐眼
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0d0a08, roughness: 0.12 });
  /** 黑眼线：柴犬的招牌，闭眼时留在脸上的就是它（眼睛被控制器压扁，眼线不受影响） */
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x1b1512, roughness: 0.55 });
  const glintMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 });
  const innerEarMat = new THREE.MeshStandardMaterial({ color: 0xd7ae95, roughness: 0.82 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xcf6a72, roughness: 0.5 });

  const root = group('shiba');
  const body = group('shiba-body');
  body.position.y = BODY_Y; // 静止值 = 站姿；控制器逐帧写绝对值，取值与这里一致
  root.add(body);

  const spine = group('shiba-spine');
  spine.position.set(SPINE_POS[0], SPINE_POS[1], SPINE_POS[2]);
  body.add(spine);

  const furShells: THREE.Object3D[] = [];

  /**
   * 造一块毛 + 逐层放大的毛壳。
   *
   * 壳层只加在**躯干、头、脸、尾**上：爪与小腿不加 ——
   * 一是柴犬的短毛在小腿上本来就是贴的，壳体放大反而把爪子糊成一团；
   * 二是壳比网格大一圈，加在爪上会让"爪底正好在 y = 0"变成"略微穿地"。
   */
  const addCoat = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    pos: Vec3,
    scale: Vec3,
    mats: Coat,
    rot?: Vec3,
    shells: number = layers,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mats.base);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    for (let i = 1; i <= shells; i++) {
      const shell = new THREE.Mesh(geo, mats.shell);
      const k = 1 + i * FUR_STEP;
      shell.position.set(pos[0], pos[1], pos[2]);
      shell.scale.set(scale[0] * k, scale[1] * k, scale[2] * k);
      if (rot) shell.rotation.set(rot[0], rot[1], rot[2]);
      shell.castShadow = false;
      shell.receiveShadow = false;
      // 记下所处层号：切画质时按层号显隐，不需要重建模型
      shell.userData.furLayer = i;
      parent.add(shell);
      furShells.push(shell);
    }
    return mesh;
  };

  // 一切"圆润块"共用一个单位球 + 非均匀缩放：柴犬全身都是圆钝的体块，没有直角
  const ball = new THREE.SphereGeometry(1, 28, 20);

  /** 躯干各块按 body 空间给出，这里换算成 `spine` 的局部坐标（只此一处，避免两套坐标混用） */
  const inSpine = (p: Vec3): Vec3 => [p[0] - SPINE_POS[0], p[1] - SPINE_POS[1], p[2] - SPINE_POS[2]];

  // ---------------------------------------------------------------- 躯干
  // 胸最靠前也最深（胸骨最低点 -0.12，与肘同高），腰最浅（轻微收腹），荐部把屁股补圆。
  const chest = addCoat(spine, ball, inSpine(CHEST_POS), CHEST_SCALE, chestCoat);
  const belly = addCoat(spine, ball, inSpine(BELLY_POS), BELLY_SCALE, redCoat);
  const hips = addCoat(spine, ball, inSpine(HIPS_POS), HIPS_SCALE, redCoat);
  addCoat(spine, ball, inSpine(CROUP_POS), CROUP_SCALE, redCoat);
  chest.name = 'shiba-chest';
  belly.name = 'shiba-belly';
  hips.name = 'shiba-hips';

  // ---------------------------------------------------------------- 颈
  // 颈几乎水平地前伸（柴犬的脖子短而厚，头抬得高）：胶囊轴与颈轴一致，
  // 让 u = 0 正对腹侧，白颈腹才有一块干净的落点。
  const neck = group('shiba-neck');
  neck.position.set(NECK_POS[0], NECK_POS[1], NECK_POS[2]);
  body.add(neck);
  const neckDir = new THREE.Vector3(HEAD_OFFSET[0], HEAD_OFFSET[1], HEAD_OFFSET[2]).normalize();
  const neckMid = new THREE.Vector3(HEAD_OFFSET[0] / 2, HEAD_OFFSET[1] / 2, HEAD_OFFSET[2] / 2);
  addCoat(
    neck,
    new THREE.CapsuleGeometry(0.062, 0.085, 6, 18),
    [neckMid.x, neckMid.y, neckMid.z],
    [1, 1, 1],
    neckCoat,
    [Math.atan2(neckDir.z, neckDir.y), 0, 0],
  );

  // ---------------------------------------------------------------- 头
  const head = group('shiba-head');
  head.position.set(HEAD_OFFSET[0], HEAD_OFFSET[1], HEAD_OFFSET[2]);
  neck.add(head);

  // 颅骨：宽而略短，柴犬的头是"宽楔形"，不是猎犬那种长头
  addCoat(head, ball, [0, 0, 0], [0.058, 0.055, 0.06], redCoat);
  // 吻部（白口罩）：短、粗、饱满；嘴缝画在它自己的 UV 上，比拿细长条去贴面可靠得多
  const muzzle = addCoat(head, ball, [0, -0.02, 0.056], [0.036, 0.031, 0.048], muzzleCoat);
  muzzle.name = 'shiba-muzzle';
  // 双颊：**这是柴犬"棉花糖"感的全部来源**。外缘 x 到 0.071（颅骨只有 0.058），
  // 从正面看脸颊明显鼓出颅骨之外；白色与颅骨的赤色在球面相交处自然收出一条干净分界。
  const cheekL = addCoat(head, ball, [0.04, -0.026, 0.028], [0.031, 0.029, 0.031], creamCoat);
  const cheekR = addCoat(head, ball, [-0.04, -0.026, 0.028], [0.031, 0.029, 0.031], creamCoat);
  cheekL.name = 'shiba-cheek-left';
  cheekR.name = 'shiba-cheek-right';
  // 眉点：浅色圆点，柴犬的表情就是靠这两点读出来的（"四つ目"）
  const browL = addCoat(head, ball, [0.026, 0.036, 0.034], [0.013, 0.01, 0.008], creamCoat, undefined, 0);
  const browR = addCoat(head, ball, [-0.026, 0.036, 0.034], [0.013, 0.01, 0.008], creamCoat, undefined, 0);
  browL.name = 'shiba-brow-left';
  browR.name = 'shiba-brow-right';

  const nose = new THREE.Mesh(ball, noseMat);
  nose.position.set(0, -0.014, 0.102);
  nose.scale.set(0.0145, 0.011, 0.011);
  nose.name = 'shiba-nose';
  head.add(nose);

  /**
   * 眼：黑眼线 + 深褐眼球 + 瞳孔 + 高光。
   *
   * 眼球与瞳孔都是**单位球缩放**，因为控制器会读走它们的基准缩放，
   * 逐帧压扁 y 来眨眼（见 `dog-controller.ts` 的 lid）；眼线不参与缩放，
   * 于是闭眼时脸上留下的是一道黑色眼线而不是一个空洞。
   */
  const makeEye = (side: 1 | -1): { eye: THREE.Mesh; pupil: THREE.Mesh } => {
    const rim = new THREE.Mesh(ball, rimMat);
    rim.position.set(side * 0.033, 0.014, 0.038);
    rim.scale.set(0.018, 0.017, 0.01);
    head.add(rim);

    const eye = new THREE.Mesh(ball, irisMat);
    eye.position.set(side * 0.032, 0.014, 0.042);
    eye.scale.set(0.0145, 0.0135, 0.0125);
    eye.castShadow = true;
    head.add(eye);

    const pupil = new THREE.Mesh(ball, pupilMat);
    pupil.position.set(side * 0.0325, 0.0135, 0.049);
    pupil.scale.set(0.008, 0.009, 0.006);
    head.add(pupil);

    const glint = new THREE.Mesh(ball, glintMat);
    glint.position.set(side * 0.037, 0.02, 0.052);
    glint.scale.setScalar(0.0035);
    head.add(glint);

    return { eye, pupil };
  };
  const eyeRight = makeEye(-1);
  const eyeLeft = makeEye(1);

  // 下颌：枢轴放在口角后方，绕 X 轴正向转动 = 张口；舌头挂在下颌上，跟着一起动
  const jaw = group('shiba-jaw');
  jaw.position.set(0, -0.018, 0.012);
  head.add(jaw);
  addCoat(jaw, ball, [0, -0.024, 0.04], [0.029, 0.017, 0.032], creamCoat, undefined, 0);
  // 舌头：**伸出方向必须是它自己的 +Y**（控制器用 scale.y 表示伸出量），
  // 所以把网格先转到"口外朝前下"，缩放才会沿着口腔方向把舌头推出去。
  const tongue = new THREE.Mesh(ball, tongueMat);
  tongue.position.set(0, -0.012, 0.05);
  tongue.rotation.x = 2.04;
  tongue.scale.set(0.014, 0.008, 0.01);
  tongue.name = 'shiba-tongue';
  tongue.visible = false;
  jaw.add(tongue);

  /**
   * 立耳：三角、前倾、可见浅色内耳。
   *
   * 静止姿态（前倾 0.22 / 外张 0.16）放在**内层 rest 组**里：
   * 控制器对 `earL/R.rotation.z` 是绝对赋值（`earFlatten · 1.2` 直接把耳朵压平），
   * 静止角度若写在外层会被第一帧抹掉，耳朵就永远是竖直的。
   */
  const earGeo = new THREE.ConeGeometry(1, 1, 14);
  const makeEar = (side: 1 | -1): THREE.Group => {
    const ear = group(side > 0 ? 'shiba-ear-left' : 'shiba-ear-right');
    ear.position.set(side * EAR_BASE[0], EAR_BASE[1], EAR_BASE[2]);
    head.add(ear);
    const rest = group('shiba-ear-rest');
    rest.rotation.x = EAR_TILT;
    rest.rotation.z = -side * EAR_SPLAY;
    ear.add(rest);
    // 锥体压扁成"刀片状"：真犬的耳朵是薄三角，不是圆锥
    const outer = new THREE.Mesh(earGeo, redCoat.base);
    outer.scale.set(0.03, EAR_H, 0.02);
    outer.position.y = EAR_H / 2;
    outer.castShadow = true;
    outer.receiveShadow = true;
    rest.add(outer);
    const inner = new THREE.Mesh(earGeo, innerEarMat);
    inner.scale.set(0.019, EAR_H * 0.84, 0.013);
    inner.position.set(0, EAR_H * 0.42, 0.009);
    rest.add(inner);
    return ear;
  };
  const earLeft = makeEar(1);
  const earRight = makeEar(-1);

  // ---------------------------------------------------------------- 四肢
  //
  // 三级链的静止旋转**全部为 0**，腿的姿态角度写在各网格自己的 rotation 上：
  //   前肢是两根立柱（犬的前肢本来就近乎垂直），后肢是股骨前倾 + 胫骨后倾的"之"字。
  // 这样每个关节组的旋转都是控制器要的绝对值，且"爪底正好在 y = 0"只由位置决定，
  // 不会因为关节角度而算错。
  const makeLeg = (kind: 'front' | 'hind', side: 1 | -1): DogLeg => {
    const front = kind === 'front';
    const tag = `${kind}-${side > 0 ? 'left' : 'right'}`;
    const x = side * (front ? 0.078 : 0.072);
    const hipY = front ? -0.03 : -0.06;
    const hip = group(`shiba-leg-${tag}`);
    hip.position.set(x, hipY, front ? 0.175 : -0.165);
    body.add(hip);

    // 肘 / 膝：前肢近乎垂直（犬的前肢本来就是立柱），后肢的膝关节在髋关节前方
    const kneeLocal: Vec3 = front ? [0, -0.09, 0.005] : [0, -0.1, 0.04];
    const pawLocal: Vec3 = [0, PAW_Y - hipY - kneeLocal[1], front ? 0.01 : -0.045];

    // 肩/臀的肌肉团：让腿从躯干里"长出来"，而不是插一根管子进去
    addCoat(
      hip,
      ball,
      front ? [0, 0.004, -0.004] : [0, -0.048, 0.016],
      front ? [0.038, 0.042, 0.042] : [0.044, 0.055, 0.058],
      redCoat,
    );

    const upper = new THREE.Mesh(
      front ? new THREE.CapsuleGeometry(0.033, 0.05, 6, 14) : new THREE.CapsuleGeometry(0.038, 0.04, 6, 14),
      redCoat.base,
    );
    if (front) {
      upper.position.set(0, -0.042, 0.002);
    } else {
      // 股骨：从髋关节斜向前下到膝关节
      upper.position.set(0, -0.05, 0.02);
      upper.rotation.x = -0.38;
    }
    upper.castShadow = true;
    upper.receiveShadow = true;
    hip.add(upper);

    const knee = group(`shiba-knee-${tag}`);
    knee.position.set(kneeLocal[0], kneeLocal[1], kneeLocal[2]);
    hip.add(knee);

    // 前肢：桡尺骨 + 掌骨连成一根立柱；后肢：胫骨 + 跗骨向后下
    const lower = new THREE.Mesh(
      front ? new THREE.CapsuleGeometry(0.026, 0.115, 6, 14) : new THREE.CapsuleGeometry(0.027, 0.092, 6, 14),
      creamCoat.base,
    );
    if (front) {
      lower.position.set(0, -0.089, 0.005);
    } else {
      lower.position.set(0, -0.069, -0.0225);
      lower.rotation.x = 0.314;
    }
    lower.castShadow = true;
    lower.receiveShadow = true;
    knee.add(lower);

    // 爪：圆厚、前伸、压扁。**不加毛壳**（见 addCoat 的注释），
    // 因此爪底 y 由 PAW_Y - PAW_RY 精确给出。
    const paw = new THREE.Mesh(ball, creamCoat.base);
    paw.position.set(pawLocal[0], pawLocal[1], pawLocal[2]);
    paw.scale.set(PAW_R, PAW_RY, PAW_R * PAW_STRETCH);
    paw.castShadow = true;
    paw.receiveShadow = true;
    knee.add(paw);

    // 脚趾：三颗小圆凸，白色的爪子上有趾头才不读成"棉球"
    for (const i of [-1, 0, 1]) {
      const toe = new THREE.Mesh(ball, creamCoat.base);
      toe.position.set(i * 0.013, pawLocal[1] + 0.008, pawLocal[2] + (front ? 0.03 : 0.035));
      toe.scale.setScalar(0.011);
      toe.castShadow = true;
      knee.add(toe);
    }

    return { hip, upper, knee, lower, paw };
  };

  const legs: DogLegs = {
    frontL: makeLeg('front', 1),
    frontR: makeLeg('front', -1),
    hindL: makeLeg('hind', 1),
    hindR: makeLeg('hind', -1),
  };

  // ---------------------------------------------------------------- 尾巴
  //
  // 5 段，从尾根明显上翘再向前卷成环。**卷曲的静止角度放在每段内层的 carrier 组里**：
  // 控制器对 `tail[i].rotation.x` 同样是绝对赋值（它把"卷曲程度"当成一个 0–0.55 的档位），
  // 静止角度写在这一层会被逐帧抹平，柴犬的卷尾就没了。
  // 放进 carrier 之后，控制器那一档位就变成**叠加量**：站立时卷成完整的环，
  // 趴卧 / 排泄时档位调小，环自然松开成上翘的尾巴。
  const tailRoot = group('shiba-tail-root');
  tailRoot.position.set(TAIL_ROOT_POS[0], TAIL_ROOT_POS[1], TAIL_ROOT_POS[2]);
  tailRoot.rotation.x = TAIL_REST_LIFT;
  body.add(tailRoot);

  const tail: THREE.Group[] = [];
  let tailParent: THREE.Object3D = tailRoot;
  for (let i = 0; i < TAIL_RADII.length; i++) {
    const radius = TAIL_RADII[i] ?? 0.038;
    const curl = TAIL_CARRIER_CURL[i] ?? 0;
    const seg = group(`shiba-tail-${i}`);
    seg.position.set(0, 0, i === 0 ? 0 : -TAIL_LEN);
    tailParent.add(seg);

    // 这一段的可见管体要从本段原点指向下一段原点，也就是指向 carrier 的方向：
    // 先绕 X 转 π/2 把胶囊轴从 +Y 摆到 +Z，再叠加 carrier 的静止角。
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, TAIL_LEN, 6, 14), redCoat.base);
    mesh.rotation.x = Math.PI / 2 + curl;
    mesh.position.set(0, (TAIL_LEN / 2) * Math.sin(curl), -(TAIL_LEN / 2) * Math.cos(curl));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    seg.add(mesh);
    for (let k = 1; k <= layers; k++) {
      const shell = new THREE.Mesh(mesh.geometry, redCoat.shell);
      const kk = 1 + k * FUR_STEP;
      shell.rotation.copy(mesh.rotation);
      shell.position.copy(mesh.position);
      shell.scale.set(kk, kk, kk);
      shell.userData.furLayer = k;
      seg.add(shell);
      furShells.push(shell);
    }

    tail.push(seg);
    if (i < TAIL_RADII.length - 1) {
      const carrier = group('shiba-tail-curl');
      carrier.rotation.x = curl;
      seg.add(carrier);
      tailParent = carrier;
    }
  }

  // ---------------------------------------------------------------- 项圈硬件
  //
  // 位置即能力，与猫版同一条理由：
  //   - ECG 干电极贴在**颈左右侧**（电极要皮肤接触，被毛是主要障碍）；
  //   - 体表热敏电阻贴在**颈腹侧**（测的是被毛表面温度，不是核心温）；
  //   - 电子仓在**颈背侧**——远离下颌活动区，狗低头喝水时也不会磕到碗；
  //   - 摄像头在带体**前端下缘**，朝 +Z（狗的朝向），与 App 的「实时」页同一视角。
  // `collar` 组本身**不做旋转**：带体、电子仓、电极各自的倾斜写在自己的网格上，
  // 这样下面六个部件的位置可以直接按"上下左右前后"读，不必在脑子里做一次坐标旋转。
  const collar = group('shiba-collar');
  collar.position.set(COLLAR_POS[0], COLLAR_POS[1], COLLAR_POS[2]);
  body.add(collar);

  const bandMat = new THREE.MeshStandardMaterial({ color: 0x3d3f45, roughness: 0.72, metalness: 0.12 });
  const podMat = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.45, metalness: 0.2 });
  const electrodeMat = new THREE.MeshStandardMaterial({ color: 0x2f8f86, roughness: 0.35, metalness: 0.35 });
  const thermistorMat = new THREE.MeshStandardMaterial({ color: 0xb5651d, roughness: 0.55 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.25, metalness: 0.5 });

  // ① 带体：垂直于颈轴
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.0075, 8, 30), bandMat);
  band.rotation.x = -NECK_TILT;
  band.name = 'collar-band';
  collar.add(band);

  // ② 电子仓：颈背侧。长边沿带体切向（像真的追踪器），底面贴合带体
  const pod = roundedBox(0.048, 0.014, 0.034, 0.006, podMat);
  pod.position.set(0, 0.078, 0);
  pod.rotation.x = -NECK_TILT;
  pod.name = 'collar-pod';
  pod.castShadow = true;
  collar.add(pod);

  // ③④ ECG 干电极 ×2：颈左右侧，圆片比带体管径粗，会从带体两面透出来（可见）
  for (const side of [1, -1] as const) {
    const electrode = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.005, 14), electrodeMat);
    electrode.position.set(side * 0.066, 0, 0);
    electrode.rotation.z = Math.PI / 2;
    electrode.name = side > 0 ? 'collar-ecg-left' : 'collar-ecg-right';
    collar.add(electrode);
  }

  // ⑤ 体表热敏电阻：颈腹侧，贴皮。
  // 珠子中心放在 r = 0.070：径向占 0.0615–0.0785，内侧压在颈皮（0.062）上，
  // 外侧比带体外表面（0.0735）鼓出约 5 mm —— **能看见**才算一个部件；
  // 若照猫版放在带体管心（r=0.066），整颗会被带体吞掉。
  const thermistor = new THREE.Mesh(ball, thermistorMat);
  thermistor.position.set(0, -0.07, 0);
  thermistor.scale.setScalar(0.0085);
  thermistor.name = 'collar-thermistor';
  collar.add(thermistor);

  // ⑥ 项圈相机：带体前端下缘那颗小镜头，朝 +Z 略向下（项圈挂在颈前，视线自然略低）
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.01, 16), lensMat);
  lens.position.set(0, -0.072, 0.019);
  lens.rotation.x = 2.126;
  lens.name = 'collar-camera';
  collar.add(lens);

  return {
    root,
    body,
    spine,
    chest,
    hips,
    neck,
    head,
    muzzle,
    cheekL,
    cheekR,
    nose,
    jaw,
    tongue,
    eyeL: eyeLeft.eye,
    eyeR: eyeRight.eye,
    pupilL: eyeLeft.pupil,
    pupilR: eyeRight.pupil,
    browL,
    browR,
    earL: earLeft,
    earR: earRight,
    tailRoot,
    tail,
    legs,
    // 只有会随呼吸形变的三块：胸、腹、胯。荐部与四肢不参与，否则吸气时会看到屁股在胀。
    breathParts: [chest, belly, hips],
    furShells,
    collar,
  };
}
