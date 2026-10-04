/**
 * App 模拟视图：右侧边栏里的 iPhone 机模。
 *
 * 底部四个模块：**实时 / 事件流 / 健康 / 档案**。
 *
 * | 模块 | 内容 | 数据来源 |
 * |---|---|---|
 * | 实时 | **项圈相机拍到的画面**（便于判断它在哪）+ 它现在在做什么/在哪 | 3D 场景的离屏渲染 + 场景状态 |
 * | 事件流 | 每 **5 分钟**一条的行为记录（可滚动，机身高度不变）+ 六项行为的次数与时长（哪六项由词表给） | 会话里的行为时间线 + `session.events` |
 * | 健康 | 心率 / 呼吸频率 / 体表温 + 异常标红与弹窗 + 相对前半段基线的漂移 | `session.samples` + `core/vitals/alerts` |
 * | 档案 | **可选**品种与年龄，及其推导出的年龄段/体型/项圈重量预算 | `core/profile` 的品种表（物种由词表选） |
 *
 * ★ **物种参数化**：本文件是**共用机制**，物种差异全部来自构造时注入的 `vocab`
 *   （`AppSpeciesVocab`，见 `./app-vocab.ts`）：
 *   - **不传 `vocab` 就用 `CAT_APP_VOCAB`**，行为与措辞与重构前逐字一致 ——
 *     猫版页面（`screens/home.ts`）因此一行都不用改；
 *   - 狗版页面传 `DOG_APP_VOCAB`：结构、刷新纪律、变红与弹窗的判据全部复用，
 *     只有品种表、锚点名、活动名、年龄段/体型档与以物种为主语的边界句是狗的。
 *   为什么不复制一份 `app-phone-dog.ts`：仓库纪律是「共用机制、分开参数」（`AGENTS.md` §8），
 *   而这里的机制（建一次 + 就地刷新、机身高度固定、内容在机身内滚动、提示判据）远多于词。
 *
 * ★ **本轮修掉的一个真故障：整块重建 DOM。**
 * 上一版每 500 ms 把 `.app-body` 整个 `replaceChildren` 一遍，于是：
 *   1. `<select>` 被销毁 → **档案页的下拉菜单刚点开就被关掉**（用户反馈 ①）；
 *   2. 列表节点的滚动位置每次重置 → 事件流/健康页"滑不动"（用户反馈 ③）；
 *   3. 「实时」页的画布每 500 ms 换一块新的 → 场景反复重建渲染目标 → **画面闪动**（用户反馈 ④）。
 * 现在改成 **建一次 + 就地刷新**：每个模块有自己的 `refresh()`，只改文本与类名，
 * 不换节点、不动画布、不重置滚动。此外还有两道保险：焦点在模块内时**跳过刷新**
 * （编辑中的表单绝不被抢），以及刷新时**保留滚动位置**。
 *
 * 三条纪律：
 *   1. **同一时刻**：所有读数与记录都按场景演示时刻（会话内秒）去查仿真会话，不另起一套时钟；
 *   2. **读数带有效性**：无效窗口划线展示并给出原因，不把坏值当读数；
 *   3. **词汇来自 core 与词表**：活动名、事件名、突发名、锚点名、边界句、品种表都从
 *      `@camp/core` 取，或由 `app-vocab.ts` 从 core 派生；本文件不新写一套面向用户的措辞。
 *
 * ⚠️ 边界（必须与代码一起读）：项圈相机拍的是**环境影像**。它不等于这个物种眼中的世界——
 *   帧率、视野、色觉、以及嗅觉通道都不等价（`AGENTS.md` §3）。界面按此措辞，
 *   具体句子由词表提供（`povBoundaryNote` / `driftBoundaryNote`）。
 */
import {
  AGE_OPTIONS_MONTHS,
  CONDITION_LABELS,
  VALIDITY_LABELS,
  VITAL_LABELS,
  VITAL_UNITS,
  ageBandOf,
  collarBudgetOf,
  detectDrifts,
  evaluateVitalAlerts,
  highlightedChannels,
  rawReadingOf,
  readingOf,
  sizeClassOf,
} from '@camp/core';
import type {
  PetProfile,
  ReadingValidity,
  Sample,
  Session,
  VitalAlertSummary,
  VitalKey,
} from '@camp/core';
import { CAT_APP_VOCAB } from './app-vocab.ts';
import type { AppSpeciesVocab } from './app-vocab.ts';
import { el } from './dom.ts';

type AppTab = 'live' | 'events' | 'health' | 'profile';

const TABS: ReadonlyArray<{ id: AppTab; label: string }> = [
  { id: 'live', label: '实时' },
  { id: 'events', label: '事件流' },
  { id: 'health', label: '健康' },
  { id: 'profile', label: '档案' },
];

/** 事件流的分辨率：**每 5 分钟一条**（用户要求"不用太频繁"）。 */
const EVENT_BUCKET_S = 300;
/** 事件流最多回看多少条（手机屏幕小，再多也没人翻）。 */
const MAX_EVENT_ROWS = 36;
/** 项圈相机画布尺寸：小一点，读回来才便宜（见 scene 的 `updatePovFeed`）。 */
const POV_W = 176;
const POV_H = 132;

/**
 * 本文件真正读到的**行为状态**（最小结构接口）。
 *
 * ⚠️ 为什么在这里定义，而不是 `import type { BehaviorStatus } from '../scene/cat/cat-behavior.ts'`：
 *   那会让 UI 层依赖**某一个物种的场景实现**——狗版页面传进来的 `DogBehaviorStatus`
 *   会被类型系统直接拒收，只能靠再复制一份界面来绕过。
 *   这里只声明界面真正用到的几项：演示时刻、当日时刻、活动名、（可选）姿势名、锚点、突发。
 *   于是猫的 `BehaviorStatus` 与狗的 `DogBehaviorStatus` 都能**结构兼容**地传进来，
 *   而任一侧改自己的字段名（`timeS` / `demoS`）都不会把 UI 拖下水。
 *
 * 两个刻意写成**可选**的字段：
 *   - `timeS` / `demoS`：同一个事实（会话内秒）在两个运行时里名字不同（猫版 `timeS`、
 *     狗版 `demoS`）。界面只要一个数，于是两个都收，取值时兜底（见 `demoSecondsOf`）。
 *   - `postureLabel`：猫版运行时给的是中文姿势名；狗版的姿态是动画层的 `poseId`。
 *     狗传进来的状态没有这一项，实时页就只显示活动名（见 `buildLive`）。
 */
export interface AppBehaviorStatus {
  /** 演示时刻（会话内秒）——猫版运行时的字段名 */
  timeS?: number;
  /** 演示时刻（会话内秒）——狗版运行时的字段名（与 `timeS` 是同一个事实） */
  demoS?: number;
  /** 当日时刻（小时，0–24） */
  hourOfDay: number;
  /** 当前活动的中文名 */
  activityLabel: string;
  /** 当前姿势的中文名（狗版没有这一项） */
  postureLabel?: string;
  /** 当前锚点 id 与它的中文名 */
  anchorId: string;
  anchorLabel: string;
  /** 当前突发（没有则为 null / undefined） */
  incident?: string | null;
}

/**
 * 本文件真正读到的**行为时间线**（最小结构接口）。
 *
 * 为什么同样在这里定义：猫的会话把时间线放在 `session.behaviorTimeline`，
 * 狗的会话由 core 的狗行为层放在 `session.dogBehaviorTimeline`。
 * 界面只关心「这段时间里各区间分别是什么活动、多长」，因此只声明这两项，
 * 由 `timelineOf()` 挑出到底是哪一份。
 */
export interface AppBehaviorTimeline {
  durationS: number;
  segments: readonly AppBehaviorSegment[];
}

/** 时间线上的一个区间：界面只读这三项。 */
export interface AppBehaviorSegment {
  /** 区间起点（会话内秒） */
  t: number;
  /** 区间时长（秒） */
  durS: number;
  /** 活动 id（两个物种各有一套取值，界面按词表查中文名） */
  activity: string;
}

export interface AppPhoneOptions {
  profile: PetProfile;
  session: Session;
  /**
   * 物种词表（品种表、锚点名、活动名、年龄/体型档、边界句）。
   *
   * ★ **缺省 = `CAT_APP_VOCAB`**：不传它时行为与渲染与重构前逐字一致，
   * 于是猫版页面（`screens/home.ts`）一行都不用改；狗版页面传 `DOG_APP_VOCAB`。
   */
  vocab?: AppSpeciesVocab;
  /** 初始是否收起（窄屏默认收起，见 `home.ts`） */
  collapsed?: boolean;
  /** 「实时」页要一块画布显示项圈相机画面；切走时传 `null` 让场景停止渲染 */
  onPovCanvas: (canvas: HTMLCanvasElement | null) => void;
  /** 档案页改了品种 / 年龄 */
  onProfileChange: (profile: PetProfile) => void;
}

/**
 * 一个模块的视图：**建一次**，之后只调 `refresh` 就地更新。
 *
 * 这是本文件的核心结构：模块的 DOM 节点在 `build()` 时创建并缓存引用，
 * `refresh()` 只写文本/类名/子项，因此不会销毁正在被操作的表单，也不会重置滚动。
 */
interface TabView {
  root: HTMLElement;
  refresh: (tS: number) => void;
}

export class AppPhone {
  readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly alertHost: HTMLElement;
  private readonly tabsHost: HTMLElement;
  private readonly clockEl: HTMLElement;
  private readonly collapseButton: HTMLButtonElement;
  private readonly screenEl: HTMLElement;
  private readonly callbacks: AppPhoneOptions;
  /**
   * 物种词表：这个机模实例显示的是哪一个物种的词（品种、锚点名、活动名、边界句）。
   * 构造时定下、之后不再变——换物种等于换一页，不该在同一次会话里改词。
   */
  private readonly vocab: AppSpeciesVocab;

  private session: Session;
  private profile: PetProfile;
  private tab: AppTab = 'live';
  private collapsed: boolean;
  /** 场景最近一次推来的状态与它对应的采样下标 */
  private status: { status: AppBehaviorStatus; index: number } | null = null;
  /** 最近一次提示评估结果（渲染与自检都用它） */
  private alert: VitalAlertSummary | null = null;
  /** 当前模块的视图（建一次 + 就地刷新） */
  private view: TabView | null = null;
  private viewTab: AppTab | null = null;
  /**
   * 需要重建视图。
   *
   * 什么时候置位：换会话、换档案。**不包含**"时间推进"——
   * 时间推进只调 `refresh()`，这是本文件与上一版最大的区别。
   */
  private viewDirty = true;
  /**
   * 已经弹过的那条提醒的"指纹"。
   *
   * 为什么需要它：评估每 0.5 秒跑一次，一次 30 秒的发作会产生几十次 `shouldNotify`。
   * 不去重的话弹窗会不停重建（看起来像闪烁），用户刚点掉又弹出来。
   * 指纹带**分钟桶**，因此持续发作每分钟最多弹一次，而不是每帧一次。
   */
  private alertFingerprint: string | null = null;
  /** 上一次真正刷新界面的时间（毫秒，真实时间） */
  private lastRenderMs = 0;
  private lastClockText = '';
  /** 当前绑给场景的项圈相机画布（切页签时解绑） */
  private povCanvas: HTMLCanvasElement | null = null;
  /** 场景**此刻**是否握着这块画布（收起/切走会解绑，但画布元素要留着以便重新挂上） */
  private povBound = false;

  constructor(opts: AppPhoneOptions) {
    this.callbacks = opts;
    this.profile = opts.profile;
    this.session = opts.session;
    // ★ 缺省是猫的那一套：不传 `vocab` 时行为与渲染与重构前逐字一致，
    //   猫版页面因此不必改一行（这条是硬要求，不是方便）。
    this.vocab = opts.vocab ?? CAT_APP_VOCAB;
    this.collapsed = opts.collapsed ?? false;

    this.clockEl = el('span', { class: 'phone-clock', text: '--:--' });
    this.collapseButton = el('button', {
      class: 'app-dock-toggle',
      type: 'button',
      text: '收起',
      title: '收起 / 展开 App 预览',
      on: { click: () => this.setCollapsed(!this.collapsed) },
    });

    this.tabsHost = el('nav', { class: 'app-tabs', attrs: { 'aria-label': 'App 模块切换' } });
    for (const t of TABS) {
      this.tabsHost.append(
        el('button', {
          class: 'app-tab',
          type: 'button',
          text: t.label,
          attrs: { 'aria-pressed': 'false' },
          on: {
            click: () => {
              if (this.tab === t.id) return;
              this.tab = t.id;
              this.viewDirty = true;
              this.renderTabs();
              this.syncView(0);
            },
          },
        }),
      );
    }

    this.body = el('div', { class: 'app-body' });
    this.alertHost = el('div', { class: 'app-alert-host' });
    this.screenEl = el('div', { class: 'phone-screen' }, [
      el('div', { class: 'phone-statusbar' }, [
        el('span', { class: 'phone-time', text: '仿真' }),
        this.clockEl,
        el('span', { class: 'phone-battery', text: '▮' }),
      ]),
      el('header', { class: 'app-header' }, [
        el('span', { class: 'app-title', text: '基线哨兵' }),
        el('span', { class: 'app-sub', text: '全部数据为仿真' }),
      ]),
      this.body,
      this.alertHost,
      this.tabsHost,
      el('div', { class: 'phone-homebar' }),
    ]);

    this.root = el('aside', { class: 'app-dock' }, [
      el('div', { class: 'app-dock-head' }, [
        el('span', { class: 'app-dock-title', text: 'App 预览（iPhone）' }),
        this.collapseButton,
      ]),
      el('div', { class: 'phone' }, [el('div', { class: 'phone-notch' }), this.screenEl]),
    ]);

    this.setCollapsed(this.collapsed);
    this.renderTabs();
    this.syncView(0);
  }

  /** 换会话（注入突发、或档案变更后会重建会话，读数与事件流都要跟着换）。 */
  setSession(session: Session, profile?: PetProfile): void {
    this.session = session;
    if (profile) this.profile = profile;
    // 数据换了：视图必须重建（列表行数、档案取值都可能变）
    this.viewDirty = true;
    this.syncView(this.demoSeconds());
  }

  isCollapsed(): boolean {
    return this.collapsed;
  }

  setCollapsed(on: boolean): void {
    this.collapsed = on;
    this.root.dataset.collapsed = on ? 'true' : 'false';
    this.collapseButton.textContent = on ? '展开' : '收起';
    this.collapseButton.setAttribute('aria-expanded', on ? 'false' : 'true');
    // 收起时把屏幕从可访问树里摘掉：否则读屏与 Tab 键仍会进入看不见的控件
    this.screenEl.setAttribute('aria-hidden', on ? 'true' : 'false');
    // 收起时也不该继续渲染项圈相机（省电纪律：没人看的画面不渲染）。
    // 注意：这里**只解绑**，画布元素留着——展开时再挂回去，不必重建界面。
    if (on) this.unbindPov();
    else {
      this.syncView(0);
      this.rebindPovCanvas();
    }
  }

  currentTab(): AppTab {
    return this.tab;
  }

  /** 切页签（也供自检动作使用：`live` / `events` / `health` / `profile`）。 */
  selectTab(tab: string): void {
    if (!TABS.some((t) => t.id === tab)) return;
    if (this.tab === tab) return;
    this.tab = tab as AppTab;
    this.viewDirty = true;
    this.renderTabs();
    this.syncView(this.demoSeconds());
  }

  /** 对外的清理：连画布一起丢掉。 */
  dispose(): void {
    this.dropPov();
  }

  /**
   * 把「实时」页的画布挂给场景 / 从场景摘下来。
   *
   * 为什么要显式分开"画布元素"与"是否已绑定"：
   *   - `AppPhone` 在 `HomeScene` **之前**构造（右栏要先挂上），构造那一刻
   *     `onPovCanvas` 里的 `scene` 还是 null（回调静默失败，但 `povBound` 已被置位），
   *     所以场景就绪后必须用 `force` 再挂一次；
   *   - 收起 / 切走时只解绑（省电），元素留着，展开 / 切回可以立刻挂回去。
   */
  rebindPovCanvas(force = false): void {
    if (this.collapsed || this.tab !== 'live' || !this.povCanvas) return;
    if (this.povBound && !force) return;
    this.callbacks.onPovCanvas(this.povCanvas);
    this.povBound = true;
  }

  private unbindPov(): void {
    if (!this.povBound) return;
    this.callbacks.onPovCanvas(null);
    this.povBound = false;
  }

  /** 连画布元素一起丢掉（切到别的页签时，元素随 `replaceChildren` 一起离场）。 */
  private dropPov(): void {
    this.unbindPov();
    this.povCanvas = null;
  }

  /**
   * 场景每帧调用。节流在这里（消费方），而不是在场景里。
   */
  update(status: AppBehaviorStatus): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // 猫版与狗版的运行时用不同的字段名给同一个事实（`timeS` / `demoS`），这里统一取一次
    const tS = demoSecondsOf(status);
    const index = this.sampleIndexAt(tS);
    this.status = { status, index };

    // 提示评估**与页签无关**：主人在事件流页也该收到提醒。
    this.evaluateAlert(index, tS);

    if (now - this.lastRenderMs < 500) {
      // 时钟走字比整屏刷新便宜，单独更新它，让"在动"这件事始终可见
      this.updateClock(status);
      return;
    }
    this.lastRenderMs = now;
    this.updateClock(status);
    this.syncView(tS);
  }

  /**
   * 同步当前模块的界面：需要时**建一次**，否则**就地刷新**。
   *
   * 两条保险（都是踩过的坑）：
   *   1. 用户正在模块内操作（焦点在里面，例如刚点开的下拉）→ 本次跳过刷新；
   *   2. 刷新由各模块的 `refresh` 负责保留滚动位置（见 `renderEvents`）。
   */
  private syncView(tS: number): void {
    if (this.collapsed) return;
    if (!this.view || this.viewTab !== this.tab || this.viewDirty) {
      this.buildView();
      return;
    }
    if (this.userIsEditing()) return;
    this.view.refresh(tS);
  }

  /** 焦点是否落在模块内（正在操作表单 / 刚点开下拉）——此时绝不刷新，避免抢掉交互。 */
  private userIsEditing(): boolean {
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    return Boolean(active && active !== this.body && this.body.contains(active));
  }

  private buildView(): void {
    // 离开「实时」页就把画布元素一起丢掉：场景因此停止离屏渲染
    if (this.tab !== 'live') this.dropPov();
    this.body.replaceChildren();
    this.view = null;
    this.viewTab = this.tab;
    this.viewDirty = false;

    let view: TabView;
    switch (this.tab) {
      case 'live':
        view = this.buildLive();
        break;
      case 'events':
        view = this.buildEvents();
        break;
      case 'health':
        view = this.buildHealth();
        break;
      case 'profile':
        view = this.buildProfile();
        break;
      default:
        return;
    }
    this.body.append(view.root);
    this.view = view;
    view.refresh(this.demoSeconds());
  }

  /** 场景最近一次推来的演示时刻（会话内秒）；还没有状态时为 0。 */
  private demoSeconds(): number {
    return demoSecondsOf(this.status?.status ?? null);
  }

  /**
   * 评估读数变化并（必要时）弹提醒。
   *
   * 门面只有一句：`@camp/core` 的 `evaluateVitalAlerts` 决定"该不该打扰"，
   * 这里只负责把它变成 DOM。判据与文案都不在这一层，避免两处漂移。
   */
  private evaluateAlert(index: number, tS: number): void {
    const sample = index >= 0 ? (this.session.samples[index] as Sample) : undefined;
    if (!sample) return;
    const alert = evaluateVitalAlerts({ sample, samples: this.session.samples, atS: tS });
    this.alert = alert;
    if (!alert.shouldNotify) {
      this.alertFingerprint = null;
      return;
    }
    const fingerprint = [
      alert.acuteWindow ? 'acute' : 'dev',
      highlightedChannels(alert).join(','),
      Math.floor(tS / 60),
    ].join('|');
    if (fingerprint === this.alertFingerprint) return;
    this.alertFingerprint = fingerprint;
    this.showAlertPopup(alert);
  }

  /**
   * 弹窗：标题是产品口径，正文只列可核查的事实，边界与转诊路径必须一起出现。
   *
   * 判据仍全部来自 core 的 `evaluateVitalAlerts`（见 `evaluateAlert`）；这里只把两句
   * **面向用户的措辞**取自词表：猫版引用的就是 core 的原文（逐字不变），
   * 狗版换掉其中点名猫科病征的那一句——否则狗版弹窗会劝主人去留意"公猫排不出尿"。
   */
  private showAlertPopup(alert: VitalAlertSummary): void {
    const details = el('ul', { class: 'app-alert-details' });
    for (const d of alert.details) details.append(el('li', { text: d }));

    this.alertHost.replaceChildren(
      el('div', { class: 'app-alert', attrs: { role: 'alertdialog', 'aria-label': alert.title } }, [
        el('div', { class: 'app-alert-head' }, [
          el('span', { class: 'app-alert-dot' }),
          el('span', { class: 'app-alert-title', text: alert.title }),
        ]),
        el('p', { class: 'app-alert-sub', text: alert.subtitle }),
        details,
        el('p', { class: 'app-alert-boundary', text: this.vocab.vitalsBoundaryNote }),
        el('p', { class: 'app-alert-referral', text: this.vocab.alertReferralNote }),
        el('button', {
          class: 'app-alert-accept',
          type: 'button',
          text: '知道了',
          on: { click: () => this.alertHost.replaceChildren() },
        }),
      ]),
    );
  }

  private updateClock(status: AppBehaviorStatus): void {
    const h = Math.floor(status.hourOfDay);
    const m = Math.floor((status.hourOfDay - h) * 60);
    const text = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (text !== this.lastClockText) {
      this.lastClockText = text;
      this.clockEl.textContent = text;
    }
  }

  /** 会话时间 → 采样下标（采样间隔由相邻两点推出，不写死）。 */
  private sampleIndexAt(tS: number): number {
    const samples = this.session.samples;
    if (samples.length === 0) return -1;
    const first = samples[0] as Sample;
    const second = samples[1] as Sample | undefined;
    const interval = second ? Math.max(1, second.t - first.t) : 10;
    const idx = Math.round((tS - first.t) / interval);
    return Math.max(0, Math.min(samples.length - 1, idx));
  }

  private currentSample(): Sample | undefined {
    const index = this.status?.index ?? -1;
    return index >= 0 ? (this.session.samples[index] as Sample) : undefined;
  }

  /**
   * 这次会话的**行为时间线**（事件流的次数格子与 5 分钟分段都用它）。
   *
   * 为什么要有这一层：两个物种的时间线挂在 `Session` 的不同字段上——猫的会话是
   * `behaviorTimeline`，狗的是 `dogBehaviorTimeline`（core 的狗行为层）。
   * 这里把它们收在一处，并**统一成最小的 `AppBehaviorTimeline`**：
   * 调用方只关心「总长 + 区间序列」，于是下游代码一行都不必知道物种。
   * 顺序上先取狗的那一份：狗的会话若同时带了猫时间线（历史字段），也不该用错。
   */
  private timelineOf(): AppBehaviorTimeline | null {
    return this.session.dogBehaviorTimeline ?? this.session.behaviorTimeline ?? null;
  }

  private renderTabs(): void {
    this.tabsHost.querySelectorAll('.app-tab').forEach((node, i) => {
      const active = TABS[i]?.id === this.tab;
      node.classList.toggle('app-tab-active', active);
      node.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  // ---------------------------------------------------------------- 实时（项圈相机）

  private buildLive(): TabView {
    // ★ 画布**只建一次**：上一版每 500 ms 换一块新画布，场景就要重建渲染目标，
    //   画面因此闪动（用户反馈 ④）。
    const canvas = el('canvas', {
      class: 'app-pov',
      attrs: { width: String(POV_W), height: String(POV_H), 'aria-label': '项圈相机拍到的画面' },
    }) as HTMLCanvasElement;
    const nowValue = el('span', { class: 'app-now-value', text: '等待场景…' });
    const nowWhere = el('span', { class: 'app-now-where', text: '' });
    const clockNote = el('p', { class: 'app-note', text: '' });

    const root = el('div', { class: 'app-tab-root' }, [
      el('div', { class: 'app-pov-wrap' }, [
        canvas,
        el('span', { class: 'app-pov-badge', text: '项圈相机' }),
      ]),
      el('div', { class: 'app-card app-now' }, [
        el('span', { class: 'app-card-label', text: '它现在' }),
        nowValue,
        nowWhere,
      ]),
      el('p', {
        class: 'app-note',
        // 边界句来自词表：猫版就是重构前的原文，狗版只换主语（见 `app-vocab.ts`）
        text: this.vocab.povBoundaryNote,
      }),
      clockNote,
    ]);

    // 绑给场景：从这一刻起才有离屏渲染（没人看就不渲染）
    this.povCanvas = canvas;
    this.povBound = false;
    this.rebindPovCanvas();

    return {
      root,
      refresh: () => {
        const status = this.status?.status ?? null;
        // 姿势名是可选的：猫版运行时给中文姿势名；狗版没有这一项，就只显示活动名
        // （同样的信息在左栏的狗版面板里有 `poseId`，这里是手机屏，不硬凑一个字）。
        const posture = status?.postureLabel ?? '';
        nowValue.textContent = status
          ? posture
            ? `${status.activityLabel} · ${posture}`
            : status.activityLabel
          : '等待场景…';
        nowWhere.textContent = status
          ? `位置：${this.vocab.anchorLabels[status.anchorId] ?? status.anchorLabel}${status.incident ? ` · 突发演示：${this.vocab.incidentLabels[status.incident] ?? status.incident}` : ''}`
          : '';
        // 突发的「看什么」挂在同一行的 title 上：猫版画面必须逐字不变，
        // 因此提示只能借已有节点露出，不新增一行文字。
        const hint = status?.incident ? (this.vocab.incidentHints[status.incident] ?? '') : '';
        if (nowWhere.title !== hint) nowWhere.title = hint;
        const text = status
          ? `演示时钟 ${this.lastClockText}（${this.vocab.demoTimeScaleNote}，走路时放慢以便看清）。`
          : '';
        if (clockNote.textContent !== text) clockNote.textContent = text;
      },
    };
  }

  // ---------------------------------------------------------------- 事件流（每 5 分钟一条）

  private buildEvents(): TabView {
    const countGrid = el('div', { class: 'app-count-grid' });
    const list = el('div', { class: 'app-list app-scroll' });
    /** 已渲染的 5 分钟格数：只有它变了才重建行，否则每 0.5 秒就把 36 行重排一遍 */
    let renderedBuckets = -1;

    const root = el('div', { class: 'app-tab-root' }, [
      el('div', { class: 'app-card' }, [
        el('span', { class: 'app-card-label', text: '到今天此刻的次数' }),
        countGrid,
      ]),
      el('p', {
        class: 'app-note',
        text: `每 ${EVENT_BUCKET_S / 60} 分钟一条记录（不是逐秒流水）。列表可上下滚动，机身高度不变。`,
      }),
      list,
    ]);

    return {
      root,
      refresh: (tS) => {
        this.refreshCounts(countGrid, tS);
        const buckets = this.fiveMinuteBuckets(tS);
        const shown = Math.min(buckets.length, MAX_EVENT_ROWS);
        if (shown === renderedBuckets) return;
        renderedBuckets = shown;
        // ★ 只换**列表内部**的子项，并保留滚动位置：换掉列表节点本身会把滚动归零，
        //   用户就会觉得"滑不动"（用户反馈 ③）。
        const top = list.scrollTop;
        const rows: HTMLElement[] = [];
        if (buckets.length === 0) {
          rows.push(el('div', { class: 'app-kv' }, [el('span', { class: 'app-kv-value', text: '还没有记录' })]));
        }
        for (const b of buckets.slice(-MAX_EVENT_ROWS).reverse()) {
          rows.push(
            el('div', { class: 'app-event-row' }, [
              el('span', { class: 'app-event-time', text: `${clockOf(b.t)}–${clockOf(b.t + EVENT_BUCKET_S)}` }),
              el('span', { class: 'app-event-name', text: b.label }),
              el('span', { class: 'app-event-mag', text: b.detail }),
            ]),
          );
        }
        list.replaceChildren(...rows);
        if (top > 0) list.scrollTop = top;
      },
    };
  }

  /**
   * 次数格子：词表点名的六项行为，各自的**次数与累计时长**（就地更新）。
   *
   * 「哪六项」由词表给（猫是喝水/进食/玩耍/用砂盆/抓挠/躲藏；狗换成饮水/进食/玩耍/
   * 在院内排泄/嗅闻/奔跑）——给狗显示抓挠与躲藏会让它在做场景里根本不存在的动作。
   */
  private refreshCounts(grid: HTMLElement, tNow: number): void {
    const counts = new Map<string, { times: number; seconds: number }>();
    for (const seg of this.timelineOf()?.segments ?? []) {
      if (seg.t + seg.durS > tNow) continue;
      const entry = counts.get(seg.activity) ?? { times: 0, seconds: 0 };
      entry.times += 1;
      entry.seconds += seg.durS;
      counts.set(seg.activity, entry);
    }
    const wanted = this.vocab.eventCountActivities;
    // 首次渲染建格子，之后只改数字（避免每 0.5 秒重建 6 个节点）
    if (grid.childElementCount !== wanted.length) {
      grid.replaceChildren();
      for (const id of wanted) {
        grid.append(
          el('div', { class: 'app-count' }, [
            el('span', { class: 'app-count-value', text: '0' }),
            el('span', { class: 'app-count-label', text: this.vocab.activityLabels[id] ?? id }),
            el('span', { class: 'app-count-sub', text: '0 分' }),
          ]),
        );
      }
    }
    wanted.forEach((id, i) => {
      const cell = grid.children[i];
      if (!cell) return;
      const c = counts.get(id);
      const value = cell.querySelector('.app-count-value');
      const sub = cell.querySelector('.app-count-sub');
      const valueText = c ? String(c.times) : '0';
      const subText = c ? `${Math.round(c.seconds / 60)} 分` : '0 分';
      if (value && value.textContent !== valueText) value.textContent = valueText;
      if (sub && sub.textContent !== subText) sub.textContent = subText;
    });
  }

  /**
   * 把行为时间线切成 5 分钟一格，每格给一句"这 5 分钟主要在做什么"。
   *
   * 为什么按"主导行为 + 事件计数"而不是逐条事件：用户明确要求"不用太频繁，每 5 分钟一次"。
   * 逐条事件列表在演示里每几秒就滚一大片，读不出重点。
   */
  private fiveMinuteBuckets(tNow: number): Array<{ t: number; label: string; detail: string }> {
    const tl = this.timelineOf();
    const out: Array<{ t: number; label: string; detail: string }> = [];
    if (!tl) return out;
    const last = Math.min(tNow, tl.durationS);
    for (let t = 0; t + EVENT_BUCKET_S <= last; t += EVENT_BUCKET_S) {
      const share = new Map<string, number>();
      let eventCount = 0;
      for (const seg of tl.segments) {
        if (seg.t + seg.durS <= t || seg.t >= t + EVENT_BUCKET_S) continue;
        const overlap = Math.min(seg.t + seg.durS, t + EVENT_BUCKET_S) - Math.max(seg.t, t);
        if (overlap <= 0) continue;
        share.set(seg.activity, (share.get(seg.activity) ?? 0) + overlap);
      }
      for (const ev of this.session.events) {
        if (ev.t >= t && ev.t < t + EVENT_BUCKET_S) eventCount++;
      }
      const top = [...share.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!top) continue;
      out.push({
        t,
        label: this.vocab.activityLabels[top[0]] ?? top[0],
        detail: `${Math.round(top[1] / 60)} 分 · 事件 ${eventCount}`,
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- 健康（三通道读数）

  private buildHealth(): TabView {
    const acuteCard = el('div', { class: 'app-card app-acute', attrs: { hidden: 'hidden' } }, [
      el('span', { class: 'app-card-label', text: '生理过程' }),
      el('span', { class: 'app-card-value', text: '' }),
    ]);
    const acuteText = acuteCard.querySelector('.app-card-value') as HTMLElement;

    const vitalCard = el('div', { class: 'app-card' }, [
      el('span', { class: 'app-card-label', text: '项圈读数' }),
    ]);
    /** 每路通道缓存节点，刷新时只写 text/class，不重建行 */
    const rows = new Map<VitalKey, { row: HTMLElement; value: HTMLElement; flag: HTMLElement }>();
    for (const key of ['hr', 'rr', 'temp'] as const) {
      const value = el('span', { class: 'app-vital-value', text: '—' });
      const flag = el('span', { class: 'app-vital-flag', text: '无数据' });
      const row = el('div', { class: 'app-vital' }, [
        el('span', { class: 'app-vital-name', text: VITAL_LABELS[key] }),
        value,
        el('span', { class: 'app-vital-unit', text: VITAL_UNITS[key] }),
        flag,
      ]);
      vitalCard.append(row);
      rows.set(key, { row, value, flag });
    }

    const reasonCard = el('div', { class: 'app-card', attrs: { hidden: 'hidden' } }, [
      el('span', { class: 'app-card-label', text: '读数说明' }),
      el('ul', { class: 'app-alert-details' }),
    ]);
    const reasonList = reasonCard.querySelector('.app-alert-details') as HTMLElement;

    const driftWrap = el('div', { class: 'app-card' }, [
      el('span', { class: 'app-card-label', text: '相对前半段基线的变化' }),
      el('div', { class: 'app-list' }),
    ]);
    const driftList = driftWrap.querySelector('.app-list') as HTMLElement;

    const root = el('div', { class: 'app-tab-root' }, [
      acuteCard,
      vitalCard,
      reasonCard,
      driftWrap,
      el('p', { class: 'app-note app-note-boundary', text: this.vocab.vitalsBoundaryNote }),
    ]);

    return {
      root,
      refresh: () => {
        const sample = this.currentSample();
        const state = sample?.physiologyState;
        const acute = Boolean(state && state !== 'idle');
        acuteCard.toggleAttribute('hidden', !acute);
        if (acute) acuteText.textContent = describePhysiologyState(state as string);

        for (const [key, nodes] of rows) {
          const q = sample?.readingQuality?.[key];
          const valid = sample ? readingOf(sample, key) : null;
          const raw = sample ? rawReadingOf(sample, key) : null;
          const shown = valid ?? raw;
          const invalid = valid === null;
          const condition = sample?.measurementCondition ?? 'resting';
          const channelAlert = this.alert?.channels.find((c) => c.key === key);
          const red = channelAlert?.level === 'alert' || channelAlert?.highlight === true;

          const valueText = shown === null ? '—' : shown.toFixed(key === 'temp' ? 1 : 0);
          if (nodes.value.textContent !== valueText) nodes.value.textContent = valueText;
          nodes.value.className = red
            ? 'app-vital-value app-vital-value-alert'
            : invalid
              ? 'app-vital-value app-vital-invalid'
              : 'app-vital-value';
          nodes.row.className = red ? 'app-vital app-vital-alert' : 'app-vital';

          const flagText = !q
            ? '无数据'
            : invalid
              ? (VALIDITY_LABELS[q.validity].split('：')[0] ?? '不可用')
              : condition === 'clinic'
                ? '诊室'
                : channelAlert?.level === 'watch'
                  ? '留意'
                  : '可用';
          if (nodes.flag.textContent !== flagText) nodes.flag.textContent = flagText;
          nodes.flag.className = q ? `app-vital-flag app-flag-${q.validity}` : 'app-vital-flag';
          const title = q
            ? `${VALIDITY_LABELS[q.validity]}；测量条件：${CONDITION_LABELS[condition]}`
            : '本窗口没有该通道的读数';
          if (nodes.flag.title !== title) nodes.flag.title = title;
        }

        // 逐通道给出"为什么被标出来"——红色不是没有解释的装饰
        const flagged = this.alert?.channels.filter((c) => c.highlight || c.level === 'watch') ?? [];
        reasonCard.toggleAttribute('hidden', flagged.length === 0);
        reasonList.replaceChildren(...flagged.map((c) => el('li', { text: c.reason })));

        this.refreshDrift(driftList);
      },
    };
  }

  /** 漂移：与「健康」同一批通道，只是时间尺度更长（前半段 vs 后半段）。 */
  private refreshDrift(list: HTMLElement): void {
    const samples = this.session.samples;
    const half = Math.floor(samples.length / 2);
    const pick = (key: 'hrBpm' | 'rrBpm' | 'activity' | 'vocalization', from: number, to: number): number[] => {
      const out: number[] = [];
      for (let i = from; i < to; i++) {
        const v = (samples[i] as Sample)[key];
        if (typeof v === 'number') out.push(v);
      }
      return out;
    };
    const drift = detectDrifts(
      [
        { key: 'hr', label: this.vocab.driftLabels.hr, unit: '次/分', baseline: pick('hrBpm', 0, half), recent: pick('hrBpm', half, samples.length) },
        { key: 'rr', label: this.vocab.driftLabels.rr, unit: '次/分', baseline: pick('rrBpm', 0, half), recent: pick('rrBpm', half, samples.length) },
        { key: 'activity', label: this.vocab.driftLabels.activity, baseline: pick('activity', 0, half), recent: pick('activity', half, samples.length) },
        { key: 'vocalization', label: this.vocab.driftLabels.vocalization, baseline: pick('vocalization', 0, half), recent: pick('vocalization', half, samples.length) },
      ],
      { permutations: 200 },
    );
    const nodes: HTMLElement[] = [];
    if (drift.length === 0) {
      nodes.push(el('p', { class: 'app-note', text: '数据不足，暂不给出漂移判断。' }));
    }
    for (const d of drift) {
      const tone = d.severity === 'notable' ? 'notable' : d.severity === 'watch' ? 'watch' : 'none';
      nodes.push(
        el('div', { class: `app-drift app-drift-${tone}` }, [
          el('div', { class: 'app-drift-head' }, [
            el('span', { class: 'app-drift-name', text: d.label }),
            el('span', {
              class: 'app-drift-badge',
              text: d.severity === 'notable' ? '明显' : d.severity === 'watch' ? '留意' : '平稳',
            }),
          ]),
          el('span', {
            class: 'app-drift-detail',
            text:
              d.severity === 'none'
                ? `近期中位数 ${d.recentMedian.toFixed(1)}，与前半段基线接近`
                : `近期中位数 ${d.recentMedian.toFixed(1)} vs 基线 ${d.baselineMedian.toFixed(1)}（${d.direction === 'up' ? '高于' : '低于'} ${Math.abs(d.deltaRobust).toFixed(1)}σ，${d.sustained ? '持续' : '非持续'}）`,
          }),
        ]),
      );
    }
    nodes.push(
      el('p', {
        class: 'app-note',
        // 边界句来自词表：猫版就是重构前的原文（「相对这只猫自己前半段基线」），
        // 狗版把主语换成柴犬。否定结构一字不动——它说的是"只描述变化"。
        text: this.vocab.driftBoundaryNote,
      }),
    );
    list.replaceChildren(...nodes);
  }

  // ---------------------------------------------------------------- 档案（可选品种与年龄）

  private buildProfile(): TabView {
    const p = this.profile;
    // 品种表来自词表：猫版是 `CAT_BREEDS`，狗版是 `DOG_BREEDS`（同一个 `BreedOption` 形状）
    const breeds = this.vocab.breeds;
    const breed = breeds.find((b) => b.id === p.breedId) ?? breeds[0];

    // ★ 这两个 `<select>` 只建一次。上一版每 500 ms 重建整页 DOM，
    //   于是下拉菜单刚展开就被销毁（用户反馈 ①：点开就马上关闭）。
    const breedSelect = el('select', { class: 'app-select', attrs: { 'aria-label': '品种' } }) as HTMLSelectElement;
    for (const b of breeds) {
      const option = document.createElement('option');
      option.value = b.id;
      option.textContent = b.label;
      if (b.id === breed?.id) option.selected = true;
      breedSelect.append(option);
    }
    const ageSelect = el('select', { class: 'app-select', attrs: { 'aria-label': '年龄' } }) as HTMLSelectElement;
    for (const months of AGE_OPTIONS_MONTHS) {
      const option = document.createElement('option');
      option.value = String(months);
      option.textContent = ageLabel(months);
      if (months === p.ageMonths) option.selected = true;
      ageSelect.append(option);
    }

    const apply = (over: Partial<PetProfile>): void => {
      const next: PetProfile = { ...this.profile, ...over };
      this.profile = next;
      this.callbacks.onProfileChange(next);
    };
    breedSelect.addEventListener('change', () => {
      const b = breeds.find((x) => x.id === breedSelect.value) ?? breeds[0];
      if (b) apply({ breedId: b.id, heightCm: b.heightCm, weightKg: b.weightKg });
    });
    ageSelect.addEventListener('change', () => apply({ ageMonths: Number(ageSelect.value) }));

    const derived = el('div', { class: 'app-list' });
    const breedNote = el('p', { class: 'app-note', text: '' });

    const root = el('div', { class: 'app-tab-root' }, [
      el('div', { class: 'app-card' }, [
        el('span', { class: 'app-card-label', text: `这只${this.vocab.speciesNoun}（可选）` }),
        el('div', { class: 'app-field' }, [el('span', { class: 'app-field-label', text: '品种' }), breedSelect]),
        el('div', { class: 'app-field' }, [el('span', { class: 'app-field-label', text: '年龄' }), ageSelect]),
        breedNote,
      ]),
      el('div', { class: 'app-card' }, [
        el('span', { class: 'app-card-label', text: '推导结果' }),
        derived,
      ]),
      el('p', {
        class: 'app-note',
        text: this.vocab.profileRebuildNote,
      }),
      el('p', { class: 'app-note app-note-boundary', text: this.vocab.vitalsSimNote }),
    ]);

    return {
      root,
      refresh: () => {
        const cur = this.profile;
        const b = breeds.find((x) => x.id === cur.breedId) ?? breeds[0];
        const budget = collarBudgetOf(cur);
        // 下拉的选中值只在**用户没在操作**时对齐（`syncView` 已保证刷新期间焦点不在这里）
        if (b && breedSelect.value !== b.id) breedSelect.value = b.id;
        const ageValue = String(cur.ageMonths);
        if (ageSelect.value !== ageValue) ageSelect.value = ageValue;
        const note = b ? `体型取值：肩高 ${b.heightCm} cm、体重 ${b.weightKg} kg（${b.evidence.note ?? '概略值'}）` : '';
        if (breedNote.textContent !== note) breedNote.textContent = note;

        const rows: Array<[string, string]> = [
          ['年龄段', this.vocab.ageBandLabels[ageBandOf(cur.ageMonths)]],
          ['体型档', this.vocab.sizeClassLabels[sizeClassOf(cur.species, cur.weightKg)]],
          ['体重 / 肩高', `${cur.weightKg} kg / ${cur.heightCm} cm`],
          ['项圈重量预算', `${budget.maxWeightG} g（体重 2%，工程经验值）`],
          ['颈围带长', `${budget.strapMinMm}–${budget.strapMaxMm} mm`],
        ];
        const signature = rows.map(([k, v]) => `${k}=${v}`).join('|');
        if (derived.dataset.signature !== signature) {
          derived.dataset.signature = signature;
          derived.replaceChildren(
            ...rows.map(([k, v]) =>
              el('div', { class: 'app-kv' }, [
                el('span', { class: 'app-kv-key', text: k }),
                el('span', { class: 'app-kv-value', text: v }),
              ]),
            ),
          );
        }
      },
    };
  }

  /** 自检用：手机屏上此刻显示的核心事实。 */
  snapshot(): {
    collapsed: boolean;
    tab: AppTab;
    hourOfDay: number;
    readings: Record<string, { value: number | null; validity: ReadingValidity | null }>;
    eventRows: number;
    counts: Record<string, number>;
    profile: { breedId: string; ageMonths: number };
    alert: { notify: boolean; red: string[]; popup: boolean; acute: boolean; reasons: number };
    povBound: boolean;
    /** 「档案」页的选项数量与当前选中值（用于验证下拉真的可选、且选项齐全） */
    profileOptions: { breeds: number; ages: number; selectedBreed: string; selectedAge: string };
    /**
     * 机身尺寸与滚动事实。
     *
     * 为什么放进自检：用户反馈"内容一多 iPhone 就被撑长"。这件事**只有量尺寸才能证明**，
     * 肉眼看截图看不出来。断言方式：不同模块之间 `phoneHeight` 不变，
     * 而内容长的模块 `bodyScrollHeight > bodyClientHeight`（在机身内滚动）。
     */
    layout: {
      phoneHeight: number;
      bodyClientHeight: number;
      bodyScrollHeight: number;
      canScroll: boolean;
    };
  } {
    const status = this.status?.status ?? null;
    const index = this.status?.index ?? -1;
    const readings: Record<string, { value: number | null; validity: ReadingValidity | null }> = {};
    for (const key of ['hr', 'rr', 'temp'] as const) {
      const sample = index >= 0 ? this.session.samples[index] : undefined;
      readings[key] = sample
        ? { value: readingOf(sample, key), validity: sample.readingQuality?.[key]?.validity ?? null }
        : { value: null, validity: null };
    }
    const counts: Record<string, number> = {};
    // 用 `timelineOf()` 而不是直接读猫那个字段：自检里的「次数」在狗版页面上
    // 也必须来自狗的时间线，否则会读到一份不存在（或物种不对）的统计。
    for (const seg of this.timelineOf()?.segments ?? []) {
      counts[seg.activity] = (counts[seg.activity] ?? 0) + 1;
    }
    const breedSelect = this.body.querySelector('select[aria-label="品种"]') as HTMLSelectElement | null;
    const ageSelect = this.body.querySelector('select[aria-label="年龄"]') as HTMLSelectElement | null;
    const phoneEl = this.root.querySelector('.phone') as HTMLElement | null;
    return {
      collapsed: this.collapsed,
      tab: this.tab,
      hourOfDay: status?.hourOfDay ?? 0,
      readings,
      eventRows: this.body.querySelectorAll('.app-event-row').length,
      counts,
      profile: { breedId: this.profile.breedId, ageMonths: this.profile.ageMonths },
      alert: {
        notify: this.alert?.shouldNotify ?? false,
        red: this.alert ? highlightedChannels(this.alert).map(String) : [],
        popup: this.alertHost.querySelector('.app-alert') !== null,
        acute: this.alert?.acuteWindow ?? false,
        reasons: this.alert?.details.length ?? 0,
      },
      povBound: this.povBound,
      profileOptions: {
        breeds: breedSelect ? breedSelect.options.length : 0,
        ages: ageSelect ? ageSelect.options.length : 0,
        selectedBreed: breedSelect?.value ?? '',
        selectedAge: ageSelect?.value ?? '',
      },
      layout: {
        phoneHeight: phoneEl?.clientHeight ?? 0,
        bodyClientHeight: this.body.clientHeight,
        bodyScrollHeight: this.body.scrollHeight,
        canScroll: this.body.scrollHeight > this.body.clientHeight + 1,
      },
    };
  }
}

/**
 * 从行为状态里取**演示时刻（会话内秒）**。
 *
 * 为什么需要这个兜底：同一个事实在两个物种的运行时里名字不同——猫版 `timeS`、狗版 `demoS`
 * （见 `AppBehaviorStatus`）。界面只关心数值，命名差异不该渗透进每一处调用点。
 */
function demoSecondsOf(status: AppBehaviorStatus | null): number {
  if (!status) return 0;
  return status.timeS ?? status.demoS ?? 0;
}

/** 会话内秒 → 手机上的钟点（会话起点 09:00，与 `DAY_START_HOUR` 一致）。 */
function clockOf(tS: number): string {
  const hour = (9 + tS / 3600) % 24;
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function ageLabel(months: number): string {
  if (months < 12) return `${months} 个月`;
  const years = months / 12;
  return `${Number.isInteger(years) ? years : years.toFixed(1)} 岁`;
}

/**
 * 生理状态名 → 面向用户的过程描述。
 *
 * ⚠️ 只描述**过程**（"发作期""干呕期"），不描述原因、不出现任何病名。
 * 这是 `docs/design/06-physiology-state-program.md` 里登记的时相名，此处不另造一套。
 */
function describePhysiologyState(state: string): string {
  const table: Record<string, string> = {
    'pre-ictal': '发作前驱：短暂的警觉与心率上行',
    ictal: '发作期：全身高频抖动，这一段读数可能不可采信',
    'post-ictal': '发作后恢复期：心率仍高于平时，逐步回落',
    retching: '干呕期：反复吞咽与腹部用力',
    expulsion: '排出期：一次用力的躯干挤压',
    'post-emetic': '呕吐后恢复期：心率与呼吸回落',
  };
  return table[state] ?? state;
}
