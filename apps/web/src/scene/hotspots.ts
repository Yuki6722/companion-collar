/**
 * 3D 锚点 → DOM 标签投影。
 *
 * 为什么不用 CSS3DRenderer 或 Sprite：标签需要**可选中、可读、可无障碍访问**的文本，
 * 用真 DOM 才能被屏幕阅读器与浏览器缩放正确处理；投影只要每帧把世界坐标转到屏幕坐标即可。
 */
import * as THREE from 'three';

export interface Hotspot {
  id: string;
  label: string;
  /** 可选徽章：这里用于标注该资源属于哪条支柱 / 证据等级 */
  badge?: string;
  position: THREE.Vector3;
}

const FRAME = new THREE.Vector3();

export class HotspotLayer {
  private readonly host: HTMLElement;
  private readonly nodes = new Map<string, HTMLDivElement>();
  private readonly sizes = new Map<string, { w: number; h: number }>();
  private items: Hotspot[] = [];
  private visible = true;

  constructor(host: HTMLElement) {
    this.host = host;
    this.host.className = 'hotspot-layer';
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.host.style.display = on ? 'block' : 'none';
  }

  set(items: Hotspot[]): void {
    this.items = items;
    for (const node of this.nodes.values()) node.remove();
    this.nodes.clear();
    this.sizes.clear();
    for (const item of items) {
      const node = document.createElement('div');
      node.className = 'hotspot';
      const label = document.createElement('span');
      label.className = 'hotspot-label';
      label.textContent = item.label;
      node.appendChild(label);
      if (item.badge) {
        const badge = document.createElement('span');
        badge.className = 'hotspot-badge';
        badge.textContent = item.badge;
        node.appendChild(badge);
      }
      this.host.appendChild(node);
      this.nodes.set(item.id, node);
      // 提前量一次尺寸：每帧读 offsetWidth 会触发强制重排
      this.sizes.set(item.id, { w: node.offsetWidth || 110, h: node.offsetHeight || 20 });
    }
  }

  /**
   * 每帧调用：投影到屏幕坐标，并做**贪心去重**——近处的标签优先，
   * 与已放置标签的矩形相交的会被隐藏。否则十几个标签会在房间中心糊成一团。
   */
  update(camera: THREE.Camera, width: number, height: number): void {
    if (!this.visible) return;
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    const ordered = this.items
      .map((item) => ({ item, d: camera.position.distanceToSquared(item.position) }))
      .sort((a, b) => a.d - b.d);

    for (const { item } of ordered) {
      const node = this.nodes.get(item.id);
      if (!node) continue;
      FRAME.copy(item.position).project(camera);
      const inFront = FRAME.z > -1 && FRAME.z < 1;
      const x = (FRAME.x * 0.5 + 0.5) * width;
      const y = (-FRAME.y * 0.5 + 0.5) * height;
      const size = this.sizes.get(item.id) ?? { w: 110, h: 20 };
      const offScreen = x < -80 || y < -40 || x > width + 80 || y > height + 40;
      const overlaps = placed.some(
        (p) =>
          Math.abs(p.x - x) < (p.w + size.w) / 2 &&
          Math.abs(p.y - y) < (p.h + size.h) / 2,
      );
      if (!inFront || offScreen || overlaps) {
        node.style.opacity = '0';
        node.style.pointerEvents = 'none';
        continue;
      }
      placed.push({ x, y, w: size.w, h: size.h });
      node.style.opacity = '1';
      node.style.pointerEvents = 'auto';
      node.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  dispose(): void {
    for (const node of this.nodes.values()) node.remove();
    this.nodes.clear();
    this.sizes.clear();
    this.items = [];
  }
}
