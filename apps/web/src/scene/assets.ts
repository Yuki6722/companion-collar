/**
 * 资产加载层。
 *
 * 三条纪律：
 *   1. **失败必须可降级**——任何一个模型/贴图/HDRI 拿不到，场景都不能白屏；
 *      缺失的东西记录进 `issues`，由 HUD 明确列出来，而不是静默变成空气。
 *   2. **零运行时外链**——所有资产都在构建产物内（`apps/web/public/assets/` → `dist/assets/`）。
 *   3. **进度可见**——首屏先渲染房间与程序化家具，扫描模型到货后逐个替换占位体。
 *
 * 资产来源与许可见 `apps/web/public/assets/CREDITS.md`（全部 CC0）。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

export type IssueKind = 'model' | 'texture' | 'env';

export interface AssetIssue {
  id: string;
  kind: IssueKind;
  reason: string;
}

export interface TileSet {
  map: THREE.Texture;
  roughnessMap: THREE.Texture | null;
  normalMap: THREE.Texture | null;
}

export interface AssetReport {
  loadedModels: string[];
  failedModels: string[];
  loadedTiles: string[];
  envLoaded: boolean;
  issues: AssetIssue[];
}

/** 单件扫描模型的清单。id 同时是 `layout.ts` 里引用它的键。 */
export const MODEL_MANIFEST: ReadonlyArray<{ id: string; file: string }> = [
  { id: 'sofa', file: 'models/sofa_03/sofa_03_1k.gltf' },
  { id: 'coffeeTable', file: 'models/coffee_table_round_01/coffee_table_round_01_1k.gltf' },
  { id: 'shelf', file: 'models/Shelf_01/Shelf_01_1k.gltf' },
  { id: 'sideboard', file: 'models/painted_wooden_cabinet/painted_wooden_cabinet_1k.gltf' },
  { id: 'plant', file: 'models/potted_plant_02/potted_plant_02_1k.gltf' },
  { id: 'pendant', file: 'models/modern_ceiling_lamp_01/modern_ceiling_lamp_01_1k.gltf' },
];

/**
 * 平铺 PBR 贴图清单。命名遵循 Poly Haven 的 `<id>_diff_1k.jpg` 约定。
 *
 * `maps` 如实描述**实际抓到了哪几张**——抓取脚本刻意只下必需的图以控制仓库体积，
 * 这里跟着如实声明，避免运行时对不存在的文件发 404 请求。
 */
export const TILE_MANIFEST: ReadonlyArray<{
  id: string;
  dir: string;
  base: string;
  maps: { roughness: boolean; normal: boolean };
}> = [
  {
    id: 'woodFloor',
    dir: 'textures/wood_floor_deck',
    base: 'wood_floor_deck',
    maps: { roughness: true, normal: true },
  },
  {
    id: 'plaster',
    dir: 'textures/painted_plaster_wall',
    base: 'painted_plaster_wall',
    maps: { roughness: true, normal: false },
  },
  {
    id: 'stone',
    dir: 'textures/marble_01',
    base: 'marble_01',
    maps: { roughness: false, normal: false },
  },
];

export const ENV_MANIFEST = { file: 'env/hotel_room_1k.hdr' };

/** 构建产物内的资产根目录。用 document.baseURI，避免受部署子路径影响。 */
function assetUrl(rel: string): string {
  return new URL(`assets/${rel}`, document.baseURI).href;
}

export interface Assets {
  env: THREE.DataTexture | null;
  tiles: Map<string, TileSet>;
  models: Map<string, THREE.Object3D>;
  report: AssetReport;
}

/**
 * 逐个加载并汇报进度。任何单项失败都只是记账，不抛异常。
 *
 * @param onProgress 已完成项 / 总项数
 */
export async function loadAssets(
  onProgress: (done: number, total: number, label: string) => void,
): Promise<Assets> {
  const issues: AssetIssue[] = [];
  const loadedModels: string[] = [];
  const failedModels: string[] = [];
  const loadedTiles: string[] = [];
  const tiles = new Map<string, TileSet>();
  const models = new Map<string, THREE.Object3D>();
  let env: THREE.DataTexture | null = null;

  const total =
    MODEL_MANIFEST.length +
    TILE_MANIFEST.reduce((n, t) => n + 1 + (t.maps.roughness ? 1 : 0) + (t.maps.normal ? 1 : 0), 0) +
    1;
  let done = 0;
  const step = (label: string): void => {
    done += 1;
    onProgress(done, total, label);
  };

  const gltfLoader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();

  const loadModel = async (id: string, file: string): Promise<void> => {
    try {
      const gltf = await gltfLoader.loadAsync(assetUrl(file));
      const root = gltf.scene;
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      models.set(id, root);
      loadedModels.push(id);
    } catch (err) {
      failedModels.push(id);
      issues.push({ id, kind: 'model', reason: describe(err) });
    } finally {
      step(`模型 ${id}`);
    }
  };

  const loadTileFile = async (
    url: string,
    colorSpace: THREE.ColorSpace,
  ): Promise<THREE.Texture | null> => {
    try {
      const tex = await textureLoader.loadAsync(url);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = colorSpace;
      tex.anisotropy = 4;
      return tex;
    } catch {
      return null;
    }
  };

  const loadTile = async (tile: {
    id: string;
    dir: string;
    base: string;
    maps: { roughness: boolean; normal: boolean };
  }): Promise<void> => {
    const map = await loadTileFile(
      assetUrl(`${tile.dir}/${tile.base}_diff_1k.jpg`),
      THREE.SRGBColorSpace,
    );
    step(`贴图 ${tile.id} · 颜色`);

    let roughnessMap: THREE.Texture | null = null;
    if (tile.maps.roughness) {
      roughnessMap = await loadTileFile(
        assetUrl(`${tile.dir}/${tile.base}_rough_1k.jpg`),
        THREE.NoColorSpace,
      );
      step(`贴图 ${tile.id} · 粗糙度`);
    }

    let normalMap: THREE.Texture | null = null;
    if (tile.maps.normal) {
      normalMap = await loadTileFile(
        assetUrl(`${tile.dir}/${tile.base}_nor_gl_1k.jpg`),
        THREE.NoColorSpace,
      );
      step(`贴图 ${tile.id} · 法线`);
    }

    if (map) {
      tiles.set(tile.id, { map, roughnessMap, normalMap });
      loadedTiles.push(tile.id);
    } else {
      issues.push({
        id: tile.id,
        kind: 'texture',
        reason: '颜色贴图未取到，已退回程序化贴图',
      });
    }
  };

  const modelJobs = MODEL_MANIFEST.map((m) => loadModel(m.id, m.file));
  const tileJobs = TILE_MANIFEST.map((t) => loadTile(t));

  const envJob = (async () => {
    try {
      const tex = await new RGBELoader().loadAsync(assetUrl(ENV_MANIFEST.file));
      tex.mapping = THREE.EquirectangularReflectionMapping;
      env = tex;
    } catch (err) {
      issues.push({ id: 'env', kind: 'env', reason: describe(err) });
    } finally {
      step('环境光');
    }
  })();

  await Promise.all([...modelJobs, ...tileJobs, envJob]);

  return {
    env,
    tiles,
    models,
    report: { loadedModels, failedModels, loadedTiles, envLoaded: env !== null, issues },
  };
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 160);
  return String(err).slice(0, 160);
}
