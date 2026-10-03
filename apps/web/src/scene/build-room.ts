/**
 * 建筑外壳：地板、四面墙（带窗洞与门洞）、天花板、踢脚线、窗与窗帘。
 *
 * 为什么用分段盒体而不是带洞的多边形：无打包器、无建模工具的条件下，用盒体拼出洞口
 * 是最可读、最容易按布局数据（layout.ts）核对的做法，也便于按尺寸改窗宽门位。
 */
import * as THREE from 'three';
import { DOOR, ROOM, WINDOW } from './layout.ts';
import type { MaterialLibrary } from './materials.ts';
import { addMesh, box, group } from './util.ts';

const HALF_W = ROOM.width / 2;
const HALF_D = ROOM.depth / 2;
const T = ROOM.wallThickness;

function slab(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  name: string,
): void {
  addMesh(parent, box(w, h, d, material), x, y, z, { name });
}

/**
 * 墙面用**单面平面**而不是盒体，理由很关键：
 * 平面的法线朝房间内侧，于是从室外看时背面被剔除——相机在房外也能直接看进屋里，
 * 不会出现「被自己家的墙挡住」的经典问题；相机在屋内时墙又正常可见。
 * 这也是建筑可视化里最常用的「娃娃屋剖面」做法，且不增加任何遮挡剔除逻辑。
 */
function panel(
  parent: THREE.Object3D,
  w: number,
  h: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  rotY: number,
  name: string,
): void {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  // 墙只接收阴影：投影会让单面墙在室外视角下产生奇怪的剪影
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = name;
  parent.add(mesh);
}

export function buildRoom(root: THREE.Group, mats: MaterialLibrary): void {
  const shell = group('room-shell');
  root.add(shell);

  const floorMat = mats.surface('woodFloor', ROOM.width / 1.6, ROOM.depth / 1.6);
  const wallMat = mats.surface('plaster', ROOM.width / 2.4, ROOM.height / 2.4, { color: 0xf3ece2 });
  const accentMat = mats.surface('plaster', 2, 1.4, { color: 0xe4d9c8 });
  const ceilingMat = mats.plain('plastic').clone();
  ceilingMat.color.setHex(0xf7f3ec);
  ceilingMat.roughness = 1;
  const trimMat = mats.plain('woodLight');

  // 地板与天花板
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  shell.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM.height;
  ceiling.name = 'ceiling';
  shell.add(ceiling);

  // 北墙（窗墙）：四段围出窗洞；法线朝 +Z（屋内）
  const winLeft = -HALF_W;
  const winRight = HALF_W;
  const winMinX = WINDOW.centerX - WINDOW.width / 2;
  const winMaxX = WINDOW.centerX + WINDOW.width / 2;
  const winTopY = WINDOW.sillY + WINDOW.height;

  panel(shell, winMinX - winLeft, ROOM.height, wallMat, (winLeft + winMinX) / 2, ROOM.height / 2, -HALF_D, 0, 'wall-north-left');
  panel(shell, winRight - winMaxX, ROOM.height, wallMat, (winMaxX + winRight) / 2, ROOM.height / 2, -HALF_D, 0, 'wall-north-right');
  panel(shell, WINDOW.width, WINDOW.sillY, wallMat, WINDOW.centerX, WINDOW.sillY / 2, -HALF_D, 0, 'wall-north-sill');
  panel(shell, WINDOW.width, ROOM.height - winTopY, wallMat, WINDOW.centerX, (winTopY + ROOM.height) / 2, -HALF_D, 0, 'wall-north-head');

  // 南墙（门墙 + 厨房背墙）：法线朝 -Z
  const doorMinX = DOOR.centerX - DOOR.width / 2;
  const doorMaxX = DOOR.centerX + DOOR.width / 2;
  panel(shell, doorMinX - winLeft, ROOM.height, accentMat, (winLeft + doorMinX) / 2, ROOM.height / 2, HALF_D, Math.PI, 'wall-south-west');
  panel(shell, winRight - doorMaxX, ROOM.height, wallMat, (doorMaxX + winRight) / 2, ROOM.height / 2, HALF_D, Math.PI, 'wall-south-east');
  panel(shell, DOOR.width, ROOM.height - DOOR.height, wallMat, DOOR.centerX, (DOOR.height + ROOM.height) / 2, HALF_D, Math.PI, 'wall-south-head');

  // 东墙（电视墙，法线朝 -X）与西墙（床/衣柜墙，法线朝 +X）
  panel(shell, ROOM.depth, ROOM.height, accentMat, HALF_W, ROOM.height / 2, 0, -Math.PI / 2, 'wall-east');
  panel(shell, ROOM.depth, ROOM.height, wallMat, -HALF_W, ROOM.height / 2, 0, Math.PI / 2, 'wall-west');

  // 踢脚线：沿四面墙一圈
  const baseH = 0.09;
  const baseT = 0.02;
  const addBase = (w: number, d: number, x: number, z: number, name: string): void => {
    slab(shell, w, baseH, d, trimMat, x, baseH / 2, z, name);
  };
  addBase(ROOM.width, baseT, 0, -HALF_D + T / 2 + baseT / 2, 'base-north');
  addBase(winMinX - winLeft, baseT, (winLeft + winMinX) / 2, HALF_D - T / 2 - baseT / 2, 'base-south-w');
  addBase(winRight - doorMaxX, baseT, (doorMaxX + winRight) / 2, HALF_D - T / 2 - baseT / 2, 'base-south-e');
  addBase(baseT, ROOM.depth, HALF_W - T / 2 - baseT / 2, 0, 'base-east');
  addBase(baseT, ROOM.depth, -HALF_W + T / 2 + baseT / 2, 0, 'base-west');

  buildWindow(shell, mats);
  buildDoor(shell, mats, trimMat);
  buildCurtain(shell, mats);
}

function buildWindow(shell: THREE.Group, mats: MaterialLibrary): void {
  const frameMat = mats.plain('metalDark');
  const glassMat = mats.plain('glass');
  const z = -HALF_D;
  const inner = group('window');
  shell.add(inner);

  const fw = 0.06;
  const w = WINDOW.width;
  const h = WINDOW.height;
  const y = WINDOW.sillY + h / 2;

  // 窗框：上下左右 + 中竖梃
  slab(inner, w, fw, 0.1, frameMat, WINDOW.centerX, WINDOW.sillY + fw / 2, z, 'window-frame-bottom');
  slab(inner, w, fw, 0.1, frameMat, WINDOW.centerX, WINDOW.sillY + h - fw / 2, z, 'window-frame-top');
  slab(inner, fw, h, 0.1, frameMat, WINDOW.centerX - w / 2 + fw / 2, y, z, 'window-frame-left');
  slab(inner, fw, h, 0.1, frameMat, WINDOW.centerX + w / 2 - fw / 2, y, z, 'window-frame-right');
  slab(inner, fw * 0.7, h, 0.08, frameMat, WINDOW.centerX, y, z, 'window-mullion');

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - fw, h - fw), glassMat);
  glass.position.set(WINDOW.centerX, y, z + 0.06);
  glass.name = 'window-glass';
  inner.add(glass);

  // 窗台板
  const sill = mats.plain('woodLight');
  slab(inner, w + 0.12, 0.04, 0.24, sill, WINDOW.centerX, WINDOW.sillY + 0.02, z + 0.12, 'window-sill');
}

function buildDoor(shell: THREE.Group, mats: MaterialLibrary, trimMat: THREE.MeshStandardMaterial): void {
  const doorGroup = group('door');
  shell.add(doorGroup);
  const z = HALF_D;
  const panelMat = mats.plain('woodWarm');

  // 门套
  slab(doorGroup, DOOR.width + 0.08, 0.06, 0.14, trimMat, DOOR.centerX, DOOR.height + 0.03, z, 'door-frame-top');
  // 门扇：略微打开，让入户方向可读
  const panel = box(DOOR.width - 0.04, DOOR.height - 0.02, 0.045, panelMat);
  const hingeX = DOOR.centerX - DOOR.width / 2 + 0.02;
  panel.position.set(hingeX + (DOOR.width - 0.04) / 2, (DOOR.height - 0.02) / 2, z - 0.06);
  panel.name = 'door-panel';
  panel.castShadow = true;
  panel.receiveShadow = true;
  doorGroup.add(panel);
  const handle = cylinderHandle(mats);
  handle.position.set(hingeX + (DOOR.width - 0.04) - 0.1, 1.02, z - 0.1);
  doorGroup.add(handle);
}

function cylinderHandle(mats: MaterialLibrary): THREE.Group {
  const g = group('door-handle');
  const metal = mats.plain('metal');
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 12), metal);
  bar.rotation.z = Math.PI / 2;
  bar.castShadow = true;
  g.add(bar);
  return g;
}

function buildCurtain(shell: THREE.Group, mats: MaterialLibrary): void {
  const g = group('curtain');
  shell.add(g);
  const rodMat = mats.plain('metalDark');
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, CURTAIN_WIDTH(), 16), rodMat);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(WINDOW.centerX, WINDOW.sillY + WINDOW.height + 0.22, WINDOW.z + 0.18);
  rod.name = 'curtain-rod';
  rod.castShadow = true;
  g.add(rod);

  const cloth = mats.plain('curtain');
  const panelW = 0.85;
  for (const side of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(panelW, WINDOW.height + 0.55, 12, 1);
    const pos = geo.attributes.position;
    if (pos) {
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, Math.sin(x * 14) * 0.035);
      }
      pos.needsUpdate = true;
    }
    geo.computeVertexNormals();
    const panel = new THREE.Mesh(geo, cloth);
    panel.position.set(
      WINDOW.centerX + side * (WINDOW.width / 2 + 0.42),
      WINDOW.sillY + (WINDOW.height + 0.55) / 2 - 0.28,
      WINDOW.z + 0.2,
    );
    panel.castShadow = true;
    panel.name = `curtain-panel-${side > 0 ? 'e' : 'w'}`;
    g.add(panel);
  }
}

/** 窗帘杆长度（略宽于窗）。 */
function CURTAIN_WIDTH(): number {
  return WINDOW.width + 2.2;
}
