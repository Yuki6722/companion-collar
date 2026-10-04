/**
 * 自检钩子（`?debug=1`）。
 *
 * 存在的理由：3D 画面本身无法被单元测试覆盖，而这个环境的沙箱**不允许启动浏览器**
 * （Chromium 的进程间通信用命名管道，被拦截），所以自动化验证只能落在「可断言的文本」上。
 * 这里把场景的关键事实落成一个 DOM 徽章与 `window.__scene`：
 *   - 人可以直接看到画面是否真的渲染出来了；
 *   - 自动化脚本可以 `--dump-dom` 抓徽章文本做断言。
 * 生产使用不受影响：不加 `?debug=1` 时完全不会挂载。
 */
import { el } from '../ui/dom.ts';

export interface SceneSnapshot {
  webgl: boolean;
  triangles: number;
  drawCalls: number;
  fps: number;
  objects: number;
  modelsLoaded: number;
  tilesLoaded: number;
  envLoaded: boolean;
  catState: string;
  /** `auto` = 自主行为；`manual` = 手动演示档位 */
  catMode?: string;
  /** 猫当前的混合参数（用于断言「切换确实改变了状态」） */
  catPose: Record<string, number | boolean>;
  /** 行为层事实：当前活动 / 姿势 / 锚点 / 演示时钟 / 突发 */
  catActivity?: string;
  catPosture?: string;
  catAnchor?: string;
  catHour?: number;
  catIncident?: string | null;
  /**
   * 猫头顶状态标签的当前文案。
   *
   * 为什么把它放进快照：状态标签是**渲染层**的产出，而它的内容来自行为词汇表。
   * 只断言 `catActivity` 无法发现「标签没挂上」或「标签没跟着突发切换」这两类故障，
   * 而这两类恰好是肉眼可见、却最难在无头环境里自动发现的问题。
   */
  catLabel?: string;
  /**
   * 当前行为段已进行的**真实**秒数。
   *
   * 为什么单独记：标签的「活动名」在 `resting` 段里平均 56 秒不变（最长超过 2 分钟），
   * 只断言文案变化会误判成「标签卡住」。这个计数器每秒都在涨，
   * 才是「时间线真的在走」的可靠证据。
   */
  catSegmentElapsedS?: number;
  /** 当前行为段的真实总时长（秒），与上一项配合看进展 */
  catSegmentTotalS?: number;
  /**
   * 当前生效的突发动作幅度。
   *
   * 为什么单独记这个：`catIncident` 只能证明**标签在报**，证明不了**身体在动**。
   * 这两者的分离正是「点了抽搐没反应」的故障形态，因此必须分别记录。
   */
  catMotion?: Record<string, number>;
  issues: string[];
  /** 槽位状态：区分「资产没到」与「资产到了没换上」 */
  slots?: Record<string, string | number>;
  /** 猫的世界坐标（保留两位小数）：用于断言状态切换真的把它挪到了另一个锚点 */
  catAt?: [number, number, number];
  /**
   * 项圈硬件与触须无干涉区。
   *
   * 为什么单独记：这两者是**形态方案**这一条信息的载体。只断言"模型加载成功"
   * 无法发现"项圈没挂上"或"无干涉区跟着身体而不是跟着头"这两类故障。
   */
  collar?: { collar: boolean; whiskerZone: boolean; parts: number; partNames?: string[] };
  /** 位移探针：证明"两个动作之间是走过去的"（见 `HomeScene.startMotionProbe`） */
  catMotionProbe?: {
    samples: number;
    durationS: number;
    maxSpeedMps: number;
    maxStepM: number;
    movingShare: number;
    distinctPositions: number;
  } | null;
  /** 项圈相机这一路（App「实时」页）的运行事实 */
  catPov?: {
    bound: boolean;
    frames: number;
    width: number;
    height: number;
    /** 镜头离猫所站表面的高度（米）——核对"视角高度与猫一致" */
    eyeHeightM?: number;
    follow?: boolean;
  };
  /** 当前是否在移动中（走路会持续若干真实秒，标签应显示「移动」） */
  catMoving?: boolean;
  /** 左栏机位按钮的 id 列表（用于断言"该删的机位真的删了"） */
  presets?: string[];
  /**
   * App 预览（右栏 iPhone 机模）。
   *
   * 为什么把它放进快照：这一屏的主叙事是「猫在做什么 ↔ 主人手机上显示什么」。
   * 不记这些字段，就无法自动发现「手机没挂上」「读数不跟着时钟走」
   * 「无效读数被当成有效值显示」这三类故障。
   */
  app?: {
    collapsed: boolean;
    tab: string;
    hourOfDay: number;
    readings: Record<string, { value: number | null; validity: string | null }>;
    eventRows: number;
    /** 行为次数统计（喝水 / 玩耍 / 用砂盆…） */
    counts?: Record<string, number>;
    /** 当前档案（验证"档案页可选且生效"） */
    profile?: { breedId: string; ageMonths: number };
    /** 档案页的选项数量与选中值（验证下拉真的可选、选项齐全） */
    profileOptions?: { breeds: number; ages: number; selectedBreed: string; selectedAge: string };
    /**
     * 机身尺寸与滚动事实（验证"iPhone 大小不变，内容在机身内滑动"）。
     * `phoneHeight` 在不同模块之间应保持不变，而长内容模块的 `canScroll` 应为 true。
     */
    layout?: {
      phoneHeight: number;
      bodyClientHeight: number;
      bodyScrollHeight: number;
      canScroll: boolean;
    };
    /**
     * 读数变化提示的状态。
     *
     * 这三件事必须能自动验证，否则"数字变红 / 弹窗"这类故障只能靠肉眼发现：
     * `notify` 该不该打扰、`popup` 弹窗有没有真的出现在 DOM 里、`red` 哪几路被标红。
     */
    alert?: {
      notify: boolean;
      red: string[];
      popup: boolean;
      acute: boolean;
      reasons: number;
    };
  };
  /**
   * 喵喵写实模型的自检事实（`HomeScene.catVariantState()`）。
   *
   * 为什么必须记：这一轮交付的核心宣称是「场景里的猫**真的在迈步**，不是只移动位置」。
   * 只断言 `catAt` 变化无法区分「走了 2 米」和「瞬移了 2 米」——那正是实测到的故障形态
   * （一次位移起步 50 ms 内跳 0.45 m）。记下 `walkWeight`（步态权重）与四爪局部坐标，
   * 才能把「迈步」这件事变成可断言的文本。
   */
  cat?: Record<string, unknown>;
}

export interface DebugOptions {
  /** 把快照 POST 到这里（本地预览服务的 /__selftest）；静态部署上不会提供该路由。 */
  reportUrl?: string;
  /** 是否跑一段自驱动序列：切到激动 → 回传 → 切回平静 → 回传（用于无人值守验证） */
  autoSequence?: boolean;
}

export function installDebugHandle(
  snapshot: () => SceneSnapshot,
  actions: Record<string, (arg: string) => unknown> = {},
  options: DebugOptions = {},
): { post: () => SceneSnapshot; handle: Record<string, unknown> } {
  const badge = el('div', {
    class: 'selftest',
    attrs: { id: 'scene-selftest', role: 'status', 'aria-live': 'polite' },
  });
  document.body.append(badge);

  const render = (): SceneSnapshot => {
    const snap = snapshot();
    badge.textContent = summarize(snap);
    badge.dataset.ok = snap.webgl && snap.triangles > 0 && snap.modelsLoaded > 0 ? 'true' : 'false';
    return snap;
  };

  const post = (): SceneSnapshot => {
    const snap = render();
    if (options.reportUrl) {
      void fetch(options.reportUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(snap),
      }).catch(() => {
        /* 部署环境没有该端点，忽略即可 */
      });
    }
    return snap;
  };

  const handle: Record<string, unknown> = { snapshot: render, post, ...actions };
  (window as unknown as { __scene?: unknown }).__scene = handle;
  render();
  window.setInterval(render, 1000);

  if (options.autoSequence) {
    const startAutoSequence = (): void => {
    // 时间点刻意错开：等资产与首帧稳定 → 切激动（含 0.8 s 过渡）→ 回传 → 切回平静 → 回传。
    // 最后再触发一次突发演示并回传：断言「注入的突发确实出现在快照里」。
    window.setTimeout(() => post(), 6000);
    window.setTimeout(() => {
      call(handle, 'setCatState', 'agitated');
    }, 8000);
    window.setTimeout(() => post(), 10_500);
    window.setTimeout(() => {
      call(handle, 'setCatState', 'calm');
    }, 12_000);
    window.setTimeout(() => post(), 14_500);
    // 位移探针：随后 2.5 秒逐帧记录猫的位置，用来判定"是走过去的"还是"瞬移过去的"
    window.setTimeout(() => {
      call(handle, 'probe', '2500');
    }, 17_500);
    // App 预览的收起 / 展开：这是右栏唯一的东西，必须能自动验证它确实在切换
    window.setTimeout(() => {
      call(handle, 'app', 'off');
    }, 15_000);
    window.setTimeout(() => {
      call(handle, 'app', 'on');
    }, 15_600);
    window.setTimeout(() => {
      call(handle, 'setAutoCat', '');
      call(handle, 'incident', 'seizure');
    }, 19_000);
    // 抽搐持续 15 秒（演示时间），在它进行中回传一次
    window.setTimeout(() => post(), 21_000);
    // 打开项圈与触须无干涉区并回传：让 `?debug=1&auto=1` 一次跑完就覆盖形态可视化。
    window.setTimeout(() => {
      call(handle, 'collar', 'zone');
    }, 22_000);
    // 位移探针的结果在这里回传（探针窗口在 20 s 结束）
    window.setTimeout(() => post(), 20_600);
    // 逐个切 App 的页签并回传：事件流 / 健康 / 档案都要留下可断言的快照
    window.setTimeout(() => {
      call(handle, 'app', 'events');
    }, 23_000);
    window.setTimeout(() => post(), 23_500);
    window.setTimeout(() => {
      call(handle, 'app', 'health');
    }, 24_500);
    window.setTimeout(() => post(), 25_000);
    window.setTimeout(() => {
      call(handle, 'app', 'profile');
    }, 26_000);
    window.setTimeout(() => post(), 26_500);
    // 换一个品种：验证「改档案 → 重建会话 → 基线跟着变」这条路真的通
    window.setTimeout(() => {
      call(handle, 'breed', 'maine-coon');
    }, 27_500);
    window.setTimeout(() => post(), 28_500);
    window.setTimeout(() => {
      call(handle, 'app', 'live');
    }, 28_000);
    // 抽搐结束后再回传一次：用来对照「突发期间」与「突发之后」的标签
    window.setTimeout(() => post(), 32_000);
    };
    const deadline = Date.now() + 60_000;
    const waitForAssets = (): void => {
      const snap = snapshot();
      const model = snap.cat?.model as { loaded?: boolean } | undefined;
      if ((snap.modelsLoaded > 0 && model?.loaded === true) || Date.now() > deadline) startAutoSequence();
      else window.setTimeout(waitForAssets, 250);
    };
    waitForAssets();
  }

  return { post, handle };
}

function call(handle: Record<string, unknown>, name: string, arg: string): void {
  const fn = handle[name];
  if (typeof fn === 'function') (fn as (a: string) => unknown)(arg);
}

/** 单行、稳定、便于 dump-dom 断言：键值用 `;` 分隔。 */
export function summarize(snap: SceneSnapshot): string {
  return [
    `selftest webgl=${snap.webgl ? 1 : 0}`,
    `models=${snap.modelsLoaded}`,
    `tiles=${snap.tilesLoaded}`,
    `env=${snap.envLoaded ? 1 : 0}`,
    `tris=${snap.triangles}`,
    `draws=${snap.drawCalls}`,
    `fps=${snap.fps}`,
    `cat=${snap.catState}`,
    `catMode=${snap.catMode ?? 'manual'}`,
    `catAct=${snap.catActivity ?? 'none'}`,
    `catPosture=${snap.catPosture ?? 'none'}`,
    `catAnchor=${snap.catAnchor ?? 'none'}`,
    `catHour=${Number(snap.catHour ?? 0).toFixed(2)}`,
    `catIncident=${snap.catIncident ?? 'none'}`,
    `catLabel=${snap.catLabel || 'none'}`,
    `catSegElapsed=${Number(snap.catSegmentElapsedS ?? 0).toFixed(0)}`,
    `catSegTotal=${Number(snap.catSegmentTotalS ?? 0).toFixed(0)}`,
    `catTremor=${Number(snap.catMotion?.tremorAmp ?? 0).toFixed(3)}`,
    `collar=${snap.collar?.collar ? 1 : 0}`,
    `whiskerZone=${snap.collar?.whiskerZone ? 1 : 0}`,
    `collarParts=${snap.collar?.parts ?? 0}`,
    `presets=${(snap.presets ?? []).join('+') || 'none'}`,
    `catMoving=${snap.catMoving ? 1 : 0}`,
    `povFrames=${snap.catPov?.frames ?? 0}`,
    `povBound=${snap.catPov?.bound ? 1 : 0}`,
    `povEyeHeight=${snap.catPov?.eyeHeightM ?? 'none'}`,
    `appPhoneH=${snap.app?.layout?.phoneHeight ?? 0}`,
    `appBodyScroll=${snap.app?.layout ? `${snap.app.layout.bodyClientHeight}/${snap.app.layout.bodyScrollHeight}` : 'none'}`,
    `appCounts=${snap.app?.counts?.drinking ?? 0}`,
    `appBreedOptions=${snap.app?.profileOptions?.breeds ?? 0}`,
    `appBreed=${snap.app?.profileOptions?.selectedBreed ?? 'none'}`,
    `probeMaxSpeed=${snap.catMotionProbe?.maxSpeedMps ?? 'none'}`,
    `probeDistinct=${snap.catMotionProbe?.distinctPositions ?? 'none'}`,
    `appCollapsed=${snap.app?.collapsed ? 1 : 0}`,
    `appTab=${snap.app?.tab ?? 'none'}`,
    `appHr=${snap.app?.readings.hr?.value ?? 'none'}`,
    `appRrValid=${snap.app?.readings.rr?.validity ?? 'none'}`,
    `appEvents=${snap.app?.eventRows ?? 0}`,
    `appAlert=${snap.app?.alert?.notify ? 1 : 0}`,
    `appPopup=${snap.app?.alert?.popup ? 1 : 0}`,
    `appRed=${(snap.app?.alert?.red ?? []).join('+') || 'none'}`,
    `appAcute=${snap.app?.alert?.acute ? 1 : 0}`,
    `tailFreq=${Number(snap.catPose.tailFreq ?? 0).toFixed(2)}`,
    `earFlatten=${Number(snap.catPose.earFlatten ?? 0).toFixed(2)}`,
    `pupil=${Number(snap.catPose.pupilScale ?? 0).toFixed(2)}`,
    `eyeOpen=${Number(snap.catPose.eyeOpen ?? 0).toFixed(2)}`,
    `breathFreq=${Number(snap.catPose.breathFreq ?? 0).toFixed(2)}`,
    `issues=${snap.issues.length}`,
    `catAt=${(snap.catAt ?? [0, 0, 0]).join('/')}`,
    ...Object.entries(snap.slots ?? {}).map(([k, v]) => `${k}=${String(v)}`),
  ].join('; ');
}
