#!/usr/bin/env node
/**
 * 把上游 Cat.fbx 转成运行时用的 cat.glb。
 *
 * ⚠️ 状态：wip（粗糙版，**尚未接入场景**）。全仓没有代码引用本脚本的产物，
 *    质量、许可与启用前提见 `docs/design/04-cat-asset-wip.md`。在此之前不要启用。
 *
 * 为什么要有这一步：
 *   上游（Quaternius Animal Pack Vol.2，标注 CC0；本仓库尚未核实并归档归属）
 *   只提供 FBX / Blend / OBJ，没有 glTF。
 *   FBX 在浏览器里要靠 `FBXLoader` + fflate 才能解析（几十 KB 的额外运行时），
 *   而 three 自带 `GLTFExporter`，于是**在构建期转一次**，运行时只留 `GLTFLoader`。
 *
 * 归一化约定（转换后 baked 进 GLB，运行时不需要再猜）：
 *   · 单位米、Y 轴向上；
 *   · **朝向 +Z**（与 `scene/cat/cat-model.ts` 的建模约定一致：rotY = 0 即面朝入户方向）；
 *   · 爪垫落在 y = 0，水平方向以包围盒中心为原点，便于直接 `position.set()` 落位。
 *
 * 用法：node scripts/build-cat-asset.mjs
 * 退出码：0 = 已生成；1 = 缺输入或转换失败
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// three 的 addons 在少数分支上假定自己跑在浏览器里（GLTFExporter 用 FileReader 收尾）。
// 这里补最小垫片，只为让**构建期**的导出跑通，不进运行时。
globalThis.self = globalThis;
if (!globalThis.window) globalThis.window = globalThis;
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReaderShim {
    constructor() {
      this.result = null;
      this.onloadend = null;
      this.onerror = null;
    }
    #settle(promise) {
      promise
        .then((result) => {
          this.result = result;
          if (this.onloadend) this.onloadend();
        })
        .catch((err) => {
          if (this.onerror) this.onerror(err);
        });
    }
    readAsArrayBuffer(blob) {
      this.#settle(blob.arrayBuffer());
    }
    readAsDataURL(blob) {
      this.#settle(
        blob
          .arrayBuffer()
          .then(
            (buf) =>
              `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`,
          ),
      );
    }
  };
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE_DIR = path.join(ROOT, 'apps', 'web', 'node_modules', 'three');
const SRC = path.join(ROOT, '.tools', 'cat-asset', 'Cat.fbx');
const OUT = path.join(ROOT, 'apps', 'web', 'public', 'assets', 'models', 'cat', 'cat.glb');

/** 目标整体高度（米）——含上竖的尾巴，按家猫量级取值。 */
const TARGET_HEIGHT_M = 0.6;

/**
 * 材质上色。上游 FBX 的三个材质槽是 `Grey` / `White` / `Pink`，但导出时颜色都塌成了同一个灰，
 * 所以按**材质名**重新分配颜色——这正是橘猫该有的三处分区（躯干 / 爪垫胸腹 / 耳内鼻头）。
 */
const MAT_COLORS = {
  Grey: 0xb9a893,
  White: 0xf2efe9,
  Pink: 0xd98f8e,
};
const FALLBACK_COLOR = 0xb9a893;

if (!fs.existsSync(SRC)) {
  console.error(`✗ 缺少输入：${path.relative(ROOT, SRC)}`);
  console.error('  需手动放置上游 FBX：Quaternius · Animal Pack Vol.2 的 Cat.fbx。');
  console.error('  `scripts/fetch-assets.mjs` 目前**不**抓取该文件，干净 clone 上无法自行复现。');
  process.exit(1);
}

const THREE = await import(pathToFileURL(path.join(THREE_DIR, 'build', 'three.module.js')).href);
const { FBXLoader } = await import(
  pathToFileURL(path.join(THREE_DIR, 'examples', 'jsm', 'loaders', 'FBXLoader.js')).href
);
const { GLTFExporter } = await import(
  pathToFileURL(path.join(THREE_DIR, 'examples', 'jsm', 'exporters', 'GLTFExporter.js')).href
);

const buf = fs.readFileSync(SRC);
const root = new FBXLoader().parse(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  path.dirname(SRC) + '/',
);

// ---- 材质：Phong → Standard，并按名字上色（GLTFExporter 只认 Standard / Basic）
const seen = new Set();
root.traverse((o) => {
  if (!o.isMesh) return;
  const list = Array.isArray(o.material) ? o.material : [o.material];
  const next = list.map((m) => {
    if (!m) return m;
    const std = new THREE.MeshStandardMaterial({
      name: m.name,
      color: new THREE.Color(MAT_COLORS[m.name] ?? FALLBACK_COLOR),
      roughness: 0.82,
      metalness: 0,
      side: THREE.FrontSide,
    });
    if (!seen.has(m.name)) seen.add(m.name);
    return std;
  });
  o.material = Array.isArray(o.material) ? next : next[0];
  o.castShadow = true;
  o.receiveShadow = true;
});

// ---- 转姿态 + 缩放到米制，并把爪垫落到 y = 0
const rawBox = new THREE.Box3().setFromObject(root);
const rawSize = new THREE.Vector3();
rawBox.getSize(rawSize);
const scale = TARGET_HEIGHT_M / rawSize.y;

root.rotation.y = -Math.PI / 2; // FBX 里面朝 +X → 转成面朝 +Z
root.scale.setScalar(scale);
root.updateMatrixWorld(true);

const box = new THREE.Box3().setFromObject(root);
root.position.x -= (box.min.x + box.max.x) / 2;
root.position.z -= (box.min.z + box.max.z) / 2;
root.position.y -= box.min.y;
root.updateMatrixWorld(true);

const finalBox = new THREE.Box3().setFromObject(root);
const finalSize = new THREE.Vector3();
finalBox.getSize(finalSize);

let bones = 0;
let skinned = 0;
let tris = 0;
let meshes = 0;
root.traverse((o) => {
  if (o.isBone) bones++;
  if (o.isSkinnedMesh) skinned++;
  if (o.isMesh) {
    meshes++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  }
});

const clips = root.animations ?? [];

console.log('→ 猫资产转换');
console.log(`  材质       ${[...seen].join(', ') || '(无)'}`);
console.log(`  网格       ${meshes} 个，${Math.round(tris)} 三角面`);
console.log(`  蒙皮       ${skinned} 个 SkinnedMesh，${bones} 根骨骼`);
console.log(
  `  动画       ${clips.map((c) => `${c.name} ${c.duration.toFixed(2)}s`).join(' · ') || '(无)'}`,
);
console.log(`  原始尺寸   ${rawSize.toArray().map((v) => v.toFixed(1)).join(' × ')}（上游单位）`);
console.log(`  缩放       ×${scale.toExponential(3)}`);
console.log(`  成品尺寸   ${finalSize.toArray().map((v) => v.toFixed(3)).join(' × ')} m`);
console.log(
  `  成品包围盒 min ${finalBox.min.toArray().map((v) => v.toFixed(3)).join(',')}` +
    `  max ${finalBox.max.toArray().map((v) => v.toFixed(3)).join(',')}`,
);

const glb = await new Promise((resolve, reject) => {
  new GLTFExporter().parse(root, resolve, reject, {
    binary: true,
    animations: clips,
    onlyVisible: false,
  });
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(glb));
console.log(`✓ 已写出 ${path.relative(ROOT, OUT)}（${(glb.byteLength / 1024).toFixed(1)} KB）`);
