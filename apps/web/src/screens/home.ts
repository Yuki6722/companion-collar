/**
 * 家居场景屏：把 3D 世界、HUD 与资源清单装配起来。
 *
 * 装配顺序刻意如此：先建 HUD（用户立刻看到骨架与清单），再建 3D（可能失败），
 * 因此即使 WebGL 不可用，**清单仍然完整可用**——这正是「不依赖 3D 也能交付价值」的兜底。
 */
import { cameraHeightOf, summarizeHomeResources } from '@camp/core';
import { DEMO_PROFILE } from '../pet.ts';
import { CAMERA_PRESETS, HOME_RESOURCES, TRAFFIC_PATH } from '../scene/layout.ts';
import { HomeScene } from '../scene/scene.ts';
import { installDebugHandle } from '../scene/selftest.ts';
import type { CatStateId } from '../scene/cat/cat-states.ts';
import { Hud } from '../ui/hud.ts';
import type { PresetSpec } from '../ui/hud.ts';

export function mountHomeScreen(host: HTMLElement): () => void {
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let scene: HomeScene | null = null;

  // ?labels=off 用于文档截图与「只看房间本身」的场景
  const showLabels = new URLSearchParams(window.location.search).get('labels') !== 'off';

  const hud = new Hud(
    {
      onCatState: (id) => scene?.setCatState(id),
      onPreset: (preset) => {
        if (preset.custom) scene?.moveTo(preset.position, preset.target);
        else scene?.preset(preset.id);
      },
      onLabels: (on) => scene?.setLabelsVisible(on),
      onHighlights: (on) => scene?.setHighlightsVisible(on),
      onQuality: (choice) => scene?.setQuality(choice),
    },
    { labels: showLabels },
  );

  // 机位：房间预设 + 一个由档案推导出的项圈高度机位 + 一个实时跟猫的特写
  for (const preset of CAMERA_PRESETS) {
    hud.addPreset({
      id: preset.id,
      label: preset.label,
      position: preset.position,
      target: preset.target,
    });
  }
  hud.addPreset({
    id: 'cat-follow',
    label: '猫特写',
    position: [0, 0, 0],
    target: [0, 0, 0],
    hint: '把相机移到猫身边（实时跟随它当前所在的位置）',
  });
  const collarY = cameraHeightOf(DEMO_PROFILE.heightCm);
  const collarPreset: PresetSpec = {
    id: 'collar',
    label: `项圈相机高度 ${collarY.toFixed(2)} m`,
    position: [0.35, collarY, -1.35],
    target: [0.7, 0.12, -2.6],
    hint: `离地高度由档案肩高（${DEMO_PROFILE.heightCm} cm）推导：肩高 × 0.85。这是机位高度，不是对猫实际视野的复刻。`,
    custom: true,
  };
  hud.addPreset(collarPreset);

  // 资源清单：与 3D 场景同一份布局数据（apps/web/src/scene/layout.ts）
  hud.setChecklist(
    summarizeHomeResources(HOME_RESOURCES, { cats: 1, trafficPath: TRAFFIC_PATH }),
  );

  host.append(hud.root);

  try {
    scene = new HomeScene({
      canvasHost: hud.canvasHost,
      labelHost: hud.labelHost,
      quality: 'auto',
      reducedMotion,
      onProgress: (done, total, label) => hud.setProgress(done, total, label),
      onAssets: (report) => {
        hud.setAssetReport(report);
        hud.finishLoading();
      },
      onStats: (stats) => hud.setStats(stats),
      onFatal: (reason) => hud.showFatal(reason),
    });
    scene.setCatState('calm');
    scene.setLabelsVisible(showLabels);
    scene.start();
    // ?state=agitated 直接以「激动不适」开场：截图与演示需要一次就位，不必等点击
    const initial = new URLSearchParams(window.location.search).get('state');
    if (initial === 'agitated' || initial === 'calm') {
      scene.snapCatState(initial);
      hud.setCatState(initial);
    }
    // ?view=<presetId> 直接切到指定机位（文档截图与演示串场用）；这里要求立即到位
    const view = new URLSearchParams(window.location.search).get('view');
    if (view) scene.preset(view, true);
    // 资产请求可能整体失败（例如直接以 file:// 打开）：超时兜底关闭加载层
    window.setTimeout(() => hud.finishLoading(), 12000);  } catch (err) {
    hud.finishLoading();
    hud.showFatal(
      err instanceof Error
        ? `${err.message}。可以尝试开启浏览器硬件加速，或换用较新版本的 Chrome / Safari。`
        : '浏览器未提供 WebGL 上下文。',
    );
  }

  // ?debug=1 时挂上自检徽章与 window.__scene（不进正常界面）
  const params = new URLSearchParams(window.location.search);
  if (params.has('debug')) {
    installDebugHandle(
      () => {
        const stats = scene?.getStats();
        const report = scene?.getAssetReport();
        const pose = (scene?.cat?.getCurrentPose() ?? {}) as unknown as Record<string, number | boolean>;
        return {
          webgl: scene !== null,
          triangles: stats?.triangles ?? 0,
          drawCalls: stats?.drawCalls ?? 0,
          fps: stats?.fps ?? 0,
          objects: stats?.models ?? 0,
          modelsLoaded: report?.loadedModels.length ?? 0,
          tilesLoaded: report?.loadedTiles.length ?? 0,
          envLoaded: report?.envLoaded ?? false,
          catState: scene?.getCatState() ?? 'none',
          catPose: pose,
          catAt: scene?.catPosition() ?? undefined,
          issues: (report?.issues ?? []).map((i) => `${i.id}: ${i.reason}`),
          slots: {
            sofa: scene?.slotState('sofa') ?? 'none',
            shelf: scene?.slotState('shelf') ?? 'none',
            sideboard: scene?.slotState('sideboard') ?? 'none',
            plant: scene?.slotState('plant') ?? 'none',
            placeholdersLeft: scene?.placeholderCount() ?? 0,
          },
        };
      },
      {
        setCatState: (id) => scene?.setCatState(id as CatStateId),
        preset: (id) => scene?.preset(id),
      },
      {
        reportUrl: params.has('auto') ? '/__selftest' : undefined,
        autoSequence: params.has('auto'),
      },
    );
  }

  return () => {
    scene?.dispose();
    scene = null;
    hud.root.remove();
  };
}
