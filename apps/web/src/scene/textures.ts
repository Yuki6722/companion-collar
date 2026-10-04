/**
 * 程序化贴图工厂。
 *
 * 为什么自己生成而不是只用外部贴图：
 *   1. **降级路径**——CC0 平铺贴图没下到或加载失败时，场景仍然必须是「写实风格」而不是白模，
 *      否则一次网络/资产问题就退化成半成品。
 *   2. **确定性**——用固定种子的 PRNG，每次打开画面一致，便于截图回归。
 *
 * 约定：颜色贴图设 `SRGBColorSpace`，粗糙度/法线/遮罩一律 `NoColorSpace`（three 对数据贴图的默认期望）。
 */
import * as THREE from 'three';

// ---------------------------------------------------------------- 基础工具

/** mulberry32：固定种子 → 可复现的贴图 */
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
  if (!ctx) throw new Error('浏览器未提供 2D 画布上下文，程序化贴图不可用');
  return { canvas, ctx, size };
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

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function flat(s: Surface, color: string): void {
  s.ctx.fillStyle = color;
  s.ctx.fillRect(0, 0, s.size, s.size);
}

/** 让图案在贴图边界处可无缝平铺：把右侧/下侧 10% 与左侧/上侧做交叉淡化 */
function seamBlend(s: Surface, band = 0.1): void {
  const w = s.size;
  const bw = Math.round(w * band);
  const img = s.ctx.getImageData(0, 0, w, w);
  const out = s.ctx.createImageData(w, w);
  out.data.set(img.data);
  for (let y = 0; y < w; y++) {
    for (let i = 0; i < bw; i++) {
      const t = i / bw;
      for (const x of [i, w - bw + i]) {
        const src = (y * w + (x === i ? w - bw + i : i)) * 4;
        const dst = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const a = img.data[dst + c] ?? 0;
          const b = img.data[src + c] ?? 0;
          out.data[dst + c] = clamp255(a * (1 - t * 0.5) + b * (t * 0.5));
        }
      }
    }
  }
  s.ctx.putImageData(out, 0, 0);
}

/** 高度图 → 法线图（Sobel）。用于木纹、织物、剑麻这类有起伏的表面。 */
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

function colorTexture(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

function heightCanvas(size: number, painter: (s: Surface) => void, seed: number): HTMLCanvasElement {
  const s = surface(size);
  flat(s, '#808080');
  painter(s);
  grain(s, seed, 18);
  return s.canvas;
}

// ---------------------------------------------------------------- 材质贴图

export interface WoodMaps {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

/** 木地板/木饰面：拉长木纹 + 板缝。 */
export function woodTextures(opts: {
  seed?: number;
  plank?: boolean;
  base?: string;
  dark?: string;
  size?: number;
} = {}): WoodMaps {
  const size = opts.size ?? 512;
  const seed = opts.seed ?? 7;
  const base = opts.base ?? '#a4713f';
  const dark = opts.dark ?? '#6f4522';
  const s = surface(size);
  flat(s, base);

  const rand = rng(seed);
  const plankRows = opts.plank ? 6 : 0;
  const rowH = plankRows > 0 ? size / plankRows : size;

  for (let i = 0; i < 260; i++) {
    const y = rand() * size;
    const wobble = 2 + rand() * 10;
    s.ctx.strokeStyle = rand() > 0.45 ? dark : base;
    s.ctx.globalAlpha = 0.05 + rand() * 0.22;
    s.ctx.lineWidth = 0.6 + rand() * 2.2;
    s.ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const yy = y + Math.sin((x / size) * Math.PI * (1 + rand() * 2)) * wobble;
      if (x === 0) s.ctx.moveTo(x, yy);
      else s.ctx.lineTo(x, yy);
    }
    s.ctx.stroke();
  }
  s.ctx.globalAlpha = 1;

  // 板缝：每块板之间一道暗线 + 板内色差
  if (plankRows > 0) {
    for (let r = 0; r < plankRows; r++) {
      const y0 = r * rowH;
      s.ctx.globalAlpha = 0.18 + rand() * 0.14;
      s.ctx.fillStyle = rand() > 0.5 ? '#000000' : '#ffffff';
      s.ctx.fillRect(0, y0, size, rowH);
      s.ctx.globalAlpha = 1;
      s.ctx.fillStyle = '#2c1a0d';
      s.ctx.fillRect(0, y0, size, 2);
      // 板端拼缝
      const seam = Math.round(rand() * size);
      s.ctx.fillRect(seam, y0, 2, rowH);
    }
  }
  grain(s, seed + 1, 26);
  seamBlend(s);

  const height = heightCanvas(
    size,
    (h) => {
      h.ctx.drawImage(s.canvas, 0, 0);
    },
    seed + 2,
  );

  const rough = surface(size);
  rough.ctx.drawImage(s.canvas, 0, 0);
  grain(rough, seed + 3, 40);

  return {
    map: colorTexture(s.canvas),
    roughnessMap: colorTexture(rough.canvas, false),
    normalMap: normalFromHeight(height, 1.1),
  };
}

export interface SimpleMaps {
  map: THREE.CanvasTexture;
  roughnessMap?: THREE.CanvasTexture;
  normalMap?: THREE.CanvasTexture;
}

/** 墙面：微水泥/乳胶漆的细腻起伏。 */
export function plasterTextures(color = '#efe7dc', seed = 21, size = 256): SimpleMaps {
  const s = surface(size);
  flat(s, color);
  const rand = rng(seed);
  for (let i = 0; i < 120; i++) {
    const r = 8 + rand() * 44;
    const g = s.ctx.createRadialGradient(rand() * size, rand() * size, 0, rand() * size, rand() * size, r);
    g.addColorStop(0, rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    s.ctx.fillStyle = g;
    s.ctx.fillRect(0, 0, size, size);
  }
  grain(s, seed + 1, 12);
  seamBlend(s, 0.18);

  const height = heightCanvas(size, (h) => h.ctx.drawImage(s.canvas, 0, 0), seed + 2);
  const rough = surface(size);
  flat(rough, '#e8e8e8');
  grain(rough, seed + 3, 30);

  return {
    map: colorTexture(s.canvas),
    roughnessMap: colorTexture(rough.canvas, false),
    normalMap: normalFromHeight(height, 0.35),
  };
}

/** 织物：地毯/沙发布面。编织格纹 + 绒毛噪点。 */
export function fabricTextures(color = '#cbb89f', seed = 33, size = 256, threadPx = 4): SimpleMaps {
  const s = surface(size);
  flat(s, color);
  const rand = rng(seed);
  for (let y = 0; y < size; y += threadPx) {
    for (let x = 0; x < size; x += threadPx) {
      const over = ((x / threadPx + y / threadPx) % 2) === 0;
      s.ctx.globalAlpha = over ? 0.16 : 0.07;
      s.ctx.fillStyle = over ? '#ffffff' : '#000000';
      s.ctx.fillRect(x, y, threadPx, threadPx);
      s.ctx.globalAlpha = 0.05 + rand() * 0.08;
      s.ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000';
      s.ctx.fillRect(x + 1, y + 1, threadPx - 2, threadPx - 2);
    }
  }
  s.ctx.globalAlpha = 1;
  grain(s, seed + 1, 34);
  seamBlend(s, 0.12);

  const height = heightCanvas(
    size,
    (h) => {
      const hr = rng(seed + 5);
      for (let y = 0; y < size; y += threadPx) {
        h.ctx.fillStyle = ((y / threadPx) % 2) === 0 ? '#9a9a9a' : '#6a6a6a';
        h.ctx.fillRect(0, y, size, threadPx);
      }
      h.ctx.globalAlpha = 0.2;
      for (let i = 0; i < 400; i++) {
        h.ctx.fillStyle = hr() > 0.5 ? '#ffffff' : '#000000';
        h.ctx.fillRect(hr() * size, hr() * size, 2, 2);
      }
      h.ctx.globalAlpha = 1;
    },
    seed + 2,
  );

  const rough = surface(size);
  flat(rough, '#d0d0d0');
  grain(rough, seed + 3, 46);

  return {
    map: colorTexture(s.canvas),
    roughnessMap: colorTexture(rough.canvas, false),
    normalMap: normalFromHeight(height, 1.6),
  };
}

/** 石材台面：白底 + 少量灰色脉纹。 */
export function stoneTextures(seed = 44, size = 256): SimpleMaps {
  const s = surface(size);
  flat(s, '#e9e6e1');
  const rand = rng(seed);
  for (let i = 0; i < 14; i++) {
    s.ctx.strokeStyle = rand() > 0.5 ? '#b9b3ab' : '#8f8880';
    s.ctx.globalAlpha = 0.12 + rand() * 0.3;
    s.ctx.lineWidth = 0.5 + rand() * 2.6;
    s.ctx.beginPath();
    let x = rand() * size;
    let y = rand() * size;
    s.ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rand() - 0.5) * size * 0.6;
      y += (rand() - 0.5) * size * 0.6;
      s.ctx.lineTo(x, y);
    }
    s.ctx.stroke();
  }
  s.ctx.globalAlpha = 1;
  grain(s, seed + 1, 14);
  seamBlend(s, 0.16);
  return { map: colorTexture(s.canvas) };
}

/** 拉丝金属：冰箱/灶台/五金。 */
export function metalTextures(seed = 55, size = 256): SimpleMaps {
  const s = surface(size);
  flat(s, '#b9bcc0');
  const rand = rng(seed);
  for (let i = 0; i < 900; i++) {
    s.ctx.globalAlpha = 0.02 + rand() * 0.09;
    s.ctx.strokeStyle = rand() > 0.5 ? '#ffffff' : '#5d6166';
    s.ctx.lineWidth = 0.5 + rand() * 1.4;
    const y = rand() * size;
    s.ctx.beginPath();
    s.ctx.moveTo(0, y);
    s.ctx.lineTo(size, y + (rand() - 0.5) * 4);
    s.ctx.stroke();
  }
  s.ctx.globalAlpha = 1;
  grain(s, seed + 1, 10);
  seamBlend(s);
  const rough = surface(size);
  flat(rough, '#7d7d7d');
  grain(rough, seed + 2, 24);
  return { map: colorTexture(s.canvas), roughnessMap: colorTexture(rough.canvas, false) };
}

/** 剑麻（猫爬架立柱）：斜向缠绕绳纹。 */
export function sisalTextures(seed = 66, size = 256): SimpleMaps {
  const s = surface(size);
  flat(s, '#c9a978');
  const rand = rng(seed);
  s.ctx.lineWidth = 5;
  for (let k = -size; k < size * 2; k += 11) {
    s.ctx.strokeStyle = k % 22 === 0 ? '#a07f52' : '#d8bb8b';
    s.ctx.globalAlpha = 0.75;
    s.ctx.beginPath();
    s.ctx.moveTo(k, 0);
    s.ctx.lineTo(k + size, size);
    s.ctx.stroke();
  }
  s.ctx.globalAlpha = 1;
  for (let i = 0; i < 500; i++) {
    s.ctx.globalAlpha = 0.05 + rand() * 0.1;
    s.ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000';
    s.ctx.fillRect(rand() * size, rand() * size, 2, 2);
  }
  s.ctx.globalAlpha = 1;
  seamBlend(s);

  const height = heightCanvas(
    size,
    (h) => {
      h.ctx.drawImage(s.canvas, 0, 0);
    },
    seed + 1,
  );
  return { map: colorTexture(s.canvas), normalMap: normalFromHeight(height, 2.2) };
}

/** 猫砂：颗粒感。 */
export function litterTextures(seed = 77, size = 256): SimpleMaps {
  const s = surface(size);
  flat(s, '#d9d2c4');
  const rand = rng(seed);
  for (let i = 0; i < 5200; i++) {
    const r = 0.7 + rand() * 1.9;
    s.ctx.globalAlpha = 0.18 + rand() * 0.5;
    s.ctx.fillStyle = rand() > 0.5 ? '#f2ece0' : '#a99f8c';
    s.ctx.beginPath();
    s.ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
    s.ctx.fill();
  }
  s.ctx.globalAlpha = 1;
  seamBlend(s, 0.2);
  const height = heightCanvas(size, (h) => h.ctx.drawImage(s.canvas, 0, 0), seed + 1);
  return { map: colorTexture(s.canvas), normalMap: normalFromHeight(height, 1.4) };
}

// ---------------------------------------------------------------- 猫

export interface CatFurMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  /** 供毛壳层 alphaTest 使用的软边遮罩 */
  alphaMap: THREE.CanvasTexture;
}

/**
 * 橘色虎斑：底色为浅橘，叠加深橘条纹与噪点。
 * 条纹沿贴图 V 方向分布，因此在模型上按「垂直于脊椎」的方向展开 UV。
 */
export function catFurTextures(seed = 88, size = 512): CatFurMaps {
  const s = surface(size);
  const g = s.ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#f0a860');
  g.addColorStop(0.45, '#e2944a');
  g.addColorStop(1, '#f4c088');
  s.ctx.fillStyle = g;
  s.ctx.fillRect(0, 0, size, size);

  const rand = rng(seed);
  // 腹部提亮：贴图 V 方向对应球体纬度，靠下更浅，读起来更接近真实毛色分布
  const belly = s.ctx.createLinearGradient(0, size * 0.45, 0, size);
  belly.addColorStop(0, 'rgba(255, 236, 205, 0)');
  belly.addColorStop(1, 'rgba(255, 240, 214, 0.55)');
  s.ctx.fillStyle = belly;
  s.ctx.fillRect(0, 0, size, size);

  // 虎斑条纹：宽度与间距都不规则，对比度刻意压低（太高会像玩具虎）
  let y = 6;
  while (y < size) {
    const h = 8 + rand() * 20;
    s.ctx.globalAlpha = 0.1 + rand() * 0.16;
    s.ctx.fillStyle = '#b4601f';
    s.ctx.beginPath();
    s.ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 12) {
      s.ctx.lineTo(x, y + Math.sin((x / size) * Math.PI * (1.5 + rand())) * 6);
    }
    for (let x = size; x >= 0; x -= 12) {
      s.ctx.lineTo(x, y + h + Math.sin((x / size) * Math.PI * (1.2 + rand())) * 6);
    }
    s.ctx.closePath();
    s.ctx.fill();
    y += h + 14 + rand() * 26;
  }
  s.ctx.globalAlpha = 1;

  // 毛流：细密短笔触
  for (let i = 0; i < 9000; i++) {
    const x = rand() * size;
    const yy = rand() * size;
    s.ctx.globalAlpha = 0.04 + rand() * 0.12;
    s.ctx.strokeStyle = rand() > 0.5 ? '#fff0d8' : '#8d4512';
    s.ctx.lineWidth = 0.6 + rand();
    s.ctx.beginPath();
    s.ctx.moveTo(x, yy);
    s.ctx.lineTo(x + (rand() - 0.5) * 3, yy + 2 + rand() * 5);
    s.ctx.stroke();
  }
  s.ctx.globalAlpha = 1;
  grain(s, seed + 1, 12);

  const height = heightCanvas(
    size,
    (h) => {
      const hr = rng(seed + 2);
      h.ctx.globalAlpha = 0.5;
      for (let i = 0; i < 6000; i++) {
        h.ctx.strokeStyle = hr() > 0.5 ? '#ffffff' : '#000000';
        h.ctx.lineWidth = 0.8;
        const x = hr() * size;
        const yy = hr() * size;
        h.ctx.beginPath();
        h.ctx.moveTo(x, yy);
        h.ctx.lineTo(x + (hr() - 0.5) * 3, yy + 3 + hr() * 6);
        h.ctx.stroke();
      }
      h.ctx.globalAlpha = 1;
    },
    seed + 3,
  );

  const rough = surface(size);
  flat(rough, '#b4b4b4');
  grain(rough, seed + 4, 26);

  const alpha = surface(size);
  const ar = rng(seed + 5);
  alpha.ctx.drawImage(s.canvas, 0, 0);
  alpha.ctx.globalAlpha = 0.9;
  for (let i = 0; i < 2400; i++) {
    alpha.ctx.fillStyle = ar() > 0.5 ? '#ffffff' : '#000000';
    alpha.ctx.fillRect(ar() * size, ar() * size, 1 + ar() * 2, 3 + ar() * 6);
  }
  alpha.ctx.globalAlpha = 1;

  return {
    map: colorTexture(s.canvas),
    normalMap: normalFromHeight(height, 1.3),
    roughnessMap: colorTexture(rough.canvas, false),
    alphaMap: colorTexture(alpha.canvas, false),
  };
}

// ---------------------------------------------------------------- 室外（狗版院子）

/**
 * 草地：底色 + 色斑 + 短笔触草叶。
 *
 * 为什么笔触要「短而斜」：草丛的视觉信息量来自**方向杂乱的亮暗短线**；
 * 用规则的竖线会立刻读成"人造草皮"，而纯噪点在中等视距下又会糊成一块绿。
 */
export function grassTextures(seed = 131, size = 512): SimpleMaps {
  const s = surface(size);
  flat(s, '#4f7a34');
  const rand = rng(seed);

  // 大块色斑：让 4 m 见方的草地不至于变成一个颜色
  for (let i = 0; i < 60; i++) {
    const r = 30 + rand() * 120;
    const g = s.ctx.createRadialGradient(rand() * size, rand() * size, 0, rand() * size, rand() * size, r);
    const light = rand() > 0.5;
    g.addColorStop(0, light ? 'rgba(126,166,74,0.35)' : 'rgba(58,88,40,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    s.ctx.fillStyle = g;
    s.ctx.fillRect(0, 0, size, size);
  }

  // 草叶：短斜线，亮暗各半
  for (let i = 0; i < 9000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 3 + rand() * 7;
    const ang = -Math.PI / 2 + (rand() - 0.5) * 1.5;
    s.ctx.globalAlpha = 0.1 + rand() * 0.3;
    s.ctx.strokeStyle = rand() > 0.45 ? '#8fb457' : '#2f5522';
    s.ctx.lineWidth = 0.7 + rand() * 1.1;
    s.ctx.beginPath();
    s.ctx.moveTo(x, y);
    s.ctx.lineTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len);
    s.ctx.stroke();
  }
  s.ctx.globalAlpha = 1;
  // 少量枯黄点：全绿的草地看起来是塑料
  for (let i = 0; i < 700; i++) {
    s.ctx.globalAlpha = 0.1 + rand() * 0.25;
    s.ctx.fillStyle = rand() > 0.5 ? '#b8a95c' : '#6f8a3c';
    s.ctx.beginPath();
    s.ctx.arc(rand() * size, rand() * size, 0.8 + rand() * 1.6, 0, Math.PI * 2);
    s.ctx.fill();
  }
  s.ctx.globalAlpha = 1;
  grain(s, seed + 1, 16);
  seamBlend(s, 0.12);

  const height = heightCanvas(size, (h) => h.ctx.drawImage(s.canvas, 0, 0), seed + 2);
  const rough = surface(size);
  flat(rough, '#e4e4e4');
  grain(rough, seed + 3, 30);

  return {
    map: colorTexture(s.canvas),
    roughnessMap: colorTexture(rough.canvas, false),
    normalMap: normalFromHeight(height, 1.0),
  };
}

/** 砾石：一堆椭圆石子。用于休闲区地坪与池边。 */
export function gravelTextures(seed = 141, size = 256): SimpleMaps {
  const s = surface(size);
  flat(s, '#8d8880');
  const rand = rng(seed);
  for (let i = 0; i < 3200; i++) {
    const rx = 2 + rand() * 5.5;
    const ry = rx * (0.6 + rand() * 0.5);
    const v = 0.55 + rand() * 0.45;
    const c = Math.round(120 * v);
    s.ctx.globalAlpha = 0.75 + rand() * 0.25;
    s.ctx.fillStyle = `rgb(${c + 18},${c + 14},${c + 8})`;
    s.ctx.beginPath();
    s.ctx.ellipse(rand() * size, rand() * size, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
    s.ctx.fill();
  }
  s.ctx.globalAlpha = 1;
  grain(s, seed + 1, 22);
  seamBlend(s, 0.18);

  const height = heightCanvas(size, (h) => h.ctx.drawImage(s.canvas, 0, 0), seed + 2);
  const rough = surface(size);
  flat(rough, '#dcdcdc');
  grain(rough, seed + 3, 34);
  return {
    map: colorTexture(s.canvas),
    roughnessMap: colorTexture(rough.canvas, false),
    normalMap: normalFromHeight(height, 1.5),
  };
}

/** 石板：灰蓝色板岩，带凿痕。用于石板路与池塘压顶。 */
export function pavingTextures(seed = 161, size = 256): SimpleMaps {
  const s = surface(size);
  flat(s, '#8b8b88');
  const rand = rng(seed);
  for (let i = 0; i < 900; i++) {
    s.ctx.globalAlpha = 0.05 + rand() * 0.18;
    s.ctx.fillStyle = rand() > 0.5 ? '#e7e7e2' : '#4e4e4c';
    s.ctx.beginPath();
    s.ctx.ellipse(rand() * size, rand() * size, 6 + rand() * 26, 5 + rand() * 20, rand() * Math.PI, 0, Math.PI * 2);
    s.ctx.fill();
  }
  // 凿痕：短而直的浅色划痕
  for (let i = 0; i < 500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI;
    const l = 4 + rand() * 14;
    s.ctx.globalAlpha = 0.08 + rand() * 0.14;
    s.ctx.strokeStyle = rand() > 0.5 ? '#d8d8d2' : '#3f3f3d';
    s.ctx.lineWidth = 0.8 + rand();
    s.ctx.beginPath();
    s.ctx.moveTo(x, y);
    s.ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    s.ctx.stroke();
  }
  s.ctx.globalAlpha = 1;
  grain(s, seed + 1, 20);
  seamBlend(s, 0.16);
  const height = heightCanvas(size, (h) => h.ctx.drawImage(s.canvas, 0, 0), seed + 2);
  const rough = surface(size);
  flat(rough, '#cfcfcf');
  grain(rough, seed + 3, 26);
  return {
    map: colorTexture(s.canvas),
    roughnessMap: colorTexture(rough.canvas, false),
    normalMap: normalFromHeight(height, 0.9),
  };
}

/** 树皮：竖向沟槽 + 横向裂纹。树干与枝条共用。 */
export function barkTextures(seed = 151, size = 256): SimpleMaps {
  const s = surface(size);
  flat(s, '#6a5340');
  const rand = rng(seed);
  // 竖向沟槽
  for (let i = 0; i < 320; i++) {
    const x = rand() * size;
    const w = 1 + rand() * 4;
    s.ctx.globalAlpha = 0.12 + rand() * 0.3;
    s.ctx.fillStyle = rand() > 0.5 ? '#3f3024' : '#8b7157';
    s.ctx.beginPath();
    s.ctx.moveTo(x, 0);
    for (let y = 0; y <= size; y += 16) {
      s.ctx.lineTo(x + Math.sin((y / size) * Math.PI * (2 + rand())) * 3, y);
    }
    for (let y = size; y >= 0; y -= 16) {
      s.ctx.lineTo(x + w + Math.sin((y / size) * Math.PI * (2 + rand())) * 3, y);
    }
    s.ctx.closePath();
    s.ctx.fill();
  }
  // 横向裂纹
  for (let i = 0; i < 90; i++) {
    const y = rand() * size;
    s.ctx.globalAlpha = 0.15 + rand() * 0.3;
    s.ctx.strokeStyle = '#2b2018';
    s.ctx.lineWidth = 0.7 + rand() * 1.6;
    s.ctx.beginPath();
    s.ctx.moveTo(rand() * size * 0.4, y);
    s.ctx.lineTo(size * (0.5 + rand() * 0.5), y + (rand() - 0.5) * 5);
    s.ctx.stroke();
  }
  s.ctx.globalAlpha = 1;
  grain(s, seed + 1, 20);
  seamBlend(s, 0.08);
  const height = heightCanvas(size, (h) => h.ctx.drawImage(s.canvas, 0, 0), seed + 2);
  return {
    map: colorTexture(s.canvas),
    normalMap: normalFromHeight(height, 2.0),
  };
}

/**
 * 树叶：成团的叶簇明暗。
 *
 * 树冠由若干团块组成（见 `build-yard.ts`），贴图只负责"一团叶子"的观感。
 * 刻意不做 alpha 镂空：树冠是实体团块，镂空会在低画质档下露馅。
 */
export function foliageTextures(color = '#3f6b34', seed = 181, size = 256): SimpleMaps {
  const s = surface(size);
  flat(s, color);
  const rand = rng(seed);
  for (let i = 0; i < 2600; i++) {
    // 叶簇：短椭圆，朝向杂乱
    const x = rand() * size;
    const y = rand() * size;
    const r = 2 + rand() * 6;
    s.ctx.globalAlpha = 0.12 + rand() * 0.34;
    s.ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000';
    s.ctx.beginPath();
    s.ctx.ellipse(x, y, r, r * (0.45 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
    s.ctx.fill();
  }
  s.ctx.globalAlpha = 1;
  grain(s, seed + 1, 22);
  seamBlend(s, 0.14);
  const height = heightCanvas(size, (h) => h.ctx.drawImage(s.canvas, 0, 0), seed + 2);
  return {
    map: colorTexture(s.canvas),
    normalMap: normalFromHeight(height, 1.3),
  };
}

/**
 * 木栅栏板条：竖向板 + 板缝。整段栅栏用一个盒体 + 这张贴图，
 * 既拿到"一条条竖板"的观感，又不必为每根板条付一次绘制调用。
 */
export function fenceSlatTextures(opt: { seed?: number; size?: number; slats?: number } = {}): SimpleMaps {
  const seed = opt.seed ?? 171;
  const size = opt.size ?? 256;
  const slats = opt.slats ?? 8;
  const s = surface(size);
  flat(s, '#a5805a');
  const rand = rng(seed);
  const w = size / slats;
  for (let i = 0; i < slats; i++) {
    const x0 = i * w;
    // 每块板轻微色差
    s.ctx.globalAlpha = 0.12 + rand() * 0.2;
    s.ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000';
    s.ctx.fillRect(x0, 0, w, size);
    s.ctx.globalAlpha = 1;
    // 木纹（竖向）
    for (let k = 0; k < 26; k++) {
      const gx = x0 + 1 + rand() * (w - 2);
      s.ctx.globalAlpha = 0.04 + rand() * 0.16;
      s.ctx.strokeStyle = rand() > 0.5 ? '#5f4227' : '#c9a67c';
      s.ctx.lineWidth = 0.5 + rand() * 1.2;
      s.ctx.beginPath();
      s.ctx.moveTo(gx, 0);
      for (let y = 0; y <= size; y += 24) s.ctx.lineTo(gx + (rand() - 0.5) * 2, y);
      s.ctx.stroke();
    }
    s.ctx.globalAlpha = 1;
    // 板缝
    s.ctx.fillStyle = '#3a2a1a';
    s.ctx.fillRect(x0, 0, Math.max(1, Math.round(w * 0.09)), size);
  }
  grain(s, seed + 1, 20);
  seamBlend(s, 0.06);

  const height = heightCanvas(
    size,
    (h) => {
      h.ctx.drawImage(s.canvas, 0, 0);
    },
    seed + 2,
  );
  return {
    map: colorTexture(s.canvas),
    normalMap: normalFromHeight(height, 1.4),
  };
}

// ---------------------------------------------------------------- 环境

/** 窗外天空：暖色地平线 + 冷色天顶。用于场景背景（只在窗口处可见）。 */
export function skyTexture(): THREE.CanvasTexture {
  const s = surface(512);
  const g = s.ctx.createLinearGradient(0, 0, 0, s.size);
  g.addColorStop(0, '#8fb8de');
  g.addColorStop(0.55, '#cfe0ee');
  g.addColorStop(0.78, '#f6dfc2');
  g.addColorStop(1, '#e9c79c');
  s.ctx.fillStyle = g;
  s.ctx.fillRect(0, 0, s.size, s.size);
  const rand = rng(101);
  for (let i = 0; i < 40; i++) {
    s.ctx.globalAlpha = 0.05 + rand() * 0.12;
    s.ctx.fillStyle = '#ffffff';
    const y = rand() * s.size * 0.6;
    s.ctx.beginPath();
    s.ctx.ellipse(rand() * s.size, y, 20 + rand() * 60, 6 + rand() * 14, 0, 0, Math.PI * 2);
    s.ctx.fill();
  }
  s.ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(s.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

/** 水面法线：供饮水机/水盆的轻微涟漪使用。 */
export function waterNormalTexture(seed = 121, size = 256): THREE.CanvasTexture {
  const s = surface(size);
  flat(s, '#808080');
  const rand = rng(seed);
  for (let i = 0; i < 220; i++) {
    const r = 6 + rand() * 26;
    const g = s.ctx.createRadialGradient(rand() * size, rand() * size, 0, rand() * size, rand() * size, r);
    g.addColorStop(0, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    s.ctx.fillStyle = g;
    s.ctx.fillRect(0, 0, size, size);
  }
  return normalFromHeight(s.canvas, 0.8);
}
