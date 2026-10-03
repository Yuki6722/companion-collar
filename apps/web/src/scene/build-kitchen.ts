/**
 * 开放式厨房：一字型台面 + 吊柜 + 水槽 + 灶台 + 油烟机 + 岛台与吧台凳 + 冰箱 + 鞋柜。
 *
 * 全部程序化：CC0 模型库里没有尺寸合适的整体厨房，而厨房必须严格贴合南墙尺寸，
 * 好让出通往入户门与岛台的走道。
 */
import * as THREE from 'three';
import { FRIDGE, ISLAND, KITCHEN, ROOM, SHOE_CABINET, STOOLS } from './layout.ts';
import type { MaterialLibrary } from './materials.ts';
import { addMesh, box, group, roundedBox } from './util.ts';

const HALF_D = ROOM.depth / 2;

export function buildKitchen(root: THREE.Group, mats: MaterialLibrary): void {
  const g = group('kitchen');
  root.add(g);

  const cabinet = mats.plain('woodLight');
  const stone = mats.surface('stone', 3, 1, { color: 0xf2efea, roughness: 0.35 });
  const metal = mats.plain('metal');
  const dark = mats.plain('plasticDark');

  const zCenter = HALF_D - KITCHEN.depthZ / 2;
  const counterTopY = KITCHEN.counterH;

  // 底柜
  addMesh(
    g,
    roundedBox(KITCHEN.widthX, counterTopY - 0.1, KITCHEN.depthZ - 0.04, 0.02, cabinet),
    KITCHEN.x,
    (counterTopY - 0.1) / 2,
    zCenter,
    { name: 'kitchen-base' },
  );
  // 台面
  addMesh(
    g,
    box(KITCHEN.widthX + 0.04, 0.04, KITCHEN.depthZ + 0.02, stone),
    KITCHEN.x,
    counterTopY - 0.02,
    zCenter + 0.01,
    { name: 'kitchen-counter' },
  );
  // 踢脚（内收）
  addMesh(g, box(KITCHEN.widthX - 0.1, 0.1, KITCHEN.depthZ - 0.12, dark), KITCHEN.x, 0.05, zCenter - 0.02, {
    name: 'kitchen-toe',
  });

  // 柜门缝：三道竖缝把底柜分成四扇
  const doorW = KITCHEN.widthX / 4;
  for (let i = 1; i < 4; i++) {
    addMesh(
      g,
      box(0.012, counterTopY - 0.16, 0.01, dark),
      KITCHEN.x - KITCHEN.widthX / 2 + doorW * i,
      (counterTopY - 0.1) / 2,
      zCenter - KITCHEN.depthZ / 2 - 0.005,
      { name: `kitchen-seam-${i}`, cast: false },
    );
  }

  // 吊柜
  addMesh(
    g,
    roundedBox(2.4, 0.7, 0.36, 0.02, cabinet),
    KITCHEN.x - 0.3,
    1.9,
    HALF_D - 0.18,
    { name: 'kitchen-upper' },
  );
  // 灶台上方的油烟机
  addMesh(g, roundedBox(0.9, 0.12, 0.5, 0.02, metal), KITCHEN.cooktopX, 1.62, HALF_D - 0.25, {
    name: 'hood-body',
  });
  addMesh(g, box(0.5, 0.55, 0.32, metal), KITCHEN.cooktopX, 2.0, HALF_D - 0.16, { name: 'hood-duct' });

  // 灶台
  addMesh(g, box(0.62, 0.012, 0.52, dark), KITCHEN.cooktopX, counterTopY + 0.006, zCenter, {
    name: 'cooktop',
    cast: false,
  });
  for (const [dx, dz] of [
    [-0.15, -0.13],
    [0.15, -0.13],
    [-0.15, 0.13],
    [0.15, 0.13],
  ] as const) {
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.014, 20), metal);
    addMesh(g, burner, KITCHEN.cooktopX + dx, counterTopY + 0.014, zCenter + dz, {
      name: 'burner',
      cast: false,
    });
  }

  // 水槽：台面下凹 + 龙头
  addMesh(g, box(0.56, 0.02, 0.4, metal), KITCHEN.sinkX, counterTopY - 0.015, zCenter, {
    name: 'sink-basin',
    cast: false,
  });
  addMesh(g, box(0.46, 0.16, 0.3, dark), KITCHEN.sinkX, counterTopY - 0.1, zCenter, {
    name: 'sink-well',
    cast: false,
  });
  const faucet = group('faucet');
  addMesh(faucet, new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 14), metal), 0, 0.15, 0, {
    name: 'faucet-pipe',
  });
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 12), metal);
  spout.rotation.x = Math.PI / 2;
  addMesh(faucet, spout, 0, 0.29, -0.1, { name: 'faucet-spout' });
  addMesh(faucet, box(0.06, 0.02, 0.06, metal), 0, 0.01, 0, { name: 'faucet-base' });
  faucet.position.set(KITCHEN.sinkX, counterTopY, zCenter - 0.2);
  g.add(faucet);

  // 挡水墙
  addMesh(g, box(KITCHEN.widthX, 0.5, 0.02, stone), KITCHEN.x, counterTopY + 0.25, HALF_D - 0.03, {
    name: 'backsplash',
    cast: false,
  });

  buildIsland(g, mats);
  buildFridge(g, mats);
  buildShoeCabinet(g, mats);
}

function buildIsland(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('island');
  parent.add(g);
  const cabinet = mats.plain('woodWarm');
  const stone = mats.surface('stone', 2, 1, { color: 0xf2efea, roughness: 0.35 });

  addMesh(
    g,
    roundedBox(ISLAND.w, ISLAND.h - 0.04, ISLAND.d, 0.02, cabinet),
    ISLAND.x,
    (ISLAND.h - 0.04) / 2,
    ISLAND.z,
    { name: 'island-body' },
  );
  addMesh(
    g,
    box(ISLAND.w + 0.12, 0.05, ISLAND.d + 0.12, stone),
    ISLAND.x,
    ISLAND.h - 0.01,
    ISLAND.z,
    { name: 'island-top' },
  );

  const metal = mats.plain('metalDark');
  for (const [i, stool] of STOOLS.entries()) {
    const seatX = stool.x;
    const seatZ = stool.z;
    addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 20), cabinet), seatX, 0.66, seatZ, {
      name: `stool-seat-${i}`,
    });
    addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.64, 12), metal), seatX, 0.33, seatZ, {
      name: `stool-stem-${i}`,
    });
    addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 20), metal), seatX, 0.02, seatZ, {
      name: `stool-base-${i}`,
      cast: false,
    });
  }
}

function buildFridge(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('fridge');
  parent.add(g);
  const body = mats.plain('metal');
  const dark = mats.plain('plasticDark');

  addMesh(g, roundedBox(FRIDGE.w, FRIDGE.h, FRIDGE.d, 0.03, body), FRIDGE.x, FRIDGE.h / 2, FRIDGE.z, {
    name: 'fridge-body',
  });
  // 上下门分缝 + 拉手
  addMesh(g, box(FRIDGE.w + 0.01, 0.012, 0.012, dark), FRIDGE.x, FRIDGE.h * 0.62, FRIDGE.z - FRIDGE.d / 2 - 0.005, {
    name: 'fridge-seam',
    cast: false,
  });
  for (const y of [FRIDGE.h * 0.75, FRIDGE.h * 0.42]) {
    addMesh(g, box(0.03, 0.34, 0.03, dark), FRIDGE.x - 0.12, y, FRIDGE.z - FRIDGE.d / 2 - 0.03, {
      name: 'fridge-handle',
    });
  }
}

function buildShoeCabinet(parent: THREE.Group, mats: MaterialLibrary): void {
  const g = group('shoe-cabinet');
  parent.add(g);
  const wood = mats.plain('woodLight');
  addMesh(
    g,
    roundedBox(SHOE_CABINET.w, SHOE_CABINET.h, SHOE_CABINET.d, 0.02, wood),
    SHOE_CABINET.x,
    SHOE_CABINET.h / 2,
    SHOE_CABINET.z,
    { name: 'shoe-cabinet-body' },
  );
}
