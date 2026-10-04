/**
 * 家居场景屏：3D 世界（中间）+ 操作面板（左）+ App 预览（右）。
 *
 * 布局纪律：
 *   - **左栏只放"操作"**：模式、突发演示、机位；图层与画质收进折叠块。
 *   - **右栏只放 App 预览**（iPhone 机模，可收起）：它是产品形态本身。
 *   - **居家资源清单不在这里**：它是一份独立报告，见 `#/resources`。
 *     原来它钉在右栏，把「猫在做什么」和「App 预览」都挤掉了。
 *
 * 数据纪律：场景、事件流、生理读数、App 预览**共用同一份会话**。
 * 突发演示因此不再由场景自己重建时间线，而是由本文件重建**带注入突发的会话**后交给场景——
 * 否则会出现"手机上的读数"与"猫正在做的事"对不上的两条时间线。
 */
import { cameraHeightOf } from '@camp/core';
import { INCIDENT_KINDS } from '@camp/core';
import type { CatIncidentKind } from '@camp/core';
import { generateSession } from '@camp/simulator';
import type { ScenarioId } from '@camp/simulator';
import type { Session } from '@camp/core';
import { DEMO_PROFILE } from '../pet.ts';
import { CAMERA_PRESETS } from '../scene/layout.ts';
import { HomeScene } from '../scene/scene.ts';
import { installDebugHandle } from '../scene/selftest.ts';
import type { CatStateId } from '../scene/cat/cat-states.ts';
import { AppPhone } from '../ui/app-phone.ts';
import { Hud } from '../ui/hud.ts';
import type { PresetSpec } from '../ui/hud.ts';

/** 会话长度与种子：场景、事件流、读数共用一份，改这里就全改。 */
const SESSION_MINUTES = 24 * 60;
const SESSION_SEED = 42;

export function mountHomeScreen(host: HTMLElement): () => void {
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let scene: HomeScene | null = null;
  let phone: AppPhone | null = null;
  /** 会话是这一页的**单一数据源**：行为时间线、事件流、生理读数都来自它。 */
  let session: Session;
  /** HUD 面板的节流时间戳（行为运行时是逐帧推送的，面板按 1 秒刷新即可） */
  let lastHudUpdate = 0;

  const params0 = new URLSearchParams(window.location.search);

  // ?labels=off 用于文档截图与「只看房间本身」的场景
  const showLabels = params0.get('labels') !== 'off';
  // 猫头顶的状态标签默认开启（它承载「它现在在做什么」这件主线信息）；
  // ?status=off 可关掉——截图时经常需要干净画面
  const showStatus = params0.get('status') !== 'off';
  // 项圈硬件默认**开启**：它是产品的核心形态（猫脖子上戴着带传感器的项圈），
  // 不该需要额外参数才看得到。`?collar=off` 可隐藏，`?collar=zone` 额外标出触须无干涉区
  // （讲解「硬件不许进哪个体积」时用）。
  const collarParam = params0.get('collar');
  const showCollar = collarParam !== 'off';
  const showWhiskerZone = collarParam === 'zone';
  // App 预览默认展开；?app=off 收起，窄屏也默认收起（见下方）。
  const narrow = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 900px)').matches : false;
  const appCollapsed = params0.get('app') === 'off' || narrow;
  // ?scenario=vet-visit 直接以诊室情境开场（用来演示"读数变了、真值没变"）。
  const scenarioParam = params0.get('scenario');
  const scenario: ScenarioId = scenarioParam === 'vet-visit' ? 'vet-visit' : 'living-room-day';
  // ?incident=<kind> 开场就注入一次突发：注入发生在会话里，所以画面与读数天然一致。
  const openingIncident = params0.get('incident');
  const openingKind =
    openingIncident && INCIDENT_KINDS.includes(openingIncident as CatIncidentKind)
      ? (openingIncident as CatIncidentKind)
      : null;

  /** 生成会话。`injectIncidents` 是唯一注入方式——真值与读数都从这条时间线派生。 */
  function buildSession(injectIncidents: Array<{ atS: number; kind: CatIncidentKind }> = []): Session {
    return generateSession({
      profile: DEMO_PROFILE,
      seed: SESSION_SEED,
      durationMin: SESSION_MINUTES,
      scenario,
      behavior: { seed: SESSION_SEED, timeScale: 20, injectIncidents },
    });
  }

  // 开场注入放在演示开始后不久的**会话时刻**，这样一进场就看得到，且时间线只有一条。
  session = buildSession(openingKind ? [{ atS: 20, kind: openingKind }] : []);

  const hud = new Hud(
    {
      onCatState: (id) => {
        // 手动档位意味着退出自主行为——否则行为运行时会立刻把位置/姿势覆盖回去
        scene?.setManualCat();
        hud.setCatMode('manual');
        scene?.setCatState(id);
      },
      onAutoCat: () => {
        scene?.setAutoCat();
        hud.setCatMode('auto');
        hud.setIncidentStatus(null);
      },
      onManualCat: () => {
        scene?.setManualCat();
        hud.setCatMode('manual');
      },
      onIncident: (kind) => {
        // 唯一时间线：重建**带注入突发的会话**，把它的时间线交给场景，
        // 再把新会话交给 App 预览。三者从此不可能对不上。
        scene?.setAutoCat();
        hud.setCatMode('auto');
        const atS = Math.max(1, scene?.simTimeS() ?? 0);
        session = buildSession([{ atS, kind }]);
        if (session.behaviorTimeline) {
          scene?.applyTimeline(session.behaviorTimeline, Math.max(0, atS - 1));
        }
        phone?.setSession(session, false);
        hud.setIncidentStatus(kind);
      },
      onPreset: (preset) => {
        if (preset.custom) scene?.moveTo(preset.position, preset.target);
        else scene?.preset(preset.id);
      },
      onLabels: (on) => scene?.setLabelsVisible(on),
      onStatusLabel: (on) => scene?.setStatusVisible(on),
      onHighlights: (on) => scene?.setHighlightsVisible(on),
      onCollar: (on) => scene?.setCollarVisible(on),
      onWhiskerZone: (on) => scene?.setWhiskerZoneVisible(on),
      onQuality: (choice) => scene?.setQuality(choice),
    },
    {
      labels: showLabels,
      status: showStatus,
      collar: showCollar,
      whiskerZone: showWhiskerZone,
    },
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

  host.append(hud.root);

  // App 预览：右侧栏的 iPhone 机模。它是**产品形态本身**，所以放在场景旁边实时跟着跑。
  phone = new AppPhone({ profile: DEMO_PROFILE, session, collapsed: appCollapsed });
  hud.root.append(phone.root);

  try {
    scene = new HomeScene({
      canvasHost: hud.canvasHost,
      labelHost: hud.labelHost,
      quality: 'auto',
      reducedMotion,
      // ⚠️ 把**会话里的时间线**交给场景，而不是让场景自己再生成一条。
      // 这条纪律让「画面」「事件流」「手机读数」三者共用同一个时间轴；踩过的坑见 stage2 §6.7。
      ...(session.behaviorTimeline ? { behaviorTimeline: session.behaviorTimeline } : {}),
      onProgress: (done, total, label) => hud.setProgress(done, total, label),
      onAssets: (report) => {
        hud.setAssetReport(report);
        hud.finishLoading();
      },
      onStats: (stats) => hud.setStats(stats),
      onFatal: (reason) => hud.showFatal(reason),
      onBehaviorStatus: (status) => {
        // 行为运行时**逐帧**推送（因为 locomoting 段短到 0.2 秒，节流会让它显示不出来）。
        // 两个消费方各自节流：HUD 面板按 1 秒，App 预览内部按 0.5 秒。
        phone?.update(status);
        const wall = performance.now();
        if (wall - lastHudUpdate < 1000) return;
        lastHudUpdate = wall;
        hud.setBehaviorStatus(status);
        hud.setIncidentStatus(status.incident);
      },
    });
    scene.setLabelsVisible(showLabels);
    scene.setCollarVisible(showCollar);
    scene.setWhiskerZoneVisible(showWhiskerZone);
    scene.start();
    // 默认进入自主行为；?mode=manual 则保持第一阶段的手动演示档位
    const startManual = params0.get('mode') === 'manual' || params0.has('behavior-off');
    if (startManual) {
      scene.setManualCat();
      hud.setCatMode('manual');
    } else {
      hud.setCatMode('auto');
      // ?incident=<kind> 的注入**已经在会话里**（见 buildSession），这里只同步标签——
      // 不再走 `scene.triggerIncident()`，否则场景会另建一条时间线，读数立刻对不上。
      if (openingKind) hud.setIncidentStatus(openingKind);
    }
    // ?state=agitated 直接以「激动不适」开场：截图与演示需要一次就位，不必等点击。
    // 这会同时切到手动档位（手动档位与自主行为互斥）。
    const initial = params0.get('state');
    if (initial === 'agitated' || initial === 'calm') {
      scene.setManualCat();
      hud.setCatMode('manual');
      scene.snapCatState(initial);
      hud.setCatState(initial);
    }
    // ?view=<presetId> 直接切到指定机位（文档截图与演示串场用）；这里要求立即到位
    const view = params0.get('view');
    if (view) scene.preset(view, true);
    // 资产请求可能整体失败（例如直接以 file:// 打开）：超时兜底关闭加载层
    window.setTimeout(() => hud.finishLoading(), 12000);
  } catch (err) {
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
        const behavior = scene?.behaviorStatus();
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
          catMode: scene?.isAutoCat() ? 'auto' : 'manual',
          catPose: pose,
          catAt: scene?.catPosition() ?? undefined,
          // 行为层事实：断言「猫真的在按时间线活动」而不是只换姿势
          catActivity: behavior?.activity ?? 'none',
          catPosture: behavior?.posture ?? 'none',
          catAnchor: behavior?.anchorId ?? 'none',
          catHour: behavior ? Number(behavior.hourOfDay.toFixed(2)) : 0,
          catIncident: behavior?.incident ?? null,
          catLabel: scene?.catLabelText() ?? '',
          catSegmentElapsedS: behavior?.segmentElapsedS ?? 0,
          catSegmentTotalS: behavior?.segmentRealDurationS ?? 0,
          catMotion: scene?.catIncidentMotion() ?? undefined,
          // 本轮：写实蒙皮模型的自检事实（加载状态 / 骨骼数 / 步态权重 / 四爪坐标）。
          // 没有它，「真的在迈步」与「只移动位置」在无头环境里无法区分。
          cat: scene?.catVariantState(),
          // 第三阶段：项圈硬件与触须无干涉区的显示状态（形态方案的可断言事实）
          collar: scene?.collarState() ?? undefined,
          // 第四阶段（本页布局）：App 预览的显示状态与它此刻显示的内容。
          // 不记这些，就无法自动发现「手机没挂上」或「手机上的读数不跟着走」。
          app: phone?.snapshot() ?? undefined,
          issues: (report?.issues ?? []).map((i) => `${i.id}: ${i.reason}`),
          slots: {
            sideboard: scene?.slotState('sideboard') ?? 'none',
            plant: scene?.slotState('plant') ?? 'none',
            placeholdersLeft: scene?.placeholderCount() ?? 0,
          },
        };
      },
      {
        // 自检动作：切档位、切机位、触发突发
        setCatState: (id) => {
          scene?.setManualCat();
          hud.setCatMode('manual');
          scene?.setCatState(id as CatStateId);
        },
        setAutoCat: () => {
          scene?.setAutoCat();
          hud.setCatMode('auto');
        },
        incident: (kind) => {
          // 与 HUD 按钮同一条路径：重建带注入突发的会话，而不是让场景另建时间线。
          scene?.setAutoCat();
          const atS = Math.max(1, scene?.simTimeS() ?? 0);
          session = buildSession([{ atS, kind: kind as CatIncidentKind }]);
          if (session.behaviorTimeline) {
            scene?.applyTimeline(session.behaviorTimeline, Math.max(0, atS - 1));
          }
          phone?.setSession(session, false);
          hud.setIncidentStatus(kind as CatIncidentKind);
        },
        preset: (id) => scene?.preset(id),
        // 自检动作：`on` 只开硬件，`zone` 连触须无干涉区一起开，`off` 关闭
        collar: (arg) => {
          scene?.setCollarVisible(arg !== 'off');
          scene?.setWhiskerZoneVisible(arg === 'zone');
        },
        // 自检动作：App 预览的收起/展开与页签切换（`live`/`events`/`drift`/`profile`）
        app: (arg) => {
          if (arg === 'off') phone?.setCollapsed(true);
          else if (arg === 'on') phone?.setCollapsed(false);
          else phone?.selectTab(arg);
        },
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
