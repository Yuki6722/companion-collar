/**
 * 狗版生活场景屏：3D 世界（中间）+ 柴犬的行为与场景清单（左）。
 *
 * 本页的**单一数据源是行为时间线**：它由 `@camp/core` 的 `buildDogTimeline()` 生成，
 * 交给场景的运行时去推进「走到哪、朝向哪、摆什么姿势」。
 * 突发演示走同一条路：由本文件**重建带注入的时间线**再交给场景（而不是让场景内部另建一条）——
 * 这是猫版踩过的坑（画面与数据变成两条时间线），这里从一开始就按同一条纪律写。
 *
 * URL 参数（都用于文档截图与演示串场）：
 *   `?view=<机位 id>`   以指定机位开场
 *   `?labels=off`       关掉标签
 *   `?highlight=on`     打开狗的用品高亮
 *   `?garden=off`       只留室内
 *   `?facade=off`       关掉外墙皮 → 回到娃娃屋剖视
 *   `?collar=off`       关掉项圈
 *   `?paused=1`         以暂停开场（看静态姿势）
 *   `?incident=seizure` 开场就注入一次突发
 *   `?activity=water-play` 开场就手动触发一次院子里的活动（走过去、然后做这件事）
 *   `?probe=<ms>`       位移探针：记录这段时间的逐帧位置（"不瞬移"的实跑证据）
 *   `?debug=1`          挂上自检徽章与 `window.__dogScene`
 */
import { DOG_INCIDENT_KINDS } from '@camp/core';
import type { DogIncidentKind, PetProfile, Session } from '@camp/core';
import { generateSession } from '@camp/simulator';
import { DEMO_DOG_PROFILE } from '../pet.ts';
import { DogHomeScene } from '../scene/dog-scene.ts';
import { DOG_MANUAL_ACTIVITY_IDS } from '../scene/dog/dog-behavior.ts';
import type { DogManualActivityId } from '../scene/dog/dog-behavior.ts';
import { CAMERA_PRESETS } from '../scene/dog/layout-dog.ts';
import { AppPhone } from '../ui/app-phone.ts';
import { DOG_APP_VOCAB } from '../ui/app-vocab.ts';
import { DogHud } from '../ui/dog-hud.ts';
import { el } from '../ui/dom.ts';

/** 该活动是不是"可手动触发"的那四个之一（窄化给 HUD 的状态行用，`noUncheckedIndexedAccess` 友好）。 */
function isManualActivity(id: string): id is DogManualActivityId {
  return (DOG_MANUAL_ACTIVITY_IDS as readonly string[]).includes(id);
}

/** 会话长度与种子：场景、事件流、读数共用一份，改这里就全改。 */
const SESSION_MINUTES = 24 * 60;
const SESSION_SEED = 715;
const TIME_SCALE = 12;

export function mountDogScreen(host: HTMLElement): () => void {
  const params = new URLSearchParams(window.location.search);
  const showLabels = params.get('labels') !== 'off';
  const showHighlights = params.get('highlight') === 'on';
  const showGarden = params.get('garden') !== 'off';
  const showFacade = params.get('facade') !== 'off';
  const showCollar = params.get('collar') !== 'off';
  const openingIncident = params.get('incident');
  const openingKind =
    openingIncident && DOG_INCIDENT_KINDS.includes(openingIncident as DogIncidentKind)
      ? (openingIncident as DogIncidentKind)
      : null;
  // App 预览默认展开；?app=off 收起，窄屏也默认收起（与猫版同一条纪律）
  const narrow =
    typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 900px)').matches : false;
  const appCollapsed = params.get('app') === 'off' || narrow;

  let scene: DogHomeScene | null = null;
  let phone: AppPhone | null = null;
  /**
   * **会话是这一页的单一数据源**：行为时间线、事件流、生理读数都来自它。
   *
   * 与猫版同一条纪律（`docs/design/07`）：场景**不再自己生成时间线**，
   * 而是消费会话里的 `dogBehaviorTimeline`。否则「画面」「事件流」「手机读数」
   * 会变成三条互不相干的时间轴 —— 手机上显示的读数就与狗正在做的事对不上。
   */
  let session: Session;
  /** 当前档案。App 档案页改品种/年龄会改它，并据此**重建会话**。 */
  let profile: PetProfile = DEMO_DOG_PROFILE;
  let lastHudUpdate = 0;

  /** 生成会话。`injectIncidents` 是**唯一**的注入方式——真值与读数都从这条时间线派生。 */
  function buildSession(
    injectIncidents: Array<{ atS: number; kind: DogIncidentKind }> = [],
    forProfile: PetProfile = profile,
  ): Session {
    return generateSession({
      profile: forProfile,
      seed: SESSION_SEED,
      durationMin: SESSION_MINUTES,
      scenario: 'living-room-day',
      behavior: { seed: SESSION_SEED, timeScale: TIME_SCALE, injectIncidents },
    });
  }

  // 开场注入放在演示开始后不久，这样一进场就看得到，且时间线只有一条
  session = buildSession(openingKind ? [{ atS: 20, kind: openingKind }] : []);

  const hud = new DogHud(
    {
      onPreset: (preset) => {
        if (preset.id === 'custom') scene?.moveTo(preset.position, preset.target);
        else scene?.preset(preset.id);
      },
      onLabels: (on) => scene?.setLabelsVisible(on),
      onHighlights: (on) => scene?.setHighlightsVisible(on),
      onGarden: (on) => scene?.setGardenVisible(on),
      onFacade: (on) => scene?.setFacadeVisible(on),
      onQuality: (choice) => scene?.setQuality(choice),
      onResumeBehavior: () => {
        scene?.setBehaviorPaused(false);
        hud.setBehaviorMode('auto');
        hud.setIncidentStatus(null);
        hud.setGoDoStatus(null);
      },
      onPauseBehavior: () => {
        scene?.setBehaviorPaused(true);
        hud.setBehaviorMode('paused');
      },
      onIncident: (kind) => {
        // 唯一时间线：由本文件重建带注入的时间线后交给场景，再把新会话交给 App。
        // 起点给 `atS` 而不是 `atS - 1`：突发段恰好从 atS 开始，从这里接上去
        // 狗一帧都不会移动（原地发作，见 design 11 §5.1）。
        scene?.setBehaviorPaused(false);
        hud.setBehaviorMode('auto');
        const atS = Math.max(1, scene?.simTimeS() ?? 0);
        session = buildSession([{ atS, kind }]);
        if (session.dogBehaviorTimeline) scene?.applyTimeline(session.dogBehaviorTimeline, atS);
        phone?.setSession(session);
        hud.setIncidentStatus(kind);
      },
      /**
       * 院子里的活动：**只是让狗现在去做这件事**。
       *
       * ⚠️ 这里**刻意什么都不重建** —— 不 `buildSession`、不 `applyTimeline`、不 `setSession`。
       *   与上面 `onIncident` 的差别是**结构性**的，不是省事：
       *   突发注入必须重建时间线（它要改动区间的长度分配），而手动触发活动只是运行时的一次
       *   **改道**：路线与"走过去之后做什么"全部在运行时合成（见 `dog-behavior.ts` 的 `goDo`），
       *   时间线一个字节都没有变。所以：
       *     · `session` 这个对象**没有被替换**（App 的事件流、健康读数、档案页拿到的还是同一个）；
       *     · `phone` 也没有 `setSession` —— 手机上不会闪一下、读数不会重算；
       *     · 画面与 App 依然共用同一条时间轴（`scene.dogTimeline` 也没换）。
       *   这正是"手动做一件事"与"注入一次突发"在数据层的区别。
       */
      onActivity: (activity) => {
        scene?.setBehaviorPaused(false);
        hud.setBehaviorMode('auto');
        // 返回值决定反馈文案：false = 该活动在当前锚点表下没有可用锚点，什么都没发生
        const ok = scene?.goDo(activity) ?? false;
        hud.setGoDoStatus(ok ? activity : null);
      },
      onCollar: (on) => scene?.setCollarVisible(on),
    },
    {
      labels: showLabels,
      highlights: showHighlights,
      garden: showGarden,
      facade: showFacade,
      collar: showCollar,
    },
  );

  for (const preset of CAMERA_PRESETS) {
    hud.addPreset({
      id: preset.id,
      label: preset.label,
      position: preset.position,
      target: preset.target,
      ...(preset.hint !== undefined ? { hint: preset.hint } : {}),
    });
  }
  /**
   * 两个**动态机位**：坐标每帧才算得出来，所以不放进静态机位表 `CAMERA_PRESETS`。
   * 位置/目标位传 [0,0,0] —— 场景侧收到这两个 id 会切进"跟随模式"，不看这两个数。
   */
  hud.addPreset({
    id: 'dog-follow',
    label: '狗特写',
    position: [0, 0, 0],
    target: [0, 0, 0],
    hint: '相机挂在柴犬的斜后方，跟着它走、跟着它转（按当前朝向每帧重算，所以任何位置都不会钻进家具里）。',
  });
  hud.addPreset({
    id: 'dog-cam',
    label: '狗视角（项圈相机）',
    position: [0, 0, 0],
    target: [0, 0, 0],
    hint: '把相机放到项圈前端那颗镜头上，看到的就是 App「实时」页那一格。画面里看不到狗自己——真实项圈相机也拍不到自己的后脑勺。这是环境影像，不是狗眼中的世界。',
  });

  host.append(hud.root);

  /** App 预览机模：与猫版**同一个组件**，只是注入狗的词表（品种/锚点/标签/边界句）。 */
  phone = new AppPhone({
    profile,
    session,
    vocab: DOG_APP_VOCAB,
    collapsed: appCollapsed,
    // 「实时」页要一块画布显示项圈相机画面；切走时传 null 让场景停止渲染
    onPovCanvas: (canvas) => scene?.setPovCanvas(canvas),
    onProfileChange: (next) => {
      // 档案驱动的是"这只狗自己的基线"：换品种/年龄 → 重建整段会话（同一种子）
      profile = next;
      const atS = Math.max(0, scene?.simTimeS() ?? 0);
      session = buildSession([], next);
      if (session.dogBehaviorTimeline) scene?.applyTimeline(session.dogBehaviorTimeline, atS);
      phone?.setSession(session, next);
    },
  });
  hud.root.append(phone.root);

  try {
    scene = new DogHomeScene({
      canvasHost: hud.canvasHost,
      labelHost: hud.labelHost,
      quality: 'auto',
      reducedMotion:
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      // ★ 画面与 App 共用**同一条**行为时间线（会话里的那一条）
      ...(session.dogBehaviorTimeline ? { behaviorTimeline: session.dogBehaviorTimeline } : {}),
      onProgress: (done, total, label) => hud.setProgress(done, total, label),
      onAssets: (report) => {
        hud.setAssetReport(report);
        hud.finishLoading();
      },
      onStats: (stats) => {
        hud.setStats(stats);
        hud.setStructure(scene?.structure() ?? []);
      },
      onFatal: (reason) => hud.showFatal(reason),
      onBehaviorStatus: (status) => {
        // App 自己按 0.5 s 节流（实时页要跟着演示时钟走），所以每帧都喂给它
        phone?.update(status);
        // 左栏面板按 1 秒刷新即可（段内进展是秒级的）
        const wall = performance.now();
        if (wall - lastHudUpdate < 1000) return;
        lastHudUpdate = wall;
        hud.setBehaviorStatus(status);
        hud.setIncidentStatus(status.incident);
        // 手动活动那一段跑完（或被打断）之后，运行时会把 `manual` 变回 false ——
        // 「正在执行」的反馈就此清掉，而不是一直挂在面板上（见 `DogBehaviorStatus.manual`）。
        hud.setGoDoStatus(status.manual && isManualActivity(status.activity) ? status.activity : null);
      },
    });
    scene.setLabelsVisible(showLabels);
    scene.setHighlightsVisible(showHighlights);
    scene.setGardenVisible(showGarden);
    scene.setFacadeVisible(showFacade);
    scene.setCollarVisible(showCollar);
    scene.start();
    // 场景就绪后再绑一次项圈相机画布：首帧之前 App 已经把画布建好了
    phone.rebindPovCanvas(true);
    hud.setBehaviorMode('auto');
    if (openingKind) hud.setIncidentStatus(openingKind);
    // 开场就手动触发一次活动（`?activity=water-play`）：与点击按钮走同一条路 ——
    // 不重建会话，只是运行时改道。
    const openingActivity = params.get('activity');
    if (openingActivity && isManualActivity(openingActivity) && scene.goDo(openingActivity)) {
      hud.setGoDoStatus(openingActivity);
    }

    if (params.get('paused') === '1') {
      scene.setBehaviorPaused(true);
      hud.setBehaviorMode('paused');
    }
    const view = params.get('view');
    if (view) scene.preset(view, true);
    const probeMs = params.get('probe');
    if (probeMs) scene.startMotionProbe(Number(probeMs) / 1000);

    // 资产请求可能整体失败（例如直接以 file:// 打开）：超时兜底关闭加载层
    window.setTimeout(() => hud.finishLoading(), 12000);
  } catch (err) {
    hud.finishLoading();
    hud.showFatal(
      err instanceof Error
        ? `${err.message}。可以尝试开启浏览器加速，或换用较新版本的 Chrome / Safari。`
        : '浏览器未提供 WebGL 上下文。',
    );
  }

  if (params.has('debug')) installDogDebugBadge(() => scene);

  return () => {
    // 先解绑 App 的项圈相机画布，再销毁场景：否则场景还握着一块已经不在 DOM 里的画布
    phone?.dispose();
    phone = null;
    scene?.dispose();
    scene = null;
    hud.root.remove();
  };
}

/**
 * 自检徽章（`?debug=1`）。
 *
 * 与猫版 `installDebugHandle` 同样只做一件事：把渲染层与行为层的**可断言事实**落成文本，
 * 供人在普通终端里跑一次浏览器时读取（沙箱内不允许 agent 启动浏览器，见 AGENTS.md §6）。
 * 这一版比"只有场景"时多了三类关键字段：**柴犬的姿态参数**、**所在锚点与活动**、
 * 以及**位移探针**（"不瞬移 / 不倒着走"的实跑证据）。
 */
function installDogDebugBadge(getScene: () => DogHomeScene | null): void {
  const badge = el('div', {
    class: 'selftest',
    attrs: { id: 'dog-scene-selftest', role: 'status', 'aria-live': 'polite' },
  });
  document.body.append(badge);

  const snapshot = (): Record<string, unknown> => {
    const scene = getScene();
    const stats = scene?.getStats();
    const report = scene?.getAssetReport();
    const structure = scene?.structure() ?? [];
    const meshTotal = structure.reduce((n, r) => n + r.meshes, 0);
    const behavior = scene?.behaviorStatus();
    const pose = scene?.dogPose();
    return {
      webgl: scene !== null,
      triangles: stats?.triangles ?? 0,
      drawCalls: stats?.drawCalls ?? 0,
      fps: stats?.fps ?? 0,
      modelsLoaded: report?.loadedModels.length ?? 0,
      tilesLoaded: report?.loadedTiles.length ?? 0,
      envLoaded: report?.envLoaded ?? false,
      issues: (report?.issues ?? []).map((i) => `${i.id}: ${i.reason}`),
      structure,
      meshTotal,
      labels: scene?.isLabelsVisible() ?? false,
      highlights: scene?.isHighlightsVisible() ?? false,
      garden: scene?.isGardenVisible() ?? false,
      facade: scene?.isFacadeVisible() ?? false,
      collar: scene?.isCollarVisible() ?? false,
      collarParts: scene?.collarPartCount() ?? 0,
      placeholdersLeft: scene?.placeholderCount() ?? 0,
      // ---- 柴犬
      dogAt: scene?.dogPosition() ?? undefined,
      dogActivity: behavior?.activity ?? 'none',
      dogActivityLabel: behavior?.activityLabel ?? '',
      dogAnchor: behavior?.anchorId ?? 'none',
      dogAnchorLabel: behavior?.anchorLabel ?? '',
      dogHour: behavior ? Number(behavior.hourOfDay.toFixed(2)) : 0,
      dogIncident: behavior?.incident ?? null,
      /** 这一段是不是手动触发的那四个活动之一（"正在执行"的反馈就靠它清掉） */
      dogManual: behavior?.manual ?? false,
      /** 手动触发过的总次数（`?debug=1` 徽章里一行看出按钮接没接上） */
      dogManualCount: behavior?.manualCount ?? 0,
      /** 最近一次手动触发的实测结果：走了多远、到没到（与 `dogIncidentDrift` 配成一对） */
      dogLastGoDo: scene?.lastGoDo() ?? null,
      dogMoving: behavior?.moving ?? false,
      dogSpeed: behavior?.speedMps ?? 0,
      dogSegElapsed: behavior?.segmentElapsedS ?? 0,
      dogSegTotal: behavior?.segmentRealDurationS ?? 0,
      dogPaused: scene?.isBehaviorPaused() ?? true,
      dogPose: pose?.pose ?? 'none',
      dogBodyHeight: pose?.bodyHeight ?? 0,
      dogGaitPhase: pose?.gaitPhase ?? 0,
      dogJoints: pose?.joints ?? {},
      dogIncidentMotion: scene?.incidentMotion() ?? null,
      dogProbe: scene?.motionProbe() ?? null,
      dogMetrics: scene?.dogMetrics ?? null,
      /** 主相机是否在跟随：none / dog（特写）/ pov（项圈相机） */
      dogCamFollow: scene?.cameraFollow() ?? 'none',
      /** 地上还剩几团呕吐物（验证"吐出 → 10 秒后消失"） */
      vomitCount: scene?.vomitCount() ?? 0,
      /** 最近一次突发期间的位移（应恒为 0.000：突发原地发生） */
      dogIncidentDrift: scene?.incidentDrift() ?? null,
      slots: {
        sideboard: scene?.slotState('sideboard') ?? 'none',
        coffeeTable: scene?.slotState('coffeeTable') ?? 'none',
        plant: scene?.slotState('plant') ?? 'none',
        pendant: scene?.slotState('pendant') ?? 'none',
      },
    };
  };

  const render = (): Record<string, unknown> => {
    const snap = snapshot();
    badge.textContent = summarize(snap);
    badge.dataset.ok =
      snap.webgl && (snap.triangles as number) > 0 && (snap.meshTotal as number) > 200 ? 'true' : 'false';
    return snap;
  };

  (window as unknown as { __dogScene?: unknown }).__dogScene = {
    snapshot: render,
    incident: (kind: string) => getScene()?.triggerIncident(kind as DogIncidentKind),
    /** 手动触发一次活动（与 `incident` 的区别：这一条**不重建会话**，见 `onActivity` 的说明）。 */
    goDo: (id: string) => getScene()?.goDo(id as DogManualActivityId),
    pause: () => getScene()?.setBehaviorPaused(true),
    resume: () => getScene()?.setBehaviorPaused(false),
    probe: (ms: string) => getScene()?.startMotionProbe(Number(ms) / 1000),
    collar: (arg: string) => getScene()?.setCollarVisible(arg !== 'off'),
    preset: (id: string) => getScene()?.preset(id),
  };
  render();
  window.setInterval(render, 1000);
}

/** 单行、稳定、便于 dump-dom 断言：键值用 `;` 分隔。 */
function summarize(snap: Record<string, unknown>): string {
  const structure = (snap.structure as Array<{ name: string; meshes: number }>) ?? [];
  const probe = snap.dogProbe as
    | { frames: number; maxSpeedMps: number; minForwardCos: number; distinctPositions: number; movedMeters: number }
    | null;
  const motion = snap.dogIncidentMotion as Record<string, number> | null;
  const joints = snap.dogJoints as Record<string, number>;
  const metrics = snap.dogMetrics as { shoulderHeightM: number; bodyLengthM: number; headTopY: number } | null;
  return [
    'dogselftest',
    `webgl=${snap.webgl ? 1 : 0}`,
    `tris=${snap.triangles}`,
    `draws=${snap.drawCalls}`,
    `fps=${snap.fps}`,
    `models=${snap.modelsLoaded}`,
    `tiles=${snap.tilesLoaded}`,
    `env=${snap.envLoaded ? 1 : 0}`,
    `meshes=${snap.meshTotal}`,
    ...structure.map((r) => `${r.name}=${r.meshes}`),
    `dogAct=${snap.dogActivity}`,
    `dogActLabel=${snap.dogActivityLabel}`,
    `dogAnchor=${snap.dogAnchor}`,
    `dogHour=${Number(snap.dogHour ?? 0).toFixed(2)}`,
    `dogIncident=${snap.dogIncident ?? 'none'}`,
    `dogManual=${snap.dogManual ? 1 : 0}`,
    `dogManualCount=${snap.dogManualCount ?? 0}`,
    `dogGoDoMoved=${Number((snap.dogLastGoDo as { driftM: number } | null)?.driftM ?? -1).toFixed(2)}`,
    `dogGoDoArrived=${(snap.dogLastGoDo as { arrived: boolean } | null) ? ((snap.dogLastGoDo as { arrived: boolean }).arrived ? 1 : 0) : 'none'}`,
    `dogGoDoAnchor=${(snap.dogLastGoDo as { anchorId: string } | null)?.anchorId ?? 'none'}`,
    `dogPose=${snap.dogPose}`,
    `dogBodyY=${Number(snap.dogBodyHeight ?? 0).toFixed(3)}`,
    `dogGait=${Number(snap.dogGaitPhase ?? 0).toFixed(2)}`,
    `dogMoving=${snap.dogMoving ? 1 : 0}`,
    `dogSpeed=${Number(snap.dogSpeed ?? 0).toFixed(2)}`,
    `dogSegElapsed=${Number(snap.dogSegElapsed ?? 0).toFixed(0)}`,
    `dogSegTotal=${Number(snap.dogSegTotal ?? 0).toFixed(0)}`,
    `dogPaused=${snap.dogPaused ? 1 : 0}`,
    `dogAt=${((snap.dogAt as number[]) ?? [0, 0, 0]).join('/')}`,
    `dogTremor=${Number(motion?.tremorAmp ?? 0).toFixed(3)}`,
    `dogTremorRoll=${Number(motion?.tremorRollAmp ?? 0).toFixed(3)}`,
    `dogVomitPhase=${Number(motion?.phaseIndex ?? -1)}`,
    `dogVomitOnGround=${snap.vomitCount}`,
    `dogCamFollow=${snap.dogCamFollow}`,
    `dogIncidentDrift=${(snap.dogIncidentDrift as { driftM: number } | null)?.driftM ?? 'none'}`,
    `dogJaw=${Number(joints.jaw ?? 0).toFixed(3)}`,
    `dogShoulder=${Number(metrics?.shoulderHeightM ?? 0).toFixed(3)}`,
    `dogHeadTop=${Number(metrics?.headTopY ?? 0).toFixed(3)}`,
    `collar=${snap.collar ? 1 : 0}`,
    `collarParts=${snap.collarParts}`,
    `probeFrames=${probe?.frames ?? 0}`,
    `probeMaxSpeed=${probe?.maxSpeedMps ?? 'none'}`,
    `probeMinCos=${probe?.minForwardCos ?? 'none'}`,
    `probeDistinct=${probe?.distinctPositions ?? 'none'}`,
    `probeMoved=${probe?.movedMeters ?? 'none'}`,
    `labels=${snap.labels ? 1 : 0}`,
    `garden=${snap.garden ? 1 : 0}`,
    `facade=${snap.facade ? 1 : 0}`,
    `placeholders=${snap.placeholdersLeft}`,
    `issues=${(snap.issues as string[]).length}`,
  ].join('; ');
}
