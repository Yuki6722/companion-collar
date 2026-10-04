/**
 * 场景装配与生命周期。
 *
 * 职责边界：本文件只管「3D 世界怎么搭、怎么渲染」，不管 UI——HUD 通过回调接收
 * 进度/资产报告/统计，猫的状态通过 `setCatState()` 出入。这样 `screens/home.ts`
 * 不需要知道 three 的存在，HUD 也能独立测试。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MODEL_PLACEMENTS, buildFurniture } from './build-furniture.ts';
import { buildCatGear } from './build-cat-gear.ts';
import { buildKitchen } from './build-kitchen.ts';
import { buildRoom } from './build-room.ts';
import { ENV_MANIFEST, MODEL_MANIFEST, loadAssets } from './assets.ts';
import type { AssetReport } from './assets.ts';
import { buildCat } from './cat/cat-model.ts';
import type { CatRig } from './cat/cat-model.ts';
import { CatController } from './cat/cat-controller.ts';
import { CatBehaviorRuntime } from './cat/cat-behavior.ts';
import type { BehaviorStatus } from './cat/cat-behavior.ts';
import { CatStatusLabel } from './cat/cat-status-label.ts';
import { CAT_ANCHOR_SPECS } from './cat/anchor-map.ts';
import { OPERATIVE_CONSTANTS, buildBehaviorTimeline } from '@camp/core';
import type { CatBehaviorTimeline, CatIncidentKind } from '@camp/core';
import type { CatStateId } from './cat/cat-states.ts';
import { HotspotLayer } from './hotspots.ts';
import type { Hotspot } from './hotspots.ts';
import { CAMERA_PRESETS, CAT_ANCHORS, HOME_RESOURCES, ROOM } from './layout.ts';
import { MaterialLibrary } from './materials.ts';
import { resolveQuality } from './quality.ts';
import type { QualityChoice, QualitySettings } from './quality.ts';
import { skyTexture } from './textures.ts';
import { fitModel } from './util.ts';

/** 项圈相机画面的刷新率（帧/秒）。见 `updatePovFeed` 的取舍说明。 */
const POV_FPS = 8;
/** 项圈相机的视野（度）。比人眼常规镜头宽一些，接近常见运动相机的观感。 */
const POV_FOV_DEG = 78;
/** 机位下俯角（弧度，约 8°）：项圈在颈前，自然会拍到地面，但主体视野要朝前。 */
const POV_PITCH_RAD = 0.14;
/** 机位平滑系数（每帧向目标插值的比例）：抑制姿势微动带来的抖动。 */
const POV_SMOOTH = 0.4;

export interface SceneStats {
  triangles: number;
  drawCalls: number;
  fps: number;
  models: number;
  textures: number;
}

export interface SceneCallbacks {
  onProgress?: (done: number, total: number, label: string) => void;
  onAssets?: (report: AssetReport) => void;
  onStats?: (stats: SceneStats) => void;
  onFatal?: (reason: string) => void;
}

export interface SceneOptions extends SceneCallbacks {
  canvasHost: HTMLElement;
  labelHost: HTMLElement;
  quality: QualityChoice;
  reducedMotion: boolean;
  /** 自主行为的状态更新（当前活动、姿势、所在锚点、突发、演示时钟） */
  onBehaviorStatus?: (status: BehaviorStatus) => void;
  /** 已有的行为时间线（由 `@camp/simulator` 产出）。缺省时本地按同一套规则生成一条 */
  behaviorTimeline?: CatBehaviorTimeline;
}

/** 自主行为时间线的默认长度：一整天。演示倍率取自 core 的操作化常量。 */
const DEFAULT_BEHAVIOR_DURATION_S = 24 * 3600;
/**
 * 演示倍率**只有一个事实来源**：core 的 `OPERATIVE_CONSTANTS.behaviorTimeScale`。
 * 为什么不在这里写死：倍率决定「一个行为片段在屏幕上停留多久」，
 * 改动它会同时影响观感与「一天能否在一场演示里走完」。写死在两处必然漂移。
 */
const DEFAULT_TIME_SCALE =
  OPERATIVE_CONSTANTS.find((c) => c.id === 'behaviorTimeScale')?.value ?? 20;

const CAMERA_FOV = 52;
const CAMERA_START: [number, number, number] = [6.1, 3.05, 6.25];
const CAMERA_TARGET: [number, number, number] = [0.0, 0.9, -0.3];
/** 阴影目标点（每帧跟随相机）与光源相对目标的固定偏移——两者之差即恒定入射方向。 */
const SUN_TARGET = new THREE.Vector3(0.6, 0.5, 0.8);
const SUN_OFFSET = new THREE.Vector3(-3.2, 3.4, -7.2);

interface CameraMove {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  t: number;
  duration: number;
}

export class HomeScene {
  readonly cat: CatController | null;
  /** 自主行为运行时；行为层关闭时为 null */
  private behavior: CatBehaviorRuntime | null = null;
  private behaviorOnStatus: ((s: BehaviorStatus) => void) | null = null;
  /**
   * 状态回应的**唯一接线**。
   *
   * 为什么提成一个字段：此前「初始运行时」与「点突发后新建的运行时」各写了一份
   * 回调，结果后者漏掉头顶标签的更新——表现为「点突发后身体在动、标签停在点击前」。
   * 提成字段后结构上不可能再漏：任何新建的运行时都用同一个回调。
   */
  private readonly onBehaviorStatus = (s: BehaviorStatus): void => {
    this.catStatus?.set({
      activity: s.activity,
      posture: s.posture,
      incident: s.incident,
      segmentElapsedS: s.segmentElapsedS,
      segmentRealDurationS: s.segmentRealDurationS,
    });
    this.behaviorOnStatus?.(s);
  };
  /** 当前行为时间线（注入突发时会被替换） */
  private behaviorTimeline: CatBehaviorTimeline | null = null;
  /** 猫头顶的状态标签（把行为模型外显）；行为层关闭时为 null */
  private catStatus: CatStatusLabel | null = null;
  private statusVisible = true;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly labelLayer: HotspotLayer;
  /** 猫头顶状态标签的 DOM 宿主（与资源标签层并列、互不干扰） */
  private readonly catLabelHost: HTMLElement;
  private readonly sun: THREE.DirectionalLight;
  private readonly canvasHost: HTMLElement;
  private readonly clock = new THREE.Clock();
  private readonly callbacks: SceneCallbacks;
  private readonly hotspots: Hotspot[] = [];
  private settings: QualitySettings;
  private materialLib: MaterialLibrary | null = null;
  private move: CameraMove | null = null;
  private running = false;
  private disposed = false;
  private hidden = false;
  private fpsEma = 60;
  private statTimer = 0;
  private onResizeBound: () => void;
  private onVisibilityBound: () => void;
  private onContextLostBound: (e: Event) => void;
  private labelsVisible = true;
  /** 项圈硬件与触须无干涉区的显示状态（第三阶段的形态可视化） */
  private collarRig: CatRig | null = null;
  /** 项圈默认可见：它是产品形态本身，不该藏在参数后面（`?collar=off` 可关） */
  private collarVisible = true;
  private whiskerZoneVisible = false;
  /**
   * 项圈相机（POV）离屏渲染。
   *
   * 只在**有人看**的时候才渲染（App 的「实时」页绑定了 canvas 才创建渲染目标）：
   * 每帧多一遍渲染 + 一次 readPixels 是实打实的开销，没人看时不该付这份钱。
   */
  private povCanvas: HTMLCanvasElement | null = null;
  private povCtx: CanvasRenderingContext2D | null = null;
  private povTarget: THREE.WebGLRenderTarget | null = null;
  private povCamera: THREE.PerspectiveCamera | null = null;
  private povBuffer: Uint8Array | null = null;
  private povImage: ImageData | null = null;
  private povLastMs = 0;
  private povFrames = 0;
  /** 机位平滑状态（见 `updatePovFeed`） */
  private povEyeSmooth: THREE.Vector3 | null = null;
  private povQuatSmooth: THREE.Quaternion | null = null;
  /** 主相机跟随项圈机位（`?view=collar-cam`） */
  private povFollowMain = false;
  /** 位移探针：见 `startMotionProbe` */
  private probe: { until: number; samples: Array<{ t: number; x: number; y: number; z: number }> } | null =
    null;

  constructor(opts: SceneOptions) {
    this.canvasHost = opts.canvasHost;
    this.callbacks = {
      onProgress: opts.onProgress,
      onAssets: opts.onAssets,
      onStats: opts.onStats,
      onFatal: opts.onFatal,
    };
    this.settings = resolveQuality(opts.quality).settings;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      // 无 WebGL：交给 UI 显示降级页（资源清单不依赖 3D）
      opts.onFatal?.(err instanceof Error ? err.message : '浏览器未提供 WebGL 上下文');
      throw err;
    }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.settings.pixelRatioCap));
    renderer.setSize(this.canvasHost.clientWidth || 1, this.canvasHost.clientHeight || 1, false);
    renderer.shadowMap.enabled = this.settings.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'scene-canvas';
    this.canvasHost.appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = skyTexture();

    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      (this.canvasHost.clientWidth || 1) / (this.canvasHost.clientHeight || 1),
      0.05,
      80,
    );
    this.camera.position.set(...CAMERA_START);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(...CAMERA_TARGET);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 16;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.minPolarAngle = 0.15;
    this.controls.rotateSpeed = 0.75;
    this.controls.zoomSpeed = 0.8;
    this.controls.panSpeed = 0.6;
    this.controls.update();

    // 光：一盏暖色日光穿过北窗 + 少量室内补光（只让日光投影，省一半阴影开销）
    this.sun = new THREE.DirectionalLight(0xfff1d9, 3);
    this.sun.position.copy(SUN_TARGET).add(SUN_OFFSET);
    this.sun.target.position.copy(SUN_TARGET);
    this.sun.castShadow = this.settings.shadows;
    this.sun.shadow.mapSize.set(this.settings.shadowMapSize, this.settings.shadowMapSize);
    this.sun.shadow.camera.left = -6.5;
    this.sun.shadow.camera.right = 6.5;
    this.sun.shadow.camera.top = 5.5;
    this.sun.shadow.camera.bottom = -3.5;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 26;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const hemi = new THREE.HemisphereLight(0xe8eef5, 0x9a7d5c, 0.16);
    this.scene.add(hemi);
    // 室内暖光：厨房吊灯与起居区补光（不投影）
    const kitchenLight = new THREE.PointLight(0xffd9a8, 6, 6, 2);
    kitchenLight.position.set(-1.6, 2.3, 1.9);
    this.scene.add(kitchenLight);
    const livingLight = new THREE.PointLight(0xffe0bb, 4, 5.5, 2);
    livingLight.position.set(1.6, 2.35, 0.2);
    this.scene.add(livingLight);

    // 建模
    const mats = new MaterialLibrary();
    this.materialLib = mats;
    const root = new THREE.Group();
    root.name = 'home';
    this.scene.add(root);

    buildRoom(root, mats);
    buildKitchen(root, mats);
    const furniture = buildFurniture(root, mats);
    const catGear = buildCatGear(root, mats);
    this.resourceRings = catGear.resourceRings;

    const catRig = buildCat(mats, this.settings.furShells);
    root.add(catRig.root);
    this.collarRig = catRig;
    // 项圈默认隐藏：它承载的是「形态方案」这一条信息，不是场景的默认外观。
    // `?collar=on` 或 HUD 开关把它打开；`?collar=zone` 连无干涉区一起打开。
    catRig.collar.visible = this.collarVisible;
    catRig.whiskerZone.visible = this.whiskerZoneVisible;
    this.cat = new CatController(catRig, { reducedMotion: opts.reducedMotion });
    this.behaviorOnStatus = opts.onBehaviorStatus ?? null;

    // 猫头顶的状态标签：**独立于资源标签层**，因此单独给一个宿主。
    // 资源标签那层有「相互遮挡就隐藏」的贪心去重，猫的状态标签绝不能因为
    // 撞上某个资源标签就被隐藏——它承载的是「它现在在做什么」这件主线信息。
    this.catLabelHost = document.createElement('div');
    this.catLabelHost.className = 'cat-status-layer';
    opts.labelHost.appendChild(this.catLabelHost);

    // 自主行为：默认开启。时间线由调用方给（仿真器产出）或本地按同一套规则生成。
    // `?behavior=off` 可关掉，回到第一阶段的手动演示档位。
    const behaviorEnabled = !new URLSearchParams(window.location.search).has('behavior-off');
    if (behaviorEnabled && this.cat) {
      const timeline =
        opts.behaviorTimeline ??
        buildBehaviorTimeline({
          seed: 42,
          durationS: DEFAULT_BEHAVIOR_DURATION_S,
          timeScale: DEFAULT_TIME_SCALE,
          anchors: CAT_ANCHOR_SPECS,
        });
      this.behaviorTimeline = timeline;
      this.catStatus = new CatStatusLabel(this.catLabelHost);
      this.statusVisible = !new URLSearchParams(window.location.search).has('status-off');
      this.catStatus.setVisible(this.statusVisible);
      this.behavior = new CatBehaviorRuntime(timeline, this.cat, {
        onStatus: this.onBehaviorStatus,
      });
    }

    this.labelLayer = new HotspotLayer(opts.labelHost);
    this.registerHotspots();

    // 资产到货后替换占位件；失败只记账，不白屏
    void this.loadAndApplyAssets(furniture.placeholders);

    this.onResizeBound = () => this.resize();
    this.onVisibilityBound = () => {
      this.hidden = document.hidden;
      this.setLoopActive(!this.hidden && !this.disposed);
    };
    this.onContextLostBound = (event: Event) => {
      event.preventDefault();
      this.setLoopActive(false);
      this.callbacks.onFatal?.('WebGL 上下文丢失');
    };
    window.addEventListener('resize', this.onResizeBound);
    document.addEventListener('visibilitychange', this.onVisibilityBound);
    renderer.domElement.addEventListener('webglcontextlost', this.onContextLostBound);
  }

  /** 启动渲染循环。 */
  start(): void {
    this.running = true;
    this.hidden = document.hidden;
    this.clock.start();
    this.setLoopActive(!this.hidden);
  }

  private setLoopActive(active: boolean): void {
    if (this.disposed) return;
    if (active && this.running) this.renderer.setAnimationLoop(() => this.tick());
    else this.renderer.setAnimationLoop(null);
  }

  setQuality(choice: QualityChoice): void {
    this.settings = resolveQuality(choice).settings;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.settings.pixelRatioCap));
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.sun.castShadow = this.settings.shadows;
    this.sun.shadow.mapSize.set(this.settings.shadowMapSize, this.settings.shadowMapSize);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    if (this.cat) {
      for (const shell of this.cat.rig.furShells) {
        const layer = (shell.userData.furLayer as number | undefined) ?? 1;
        shell.visible = layer <= this.settings.furShells;
      }
    }
    this.scene.environmentIntensity = this.settings.envIntensity;
    this.resize();
  }

  setCatState(id: CatStateId): void {
    this.cat?.setState(id);
  }

  /** 立即切到某状态（不做过渡）：首屏以某状态开场、以及文档截图使用。 */
  snapCatState(id: CatStateId): void {
    this.cat?.snapTo(id);
  }

  getCatState(): CatStateId | null {
    return this.cat?.getState() ?? null;
  }

  /** 猫的逻辑坐标（保留两位，由 wall clock 推导），自检与调试用。 */
  catPosition(): [number, number, number] | undefined {
    const t = this.behavior ? this.behavior.getTransform() : this.cat?.getCurrentTransform();
    if (!t) return undefined;
    return [round2(t.x), round2(t.y), round2(t.z)];
  }

  // ---------------------------------------------------------------- 自主行为

  /** 回到手动演示档位（暂停自主行为）。 */
  setManualCat(): void {
    this.behavior?.setPaused(true);
    this.cat?.useManualMode();
  }

  /** 恢复自主行为。 */
  setAutoCat(): void {
    this.behavior?.setPaused(false);
  }

  isAutoCat(): boolean {
    return this.behavior !== null && !this.behavior.isPaused();
  }

  behaviorStatus(): BehaviorStatus | null {
    return this.behavior?.status() ?? null;
  }

  /** 演示倍率：1 秒当多少秒。 */
  setBehaviorTimeScale(_scale: number): void {
    // 倍率属于时间线构造参数（`timeline.timeScale`），运行中改变会破坏
    // 「时间线与真值一致」这条性质，因此这里只记录、不热改。
    // 需要不同倍率时用 `?scale=` 重新加载。
  }

  /**
   * 触发一次突发演示。
   *
   * 语义：**重建一条时间线**，在「当前演示时刻」注入这次突发。
   * 为什么不直接在运行时插队：注入会改变时段的长度分配，
   * 而 `activityAt()` 的连续性不变量（区间首尾相接、覆盖满时长）必须保持。
   * 重建时间线能让「注入 → 还原」这条回归链路在浏览器里也成立。
   *
   * ⚠️ 接线纪律（这里踩过坑）：新建的运行时**必须复用 `this.onBehaviorStatus`**，
   * 不能另外写一份回调。最初这里写的是 `(s) => this.behaviorOnStatus?.(s)`，
   * 只喂了 HUD、漏掉了头顶标签——于是「点突发后身体在动、标签却停在点击前的状态」。
   * 状态回应的接线只允许存在一处。
   */
  triggerIncident(kind: CatIncidentKind): void {
    if (!this.cat) return;
    const timeline =
      this.behaviorTimeline ??
      buildBehaviorTimeline({
        seed: 42,
        durationS: DEFAULT_BEHAVIOR_DURATION_S,
        timeScale: DEFAULT_TIME_SCALE,
        anchors: CAT_ANCHOR_SPECS,
      });
    const atS = this.behavior ? this.behavior.getTimeS() : 0;
    const next = buildBehaviorTimeline({
      seed: timeline.seed,
      durationS: timeline.durationS,
      timeScale: timeline.timeScale,
      anchors: CAT_ANCHOR_SPECS,
      injectIncidents: [{ atS: Math.max(1, atS), kind }],
    });
    this.behavior = new CatBehaviorRuntime(next, this.cat, {
      startAtS: Math.max(0, atS - 1),
      onStatus: this.onBehaviorStatus,
    });
  }

  /** 自检用：当前突发种类（无则 null）。 */
  currentIncident(): string | null {
    return this.behavior?.status().incident ?? null;
  }

  /** 当前演示时刻（会话内秒）。手机预览按它去查生理读数，保证与画面同一时刻。 */
  simTimeS(): number {
    return this.behavior?.getTimeS() ?? 0;
  }

  /**
   * 换一条时间线（由调用方提供），并从 `startAtS` 继续跑。
   *
   * 为什么需要它：突发演示曾经在场景内部**自己**重建时间线，于是出现两条时间线——
   * 画面跑的那条，与仿真数据（生理读数、事件流）那条。手机预览要显示"此刻的读数"时，
   * 这个问题会立刻暴露成"手机上的数和猫在做的事对不上"。
   * 现在改为：由持有会话的一侧（`screens/home.ts`）重建**带注入突发的会话**，
   * 再把它的时间线交给场景。全场景只有一条时间线。
   */
  applyTimeline(timeline: CatBehaviorTimeline, startAtS = 0): void {
    if (!this.cat) return;
    this.behaviorTimeline = timeline;
    this.behavior = new CatBehaviorRuntime(timeline, this.cat, {
      startAtS: Math.max(0, startAtS),
      // ⚠️ 复用同一个回调字段：这是「状态回应只允许存在一处」的纪律（见 triggerIncident 的注释）。
      onStatus: this.onBehaviorStatus,
    });
  }

  setReducedMotion(on: boolean): void {
    this.cat?.setReducedMotion(on);
  }

  setLabelsVisible(on: boolean): void {
    this.labelsVisible = on;
    this.labelLayer.setVisible(on);
  }

  /** 猫资源高亮：地面光环整体显隐（独立几何，不影响共享材质）。 */
  setHighlightsVisible(on: boolean): void {
    this.resourceRings.visible = on;
  }

  /**
   * 猫头顶状态标签的显隐。
   *
   * 与资源标签开关**分开**：资源标签是「房间信息」，状态标签是「它现在在做什么」，
   * 演示时经常需要「关掉满屋标签、只看猫」。
   */
  setStatusVisible(on: boolean): void {
    this.statusVisible = on;
    this.catStatus?.setVisible(on);
  }

  isStatusVisible(): boolean {
    return this.statusVisible;
  }

  /** 自检用：猫头顶状态标签的当前文案。 */
  catLabelText(): string {
    return this.catStatus?.text() ?? '';
  }

  /** 自检用：当前生效的突发动作幅度。用来区分「标签在报」与「身体真的在动」。 */
  catIncidentMotion(): Record<string, number> | null {
    return this.cat?.incidentMotionSnapshot() ?? null;
  }

  /**
   * 显示/隐藏项圈硬件（带体 + 电子仓 + ECG 电极 + 体表热敏电阻）。
   *
   * 为什么把硬件做进 3D 场景：三个通道的**位置**就是它们的能力边界。
   * 「电极在颈侧、热敏电阻在颈腹侧」这件事，看一眼比读一段文字更有效。
   */
  setCollarVisible(on: boolean): void {
    this.collarVisible = on;
    if (this.collarRig) this.collarRig.collar.visible = on;
  }

  isCollarVisible(): boolean {
    return this.collarVisible;
  }

  /** 显示/隐藏触须无干涉区（面部触须是独立感觉器官，硬件不得进入该体积）。 */
  setWhiskerZoneVisible(on: boolean): void {
    this.whiskerZoneVisible = on;
    if (this.collarRig) this.collarRig.whiskerZone.visible = on;
  }

  isWhiskerZoneVisible(): boolean {
    return this.whiskerZoneVisible;
  }

  /** 自检用：项圈与无干涉区的显示状态。 */
  collarState(): { collar: boolean; whiskerZone: boolean; parts: number } {
    const rig = this.collarRig;
    return {
      collar: rig?.collar.visible ?? false,
      whiskerZone: rig?.whiskerZone.visible ?? false,
      parts: rig?.collar.children.length ?? 0,
    };
  }

  // ---------------------------------------------------------------- 项圈相机（POV）

  /**
   * 绑定/解绑 App「实时」页里的画面画布。
   *
   * 传 `null` 即停止渲染——这是省电纪律：没人看的画面不渲染。
   */
  setPovCanvas(canvas: HTMLCanvasElement | null): void {
    this.povCanvas = canvas;
    if (!canvas) {
      this.povCtx = null;
      return;
    }
    this.povCtx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    // 尺寸没变就**复用**渲染目标：上一版每次绑定都新建一个（每 500 ms 一次），
    // 分配与首帧未填充叠在一起，画面就会闪——这是"闪动"的主要原因之一。
    if (this.povTarget && (this.povTarget.width !== w || this.povTarget.height !== h)) {
      this.povTarget.setSize(w, h);
      this.povCamera = null;
      this.povBuffer = null;
      this.povImage = null;
    }
    if (!this.povTarget) {
      this.povTarget = new THREE.WebGLRenderTarget(w, h, {
        depthBuffer: true,
        // 线性过滤 + 不生成 mipmap：读回来的像素要的就是"这一帧"，不需要额外处理
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      });
    }
    if (!this.povCamera) this.povCamera = new THREE.PerspectiveCamera(POV_FOV_DEG, w / h, 0.03, 60);
    if (!this.povBuffer) this.povBuffer = new Uint8Array(w * h * 4);
    this.povImage = null;
  }

  /** 自检用：项圈相机这一路的运行事实。 */
  povState(): {
    bound: boolean;
    frames: number;
    width: number;
    height: number;
    /** 镜头离**猫所站表面**的高度（米）——用来核对"视角高度与猫一致" */
    eyeHeightM: number;
    /** 当前机位是否跟随项圈镜头（`?view=collar-cam`） */
    follow: boolean;
  } {
    const rig = this.collarRig;
    let eyeHeightM = 0;
    if (rig) {
      rig.povAnchor.updateWorldMatrix(true, false);
      const eye = new THREE.Vector3().setFromMatrixPosition(rig.povAnchor.matrixWorld);
      eyeHeightM = Number((eye.y - rig.root.position.y).toFixed(3));
    }
    return {
      bound: this.povCanvas !== null,
      frames: this.povFrames,
      width: this.povCanvas?.width ?? 0,
      height: this.povCanvas?.height ?? 0,
      eyeHeightM,
      follow: this.povFollowMain,
    };
  }

  /**
   * 主相机切到项圈机位（`?view=collar-cam`）。
   *
   * 与「猫特写」不同：这不是"看着猫"，而是**把机位放到项圈的镜头上**，
   * 用来核对项圈相机到底拍到了什么。它拍不到自己（渲染时会隐藏猫），
   * 也不等于猫的视觉——帧率、视野、以及嗅觉通道都不等价（见 `AGENTS.md` §3）。
   */
  setPovCameraFollow(on: boolean): void {
    this.povFollowMain = on;
  }

  isPovCameraFollowing(): boolean {
    return this.povFollowMain;
  }

  /**
   * 切换到机位预设。
   *
   * `immediate` 用于「必须以某个确定机位呈现」的场合（URL 指定视角、文档截图）：
   * 缓动依赖渲染帧推进，而无头/低帧率环境下帧数不可控，会让截图位置每次都不一样。
   */
  preset(id: string, immediate = false): void {
    if (id === 'collar-cam') {
      // 主相机站到项圈镜头上（每帧跟随，见 tick()）
      this.setPovCameraFollow(true);
      const p = this.collarRig?.povAnchor;
      if (p) {
        p.updateWorldMatrix(true, false);
        const eye = new THREE.Vector3().setFromMatrixPosition(p.matrixWorld);
        const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(p.getWorldQuaternion(new THREE.Quaternion()));
        this.moveTo(
          [eye.x, eye.y, eye.z],
          [eye.x + ahead.x * 1.4, eye.y + ahead.y * 1.4 - 0.34, eye.z + ahead.z * 1.4],
          immediate ? 0 : 0.35,
        );
      }
      return;
    }
    this.setPovCameraFollow(false);
    if (id === 'cat-follow') {
      const p = this.cat?.rig.root.position;
      if (!p) return;
      if (this.behavior) {
        // 自主行为下猫会到处走，第一阶段那两套「相对猫的固定偏移」不再成立
        // （偏移是按站位朝向手写的，转个身就会钻进家具里）。
        // 这里改为按**猫当前朝向**把机位放到它的斜后方，任何位置与朝向都成立。
        const rotY = this.behavior.getTransform().rotY;
        const distance = 1.15;
        const back = Math.PI + 0.55; // 斜后方
        const angle = rotY + back;
        const camX = p.x + Math.sin(angle) * distance;
        const camZ = p.z + Math.cos(angle) * distance;
        this.moveTo([camX, p.y + 0.72, camZ], [p.x, p.y + 0.16, p.z], immediate ? 0 : 0.9);
        return;
      }
      const state = this.cat?.getState();
      if (state) {
        const cam = CAT_ANCHORS[state].cam;
        this.moveTo([p.x + cam.x, p.y + cam.y, p.z + cam.z], [p.x, p.y + 0.16, p.z], immediate ? 0 : 0.9);
        return;
      }
    }
    const hit = CAMERA_PRESETS.find((p) => p.id === id);
    if (!hit) return;
    this.moveTo(hit.position, hit.target, immediate ? 0 : 0.9);
  }

  /** 外部（如档案推导出的项圈高度）自定义机位。duration 为 0 时立即到位。 */
  moveTo(position: [number, number, number], target: [number, number, number], duration = 0.9): void {
    if (duration <= 0) {
      this.camera.position.set(...position);
      this.controls.target.set(...target);
      this.controls.update();
      this.move = null;
      return;
    }
    this.move = {
      fromPos: this.camera.position.clone(),
      toPos: new THREE.Vector3(...position),
      fromTarget: this.controls.target.clone(),
      toTarget: new THREE.Vector3(...target),
      t: 0,
      duration,
    };
  }

  getStats(): SceneStats {
    const info = this.renderer.info;
    return {
      triangles: info.render.triangles,
      drawCalls: info.render.calls,
      fps: Math.round(this.fpsEma),
      models: this.applyCount,
      textures: info.memory.textures,
    };
  }

  getAssetReport(): AssetReport | null {
    return this.report;
  }

  /**
   * 调试用：某个扫描模型槽位当前是「真模型 / 程序化占位 / 缺失」。
   * 自检徽章用它来区分「资产没到」和「资产到了但没换上」——这两类故障的排查方向完全不同。
   */
  slotState(id: string): 'model' | 'placeholder' | 'none' {
    if (this.appliedIds.has(id)) return 'model';
    const home = this.scene.getObjectByName('home');
    if (home?.getObjectByName(`placeholder-${id}`)) return 'placeholder';
    return 'none';
  }

  /** 调试用：场景里还残留几个程序化占位件。 */
  placeholderCount(): number {
    let n = 0;
    this.scene.traverse((obj) => {
      if (obj.name.startsWith('placeholder-')) n += 1;
    });
    return n;
  }

  dispose(): void {
    this.disposed = true;
    this.running = false;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResizeBound);
    document.removeEventListener('visibilitychange', this.onVisibilityBound);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLostBound);
    this.controls.dispose();
    this.labelLayer.dispose();
    this.catStatus?.dispose();
    this.catLabelHost.remove();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
      }
    });
    this.materialLib?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------- 内部

  private report: AssetReport | null = null;
  private applyCount = 0;
  private readonly appliedIds = new Set<string>();
  private resourceRings!: THREE.Group;
  private statsEmitted = false;
  private readonly sunFollow = new THREE.Vector3(0.6, 0.5, 0.8);

  private async loadAndApplyAssets(placeholders: Map<string, THREE.Group>): Promise<void> {
    const assets = await loadAssets((done, total, label) => this.callbacks.onProgress?.(done, total, label));
    if (this.disposed) return;
    this.report = assets.report;

    // 环境光：HDRI 作 IBL（不作背景，背景是程序化天空）
    if (assets.env) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const target = pmrem.fromEquirectangular(assets.env);
      this.scene.environment = target.texture;
      this.scene.environmentIntensity = this.settings.envIntensity;
      assets.env.dispose();
      pmrem.dispose();
    }

    // 用真实 CC0 贴图就地替换程序化回退（不重建几何）
    if (assets.tiles.size > 0) {
      this.materialLib?.setTiles(assets.tiles);
    }

    for (const placement of MODEL_PLACEMENTS) {
      const model = assets.models.get(placement.id);
      const placeholder = placeholders.get(placement.id);
      if (!model) continue;
      if (placement.decorative && !this.settings.decorativeModels) continue;
      fitModel(model, placement.fitTo, placement.rotY, placement.x, placement.y ?? 0, placement.z);
      this.scene.getObjectByName('home')?.add(model);
      placeholder?.removeFromParent();
      this.appliedIds.add(placement.id);
      this.applyCount += 1;
    }

    // 资产到货后立刻刷新一次统计：否则帧率一旦被浏览器降下来（后台标签、无头环境），
    // 统计行会长时间停在「0 个扫描模型」，看起来像模型没换上。
    // 同时清掉 statsEmitted，让下一帧用渲染后的真实三角面/绘制调用数再刷一次。
    this.callbacks.onStats?.(this.getStats());
    this.statsEmitted = false;
    this.callbacks.onAssets?.(assets.report);
  }

  private registerHotspots(): void {
    // 标签直接由布局数据推导，避免手写一份会和房间脱节的坐标表
    const badgeOf: Record<string, string> = {
      litter: '② 关键资源',
      water: '② 关键资源',
      food: '② 关键资源',
      scratch: '② 关键资源',
      vertical: '① 安全的地方',
      hide: '① 安全的地方',
      sleep: '① 安全的地方',
      play: '③ 玩耍机会',
    };
    const labelOf: Record<string, string> = {
      fountain: '饮水机',
      'water-bowl': '第二水碗',
      'food-bowls': '食盆',
      'cat-bed': '封闭式猫窝',
      'cat-bed-hide': '封闭式猫窝',
      'tree-perch': '猫爬架顶台',
      'tree-posts': '猫爬架剑麻立柱',
      'wall-scratcher': '墙面剑麻抓板',
      'floor-scratcher': '地面抓板',
      'hiding-box': '纸箱躲藏处',
      'wardrobe-top': '衣柜顶（高处通道）',
      toys: '玩具',
      'litter-a': '猫砂盆 A',
      'litter-b': '猫砂盆 B',
      'cat-shelf-0': '墙面跳台（低）',
      'cat-shelf-1': '墙面跳台（高）',
      'tree-perch-vertical': '猫爬架顶台',
    };
    const heightOf: Record<string, number> = {
      litter: 0.72,
      water: 0.34,
      food: 0.28,
      sleep: 0.5,
      scratch: 0.7,
      hide: 0.62,
      vertical: 1.2,
      play: 0.2,
    };

    this.hotspots.length = 0;
    for (const item of HOME_RESOURCES) {
      // 同一物件的「睡窝 / 垂直空间 / 躲藏」多角色只保留一个标签，避免叠字
      if (item.id === 'cat-bed-hide' || item.id === 'tree-perch-vertical') continue;
      const y = item.heightM ?? heightOf[item.kind] ?? 0.4;
      this.hotspots.push({
        id: item.id,
        label: labelOf[item.id] ?? item.label,
        badge: badgeOf[item.kind] ?? '',
        position: new THREE.Vector3(item.position.x, y, item.position.z),
      });
    }
    this.labelLayer.set(this.hotspots);
    this.labelLayer.setVisible(this.labelsVisible);
  }

  /**
   * 渲染一帧项圈相机画面，并写进 App「实时」页的画布。
   *
   * 三条工程取舍：
   *   1. **节流到约 6 fps**：每帧多一遍渲染 + 一次 `readRenderTargetPixels`（会同步等 GPU）
   *      代价不小，而"看看它在哪"这件事不需要 60 fps。
   *   2. **渲染时隐藏猫自己**：真实项圈相机拍不到自己的后脑勺，不隐藏的话画面里全是毛。
   *   3. **只在有人看时渲染**：App 绑定 canvas 才创建渲染目标，切走就停止（见 `setPovCanvas`）。
   */
  private updatePovFeed(): void {
    const canvas = this.povCanvas;
    const ctx = this.povCtx;
    const target = this.povTarget;
    const cam = this.povCamera;
    const rig = this.collarRig;
    const buffer = this.povBuffer;
    if (!canvas || !ctx || !target || !cam || !rig || !buffer) return;

    const wall = performance.now();
    const intervalMs = 1000 / POV_FPS;
    if (wall - this.povLastMs < intervalMs) return;
    // 用固定步长推进"上一次"而不是直接赋值 now：这样在帧率低于 POV_FPS 时
    // 不会积攒出一个巨大的间隔，画面节奏更稳。
    this.povLastMs = wall - Math.min(intervalMs, wall - this.povLastMs) + intervalMs;

    rig.povAnchor.updateWorldMatrix(true, false);
    const eye = new THREE.Vector3().setFromMatrixPosition(rig.povAnchor.matrixWorld);
    const quat = rig.povAnchor.getWorldQuaternion(new THREE.Quaternion());
    // 一阶平滑：姿势动画（重心转移、呼吸）会让机位有厘米级抖动，
    // 在 8 fps 的采样下抖动会被放大成"一跳一跳"。平滑系数取得较大，几乎没有延迟。
    if (this.povEyeSmooth) {
      const k = POV_SMOOTH;
      this.povEyeSmooth.lerp(eye, k);
      this.povQuatSmooth?.slerp(quat, k);
      cam.position.copy(this.povEyeSmooth);
      cam.quaternion.copy(this.povQuatSmooth ?? quat);
    } else {
      this.povEyeSmooth = eye.clone();
      this.povQuatSmooth = quat.clone();
      cam.position.copy(eye);
      cam.quaternion.copy(quat);
    }
    // 项圈在颈前偏下，自然会拍到一些地面；这里只给一个小幅下俯角，
    // 主要视野仍朝前——"便于寻找它的位置"要求看得见房间，而不是只看得见地板。
    cam.rotateX(-POV_PITCH_RAD);

    const wasVisible = rig.root.visible;
    rig.root.visible = false;
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, cam);
    this.renderer.setRenderTarget(prevTarget);
    rig.root.visible = wasVisible;

    const w = canvas.width;
    const h = canvas.height;
    this.renderer.readRenderTargetPixels(target, 0, 0, w, h, buffer);
    // WebGL 的行序自下而上，ImageData 自上而下 → 翻一次
    if (!this.povImage || this.povImage.width !== w || this.povImage.height !== h) {
      this.povImage = ctx.createImageData(w, h);
    }
    const dst = this.povImage.data;
    const rowBytes = w * 4;
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * rowBytes;
      dst.set(buffer.subarray(src, src + rowBytes), y * rowBytes);
    }
    ctx.putImageData(this.povImage, 0, 0);
    this.povFrames++;
  }

  // ---------------------------------------------------------------- 位移探针（"有没有瞬移"）

  /**
   * 记录接下来 `durationS` 秒里猫的**逐帧位置**，用来量化"它是不是走过去的"。
   *
   * 为什么需要这个仪器：位移是渲染层的事实，无法用单测覆盖（要 three + 控制器）。
   * 而"瞬移"这个故障恰恰是**只有位置序列能证明**的：一次 0.06 秒走完 3 m，
   * 任何单帧快照看起来都正常。因此这里记录位置序列，再由自检算出
   * **最大瞬时速度**与**位移是否连续**——真实走速约 0.45 m/s，跳跃弧顶也不会超过几 m/s，
   * 而瞬移会在两帧之间产生每秒几十米的尖峰。
   */
  startMotionProbe(durationS: number): void {
    this.probe = { until: performance.now() + Math.max(0.2, durationS) * 1000, samples: [] };
  }

  /** 自检用：位移探针的统计结果（没跑过返回 null）。 */
  motionProbe(): {
    samples: number;
    durationS: number;
    maxSpeedMps: number;
    maxStepM: number;
    movingShare: number;
    distinctPositions: number;
  } | null {
    const p = this.probe;
    if (!p || p.samples.length < 2) return null;
    let maxSpeed = 0;
    let maxStep = 0;
    let moving = 0;
    const seen = new Set<string>();
    for (let i = 0; i < p.samples.length; i++) {
      const s = p.samples[i] as { t: number; x: number; y: number; z: number };
      seen.add(`${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}`);
      const prev = p.samples[i - 1];
      if (!prev) continue;
      const dt = Math.max(1e-3, (s.t - prev.t) / 1000);
      const step = Math.hypot(s.x - prev.x, s.z - prev.z, s.y - prev.y);
      const speed = step / dt;
      if (step > maxStep) maxStep = step;
      if (speed > maxSpeed) maxSpeed = speed;
      if (step > 0.01) moving++;
    }
    const span = ((p.samples[p.samples.length - 1] as { t: number }).t - (p.samples[0] as { t: number }).t) / 1000;
    return {
      samples: p.samples.length,
      durationS: Number(span.toFixed(2)),
      maxSpeedMps: Number(maxSpeed.toFixed(2)),
      maxStepM: Number(maxStep.toFixed(3)),
      movingShare: Number((moving / Math.max(1, p.samples.length - 1)).toFixed(3)),
      distinctPositions: seen.size,
    };
  }

  private sampleProbe(): void {
    const p = this.probe;
    if (!p || performance.now() > p.until) return;
    const pos = this.cat?.rig.root.position;
    if (pos) p.samples.push({ t: performance.now(), x: pos.x, y: pos.y, z: pos.z });
  }

  /** 主相机站在项圈镜头上（`?view=collar-cam`）：每帧跟随，并隐藏猫自己。 */
  private followPovCamera(dt: number): void {    const rig = this.collarRig;
    if (!rig) return;
    rig.povAnchor.updateWorldMatrix(true, false);
    const eye = new THREE.Vector3().setFromMatrixPosition(rig.povAnchor.matrixWorld);
    const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(
      rig.povAnchor.getWorldQuaternion(new THREE.Quaternion()),
    );
    const k = Math.min(1, dt * 8);
    this.camera.position.lerp(eye, k);
    this.controls.target.lerp(
      new THREE.Vector3(eye.x + ahead.x * 1.4, eye.y + ahead.y * 1.4 - 0.34, eye.z + ahead.z * 1.4),
      k,
    );
    this.controls.update();
  }

  private resize(): void {    const w = this.canvasHost.clientWidth || 1;
    const h = this.canvasHost.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.settings.pixelRatioCap));
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (dt > 0) this.fpsEma = this.fpsEma * 0.9 + (1 / dt) * 0.1;

    if (this.move) {
      this.move.t = Math.min(1, this.move.t + dt / this.move.duration);
      const k = easeInOutCubic(this.move.t);
      this.camera.position.lerpVectors(this.move.fromPos, this.move.toPos, k);
      this.controls.target.lerpVectors(this.move.fromTarget, this.move.toTarget, k);
      if (this.move.t >= 1) this.move = null;
    }

    // 自主行为优先：它自己会把位置与姿势落到 rig 上，并调用控制器推进微动作。
    // 行为层关闭时退回第一阶段的手动路径。
    if (this.behavior) this.behavior.update(dt);
    else this.cat?.update(dt);
    this.sampleProbe();
    this.controls.update();

    if (this.settings.shadows) {
      // 阴影视锥跟随相机，但**光照方向保持恒定**（否则相机动一下影子就翻面）：
      // 把目标点与光源位置一起平移，两者的差就是固定的入射方向。
      this.sunFollow.set(this.camera.position.x * 0.5, 0.5, this.camera.position.z * 0.5);
      this.sun.target.position.copy(this.sunFollow);
      this.sun.position.copy(this.sunFollow).add(SUN_OFFSET);
      this.sun.target.updateMatrixWorld();
    }

    // 项圈机位：主相机每帧跟到镜头上，并在整个渲染期隐藏猫自己
    if (this.povFollowMain) {
      this.followPovCamera(dt);
      if (this.collarRig) this.collarRig.root.visible = false;
    } else if (this.collarRig && !this.collarRig.root.visible) {
      this.collarRig.root.visible = true;
    }

    this.renderer.render(this.scene, this.camera);
    this.updatePovFeed();
    this.labelLayer.update(this.camera, this.canvasHost.clientWidth, this.canvasHost.clientHeight);
    // 状态标签的**位置**每帧更新（猫在动），**文案**只在行为状态变化时更新
    // （见 `CatStatusLabel.set` 的纪律 2），因此这里不产生文本重排。
    if (this.catStatus) {
      this.catStatus.update(
        this.camera,
        this.cat?.rig.root.position ?? new THREE.Vector3(),
        this.canvasHost.clientWidth,
        this.canvasHost.clientHeight,
      );
    }

    this.statTimer += dt;
    if (this.statTimer > 0.5 || !this.statsEmitted) {
      this.statTimer = 0;
      this.statsEmitted = true;
      this.callbacks.onStats?.(this.getStats());
    }
  }
}

/** 低画质档只保留最外一层毛壳；高画质档全部显示。 */
function easeInOutCubic(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 供调试与自检使用：确认资产清单与环境文件路径。 */
export const ASSET_SUMMARY = {
  models: MODEL_MANIFEST.map((m) => m.id),
  env: ENV_MANIFEST.file,
  room: ROOM,
};
