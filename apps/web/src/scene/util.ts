/** 建模小工具：统一阴影标记、落地对齐、可读的几何构造。 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export interface PlaceOptions {
  /** 是否投影（大件家具投影，贴地小件不投影以省开销） */
  cast?: boolean;
  receive?: boolean;
  /** 绕 Y 轴旋转（弧度） */
  rotY?: number;
  name?: string;
}

/** 位置按**中心点**给出；需要落地时用 `sitOnFloor()`。 */
export function addMesh<T extends THREE.Object3D>(parent: THREE.Object3D, obj: T, x: number, y: number, z: number, opts: PlaceOptions = {}): T {
  obj.position.set(x, y, z);
  if (opts.rotY) obj.rotation.y = opts.rotY;
  if (opts.name) obj.name = opts.name;
  obj.traverse((child) => {
    const m = child as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = opts.cast ?? true;
      m.receiveShadow = opts.receive ?? true;
    }
  });
  parent.add(obj);
  return obj;
}

/** 把物体的最低点对齐到 y = 0（地面），再放到 (x, z)。 */
export function sitOnFloor(obj: THREE.Object3D, x: number, z: number): void {
  obj.position.set(x, 0, z);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  if (Number.isFinite(box.min.y)) obj.position.y = -box.min.y;
}

export function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material | THREE.Material[],
): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

export function roundedBox(
  w: number,
  h: number,
  d: number,
  radius: number,
  material: THREE.Material | THREE.Material[],
): THREE.Mesh {
  const r = Math.min(radius, w / 2.05, h / 2.05, d / 2.05);
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), material);
}

export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  h: number,
  material: THREE.Material,
  segments = 24,
): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, h, segments), material);
}

export function group(name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

/** 让贴图按世界尺寸重复：同一张贴图在不同尺寸的面上不会被拉伸。 */
export function repeatFor(texture: THREE.Texture, worldWidth: number, worldDepth: number, tileM: number): THREE.Texture {
  const t = texture.clone();
  t.needsUpdate = true;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(1, worldWidth / tileM), Math.max(1, worldDepth / tileM));
  return t;
}

/** 把 (x, z) 平面上的朝向转为绕 Y 轴的弧度。 */
export function facing(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/**
 * 把扫描模型缩放到目标尺寸、贴地、并居中到指定位置（对未知原始尺度鲁棒）。
 *
 * 为什么靠「水平最大边」定尺度而不是高度：CC0 扫描模型的原始单位五花八门，
 * 但一个物件的**水平占地**最能反映它该有多大（桌子、边柜都适用），
 * 而高度常被扫描时的杂物撑大。
 *
 * 从 `scene.ts` 提出来共用：狗版场景也要把同一批 CC0 模型放进自己的坐标里，
 * 两份实现迟早会漂移（第二份漏掉贴地就会浮空）。
 */
export function fitModel(
  obj: THREE.Object3D,
  fitTo: number,
  rotY: number,
  x: number,
  y: number,
  z: number,
): void {
  obj.rotation.set(0, rotY, 0);
  obj.scale.setScalar(1);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const maxHoriz = Math.max(size.x, size.z);
  if (maxHoriz > 0 && Number.isFinite(maxHoriz)) {
    obj.scale.setScalar(fitTo / maxHoriz);
  }
  obj.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(obj);
  const center = box2.getCenter(new THREE.Vector3());
  obj.position.set(x - center.x, y - box2.min.y, z - center.z);
  obj.name = `model-${obj.name || 'asset'}`;
}
