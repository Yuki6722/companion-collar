/**
 * 材质库。
 *
 * 两个来源，优先外部、失败回退程序化：
 *   - **CC0 平铺贴图**（木地板、墙面、石材）——决定大面积观感；
 *   - **程序化生成**（其余全部）——保证离线/资产缺失时画面仍然是写实风格而不是白模。
 *
 * 关键设计：贴图是**异步到货**的。首屏先用程序化贴图把房间渲染出来，CC0 贴图到了之后
 * 通过 `setTiles()` 就地换掉已缓存材质上的贴图（不重建网格），所以首屏快、最终观感好。
 *
 * 为什么按「平铺密度」缓存：repeat 是贴图对象上的属性，不同尺寸的面必须用贴图克隆，
 * 否则地板与台面会共用同一个重复次数而互相拉伸。缓存键 = 资产 + 重复次数。
 */
import * as THREE from 'three';
import type { TileSet } from './assets.ts';
import {
  fabricTextures,
  litterTextures,
  metalTextures,
  plasterTextures,
  sisalTextures,
  stoneTextures,
  waterNormalTexture,
  woodTextures,
} from './textures.ts';

export type SurfaceId = 'woodFloor' | 'plaster' | 'stone';

export type PlainId =
  | 'woodLight'
  | 'woodWarm'
  | 'woodDark'
  | 'sofaFabric'
  | 'rug'
  | 'bedding'
  | 'cushion'
  | 'metal'
  | 'metalDark'
  | 'glass'
  | 'ceramic'
  | 'ceramicBlue'
  | 'sisal'
  | 'litter'
  | 'catCarpet'
  | 'plastic'
  | 'plasticDark'
  | 'screen'
  | 'water'
  | 'cardboard'
  | 'terracotta'
  | 'leaf'
  | 'curtain'
  | 'mat'
  | 'bookA'
  | 'bookB'
  | 'bookC';

interface SurfaceRecord {
  material: THREE.MeshStandardMaterial;
  id: SurfaceId;
  repeatX: number;
  repeatY: number;
  color?: number;
  roughness: number;
  /** 该材质当前用的是外部贴图还是程序化回退 */
  external: boolean;
}

export class MaterialLibrary {
  readonly waterNormal: THREE.Texture;
  private readonly surfaceCache = new Map<string, SurfaceRecord>();
  private readonly plainCache = new Map<string, THREE.Material>();

  constructor() {
    this.waterNormal = waterNormalTexture();
  }

  /**
   * CC0 平铺贴图到货后就地替换：清理旧克隆、按原有重复次数换上新贴图。
   * 不重建几何、不重建材质对象，因此已经在场景里的网格会立刻变好看。
   */
  setTiles(tiles: Map<string, TileSet>): void {
    for (const record of this.surfaceCache.values()) {
      const tile = tiles.get(record.id);
      if (!tile) continue;
      const { material, repeatX, repeatY } = record;
      disposeIfCloned(material.map);
      disposeIfCloned(material.roughnessMap);
      disposeIfCloned(material.normalMap);
      material.map = cloneRepeating(tile.map, repeatX, repeatY);
      material.roughnessMap = tile.roughnessMap
        ? cloneRepeating(tile.roughnessMap, repeatX, repeatY)
        : null;
      material.normalMap = tile.normalMap ? cloneRepeating(tile.normalMap, repeatX, repeatY) : null;
      material.needsUpdate = true;
      record.external = true;
    }
  }

  /** 哪些大表面已经用上外部贴图（自检与文档用）。 */
  externalSurfaces(): string[] {
    return [...this.surfaceCache.values()]
      .filter((r) => r.external)
      .map((r) => r.id);
  }

  /** 大表面：按世界尺寸与瓷砖边长自动决定平铺次数。 */
  surface(
    id: SurfaceId,
    repeatX: number,
    repeatY: number,
    opts: { color?: number; roughness?: number } = {},
  ): THREE.MeshStandardMaterial {
    const key = `surface:${id}:${Math.round(repeatX * 10)}:${Math.round(repeatY * 10)}:${opts.color ?? ''}:${opts.roughness ?? ''}`;
    const hit = this.surfaceCache.get(key);
    if (hit) return hit.material;
    const mat = new THREE.MeshStandardMaterial({ roughness: opts.roughness ?? 0.85, metalness: 0 });
    if (opts.color !== undefined) mat.color.setHex(opts.color);
    const record: SurfaceRecord = {
      material: mat,
      id,
      repeatX,
      repeatY,
      roughness: opts.roughness ?? 0.85,
      external: false,
      ...(opts.color !== undefined ? { color: opts.color } : {}),
    };
    this.surfaceCache.set(key, record);
    this.applyFallback(record);
    return mat;
  }

  private applyFallback(record: SurfaceRecord): void {
    const { material, id, repeatX, repeatY } = record;
    const fallback =
      id === 'woodFloor'
        ? woodTextures({ plank: true, seed: 7 })
        : id === 'plaster'
          ? plasterTextures()
          : stoneTextures();
    material.map = cloneRepeating(fallback.map, repeatX, repeatY);
    material.roughnessMap = fallback.roughnessMap
      ? cloneRepeating(fallback.roughnessMap, repeatX, repeatY)
      : null;
    material.normalMap = fallback.normalMap ? cloneRepeating(fallback.normalMap, repeatX, repeatY) : null;
    material.needsUpdate = true;
  }

  plain(id: PlainId): THREE.MeshStandardMaterial {
    const hit = this.plainCache.get(id);
    if (hit) return hit as THREE.MeshStandardMaterial;
    const mat = this.buildPlain(id);
    this.plainCache.set(id, mat);
    return mat;
  }

  private buildPlain(id: PlainId): THREE.MeshStandardMaterial {
    const wood = (base: string, dark: string, seed: number): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({
        ...maps(woodTextures({ base, dark, seed, size: 256 })),
        roughness: 0.72,
        metalness: 0,
      });
    const cloth = (color: string, seed: number, thread = 4): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({
        ...maps(fabricTextures(color, seed, 256, thread)),
        roughness: 0.94,
        metalness: 0,
      });

    switch (id) {
      case 'woodLight':
        return wood('#d9b98c', '#b08c5c', 201);
      case 'woodWarm':
        return wood('#b98a55', '#8a5f31', 202);
      case 'woodDark':
        return wood('#6b4a30', '#43291a', 203);
      case 'sofaFabric':
        return cloth('#9aa39b', 204, 5);
      case 'rug':
        return cloth('#cdbba3', 205, 6);
      case 'bedding':
        return cloth('#eee7dd', 206, 5);
      case 'cushion':
        return cloth('#c8a27a', 207, 5);
      case 'catCarpet':
        return cloth('#e0d8c8', 208, 3);
      case 'metal':
        return new THREE.MeshStandardMaterial({
          ...maps(metalTextures(209, 256)),
          metalness: 0.8,
          roughness: 0.35,
        });
      case 'metalDark':
        return new THREE.MeshStandardMaterial({
          color: 0x3b3f45,
          metalness: 0.7,
          roughness: 0.45,
        });
      case 'glass':
        return new THREE.MeshPhysicalMaterial({
          color: 0xdfeaf0,
          metalness: 0,
          roughness: 0.05,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
        });
      case 'ceramic':
        return new THREE.MeshStandardMaterial({ color: 0xf4f1ec, roughness: 0.22, metalness: 0.02 });
      case 'ceramicBlue':
        return new THREE.MeshStandardMaterial({ color: 0x6f8fa3, roughness: 0.28, metalness: 0.02 });
      case 'sisal':
        return new THREE.MeshStandardMaterial({
          ...maps(sisalTextures(210, 256)),
          roughness: 1,
          metalness: 0,
        });
      case 'litter':
        return new THREE.MeshStandardMaterial({
          ...maps(litterTextures(211, 256)),
          roughness: 1,
          metalness: 0,
        });
      case 'plastic':
        return new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.5, metalness: 0.05 });
      case 'plasticDark':
        return new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.55, metalness: 0.1 });
      case 'screen':
        return new THREE.MeshStandardMaterial({
          color: 0x0a0c10,
          roughness: 0.18,
          metalness: 0.3,
          emissive: 0x1a2634,
          emissiveIntensity: 0.35,
        });
      case 'water':
        return new THREE.MeshStandardMaterial({
          color: 0xbfe0e8,
          roughness: 0.06,
          metalness: 0.1,
          transparent: true,
          opacity: 0.62,
          normalMap: this.waterNormal,
          normalScale: new THREE.Vector2(0.25, 0.25),
        });
      case 'cardboard':
        return new THREE.MeshStandardMaterial({ color: 0xc79a63, roughness: 0.95, metalness: 0 });
      case 'terracotta':
        return new THREE.MeshStandardMaterial({ color: 0xbf7a52, roughness: 0.8, metalness: 0 });
      case 'leaf':
        return new THREE.MeshStandardMaterial({ color: 0x4f7a44, roughness: 0.7, metalness: 0 });
      case 'curtain':
        return new THREE.MeshStandardMaterial({
          color: 0xf3ece1,
          roughness: 1,
          metalness: 0,
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
        });
      case 'mat':
        return new THREE.MeshStandardMaterial({ color: 0x8d9c8f, roughness: 0.9, metalness: 0 });
      case 'bookA':
        return new THREE.MeshStandardMaterial({ color: 0x8c4a3c, roughness: 0.8 });
      case 'bookB':
        return new THREE.MeshStandardMaterial({ color: 0x3f5a72, roughness: 0.8 });
      case 'bookC':
        return new THREE.MeshStandardMaterial({ color: 0xa9905f, roughness: 0.8 });
      default: {
        // 穷举保护：新增 PlainId 却忘了分支时，TS 会在此报错
        const never: never = id;
        throw new Error(`未实现的材质：${String(never)}`);
      }
    }
  }

  dispose(): void {
    for (const record of this.surfaceCache.values()) {
      record.material.map?.dispose();
      record.material.roughnessMap?.dispose();
      record.material.normalMap?.dispose();
      record.material.dispose();
    }
    this.surfaceCache.clear();
    for (const mat of this.plainCache.values()) mat.dispose();
    this.plainCache.clear();
    this.waterNormal.dispose();
  }
}

function disposeIfCloned(tex: THREE.Texture | null): void {
  // 只销毁克隆出来的贴图；外部贴图由 assets 层持有，不能在这里销毁
  if (tex && tex.userData.cloned === true) tex.dispose();
}

function maps(set: {
  map: THREE.CanvasTexture;
  roughnessMap?: THREE.CanvasTexture;
  normalMap?: THREE.CanvasTexture;
}): {
  map: THREE.Texture;
  roughnessMap?: THREE.Texture;
  normalMap?: THREE.Texture;
} {
  const out: { map: THREE.Texture; roughnessMap?: THREE.Texture; normalMap?: THREE.Texture } = {
    map: set.map,
  };
  if (set.roughnessMap) out.roughnessMap = set.roughnessMap;
  if (set.normalMap) out.normalMap = set.normalMap;
  return out;
}

function cloneRepeating(source: THREE.Texture, repeatX: number, repeatY: number): THREE.Texture {
  const t = source.clone();
  t.userData.cloned = true;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(1, Math.round(repeatX)), Math.max(1, Math.round(repeatY)));
  t.needsUpdate = true;
  return t;
}
