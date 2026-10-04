/**
 * 柴犬的**姿态与动作控制器**：把「当前在做什么」翻译成关节参数，逐帧写进骨架。
 *
 * ⚠️ 世界变换归运行时 —— 本文件**绝不**写 `rig.root.position` / `rig.root.rotation`
 *   （也不写 `rig.root.scale`）。`root` 由运行时与 `dog-nav.ts` 的路径跟随负责；
 *   姿态只写 `rig.body` 及其子节点。两层分工必须干净：姿态动画一旦碰了世界变换，
 *   就会出现「倒着走」「贴地滑行」这类故障 —— 那是把两件事混在一处的必然结果。
 *
 * 本文件**不做**位移、不做朝向、不算速度，也不读任何传感器数据。
 * 步频（`gait.phaseSpeed`）由调用方按速度给出：同一套步态循环，走多快是运行时的事。
 *
 * ---------------------------- 关节角度符号约定 ----------------------------
 * 骨架朝向与 `dog-rig.ts` / `scene/util.ts` 一致：**狗面朝 +Z、+Y 向上**。
 *
 *   - 绕 X 轴（右手定则）：正的 `rotation.x` 把 **+Z 端（前端）压下去**。
 *     于是 `bodyPitch > 0` = 前低后高；`headPitch > 0` = 低头；`jaw.rotation.x > 0` = 张口。
 *   - 腿：`hip.rotation.x` **正 = 后蹬**（脚相对身体往 −Z 走），负 = 前摆；
 *     `knee.rotation.x` 正 = **收小腿**（脚往 −Z 且抬高）。
 *     这一条必须与 `dog-model.ts` 的骨架一致，否则步态会读成「四条腿在乱甩」。
 *   - 腿的左右：狗面朝 +Z 时**左腿在 +X**，因此 `hip.rotation.z` 取正 = 左腿外张。
 *   - 尾：`tailRoot.rotation.x` 正 = 上翘；`rotation.y` 正 = 尾尖偏向狗身右侧。
 *   - 耳：`rotation.z` = 压平（左右取反），`rotation.x` = 前倾 / 抽动。
 *   - 舌：以 +Y 为伸出方向，伸出量用 `tongue.scale.y` 表示；`tongue.visible` 由本文件接管。
 *
 * ------------------------------- 措辞边界 -------------------------------
 * 本文件里的全部数值都是**画面演示档位**的动作幅度与时长（操作化常量），
 * 描述的是**外部可观察的姿态与动作**，不是系统对狗的感受、情绪或健康状况的推断。
 * 突发动作（`seizure` / `vomit`）只描述**身体在做什么**，不命名任何状况。
 */
import type { DogLeg, DogRig } from './dog-rig.ts';
// ⚠️ 这里是**值导入**而不是类型导入：夹爪兜底要真的 new 一个 Vector3 来读世界位置。
// 控制器对 three 的依赖仍然只有"读世界矩阵"这一件事（不碰渲染器、不碰场景）。
import { Vector3 } from 'three';
import type { Object3D } from 'three';

// ============================================================ 对外类型

/** 狗的姿态状态。这些是**画面演示档位**，不是对狗感受的判断。 */
export type DogPoseId =
  | 'stand' // 站立（默认）
  | 'walk' // 慢走
  | 'trot' // 小跑
  | 'run' // 奔跑（飞奔）
  | 'sit' // 坐
  | 'down' // 趴卧/休息
  | 'sleep' // 睡着（呼吸更慢更深，偶尔抽动耳朵）
  | 'drink' // 低头喝水（舌头舔舐动作）
  | 'eat' // 低头进食（咀嚼）
  | 'eliminate' // 排泄姿势（后腿前伸下蹲、尾巴抬起）
  | 'play' // 玩耍（前肢下压的邀玩姿势 + 蹦跳）
  | 'sniff' // 嗅闻（低头贴地）
  | 'seizure' // 抽搐（多时相，见下）
  | 'vomit' // 呕吐（干呕 → 呕出 → 恢复）
  | 'water-play' // 玩水（站在岸边，两只前爪交替扒水 —— 它只做动作，身体不进水里）
  | 'rolling' // 草地打滚（贴地侧滚，原地）
  | 'digging'; // 刨地（前躯压低，两只前爪交替向后刨）

/** 步态循环类型。`none` = 不做步态（站/坐/趴等）。 */
export type DogGaitId = 'none' | 'walk' | 'trot' | 'run';

export interface DogPoseSnapshot {
  pose: DogPoseId;
  /** 躯干离地高度（米）—— 用来断言"趴下真的低了" */
  bodyHeight: number;
  /** 步态相位（0–1，只在移动姿态下有意义） */
  gaitPhase: number;
  /** 每个关节的当前角度（弧度），键名自取但要稳定 */
  joints: Record<string, number>;
  /** 是否处于突发演示中 */
  incident: boolean;
}

export interface DogControllerOptions {
  reducedMotion: boolean;
  /** 帧率很低时的兜底（无头环境） */
  timeScale?: number;
}

/**
 * 边界句：UI 必须原样展示。
 *
 * 刻意不写医学判断类的措辞 —— 那类词要么是仓库禁词，要么会把画面档位说成对狗的判断。
 * 这里只说清楚一件事：**这些动作是你选的，不是系统对狗的推断**。
 */
export const DOG_BOUNDARY_NOTE =
  '画面演示档位：以下姿态与动作由你手动选择，描述的是外部可观察的姿态、关节角度与动作幅度，不是系统对狗的感受、情绪或健康状况的推断。';

// ============================================================ 体尺常量

/**
 * 站立时躯干中轴的离地高度（米）。
 *
 * 依据：柴犬肩高约 0.38–0.41 m，躯干半径约 0.08 m，故躯干中心约在 0.32 m。
 * ⚠️ 与 `dog-model.ts` 必须一致：本控制器把 `body.position.y` 当作**绝对离地高度**写，
 * 也就是模型必须把 `body` 放在 `root` 的 y = 0 处（同猫版把 `bodyLift` 当绝对高度的做法）。
 */
const DOG_STAND_BODY_Y = 0.32;

/**
 * 头（`head` 组）相对躯干中心的 y 偏移，以及头组原点到鼻尖的前向距离（米）。
 *
 * 这两个数只用于**估算吻部离地高度**（自检用），不参与姿态本身。
 * 与 `dog-model.ts` 的骨架尺寸绑定：模型改了头的挂点，这里也要改，否则自检的
 * 「喝水时吻部接近地面」会给出错误的数字（画面仍是对的）。
 */
const HEAD_BASE_Y_REL = 0.08;
const MUZZLE_REACH_M = 0.17;

/**
 * 呼吸缩放的幅度上限（相对量）。
 *
 * 躯干半径只有约 0.08–0.1 m：呼吸幅度超过这个量级，读起来就不是「呼吸」而是
 * **狗在膨胀**，毛壳（`furShells`）也会穿出躯干。这是**视觉安全线**，不是生理参数。
 */
const MAX_BREATH_AMP = 0.06;

/** 单帧最大推进时间（秒）。无头环境可能给出很大的 dt，直接照用会让相位跳变。 */
const MAX_STEP_S = 0.1;

/** 一帧眨眼从闭到开的时长（秒）。 */
const BLINK_DURATION_S = 0.18;

/** 眨眼后眼睑最闭合的残留比例（全闭会让眼睛看起来是空的）。 */
const BLINK_MAX_CLOSE = 0.92;

/** 耳抽动频率（次/秒）—— 静息时耳朵偶尔转一下，不是持续抖动。 */
const EAR_TWITCH_HZ = 6.5;

/** 睡着时耳朵抽动的间隔与单次时长（秒）。 */
const SLEEP_EAR_TWITCH_INTERVAL_S = 7;
const SLEEP_EAR_TWITCH_DURATION_S = 0.4;
/** 单次耳抽动的幅度（弧度）。 */
const SLEEP_EAR_TWITCH_AMP = 0.55;

/** 进食时舔嘴的间隔与单次时长（秒）。 */
const EAT_LICK_INTERVAL_S = 4.5;
const EAT_LICK_DURATION_S = 0.55;

/**
 * 甩头的单次时长（秒）、频率（次/秒）与幅度（弧度）。
 *
 * 玩水时"隔一会儿甩一次头"用的是**事件型**微动作那一套（与睡着的耳抽动、进食的舔嘴同构）：
 * 姿态表只给**间隔**（`headShakeIntervalS`），单次形状由这三个常量给，
 * 于是"甩一下"读起来是短促的一下，而不是一个常驻的正弦。
 */
const HEAD_SHAKE_DURATION_S = 0.45;
const HEAD_SHAKE_HZ = 9;
const HEAD_SHAKE_AMP = 0.5;

/**
 * 四肢乱蹬时每条腿之间的相位错开量（弧度）。
 *
 * 四条腿同相会读成"整排腿一起踢"（机械感）；错开之后才是"蜷起乱蹬"。
 */
const LIMB_FLAIL_PHASE_STEP = 1.7;

/**
 * 一个前爪振荡周期里算**几次扒水**。
 *
 * 两条前腿相位差 π，也就是每个周期各扒一次 —— 所以周期的**一半**就是一次扒水。
 * `consumeSplashEvent` 用这个常数把"时间"折算成"第几下扒水"，从而做到**一次扒水只认领一次**
 * （见那里的防重入说明）。
 */
const SPLASH_STROKES_PER_CYCLE = 2;

/** 步态幅度接合的时间常数（秒）：停走时把摆幅收回站姿，而不是让腿僵在半空。 */
const GAIT_ENGAGE_TAU_S = 0.35;

/** 头部反向稳定的折算率（弧度/米）：躯干每起伏 1 m，头反向转这么多。 */
const HEAD_STAB_RAD_PER_M = 1.4;

/** 张口满量程对应的下颌旋转（弧度）。 */
const JAW_OPEN_RAD = 0.55;
/** 耳朵完全压平对应的旋转（弧度）。 */
const EAR_FLATTEN_RAD = 1.2;
/** 尾巴每一段的卷曲上限（弧度/段，5 段累计到约 2.5 rad 的卷尾）。 */
const TAIL_CURL_RAD = 0.5;
/** 尾波沿体节的相位滞后（弧度/段）：越靠尾尖越晚摆，形成甩动而不是整体平移。 */
const TAIL_WAVE_LAG = 0.55;

/** 舌伸出满量程对应的 y 轴额外缩放（相对量）。 */
const TONGUE_EXTEND = 1.6;

/**
 * `reducedMotion` 的截止频率（次/秒）。
 *
 * 规则：**高于这个频率的微动作一律归零，低于它的保留**。呼吸（0.2–1.5）、重心转移
 * （0.05–0.25）、缓慢嗅闻扫动（0.45）都是姿态本身，保留；耳抽动（6.5）、咀嚼（2.6）、
 * 舔水（3.5）、快速摆尾（4.5）是高频动作，关掉。**步态不在此列** —— 步态就是走/跑这个
 * 姿态本身，关掉它等于把「走」变成「站着」。
 */
const REDUCED_MOTION_FAST_HZ = 1.5;

// ============================================================ 突发时相常量

/**
 * 抽搐演示的时相时长（秒）。
 *
 * 四个时相合计 15 s —— 与 `@camp/core` 的 `INCIDENT_DEFS.seizure.demoDurationS` 对齐，
 * 演示时长与画面时长必须是同一个数，否则会出现「画面还在抽、事件流已经结束了」。
 */
export const SEIZURE_PHASE_S = {
  /** ① 先兆：僵住、耳朵后压、尾巴下垂 */
  aura: 1.5,
  /** ② 强直：全身僵直、四肢伸直、躯干侧倾（`body.rotation.z`） */
  tonic: 4.0,
  /** ③ 阵挛：高频抖动 + 四肢划水样动作 + 下颌开合 + 流涎 */
  clonic: 7.0,
  /** ④ 恢复：逐渐停止、侧卧、呼吸变深 */
  recovery: 2.5,
} as const;

export const SEIZURE_TOTAL_S =
  SEIZURE_PHASE_S.aura + SEIZURE_PHASE_S.tonic + SEIZURE_PHASE_S.clonic + SEIZURE_PHASE_S.recovery;

/** 呕吐演示的时相时长（秒）。 */
export const VOMIT_PHASE_S = {
  /** ① 干呕：腹部反复收缩、脊椎反复拱起、头略低 */
  retch: 3.0,
  /** ② 呕出：头更低、下颌大张、躯干前倾 */
  expel: 1.2,
  /** ③ 恢复：舔嘴、起身回正 */
  recover: 3.0,
} as const;

export const VOMIT_TOTAL_S = VOMIT_PHASE_S.retch + VOMIT_PHASE_S.expel + VOMIT_PHASE_S.recover;

/** 时相之间的小过渡（秒）：时相切换不该在骨架上"啪"地跳一下。 */
const PHASE_RAMP_S = 0.35;

/** 阵挛期抖动的基频与次级频率（次/秒）；次级取 1.7 倍并错相位，避免读成单一正弦。 */
const TREMOR_HZ = 8.5;
const TREMOR_HZ_2 = TREMOR_HZ * 1.7;

/** 阵挛期四肢划水样动作的频率（次/秒）与每条腿之间的相位错开量（弧度）。 */
const PADDLE_HZ = 1.6;
const PADDLE_PHASE_STEP = 1.9;

/** 阵挛期下颌开合的频率（次/秒）与四肢抖动的次级相位。 */
const JAW_CLONUS_HZ = 2.2;

/** 干呕时腹部收缩的频率（次/秒）与恢复期舔嘴的频率（次/秒）。 */
const RETCH_HZ = 1.3;
const LICK_HZ = 1.5;

// ============================================================ 姿态参数

/**
 * 一个姿态的**全部参数**。
 *
 * 全部是数字（外加一个步态枚举），因此可以做通用插值 —— 过渡、打断、
 * 突发叠加都走同一套混合，不需要为每种姿态写专门的过渡函数。
 */
export interface DogPoseParams {
  /** 躯干中轴的**绝对离地高度**（米）：站立 0.32，趴卧 0.13 */
  bodyY: number;
  /** 躯干俯仰：正 = 前低后高（+Z 端下沉） */
  bodyPitch: number;
  /** 躯干静态侧倾（突发时相靠它侧倒） */
  bodyRoll: number;
  /** 腰椎倾斜：正 = 前躯下沉 */
  spineTilt: number;
  /** 拱背：胸与臀部反向微转，配合躯干压低读起来像弓背 */
  arch: number;
  /** 颈根俯仰：正 = 低头下伸 */
  neckPitch: number;
  /** 头部俯仰：正 = 低头 */
  headPitch: number;
  /** 头部左右扫动幅度（弧度）与频率（次/秒） */
  headYawAmp: number;
  headYawFreq: number;
  /** 耳朵后压：0 前立，1 完全压平 */
  earFlatten: number;
  /** 耳朵抽动幅度（弧度） */
  earTwitchAmp: number;
  /** 眼睛开启程度：0.06 几乎闭合，1 全开 */
  eyeOpen: number;
  /** 眨眼间隔（秒）；0 表示不眨 */
  blinkIntervalS: number;
  /** 瞳孔缩放：1 为默认，>1 放大 */
  pupilScale: number;
  /** 尾根上翘量：正 = 上翘，负 = 下垂 */
  tailLift: number;
  /** 尾根左右偏摆：正 = 尾尖偏向狗身右侧 */
  tailYaw: number;
  /** 尾摆幅度（弧度）与频率（次/秒） */
  tailAmp: number;
  tailFreq: number;
  /** 尾段卷曲程度：柴犬的卷尾靠它 */
  tailCurl: number;
  /** 呼吸幅度（躯干缩放的相对量）与频率（次/秒） */
  breathAmp: number;
  breathFreq: number;
  /** 重心转移幅度（米）与频率（次/秒） */
  weightShiftAmp: number;
  weightShiftFreq: number;
  /** 前肢髋基础摆角：正 = 后蹬 */
  hipFront: number;
  /** 前肢膝（肘/腕）基础收角：正 = 收小腿 */
  kneeFront: number;
  /** 后肢髋基础摆角 */
  hipHind: number;
  /** 后肢膝基础收角（坐/趴靠它折叠后腿） */
  kneeHind: number;
  /** 髋绕 Z 外张：四肢左右分开（趴下时"摊开"用） */
  legSplay: number;
  /** 步态循环类型 */
  gait: DogGaitId;
  /** 步幅缩放：1 为标称，用于同一套步态做小幅调整 */
  gaitAmpScale: number;
  /** 蹦跳位移（米）与频率（次/秒）—— 只有玩耍用 */
  bounceAmp: number;
  bounceFreq: number;
  /** 下颌开合的中心值（0 闭 → 1 全张） */
  jawOpen: number;
  /** 下颌开合幅度（咀嚼 / 舔水靠它）与频率（次/秒） */
  jawAmp: number;
  jawFreq: number;
  /** 静止时的舌伸出量（0–1）；>0 时随 `jawFreq` 一起动 */
  tongueOut: number;
  /**
   * **前爪交替**的摆幅（弧度）与频率（次/秒）：扒水与刨地共用这一套机制。
   *
   * 为什么只作用于 `frontL` / `frontR`：这两个动作本来就是前肢的动作，
   * 后腿在这个姿态里负责支撑（各自的基础角由 `hipHind` / `kneeHind` 给）。
   * 两条前腿的相位差固定为 π（见 `applyPose` 的四肢段）—— 两条前爪同步入水会读成
   * "两只手一起拍"，交替才是扒水/刨地的节奏。
   *
   * 它与突发专用的 `limbPaddleAmp` 是**两件事**：那是时相程序叠加的突发形变
   * （只在抽搐的阵挛期出现，带 `incidentWeight`），这是**姿态自己驱动**的常态动作
   * —— 只要姿态是玩水/刨地就一直做，与突发权重无关。
   */
  frontPawOscAmp: number;
  frontPawOscHz: number;
  /**
   * 打滚时**绕 Z 的滚转振荡**：幅度（弧度）与频率（次/秒）。
   *
   * 为什么单独给一个振荡而不是把 `bodyRoll` 写成一个固定值：打滚是"来回滚"，
   * 固定侧倾只会读成"侧躺着不动"。中心值仍由 `bodyRoll` 给。
   */
  bodyRollOscAmp: number;
  bodyRollOscHz: number;
  /** 四肢蜷起乱蹬的幅度（弧度）与频率（次/秒）—— 打滚用，四条腿都动（各错开一个相位） */
  limbFlailAmp: number;
  limbFlailHz: number;
  /** 头扭向一侧的**静态**偏航（弧度；正 = 头转向狗身左侧 +X） */
  headYawOffset: number;
  /** 每隔几秒甩一次头的间隔（秒）；0 = 不甩（甩头本身是高频动作，见 `advanceMicroTimers`） */
  headShakeIntervalS: number;
}

/**
 * 步态定义：**真正的步态循环**，不是整体晃动。
 *
 * 每条腿都按「抬起 — 前摆 — 落地 — 后蹬」走一圈：
 *   相位 `p` 在 [0, 0.25) 与 (0.75, 1) 是**支撑期**（脚相对身体向后推），
 *   (0.25, 0.75) 是**摆动期**（脚离地前移，中点在 p = 0.5）；
 *   髋角 = `hipSwing · sin(2πp)`，摆动期额外收膝 `kneeLift · max(0, −cos(2πp))`。
 *
 * 相位关系（本文件的核心约定）：
 *   - `walk` / `trot`：**对角步态** —— `frontL` 与 `hindR` 同相（0），`frontR` 与 `hindL` 同相（0.5）。
 *   - `run`：**前后肢成对** —— `frontL`/`frontR` 同相（0），`hindL`/`hindR` 同相（0.5），
 *     于是「前肢伸展 + 后肢蹬地」与「前肢收拢 + 后肢前摆」交替，构成飞奔的伸展/收拢两拍。
 *
 * 频率是**演示用标称值**（操作化常量，不是文献数字），量级取自犬类常见步频：
 * 慢走约 1.6 Hz、小跑约 2.6 Hz、飞奔约 3.6 Hz。真实步频由调用方按速度给。
 */
interface DogGaitDef {
  /** 每条腿的相位偏移（步幅分数 0–1） */
  phase: Readonly<Record<LegKey, number>>;
  /** 髋摆幅（弧度） */
  hipSwing: number;
  /** 摆动期额外收膝（弧度） */
  kneeLift: number;
  /** 躯干上下起伏幅度（米）—— 对角步态一个步幅起伏两次 */
  bobAmp: number;
  /** 躯干侧倾幅度（弧度） */
  rollAmp: number;
  /** 左右重心位移幅度（米） */
  lateralAmp: number;
  /** 腾空抬升幅度（米）—— 只有 `run` 用 */
  suspensionLift: number;
  /** 腾空时四肢收拢量（弧度） */
  suspensionFold: number;
  /** 标称步频（步/秒）：仅在调用方没给 `phaseSpeed` 时使用（演示档位要自己会走） */
  nominalHz: number;
}

const GAIT_TABLE: Readonly<Record<Exclude<DogGaitId, 'none'>, DogGaitDef>> = {
  walk: {
    phase: { frontL: 0, frontR: 0.5, hindL: 0.5, hindR: 0 },
    hipSwing: 0.22,
    kneeLift: 0.3,
    bobAmp: 0.012,
    rollAmp: 0.02,
    lateralAmp: 0.008,
    suspensionLift: 0,
    suspensionFold: 0,
    nominalHz: 1.6,
  },
  trot: {
    phase: { frontL: 0, frontR: 0.5, hindL: 0.5, hindR: 0 },
    hipSwing: 0.34,
    kneeLift: 0.5,
    bobAmp: 0.022,
    rollAmp: 0.028,
    lateralAmp: 0.01,
    suspensionLift: 0.016,
    suspensionFold: 0.25,
    nominalHz: 2.6,
  },
  run: {
    // 前后肢成对：奔跑不是对角步态
    phase: { frontL: 0, frontR: 0, hindL: 0.5, hindR: 0.5 },
    hipSwing: 0.52,
    kneeLift: 0.85,
    bobAmp: 0.02,
    rollAmp: 0.018,
    lateralAmp: 0.006,
    suspensionLift: 0.055,
    suspensionFold: 0.8,
    nominalHz: 3.6,
  },
};

// ============================================================ 姿态表

/**
 * 站立：所有姿态的基准。
 *
 * 每个数值都是**操作化常量**（画面里多大才读得出来），不是生理测量值。
 * 呼吸 0.42 Hz ≈ 25 次/分、眨眼间隔 4.5 s ≈ 13 次/分，量级取自静息犬的常见范围，
 * 用途只是「看起来对」，不作为任何读数或判断的依据。
 */
const STAND_POSE: DogPoseParams = {
  bodyY: DOG_STAND_BODY_Y,
  bodyPitch: 0,
  bodyRoll: 0,
  spineTilt: 0,
  arch: 0,
  neckPitch: 0.04,
  headPitch: 0.03,
  headYawAmp: 0.12,
  headYawFreq: 0.12,
  earFlatten: 0,
  earTwitchAmp: 0.05,
  eyeOpen: 0.92,
  blinkIntervalS: 4.5,
  pupilScale: 1,
  tailLift: 0.55,
  tailYaw: 0,
  tailAmp: 0.14,
  tailFreq: 0.7,
  tailCurl: 0.5,
  breathAmp: 0.022,
  breathFreq: 0.42,
  weightShiftAmp: 0.008,
  weightShiftFreq: 0.08,
  hipFront: 0,
  // 膝角基准取 0：模型的自检零位是"hip=0 / knee=0 时爪底正好在 y=0"，
  // 而"自然站立时那点微屈"已经烘进模型自己的股骨/胫骨夹角里了。
  // 这里再给 0.05 就是**在模型的零点之上又折一次**，四只脚会整体浮起来（实测浮 2 cm）。
  kneeFront: 0,
  hipHind: 0,
  kneeHind: 0,
  legSplay: 0,
  gait: 'none',
  gaitAmpScale: 1,
  bounceAmp: 0,
  bounceFreq: 0,
  jawOpen: 0.04,
  jawAmp: 0,
  jawFreq: 0,
  tongueOut: 0,
  // ⚠️ 以下八个是院子里的三个新姿态（玩水 / 打滚 / 刨地）用的参数。
  // 站姿把它们全部置 0 —— 站姿是 `derived()` 的基准，于是**原有 14 个姿态一个都不受影响**：
  // 每个新参数在 `applyPose` 里都是"0 就不产生任何增量"的写法（见那里的四肢段与躯干段）。
  // 由 `check-dog-pose.mjs` 断言"新参数在站姿里恒为 0、且只有这三个新姿态用到它们"。
  frontPawOscAmp: 0,
  frontPawOscHz: 0,
  bodyRollOscAmp: 0,
  bodyRollOscHz: 0,
  limbFlailAmp: 0,
  limbFlailHz: 0,
  headYawOffset: 0,
  headShakeIntervalS: 0,
};

/** 以站姿为基准派生一个姿态：只写与站姿不同的字段，避免 14 份完整字面量互相漂移。 */
function derived(over: Partial<DogPoseParams>): DogPoseParams {
  return { ...STAND_POSE, ...over } as DogPoseParams;
}

/** 每个姿态的完整定义（含 UI 用的名字、一句「看什么」与过渡时长）。 */
export interface DogPoseDef {
  id: DogPoseId;
  label: string;
  /** 一句话说明「看什么」—— 只描述外部表现 */
  hint: string;
  /** 进入该姿态的过渡时长（秒） */
  transitionS: number;
  pose: DogPoseParams;
}

export const DOG_POSES: Readonly<Record<DogPoseId, DogPoseDef>> = {
  stand: {
    id: 'stand',
    label: '站立',
    hint: '四腿站立、呼吸起伏、偶尔眨眼与转耳，尾根上卷并缓慢摆动',
    transitionS: 0.4,
    pose: { ...STAND_POSE },
  },
  walk: {
    id: 'walk',
    label: '慢走',
    hint: '对角步态：左前与右后同相、右前与左后反相，躯干每步起伏两次，尾巴随步频摆动',
    transitionS: 0.35,
    pose: derived({
      gait: 'walk',
      bodyY: 0.312,
      headPitch: 0.05,
      neckPitch: 0.02,
      tailLift: 0.5,
      tailAmp: 0.2,
      tailFreq: 1.6,
      breathAmp: 0.024,
      breathFreq: 0.7,
      kneeFront: 0.08,
      kneeHind: 0.1,
      hipFront: 0.02,
      hipHind: 0.02,
    }),
  },
  trot: {
    id: 'trot',
    label: '小跑',
    hint: '同样是步态循环，但步幅与步频更高、躯干起伏更明显，四脚短暂离地',
    transitionS: 0.35,
    pose: derived({
      gait: 'trot',
      bodyY: 0.308,
      headPitch: 0.06,
      neckPitch: 0,
      tailLift: 0.45,
      tailAmp: 0.26,
      tailFreq: 2.6,
      breathAmp: 0.028,
      breathFreq: 0.95,
      eyeOpen: 0.95,
      kneeFront: 0.1,
      kneeHind: 0.12,
      hipFront: 0.04,
      hipHind: 0.04,
    }),
  },
  run: {
    id: 'run',
    label: '奔跑',
    hint: '前后肢成对的大幅步态：前肢伸展与后肢蹬地交替，有四肢收拢的腾空瞬间，躯干随之抬高',
    transitionS: 0.3,
    pose: derived({
      gait: 'run',
      bodyY: 0.3,
      bodyPitch: 0.06,
      neckPitch: -0.1,
      headPitch: -0.06,
      earFlatten: 0.25,
      tailLift: 0.25,
      tailAmp: 0.3,
      tailFreq: 3.6,
      breathAmp: 0.04,
      breathFreq: 1.4,
      eyeOpen: 1,
      blinkIntervalS: 3,
      hipFront: 0.06,
      kneeFront: 0.12,
      hipHind: 0.06,
      kneeHind: 0.14,
    }),
  },
  sit: {
    id: 'sit',
    label: '坐',
    hint: '后腿折叠、臀部落地、前腿直立撑地；躯干前高后低（腰椎绕 X 轴负向抬起前躯），头略抬',
    transitionS: 0.7,
    pose: derived({
      bodyY: 0.22,
      // 臀部落地 → 后躯低、前躯高：`spine` 取负值把 +Z（前躯）抬起；`bodyPitch` 同步。
      bodyPitch: -0.26,
      spineTilt: -0.22,
      arch: 0.06,
      neckPitch: -0.08,
      headPitch: -0.1,
      hipFront: 0.02,
      kneeFront: 0.1,
      hipHind: -1.25,
      kneeHind: 2.05,
      legSplay: 0.12,
      tailLift: 0.6,
      tailAmp: 0.14,
      tailFreq: 0.5,
      tailCurl: 0.55,
      breathAmp: 0.026,
      breathFreq: 0.5,
      eyeOpen: 0.9,
      blinkIntervalS: 4.2,
    }),
  },
  down: {
    id: 'down',
    label: '趴卧',
    hint: '四腿收拢、躯干明显降低、头可搭在前爪上；呼吸与重心转移都很慢',
    transitionS: 0.8,
    pose: derived({
      bodyY: 0.13,
      bodyPitch: 0.02,
      bodyRoll: 0.03,
      neckPitch: 0.3,
      headPitch: 0.26,
      hipFront: -0.3,
      kneeFront: 1.15,
      hipHind: -0.55,
      kneeHind: 1.75,
      legSplay: 0.22,
      earFlatten: 0.12,
      tailLift: 0.02,
      tailAmp: 0.07,
      tailFreq: 0.4,
      tailCurl: 0.2,
      breathAmp: 0.03,
      breathFreq: 0.34,
      weightShiftAmp: 0.003,
      weightShiftFreq: 0.04,
      eyeOpen: 0.62,
      blinkIntervalS: 6,
    }),
  },
  sleep: {
    id: 'sleep',
    label: '睡着',
    hint: '趴卧基础上呼吸更慢更深（幅度约两倍、频率约一半），耳朵每隔几秒抽动一次',
    transitionS: 1.2,
    pose: derived({
      bodyY: 0.125,
      bodyPitch: 0.02,
      bodyRoll: 0.05,
      neckPitch: 0.34,
      headPitch: 0.34,
      hipFront: -0.32,
      kneeFront: 1.2,
      hipHind: -0.58,
      kneeHind: 1.8,
      legSplay: 0.24,
      earFlatten: 0.35,
      // 抽动由定时器给（见 SLEEP_EAR_TWITCH_*），姿态里的固定幅度置 0
      earTwitchAmp: 0,
      tailLift: 0,
      tailAmp: 0.02,
      tailFreq: 0.2,
      tailCurl: 0.15,
      // 呼吸更慢更深：0.22 Hz ≈ 13 次/分，幅度 0.052（约为趴卧的 1.7 倍）
      breathAmp: 0.052,
      breathFreq: 0.22,
      weightShiftAmp: 0,
      weightShiftFreq: 0,
      headYawAmp: 0,
      headYawFreq: 0,
      eyeOpen: 0.07,
      blinkIntervalS: 0,
      jawOpen: 0,
    }),
  },
  drink: {
    id: 'drink',
    label: '喝水',
    hint: '前躯下沉、颈部前下伸、吻部接近地面（估算约 0.10 m），舌头快速伸缩舔水',
    transitionS: 0.5,
    pose: derived({
      bodyY: 0.19,
      bodyPitch: 0.26,
      spineTilt: 0.2,
      neckPitch: 0.86,
      headPitch: 0.44,
      hipFront: -0.12,
      kneeFront: 0.5,
      hipHind: -0.18,
      kneeHind: 0.6,
      legSplay: 0.14,
      tailLift: 0.35,
      tailAmp: 0.06,
      tailFreq: 0.4,
      breathAmp: 0.024,
      breathFreq: 0.6,
      headYawAmp: 0.03,
      headYawFreq: 0.15,
      jawOpen: 0.1,
      jawAmp: 0.06,
      // 舔水约 3.5 次/秒（狗舔水的舌动频率量级），舌头随之伸出收回
      jawFreq: 3.5,
      tongueOut: 0.5,
      eyeOpen: 0.8,
      blinkIntervalS: 5,
    }),
  },
  eat: {
    id: 'eat',
    label: '进食',
    hint: '低头对准食盆、下颌开合咀嚼，偶尔舔一下嘴',
    transitionS: 0.5,
    pose: derived({
      bodyY: 0.24,
      bodyPitch: 0.18,
      spineTilt: 0.12,
      neckPitch: 0.72,
      headPitch: 0.36,
      hipFront: -0.08,
      kneeFront: 0.35,
      hipHind: -0.12,
      kneeHind: 0.45,
      legSplay: 0.1,
      tailLift: 0.5,
      tailAmp: 0.05,
      tailFreq: 0.5,
      breathAmp: 0.028,
      breathFreq: 0.7,
      jawOpen: 0.18,
      // 咀嚼约 2.6 次/秒
      jawAmp: 0.2,
      jawFreq: 2.6,
      tongueOut: 0.05,
      eyeOpen: 0.85,
      blinkIntervalS: 4.5,
    }),
  },
  eliminate: {
    id: 'eliminate',
    label: '排泄姿势',
    hint: '后腿前伸到腹下、臀部下沉、背部拱起，尾巴抬起并偏向一侧，前腿撑地',
    transitionS: 0.6,
    pose: derived({
      bodyY: 0.2,
      bodyPitch: 0.02,
      spineTilt: -0.16,
      arch: 0.42,
      neckPitch: 0.1,
      headPitch: 0.16,
      hipFront: 0.05,
      kneeFront: 0.05,
      hipHind: -1.95,
      kneeHind: 2.15,
      legSplay: 0.34,
      tailLift: 1.05,
      tailYaw: 0.32,
      tailAmp: 0.05,
      tailFreq: 0.3,
      tailCurl: 0.1,
      breathAmp: 0.03,
      breathFreq: 0.55,
      weightShiftAmp: 0.006,
      weightShiftFreq: 0.25,
      eyeOpen: 0.8,
      blinkIntervalS: 5,
    }),
  },
  play: {
    id: 'play',
    label: '玩耍',
    hint: '邀玩姿势（前肢下压、胸贴地、后躯抬高）加上蹦跳，尾巴大幅摆动',
    transitionS: 0.3,
    pose: derived({
      // 前低后高：躯干俯仰 0.32 rad 把前胸压到约 0.11 m
      bodyY: 0.21,
      bodyPitch: 0.32,
      spineTilt: 0.3,
      arch: -0.1,
      neckPitch: -0.06,
      headPitch: -0.22,
      hipFront: -0.55,
      kneeFront: 0.95,
      hipHind: -0.18,
      kneeHind: 0.3,
      legSplay: 0.26,
      tailLift: 0.75,
      tailAmp: 0.55,
      tailFreq: 4.5,
      tailCurl: 0.1,
      // 蹦跳：躯干上下弹跳约 2 次/秒、幅度 0.05 m
      bounceAmp: 0.05,
      bounceFreq: 1.9,
      breathAmp: 0.05,
      breathFreq: 1.5,
      headYawAmp: 0.18,
      headYawFreq: 0.6,
      earTwitchAmp: 0.08,
      eyeOpen: 1,
      blinkIntervalS: 3,
    }),
  },
  sniff: {
    id: 'sniff',
    label: '嗅闻',
    hint: '前躯下沉、头低到接近地面（估算约 0.09 m），头部缓慢左右扫动',
    transitionS: 0.45,
    pose: derived({
      bodyY: 0.18,
      bodyPitch: 0.24,
      spineTilt: 0.16,
      neckPitch: 0.92,
      headPitch: 0.5,
      hipFront: -0.12,
      kneeFront: 0.5,
      hipHind: -0.14,
      kneeHind: 0.55,
      legSplay: 0.16,
      tailLift: 0.45,
      tailAmp: 0.16,
      tailFreq: 0.9,
      breathAmp: 0.03,
      breathFreq: 0.8,
      headYawAmp: 0.4,
      headYawFreq: 0.45,
      eyeOpen: 0.85,
      blinkIntervalS: 4,
      jawOpen: 0.06,
    }),
  },
  seizure: {
    id: 'seizure',
    label: '抽搐（多时相）',
    hint: '先兆僵住 → 强直侧倾 → 阵挛抖动与四肢划水 → 恢复侧卧；只描述身体动作，不命名状况',
    transitionS: 0.25,
    pose: derived({
      // 基准 = 先兆期的站姿；各时相的额外形变由时相程序叠加（见 SEIZURE_FRAMES）
      bodyY: DOG_STAND_BODY_Y,
      earFlatten: 0.85,
      tailLift: -0.3,
      tailAmp: 0.02,
      tailFreq: 0.2,
      headPitch: -0.05,
      neckPitch: -0.05,
      breathAmp: 0.04,
      breathFreq: 0.9,
      eyeOpen: 1,
      blinkIntervalS: 0,
      jawOpen: 0.06,
    }),
  },
  vomit: {
    id: 'vomit',
    label: '呕吐（多时相）',
    hint: '干呕（腹部反复收缩、脊椎反复拱起）→ 呕出（头更低、下颌大张、前倾）→ 恢复（舔嘴、起身回正）',
    transitionS: 0.3,
    pose: derived({
      bodyY: 0.3,
      bodyPitch: 0.1,
      spineTilt: 0.05,
      neckPitch: 0.35,
      headPitch: 0.3,
      earFlatten: 0.5,
      tailLift: -0.1,
      tailAmp: 0.04,
      tailFreq: 0.3,
      breathAmp: 0.05,
      breathFreq: 0.9,
      eyeOpen: 0.7,
      blinkIntervalS: 0,
      jawOpen: 0.2,
    }),
  },
  /**
   * 玩水：站在**岸边**把身体略压低、头朝水面低下，两只前爪交替向前下方扒水。
   *
   * 两条硬性约束（都是"看起来不对"的来源）：
   *   1. **身体不许进到水里** —— 因此 `bodyY` 只比站姿低 3.5 cm（0.285），
   *      而且没有 `bounceAmp` 这类会把躯干送出去的项。水面在草坪下 0.12 m（见 `dog-scene.ts`），
   *      躯干中心 0.285 m 离水面还有 0.4 m，怎么扒都在岸上。
   *   2. **前爪的基准角不能折太深** —— 扒水是"前伸—下压—后搂"，前腿本来就近乎立柱；
   *      折多了就变成"蹲着拍地"。基准取 `hipFront −0.18 / kneeFront 0.55`，
   *      交替摆幅另由 `frontPawOscAmp` 叠加；爪底贴地兜底（`clampPawsToGround`）只负责收口。
   */
  'water-play': {
    id: 'water-play',
    label: '玩水',
    hint: '站在岸边、躯干略低、头朝水面低下，两只前爪交替扒水，尾巴翘起快速摆动，每隔几秒甩一次头',
    transitionS: 0.45,
    pose: derived({
      bodyY: 0.285,
      bodyPitch: 0.16,
      spineTilt: 0.12,
      neckPitch: 0.62,
      headPitch: 0.34,
      headYawAmp: 0.14,
      headYawFreq: 0.35,
      // 隔 3.5 秒甩一次头（单次形状见 HEAD_SHAKE_*）
      headShakeIntervalS: 3.5,
      earFlatten: 0.06,
      earTwitchAmp: 0.06,
      eyeOpen: 0.98,
      blinkIntervalS: 3.2,
      // 前爪交替扒水：1.9 次/秒的振荡，两条前腿相位差 π（= 3.8 次/秒的扒水节奏）
      frontPawOscAmp: 0.55,
      frontPawOscHz: 1.9,
      hipFront: -0.18,
      // 膝基准 0.55：扒水的行程因此落在离地 0–9 cm 那一段（实测爪底 0.004–0.088 m），
      // 掌部每一下都能扫到地面附近再往回搂，而不是在空中划空。
      // 低姿态的爪底贴地兜底仍在工作（动态扒水本来就该"够到"地面），但它只是收口，
      // 不是把整条腿的姿态托起来 —— 基准角自己已经把腿摆到了这个区间里。
      kneeFront: 0.55,
      // 后腿撑住、略外张：前爪在扒的时候身体不能跟着晃出去
      hipHind: -0.2,
      kneeHind: 0.55,
      legSplay: 0.2,
      // 尾巴翘起、快速摆动
      tailLift: 1,
      tailAmp: 0.62,
      tailFreq: 3.6,
      tailCurl: 0.35,
      breathAmp: 0.032,
      breathFreq: 1,
      weightShiftAmp: 0.006,
      weightShiftFreq: 0.2,
      jawOpen: 0.12,
      tongueOut: 0.15,
    }),
  },
  /**
   * 草地打滚：**原地**贴地侧滚。
   *
   * 三个量决定它像不像：
   *   1. `bodyY = 0.155`（躯干压到约 0.15 m）—— 这是所有姿态里最低的一档，
   *      因此爪底贴地兜底在这里最吃紧，基准角必须先把腿蜷起来（下面四个基准角），
   *      不能把残差全推给兜底。
   *   2. `bodyRoll = 0.85` 为中心、`bodyRollOscAmp = 0.35` 来回滚 → 滚转角在 **0.5–1.2 rad** 之间。
   *   3. **原地**：本姿态不做任何位移，`root` 由运行时管（文件头纪律），
   *      时间线把打滚安排在草坪锚点上、到位后再做。
   */
  rolling: {
    id: 'rolling',
    label: '草地打滚',
    hint: '躯干贴地、向一侧滚转并在 0.5–1.2 rad 之间来回，四肢蜷起乱蹬，头扭向一侧',
    transitionS: 0.4,
    pose: derived({
      bodyY: 0.155,
      bodyPitch: 0.04,
      bodyRoll: 0.85,
      bodyRollOscAmp: 0.35,
      bodyRollOscHz: 0.55,
      spineTilt: 0.04,
      arch: 0.18,
      neckPitch: 0.2,
      headPitch: 0.22,
      // 头扭向一侧（静态偏航），另加一点点缓慢的左右扫动
      headYawOffset: 0.5,
      headYawAmp: 0.08,
      headYawFreq: 0.2,
      earFlatten: 0.3,
      earTwitchAmp: 0.05,
      eyeOpen: 0.55,
      blinkIntervalS: 5,
      // 四肢蜷起乱蹬：四条腿各错开一个相位（见 LIMB_FLAIL_PHASE_STEP）
      limbFlailAmp: 0.7,
      limbFlailHz: 2.1,
      hipFront: -0.85,
      kneeFront: 1.5,
      hipHind: -1,
      kneeHind: 1.9,
      legSplay: 0.3,
      tailLift: 0.15,
      tailAmp: 0.3,
      tailFreq: 1.2,
      tailCurl: 0.15,
      // 打滚是活动量较高的动作，呼吸比静息快一些
      breathAmp: 0.04,
      breathFreq: 1.2,
      weightShiftAmp: 0,
      weightShiftFreq: 0,
      jawOpen: 0.1,
    }),
  },
  /**
   * 刨地：**前低后略高**，头朝下，两只前爪交替**向后刨**。
   *
   * 与玩水的区别只在参数、不在机制：同一个 `frontPawOsc*`，
   * 玩水是"向前下方扒"（`hipFront` 取负 = 前摆），刨地是"从身下往后搂"
   * （`hipFront` 取更负的基准 + 更大的膝折，把掌部放到胸下，再向后搂）。
   * 后腿在这里是承重腿（前躯压低之后重心前移），因此基准角几乎不折。
   */
  digging: {
    id: 'digging',
    label: '刨地',
    hint: '前躯压低、后躯略高、头朝下，两只前爪交替向后刨，尾巴上扬',
    transitionS: 0.4,
    pose: derived({
      bodyY: 0.245,
      bodyPitch: 0.22,
      spineTilt: 0.18,
      arch: -0.06,
      neckPitch: 0.86,
      headPitch: 0.46,
      headYawAmp: 0.06,
      headYawFreq: 0.2,
      earFlatten: 0.18,
      eyeOpen: 0.95,
      blinkIntervalS: 4,
      // 前爪交替向后刨：2.2 次/秒（比扒水快一点，刨土的动程短而急）
      frontPawOscAmp: 0.5,
      frontPawOscHz: 2.2,
      hipFront: -0.3,
      kneeFront: 0.8,
      // 后腿几乎伸直：前躯压低之后它们要撑住后躯（"前低后略高"由 bodyPitch 给）
      hipHind: -0.08,
      kneeHind: 0.18,
      legSplay: 0.16,
      tailLift: 0.95,
      tailAmp: 0.22,
      tailFreq: 1.1,
      tailCurl: 0.4,
      breathAmp: 0.035,
      breathFreq: 1.1,
      jawOpen: 0.08,
    }),
  },
};

const POSE_KEYS: readonly (keyof DogPoseParams)[] = Object.keys(STAND_POSE) as (keyof DogPoseParams)[];

/** 爪底贴合地面的容差（米）：留 4 mm 是为了不跟浮点与毛壳较劲。 */
export const PAW_GROUND_TOLERANCE_M = 0.004;
/** 兜底允许的最大折膝角（弧度）：再大就成了反关节。 */
const PAW_MAX_FOLD_RAD = 2.6;
/** 二分的步数：2.6 rad / 2^7 ≈ 0.02 rad，对应爪高误差 < 1 mm。 */
const PAW_BISECT_STEPS = 7;
/** 复用的临时向量：夹爪每帧要读 4 条腿的世界位置，不该每帧新建对象。 */
const TMP_PAW = new Vector3();

/**
 * 量出「爪网格原点 → 爪底」的垂直偏移（负数）。
 *
 * 用几何包围盒而不是常数：模型改爪子尺寸/比例时这里自动跟着变。
 * 包围盒取不到（几何没有顶点）时退回 0 —— 那时高度判定退化为"按原点算"，
 * 不如测准，但绝不会抛异常。
 */
function measureSoleOffset(leg: DogLeg): number {
  const geo = leg.paw.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const minY = geo.boundingBox?.min.y;
  if (minY === undefined || !Number.isFinite(minY)) return 0;
  return minY * leg.paw.scale.y;
}

// ============================================================ 突发时相帧

/**
 * 一个时相对姿态的**附加形变**。
 *
 * 全部是**增量**（除了两个倍率）：姿态表给出基准，时相程序只补差异。
 * 这样「抽搐」的四个时相与「呕吐」的三个时相共用同一套叠加逻辑，
 * 也不会把姿态表里那些正常姿态的数值搅乱。
 */
interface IncidentFrame {
  /** 躯干高度增量（米；侧倒时是负值） */
  bodyYAdd: number;
  /** 躯干俯仰增量（弧度） */
  bodyPitchAdd: number;
  /** 躯干侧倾（弧度，绝对值）—— 强直期与恢复期的侧倒是靠它 */
  bodyRoll: number;
  /** 脊椎倾斜增量（弧度） */
  spineAdd: number;
  /** 脊椎往复摆动幅度（弧度）—— 干呕时的"反复拱起" */
  spineOscAmp: number;
  /** 颈根俯仰增量 */
  neckAdd: number;
  /** 头部俯仰增量 */
  headAdd: number;
  /** 耳朵后压增量 */
  earFlattenAdd: number;
  /** 眼睛开启增量（恢复期闭眼取负） */
  eyeOpenAdd: number;
  /** 尾根上翘增量（负 = 尾巴下垂/夹起） */
  tailLiftAdd: number;
  /** 下颌开合增量 */
  jawOpenAdd: number;
  /** 下颌开合摆动幅度 —— 阵挛期的开合 */
  jawOscAmp: number;
  /** 舌伸出量（0–1） */
  tongueOut: number;
  /** 是否按舔嘴节奏摆动舌头（0 静态伸出，1 摆动） */
  licking: number;
  /** 抖动幅度（米）—— 阵挛期的核心表现 */
  tremorAmp: number;
  /**
   * 抖动的**横向**分量（弧度，绕 Z 的侧倾振荡）。
   *
   * 为什么单独给一个字段：用户的反馈是"抽搐要有**明显的原地抖动**"。
   * 只放大 `tremorAmp`（上下位移）会把抖动做成"整只狗在上下弹"，
   * 而真实的阵挛是**躯干左右抖 + 四肢划水**。横向用独立的幅度，
   * 两个方向才能分别调到"看得明显但不假"。
   */
  tremorRollAmp: number;
  /** 四肢划水样动作幅度（弧度） */
  limbPaddleAmp: number;
  /** 僵直程度（0 松弛 → 1 绷直） */
  rigidity: number;
  /** 腹部收缩幅度（相对量，0–1）—— 干呕时的"腹部反复收缩" */
  breathOscAmp: number;
  /** 呼吸幅度倍率 */
  breathAmpScale: number;
  /** 呼吸频率倍率 */
  breathFreqScale: number;
  /** 口腔分泌物（0–1）：用舌头外露 + 下颌微垂表现 */
  saliva: number;
}

const ZERO_FRAME: IncidentFrame = {
  bodyYAdd: 0,
  bodyPitchAdd: 0,
  bodyRoll: 0,
  spineAdd: 0,
  spineOscAmp: 0,
  neckAdd: 0,
  headAdd: 0,
  earFlattenAdd: 0,
  eyeOpenAdd: 0,
  tailLiftAdd: 0,
  jawOpenAdd: 0,
  jawOscAmp: 0,
  tongueOut: 0,
  licking: 0,
  tremorAmp: 0,
  tremorRollAmp: 0,
  limbPaddleAmp: 0,
  rigidity: 0,
  breathOscAmp: 0,
  breathAmpScale: 1,
  breathFreqScale: 1,
  saliva: 0,
};

/** 呼吸的倍率字段：插值/衰减时以 1 为基准，而不是以 0。 */
const MULTIPLIER_KEYS: readonly string[] = ['breathAmpScale', 'breathFreqScale'];

/** 抽搐的四个时相帧。时长见 `SEIZURE_PHASE_S`。 */
const SEIZURE_FRAMES: Readonly<Record<'aura' | 'tonic' | 'clonic' | 'recovery', IncidentFrame>> = {
  /** ① 先兆：僵住、耳朵后压、尾巴下垂（body 不侧倾，仍站着） */
  aura: {
    ...ZERO_FRAME,
    earFlattenAdd: 0.85,
    tailLiftAdd: -0.35,
    rigidity: 0.55,
    breathAmpScale: 0.9,
    breathFreqScale: 1.5,
  },
  /** ② 强直：全身僵直、四肢伸直、躯干侧倾（`body.rotation.z` 到约 0.55 rad） */
  tonic: {
    ...ZERO_FRAME,
    // 侧倾 0.55 rad 时身体已经不是四脚着地，躯干高度必须跟着降到约 0.23 m
    bodyYAdd: -0.09,
    bodyRoll: 0.55,
    earFlattenAdd: 1,
    eyeOpenAdd: 0,
    tailLiftAdd: -0.15,
    headAdd: -0.12,
    jawOpenAdd: 0.02,
    tremorAmp: 0.002,
    rigidity: 1,
    breathAmpScale: 0.7,
    breathFreqScale: 0.6,
    saliva: 0.2,
  },
  /** ③ 阵挛：高频抖动 + 四肢划水样动作 + 下颌开合 + 流涎（躯干侧倒到约 1.05 rad） */
  clonic: {
    ...ZERO_FRAME,
    bodyYAdd: -0.17,
    bodyRoll: 1.05,
    earFlattenAdd: 1,
    eyeOpenAdd: -0.4,
    tailLiftAdd: -0.2,
    jawOpenAdd: 0.25,
    jawOscAmp: 0.3,
    tongueOut: 0.55,
    // 抖动幅度按用户反馈调足：40 cm 肩高的狗，躯干上下 ~10 cm + 侧倾摆幅 ~23°
    // —— 远看就能认出"在抖"，又不至于变成"整只狗在弹跳"（原来只有 1.6 cm / ~6°）。
    tremorAmp: 0.035,
    tremorRollAmp: 0.14,
    limbPaddleAmp: 0.55,
    rigidity: 0.35,
    breathAmpScale: 1.1,
    breathFreqScale: 1.6,
    saliva: 0.9,
  },
  /** ④ 恢复：抖动逐渐停止、侧卧、呼吸变深、眼睛闭上 */
  recovery: {
    ...ZERO_FRAME,
    bodyYAdd: -0.19,
    bodyRoll: 1.2,
    earFlattenAdd: 0.7,
    eyeOpenAdd: -0.85,
    tailLiftAdd: -0.25,
    jawOpenAdd: 0.12,
    tongueOut: 0.3,
    licking: 0.15,
    tremorAmp: 0.002,
    limbPaddleAmp: 0.05,
    rigidity: 0.12,
    breathAmpScale: 1.5,
    breathFreqScale: 0.6,
    saliva: 0.35,
  },
};

/** 呕吐的三个时相帧。 */
const VOMIT_FRAMES: Readonly<Record<'retch' | 'expel' | 'recover', IncidentFrame>> = {
  /** ① 干呕：腹部反复收缩（`breathOscAmp`）、脊椎反复拱起（`spineOscAmp`）、头略低 */
  retch: {
    ...ZERO_FRAME,
    bodyYAdd: -0.02,
    bodyPitchAdd: 0.1,
    spineAdd: 0.12,
    spineOscAmp: 0.22,
    breathOscAmp: 0.55,
    neckAdd: 0.25,
    headAdd: 0.18,
    earFlattenAdd: 0.5,
    eyeOpenAdd: -0.2,
    tailLiftAdd: -0.35,
    jawOpenAdd: 0.15,
    rigidity: 0.1,
    breathAmpScale: 0.9,
    breathFreqScale: 1.2,
  },
  /** ② 呕出：头更低、下颌大张、躯干前倾 */
  expel: {
    ...ZERO_FRAME,
    bodyYAdd: -0.05,
    bodyPitchAdd: 0.28,
    spineAdd: 0.2,
    neckAdd: 0.5,
    headAdd: 0.45,
    earFlattenAdd: 0.8,
    eyeOpenAdd: -0.25,
    tailLiftAdd: -0.45,
    jawOpenAdd: 0.75,
    tongueOut: 0.7,
    breathAmpScale: 1.3,
    breathFreqScale: 1.5,
  },
  /** ③ 恢复：舔嘴、身体回正、呼吸略深 */
  recover: {
    ...ZERO_FRAME,
    bodyPitchAdd: -0.02,
    neckAdd: -0.05,
    headAdd: -0.05,
    earFlattenAdd: 0.15,
    tailLiftAdd: 0.1,
    jawOpenAdd: 0.05,
    tongueOut: 0.35,
    licking: 1,
    breathAmpScale: 1.15,
    breathFreqScale: 0.8,
  },
};

interface IncidentPhase {
  readonly seconds: number;
  readonly frame: IncidentFrame;
}

const SEIZURE_PHASES: readonly IncidentPhase[] = [
  { seconds: SEIZURE_PHASE_S.aura, frame: SEIZURE_FRAMES.aura },
  { seconds: SEIZURE_PHASE_S.tonic, frame: SEIZURE_FRAMES.tonic },
  { seconds: SEIZURE_PHASE_S.clonic, frame: SEIZURE_FRAMES.clonic },
  { seconds: SEIZURE_PHASE_S.recovery, frame: SEIZURE_FRAMES.recovery },
];

const VOMIT_PHASES: readonly IncidentPhase[] = [
  { seconds: VOMIT_PHASE_S.retch, frame: VOMIT_FRAMES.retch },
  { seconds: VOMIT_PHASE_S.expel, frame: VOMIT_FRAMES.expel },
  { seconds: VOMIT_PHASE_S.recover, frame: VOMIT_FRAMES.recover },
];

// ============================================================ 关节槽位

type LegKey = 'frontL' | 'frontR' | 'hindL' | 'hindR';

interface LegSlot {
  key: LegKey;
  leg: DogLeg;
  /** 后肢还是前肢（决定用哪一组基础角度） */
  hind: boolean;
  /** 是否左腿（狗面朝 +Z 时左腿在 +X，外张取正的 rotation.z） */
  left: boolean;
  /** 爪网格原点 → 爪底 的垂直偏移（负值，构造时量一次，见 `measureSoleOffset`） */
  soleOffsetY: number;
}

/** 一个被控制器缩放的网格，连同它的**基准缩放**（构造时读一次，避免逐帧连乘漂移）。 */
interface ScaledPart {
  part: Object3D;
  sx: number;
  sy: number;
  sz: number;
}

// ============================================================ 控制器

export class DogController {
  readonly rig: DogRig;

  /** 目标姿态（可打断的过渡永远朝它走）。 */
  private target: DogPoseId;
  /** 过渡起点参数 */
  private fromParams: DogPoseParams;
  /** 过渡进度 0→1（用 dt 累积，而不是 wall clock：无头环境靠 timeScale 也能推到底） */
  private transitionT: number;
  private transitionDurationS: number;
  /** 突发动作的权重：进入突发时升到 1，离开时衰减回 0（避免侧倾与抖动"啪"地消失） */
  private incidentWeight: number;
  private incidentWeightFrom: number;
  /** 当前（或刚离开的）突发姿态；权重归零后为 null */
  private incidentPose: DogPoseId | null;
  private incidentElapsedS: number;
  /** 本次呕吐是否已经"吐出"过（一次性事件，见 `consumeVomitEmit`） */
  private vomitEmitted: boolean;
  private gaitPhase: number;
  /** 步态幅度接合量 0–1（停走时收回站姿，而不是让腿僵在半空） */
  private gaitEngage: number;
  private time: number;
  private blinkTimer: number;
  private blinkPhase: number;
  private sleepTwitchTimer: number;
  private sleepTwitchLeftS: number;
  private eatLickTimer: number;
  private eatLickLeftS: number;
  /** 甩头的计时器与当前这一下的剩余时长（玩水用；与睡着的耳抽动同构） */
  private headShakeTimer: number;
  private headShakeLeftS: number;
  /**
   * 已认领的**扒水序号**（`consumeSplashEvent` 的防重入状态）。
   *
   * 语义：`-1` = 还没进入玩水（或已离开），大于等于 0 = 上一次认领的是第几下扒水。
   * 它与`vomitEmitted` 那种布尔"一次性"不同 —— 玩水要**反复**出水花，
   * 所以这里记的是"认到了第几下"，而不是"认过没有"。
   */
  private splashStroke: number;
  /** 累计认领过几次扒水（自检用：证明水花是反复事件，不是只出一次） */
  private splashEmits: number;
  private reducedMotion: boolean;
  private timeScale: number;
  private disposed: boolean;
  /** 逐帧写入的关节角（自检用；`snapshot()` 会拷一份出去） */
  private readonly joints: Record<string, number>;
  private readonly legs: readonly LegSlot[];
  private readonly breathParts: readonly ScaledPart[];
  private readonly eyeParts: readonly ScaledPart[];
  private readonly pupilParts: readonly ScaledPart[];
  private readonly tonguePart: Object3D;
  private readonly tongueBase: { sx: number; sy: number; sz: number };
  private readonly listeners: Array<(id: DogPoseId) => void>;

  constructor(rig: DogRig, opts: DogControllerOptions) {
    this.rig = rig;
    this.reducedMotion = opts.reducedMotion;
    this.timeScale = opts.timeScale !== undefined && opts.timeScale > 0 ? opts.timeScale : 1;
    this.target = 'stand';
    this.fromParams = { ...DOG_POSES.stand.pose };
    this.transitionT = 1;
    this.transitionDurationS = DOG_POSES.stand.transitionS;
    this.incidentWeight = 0;
    this.incidentWeightFrom = 0;
    this.incidentPose = null;
    this.incidentElapsedS = 0;
    this.vomitEmitted = false;
    this.gaitPhase = 0;
    this.gaitEngage = 0;
    this.time = 0;
    this.blinkTimer = 0;
    this.blinkPhase = 1;
    this.sleepTwitchTimer = 0;
    this.sleepTwitchLeftS = 0;
    this.eatLickTimer = 0;
    this.eatLickLeftS = 0;
    this.headShakeTimer = 0;
    this.headShakeLeftS = 0;
    this.splashStroke = -1;
    this.splashEmits = 0;
    this.disposed = false;
    this.joints = {};
    this.listeners = [];
    this.legs = [
      { key: 'frontL', leg: rig.legs.frontL, hind: false, left: true, soleOffsetY: measureSoleOffset(rig.legs.frontL) },
      { key: 'frontR', leg: rig.legs.frontR, hind: false, left: false, soleOffsetY: measureSoleOffset(rig.legs.frontR) },
      { key: 'hindL', leg: rig.legs.hindL, hind: true, left: true, soleOffsetY: measureSoleOffset(rig.legs.hindL) },
      { key: 'hindR', leg: rig.legs.hindR, hind: true, left: false, soleOffsetY: measureSoleOffset(rig.legs.hindR) },
    ];
    this.breathParts = rig.breathParts.map((part) => readScale(part));
    this.eyeParts = [readScale(rig.eyeL), readScale(rig.eyeR)];
    this.pupilParts = [readScale(rig.pupilL), readScale(rig.pupilR)];
    this.tonguePart = rig.tongue;
    this.tongueBase = readScale(rig.tongue);
    // 首帧就落成站姿：任何一帧的骨架都必须是完整姿态，不能有"半初始化"状态
    this.applyPose({ ...DOG_POSES.stand.pose }, null);
  }

  // ---------------------------------------------------------- 对外接口

  getPose(): DogPoseId {
    return this.target;
  }

  /** 姿态变化回调（UI 同步用）。 */
  onPoseChange(fn: (id: DogPoseId) => void): void {
    this.listeners.push(fn);
  }

  /**
   * 设置姿态（带过渡；过渡时长由状态表给出）。
   *
   * 可打断：过渡中再次调用会**从当前混合值继续**，而不是跳回起点。
   * 用户连点两个档位时，画面必须连续。
   */
  setPose(id: DogPoseId): void {
    if (this.disposed) return;
    if (id === this.target) return;
    this.fromParams = this.currentParams();
    this.incidentWeightFrom = this.incidentWeight;
    this.target = id;
    this.transitionDurationS = DOG_POSES[id].transitionS;
    this.transitionT = 0;
    // 每次换姿态都把"第几下扒水"的基准清掉：否则切回玩水时，第一帧就会凭一个陈旧的序号
    // 立刻认领一次水花（画面上还没开始扒，水面上先炸了一下）
    this.splashStroke = -1;
    if (isIncidentPose(id)) {
      this.incidentPose = id;
      this.incidentElapsedS = 0;
      // 重新进入突发时把"已经吐过"清掉：否则第二次点呕吐不会再生成呕吐物
      this.vomitEmitted = false;
    }
    for (const fn of this.listeners) fn(id);
  }

  /**
   * 立即切到某姿态（不做过渡）：首屏与截图用。
   *
   * 无头环境可能只渲染很少几帧，过渡推不完，于是截图会拍到中间态 ——
   * 所以截图路径必须用这个，而不是 `setPose`。
   */
  snapTo(id: DogPoseId): void {
    if (this.disposed) return;
    this.target = id;
    this.fromParams = { ...DOG_POSES[id].pose };
    this.transitionT = 1;
    this.transitionDurationS = DOG_POSES[id].transitionS;
    this.incidentWeight = isIncidentPose(id) ? 1 : 0;
    this.incidentWeightFrom = this.incidentWeight;
    this.incidentPose = isIncidentPose(id) ? id : null;
    this.incidentElapsedS = 0;
    this.vomitEmitted = false;
    this.gaitPhase = 0;
    this.gaitEngage = DOG_POSES[id].pose.gait === 'none' ? 0 : 1;
    this.blinkTimer = 0;
    this.blinkPhase = 1;
    this.sleepTwitchTimer = 0;
    this.sleepTwitchLeftS = 0;
    this.eatLickTimer = 0;
    this.eatLickLeftS = 0;
    this.headShakeTimer = 0;
    this.headShakeLeftS = 0;
    // 扒水的认领状态一起复位：换姿态之后"第几下扒水"要重新起算
    this.splashStroke = -1;
    this.applyPose({ ...DOG_POSES[id].pose }, gaitDefOf(DOG_POSES[id].pose.gait));
    for (const fn of this.listeners) fn(id);
  }

  /** 重播当前突发演示的时相（自检与"再看一次"用）。非突发姿态下无效果。 */
  restartIncident(): void {
    if (!isIncidentPose(this.target)) return;
    this.incidentPose = this.target;
    this.incidentElapsedS = 0;
    this.vomitEmitted = false;
  }

  /**
   * **一次性事件**：呕吐进入「呕出」时返回一次 `true`，之后不再返回。
   *
   * 为什么做成"消费式"而不是回调：场景每帧轮询它、命中一次就在狗嘴前方放一团呕吐物。
   * 回调会把"吐了几次"这件事分散到两个模块里；消费式只有一个地方判断，
   * 而且天然幂等 —— 每帧都调也不会重复生成（这一点由 `check-dog-pose.mjs` 断言）。
   *
   * 时间点取**干呕期结束**（也就是 `VOMIT_PHASE_S.retch`），而不是时相索引的第 1 项：
   * 两者等价，但写成时间阈值可以在时相表被改动时仍然指向"开始吐的那一刻"。
   */
  consumeVomitEmit(): boolean {
    if (this.vomitEmitted) return false;
    if (!isIncidentPose(this.target) || this.target !== 'vomit') return false;
    if (this.incidentElapsedS < VOMIT_PHASE_S.retch) return false;
    this.vomitEmitted = true;
    return true;
  }

  /**
   * **反复事件**：当前姿态是玩水时，每**完成一次扒水**返回一次 `true`。
   *
   * ⚠️ 与 `consumeVomitEmit` 的区别（这一点必须写清楚，否则很容易被当成同一种东西改坏）：
   *   - 呕吐是**一次性**事件：一次呕吐只吐出一团东西，用布尔 `vomitEmitted` 记住"已经吐过"。
   *   - 玩水是**反复**事件：扒水是循环动作，每扒一下都会带起一小簇水花；
   *     若照呕吐那样只返回一次，画面就变成"扒了 30 下只在开头溅了一下" —— 静默失效。
   *     所以这里记住的是"认领到了第几下"（`splashStroke`），序号一变就再返回一次 true。
   *
   * 防重入：序号由 `this.time × 扒水频率` 折算，**在一次扒水的整个行程内是同一个整数**，
   * 因此同一帧调用多次、或一帧内被两个消费者调用，都只会认领一次。
   * 这与"每帧返回 true"有本质区别 —— 后者会让水花以帧率（60 次/秒）生成，画面糊成一团，
   * 而且会把场景的清理逻辑压垮。
   *
   * 时间折算用的是**当前混合参数**里的频率（过渡中也成立），并且以 `SPLASH_STROKES_PER_CYCLE = 2`
   * 折算两条前腿：两腿相位差 π，所以一个振荡周期有两次扒水。
   *
   * 非玩水姿态一律返回 `false`（并把序号清成 `-1`）：抽搐、呕吐、走路都不许冒水花。
   */
  consumeSplashEvent(): boolean {
    if (this.disposed) return false;
    if (this.target !== 'water-play') {
      this.splashStroke = -1;
      return false;
    }
    const params = this.currentParams();
    const strokesPerSecond = params.frontPawOscHz * SPLASH_STROKES_PER_CYCLE;
    if (!(params.frontPawOscAmp > 0) || !(strokesPerSecond > 0)) return false;
    const stroke = Math.floor(this.time * strokesPerSecond);
    if (this.splashStroke < 0) {
      // 刚进入玩水：先记下基准，等**这一下**扒完再报 —— 否则水花会先于动作出现
      this.splashStroke = stroke;
      return false;
    }
    if (stroke === this.splashStroke) return false;
    this.splashStroke = stroke;
    this.splashEmits += 1;
    return true;
  }

  /** 自检用：累计认领过几次扒水（水花是反复事件，这个数应该持续增长）。 */
  splashEmitCount(): number {
    return this.splashEmits;
  }

  /**
   * 逐帧推进。`dt` 是真实秒。
   *
   * `gait.phaseSpeed`（步/秒）由调用方给：速度越快、步频越高，本控制器不自己算位移。
   * 不传 `gait` 时按姿态表里的**标称步频**自己走 —— 这样演示档位与截图
   * （没有运行时给速度）也能看到真正的步态循环，而不是定格在半个跨步上。
   */
  update(dt: number, gait?: { phaseSpeed: number; moving: boolean }): void {
    if (this.disposed) return;
    const raw = Number.isFinite(dt) ? dt : 0;
    const step = Math.min(Math.max(raw, 0), MAX_STEP_S) * this.timeScale;
    this.time += step;

    const params = this.currentParams();
    const gd = gaitDefOf(params.gait);

    // 过渡推进（dt 累积，因此 timeScale 也能把过渡推到底）
    if (this.transitionT < 1) {
      const dur = Math.max(1e-3, this.transitionDurationS);
      this.transitionT = Math.min(1, this.transitionT + step / dur);
      this.incidentWeight =
        this.incidentWeightFrom + (incidentTargetWeight(this.target) - this.incidentWeightFrom) * this.transitionT;
      if (this.incidentWeight <= 0.001 && !isIncidentPose(this.target)) {
        this.incidentWeight = 0;
        this.incidentPose = null;
      }
    } else {
      this.incidentWeight = incidentTargetWeight(this.target);
    }

    // 步态相位：移动姿态下按调用方给的步频累积；非移动姿态归零
    if (gd) {
      const moving = gait ? gait.moving : true;
      const requested = gait && gait.phaseSpeed > 0 ? gait.phaseSpeed : 0;
      const hz = requested > 0 ? requested : gd.nominalHz;
      if (moving) this.gaitPhase = wrap01(this.gaitPhase + hz * step);
      const target = moving ? 1 : 0;
      const k = 1 - Math.exp(-step / GAIT_ENGAGE_TAU_S);
      this.gaitEngage += (target - this.gaitEngage) * k;
      if (this.gaitEngage < 0.001) this.gaitEngage = 0;
      if (this.gaitEngage > 0.999) this.gaitEngage = 1;
    } else {
      this.gaitPhase = 0;
      this.gaitEngage = 0;
    }

    this.advanceMicroTimers(step, params);

    // 突发计时：按目标姿态推进，走到头就停在末时相（不去循环，避免"永远在抽搐"）
    if (this.incidentPose !== null && isIncidentPose(this.target)) {
      this.incidentElapsedS = Math.min(this.incidentElapsedS + step, incidentDurationS(this.target));
    }

    this.applyPose(params, gd);
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
  }

  /** 自检用：当前姿态参数快照。 */
  snapshot(): DogPoseSnapshot {
    return {
      pose: this.target,
      bodyHeight: round4(this.rig.body.position.y),
      gaitPhase: round4(this.gaitPhase),
      joints: { ...this.joints },
      incident: isIncidentPose(this.target),
    };
  }

  /**
   * 突发动作的幅度快照（用来区分"标签在报"与"身体真的在动"）。
   *
   * 关键字段：
   *   - `tremorAmp`：时相程序给出的抖动幅度（阵挛期 > 0）；
   *   - `tremorApplied`：**实际叠加到骨架上**的抖动幅度（`reducedMotion` 为真时是 0）。
   *     两者分开报，是因为"降动效时不该抖"与"阵挛期本来有抖动"是两件事，混成一个数
   *     就没法区分「没抖」是因为时相不对还是因为开了降动效。
   */
  incidentMotionSnapshot(): Record<string, number> | null {
    if (this.incidentWeight <= 0.001) return null;
    const frame = this.incidentFrame();
    const applied = this.reducedMotion ? 0 : this.incidentWeight;
    return {
      phaseIndex: this.incidentPhaseIndex(),
      elapsedS: round4(this.incidentElapsedS),
      weight: round4(this.incidentWeight),
      tremorAmp: round4(frame.tremorAmp),
      tremorRollAmp: round4(frame.tremorRollAmp),
      tremorApplied: round4(frame.tremorAmp * applied),
      tremorRollApplied: round4(frame.tremorRollAmp * applied),
      limbPaddleAmp: round4(frame.limbPaddleAmp),
      rigidity: round4(frame.rigidity),
      jawOpenAdd: round4(frame.jawOpenAdd),
      bodyRoll: round4(frame.bodyRoll),
      saliva: round4(frame.saliva),
      breathAmpScale: round4(frame.breathAmpScale),
      breathFreqScale: round4(frame.breathFreqScale),
      reducedMotion: this.reducedMotion ? 1 : 0,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.length = 0;
    // 归还基准缩放：被 dispose 的控制器不该在骨架上留下自己的形变
    for (const p of this.breathParts) p.part.scale.set(p.sx, p.sy, p.sz);
    for (const p of this.eyeParts) p.part.scale.set(p.sx, p.sy, p.sz);
    for (const p of this.pupilParts) {
      p.part.scale.set(p.sx, p.sy, p.sz);
      p.part.visible = true;
    }
    this.tonguePart.scale.set(this.tongueBase.sx, this.tongueBase.sy, this.tongueBase.sz);
    this.tonguePart.visible = false;
  }

  // ---------------------------------------------------------- 内部：爪底贴地

  /**
   * 把低于地面的爪子折上来（**姿态的最后一道闸门**，在四肢之后、台账之前调用）。
   *
   * 为什么需要它，而不是把 14 个姿态的膝角一个个调好：
   *   低姿态（趴卧 / 睡 / 喝水 / 嗅闻 / 玩耍 / 排泄 / 坐）要把躯干压到 0.13–0.24 m，
   *   而前肢在柴犬的真实比例下长 0.29 m —— 膝角不折够，前爪就会**插进地板**。
   *   实测最深 15 cm。这类错误写在姿态表里是"每加一个姿态就要重算一遍"的活，
   *   而且步态起伏与突发的身体侧倾都会重新把它捅出来。
   *   所以改成运行时兜底：**量出爪底的世界高度，不够就继续折膝**，迭代到贴地为止。
   *
   * 四条纪律：
   *   1. 基准取 `root.position.y` 而不是 0 —— 狗在院子里时脚下是 −0.12 m 的草坪，
   *      拿 0 当基准会让它在草地上一路"悬空 12 cm"。
   *   2. **只读世界矩阵，不写 `root`**（世界变换归运行时，见文件头纪律）。
   *   3. 迭代有上限：真的够不到（躯干压得比腿还低）时宁可留一点残差，
   *      也不要无界地折下去把腿折成反关节。
   *   4. 这条兜底**不解决"够不到"**（那是比例问题），只解决"折得不够"。
   */
  /**
   * 爪**底**（最下沿）的世界高度。
   *
   * ⚠️ 这是本轮踩到的一个真坑：`paw.getWorldPosition()` 给的是**爪网格的原点**，
   * 而柴犬的爪子是半径约 2 cm 的厚球 —— 拿原点当"爪底"会让所有高度判定整体差 2 cm：
   * 站姿看起来"浮空 2 cm"（其实爪底正好在 0），夹爪兜底也会过度折膝（把爪多抬 2 cm）。
   * 偏移量在构造时从几何包围盒量一次，模型改爪子尺寸也不用改这里。
   */
  private soleWorldY(slot: LegSlot): number {
    return slot.leg.paw.getWorldPosition(TMP_PAW).y + slot.soleOffsetY;
  }

  private clampPawsToGround(): void {
    const target = this.rig.root.position.y + PAW_GROUND_TOLERANCE_M;
    /*
     * ⚠️ 这一档**只做单向**（防穿地），不做"把浮空的爪拉回地面"。
     *
     * 为什么：爪底高度关于膝角是 **V 形**的 —— 膝角 0 时腿最长、爪最低，
     * 往两边折都会把爪抬高（`drop = L1·cos(h) + L2·cos(h+k)`，在 h+k=0 处最大）。
     * 因此"抬高爪"是单调的，"降低爪"只在 k→0 那一段单调。
     * 我一开始写成双向二分，结果把 stand 从浮 2.1 cm 变成了浮 3.0 cm（V 形函数上二分给的是垃圾）。
     * 站姿那点"浮空"后来查明根本不是姿态问题，而是**量错了地方** ——
     * 之前量的是爪网格的原点，而不是爪底（见 `soleWorldY`）。改成量爪底之后站姿本来就是贴地的。
     */
    for (const slot of this.legs) {
      if (!slot) continue;
      const knee = slot.leg.knee;
      if (this.soleWorldY(slot) >= target) continue;

      /*
       * 二分求"刚好够到地面的最小折角"（在 [knee, knee + 2.6] 上单调递增）。
       *
       * 为什么不用"按缺口逐步加角"的迭代：腿快伸直时 `d(爪高)/d(膝角) ≈ L2·sin(hip+knee)`
       * 趋近 0 —— 在 sit 上实测每加 0.1 rad 只抬高 2.5 mm，四步迭代只修掉 1 cm（残留 2.5 cm）。
       * 二分没有这个问题：7 步就把 2.6 rad 的区间收到 0.02 rad → 爪高误差 < 1 mm。
       * 求的是**最小**够用折角：姿态表本来就折够的档位不会被它改动。
       */
      const lo0 = knee.rotation.x;
      const hi0 = knee.rotation.x + PAW_MAX_FOLD_RAD;
      knee.rotation.x = hi0;
      if (this.soleWorldY(slot) < target) {
        // 上界都够不到（躯干压得比腿短还低）：保持最大折角，宁可留残差
        continue;
      }
      let lo = lo0;
      let hi = hi0;
      for (let i = 0; i < PAW_BISECT_STEPS; i++) {
        const mid = (lo + hi) / 2;
        knee.rotation.x = mid;
        if (this.soleWorldY(slot) < target) lo = mid;
        else hi = mid;
      }
      knee.rotation.x = hi;
    }
  }

  // ---------------------------------------------------------- 内部：混合与计时

  /** 当前**显示中**的参数（过渡中的混合值）。 */
  private currentParams(): DogPoseParams {
    const to = DOG_POSES[this.target].pose;
    if (this.transitionT >= 1) return { ...to };
    return lerpPose(this.fromParams, to, easeOutCubic(this.transitionT));
  }

  /** 眨眼、睡眠耳抽动、进食舔嘴这些**事件型**微动作的计时器。 */
  private advanceMicroTimers(step: number, params: DogPoseParams): void {
    if (params.blinkIntervalS > 0 && !this.reducedMotion) {
      this.blinkTimer += step;
      if (this.blinkTimer >= params.blinkIntervalS) {
        this.blinkTimer = 0;
        this.blinkPhase = 0;
      }
      if (this.blinkPhase < 1) this.blinkPhase = Math.min(1, this.blinkPhase + step / BLINK_DURATION_S);
    } else {
      this.blinkPhase = 1;
    }

    if (this.target === 'sleep' && !this.reducedMotion) {
      this.sleepTwitchTimer += step;
      if (this.sleepTwitchTimer >= SLEEP_EAR_TWITCH_INTERVAL_S) {
        this.sleepTwitchTimer = 0;
        this.sleepTwitchLeftS = SLEEP_EAR_TWITCH_DURATION_S;
      }
      if (this.sleepTwitchLeftS > 0) this.sleepTwitchLeftS = Math.max(0, this.sleepTwitchLeftS - step);
    } else {
      this.sleepTwitchTimer = 0;
      this.sleepTwitchLeftS = 0;
    }

    if (this.target === 'eat' && !this.reducedMotion) {
      this.eatLickTimer += step;
      if (this.eatLickTimer >= EAT_LICK_INTERVAL_S) {
        this.eatLickTimer = 0;
        this.eatLickLeftS = EAT_LICK_DURATION_S;
      }
      if (this.eatLickLeftS > 0) this.eatLickLeftS = Math.max(0, this.eatLickLeftS - step);
    } else {
      this.eatLickTimer = 0;
      this.eatLickLeftS = 0;
    }

    // 甩头（玩水时"隔一会儿甩一次"）：间隔由姿态给，单次形状由 HEAD_SHAKE_* 给。
    // 它是**事件型**的高频动作，因此与耳抽动、舔嘴一样受降动效约束（`reducedMotion` 下不做）。
    if (params.headShakeIntervalS > 0 && !this.reducedMotion) {
      this.headShakeTimer += step;
      if (this.headShakeTimer >= params.headShakeIntervalS) {
        this.headShakeTimer = 0;
        this.headShakeLeftS = HEAD_SHAKE_DURATION_S;
      }
      if (this.headShakeLeftS > 0) this.headShakeLeftS = Math.max(0, this.headShakeLeftS - step);
    } else {
      this.headShakeTimer = 0;
      this.headShakeLeftS = 0;
    }
  }

  /** 单次脉冲的包络：0 → 1 → 0（睡眠耳抽动、舔嘴都用它）。 */
  private pulse(leftS: number, durationS: number): number {
    if (leftS <= 0 || durationS <= 0) return 0;
    return Math.sin(Math.PI * (1 - leftS / durationS));
  }

  private incidentPhaseIndex(): number {
    const phases = this.phasesOf(this.incidentPose);
    if (!phases) return -1;
    let t = this.incidentElapsedS;
    for (let i = 0; i < phases.length; i++) {
      const ph = phases[i];
      if (!ph) continue;
      if (t < ph.seconds || i === phases.length - 1) return i;
      t -= ph.seconds;
    }
    return phases.length - 1;
  }

  private phasesOf(pose: DogPoseId | null): readonly IncidentPhase[] | null {
    if (pose === 'seizure') return SEIZURE_PHASES;
    if (pose === 'vomit') return VOMIT_PHASES;
    return null;
  }

  /** 当前时相帧（已按 `incidentWeight` 缩放到"离场时平滑归零"）。 */
  private incidentFrame(): IncidentFrame {
    const weight = this.incidentWeight;
    if (weight <= 0.001) return ZERO_FRAME;
    const phases = this.phasesOf(this.incidentPose);
    if (!phases) return ZERO_FRAME;
    return scaleFrame(evaluatePhases(phases, this.incidentElapsedS), weight);
  }

  // ---------------------------------------------------------- 内部：写骨架

  /**
   * 把参数写到 `body` 及其子节点上。**这是本文件唯一碰骨架的地方。**
   *
   * 事件型微动作（眨眼/耳抽动/舔嘴）的计时在 `advanceMicroTimers` 里按 dt 推进；
   * 所有周期动作由 `this.time` 或 `gaitPhase` 决定，因此暂停/降帧不会让动作"卡在半个周期上"。
   */
  private applyPose(params: DogPoseParams, gd: DogGaitDef | null): void {
    const rig = this.rig;
    const t = this.time;
    const omega = (hz: number): number => t * hz * Math.PI * 2;
    const still = this.reducedMotion;
    /** 降动效时的截止频率规则：高于 REDUCED_MOTION_FAST_HZ 的微动作归零，慢的保留。 */
    const smooth = (value: number, hz: number, fallback = 0): number =>
      still && hz > REDUCED_MOTION_FAST_HZ ? fallback : value;

    // ---------------- 突发时相（只有 seizure / vomit 会产生） ----------------
    //
    // 这一段是「标签在报、身体不动」的修复点：突发不能只换标签与姿态，
    // 必须在姿态之外给出身体动作。抽搐靠三个通道读出来：僵直（rigidity）、
    // 高频抖动（tremor）、四肢划水样动作（limbPaddle）；呕吐靠腹部收缩与脊椎往复。
    const inc = this.incidentFrame();
    const applied = still ? 0 : this.incidentWeight;
    // 抖动：上下（两个不同频率叠加，避免读成"规律振荡"）+ **横向侧倾**（`tremorRollAmp`）。
    // 横向分量单独给幅度：用户的反馈是"要有明显的原地抖动"，
    // 只放大上下位移会做成"整只狗在弹跳"，而阵挛是躯干左右抖。
    const tremor =
      applied > 0 ? (Math.sin(omega(TREMOR_HZ)) * inc.tremorAmp + Math.sin(omega(TREMOR_HZ_2) + 1.3) * inc.tremorAmp * 0.5) : 0;
    const tremorRoll =
      applied > 0 ? Math.sin(omega(TREMOR_HZ * 0.8) + 0.7) * inc.tremorRollAmp : 0;
    const twist = applied > 0 ? Math.sin(omega(TREMOR_HZ * 0.6) + 0.7) * inc.tremorRollAmp * 1.2 : 0;
    const rigidity = inc.rigidity;
    const retch = inc.spineOscAmp > 0 && !still ? Math.sin(omega(RETCH_HZ)) : 0;
    const lick = inc.licking > 0 && !still ? 0.5 + 0.5 * Math.sin(omega(LICK_HZ)) : 0.6;
    const jawClonus = !still ? Math.sin(omega(JAW_CLONUS_HZ)) * inc.jawOscAmp : 0;
    // 唾液：舌头外露 + 下颌微垂，两者都由时相给量
    const saliva = inc.saliva;

    // ---------------- 步态 ----------------
    const engaged = this.gaitEngage;
    const gp = this.gaitPhase;
    const swingAmp = gd ? gd.hipSwing * params.gaitAmpScale * engaged : 0;
    const kneeAmp = gd ? gd.kneeLift * params.gaitAmpScale * engaged : 0;
    let gaitBob = 0;
    let gaitRoll = 0;
    let lateral = 0;
    let suspensionFold = 0;
    if (gd) {
      if (gd.phase.frontL === gd.phase.frontR) {
        // 前后肢成对（奔跑）：每个步幅一次腾空，峰在全伸展之后（p = 0）
        const s = Math.max(0, Math.sin(Math.PI * 2 * (gp + 0.25)));
        const susp = s * s * engaged;
        gaitBob = gd.suspensionLift * susp;
        suspensionFold = gd.suspensionFold * susp;
      } else {
        // 对角步态：每个步幅两次起伏（两对对角腿各支撑一次）
        gaitBob = gd.bobAmp * Math.cos(Math.PI * 4 * gp) * engaged;
      }
      gaitRoll = gd.rollAmp * Math.sin(Math.PI * 2 * gp) * engaged;
      lateral = -gd.lateralAmp * Math.sin(Math.PI * 2 * gp) * engaged;
    }

    // ---------------- 呼吸 ----------------
    // 幅度先被突发改写（阵挛期呼吸急促、恢复期呼吸变深、干呕时腹部收缩），再走安全线。
    const abdominal = 1 - inc.breathOscAmp * Math.abs(retch);
    const breathAmp = clamp(params.breathAmp * inc.breathAmpScale * abdominal, 0, MAX_BREATH_AMP);
    const breathFreq = params.breathFreq * inc.breathFreqScale;
    const breath = Math.sin(omega(breathFreq)) * breathAmp;

    // ---------------- 微动作（重心转移 / 蹦跳 / 眨眼 / 耳抽动） ----------------
    const shift = smooth(Math.sin(omega(params.weightShiftFreq)) * params.weightShiftAmp, params.weightShiftFreq);
    const shiftRoll = smooth(
      Math.sin(omega(params.weightShiftFreq * 0.7)) * params.weightShiftAmp * 2.5,
      params.weightShiftFreq,
    );
    const bounce =
      params.bounceAmp > 0 && !still ? Math.abs(Math.sin(omega(params.bounceFreq))) * params.bounceAmp : 0;
    const sleepTwitch =
      this.sleepTwitchLeftS > 0
        ? this.pulse(this.sleepTwitchLeftS, SLEEP_EAR_TWITCH_DURATION_S) * SLEEP_EAR_TWITCH_AMP
        : 0;
    const blink = this.blinkPhase < 0.5 ? this.blinkPhase * 2 : (1 - this.blinkPhase) * 2;

    // ---------------- 院子里的三个新姿态：滚转振荡 / 甩头 ----------------
    //
    // 滚转振荡与滚转**中心**分开：中心由 `bodyRoll` 给（打滚时是 0.85），振荡由这两个参数给。
    // 这样"侧躺不动"与"来回滚"在参数上是两件可分辨的事，而不是把两个含义挤进一个字段。
    // 默认 0 ⇒ 原有 14 个姿态的 `body.rotation.z` 逐帧不变。
    const rollOsc =
      params.bodyRollOscAmp > 0 && params.bodyRollOscHz > 0
        ? Math.sin(omega(params.bodyRollOscHz)) * params.bodyRollOscAmp
        : 0;
    // 甩头：包络（短促的一下）× 高频正弦。事件型微动作，降动效时不做。
    const headShake =
      this.headShakeLeftS > 0 && !still
        ? this.pulse(this.headShakeLeftS, HEAD_SHAKE_DURATION_S) * HEAD_SHAKE_AMP * Math.sin(omega(HEAD_SHAKE_HZ))
        : 0;

    // ---------------- 躯干（`body`） ----------------
    // 注意：只写 body 的本地变换（位置/旋转/缩放），**不碰 root**。
    rig.body.position.y = params.bodyY + gaitBob + bounce + inc.bodyYAdd + tremor;
    rig.body.position.x = lateral + shift + twist * 0.25;
    rig.body.rotation.x = params.bodyPitch + inc.bodyPitchAdd - rigidity * 0.06;
    rig.body.rotation.z = params.bodyRoll + inc.bodyRoll + gaitRoll + shiftRoll + tremorRoll + twist * 0.3 + rollOsc;
    // 呼吸：只缩放胸腹件（`breathParts`），不动躯干整体 —— 整体缩放会让毛壳穿出轮廓
    const breathScale = 1 + breath;
    for (const p of this.breathParts) {
      p.part.scale.set(p.sx * (1 + breath), p.sy * (1 + breath * 0.5), p.sz * (1 + breath * 0.6));
    }

    // ---------------- 脊椎 / 胸 / 胯 ----------------
    rig.spine.rotation.x = params.spineTilt + inc.spineAdd + inc.spineOscAmp * retch;
    rig.chest.rotation.x = -params.arch * 0.6;
    rig.hips.rotation.x = params.arch * 0.5;

    // ---------------- 头颈 ----------------
    // 头部反向稳定：躯干起伏时头往相反方向转一点，读起来像"视线稳住"而不是"头被甩"
    const headStab = -gaitBob * HEAD_STAB_RAD_PER_M;
    const yaw = smooth(Math.sin(omega(params.headYawFreq)) * params.headYawAmp, params.headYawFreq);
    rig.neck.rotation.x = params.neckPitch + inc.neckAdd + headStab * 0.4;
    rig.head.rotation.x =
      params.headPitch + inc.headAdd + headStab + tremor * 3 - rigidity * 0.12 + smooth(Math.sin(omega(0.3)) * 0.02, 0.3);
    rig.head.rotation.y = yaw + params.headYawOffset + headShake + twist * 1.2;
    rig.head.rotation.z = twist * 0.8 + headShake * 0.35 + smooth(Math.sin(omega(params.headYawFreq * 0.6)) * params.headYawAmp * 0.12, params.headYawFreq * 0.6);

    // ---------------- 下颌 / 舌头 ----------------
    // 咀嚼与舔水都靠下颌与舌头；干呕/阵挛/流涎由时相叠加。
    const chew = !still && params.jawAmp > 0 ? Math.sin(omega(params.jawFreq)) * params.jawAmp : 0;
    const jaw = clamp01(params.jawOpen + chew + inc.jawOpenAdd + jawClonus + saliva * 0.15);
    let tongue = params.tongueOut;
    if (tongue > 0 && !still && params.jawFreq > 0) {
      // 伸出量随下颌节奏脉动（舔水/舔嘴都是"伸出—收回"）
      tongue = params.tongueOut * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(omega(params.jawFreq) + 0.9)));
    }
    // 进食时的偶发舔嘴（低频事件，降动效下不做）
    if (this.target === 'eat' && !still) {
      const eatLick = this.pulse(this.eatLickLeftS, EAT_LICK_DURATION_S);
      tongue = Math.max(tongue, eatLick * 0.9);
    }
    if (inc.tongueOut > 0) tongue = Math.max(tongue, inc.tongueOut * (inc.licking > 0 ? lick : 1));
    tongue = clamp01(tongue);
    rig.jaw.rotation.x = jaw * JAW_OPEN_RAD;
    this.tonguePart.visible = tongue > 0.04;
    this.tonguePart.scale.set(
      this.tongueBase.sx,
      this.tongueBase.sy * (1 + tongue * TONGUE_EXTEND),
      this.tongueBase.sz,
    );

    // ---------------- 眼 / 瞳 ----------------
    const lid = clamp01(params.eyeOpen + inc.eyeOpenAdd) * (1 - blink * BLINK_MAX_CLOSE);
    for (const p of this.eyeParts) p.part.scale.set(p.sx, p.sy * Math.max(0.05, lid), p.sz);
    const pupil = clamp(params.pupilScale, 0.4, 1.8);
    for (const p of this.pupilParts) {
      p.part.scale.set(p.sx * pupil, p.sy * Math.max(0.05, lid), p.sz * pupil);
      p.part.visible = lid > 0.12;
    }

    // ---------------- 耳 ----------------
    const earFlatten = clamp01(params.earFlatten + inc.earFlattenAdd);
    const twitch =
      smooth(Math.sin(omega(EAR_TWITCH_HZ)) * params.earTwitchAmp, EAR_TWITCH_HZ) + (still ? 0 : sleepTwitch);
    rig.earL.rotation.z = earFlatten * EAR_FLATTEN_RAD;
    rig.earR.rotation.z = -earFlatten * EAR_FLATTEN_RAD;
    rig.earL.rotation.x = twitch + earFlatten * 0.2;
    rig.earR.rotation.x = -twitch * 0.7 + earFlatten * 0.2;

    // ---------------- 尾巴 ----------------
    const tailLift = clamp(params.tailLift + inc.tailLiftAdd, -1, 1.4);
    // 移动时尾摆**随步频**（用步态相位），静止时按姿态给的频率自己摆
    const tailPhase = gd ? gp * Math.PI * 2 : omega(params.tailFreq);
    const tailHz = gd ? gd.nominalHz : params.tailFreq;
    const tailAmp = smooth(params.tailAmp * (gd ? Math.max(engaged, 0.35) : 1), tailHz);
    // 尾巴下垂时卷曲自然松开
    const curl = Math.max(0, params.tailCurl) * (tailLift > 0 ? 1 : 1 + tailLift * 0.8);
    rig.tailRoot.rotation.x = tailLift;
    rig.tailRoot.rotation.y = params.tailYaw + smooth(Math.sin(omega(params.tailFreq * 0.5)) * params.tailAmp * 0.15, params.tailFreq * 0.5);
    rig.tailRoot.rotation.z = twist * 0.4;
    for (const [i, seg] of rig.tail.entries()) {
      const r = rig.tail.length > 1 ? i / (rig.tail.length - 1) : 0;
      seg.rotation.y = Math.sin(tailPhase - i * TAIL_WAVE_LAG) * tailAmp * (0.25 + 0.95 * r);
      seg.rotation.x = curl * TAIL_CURL_RAD * (0.35 + 0.65 * r);
      seg.rotation.z = Math.sin(tailPhase * 0.5 - i * 0.4) * tailAmp * 0.2 * r;
    }

    // ---------------- 四肢 ----------------
    for (let i = 0; i < this.legs.length; i++) {
      const slot = this.legs[i];
      if (!slot) continue;
      const base = slot.hind ? params.hipHind : params.hipFront;
      const kneeBase = slot.hind ? params.kneeHind : params.kneeFront;

      // 步态：髋摆 + 摆动期收膝（见 DogGaitDef 的相位说明）
      const offset = gd ? gd.phase[slot.key] : 0;
      const p = gp + offset;
      const swing = gd ? Math.sin(p * Math.PI * 2) * swingAmp : 0;
      const lift = gd ? Math.max(0, -Math.cos(p * Math.PI * 2)) * kneeAmp : 0;
      // 腾空瞬间四肢收拢：髋往前收、膝额外折起
      const fold = suspensionFold * (slot.hind ? 1 : 0.85);
      // 僵直：把折叠的腿拉直（强直期的"四肢伸直"靠它）
      const hipRaw = base + swing - fold * 0.3;
      const kneeRaw = kneeBase + lift + fold * 1;
      const hip = hipRaw + (rigidity > 0 ? (-0.05 - hipRaw) * rigidity : 0);
      const knee = kneeRaw + (rigidity > 0 ? (-0.02 - kneeRaw) * rigidity : 0);
      // 四肢划水样动作：每条腿相位错开，避免整齐划一读成机械
      const paddle = applied > 0 ? Math.sin(omega(PADDLE_HZ) + i * PADDLE_PHASE_STEP) * inc.limbPaddleAmp : 0;

      /*
       * ★ 前爪交替（**姿态驱动**的常态动作，与上面那条突发专用的 `paddle` 是两件事）。
       *
       * 只作用于两条前腿：扒水与刨地都是前肢的动作，后腿在这两个姿态里负责承重。
       * 两腿相位差固定 π（左 0、右 π）—— 两条前爪同时入水会读成"两只手一起拍"，
       * 交替才是扒水/刨土的节奏。
       *
       * 摆幅与频率来自姿态参数（`frontPawOscAmp` / `frontPawOscHz`），默认 0 ⇒ 原有姿态不变。
       * 这里**不受 `reducedMotion` 约束**，理由与步态相同：它就是这两个姿态本身
       * （把它归零等于"玩水"退化成"站在岸边不动"），而不是叠加在姿态上的装饰微动作。
       * 真正的高频装饰（甩头、快摆尾）仍走 `smooth()` 的截止频率规则。
       */
      const pawOsc = !slot.hind && params.frontPawOscAmp > 0 && params.frontPawOscHz > 0;
      const pawPhase = omega(params.frontPawOscHz) + (slot.left ? 0 : Math.PI);
      // 前摆/后搂的往复
      const pawSwing = pawOsc ? Math.sin(pawPhase) * params.frontPawOscAmp : 0;
      // **往后搂**的那半程额外收膝（`sin > 0` 就是髋角增大 = 后蹬）：
      // 掌部划出去再搂回来，只摆髋会读成"原地扇风"
      const pawScoop = pawOsc ? Math.max(0, Math.sin(pawPhase)) * params.frontPawOscAmp * 0.55 : 0;
      // 打滚时的四肢乱蹬：四条腿各错开一个相位（同相会读成"整排腿一起踢"）
      const flail =
        params.limbFlailAmp > 0 && params.limbFlailHz > 0
          ? Math.sin(omega(params.limbFlailHz) + i * LIMB_FLAIL_PHASE_STEP) * params.limbFlailAmp
          : 0;

      slot.leg.hip.rotation.x = hip + paddle + pawSwing + flail;
      slot.leg.hip.rotation.z = (slot.left ? 1 : -1) * params.legSplay;
      slot.leg.knee.rotation.x = knee + paddle * 0.6 + pawScoop + flail * 0.7;

      this.joints[slot.key + '.hip'] = round4(slot.leg.hip.rotation.x);
      this.joints[slot.key + '.knee'] = round4(slot.leg.knee.rotation.x);
    }

    // ---------------- 爪底不穿地 ----------------
    // 放在四肢之后、台账之前：它是**姿态的最后一道闸**。
    this.clampPawsToGround();

    // ---------------- 自检台账 ----------------
    this.joints.bodyY = round4(rig.body.position.y);
    this.joints.bodyPitch = round4(rig.body.rotation.x);
    this.joints.bodyRoll = round4(rig.body.rotation.z);
    this.joints.spineTilt = round4(rig.spine.rotation.x);
    this.joints.chest = round4(rig.chest.rotation.x);
    this.joints.hips = round4(rig.hips.rotation.x);
    this.joints.neckPitch = round4(rig.neck.rotation.x);
    this.joints.headPitch = round4(rig.head.rotation.x);
    this.joints.headYaw = round4(rig.head.rotation.y);
    this.joints.jaw = round4(rig.jaw.rotation.x);
    this.joints.tongue = round4(tongue);
    this.joints.earL = round4(rig.earL.rotation.z);
    this.joints.earR = round4(rig.earR.rotation.z);
    // 耳抽动走的是 rotation.x（"绕 X 轴前倾/抽动"），单独记一份，否则自检看不到抽动
    this.joints.earLX = round4(rig.earL.rotation.x);
    this.joints.earRX = round4(rig.earR.rotation.x);
    this.joints.tailLift = round4(rig.tailRoot.rotation.x);
    this.joints.tailYaw = round4(rig.tailRoot.rotation.y);
    this.joints.breathAmp = round4(breathAmp);
    this.joints.breathScale = round4(breathScale);
    this.joints.gaitPhase = round4(gp);
    this.joints.gaitBob = round4(gaitBob);
    this.joints.rigidity = round4(rigidity);
    this.joints.tremorAmp = round4(applied > 0 ? inc.tremorAmp : 0);
    this.joints.eyeLid = round4(lid);
    // 甩头只活在绕 Y/Z 的旋转里，单独记一份自检才看得到（与耳抽动同理）
    this.joints.headShake = round4(headShake);
    this.joints.muzzleHeightApproxM = round4(this.estimateMuzzleY(params, inc));
  }

  /**
   * 吻部离地高度的**估算**（米）—— 只服务自检（"低头喝水/嗅闻有没有真的贴地"）。
   *
   * 算法：躯干中心高度 + 头挂点的竖直偏移，再减去颈头链总俯仰把头前伸量压下去的竖直分量。
   * 它依赖 `HEAD_BASE_Y_REL` / `MUZZLE_REACH_M` 与模型一致；模型改了头挂点，
   * 估算会偏，但画面不会 —— 这两个数是自检的尺子，不是动画参数。
   */
  private estimateMuzzleY(params: DogPoseParams, inc: IncidentFrame): number {
    const bodyY = this.rig.body.position.y;
    const pitch = this.rig.body.rotation.x;
    const chain = pitch + params.neckPitch + inc.neckAdd + params.headPitch + inc.headAdd;
    const headJointY = bodyY + HEAD_BASE_Y_REL * Math.cos(pitch);
    return Math.max(0, headJointY - MUZZLE_REACH_M * Math.sin(chain));
  }
}

// ============================================================ 纯函数

function gaitDefOf(id: DogGaitId): DogGaitDef | null {
  return id === 'none' ? null : GAIT_TABLE[id];
}

function isIncidentPose(id: DogPoseId): boolean {
  return id === 'seizure' || id === 'vomit';
}

function incidentDurationS(id: DogPoseId): number {
  return id === 'seizure' ? SEIZURE_TOTAL_S : id === 'vomit' ? VOMIT_TOTAL_S : 0;
}

function incidentTargetWeight(id: DogPoseId): number {
  return isIncidentPose(id) ? 1 : 0;
}

/** 时相求值：定位当前时相，并在时相开头做一小段过渡（PHASE_RAMP_S）。 */
function evaluatePhases(phases: readonly IncidentPhase[], elapsed: number): IncidentFrame {
  let t = Math.max(0, elapsed);
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i];
    if (!ph) continue;
    if (t < ph.seconds || i === phases.length - 1) {
      const prev = i > 0 ? phases[i - 1] : undefined;
      const k = smoothstep01(Math.min(1, t / PHASE_RAMP_S));
      return prev ? lerpFrame(prev.frame, ph.frame, k) : scaleFrame(ph.frame, k);
    }
    t -= ph.seconds;
  }
  const last = phases[phases.length - 1];
  return last ? last.frame : ZERO_FRAME;
}

function lerpFrame(a: IncidentFrame, b: IncidentFrame, k: number): IncidentFrame {
  const av = a as unknown as Record<string, number>;
  const bv = b as unknown as Record<string, number>;
  const out: Record<string, number> = {};
  for (const key of Object.keys(av)) {
    out[key] = lerp(av[key] ?? 0, bv[key] ?? 0, k);
  }
  return out as unknown as IncidentFrame;
}

/** 按时相权重缩放：倍率字段朝 1 靠，其余字段乘权重。 */
function scaleFrame(f: IncidentFrame, k: number): IncidentFrame {
  const src = f as unknown as Record<string, number>;
  const out: Record<string, number> = {};
  for (const key of Object.keys(src)) {
    const v = src[key] ?? 0;
    out[key] = MULTIPLIER_KEYS.includes(key) ? 1 + (v - 1) * k : v * k;
  }
  return out as unknown as IncidentFrame;
}

function lerpPose(a: DogPoseParams, b: DogPoseParams, k: number): DogPoseParams {
  const out = {} as DogPoseParams;
  const bag = out as unknown as Record<string, number>;
  for (const key of POSE_KEYS) {
    if (key === 'gait') {
      // 步态是离散选择：过渡过半时切换（走↔跑不该出现"半步态"）
      out.gait = k < 0.5 ? a.gait : b.gait;
      continue;
    }
    bag[key] = lerp(a[key] as number, b[key] as number, k);
  }
  return out;
}

/** 读一个网格的基准缩放（构造时读一次）。 */
function readScale(part: Object3D): ScaledPart {
  return { part, sx: part.scale.x, sy: part.scale.y, sz: part.scale.z };
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function smoothstep01(k: number): number {
  const t = clamp01(k);
  return t * t * (3 - 2 * t);
}

function easeOutCubic(k: number): number {
  return 1 - Math.pow(1 - clamp01(k), 3);
}

function wrap01(v: number): number {
  return ((v % 1) + 1) % 1;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
