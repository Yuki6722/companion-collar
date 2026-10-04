/**
 * 狗版生活场景的装配与生命周期。
 *
 * 职责边界（与猫版 `scene.ts` 一致）：本文件只管「3D 世界怎么搭、怎么渲染」，不管 UI。
 * HUD 通过回调接收进度 / 资产报告 / 统计，图层开关从外部传入。
 *
 * 与猫版 `HomeScene` 的三处结构性差异，都是刻意的：
 *
 *   1. **多了柴犬这一层，也因此多了项圈相机的 POV 离屏渲染**（`setPovCanvas` / `povState` /
 *      `updatePovFeed`），与猫版 `HomeScene` 同构：同样只在有人看时才渲染、同样节流、
 *      同样在渲染这一路时隐藏角色自己。唯一的实质差异是机位的取法 —— 眼睛取**项圈前端
 *      那颗镜头网格的世界位置**，朝向取运行时的 `heading` 而不是镜头的局部轴
 *      （理由见 `followPovCamera` 的注释）。
 *   2. **多一个室外材质库**（`GardenMaterials`）与一个院子构建器。室内仍然复用
 *      `MaterialLibrary`，那三张 CC0 平铺贴图（木地板 / 乳胶漆 / 石材）继续生效。
 *   3. **太阳更高、阴影范围覆盖整个院子**。猫版只有室内，光照模型不必管 15 m 进深。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildDogTimeline } from '@camp/core';
import type { DogActivityId, DogBehaviorTimeline, DogIncidentKind } from '@camp/core';
import { MODEL_MANIFEST, loadAssets } from './assets.ts';
import type { AssetReport } from './assets.ts';
import { DogBehaviorRuntime, groundHeightAt, incidentRealSeconds } from './dog/dog-behavior.ts';
import type { DogBehaviorStatus, DogManualTrigger } from './dog/dog-behavior.ts';
import { DogController } from './dog/dog-controller.ts';
import type { DogPoseSnapshot } from './dog/dog-controller.ts';
import { buildShibaRig, SHIBA_METRICS } from './dog/dog-model.ts';
import type { DogRig } from './dog/dog-rig.ts';
import { DOG_ANCHOR_SPECS } from './dog/dog-nav.ts';
import { buildDogFurniture, DOG_MODEL_PLACEMENTS } from './dog/build-dog-furniture.ts';
import { buildDogGear } from './dog/build-dog-gear.ts';
import { buildDogKitchen } from './dog/build-dog-kitchen.ts';
import { buildDogRoom } from './dog/build-dog-room.ts';
import { buildYard } from './dog/build-yard.ts';
import { GardenMaterials } from './dog/garden-materials.ts';
import { CAMERA_PRESETS, BUSHES, DOG_BED_MAIN, DOG_BED_SLEEP, FOOD_STATION, LEASH_HOOK, LOUNGE_CHAIR, OUTDOOR_WATER, PATHS, POND, ROOM, STONE_LANTERN, TOY_BASKET, YARD } from './dog/layout-dog.ts';
import { HotspotLayer } from './hotspots.ts';
import type { Hotspot } from './hotspots.ts';
import { MaterialLibrary } from './materials.ts';
import { resolveQuality } from './quality.ts';
import type { QualityChoice, QualitySettings } from './quality.ts';
import { skyTexture } from './textures.ts';
import { fitModel } from './util.ts';

/** 自主行为的默认时间线长度（一整天）与演示倍率。 */
const DOG_BEHAVIOR_DURATION_S = 24 * 3600;
/**
 * 演示倍率：1 秒真实时间当多少秒演示时间。
 *
 * 为什么是 12 而不是猫版的 20：狗的移动段短、频率高（走动/嗅闻占比大），
 * 倍率太高会让"走过去"这件事来不及发生（运动学上不允许瞬移，于是画面会卡在走路上）。
 * 12 是在"一天跑得完"与"每一步都看得清"之间的取值。
 */
const DOG_TIME_SCALE = 12;
/** 初始种子：与猫版不同的种子，避免两套演示长得像同一份数据。 */
const DOG_BEHAVIOR_SEED = 715;

/**
 * 呕吐物在画面里停留多久（**真实秒**，不是演示秒）。
 *
 * 为什么写死真实秒：用户的要求是"呕吐物 10 秒后消失"。演示倍率是 12×，
 * 若按演示秒算，10 演示秒 = 0.83 真实秒 —— 东西刚落地就没了，等于没做。
 * 这类"给人看的效果"一律用真实秒计时，与行为时间线的倍率解耦。
 */
const VOMIT_LINGER_S = 10;
/** 呕吐物落在狗嘴前方多远（米）与离地抬升（米）。 */
const VOMIT_FORWARD_M = 0.34;
const VOMIT_LIFT_M = 0.012;

/**
 * 水花在画面里活多久（**真实秒**）。
 *
 * 与呕吐物同一条理由：演示倍率是 12×，若按演示秒算，1 演示秒 = 0.083 真实秒 ——
 * 水花会快到看不见。这类"给人看的效果"一律用真实秒计时，与时间线的倍率解耦。
 */
const SPLASH_LIFE_S = 1;
/**
 * 水花落点的搜索范围（米）：从狗身前 `MIN` 起、每 `STEP` 试一点，最多到 `MAX`。
 *
 * 为什么要"搜"而不是固定距离：玩水的锚点有两个 —— 池边（`yard-pond`）与院内水盆
 * （`outdoor-water`），狗到位的站位离水面远近并不相同。固定 0.34 m 会让水花落在草地上，
 * 而"草地上一圈扩散的水环"恰恰是这一屏最容易露馅的地方。
 * 因此沿朝向往前找**第一个落在池面椭圆内的点**；找不到（水盆那一路）再退回狗身前一小步。
 */
const SPLASH_MIN_FORWARD_M = 0.3;
const SPLASH_MAX_FORWARD_M = 1.3;
const SPLASH_STEP_M = 0.05;
/** 落到"没有水面"那一档时相对地面的抬升（米）——避免与水盆/地面共面闪烁。 */
const SPLASH_LIFT_M = 0.02;
/**
 * 池塘水面相对草坪的下沉量（米）。
 *
 * ⚠️ 权威值在 `build-yard.ts` 的 `POND_WATER_DROP`（水面在 `YARD.groundY − 0.12`）。
 * 这里只读同一个数：`build-yard.ts` 不在本轮的改动范围里，而水花必须与水面对齐，
 * 所以留这一处带出处的常量，而不是让水花去猜。
 */
const POND_WATER_DROP_M = 0.12;
/** 水花的构成：水珠数量、水环的起始半径与扩散倍率上限（米 / 倍数）。 */
const SPLASH_DROPS = 7;
const SPLASH_RING_MIN_R = 0.05;
const SPLASH_RING_MAX_R = 0.26;
/** 水环在存活期结束时相对起始半径的倍率（0.26 / 0.05）。 */
const SPLASH_RING_SCALE_MAX = SPLASH_RING_MAX_R / SPLASH_RING_MIN_R;

export interface DogSceneStats {
  triangles: number;
  drawCalls: number;
  fps: number;
  models: number;
  textures: number;
}

export interface DogSceneCallbacks {
  onProgress?: (done: number, total: number, label: string) => void;
  onAssets?: (report: AssetReport) => void;
  onStats?: (stats: DogSceneStats) => void;
  onFatal?: (reason: string) => void;
}

export interface DogSceneOptions extends DogSceneCallbacks {
  canvasHost: HTMLElement;
  labelHost: HTMLElement;
  quality: QualityChoice;
  /** 系统级「减少动态效果」：关掉水面涟漪、抖动这类装饰动画 */
  reducedMotion: boolean;
  /** 自主行为的实时状态（当前活动、姿态、所在锚点、演示时钟、突发） */
  onBehaviorStatus?: (status: DogBehaviorStatus) => void;
  /** 已有行为时间线（由调用方提供）。缺省时本地按同一套规则生成一条 */
  behaviorTimeline?: DogBehaviorTimeline;
}

const CAMERA_FOV = 50;
/** 视野要装下 9.6 × 15 的地块（房 + 院），所以远裁剪面比猫版大一倍多。 */
const CAMERA_NEAR = 0.05;
const CAMERA_FAR = 260;

/**
 * 太阳：西北偏北、约 47° 高度角。
 *
 * 为什么是这个方位：院子在北侧、推拉门朝北 —— 光从北偏西打下来，
 * 既照亮院子草地，又能斜射进推拉门（室内才有"光是从院子进来的"这条读法）。
 * 高度角取 47° 而不是更低：低日照会把室内投出一排长影，把"温暖日系"压成"黄昏"。
 */
const SUN_OFFSET = new THREE.Vector3(-7.5, 12.5, -9.5);
/** 阴影目标点的初始位置（每帧跟随相机的 85%，两者之差即恒定入射方向）。 */
const SUN_TARGET = new THREE.Vector3(0, 0.5, -4);

/** 项圈相机画面的刷新率（帧/秒）。见 `updatePovFeed` 的取舍说明。 */
const POV_FPS = 8;
/** 项圈相机的视野（度）。比人眼常规镜头宽一些，接近常见运动相机的观感。 */
const POV_FOV_DEG = 78;
/** 机位下俯角（弧度，约 8°）：项圈在颈前偏下，自然会拍到地面，但主体视野要朝前。 */
const POV_PITCH_RAD = 0.14;
/** 机位平滑系数（每次刷新向目标插值的比例）：抑制姿势微动带来的抖动。 */
const POV_SMOOTH = 0.4;

interface CameraMove {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  t: number;
  duration: number;
}

/**
 * 一簇水花。
 *
 * `ring` 与它**自己那一份克隆材质**一起记下来，而不是回收时去判"这个子对象是不是那个环"：
 * 归属写进数据结构里，销毁路径就不需要任何类型判断（水环材质逐簇销毁、水珠材质共用）。
 */
interface SplashItem {
  obj: THREE.Object3D;
  bornAtMs: number;
  ring: THREE.Mesh;
  ringMaterial: THREE.MeshBasicMaterial;
}

export class DogHomeScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly labelLayer: HotspotLayer;
  private readonly sun: THREE.DirectionalLight;
  private readonly canvasHost: HTMLElement;
  private readonly clock = new THREE.Clock();
  private readonly callbacks: DogSceneCallbacks;
  private readonly hotspots: Hotspot[] = [];
  private settings: QualitySettings;
  private materialLib: MaterialLibrary | null = null;
  private gardenLib: GardenMaterials | null = null;
  private move: CameraMove | null = null;
  private running = false;
  private disposed = false;
  private hidden = false;
  private fpsEma = 60;
  private statTimer = 0;
  private labelsVisible = true;
  private reducedMotion = false;
  private applyCount = 0;
  private report: AssetReport | null = null;
  private statsEmitted = false;
  private resourceRings: THREE.Group | null = null;
  private yardDetail: THREE.Group | null = null;
  private facade: THREE.Object3D | null = null;
  private dogRig: DogRig | null = null;
  private dogController: DogController | null = null;
  private dogRuntime: DogBehaviorRuntime | null = null;
  private dogTimeline: DogBehaviorTimeline | null = null;
  private behaviorOnStatus: ((s: DogBehaviorStatus) => void) | null = null;
  private collarVisible = true;
  /** 项圈前端那颗镜头的网格（"狗视角"机位就架在它上面，按名字查一次） */
  private collarLens: THREE.Object3D | null = null;
  /** 主相机当前是否跟随角色：`dog` = 狗特写，`pov` = 项圈相机（狗视角） */
  private camFollow: 'none' | 'dog' | 'pov' = 'none';
  /**
   * 项圈相机（POV）离屏渲染的载体，App「实时」页那一格画面。
   *
   * 与猫版同一条纪律：**只在有人看的时候才渲染**（App 绑定了 canvas 才建渲染目标）。
   * 每帧多一遍渲染 + 一次 `readRenderTargetPixels`（会同步等 GPU）是实打实的开销，
   * 没人看的时候不该付这份钱 —— 切到别的页签就 `setPovCanvas(null)`，立刻停。
   */
  private povCanvas: HTMLCanvasElement | null = null;
  private povCtx: CanvasRenderingContext2D | null = null;
  private povTarget: THREE.WebGLRenderTarget | null = null;
  private povCamera: THREE.PerspectiveCamera | null = null;
  private povBuffer: Uint8Array | null = null;
  private povImage: ImageData | null = null;
  /** 上一次真正渲染这一路的时刻（节流用） */
  private povLastMs = 0;
  /** 累计渲染帧数（自检用：证明这一路真的在出画面，而不只是"绑上了"） */
  private povFrames = 0;
  /** 机位平滑状态（见 `updatePovFeed`）：眼睛位置与朝向各一份 */
  private povEyeSmooth: THREE.Vector3 | null = null;
  private povQuatSmooth: THREE.Quaternion | null = null;
  /** 地上的呕吐物：`{ obj, expiresAtMs }`，到期后从场景移除 */
  private readonly vomitPuddles: Array<{ obj: THREE.Object3D; expiresAtMs: number }> = [];
  private vomitMaterial: THREE.Material | null = null;
  private readonly vomitRoot: THREE.Group;
  /**
   * 水花：`{ obj, bornAtMs, ring }`，`SPLASH_LIFE_S` 之后连几何一起清掉。
   *
   * 与呕吐物的**结构性差异**是它会被反复生成：玩水时每完成一次前爪扒水就是一簇
   * （约 3.8 簇/秒），所以这一层是"高频短命"，必须能一边生成一边回收，
   * 且水环要在一秒里从中心扩散出去 —— 于是每簇带自己的水环材质（逐个淡出），
   * 水珠则共用一份材质（它们不改变透明度）。
   */
  private readonly splashes: SplashItem[] = [];
  private splashDropMaterial: THREE.MeshStandardMaterial | null = null;
  /** 水环的**基准**材质：每一簇克隆一份（淡出是逐簇的），基准留着做模板。 */
  private splashRingMaterial: THREE.MeshBasicMaterial | null = null;
  /** 水珠与水环的**共用几何**（单位尺寸，实际大小靠 `scale`）：整场只建一次。 */
  private splashDropGeometry: THREE.SphereGeometry | null = null;
  private splashRingGeometry: THREE.RingGeometry | null = null;
  private readonly splashRoot: THREE.Group;
  /** 累计生成过几簇水花（自检用：`live` 会随寿命归零，只有累计数能证明"真的在冒"） */
  private splashSpawned = 0;
  private readonly appliedIds = new Set<string>();
  private readonly onResizeBound: () => void;
  private readonly onVisibilityBound: () => void;
  private readonly onContextLostBound: (e: Event) => void;

  constructor(opts: DogSceneOptions) {
    this.canvasHost = opts.canvasHost;
    this.callbacks = {
      onProgress: opts.onProgress,
      onAssets: opts.onAssets,
      onStats: opts.onStats,
      onFatal: opts.onFatal,
    };
    this.settings = resolveQuality(opts.quality).settings;
    this.reducedMotion = opts.reducedMotion;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      opts.onFatal?.(err instanceof Error ? err.message : '浏览器未提供 WebGL 上下文');
      throw err;
    }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.settings.pixelRatioCap));
    renderer.setSize(this.canvasHost.clientWidth || 1, this.canvasHost.clientHeight || 1, false);
    renderer.shadowMap.enabled = this.settings.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'scene-canvas';
    this.canvasHost.appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = skyTexture();

    const start = CAMERA_PRESETS[0];
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      (this.canvasHost.clientWidth || 1) / (this.canvasHost.clientHeight || 1),
      CAMERA_NEAR,
      CAMERA_FAR,
    );
    if (start) {
      this.camera.position.set(...start.position);
    }

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    if (start) this.controls.target.set(...start.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.0;
    // 上限要装得下「站在院外看整栋房子」（约 20 m），猫版的 16 在这里不够用
    this.controls.maxDistance = 46;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.minPolarAngle = 0.1;
    this.controls.rotateSpeed = 0.75;
    this.controls.zoomSpeed = 0.8;
    this.controls.panSpeed = 0.6;
    this.controls.update();

    // 光：一盏高角度日光（唯一投影源）+ 天光/地面反弹 + 室内暖光补光
    this.sun = new THREE.DirectionalLight(0xfff3e0, 3.2);
    this.sun.position.copy(SUN_TARGET).add(SUN_OFFSET);
    this.sun.target.position.copy(SUN_TARGET);
    this.sun.castShadow = this.settings.shadows;
    this.sun.shadow.mapSize.set(this.settings.shadowMapSize, this.settings.shadowMapSize);
    // 阴影范围要覆盖整个地块（约 20 × 20 m 含外扩），否则院子边缘的树影会整齐地断掉
    this.sun.shadow.camera.left = -13;
    this.sun.shadow.camera.right = 13;
    this.sun.shadow.camera.top = 13;
    this.sun.shadow.camera.bottom = -13;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const hemi = new THREE.HemisphereLight(0xdceaf7, 0x6f7a52, 0.24);
    this.scene.add(hemi);
    // 室内补光：厨房岛台上方与起居区各一盏（不投影）
    const kitchenLight = new THREE.PointLight(0xffd9a8, 8, 7.5, 2);
    kitchenLight.position.set(-1.5, 2.45, 1.65);
    this.scene.add(kitchenLight);
    const livingLight = new THREE.PointLight(0xffe0bb, 6, 7, 2);
    livingLight.position.set(2.4, 2.55, 0.3);
    this.scene.add(livingLight);

    // 建模
    const mats = new MaterialLibrary();
    const garden = new GardenMaterials();
    this.materialLib = mats;
    this.gardenLib = garden;
    const root = new THREE.Group();
    root.name = 'dog-home';
    this.scene.add(root);

    buildDogRoom(root, mats);
    buildDogKitchen(root, mats);
    const furniture = buildDogFurniture(root, mats);
    const gear = buildDogGear(root, mats);
    this.resourceRings = gear.resourceRings;
    const yard = buildYard(root, mats, garden, this.settings.decorativeModels);
    this.yardDetail = yard.detail;
    this.facade = root.getObjectByName('garden-facade') ?? null;

    this.labelLayer = new HotspotLayer(opts.labelHost);
    this.registerHotspots();

    // 呕吐物的宿主：独立一层，方便整层清理，也不会被"隐藏狗"这类开关连带关掉
    this.vomitRoot = new THREE.Group();
    this.vomitRoot.name = 'dog-vomit';
    this.scene.add(this.vomitRoot);

    // 水花的宿主：**也是独立一层**，但理由与呕吐物不同 ——
    // 水花在玩水时每秒生成好几簇、一秒内又全部消失，是典型的高频短命对象。
    // 给它自己一层，"到点整层回收"才有明确的边界；与呕吐物混在一层里，
    // 一层里就同时装着"停 10 秒"和"活 1 秒"两种寿命的东西，清理逻辑会互相牵扯。
    this.splashRoot = new THREE.Group();
    this.splashRoot.name = 'dog-splash';
    this.scene.add(this.splashRoot);

    // ---- 柴犬：模型 → 控制器 → 时间线 → 运行时
    this.buildDog(opts);

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
    // 低画质档砍掉草簇与花这类纯装饰实例（上千个实例的填充开销）
    if (this.yardDetail) this.yardDetail.visible = this.settings.decorativeModels;
    // 毛壳层同理：写实轮廓靠它柔化，但它是纯装饰
    if (this.dogRig) {
      for (const shell of this.dogRig.furShells) {
        const layer = (shell.userData.furLayer as number | undefined) ?? 1;
        shell.visible = layer <= (this.settings.decorativeModels ? 4 : 0);
      }
    }
    this.scene.environmentIntensity = this.settings.envIntensity;
    this.resize();
  }

  setLabelsVisible(on: boolean): void {
    this.labelsVisible = on;
    this.labelLayer.setVisible(on);
  }

  isLabelsVisible(): boolean {
    return this.labelsVisible;
  }

  /** 狗的用品高亮环（独立几何，不影响共享材质）。 */
  setHighlightsVisible(on: boolean): void {
    if (this.resourceRings) this.resourceRings.visible = on;
  }

  isHighlightsVisible(): boolean {
    return this.resourceRings?.visible ?? false;
  }

  /**
   * 整块院子（含草坪、树、池塘、休闲区）的显隐。
   *
   * 存在的理由：看清室内家具时，院子会占掉画面一半并干扰地平线；
   * 反过来看院子时也不希望屋里的东西抢视线。
   */
  setGardenVisible(on: boolean): void {
    const yard = this.scene.getObjectByName('dog-yard');
    if (yard) yard.visible = on;
  }

  isGardenVisible(): boolean {
    return this.scene.getObjectByName('dog-yard')?.visible ?? false;
  }

  /**
   * 朝院子的那面**外墙皮**的显隐。
   *
   * 关闭 = 娃娃屋剖视（墙只剩内侧单面平面，从屋外能直接看进屋里）；
   * 打开 = 站在院子里能看到一面真的外墙。默认打开 —— 用户要的是"真实的场景"，
   * 而院子那一侧看不到外墙就不成立。
   */
  setFacadeVisible(on: boolean): void {
    if (this.facade) this.facade.visible = on;
  }

  isFacadeVisible(): boolean {
    return this.facade?.visible ?? false;
  }

  preset(id: string, immediate = false): void {
    /*
     * 两个**动态机位**：坐标每帧都不成立，所以不能放进 `CAMERA_PRESETS`（那是静态世界坐标表）。
     *   - `dog-follow`：狗特写 —— 相机挂在狗的斜后方，跟着它走、跟着它转；
     *   - `dog-cam`：狗视角 —— 相机站在项圈前端那颗镜头上（App「实时」页那一格），
     *     渲染时把狗自己隐藏（真实项圈相机也拍不到自己的后脑勺）。
     * 与猫版的 `cat-follow` / `collar-cam` 同一套做法。
     */
    if (id === 'dog-follow' || id === 'dog-cam') {
      this.camFollow = id === 'dog-follow' ? 'dog' : 'pov';
      this.move = null;
      // 先直接到位：从上一个机位平滑飞过去时，路上会穿过家具或钻进狗身体里
      if (this.camFollow === 'dog') this.followDogCamera(1);
      else this.followPovCamera(1);
      return;
    }
    this.camFollow = 'none';
    const hit = CAMERA_PRESETS.find((p) => p.id === id);
    if (!hit) return;
    this.moveTo(hit.position, hit.target, immediate ? 0 : 0.9);
  }

  /** 当前主相机是否在跟随（自检用）。 */
  cameraFollow(): 'none' | 'dog' | 'pov' {
    return this.camFollow;
  }

  /**
   * 狗特写：相机在狗的**斜后方**（按它当前朝向算），看向它的胸口。
   *
   * 为什么按朝向算而不是固定世界偏移：手写的偏移在狗转身后会钻进家具里
   * （猫版踩过这个坑）。跟着朝向走，任何位置与朝向都成立。
   */
  private followDogCamera(k: number): void {
    const t = this.dogRuntime?.getTransform();
    if (!t) return;
    const angle = t.heading + Math.PI + 0.62;
    const dist = 1.25;
    const eye = new THREE.Vector3(t.x + Math.sin(angle) * dist, t.y + 0.62, t.z + Math.cos(angle) * dist);
    const look = new THREE.Vector3(t.x, t.y + 0.26, t.z);
    const lerp = Math.min(1, k);
    this.camera.position.lerp(eye, lerp);
    this.controls.target.lerp(look, lerp);
    this.controls.update();
  }

  /**
   * 狗视角：相机站在项圈前端镜头上，朝狗的**前进方向**略向下看。
   *
   * 朝向取运行时的 `heading` 而不是镜头网格自身的朝向：镜头是个旋转过的圆柱，
   * 它的局部轴与"狗往哪看"并不一致；用 heading 更直接、也不会被姿态动画带偏。
   * 视角高度与朝向因此**就是这只狗的项圈实际所在的位姿**。
   */
  private followPovCamera(k: number): void {
    const lens = this.collarLens;
    if (!lens) return;
    lens.updateWorldMatrix(true, false);
    const eye = new THREE.Vector3().setFromMatrixPosition(lens.matrixWorld);
    const t = this.dogRuntime?.getTransform();
    const yaw = t?.heading ?? 0;
    const look = new THREE.Vector3(
      eye.x + Math.sin(yaw) * 1.6,
      eye.y - 0.42,
      eye.z + Math.cos(yaw) * 1.6,
    );
    const lerp = Math.min(1, k);
    this.camera.position.lerp(eye, lerp);
    this.controls.target.lerp(look, lerp);
    this.controls.update();
  }

  /**
   * 在狗嘴前方落一团呕吐物。
   *
   * 位置由**运行时给的位置与朝向**推导（不是从骨骼算），因为运行时那一份是权威的
   * 世界变换；落点再按局部地面高度抬 12 mm，避免与地板/草坪共面闪烁。
   */
  private spawnVomitMatter(): void {
    const t = this.dogRuntime?.getTransform();
    if (!t) return;
    if (!this.vomitMaterial) {
      // 一次性建材质：淡黄褐、偏低粗糙度（湿的）
      this.vomitMaterial = new THREE.MeshStandardMaterial({ color: 0xbda86a, roughness: 0.32, metalness: 0.02 });
    }
    const x = t.x + Math.sin(t.heading) * VOMIT_FORWARD_M;
    const z = t.z + Math.cos(t.heading) * VOMIT_FORWARD_M;
    const y = groundHeightAt(x, z) + VOMIT_LIFT_M;

    const g = new THREE.Group();
    g.name = 'vomit-matter';
    g.position.set(x, y, z);
    g.rotation.y = t.heading + 0.6;
    // 三团压扁的不规则多面体叠成一摊 + 两滴飞溅，形状刻意不对称
    const blobs: ReadonlyArray<[number, number, number, number, number]> = [
      [0, 0, 0, 0.062, 0.34],
      [0.045, 0.004, 0.02, 0.04, 0.32],
      [-0.04, 0.003, -0.028, 0.045, 0.3],
      [0.085, 0.003, -0.05, 0.019, 0.45],
      [-0.075, 0.002, 0.055, 0.015, 0.4],
    ];
    for (const [bx, by, bz, r, flat] of blobs) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), this.vomitMaterial);
      mesh.position.set(bx, by + r * flat * 0.5, bz);
      mesh.scale.set(1, flat, 1);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    this.vomitRoot.add(g);
    this.vomitPuddles.push({ obj: g, expiresAtMs: performance.now() + VOMIT_LINGER_S * 1000 });
  }

  /** 到期的呕吐物逐帧清理（几何随之 dispose，材质共用、留到场景销毁）。 */
  private expireVomitMatter(): void {
    const now = performance.now();
    for (let i = this.vomitPuddles.length - 1; i >= 0; i--) {
      const item = this.vomitPuddles[i];
      if (!item || now < item.expiresAtMs) continue;
      item.obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      item.obj.removeFromParent();
      this.vomitPuddles.splice(i, 1);
    }
  }

  /** 自检用：地上还有几团呕吐物。 */
  vomitCount(): number {
    return this.vomitPuddles.length;
  }

  /**
   * 水花的落点：**狗前方最近的水面**。
   *
   * 从狗身前 0.3 m 起沿朝向每 5 cm 试一点，第一个落进池塘水面椭圆（按 0.95 收缩，
   * 免得水花压在压顶石上）的就是落点，并取池塘水面高度；都没命中（玩水锚点是院内水盆）
   * 就退回狗身前一小步的地面，抬 2 cm。
   */
  private splashPoint(): { x: number; y: number; z: number } | null {
    const t = this.dogRuntime?.getTransform();
    if (!t) return null;
    const dirX = Math.sin(t.heading);
    const dirZ = Math.cos(t.heading);
    const waterY = YARD.groundY - POND_WATER_DROP_M;
    for (let d = SPLASH_MIN_FORWARD_M; d <= SPLASH_MAX_FORWARD_M; d += SPLASH_STEP_M) {
      const x = t.x + dirX * d;
      const z = t.z + dirZ * d;
      const ex = (x - POND.x) / (POND.rx * 0.95);
      const ez = (z - POND.z) / (POND.rz * 0.95);
      if (ex * ex + ez * ez < 1) return { x, y: waterY, z };
    }
    const x = t.x + dirX * SPLASH_MIN_FORWARD_M;
    const z = t.z + dirZ * SPLASH_MIN_FORWARD_M;
    return { x, y: groundHeightAt(x, z) + SPLASH_LIFT_M, z };
  }

  /**
   * 一小簇水花：几颗水珠 + 一圈扩散的水环。
   *
   * 形状照 `spawnVomitMatter` 的结构写（独立宿主、共用材质、到期 dispose），
   * 两处刻意的不同：
   *   1. **水珠的位置由计数器派生**（确定性伪随机），不是 `Math.random()` ——
   *      同一段演示重播两次要长得一样，这样"水花在哪、多大"才是可复现的。
   *   2. 水环带**自己的一份材质**：它要在一秒里淡出，而水珠不变透明度。
   *      共用一份材质的话，先淡出的那簇会把后生成的那簇也一起淡掉。
   */
  private spawnSplash(): void {
    const p = this.splashPoint();
    if (!p) return;
    if (!this.splashDropMaterial) {
      this.splashDropMaterial = new THREE.MeshStandardMaterial({
        color: 0xdfeef7,
        roughness: 0.12,
        metalness: 0,
        transparent: true,
        opacity: 0.92,
      });
    }
    if (!this.splashRingMaterial) {
      this.splashRingMaterial = new THREE.MeshBasicMaterial({
        color: 0xe8f4fb,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    }
    // 共用的单位几何：水花每秒生成好几簇，不该按"每簇 7 颗水珠"去建几何
    if (!this.splashDropGeometry) this.splashDropGeometry = new THREE.SphereGeometry(1, 6, 5);
    if (!this.splashRingGeometry) this.splashRingGeometry = new THREE.RingGeometry(1, 1.5, 28);
    /**
     * 确定性伪随机（0–1）：同一簇内的每颗水珠取到不同的偏移量。
     *
     * 为什么不用 `Math.random()`：同一段演示重播两次要长得一样 ——
     * "这一簇水花多大、落在哪"因此是可复现的（与场景里其它散布用确定性 RNG 同一条纪律）。
     */
    const seed = this.splashSpawned;
    const wobble = (n: number): number => {
      const s = Math.sin((seed + 1) * (n + 1) * 12.9898) * 43758.5453;
      return s - Math.floor(s);
    };

    const g = new THREE.Group();
    g.name = 'splash';
    g.position.set(p.x, p.y, p.z);
    // 水珠：绕落点撒一圈，半径与高度都错开（"统一往上喷"会读成喷泉）
    for (let i = 0; i < SPLASH_DROPS; i++) {
      const a = (i / SPLASH_DROPS) * Math.PI * 2 + wobble(i) * 0.9;
      const r = 0.035 + wobble(i + 11) * 0.055;
      const drop = new THREE.Mesh(this.splashDropGeometry, this.splashDropMaterial);
      // 单位球靠缩放给大小：几何**整场共用一份**，不按"每簇 7 颗"去建
      drop.scale.setScalar(0.009 + wobble(i + 23) * 0.008);
      drop.position.set(Math.cos(a) * r, 0.018 + wobble(i + 37) * 0.045, Math.sin(a) * r);
      // 记下初始高度：存活期里按重力往下落（见 `expireSplash`）
      drop.userData.y0 = drop.position.y;
      drop.castShadow = false;
      drop.receiveShadow = false;
      g.add(drop);
    }
    // 水环：贴水面的圆环，存活期内向外扩散并淡出。
    //   几何：单位环（半径 1–1.5）整场共用，实际大小由 `scale` 给。
    //   材质：**逐簇克隆** —— 淡出是逐簇的事，共用一份会让先淡出的那簇把后面的也淡掉。
    const ringMaterial = this.splashRingMaterial.clone();
    const ring = new THREE.Mesh(this.splashRingGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.003;
    ring.scale.setScalar(SPLASH_RING_MIN_R);
    g.add(ring);

    this.splashRoot.add(g);
    this.splashes.push({ obj: g, bornAtMs: performance.now(), ring, ringMaterial });
    this.splashSpawned += 1;
  }

  /**
   * 水花逐帧推进 + 到点回收。
   *
   * 推进两件事：水环向外扩散并淡出、水珠按重力落回水面。
   * 回收只销毁**这一簇自己的**东西：水环的克隆材质（几何与水珠材质都是全场共用的，
   * 留到 `dispose()`）—— 归属写清楚，就不会出现"每簇漏一份材质"或"共用的被提前销毁"。
   */
  private expireSplash(): void {
    const now = performance.now();
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const item = this.splashes[i];
      if (!item) continue;
      const age = (now - item.bornAtMs) / 1000;
      if (age >= SPLASH_LIFE_S) {
        item.ringMaterial.dispose();
        item.obj.removeFromParent();
        this.splashes.splice(i, 1);
        continue;
      }
      const k = Math.min(1, Math.max(0, age / SPLASH_LIFE_S));
      const s = SPLASH_RING_MIN_R * (1 + k * (SPLASH_RING_SCALE_MAX - 1));
      item.ring.scale.set(s, s, 1);
      item.ringMaterial.opacity = 0.5 * (1 - k);
      for (const child of item.obj.children) {
        if (child === item.ring) continue;
        const y0 = (child.userData.y0 as number | undefined) ?? 0;
        // 水珠落回水面：二次曲线；夹在 4 mm 之上，免得沉到水面/地面以下
        child.position.y = Math.max(y0 - 0.9 * age * age, 0.004);
      }
    }
  }

  /** 自检用：画面里还活着几簇水花。 */
  splashCount(): number {
    return this.splashes.length;
  }

  /**
   * 自检用：水花这一路的运行事实（`povState` 那套"可断言的仪器"思路）。
   *
   * 为什么 `spawned` 与 `live` 要分开报：只看 `live` 的话，"一次都没生成"与
   * "生成得刚好都在采样前消失了"分不开 —— 而水花的寿命只有 1 秒，后者完全可能。
   * 两个数一起看，才能证明"玩水时真的在冒水花"（`spawned` 持续增长）
   * 且"水花不是一直赖着不走"（`live` 有界）。
   */
  splashState(): { live: number; spawned: number; lifeS: number; waterY: number } {
    return {
      live: this.splashes.length,
      spawned: this.splashSpawned,
      lifeS: SPLASH_LIFE_S,
      waterY: Number((YARD.groundY - POND_WATER_DROP_M).toFixed(3)),
    };
  }

  /**
   * 自检用：最近一次突发期间的位移（米）。
   * 用户要求突发"原地发生"，所以这个数应该恒为 0.000 —— 非 0 就是"点了抽搐狗先跑开一段"。
   */
  incidentDrift(): { kind: DogIncidentKind; driftM: number } | null {
    return this.dogRuntime?.incidentDrift() ?? null;
  }

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

  getStats(): DogSceneStats {
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

  /** 自检用：某个扫描模型槽位当前是「真模型 / 程序化占位 / 缺失」。 */
  slotState(id: string): 'model' | 'placeholder' | 'none' {
    if (this.appliedIds.has(id)) return 'model';
    return this.scene.getObjectByName(`placeholder-${id}`) ? 'placeholder' : 'none';
  }

  /** 自检用：场景里还残留几个程序化占位件。 */
  placeholderCount(): number {
    let n = 0;
    this.scene.traverse((obj) => {
      if (obj.name.startsWith('placeholder-')) n += 1;
    });
    return n;
  }

  // ---------------------------------------------------------------- 柴犬

  /**
   * 装配柴犬：模型 → 控制器 → 时间线 → 运行时。
   *
   * 四条分工不许越界（越界就是"倒着走 / 瞬移"这类故障的来源）：
   *   - 模型只负责几何与关节；
   *   - 控制器只写 `body` 及以下的**姿态**，绝不碰 `root`；
   *   - 运行时只写 `root` 的**世界变换**，姿态交给控制器；
   *   - 时间线只谈语义与时间，不谈坐标。
   */
  private buildDog(opts: DogSceneOptions): void {
    const furLayers = this.settings.decorativeModels ? 4 : 0;
    const rig = buildShibaRig(furLayers);
    this.dogRig = rig;
    this.scene.getObjectByName('dog-home')?.add(rig.root);
    rig.collar.visible = this.collarVisible;

    this.dogController = new DogController(rig, { reducedMotion: opts.reducedMotion });
    this.behaviorOnStatus = opts.onBehaviorStatus ?? null;
    // "狗视角"机位就架在这颗镜头上：按名字查一次，查不到就退化为主相机不动
    // （`check-dog-pose.mjs` 断言这个名字存在，改名会被门禁拦住）
    this.collarLens = rig.collar.getObjectByName('collar-camera') ?? null;

    const timeline =
      opts.behaviorTimeline ??
      buildDogTimeline({
        seed: DOG_BEHAVIOR_SEED,
        durationS: DOG_BEHAVIOR_DURATION_S,
        timeScale: DOG_TIME_SCALE,
        anchors: DOG_ANCHOR_SPECS,
      });
    this.applyTimeline(timeline, 0);
  }

  /**
   * 换一条时间线，并从 `startAtS` 继续跑。
   *
   * 与猫版同一条纪律：突发演示由**持有会话/时间线的一侧**重建时间线后交给这里，
   * 而不是让场景自己在内部另建一条 —— 否则画面与数据会变成两条时间线。
   */
  applyTimeline(timeline: DogBehaviorTimeline, startAtS = 0): void {
    if (!this.dogController) return;
    this.dogTimeline = timeline;
    this.dogRuntime = new DogBehaviorRuntime(timeline, this.dogController, {
      startAtS: Math.max(0, startAtS),
      timeScale: timeline.timeScale,
      onStatus: (status) => this.behaviorOnStatus?.(status),
    });
  }

  behaviorStatus(): DogBehaviorStatus | null {
    return this.dogRuntime?.status() ?? null;
  }

  setBehaviorPaused(on: boolean): void {
    this.dogRuntime?.setPaused(on);
  }

  isBehaviorPaused(): boolean {
    return this.dogRuntime?.isPaused() ?? true;
  }

  /** 演示时刻（会话内秒）。手机上按它取读数，保证与画面同一时刻。 */
  simTimeS(): number {
    return this.dogRuntime?.getTimeS() ?? 0;
  }

  /** 狗的世界坐标（保留两位），自检与调试用。 */
  dogPosition(): [number, number, number] | undefined {
    const t = this.dogRuntime?.getTransform();
    if (!t) return undefined;
    return [round2(t.x), round2(t.y), round2(t.z)];
  }

  /** 自检用：当前姿态参数快照。 */
  dogPose(): DogPoseSnapshot | null {
    return this.dogController?.snapshot() ?? null;
  }

  /** 自检用：当前突发动作幅度（区分「标签在报」与「身体真的在动」）。 */
  incidentMotion(): Record<string, number> | null {
    return this.dogController?.incidentMotionSnapshot() ?? null;
  }

  /** 自检用：当前演示中的突发种类。 */
  currentIncident(): DogIncidentKind | null {
    return this.dogRuntime?.status().incident ?? null;
  }

  /**
   * 手动触发一次突发演示：**重建时间线**并在当前演示时刻注入。
   *
   * 为什么不直接在运行时插队：注入会改变段落的长度分配，而"区间首尾相接、覆盖满时长"
   * 是时间线的不变量。重建时间线能让"注入 → 还原"这条链路保持成立。
   */
  triggerIncident(kind: DogIncidentKind): void {
    if (!this.dogController) return;
    const atS = Math.max(1, this.dogRuntime?.getTimeS() ?? 0);
    const next = buildDogTimeline({
      seed: this.dogTimeline?.seed ?? DOG_BEHAVIOR_SEED,
      durationS: this.dogTimeline?.durationS ?? DOG_BEHAVIOR_DURATION_S,
      timeScale: this.dogTimeline?.timeScale ?? DOG_TIME_SCALE,
      anchors: DOG_ANCHOR_SPECS,
      injectIncidents: [{ atS, kind }],
    });
    this.applyTimeline(next, Math.max(0, atS - 1));
  }

  /** 突发的**动画真实时长**（秒），供 HUD 与自检读。 */
  incidentDuration(kind: DogIncidentKind): number {
    return incidentRealSeconds(kind);
  }

  /**
   * 手动触发一次活动：**让它现在走过去、然后做这件事**。
   *
   * ⚠️ 与 `triggerIncident` 的关键差别：**这里不重建时间线、不换会话**。
   *   突发注入必须重建时间线（它要改动区间的长度分配，见 `triggerIncident` 的说明），
   *   而"现在去做这件事"只是**运行时的一次改道**：时间线一个字节都没动，
   *   所以画面、事件流与 App 读数仍然共用同一条时间轴 —— 这正是本方法的调用方
   *   （`screens/dog.ts`）**不许**在这里重建会话的理由。
   *
   * 返回 `false` 表示该活动在当前锚点表下没有可用锚点，运行时**什么都没做**。
   */
  goDo(activity: DogActivityId): boolean {
    return this.dogRuntime?.goDo(activity) ?? false;
  }

  /**
   * 自检用：最近一次手动触发是什么、到没到、走了多远。
   * 与 `incidentDrift()` 配成一对（那一条证明"一帧没动"，这一条证明"真的走过去了"）。
   */
  lastGoDo(): DogManualTrigger | null {
    return this.dogRuntime?.lastGoDo() ?? null;
  }

  /** 位移探针：记录接下来这段时间的逐帧位置与朝向（"不瞬移 / 不倒着走"的实跑证据）。 */
  startMotionProbe(durationS: number): void {
    this.dogRuntime?.startProbe(durationS);
  }

  motionProbe(): ReturnType<DogBehaviorRuntime['probeResult']> {
    return this.dogRuntime?.probeResult() ?? null;
  }

  /** 柴犬的体尺（供自检核对"模型尺度与布局相符"）。 */
  get dogMetrics(): typeof SHIBA_METRICS {
    return SHIBA_METRICS;
  }

  /** 项圈硬件（本项目的产品形态）的显隐。 */
  setCollarVisible(on: boolean): void {
    this.collarVisible = on;
    if (this.dogRig) this.dogRig.collar.visible = on;
  }

  isCollarVisible(): boolean {
    return this.collarVisible;
  }

  /** 自检用：项圈的部件数（形态方案的可断言事实）。 */
  collarPartCount(): number {
    return this.dogRig?.collar.children.length ?? 0;
  }

  // ---------------------------------------------------------------- 项圈相机（POV）离屏画面

  /**
   * 绑定/解绑 App「实时」页里的画面画布。
   *
   * 传 `null` 即停止渲染 —— 这是省电纪律：没人看的画面不渲染（见 `povCanvas` 字段）。
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
    // 尺寸没变就**复用**渲染目标：App 每次切回「实时」页都会重绑一次，
    // 若每次都新建，分配开销与"首帧还没写进去"会叠在一起，画面就会闪一下。
    if (this.povTarget && (this.povTarget.width !== w || this.povTarget.height !== h)) {
      this.povTarget.setSize(w, h);
      this.povCamera = null;
      this.povBuffer = null;
      this.povImage = null;
    }
    if (!this.povTarget) {
      this.povTarget = new THREE.WebGLRenderTarget(w, h, {
        depthBuffer: true,
        // 线性过滤 + 不生成 mipmap：读回来的像素要的就是"这一帧"，不做任何额外处理
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      });
    }
    if (!this.povCamera) this.povCamera = new THREE.PerspectiveCamera(POV_FOV_DEG, w / h, 0.03, 60);
    if (!this.povBuffer) this.povBuffer = new Uint8Array(w * h * 4);
    this.povImage = null;
    // 绑定时丢掉平滑状态（这是相对猫版唯一有意加的一步，理由与狗有关）：
    // 解绑期间狗可能已经走到院子另一头，若首帧仍从上次的机位插值过去，
    // 切回「实时」页看到的会是一张"半旧"的画面（甚至卡在墙里）。
    // 首帧直接对上真实位姿，之后才进入平滑。
    this.povEyeSmooth = null;
    this.povQuatSmooth = null;
  }

  /** 自检用：项圈相机这一路的运行事实。 */
  povState(): {
    bound: boolean;
    frames: number;
    width: number;
    height: number;
    /** 镜头离**狗所站地面**的高度（米）——用来核对"视角高度与这只狗的真实项圈位置一致" */
    eyeHeightM: number;
    /** 主相机当前是否就站在项圈镜头上（`dog-cam` 机位） */
    follow: boolean;
  } {
    const lens = this.collarLens;
    const rig = this.dogRig;
    let eyeHeightM = 0;
    if (lens && rig) {
      lens.updateWorldMatrix(true, false);
      const eye = new THREE.Vector3().setFromMatrixPosition(lens.matrixWorld);
      // 相对 root 的高度：运行时的 root.y 就是脚下地面高度（见 `groundHeightAt`），
      // 因此两者之差正是"这颗镜头离地多高"，与房间高度、池塘下沉无关。
      eyeHeightM = Number((eye.y - rig.root.position.y).toFixed(3));
    }
    return {
      bound: this.povCanvas !== null,
      frames: this.povFrames,
      width: this.povCanvas?.width ?? 0,
      height: this.povCanvas?.height ?? 0,
      eyeHeightM,
      follow: this.camFollow === 'pov',
    };
  }

  /**
   * 当前机位模式下狗自己「应有的可见性」。
   *
   * 为什么提成一个函数：**两处**渲染都要求"项圈相机拍不到狗自己"——
   * 主相机走在 `pov` 机位时算一处（见 `tick`），App「实时」页那一路离屏渲染是另一处。
   * 它们必须回到同一个基准，而不是各自无脑置 `true`：否则离屏渲染一结束，
   * 就把正处在项圈机位里的主相机那一路的隐藏给撤销了，画面里重新长出一只后脑勺。
   */
  private dogSelfVisible(): boolean {
    return this.camFollow !== 'pov';
  }

  /**
   * 渲染一帧项圈相机画面，并写进 App「实时」页的画布。
   *
   * 三条工程取舍（照抄猫版，理由同样成立）：
   *   1. **节流到约 8 fps**：每帧多一遍渲染 + 一次 `readRenderTargetPixels`（会同步等 GPU）
   *      代价不小，而"看看它在哪"这件事不需要 60 fps。
   *   2. **渲染时隐藏狗自己**：真实项圈相机拍不到自己的后脑勺，不隐藏的话画面里全是毛。
   *   3. **只在有人看时渲染**：App 绑定 canvas 才创建渲染目标，切走就停止（见 `setPovCanvas`）。
   *
   * 机位与 `followPovCamera` 同一套逻辑：眼睛取镜头网格的世界位置（颈部姿态由控制器写，
   * 这里直接读结果），朝向取运行时的 `heading` 再叠加一个小幅下俯角 ——
   * 不用镜头网格自身的朝向，因为那颗镜头是旋转过的圆柱，局部轴与"狗往哪看"并不一致。
   */
  private updatePovFeed(): void {
    const canvas = this.povCanvas;
    const ctx = this.povCtx;
    const target = this.povTarget;
    const cam = this.povCamera;
    const lens = this.collarLens;
    const rig = this.dogRig;
    const buffer = this.povBuffer;
    if (!canvas || !ctx || !target || !cam || !lens || !rig || !buffer) return;

    const wall = performance.now();
    const intervalMs = 1000 / POV_FPS;
    if (wall - this.povLastMs < intervalMs) return;
    // 用固定步长推进"上一次"而不是直接赋值 now：帧率低于 POV_FPS 时不会积攒出一个
    // 巨大的间隔（那会让下一帧立刻又渲染一次），画面节奏更稳。
    this.povLastMs = wall - Math.min(intervalMs, wall - this.povLastMs) + intervalMs;

    lens.updateWorldMatrix(true, false);
    const eye = new THREE.Vector3().setFromMatrixPosition(lens.matrixWorld);
    const yaw = this.dogRuntime?.getTransform().heading ?? 0;
    // 朝向：heading 约定「狗面朝 +Z」（见 `dog-rig.ts`），而相机的默认视线是 **-Z**，
    // 所以先绕 Y 转 `yaw + π` 让视线对上 +Z，再在局部坐标里下俯 —— 与猫版
    // "先取朝向、再 `rotateX(-POV_PITCH_RAD)`"的两步是同一个顺序。
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + Math.PI);
    // 一阶平滑：姿势动画（重心转移、呼吸、甩头）会让机位有厘米级抖动，
    // 在 8 fps 的采样下抖动会被放大成"一跳一跳"。系数取得较大，几乎没有延迟。
    if (this.povEyeSmooth && this.povQuatSmooth) {
      this.povEyeSmooth.lerp(eye, POV_SMOOTH);
      this.povQuatSmooth.slerp(quat, POV_SMOOTH);
      cam.position.copy(this.povEyeSmooth);
      cam.quaternion.copy(this.povQuatSmooth);
    } else {
      this.povEyeSmooth = eye.clone();
      this.povQuatSmooth = quat.clone();
      cam.position.copy(eye);
      cam.quaternion.copy(quat);
    }
    // 项圈在颈前偏下，自然会拍到一些地面；这里只给一个小幅下俯角，
    // 主要视野仍朝前 —— "便于寻找它的位置"要求看得见房间与院子，而不是只看得见地板。
    cam.rotateX(-POV_PITCH_RAD);

    const wasVisible = rig.root.visible;
    rig.root.visible = false;
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, cam);
    this.renderer.setRenderTarget(prevTarget);
    // 恢复成"当前机位模式下应有的可见性"，而不是无脑 `true`：主相机此刻可能正走在
    // `pov` 机位里（那时它也必须保持隐藏），两件事不能互相覆盖；
    // `wasVisible &&` 另外保住"外部出于别的原因把狗藏起来"这个意图。
    rig.root.visible = wasVisible && this.dogSelfVisible();

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

  /**
   * 自检用：各功能组的**结构规模**（节点数 / 网格数）。
   *
   * 为什么按「组 + 计数」而不是按「用户清单逐项打勾」：逐项打勾要靠**节点命名**去反查，
   * 而命名是各构建器自己的事 —— 一旦有人改个名字，自检就会报"东西没建"，
   * 变成一条只会误报的断言。规模计数对命名不敏感，却能如实反映
   * 「这个组到底建没建、建得够不够多」。
   * `PROGRAM` 那份清单仍然是场景应当包含什么的书面依据（见 `layout-dog.ts`），
   * 但**不**假装自己是机器校验过的。
   */
  structure(): Array<{ name: string; nodes: number; meshes: number }> {
    const groups = [
      'dog-room-shell',
      'garden-facade',
      'engawa',
      'dog-kitchen',
      'dog-furniture',
      'dog-gear',
      'dog-yard',
      ...(this.dogRig ? [this.dogRig.root.name || 'shiba'] : []),
    ];
    const rows = groups.map((name) => {
      const target = this.scene.getObjectByName(name);
      let nodes = 0;
      let meshes = 0;
      target?.traverse((obj) => {
        nodes += 1;
        if ((obj as THREE.Mesh).isMesh) meshes += 1;
      });
      return { name, nodes, meshes };
    });
    /**
     * 多一行**手动触发**的计数器。
     *
     * 为什么用"触发过几次"而不是"最近一次是什么"：这一行的读者是 `?debug=1` 徽章，
     * 它每秒重绘一次 —— 列最近一次会一直显示旧值，而计数器一眼就能看出
     * 「按钮到底接没接上」（点了不加 = 回调没接上）。详情的自检出口是 `lastGoDo()`。
     * 计为 0 的行不影响既有断言（它们按组名查，不按行数）。
     */
    rows.push({ name: 'dogManual', nodes: this.dogRuntime?.manualTriggerCount() ?? 0, meshes: 0 });
    return rows;
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
    this.dogController?.dispose();
    // 呕吐物的几何是临时创建的，材质是共用的 —— 各自按归属销毁
    for (const item of this.vomitPuddles) {
      item.obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      item.obj.removeFromParent();
    }
    this.vomitPuddles.length = 0;
    this.vomitMaterial?.dispose();
    // 水花：几何与基准材质**全场共用**（在下面销毁），水环材质是逐簇克隆的，
    // 所以还活着的那几簇要连同自己那份克隆材质一起销毁 —— 否则每次销毁场景都会漏掉几份。
    for (const item of this.splashes) {
      item.ringMaterial.dispose();
      item.obj.removeFromParent();
    }
    this.splashes.length = 0;
    this.splashDropGeometry?.dispose();
    this.splashRingGeometry?.dispose();
    this.splashDropMaterial?.dispose();
    this.splashRingMaterial?.dispose();
    // 项圈相机那一路的渲染目标：它是**渲染器资源**，不在场景图里，
    // 上面那次 `scene.traverse` 碰不到它，必须在此显式释放（否则每建一个场景漏一块显存）。
    this.povTarget?.dispose();
    this.povTarget = null;
    this.povCanvas = null;
    this.povCtx = null;
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.materialLib?.dispose();
    this.gardenLib?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------- 内部

  private async loadAndApplyAssets(placeholders: Map<string, THREE.Group>): Promise<void> {
    const assets = await loadAssets((done, total, label) => this.callbacks.onProgress?.(done, total, label));
    if (this.disposed) return;
    this.report = assets.report;

    if (assets.env) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const target = pmrem.fromEquirectangular(assets.env);
      this.scene.environment = target.texture;
      this.scene.environmentIntensity = this.settings.envIntensity;
      assets.env.dispose();
      pmrem.dispose();
    }
    if (assets.tiles.size > 0) {
      // 只有室内那三张大表面吃外部贴图：院子的草坪/砾石/石板是程序化的，没有 CC0 对应件
      this.materialLib?.setTiles(assets.tiles);
    }

    for (const placement of DOG_MODEL_PLACEMENTS) {
      const model = assets.models.get(placement.id);
      if (!model) continue;
      if (placement.decorative && !this.settings.decorativeModels) continue;
      fitModel(model, placement.fitTo, placement.rotY, placement.x, placement.y ?? 0, placement.z);
      this.scene.getObjectByName('dog-home')?.add(model);
      placeholders.get(placement.id)?.removeFromParent();
      this.appliedIds.add(placement.id);
      this.applyCount += 1;
    }

    this.callbacks.onStats?.(this.getStats());
    this.statsEmitted = false;
    this.callbacks.onAssets?.(assets.report);
  }

  /**
   * 标签：狗的用品 + 院子的功能性要素。
   *
   * 只标「看得出用途的位置」，不标房间里的每一件家具 —— 后者会让标签糊成一片，
   * 而这一屏真正需要被指认的是「狗的东西在哪」与「院子有哪些设施」。
   */
  private registerHotspots(): void {
    this.hotspots.length = 0;
    for (const item of HOTSPOTS) {
      this.hotspots.push({
        id: item.id,
        label: item.label,
        badge: item.badge,
        position: new THREE.Vector3(item.x, item.y, item.z),
      });
    }
    this.labelLayer.set(this.hotspots);
    this.labelLayer.setVisible(this.labelsVisible);
  }

  private resize(): void {
    const w = this.canvasHost.clientWidth || 1;
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

    // 水面涟漪：只滚动法线贴图的偏移，不动几何。它是这一屏唯一的动态元素，
    // 因此也正是「减少动态效果」要关掉的东西。
    if (!this.reducedMotion) {
      const normal = this.materialLib?.waterNormal;
      if (normal) {
        const t = this.clock.elapsedTime;
        normal.offset.set(t * 0.013, t * 0.019);
      }
    }

    // 自主行为：位移与姿态都由它推。它内部保证"位移 ≤ 速度 × dt"与"朝向即前进方向"。
    this.dogRuntime?.update(dt);

    // 呕吐物：吐出的那一刻生成一团，10 真实秒后清掉（用户要求）
    if (this.dogController?.consumeVomitEmit()) this.spawnVomitMatter();
    this.expireVomitMatter();

    // 水花：**反复**事件 —— 玩水时每完成一次前爪扒水就返回一次 true（见 `consumeSplashEvent`），
    // 因此这里会一秒钟命中好几次。控制器只在姿态是玩水时才会返回 true，
    // 所以走路/抽搐/呕吐时水面不会有任何东西冒出来。
    if (this.dogController?.consumeSplashEvent()) this.spawnSplash();
    this.expireSplash();

    // 动态机位：每帧跟随（狗特写 / 项圈相机）。跟随必须在 controls.update() 之后做不到，
    // 因为 OrbitControls 会用自己的状态覆盖相机 —— 所以先跟随再交给 controls。
    if (this.camFollow === 'dog') this.followDogCamera(Math.min(1, dt * 8));
    else if (this.camFollow === 'pov') this.followPovCamera(Math.min(1, dt * 10));
    // 项圈相机拍不到自己的后脑勺：`pov` 机位下这一路渲染时把狗整个隐藏。
    // App「实时」页那一路（`updatePovFeed`）自己另管一次，两者共用 `dogSelfVisible()` 这个基准。
    if (this.dogRig) this.dogRig.root.visible = this.dogSelfVisible();

    this.controls.update();

    if (this.settings.shadows) {
      // 阴影视锥跟随相机（跟随比例取 0.85：整块地太大，取 0.5 会让院子边缘的树影断掉），
      // 但光照方向保持恒定 —— 否则相机动一下影子就翻面。
      const follow = 0.85;
      this.sun.target.position.set(this.camera.position.x * follow, SUN_TARGET.y, this.camera.position.z * follow);
      this.sun.position.copy(this.sun.target.position).add(SUN_OFFSET);
      this.sun.target.updateMatrixWorld();
    }

    this.renderer.render(this.scene, this.camera);
    // 项圈相机那一路：**在主画面渲染之后**（与猫版同一位置）。
    // 两路共用同一个 renderer，渲染目标切换必须成对，所以它不能插在主渲染中间。
    this.updatePovFeed();
    this.labelLayer.update(this.camera, this.canvasHost.clientWidth, this.canvasHost.clientHeight);

    this.statTimer += dt;
    if (this.statTimer > 0.5 || !this.statsEmitted) {
      this.statTimer = 0;
      this.statsEmitted = true;
      this.callbacks.onStats?.(this.getStats());
    }
  }
}

function easeInOutCubic(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * 标签点位。坐标**取自布局**（`layout-dog.ts`）而不是重抄一遍数字 ——
 * 标签与物件用的是同一组坐标，挪动物件时标签自动跟着走。
 */
const HOTSPOTS: ReadonlyArray<{ id: string; label: string; badge: string; x: number; y: number; z: number }> = [
  { id: 'foodStation', label: '食盆与水盆', badge: '狗的用品', x: FOOD_STATION.x, y: 0.5, z: FOOD_STATION.z },
  { id: 'outdoorWater', label: '院内水盆', badge: '狗的用品', x: OUTDOOR_WATER.x, y: 0.5, z: OUTDOOR_WATER.z },
  { id: 'dogBedMain', label: '软垫（日光位）', badge: '狗的用品', x: DOG_BED_MAIN.x, y: 0.5, z: DOG_BED_MAIN.z },
  { id: 'dogBedSleep', label: '软垫（床边）', badge: '狗的用品', x: DOG_BED_SLEEP.x, y: 0.45, z: DOG_BED_SLEEP.z },
  { id: 'toyBasket', label: '玩具篮', badge: '狗的用品', x: TOY_BASKET.x, y: 0.5, z: TOY_BASKET.z },
  { id: 'leashHook', label: '牵引绳挂钩', badge: '狗的用品', x: LEASH_HOOK.x, y: 1.75, z: LEASH_HOOK.z - 0.2 },
  { id: 'engawa', label: '木平台（出门第一步）', badge: '院子', x: 1.3, y: 0.4, z: -4.1 },
  { id: 'stonePath', label: '石板路', badge: '院子', x: PATHS[0]?.points[2]?.[0] ?? 0.9, y: 0.35, z: PATHS[0]?.points[2]?.[1] ?? -6.2 },
  { id: 'pond', label: '小池塘', badge: '院子', x: POND.x, y: 0.3, z: POND.z },
  { id: 'lounge', label: '休闲躺椅与小桌', badge: '院子', x: LOUNGE_CHAIR.x, y: 1.0, z: LOUNGE_CHAIR.z },
  { id: 'hedge', label: '绿篱与灌木', badge: '院子', x: 0.0, y: 1.1, z: BUSHES[4]?.z ?? -11.15 },
  { id: 'stoneLantern', label: '石灯笼', badge: '院子', x: STONE_LANTERN.x, y: 1.4, z: STONE_LANTERN.z },
];

/** 供调试与自检使用：确认资产清单与房间尺寸。 */
export const DOG_ASSET_SUMMARY = {
  models: MODEL_MANIFEST.map((m) => m.id),
  room: ROOM,
};
