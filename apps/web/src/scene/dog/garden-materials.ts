/**
 * 室外材质库（狗版院子的专用材质）。
 *
 * 为什么**不复用** `../materials.ts` 的 `MaterialLibrary`：
 *   - 院子的地面（草坪 / 砾石 / 石板）都没有对应的 CC0 平铺贴图，也就用不上那套
 *     「外部贴图到货后原地替换」的机制；塞进去只会让 `SurfaceId` 里混进一堆永远
 *     拿不到外部贴图的分支；
 *   - 草坪是用 `ShapeGeometry`（带池塘洞）做的，它的 UV 单位是**米**而不是 0–1，
 *     需要「不取整」的平铺次数 —— 而 `MaterialLibrary` 的 `cloneRepeating` 会取整。
 *     这个差异是结构性的，不是偏好。
 *
 * 室内部分仍然走 `MaterialLibrary`：木地板、乳胶漆、石材台面那三张 CC0 贴图要继续生效。
 */
import * as THREE from 'three';
import {
  barkTextures,
  fenceSlatTextures,
  foliageTextures,
  grassTextures,
  gravelTextures,
  pavingTextures,
  type SimpleMaps,
} from '../textures.ts';

/** 需要平铺的室外大面。 */
export type GardenSurfaceId = 'grass' | 'gravel' | 'paving' | 'fence' | 'hedge';

/** 单一颜色/贴图的小面积材质。 */
export type GardenPlainId =
  | 'bark'
  | 'foliage'
  | 'foliageWarm'
  | 'pebble'
  | 'basin'
  | 'canvas'
  | 'petBed'
  | 'gardenWood'
  | 'lanternStone'
  | 'lampGlow';

export class GardenMaterials {
  private readonly surfaces = new Map<string, THREE.MeshStandardMaterial>();
  private readonly plains = new Map<GardenPlainId, THREE.MeshStandardMaterial>();
  /** 程序化贴图只生成一次：一张 512² 的草地贴图要跑一万笔描边，重复生成会拖慢首屏 */
  private readonly sets = new Map<GardenSurfaceId, SimpleMaps>();

  /**
   * 按平铺次数取材质。**不取整** —— 草坪的 UV 以米为单位，取整会让它变成一整块模糊色。
   * 同一个「资产 + 平铺次数 + 颜色」只建一次材质。
   */
  surface(
    id: GardenSurfaceId,
    repeatX: number,
    repeatY: number,
    opts: { color?: number; roughness?: number; normalScale?: number } = {},
  ): THREE.MeshStandardMaterial {
    const key = `${id}:${repeatX.toFixed(3)}:${repeatY.toFixed(3)}:${opts.color ?? ''}:${opts.roughness ?? ''}:${opts.normalScale ?? ''}`;
    const hit = this.surfaces.get(key);
    if (hit) return hit;

    const set = this.set(id);
    const mat = new THREE.MeshStandardMaterial({
      map: cloneTiled(set.map, repeatX, repeatY),
      roughness: opts.roughness ?? 0.95,
      metalness: 0,
    });
    if (set.roughnessMap) mat.roughnessMap = cloneTiled(set.roughnessMap, repeatX, repeatY);
    if (set.normalMap) {
      mat.normalMap = cloneTiled(set.normalMap, repeatX, repeatY);
      const k = opts.normalScale ?? 1;
      mat.normalScale = new THREE.Vector2(k, k);
    }
    if (opts.color !== undefined) mat.color.setHex(opts.color);
    this.surfaces.set(key, mat);
    return mat;
  }

  plain(id: GardenPlainId): THREE.MeshStandardMaterial {
    const hit = this.plains.get(id);
    if (hit) return hit;
    const mat = this.buildPlain(id);
    this.plains.set(id, mat);
    return mat;
  }

  private set(id: GardenSurfaceId): SimpleMaps {
    const hit = this.sets.get(id);
    if (hit) return hit;
    const made =
      id === 'grass'
        ? grassTextures()
        : id === 'gravel'
          ? gravelTextures()
          : id === 'paving'
            ? pavingTextures()
            : id === 'fence'
              ? fenceSlatTextures()
              : foliageTextures('#3d6633', 191);
    this.sets.set(id, made);
    return made;
  }

  private buildPlain(id: GardenPlainId): THREE.MeshStandardMaterial {
    switch (id) {
      case 'bark':
        return mapped(barkTextures(), { roughness: 0.95 });
      case 'foliage':
        return mapped(foliageTextures('#416f36', 181), { roughness: 0.88, normalScale: 1.2 });
      case 'foliageWarm':
        return mapped(foliageTextures('#9c4a2c', 183), { roughness: 0.88, normalScale: 1.2 });
      case 'pebble':
        return mapped(gravelTextures(143), { roughness: 0.9, normalScale: 1.2, color: 0x9a978f });
      case 'basin':
        // 池壁是**开口圆柱**：只有外表面有面，从池口俯视时近侧壁会被背面剔除，
        // 看起来像池子破了一个口。所以池壁材质必须是双面。
        return mapped(gravelTextures(143), {
          roughness: 0.9,
          normalScale: 1.2,
          color: 0x8d8a83,
          doubleSide: true,
        });
      case 'canvas':
        return new THREE.MeshStandardMaterial({ color: 0xd9cfba, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
      case 'petBed':
        return new THREE.MeshStandardMaterial({ color: 0x9aa7b3, roughness: 1, metalness: 0 });
      case 'gardenWood':
        return mapped(barkTextures(153), { roughness: 0.92, color: 0x9a7f5e, normalScale: 0.6 });
      case 'lanternStone':
        return new THREE.MeshStandardMaterial({ color: 0x8f8c86, roughness: 0.85, metalness: 0 });
      case 'lampGlow':
        // 白天看不出灯亮，但灯罩本身要读成「一盏灯」而不是一根灰柱子；
        // 用自发光而不是真加 PointLight：四盏灯在白天完全无意义，却要付四份光照开销。
        return new THREE.MeshStandardMaterial({
          color: 0xfff1d6,
          emissive: 0xffd08a,
          emissiveIntensity: 0.9,
          roughness: 0.4,
          metalness: 0,
        });
      default: {
        // 穷举保护：新增 GardenPlainId 却忘了分支时，TS 会在此报错
        const never: never = id;
        throw new Error(`未实现的室外材质：${String(never)}`);
      }
    }
  }

  dispose(): void {
    for (const mat of this.surfaces.values()) {
      mat.map?.dispose();
      mat.roughnessMap?.dispose();
      mat.normalMap?.dispose();
      mat.dispose();
    }
    this.surfaces.clear();
    for (const mat of this.plains.values()) {
      mat.map?.dispose();
      mat.roughnessMap?.dispose();
      mat.normalMap?.dispose();
      mat.dispose();
    }
    this.plains.clear();
    for (const set of this.sets.values()) {
      set.map.dispose();
      set.roughnessMap?.dispose();
      set.normalMap?.dispose();
    }
    this.sets.clear();
  }
}

function mapped(
  set: SimpleMaps,
  opts: { roughness: number; color?: number; normalScale?: number; doubleSide?: boolean },
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: set.map,
    roughness: opts.roughness,
    metalness: 0,
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (set.roughnessMap) mat.roughnessMap = set.roughnessMap;
  if (set.normalMap) {
    mat.normalMap = set.normalMap;
    const k = opts.normalScale ?? 1;
    mat.normalScale = new THREE.Vector2(k, k);
  }
  if (opts.color !== undefined) mat.color.setHex(opts.color);
  return mat;
}

/** 平铺次数**不取整**的克隆：草坪的 ShapeGeometry UV 单位是米。 */
function cloneTiled(source: THREE.Texture, repeatX: number, repeatY: number): THREE.Texture {
  const t = source.clone();
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(0.01, repeatX), Math.max(0.01, repeatY));
  t.needsUpdate = true;
  return t;
}
