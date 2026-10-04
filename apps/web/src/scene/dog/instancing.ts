/**
 * 实例化摆放与确定性散布。
 *
 * 为什么需要它：院子里「成片重复」的东西特别多 —— 栅栏竖板（约 200 根）、草簇、
 * 花（茎 + 花冠）、池边卵石、树冠团块、灌木叶球。全部当独立网格的话，
 * 绘制调用会直接翻十倍，而它们共用同一份几何与材质 —— 正是 `InstancedMesh` 的用例。
 *
 * 纪律：**散布必须可复现**。所有随机都来自固定种子的 PRNG，因此同一版代码
 * 每次打开画出的草簇位置完全一致，截图回归与人工核对才有意义
 * （与 `../textures.ts` 的程序化贴图同一条理由）。
 */
import * as THREE from 'three';

export interface Placement {
  x: number;
  y: number;
  z: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  /** 单个数 = 等比缩放；三元组 = 各轴缩放 */
  scale?: number | [number, number, number];
  /** 逐实例染色（需要材质是白色或接近白色才能看出来） */
  color?: number;
}

/**
 * 把一组摆放烘进一个 `InstancedMesh`。
 *
 * 返回 `null` 表示没有实例 —— 调用方直接跳过即可，不必自己判空数组。
 * 实例化为空时 three 会警告，所以这里先拦掉。
 */
export function addInstanced(
  parent: THREE.Object3D,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  items: readonly Placement[],
  opts: { cast?: boolean; receive?: boolean } = {},
): THREE.InstancedMesh | null {
  if (items.length === 0) return null;

  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = name;
  mesh.castShadow = opts.cast ?? true;
  mesh.receiveShadow = opts.receive ?? true;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  let tinted = false;

  for (const [i, item] of items.entries()) {
    position.set(item.x, item.y, item.z);
    euler.set(item.rotX ?? 0, item.rotY ?? 0, item.rotZ ?? 0);
    quaternion.setFromEuler(euler);
    if (typeof item.scale === 'number') scale.setScalar(item.scale);
    else if (Array.isArray(item.scale)) scale.set(item.scale[0], item.scale[1], item.scale[2]);
    else scale.set(1, 1, 1);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
    if (item.color !== undefined) {
      color.setHex(item.color);
      mesh.setColorAt(i, color);
      tinted = true;
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (tinted && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}

/**
 * 确定性 PRNG（mulberry32）。
 *
 * 与 `@camp/core` 的 `makeShuffleRng` / `@camp/simulator` 的 `Rng` 是**第三处**
 * 独立实现，刻意为之：`apps/web` 不许在运行时导入另两个包的重实现细节
 * （web 只在浏览器里经 import map 解析，而这两个包在这里只需要几个数字）。
 * 它的能力边界也明确：只提供 0–1 均匀数与区间/整数取值，不做分布抽样。
 */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 区间取值。 */
export function between(rand: () => number, min: number, max: number): number {
  return min + rand() * (max - min);
}
