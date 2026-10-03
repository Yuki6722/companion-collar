/**
 * 猫的生活用品：猫爬架、壁挂跳台、猫砂盆 ×2、饮水机、第二水碗、食盆、封闭式猫窝、纸箱、抓板、玩具。
 *
 * 全部程序化，且位置严格取自 `layout.ts` —— 因为「资源是否相互分离」是清单的核心判据，
 * 建模时随手挪一下就会让清单和画面对不上。
 */
import * as THREE from 'three';
import {
  CAT_BED,
  CAT_SHELVES,
  CAT_TREE,
  FLOOR_SCRATCHER,
  FOOD_STATION,
  FOUNTAIN,
  HIDING_BOX,
  HOME_RESOURCES,
  LITTER_BOXES,
  TOYS,
  WALL_SCRATCHER,
  WATER_BOWL,
} from './layout.ts';
import type { MaterialLibrary } from './materials.ts';
import { addMesh, box, group, roundedBox } from './util.ts';

export interface CatGearResult {
  /** 猫资源高亮环：默认隐藏，由 HUD 的图层开关控制 */
  resourceRings: THREE.Group;
}

export function buildCatGear(root: THREE.Group, mats: MaterialLibrary): CatGearResult {
  const g = group('cat-gear');
  root.add(g);
  buildCatTree(g, mats);
  for (const [i, shelf] of CAT_SHELVES.entries()) buildCatShelf(g, mats, i, shelf.z, shelf.y);
  for (const box2 of LITTER_BOXES) buildLitterBox(g, mats, box2.id, box2.x, box2.z, box2.rotY);
  buildFountain(g, mats);
  buildWaterBowl(g, mats);
  buildFoodStation(g, mats);
  buildCatBed(g, mats);
  buildHidingBox(g, mats);
  buildWallScratcher(g, mats);
  buildFloorScratcher(g, mats);
  buildToys(g, mats);
  return { resourceRings: buildResourceRings(g) };
}

/**
 * 资源高亮：在每个关键资源位置放一个地面光环。
 *
 * 为什么不用「给材质加自发光」：材质是共享的（陶瓷同时用于水碗与床头灯），
 * 加自发光会连带点亮无关物件。光环是独立几何，开关干净、指向明确。
 */
function buildResourceRings(parent: THREE.Group): THREE.Group {
  const rings = group('resource-rings');
  rings.visible = false;
  parent.add(rings);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffb15c,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (const item of HOME_RESOURCES) {
    const radius = item.kind === 'vertical' || item.kind === 'sleep' ? 0.32 : 0.27;
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.78, radius, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(item.position.x, (item.heightM ?? 0) + 0.02, item.position.z);
    ring.userData.resourceHighlight = true;
    rings.add(ring);
  }
  return rings;
}

function buildCatTree(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('cat-tree');
  parent.add(g);
  const sisal = mats.plain('sisal');
  const carpet = mats.plain('catCarpet');
  const wood = mats.plain('woodLight');
  const { x, z, baseW, baseD, height, topPerchH } = CAT_TREE;

  // 底座
  addMesh(g, roundedBox(baseW, 0.07, baseD, 0.02, carpet), x, 0.035, z, { name: 'tree-base' });

  // 三根剑麻立柱
  const posts: ReadonlyArray<{ dx: number; dz: number; top: number }> = [
    { dx: -0.3, dz: -0.3, top: 0.72 },
    { dx: 0.3, dz: -0.3, top: 1.0 },
    { dx: 0.26, dz: 0.28, top: topPerchH - 0.06 },
  ];
  for (const [i, post] of posts.entries()) {
    const h = post.top - 0.07;
    addMesh(
      g,
      new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, h, 16), sisal),
      x + post.dx,
      0.07 + h / 2,
      z + post.dz,
      { name: `tree-post-${i}` },
    );
  }

  // 一层平台
  addMesh(g, roundedBox(0.62, 0.05, 0.5, 0.02, carpet), x - 0.05, 0.72, z - 0.05, { name: 'tree-platform-1' });

  // 猫洞（五面盒体，正面留洞）
  const cubbyY = 1.14;
  addMesh(g, box(0.46, 0.04, 0.44, carpet), x + 0.05, cubbyY - 0.2, z + 0.05, { name: 'cubby-floor' });
  addMesh(g, box(0.46, 0.04, 0.44, carpet), x + 0.05, cubbyY + 0.2, z + 0.05, { name: 'cubby-roof' });
  addMesh(g, box(0.04, 0.4, 0.44, carpet), x - 0.18, cubbyY, z + 0.05, { name: 'cubby-side-w' });
  addMesh(g, box(0.04, 0.4, 0.44, carpet), x + 0.28, cubbyY, z + 0.05, { name: 'cubby-side-e' });
  addMesh(g, box(0.46, 0.4, 0.04, carpet), x + 0.05, cubbyY, z - 0.17, { name: 'cubby-back' });

  // 吊床
  addMesh(g, roundedBox(0.4, 0.04, 0.34, 0.03, mats.plain('rug')), x - 0.28, 1.06, z + 0.3, { name: 'tree-hammock' });

  // 顶台：顶面正好在 topPerchH（猫的「平静」锚点就落在这里）
  addMesh(g, roundedBox(0.62, 0.06, 0.6, 0.02, carpet), x, topPerchH - 0.03, z, { name: 'tree-top-perch' });

  // 顶台上方的短立柱与挂球
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 10), wood), x - 0.24, topPerchH + 0.12, z + 0.24, {
    name: 'tree-top-post',
  });
  const ballMat = mats.plain('cushion');
  addMesh(g, new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), ballMat), x - 0.24, topPerchH + 0.02, z + 0.24, {
    name: 'tree-toy-ball',
  });
  void height;
}

function buildCatShelf(parent: THREE.Group, mats: MaterialLibrary, index: number, z: number, y: number): void {
  const g = group(`cat-shelf-${index}`);
  parent.add(g);
  const carpet = mats.plain('catCarpet');
  const metal = mats.plain('metalDark');
  const x = 3.45;
  addMesh(g, roundedBox(0.36, 0.05, 0.52, 0.02, carpet), x, y - 0.025, z, { name: 'shelf-platform' });
  for (const dz of [-0.16, 0.16]) {
    addMesh(g, box(0.3, 0.03, 0.04, metal), x + 0.09, y - 0.07, z + dz, { name: 'shelf-bracket' });
  }
}

function buildLitterBox(
  parent: THREE.Group,
  mats: MaterialLibrary,
  id: string,
  x: number,
  z: number,
  rotY: number,
): void {
  const g = group(id);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  parent.add(g);
  const shell = mats.plain('plastic');
  const dark = mats.plain('plasticDark');
  const litter = mats.plain('litter');

  // 底盘 + 猫砂
  addMesh(g, roundedBox(0.62, 0.22, 0.72, 0.03, shell), 0, 0.11, 0, { name: 'litter-tray' });
  addMesh(g, box(0.56, 0.02, 0.66, litter), 0, 0.2, 0, { name: 'litter-surface', cast: false });

  // 上罩：正面留门洞
  const hoodY = 0.4;
  addMesh(g, box(0.62, 0.36, 0.05, shell), 0, hoodY, -0.335, { name: 'litter-hood-back' });
  addMesh(g, box(0.05, 0.36, 0.72, shell), -0.285, hoodY, 0, { name: 'litter-hood-w' });
  addMesh(g, box(0.05, 0.36, 0.72, shell), 0.285, hoodY, 0, { name: 'litter-hood-e' });
  addMesh(g, box(0.62, 0.05, 0.72, shell), 0, 0.58, 0, { name: 'litter-hood-roof' });
  // 正面门洞两侧
  addMesh(g, box(0.16, 0.36, 0.05, shell), -0.23, hoodY, 0.335, { name: 'litter-front-w' });
  addMesh(g, box(0.16, 0.36, 0.05, shell), 0.23, hoodY, 0.335, { name: 'litter-front-e' });
  addMesh(g, box(0.3, 0.1, 0.05, shell), 0, 0.53, 0.335, { name: 'litter-front-top' });

  // 门帘
  const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.24), dark);
  flap.position.set(0, 0.34, 0.375);
  flap.name = 'litter-flap';
  g.add(flap);
}

function buildFountain(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('water-fountain');
  g.position.set(FOUNTAIN.x, 0, FOUNTAIN.z);
  parent.add(g);
  const ceramic = mats.plain('ceramic');
  const water = mats.plain('water');

  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.1, 28), ceramic), 0, 0.05, 0, {
    name: 'fountain-base',
  });
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.06, 28, 1, true), ceramic), 0, 0.14, 0, {
    name: 'fountain-bowl',
    receive: false,
  });
  const surface = new THREE.Mesh(new THREE.CircleGeometry(0.2, 28), water);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.16;
  surface.name = 'fountain-water';
  g.add(surface);

  // 中间出水柱
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 16), ceramic), 0, 0.12, -0.06, {
    name: 'fountain-pump',
  });
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 10), water), 0, 0.2, -0.06, {
    name: 'fountain-stream',
    receive: false,
  });
}

function buildWaterBowl(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('water-bowl');
  g.position.set(WATER_BOWL.x, 0, WATER_BOWL.z);
  parent.add(g);
  const ceramic = mats.plain('ceramicBlue');
  const water = mats.plain('water');
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.07, 24), ceramic), 0, 0.035, 0, {
    name: 'water-bowl-body',
  });
  const surface = new THREE.Mesh(new THREE.CircleGeometry(0.115, 24), water);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.062;
  surface.name = 'water-bowl-surface';
  g.add(surface);
}

function buildFoodStation(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('food-station');
  g.position.set(FOOD_STATION.x, 0, FOOD_STATION.z);
  parent.add(g);
  const mat = mats.plain('mat');
  const ceramic = mats.plain('ceramic');
  const kibble = mats.plain('cardboard');

  addMesh(g, roundedBox(0.66, 0.012, 0.36, 0.01, mat), 0, 0.006, 0, { name: 'food-mat', receive: true });
  for (const [i, dx] of [-0.17, 0.17].entries()) {
    addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.05, 22), ceramic), dx, 0.03, 0, {
      name: `food-bowl-${i}`,
    });
    // 碗里的干粮
    addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.012, 18), kibble), dx, 0.05, 0, {
      name: `food-kibble-${i}`,
      cast: false,
    });
  }
}

function buildCatBed(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('cat-bed');
  g.position.set(CAT_BED.x, 0, CAT_BED.z);
  parent.add(g);
  const cloth = mats.plain('catCarpet');
  const cushion = mats.plain('cushion');

  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.33, 0.06, 26), cloth), 0, 0.03, 0, {
    name: 'cat-bed-base',
  });
  // 半圆顶（开口朝 +Z）
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 26, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    cloth,
  );
  dome.position.y = 0.06;
  dome.castShadow = true;
  dome.receiveShadow = true;
  dome.name = 'cat-bed-dome';
  g.add(dome);
  addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24), cushion), 0, 0.07, 0, {
    name: 'cat-bed-cushion',
  });
  const opening = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 10, 24), cloth);
  opening.position.set(0, 0.16, 0.27);
  opening.name = 'cat-bed-opening';
  g.add(opening);
}

function buildHidingBox(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('hiding-box');
  g.position.set(HIDING_BOX.x, 0, HIDING_BOX.z);
  g.rotation.y = -0.35;
  parent.add(g);
  const card = mats.plain('cardboard');
  const { w, h } = HIDING_BOX;

  addMesh(g, box(w, h, 0.02, card), 0, h / 2, -w / 2, { name: 'box-back' });
  addMesh(g, box(0.02, h, w, card), -w / 2, h / 2, 0, { name: 'box-w' });
  addMesh(g, box(0.02, h, w, card), w / 2, h / 2, 0, { name: 'box-e' });
  addMesh(g, box(w, 0.02, w, card), 0, h - 0.01, 0, { name: 'box-roof' });
  addMesh(g, box(w * 0.3, h, 0.02, card), -w * 0.35, h / 2, w / 2, { name: 'box-front-w' });
  addMesh(g, box(w * 0.3, h, 0.02, card), w * 0.35, h / 2, w / 2, { name: 'box-front-e' });
  // 敞开的翻盖
  const flap = box(w, 0.02, w, card);
  flap.position.set(0, h + 0.16, -w * 0.42);
  flap.rotation.x = -0.5;
  flap.name = 'box-flap';
  flap.castShadow = true;
  g.add(flap);
}

function buildWallScratcher(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('wall-scratcher');
  g.position.set(WALL_SCRATCHER.x, WALL_SCRATCHER.y, WALL_SCRATCHER.z);
  parent.add(g);
  const sisal = mats.plain('sisal');
  const wood = mats.plain('woodLight');
  addMesh(g, box(0.03, 0.7, 0.5, wood), 0, 0.35, 0, { name: 'scratcher-backing' });
  addMesh(g, box(0.02, 0.62, 0.42, sisal), -0.03, 0.36, 0, { name: 'scratcher-sisal', receive: true });
}

function buildFloorScratcher(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('floor-scratcher');
  g.position.set(FLOOR_SCRATCHER.x, 0, FLOOR_SCRATCHER.z);
  g.rotation.y = 0.25;
  parent.add(g);
  const sisal = mats.plain('sisal');
  addMesh(g, roundedBox(0.52, 0.04, 0.3, 0.02, sisal), 0, 0.02, 0, { name: 'floor-scratcher-body' });
}

function buildToys(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('toys');
  g.position.set(TOYS.x, 0, TOYS.z);
  parent.add(g);
  addMesh(g, new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), mats.plain('bookA')), 0, 0.045, 0, {
    name: 'toy-ball',
  });
  addMesh(g, new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), mats.plain('cushion')), 0.22, 0.035, 0.16, {
    name: 'toy-ball-2',
  });
  // 逗猫棒：杆 + 羽毛
  const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 8), mats.plain('woodLight'));
  wand.rotation.z = Math.PI / 2.6;
  wand.position.set(-0.25, 0.12, -0.1);
  wand.name = 'toy-wand';
  wand.castShadow = true;
  g.add(wand);
  addMesh(g, new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 12), mats.plain('leaf')), -0.02, 0.32, -0.1, {
    name: 'toy-feather',
  });
}
