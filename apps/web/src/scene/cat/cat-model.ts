/**
 * 橘猫的程序化建模。
 *
 * 为什么程序化而不是用扫描模型：
 *   Poly Haven 的 521 个 CC0 模型里**没有活体猫**（只有混凝土猫雕塑）；能拿到的写实猫模型
 *   来源与授权都不可核实。程序化重建保证：许可干净、可确定性构建、姿态完全可控。
 *   代价是「写实比例与毛色，但不是照片级扫描」——这一点在设计文档里如实写明，
 *   并保留替换缝：`buildCat()` 返回统一的 `CatRig`，将来换成有授权的 GLTF 猫时
 *   只需换掉本文件的几何装配，控制器不用改。
 *
 * 建模约定：猫的**朝向为 +Z**（头在 +Z、尾在 -Z），因此 `rotY = 0` 表示面朝入户方向。
 */
import * as THREE from 'three';
import type { MaterialLibrary } from '../materials.ts';
import { catFurTextures } from '../textures.ts';
import { group } from '../util.ts';

export interface CatRig {
  root: THREE.Group;
  /** 躯干容器：承载 bodyLift / 拱背 / 换重心 */
  body: THREE.Group;
  torso: THREE.Mesh;
  chest: THREE.Mesh;
  hips: THREE.Mesh;
  head: THREE.Group;
  earL: THREE.Group;
  earR: THREE.Group;
  pupilL: THREE.Mesh;
  pupilR: THREE.Mesh;
  eyeL: THREE.Mesh;
  eyeR: THREE.Mesh;
  nose: THREE.Mesh;
  /** 尾巴 6 段，从尾根到尾尖 */
  tail: THREE.Group[];
  /** 四条腿：前左、前右、后左、后右 */
  legs: THREE.Group[];
  /** 呼吸用的可缩放网格（躯干 + 胸 + 臀） */
  breathParts: THREE.Object3D[];
  /** 毛壳层，便于画质切换时整体显隐 */
  furShells: THREE.Object3D[];
}

const FUR = 0xf0a860;

export function buildCat(_mats: MaterialLibrary, furLayers: number): CatRig {
  const fur = catFurTextures();
  const furMat = new THREE.MeshStandardMaterial({
    map: fur.map,
    normalMap: fur.normalMap,
    roughnessMap: fur.roughnessMap,
    roughness: 0.85,
    metalness: 0,
    color: FUR,
  });
  const shellMat = new THREE.MeshStandardMaterial({
    map: fur.map,
    alphaMap: fur.alphaMap,
    roughness: 0.9,
    metalness: 0,
    color: FUR,
    transparent: false,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.6 });
  const pinkMat = new THREE.MeshStandardMaterial({ color: 0xd98f7e, roughness: 0.75 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x9fbf4a, roughness: 0.25, metalness: 0.05 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x120e0a, roughness: 0.2 });

  const root = group('cat');
  const body = group('cat-body');
  root.add(body);

  const furShells: THREE.Object3D[] = [];
  const addFur = (parent: THREE.Object3D, geo: THREE.BufferGeometry, x: number, y: number, z: number, scale?: [number, number, number]): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, furMat);
    mesh.position.set(x, y, z);
    if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    // 毛壳：同一几何逐层放大 + alphaTest 切边，柔化轮廓（低画质档时整组隐藏）
    for (let i = 1; i <= furLayers; i++) {
      const shell = new THREE.Mesh(geo, shellMat);
      const k = 1 + i * 0.016;
      shell.position.set(x, y, z);
      shell.scale.set(
        (scale?.[0] ?? 1) * k,
        (scale?.[1] ?? 1) * k,
        (scale?.[2] ?? 1) * k,
      );
      shell.castShadow = false;
      shell.receiveShadow = false;
      // 记下所处层号：切换画质时按层号显隐，不需要重建模型
      shell.userData.furLayer = i;
      parent.add(shell);
      furShells.push(shell);
    }
    return mesh;
  };

  // ---------------------------------------------------------------- 躯干
  const torsoGeo = new THREE.SphereGeometry(1, 24, 18);
  const torso = addFur(body, torsoGeo, 0, 0, 0, [0.105, 0.115, 0.235]);
  const chest = addFur(body, torsoGeo, 0, -0.012, 0.17, [0.095, 0.1, 0.13]);
  const hips = addFur(body, torsoGeo, 0, 0.005, -0.17, [0.1, 0.11, 0.14]);
  torso.name = 'cat-torso';
  chest.name = 'cat-chest';
  hips.name = 'cat-hips';

  // ---------------------------------------------------------------- 头部
  const head = group('cat-head');
  head.position.set(0, 0.05, 0.285);
  body.add(head);
  // 脖子：没有它，头会直接长在躯干上，读起来像「香肠」
  addFur(body, torsoGeo, 0, 0.03, 0.245, [0.062, 0.07, 0.075]);
  addFur(head, torsoGeo, 0, 0, 0, [0.082, 0.076, 0.082]);
  const muzzle = addFur(head, torsoGeo, 0, -0.024, 0.058, [0.046, 0.034, 0.042]);
  muzzle.name = 'cat-muzzle';

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), darkMat);
  nose.position.set(0, -0.017, 0.098);
  nose.name = 'cat-nose';
  head.add(nose);
  // 嘴：两瓣，头部细节在近距离才看得出来
  for (const sx of [1, -1]) {
    const lip = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), pinkMat);
    lip.position.set(sx * 0.014, -0.036, 0.09);
    lip.scale.set(1, 0.6, 0.7);
    head.add(lip);
  }

  // 眼睛：眼球 + 可缩放瞳孔
  const makeEye = (sx: number): { eye: THREE.Mesh; pupil: THREE.Mesh } => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.021, 18, 14), irisMat);
    eye.position.set(sx * 0.044, 0.014, 0.062);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 12), pupilMat);
    pupil.position.set(sx * 0.047, 0.014, 0.078);
    pupil.scale.set(0.5, 1, 0.4);
    head.add(pupil);
    return { eye, pupil };
  };
  const left = makeEye(1);
  const right = makeEye(-1);

  // 耳朵：外耳 + 内耳；位置在头顶偏前，压平后才会「贴头」
  const earGeo = new THREE.ConeGeometry(0.048, 0.078, 10);
  const makeEar = (sx: number): THREE.Group => {
    const g = group(sx > 0 ? 'cat-ear-r' : 'cat-ear-l');
    g.position.set(sx * 0.052, 0.058, -0.008);
    g.rotation.z = sx * -0.22;
    const outer = new THREE.Mesh(earGeo, furMat);
    outer.castShadow = true;
    g.add(outer);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.056, 10), pinkMat);
    inner.position.set(0, -0.004, 0.014);
    g.add(inner);
    head.add(g);
    return g;
  };
  const earR = makeEar(1);
  const earL = makeEar(-1);

  // 胡须：细圆柱，成本极低但明显提升「像猫」的程度
  const whiskerMat = new THREE.MeshStandardMaterial({ color: 0xf6efe4, roughness: 0.6 });
  for (const sx of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.001, 0.14, 4), whiskerMat);
      w.position.set(sx * 0.052, -0.024 - i * 0.009, 0.082);
      w.rotation.z = sx * (Math.PI / 2 - 0.42 - i * 0.16);
      w.rotation.y = sx * 0.45;
      head.add(w);
    }
  }

  // ---------------------------------------------------------------- 四肢
  const legs: THREE.Group[] = [];
  const legGeo = new THREE.CapsuleGeometry(0.03, 0.085, 6, 12);
  const pawGeo = new THREE.SphereGeometry(0.037, 14, 10);
  for (const [i, spec] of (
    [
      { x: 0.082, z: 0.155, name: 'front-right' },
      { x: -0.082, z: 0.155, name: 'front-left' },
      { x: 0.082, z: -0.155, name: 'hind-right' },
      { x: -0.082, z: -0.155, name: 'hind-left' },
    ] as const
  ).entries()) {
    const g = group(`cat-leg-${spec.name}`);
    g.position.set(spec.x, -0.05, spec.z);
    const upper = new THREE.Mesh(legGeo, furMat);
    upper.position.y = -0.05;
    upper.castShadow = true;
    g.add(upper);
    const paw = new THREE.Mesh(pawGeo, furMat);
    paw.position.set(0, -0.105, 0.01);
    paw.scale.set(1, 0.72, 1.3);
    paw.castShadow = true;
    g.add(paw);
    body.add(g);
    legs[i] = g;
  }

  // ---------------------------------------------------------------- 尾巴
  const tail: THREE.Group[] = [];
  const segGeo = new THREE.CapsuleGeometry(0.026, 0.055, 6, 12);
  let parent: THREE.Object3D = body;
  for (let i = 0; i < 6; i++) {
    const seg = group(`cat-tail-${i}`);
    seg.position.set(0, 0.02, i === 0 ? -0.29 : -0.085);
    const mesh = new THREE.Mesh(segGeo, furMat);
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    seg.add(mesh);
    if (i > 3) {
      for (let k = 1; k <= Math.min(furLayers, 3); k++) {
        const shell = new THREE.Mesh(segGeo, shellMat);
        shell.rotation.x = Math.PI / 2;
        const kk = 1 + k * 0.02;
        shell.scale.set(kk, kk, kk);
        shell.userData.furLayer = k;
        seg.add(shell);
        furShells.push(shell);
      }
    }
    parent.add(seg);
    tail.push(seg);
    parent = seg;
  }
  // 尾尖收细
  const tip = tail[5];
  if (tip) tip.scale.set(0.8, 0.8, 0.8);

  return {
    root,
    body,
    torso,
    chest,
    hips,
    head,
    earL,
    earR,
    pupilL: left.pupil,
    pupilR: right.pupil,
    eyeL: left.eye,
    eyeR: right.eye,
    nose,
    tail,
    legs,
    breathParts: [torso, chest, hips],
    furShells,
  };
}
