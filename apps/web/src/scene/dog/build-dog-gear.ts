/**
 * 狗的生活用品：食盆与水盆（室内 + 院内各一处）、两处柔软垫子、玩具篮、牵引绳挂钩。
 *
 * 全部程序化，且位置严格取自 `layout-dog.ts`。两条摆放纪律写在这里而不是文档里，
 * 因为改坐标的人往往就是看这个文件的人：
 *
 *   1. **不在人流通道上**。`TRAFFIC_PATH` 是「入户门 → 厨房 → 起居 → 推拉门 → 木平台」的主线，
 *      食盆、水盆、垫子、玩具篮都刻意避开了它 —— 这条由
 *      `scripts/check-layout-dog.mjs` 机械断言，不靠手感。
 *   2. **在视线可达处**。全部避开沙发背后、柜体侧缝与门后这些看不到的角落：
 *      摆在那里等于没摆。
 *
 * 关于「食盆要垫高」：这里只声称两件事 —— 碗不会在地板上滑动、扫地时能整块端走。
 * 抬高进食对健康的影响在文献里是有争议的（甚至方向相反），因此**不作任何健康表述**，
 * 见 `docs/design/02-evidence-policy.md`。
 */
import * as THREE from 'three';
import {
  DOG_BED_MAIN,
  DOG_BED_SLEEP,
  FOOD_STATION,
  LEASH_HOOK,
  OUTDOOR_WATER,
  TOY_BASKET,
} from './layout-dog.ts';
import type { MaterialLibrary } from '../materials.ts';
import { addMesh, box, group, roundedBox } from '../util.ts';

export interface DogGearResult {
  /** 狗的用品高亮环：默认隐藏，由 HUD 的图层开关控制 */
  resourceRings: THREE.Group;
}

/** 需要高亮的用品点（HUD 的「高亮狗的用品」开关指向它们）。 */
const HIGHLIGHT_POINTS: ReadonlyArray<{ id: string; x: number; z: number; y: number; r: number }> = [
  { id: 'food-station', x: FOOD_STATION.x, z: FOOD_STATION.z, y: 0.02, r: 0.34 },
  { id: 'outdoor-water', x: OUTDOOR_WATER.x, z: OUTDOOR_WATER.z, y: 0.02, r: 0.26 },
  { id: 'dog-bed-main', x: DOG_BED_MAIN.x, z: DOG_BED_MAIN.z, y: 0.02, r: 0.46 },
  { id: 'dog-bed-sleep', x: DOG_BED_SLEEP.x, z: DOG_BED_SLEEP.z, y: 0.02, r: 0.42 },
  { id: 'toy-basket', x: TOY_BASKET.x, z: TOY_BASKET.z, y: 0.02, r: 0.27 },
  { id: 'leash-hook', x: LEASH_HOOK.x, z: LEASH_HOOK.z - 0.16, y: 0.02, r: 0.24 },
];

export function buildDogGear(root: THREE.Group, mats: MaterialLibrary): DogGearResult {
  const g = group('dog-gear');
  root.add(g);
  buildFoodStation(g, mats);
  buildOutdoorWater(g, mats);
  buildDogBed(g, mats, 'dog-bed-main', DOG_BED_MAIN.x, DOG_BED_MAIN.z, DOG_BED_MAIN.w, DOG_BED_MAIN.d, 0);
  // 卧室那张转 90°：长边顺着床走，否则它会横在床边、把床头过道堵掉
  buildDogBed(g, mats, 'dog-bed-sleep', DOG_BED_SLEEP.x, DOG_BED_SLEEP.z, DOG_BED_SLEEP.w, DOG_BED_SLEEP.d, Math.PI / 2);
  buildToyBasket(g, mats);
  buildLeashHook(g, mats);
  return { resourceRings: buildResourceRings(g) };
}

/**
 * 用品高亮：地面光环。
 *
 * 与猫版同一条理由：材质是共享的（陶瓷同时用于水碗与台灯），给材质加自发光会连带
 * 点亮无关物件；光环是独立几何，开关干净、指向明确。
 */
function buildResourceRings(parent: THREE.Group): THREE.Group {
  const rings = group('dog-resource-rings');
  rings.visible = false;
  parent.add(rings);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffb15c,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (const point of HIGHLIGHT_POINTS) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(point.r * 0.84, point.r, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(point.x, point.y, point.z);
    ring.name = `ring-${point.id}`;
    ring.userData.resourceHighlight = true;
    rings.add(ring);
  }
  return rings;
}

// ---------------------------------------------------------------- 食盆与水盆

/**
 * 室内进食点：防滑垫 + 木质托架 + 两只不锈钢碗（一只干粮、一只水）。
 *
 * 托架做成「两端立板 + 一块开孔台面」而不是把碗直接放地上：碗沿抬到 0.16 m，
 * 扫地机器人能过、拖地时能整块端走 —— 这是它的全部目的。
 */
function buildFoodStation(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('food-station');
  g.position.set(FOOD_STATION.x, 0, FOOD_STATION.z);
  parent.add(g);

  const matMat = mats.plain('mat');
  const wood = mats.plain('woodLight');
  const steel = mats.plain('metal');
  const kibble = mats.plain('cardboard');
  const water = mats.plain('water');

  addMesh(g, roundedBox(FOOD_STATION.matW, 0.012, FOOD_STATION.matD, 0.008, matMat), 0, 0.006, 0, {
    name: 'food-mat',
    receive: true,
  });

  const standTopY = 0.16;
  const halfZ = 0.14;
  // 两端立板 + 台面
  for (const sx of [-1, 1]) {
    addMesh(g, roundedBox(0.03, standTopY, halfZ * 2, 0.008, wood), sx * 0.27, standTopY / 2, 0, {
      name: 'food-stand-leg',
    });
  }
  addMesh(g, roundedBox(0.58, 0.03, halfZ * 2 + 0.06, 0.01, wood), 0, standTopY - 0.015, 0, {
    name: 'food-stand-top',
  });

  for (const [i, dx] of [-0.14, 0.14].entries()) {
    // 碗体：上宽下窄的不锈钢盆，碗口正好落在台面开孔处
    addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.075, 0.07, 24), steel), dx, standTopY + 0.02, 0, {
      name: `food-bowl-${i}`,
    });
    // 碗内表面用一只略小的浅碟表示，避免看到空心圆柱的内壁
    addMesh(g, new THREE.Mesh(new THREE.CircleGeometry(0.098, 24), i === 0 ? kibble : water), dx, standTopY + 0.044, 0, {
      name: i === 0 ? 'food-kibble' : 'water-bowl-surface',
      cast: false,
    });
  }
}

/** 院里的水盆：厚壁陶盆，放在木平台东端（出门就能喝，且不挡在门口正中）。 */
function buildOutdoorWater(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('outdoor-water');
  g.position.set(OUTDOOR_WATER.x, 0, OUTDOOR_WATER.z);
  parent.add(g);
  const ceramic = mats.plain('ceramicBlue');
  const water = mats.plain('water');
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.11, 26), ceramic), 0, 0.055, 0, {
    name: 'outdoor-water-bowl',
  });
  const surface = new THREE.Mesh(new THREE.CircleGeometry(0.17, 26), water);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.1;
  surface.name = 'outdoor-water-surface';
  g.add(surface);
}

// ---------------------------------------------------------------- 软垫

/**
 * 柔软垫子：椭圆底座 + 环形围边 + 可洗内垫。
 *
 * 为什么是**围边**（一圈圆环）而不是一块平垫：平垫在画面上与地毯无法区分，
 * 而「这是狗睡觉的地方」这条信息恰恰靠那一圈鼓起来的边来传达。
 */
function buildDogBed(
  parent: THREE.Group,
  mats: MaterialLibrary,
  id: string,
  x: number,
  z: number,
  w: number,
  d: number,
  rotY: number,
): void {
  const g = group(id);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  parent.add(g);

  const fleece = mats.plain('catCarpet');
  const inner = mats.plain('bedding');
  const rx = w / 2;
  const rz = d / 2;

  // 底座（椭圆，靠缩放圆柱得到）
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 36), fleece);
  base.scale.set(rx, 1, rz);
  base.position.y = 0.05;
  base.name = `${id}-base`;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  // 围边：圆环压扁成椭圆，坐在底座边缘上
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 10, 36), fleece);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(rx * 0.86, rz * 0.86, 1);
  rim.position.y = 0.13;
  rim.name = `${id}-rim`;
  rim.castShadow = true;
  rim.receiveShadow = true;
  g.add(rim);

  // 可洗内垫
  const cushion = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.05, 32), inner);
  cushion.scale.set(rx * 0.8, 1, rz * 0.8);
  cushion.position.y = 0.12;
  cushion.name = `${id}-cushion`;
  cushion.castShadow = true;
  g.add(cushion);
}

// ---------------------------------------------------------------- 玩具与挂钩

/** 玩具篮：藤编篮 + 绳结 + 一只球。绳结用剑麻材质，与猫爬架立柱同一套语言。 */
function buildToyBasket(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('toy-basket');
  g.position.set(TOY_BASKET.x, 0, TOY_BASKET.z);
  parent.add(g);
  const weave = mats.plain('sisal');
  const rope = mats.plain('sisal');
  const ball = mats.plain('bookA');
  const r = TOY_BASKET.r;

  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.82, 0.24, 24, 1, true), weave), 0, 0.12, 0, {
    name: 'toy-basket-wall',
    receive: false,
  });
  addMesh(g, new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 24), mats.plain('woodDark')), 0, 0.01, 0, {
    name: 'toy-basket-bottom',
  });
  // 篮口一圈卷边（圆环要转成水平，否则会竖着立在篮子上）
  const rolledRim = addMesh(
    g,
    new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 8, 26), weave),
    0,
    0.24,
    0,
    { name: 'toy-basket-rim' },
  );
  rolledRim.rotation.x = Math.PI / 2;

  // 露出一截绳结与一只球：空篮子看起来像没用过
  const knot = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 8, 18), rope);
  knot.position.set(-0.05, 0.26, 0.03);
  knot.rotation.set(0.6, 0.4, 0);
  knot.name = 'toy-rope-knot';
  knot.castShadow = true;
  g.add(knot);
  addMesh(g, new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), ball), 0.08, 0.25, -0.04, { name: 'toy-ball' });
}

/**
 * 牵引绳与项圈挂钩：入户门东侧的南墙上。
 *
 * 为什么挂在这里：出门前拿绳、进门后挂回，是**唯一**一个把「狗的用品」与
 * 人的动线绑在一起的位置 —— 挂在别处的挂钩在画面上读不出用途。
 */
function buildLeashHook(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('leash-hook');
  parent.add(g);
  const metal = mats.plain('metalDark');
  const leather = mats.plain('bookB');
  const collarMat = mats.plain('cushion');
  const z = LEASH_HOOK.z;
  const y = LEASH_HOOK.y;

  // 挂杆（沿 X 的一根短横杆）+ 两个把杆撑离墙面的支座
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 14), metal);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(LEASH_HOOK.x, y, z);
  rail.name = 'leash-hook-rail';
  rail.castShadow = true;
  g.add(rail);
  for (const dx of [-0.15, 0.15]) {
    // 支座在挂杆**靠墙的一侧**（南墙朝屋内是 -Z，所以墙面在 +Z 方向）
    const bracket = addMesh(
      g,
      new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 12), metal),
      LEASH_HOOK.x + dx,
      y,
      z + 0.035,
      { name: 'leash-hook-bracket' },
    );
    bracket.rotation.x = Math.PI / 2;
  }

  // 牵引绳：一条垂下来的带子，末端挂一个环（用几段串联的扁盒表示，不必做布料模拟）
  const strapX = LEASH_HOOK.x + 0.1;
  for (let i = 0; i < 5; i++) {
    const seg = box(0.026, 0.12, 0.012, leather);
    seg.position.set(strapX + Math.sin(i * 0.9) * 0.012, y - 0.09 - i * 0.115, z + 0.02 + Math.cos(i * 0.7) * 0.008);
    seg.rotation.z = Math.sin(i * 0.8) * 0.08;
    seg.name = `leash-strap-${i}`;
    seg.castShadow = true;
    g.add(seg);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 20), metal);
  ring.position.set(strapX, y - 0.68, z + 0.02);
  ring.name = 'leash-d-ring';
  g.add(ring);

  // 项圈：挂在横杆另一端，微微斜着（挂上去的样子）
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.018, 10, 28), collarMat);
  collar.position.set(LEASH_HOOK.x - 0.09, y - 0.13, z + 0.02);
  collar.rotation.set(Math.PI / 2 - 0.35, 0, 0.2);
  collar.name = 'collar';
  collar.castShadow = true;
  g.add(collar);
  // 项圈上的铭牌
  const tag = addMesh(
    g,
    new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 16), mats.plain('metal')),
    LEASH_HOOK.x - 0.09,
    y - 0.29,
    z + 0.05,
    { name: 'collar-tag' },
  );
  tag.rotation.x = Math.PI / 2;
}
