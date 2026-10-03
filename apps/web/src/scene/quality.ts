/**
 * 画质档位。
 *
 * 为什么需要它：主用户是手机端（见 AGENTS.md），而扫描模型的三角面与阴影开销在低端机上不可控。
 * 所以画质不是「用户偏好」，而是**可自动降级的运行时参数**，并且必须能在无 GPU 信息时给出保守默认值。
 */
import type * as THREE from 'three';

export type QualityId = 'high' | 'medium' | 'low';
export type QualityChoice = 'auto' | QualityId;

export interface QualitySettings {
  /** 设备像素比上限。低端机限制分辨率是最有效的单点优化 */
  pixelRatioCap: number;
  shadows: boolean;
  shadowMapSize: number;
  /** 猫的毛壳层数（0 = 关闭，直接用基础网格） */
  furShells: number;
  /** 是否加载/显示装饰性扫描模型（植物、靠垫、单人椅） */
  decorativeModels: boolean;
  anisotropy: number;
  /** 环境光强度倍率：低端机不开 PMREM 全精度时略降，避免过曝 */
  envIntensity: number;
}

export const QUALITY_PRESETS: Readonly<Record<QualityId, QualitySettings>> = {
  high: {
    pixelRatioCap: 2,
    shadows: true,
    shadowMapSize: 2048,
    furShells: 6,
    decorativeModels: true,
    anisotropy: 8,
    envIntensity: 0.48,
  },
  medium: {
    pixelRatioCap: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    furShells: 2,
    decorativeModels: true,
    anisotropy: 4,
    envIntensity: 0.48,
  },
  low: {
    pixelRatioCap: 1,
    shadows: false,
    shadowMapSize: 512,
    furShells: 0,
    decorativeModels: false,
    anisotropy: 2,
    envIntensity: 0.42,
  },
};

/**
 * 自动判定。刻意保守：拿不到信息就按 medium，宁可少开效果也不要首屏卡顿。
 * 判据顺序：显存/核数 → 屏幕尺寸 → 是否触屏低端。
 */
export function detectQuality(): QualityId {
  if (typeof navigator === 'undefined') return 'medium';
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const smallScreen =
    typeof window !== 'undefined' &&
    Math.min(window.innerWidth, window.innerHeight) < 420;

  if (cores <= 3) return 'low';
  if (memory !== undefined && memory <= 2) return 'low';
  if (cores <= 5 && smallScreen) return 'medium';
  if (cores <= 5) return 'medium';
  if (smallScreen) return 'medium';
  return 'high';
}

export function resolveQuality(choice: QualityChoice): { id: QualityId; settings: QualitySettings } {
  const id = choice === 'auto' ? detectQuality() : choice;
  return { id, settings: QUALITY_PRESETS[id] };
}

/** 按档位给渲染器上参数。切换档位时重复调用即可。 */
export function applyRendererQuality(
  renderer: THREE.WebGLRenderer & { shadowMap: { enabled: boolean; type: THREE.ShadowMapType } },
  settings: QualitySettings,
): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatioCap));
  renderer.shadowMap.enabled = settings.shadows;
}
