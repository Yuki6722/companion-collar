/**
 * App 模拟视图：右侧边栏里的 iPhone 机模。
 *
 * 底部四个模块：**实时 / 事件流 / 健康 / 我的**。
 *
 * | 模块 | 内容 | 数据来源 |
 * |---|---|---|
 * | 实时 | **项圈相机拍到的画面**（便于判断它在哪）+ 它现在在做什么/在哪 | 3D 场景的离屏渲染 + 场景状态 |
 * | 事件流 | 每 **5 分钟**一条的行为记录（可滚动，机身高度不变）+ 六项行为的次数与时长（哪六项由词表给） | 会话里的行为时间线 + `session.events` |
 * | 健康 | 心率 / 呼吸频率 / 体表温 + 异常标红与弹窗 + 相对前半段基线的漂移 | `session.samples` + `core/vitals/alerts` |
 * | 我的 | 宠物头部信息 + **四个可点开的子视图**：宠物档案 / 项圈电量 / 定位 / 商城 | `core/profile`（档案）、演示时钟（电量）、行为状态与时间线（定位）、`core/collar-shop`（商城） |
 *
 * ★ **第四个模块这一轮从「档案」改成「我的」。**
 *   页签 id 仍然是 `'profile'`（`selectTab`、自检动作、URL 都按 id 走），只换显示文案
 *   （词表的 `tabMine`）。原档案页的**全部内容原样**成为「宠物档案」子视图，功能没有退化；
 *   另外三个子视图是新的：
 *   - **项圈电量**：由演示时钟推出来的放电曲线（严格可复现），界面上标明是仿真值；
 *   - **定位**：用 App 已经拿到的行为状态（`anchorId` / `anchorLabel`）+ 行为时间线推出
 *     "在哪个具名锚点、待了多久、本会话去过哪"，并给一句边界句——它是**推导出来的所在位置**，
 *     不是卫星定位，室内场景下更不该被当成定位精度；
 *   - **商城**：`@camp/core` 的项圈带目录（材质 / 大小 / 轻重）与"合不合身"判定，
 *     实时显示这条带多重、预算多少、超了多少克。
 *
 * ★ **物种参数化**：本文件是**共用机制**，物种差异全部来自构造时注入的 `vocab`
 *   （`AppSpeciesVocab`，见 `./app-vocab.ts`）：
 *   - **不传 `vocab` 就用 `CAT_APP_VOCAB`**，于是猫版页面（`screens/home.ts`）一行都不用改；
 *   - 狗版页面传 `DOG_APP_VOCAB`：结构、刷新纪律、变红与弹窗的判据全部复用，
 *     只有品种表、锚点名、活动名、年龄段/体型档与以物种为主语的句子是狗的。
 *   为什么不复制一份 `app-phone-dog.ts`：仓库纪律是「共用机制、分开参数」（`AGENTS.md` §8），
 *   而这里的机制（建一次 + 就地刷新、机身高度固定、内容在机身内滚动、提示判据）远多于词。
 *
 * ★ **一轮修掉的一个真故障：整块重建 DOM。**
 * 上一版每 500 ms 把 `.app-body` 整个 `replaceChildren` 一遍，于是：
 *   1. `<select>` 被销毁 → **下拉菜单刚点开就被关掉**（用户反馈 ①）；
 *   2. 列表节点的滚动位置每次重置 → 事件流/健康页"滑不动"（用户反馈 ③）；
 *   3. 「实时」页的画布每 500 ms 换一块新的 → 场景反复重建渲染目标 → **画面闪动**（用户反馈 ④）。
 * 现在改成 **建一次 + 就地刷新**：每个模块有自己的 `refresh()`，只改文本与类名，
 * 不换节点、不动画布、不重置滚动。此外还有两道保险：焦点在模块内时**跳过刷新**
 * （编辑中的表单绝不被抢），以及刷新时**保留滚动位置**。
 * ★ 「我的」页的四个子视图同样守这条纪律：**四个都建一次**，切换只改 `hidden` 属性。
 *   见 `buildMine` 的说明——那里还多出一条理由：藏在 `hidden` 里的品种下拉仍在 DOM 中，
 *   自检（`snapshot().profileOptions`）因此不会因为"没点开子视图"而读到 0 个选项。
 *
 * 三条纪律：
 *   1. **同一时刻**：所有读数与记录都按场景演示时刻（会话内秒）去查仿真会话，不另起一套时钟；
 *   2. **读数带有效性**：无效窗口划线展示并给出原因，不把坏值当读数；
 *   3. **词汇来自 core 与词表**：活动名、事件名、突发名、锚点名、边界句、品种表都从
 *      `@camp/core` 取，或由 `app-vocab.ts` 从 core 派生；本文件不新写一套面向用户的措辞。
 *      ★ 商城那一页的**数字与判定**全部来自 `@camp/core` 的 `collar-shop.ts`：
 *      界面只负责把 `checkStrapFit` 的结果显示出来，不自己判断"合不合身"。
 *
 * ⚠️ 边界（必须与代码一起读）：项圈相机拍的是**环境影像**。它不等于这个物种眼中的世界——
 *   帧率、视野、色觉、以及嗅觉通道都不等价（`AGENTS.md` §3）。界面按此措辞，
 *   具体句子由词表提供（`povBoundaryNote` / `driftBoundaryNote`）。
 *   「定位」与「项圈电量」同理：前者是由行为时间线推出的**所在位置**（不是卫星定位），
 *   后者是由演示时钟推出的**仿真曲线**（不是实测续航），两处都在屏上写明。
 */
import {
  AGE_OPTIONS_MONTHS,
  CONDITION_LABELS,
  STRAP_GRADE_OPTIONS,
  STRAP_MATERIAL_OPTIONS,
  STRAP_SIZE_OPTIONS,
  VALIDITY_LABELS,
  VITAL_LABELS,
  VITAL_UNITS,
  ageBandOf,
  checkStrapFit,
  clamp,
  collarBudgetOf,
  detectDrifts,
  evaluateVitalAlerts,
  highlightedChannels,
  lightestStrapFor,
  rawReadingOf,
  readingOf,
  sizeClassOf,
} from '@camp/core';
import type {
  PetProfile,
  ReadingValidity,
  Sample,
  Session,
  StrapSelection,
  StrapSizeId,
  VitalAlertSummary,
  VitalKey,
} from '@camp/core';
import { CAT_APP_VOCAB } from './app-vocab.ts';
import type { AppSpeciesVocab } from './app-vocab.ts';
import { el, tierBadge } from './dom.ts';

type AppTab = 'live' | 'events' | 'health' | 'profile';

/**
 * 「我的」页里的子视图：根视图（宠物头部 + 四个条目）+ 四个子视图。
 *
 * 它是**实例状态**（`private mineSub`），不是局部变量：在「宠物档案」子视图里改品种会重建会话、
 * 进而重建整个「我的」页，如果子视图选择是局部的，用户每改一次品种就被弹回根视图。
 */
type MineSubView = 'root' | 'pet' | 'battery' | 'location' | 'shop';

/**
 * 底部四个页签。
 *
 * ⚠️ 第四项的 **id 保持 `'profile'`**（`selectTab` / 自检动作 / 任何按 id 的调用都不受影响），
 *    显示文案在构造页签时取自词表的 `tabMine`（猫狗都是「我的」）。
 */
const TABS: ReadonlyArray<{ id: AppTab; label: string }> = [
  { id: 'live', label: '实时' },
  { id: 'events', label: '事件流' },
  { id: 'health', label: '健康' },
  { id: 'profile', label: '我的' },
];

/** 事件流的分辨率：**每 5 分钟一条**（用户要求"不用太频繁"）。 */
const EVENT_BUCKET_S = 300;
/** 事件流最多回看多少条（手机屏幕小，再多也没人翻）。 */
const MAX_EVENT_ROWS = 36;
/** 项圈相机画布尺寸：小一点，读回来才便宜（见 scene 的 `updatePovFeed`）。 */
const POV_W = 176;
const POV_H = 132;

/**
 * 表盘放电模型：满电按 **18 演示小时** 线性放电。
 *
 * 依据是量级而不是实测：项圈规格文档里电池是「3.8 V 500 mAh 量级」（`weak`），
 * 而整条链路（ECG 200 Hz 睡眠档 + IMU 50 Hz + 分钟级上报）在演示里只有"跑多久耗尽"这一个用法。
 * 取 18 演示小时的理由：会话是 12 演示小时，于是曲线**从 100% 走到约 33%**——
 * 单调、可见、且不会在演示中途撞到 0 之后一直贴着地板。
 */
const BATTERY_FULL_DEMO_HOURS = 18;
/**
 * 演示起点（09:00）起的**前 30 演示分钟**视作在充电座上：电量保持满电、界面显示"充电中"。
 *
 * 为什么要有这个窗口：只显示"未充电"会让「充电状态」这一行变成一句常量，
 * 而写死一个假的充电窗口又不可解释。这条规则**完全由演示时钟决定**，
 * 因此每次打开都能复现，也能在界面上说清它是怎么来的。
 */
const BATTERY_CHARGING_HOLD_S = 30 * 60;

/**
 * 「我的」页里新出现的几处样式，**只写内联样式**。
 *
 * 为什么：本轮改动被限定在五个文件内（`apps/web/public/styles.css` 不在其中），
 * 因此新界面一律复用**已有**的类（`.app-card` / `.app-list` / `.app-kv` / `.app-note` /
 * `.app-tab` / `.app-field` / `.app-select` / `.app-alert-details`），
 * 只有确实没有对应类的三处（条目行、选项芯片、子视图头）用内联样式。
 * 这样不会出现"类名写了、样式没人写"的半成品。
 *
 * ⚠️ 反过来说：`app-entry` / `app-back` / `app-cta` 这三个类名**故意没有 CSS**，
 * 它们只是自检用的钩子（例如 `snapshot().mine.entries` 数条目行）。样式全在上面的常量里，
 * 谁把样式搬进 `styles.css` 时请连带把这里的内联样式删掉，别留两份。
 */
const ENTRY_STYLE =
  'display:grid;grid-template-columns:1fr auto;gap:1px 8px;width:100%;text-align:left;font:inherit;font-size:11.5px;padding:8px 10px;border:0;border-bottom:1px solid var(--line);background:#fff;color:inherit;cursor:pointer;';
const ENTRY_STYLE_LAST = ENTRY_STYLE.replace('border-bottom:1px solid var(--line);', '');
const ENTRY_TITLE_STYLE = 'grid-column:1;font-weight:700;';
const ENTRY_DESC_STYLE = 'grid-column:1;font-size:9.5px;line-height:1.45;color:var(--ink-faint);';
const ENTRY_ARROW_STYLE = 'grid-column:2;grid-row:1 / span 2;align-self:center;color:var(--ink-faint);';
const SUBHEAD_STYLE = 'display:flex;align-items:center;gap:6px;margin:0 0 8px;';
const SUBHEAD_TITLE_STYLE = 'font-weight:700;font-size:12px;';
const BACK_STYLE =
  'font:inherit;font-size:10.5px;padding:4px 8px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--ink-soft);cursor:pointer;';
const CHIP_ROW_STYLE = 'display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin:6px 0 4px;';
const CHIP_OFF_STYLE =
  'font:inherit;font-size:10.5px;padding:6px 4px;border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--ink-soft);cursor:pointer;';
const CHIP_ON_STYLE =
  'font:inherit;font-size:10.5px;padding:6px 4px;border-radius:8px;border:1px solid rgba(15,118,110,0.45);background:rgba(15,118,110,0.07);color:#0f766e;font-weight:700;cursor:pointer;';
const CTA_STYLE =
  'width:100%;font:inherit;font-size:11.5px;padding:8px;border-radius:8px;border:1px solid rgba(15,118,110,0.4);background:rgba(15,118,110,0.08);color:#0f766e;font-weight:700;cursor:pointer;';
const BAR_STYLE = 'height:8px;border-radius:999px;background:rgba(47,42,36,0.12);overflow:hidden;margin:6px 0 2px;';
const BAR_FILL_STYLE = 'height:100%;width:0%;background:#0f766e;border-radius:999px;';
/** 判定卡的两种配色：合身用产品主色，不合身用与提醒一致的暖红（它同样是一条"要看一眼"的结论）。 */
const FIT_OK_STYLE = 'border-color:rgba(15,118,110,0.35);background:rgba(15,118,110,0.04);';
const FIT_BAD_STYLE = 'border-color:rgba(180,40,30,0.35);background:#fff5f4;';

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

/** 时间线上的一个区间：界面只读这几项。 */
export interface AppBehaviorSegment {
  /** 区间起点（会话内秒） */
  t: number;
  /** 区间时长（秒） */
  durS: number;
  /** 活动 id（两个物种各有一套取值，界面按词表查中文名） */
  activity: string;
  /**
   * 该区间所在的锚点（移动类活动是**目的地**）。
   *
   * 为什么也收进这个最小接口：猫、狗两个行为层都给了它（`CatBehaviorSegment` /
   * `DogBehaviorSegment` 逐字同名），而「定位」子视图要用它推出"在哪个具名锚点、待了多久、
   * 本会话去过哪"。少收一个字段，界面就只能去猜位置——那正是"自己编坐标"的开端。
   */
  anchorId?: string;
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
  /**
   * 「我的」页此刻显示的子视图。
   *
   * 放在实例上（而不是 `buildMine` 的局部变量）的理由：在「宠物档案」子视图里改品种/年龄会
   * 重建会话 → 视图重建，如果这个状态是局部的，用户每改一次档案都会被弹回根视图。
   */
  private mineSub: MineSubView = 'root';
  /** 「我的」页用来切换子视图的回调；重建时被替换（见 `buildMine`）。 */
  private mineSwitch: ((sub: MineSubView) => void) | null = null;
  /**
   * 商城的当前选择（跨重建保留）。
   *
   * 为什么放在实例上：确认按钮与判定结果都要能在 `snapshot()` 里被读到（自检要证明
   * "超预算真的显示了理由"），而 `snapshot()` 拿不到子视图闭包里的局部变量。
   */
  private shopSelection: StrapSelection | null = null;

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
          // 第四项的显示文案来自词表（猫狗都是「我的」）；id 仍然是 `'profile'`
          text: t.id === 'profile' ? this.vocab.tabMine : t.label,
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
        view = this.buildMine();
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

  // ---------------------------------------------------------------- 我的（宠物档案 / 电量 / 定位 / 商城）

  /**
   * 「我的」页：宠物头部信息 + **四个可点开的子视图**。
   *
   * 结构纪律（与整份文件一致，见文件头注释）：
   *   - 头部卡片、四个条目、四个子视图**全部只建一次**；切换子视图只改 `hidden` 属性，
   *     不重建任何节点——重建会把 `<select>` 的展开状态、用户输入与焦点一起丢掉；
   *     进入子视图时头部与条目一起隐藏（"从列表钻进详情"），返回时原样恢复；
   *   - `refresh(tS)` 只写文本与类名，四个子视图各自就地更新（隐藏的那些也更新：
   *     它们只是不显示，节点仍在 DOM 里，代价是几次 `textContent`）；
   *   - 藏在 `hidden` 里的品种下拉仍然在 DOM 中，因此自检读到的选项数不会因为
   *     "此刻停在根视图"而变成 0。
   */
  private buildMine(): TabView {
    const v = this.vocab;
    const breeds = v.breeds;

    // ---- 头部：这只宠物是谁 + 档案推导出来的重量预算（沿用现有卡片与键值行）
    const headBreed = el('span', { class: 'app-now-value', text: '—' });
    const headSub = el('span', { class: 'app-now-where', text: '' });
    const headKv = el('div', { class: 'app-list' });
    const headCard = el('div', { class: 'app-card' }, [
      el('span', { class: 'app-card-label', text: `这只${v.speciesNoun}` }),
      headBreed,
      headSub,
      headKv,
    ]);

    // ---- 四个条目（顺序即词表里的顺序）
    const entries: ReadonlyArray<{ id: MineSubView; title: string; desc: string }> = [
      { id: 'pet', title: v.mineItemProfileTitle, desc: v.mineItemProfileDesc },
      { id: 'battery', title: v.mineItemBatteryTitle, desc: v.mineItemBatteryDesc },
      { id: 'location', title: v.mineItemLocationTitle, desc: v.mineItemLocationDesc },
      { id: 'shop', title: v.mineItemShopTitle, desc: v.mineItemShopDesc },
    ];
    const entryHost = el('div', { class: 'app-list' });
    entries.forEach((entry, i) => {
      entryHost.append(
        el(
          'button',
          {
            class: 'app-entry',
            type: 'button',
            // 最后一行不加分隔线：`.app-list` 自己带圆角与边框
            attrs: { style: i === entries.length - 1 ? ENTRY_STYLE_LAST : ENTRY_STYLE },
            on: { click: () => this.mineSwitch?.(entry.id) },
          },
          [
            el('span', { attrs: { style: ENTRY_TITLE_STYLE }, text: entry.title }),
            el('span', { attrs: { style: ENTRY_DESC_STYLE }, text: entry.desc }),
            el('span', { attrs: { style: ENTRY_ARROW_STYLE }, text: '›' }),
          ],
        ),
      );
    });

    // ---- 四个子视图：**建一次**，切换只改 `hidden`
    const subViews: ReadonlyArray<{
      id: MineSubView;
      view: { root: HTMLElement; refresh: (tS: number) => void };
    }> = [
      { id: 'pet', view: this.buildMinePet() },
      { id: 'battery', view: this.buildMineBattery() },
      { id: 'location', view: this.buildMineLocation() },
      { id: 'shop', view: this.buildMineShop() },
    ];
    const root = el('div', { class: 'app-tab-root' }, [headCard, entryHost]);
    for (const sub of subViews) root.append(sub.view.root);

    /**
     * 切换「我的」页的显示层级：根视图（头部 + 四个条目）与子视图**互斥**。
     *
     * 为什么进入子视图时连头部与条目一起藏起来：这是"从列表钻进详情"的形态，
     * 如果把四个条目留在上面，子视图的内容会被推下去，手机上第一屏就只剩列表。
     * 注意：**只是 `hidden`**，节点全都在，返回时立刻恢复，不重建任何东西。
     */
    const applySub = (): void => {
      const atRoot = this.mineSub === 'root';
      headCard.toggleAttribute('hidden', !atRoot);
      entryHost.toggleAttribute('hidden', !atRoot);
      for (const sub of subViews) sub.view.root.toggleAttribute('hidden', sub.id !== this.mineSub);
    };
    this.mineSwitch = (sub) => {
      this.mineSub = sub;
      applySub();
    };
    applySub();

    return {
      root,
      refresh: (tS) => {
        const cur = this.profile;
        const b = breeds.find((x) => x.id === cur.breedId) ?? breeds[0];
        const label = b?.label ?? cur.breedId;
        if (headBreed.textContent !== label) headBreed.textContent = label;
        const budget = collarBudgetOf(cur);
        const sub = `${v.ageBandLabels[ageBandOf(cur.ageMonths)]} · ${v.sizeClassLabels[sizeClassOf(cur.species, cur.weightKg)]} · ${cur.weightKg} kg / ${cur.heightCm} cm`;
        if (headSub.textContent !== sub) headSub.textContent = sub;
        const rows: Array<[string, string]> = [
          ['项圈重量预算', `${budget.maxWeightG} g（体重 2%，工程经验值）`],
          ['颈围带长', `${budget.strapMinMm}–${budget.strapMaxMm} mm`],
        ];
        const signature = rows.map(([k, val]) => `${k}=${val}`).join('|');
        if (headKv.dataset.signature !== signature) {
          headKv.dataset.signature = signature;
          headKv.replaceChildren(
            ...rows.map(([k, val]) =>
              el('div', { class: 'app-kv' }, [
                el('span', { class: 'app-kv-key', text: k }),
                el('span', { class: 'app-kv-value', text: val }),
              ]),
            ),
          );
        }
        for (const s of subViews) s.view.refresh(tS);
        applySub();
      },
    };
  }

  /**
   * 子视图外壳：一行「返回 + 标题」，下面是内容。
   *
   * 返回入口是**每个子视图都有**的；它只切回根视图，不销毁任何节点（因此来回点也不会闪）。
   */
  private mineShell(title: string, body: HTMLElement): HTMLElement {
    return el('div', {}, [
      el('div', { attrs: { style: SUBHEAD_STYLE } }, [
        el('button', {
          class: 'app-back',
          type: 'button',
          text: `‹ ${this.vocab.mineBackLabel}`,
          attrs: { style: BACK_STYLE },
          on: { click: () => this.mineSwitch?.('root') },
        }),
        el('span', { attrs: { style: SUBHEAD_TITLE_STYLE }, text: title }),
      ]),
      body,
    ]);
  }

  /**
   * 立刻重刷「我的」页：子视图里的点击要当场看到反馈，不能等下一个刷新节拍。
   *
   * ⚠️ 它**刻意绕过** `syncView` 里那条「焦点在模块内就跳过刷新」的保险：
   * 点完芯片后焦点就在那颗按钮上，走 `syncView` 的话这次刷新会被整条跳过，
   * 于是"点了没反应"。安全的前提是这一页的 `refresh` 只写文本 / 类名 / 内联样式，
   * 从不替换 `<select>` 与芯片节点（见 `buildMineShop`），所以不会抢掉任何正在进行的操作。
   */
  private refreshMineNow(): void {
    if (this.view && this.viewTab === 'profile') this.view.refresh(this.demoSeconds());
  }

  /**
   * 子视图一：**宠物档案** —— 原来那一整页，**原样**搬进来。
   *
   * 一个字段都没改：品种下拉、年龄下拉、"改品种或年龄会重建整段仿真会话"的说明、
   * 以及底部的仿真声明都还在。这次变的只是它现在住在「我的」页的第一个条目里。
   */
  private buildMinePet(): { root: HTMLElement; refresh: (tS: number) => void } {
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

    const body = el('div', {}, [
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
      root: this.mineShell(this.vocab.mineItemProfileTitle, body),
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

  /**
   * 子视图二：**项圈电量**。
   *
   * 数字是**推出来的**，不是写死的：百分比由演示时钟（会话内秒）按
   * 「满电 `BATTERY_FULL_DEMO_HOURS` 演示小时线性放电」算出；会话开头
   * `BATTERY_CHARGING_HOLD_S` 视作在充电座上（保持满电、显示"充电中"）。
   * 于是它 ① 先持平再单调下降，② 同一个演示时刻永远得到同一个数，③ 屏上写明是仿真值与推导规则。
   *
   * 为什么这样才诚实：本项目不造真硬件，"续航"不可能有实测依据，
   * 因此界面必须同时给**推导规则**与**仿真声明**，而不是甩一个孤零零的百分比。
   */
  private buildMineBattery(): { root: HTMLElement; refresh: (tS: number) => void } {
    const pct = el('span', { class: 'app-now-value', text: '—' });
    const barFill = el('div', { attrs: { style: BAR_FILL_STYLE } });
    const charge = el('span', { class: 'app-kv-value', text: '—' });
    const elapsed = el('span', { class: 'app-kv-value', text: '—' });
    const rule = el('span', { class: 'app-kv-value', text: '—' });
    const body = el('div', {}, [
      el('div', { class: 'app-card' }, [
        el('span', { class: 'app-card-label', text: this.vocab.batteryTitle }),
        pct,
        el('div', { attrs: { style: BAR_STYLE } }, [barFill]),
        el('p', { class: 'app-note', text: this.vocab.batteryDesc }),
      ]),
      el('div', { class: 'app-list' }, [
        el('div', { class: 'app-kv' }, [el('span', { class: 'app-kv-key', text: '充电状态' }), charge]),
        el('div', { class: 'app-kv' }, [el('span', { class: 'app-kv-key', text: '会话已进行' }), elapsed]),
        el('div', { class: 'app-kv' }, [el('span', { class: 'app-kv-key', text: '推导规则' }), rule]),
      ]),
      el('p', { class: 'app-note app-note-boundary', text: this.vocab.batterySimNote }),
    ]);

    return {
      root: this.mineShell(this.vocab.batteryTitle, body),
      refresh: (tS) => {
        const state = this.batteryOf(tS);
        const text = `${state.pct.toFixed(0)}%`;
        if (pct.textContent !== text) pct.textContent = text;
        barFill.setAttribute(
          'style',
          `${BAR_FILL_STYLE}width:${state.pct.toFixed(0)}%;${state.pct <= 20 ? 'background:#b45309;' : ''}`,
        );
        const chargeText = state.charging
          ? `充电中（演示起点起 ${BATTERY_CHARGING_HOLD_S / 60} 演示分钟在充电座上，电量保持满电）`
          : state.pct <= 20
            ? '未充电 · 电量偏低（仿真）'
            : '未充电 · 单次放电';
        if (charge.textContent !== chargeText) charge.textContent = chargeText;
        const elapsedText = `${(tS / 3600).toFixed(1)} 演示小时（演示时钟 ${this.lastClockText}）`;
        if (elapsed.textContent !== elapsedText) elapsed.textContent = elapsedText;
        const ruleText = `满电按 ${BATTERY_FULL_DEMO_HOURS} 演示小时线性放电 → ${state.pct.toFixed(0)}%（由演示时钟算出）`;
        if (rule.textContent !== ruleText) rule.textContent = ruleText;
      },
    };
  }

  /** 表盘电量（百分比 + 是否在充电）：纯函数，只依赖演示时刻，因此可复现、可断言。 */
  private batteryOf(tS: number): { pct: number; charging: boolean } {
    const charging = tS < BATTERY_CHARGING_HOLD_S;
    const pct = charging ? 100 : clamp(100 * (1 - tS / (BATTERY_FULL_DEMO_HOURS * 3600)), 0, 100);
    return { pct, charging };
  }

  /**
   * 子视图三：**定位**。
   *
   * 位置**不是**另编的坐标：它来自场景每帧推来的行为状态（`anchorId` / `anchorLabel`），
   * 停留时长与"本会话到过哪"来自同一份行为时间线——就是驱动画面、事件流与手机读数的那一份。
   * 因此它确定、可复现，并且是**推导出来的**：所以屏上必须写明这层边界
   * （它说的是"在哪个具名锚点"，不是卫星定位，也没有坐标精度）。
   */
  private buildMineLocation(): { root: HTMLElement; refresh: (tS: number) => void } {
    const anchor = el('span', { class: 'app-now-value', text: '等待场景…' });
    const activity = el('span', { class: 'app-now-where', text: '' });
    const stay = el('span', { class: 'app-kv-value', text: '—' });
    const visitedHost = el('div', { class: 'app-list' });
    const body = el('div', {}, [
      el('div', { class: 'app-card' }, [
        el('span', { class: 'app-card-label', text: this.vocab.locationTitle }),
        anchor,
        activity,
      ]),
      el('div', { class: 'app-list' }, [
        el('div', { class: 'app-kv' }, [el('span', { class: 'app-kv-key', text: '当前位置停留' }), stay]),
      ]),
      el('div', { class: 'app-card' }, [
        el('span', { class: 'app-card-label', text: '本会话到过的地方' }),
        visitedHost,
      ]),
      el('p', { class: 'app-note', text: this.vocab.locationSourceNote }),
      el('p', { class: 'app-note app-note-boundary', text: this.vocab.locationBoundaryNote }),
    ]);

    return {
      root: this.mineShell(this.vocab.locationTitle, body),
      refresh: (tS) => {
        const here = this.locationOf(tS);
        const anchorText = here.anchorLabel || '等待场景…';
        if (anchor.textContent !== anchorText) anchor.textContent = anchorText;
        const activityText = here.activityLabel
          ? `当前活动：${here.activityLabel}（演示时钟 ${this.lastClockText}）`
          : '当前活动：—';
        if (activity.textContent !== activityText) activity.textContent = activityText;
        const stayText = here.anchorId ? `${formatDuration(here.stayS)}（连续的同一位置）` : '—';
        if (stay.textContent !== stayText) stay.textContent = stayText;
        const signature = here.visited.map((x) => `${x.id}:${x.count}:${Math.round(x.seconds)}`).join('|');
        if (visitedHost.dataset.signature !== signature) {
          visitedHost.dataset.signature = signature;
          // ⚠️ 这里刻意用 `.app-kv` 而不是 `.app-event-row`：后者是「事件流」行数的
          //    自检口径（`snapshot().eventRows`），借它来摆位置会让那个计数变成两件事的和。
          visitedHost.replaceChildren(
            ...(here.visited.length === 0
              ? [el('div', { class: 'app-kv' }, [el('span', { class: 'app-kv-value', text: '还没有记录' })])]
              : here.visited.map((x) =>
                  el('div', { class: 'app-kv' }, [
                    el('span', { class: 'app-kv-key', text: x.label }),
                    el('span', { class: 'app-kv-value', text: `${x.count} 段 · ${formatDuration(x.seconds)}` }),
                  ]),
                )),
          );
        }
      },
    };
  }

  /**
   * 由行为状态与行为时间线推出的「所在位置」。
   *
   * 每一项都不是新的物理量：当前锚点来自场景推来的状态，停留时长与去过的地方由时间线归并。
   * 取值只依赖 `tS` 与同一份时间线，因此每次刷新都能复现同一个答案。
   */
  private locationOf(tS: number): {
    anchorId: string | null;
    anchorLabel: string;
    activityLabel: string;
    stayS: number;
    visited: Array<{ id: string; label: string; count: number; seconds: number }>;
  } {
    const status = this.status?.status ?? null;
    const labels = this.vocab.anchorLabels;
    const anchorId = status?.anchorId ?? null;
    const segments = this.timelineOf()?.segments ?? [];
    const visited: Array<{ id: string; label: string; count: number; seconds: number }> = [];
    /** id → `visited` 下标：避免每段都做一次线性查找（时间线有上千段） */
    const index = new Map<string, number>();
    for (const seg of segments) {
      if (seg.t > tS) continue;
      const id = seg.anchorId ?? '';
      if (!id) continue;
      const seconds = Math.min(seg.durS, tS - seg.t);
      const at = index.get(id);
      if (at === undefined) {
        index.set(id, visited.length);
        visited.push({ id, label: labels[id] ?? id, count: 1, seconds });
      } else {
        const item = visited[at];
        if (!item) continue;
        item.count += 1;
        item.seconds += seconds;
      }
    }
    visited.sort((a, b) => b.seconds - a.seconds);
    return {
      anchorId,
      anchorLabel: anchorId ? (labels[anchorId] ?? status?.anchorLabel ?? anchorId) : '',
      activityLabel: status?.activityLabel ?? '',
      stayS: anchorId ? anchorStayS(anchorId, segments, tS) : 0,
      // 只列前 6 个：手机屏就这么点地方，再多的行数也没人翻
      visited: visited.slice(0, 6),
    };
  }

  /**
   * 子视图四：**商城**（本轮新增）。
   *
   * 目录、克重与"合不合身"**全部来自 `@camp/core` 的 `collar-shop.ts`**：
   * 这一层只做三件事——把三个维度的选项画成可点的芯片、把 `checkStrapFit` 的结果显示出来、
   * 在用户点"选择这条"时给一行反馈。判定不在这里，因此不会出现"界面说合身、core 说超预算"。
   *
   * 每个数字旁边都挂证据徽章：克重是**工程估算**（材料密度 × 常见厚度），
   * 不把等级一起露出来，用户就会把它读成实测值。
   */
  private buildMineShop(): { root: HTMLElement; refresh: (tS: number) => void } {
    const v = this.vocab;
    // 选择跨重建保留；档案变了之后若原尺寸档不再合适，就换回推荐档
    // （注意：这一步只在**重建时**做。点芯片不会走到这里，否则用户永远选不中"不推荐"的档，
    //  也就看不到界面为什么拒绝它。）
    const kept = this.shopSelection;
    this.shopSelection =
      kept && checkStrapFit(this.profile, kept).sizeRecommended
        ? kept
        : { materialId: 'nylon-webbing', sizeId: this.recommendedSizeId(), gradeId: 'standard' };
    const selectionOf = (): StrapSelection => this.shopSelection as StrapSelection;
    /** 最近一次确认动作的反馈（可能为 null） */
    let confirmed: string | null = null;

    const pick = (over: Partial<StrapSelection>): void => {
      this.shopSelection = { ...selectionOf(), ...over };
      // 换了选项就把上一条确认反馈清掉：否则会显示一条与当前选项不符的"已选择"
      confirmed = null;
      this.refreshMineNow();
    };

    // ---- 三个维度的芯片（建一次；选中态只在 refresh 里改 class / 内联样式）
    const chips: Array<{ node: HTMLButtonElement; isOn: () => boolean }> = [];
    const chipRow = (): HTMLElement => el('div', { attrs: { style: CHIP_ROW_STYLE } });
    const materialRow = chipRow();
    for (const option of STRAP_MATERIAL_OPTIONS) {
      const node = el('button', {
        class: 'app-tab',
        type: 'button',
        text: option.label,
        attrs: { style: CHIP_OFF_STYLE, title: evidenceTitle(option.evidence.source, option.evidence.note) },
        on: { click: () => pick({ materialId: option.id }) },
      });
      materialRow.append(node);
      chips.push({ node, isOn: () => selectionOf().materialId === option.id });
    }
    const sizeRow = chipRow();
    for (const option of STRAP_SIZE_OPTIONS) {
      const node = el('button', {
        class: 'app-tab',
        type: 'button',
        text: `${option.label} · ${option.widthMm} mm`,
        attrs: { style: CHIP_OFF_STYLE, title: evidenceTitle(option.evidence.source, option.evidence.note) },
        on: { click: () => pick({ sizeId: option.id }) },
      });
      sizeRow.append(node);
      chips.push({ node, isOn: () => selectionOf().sizeId === option.id });
    }
    const gradeRow = chipRow();
    for (const option of STRAP_GRADE_OPTIONS) {
      const node = el('button', {
        class: 'app-tab',
        type: 'button',
        text: `${option.label} ×${option.thicknessFactor}`,
        attrs: { style: CHIP_OFF_STYLE, title: evidenceTitle(option.evidence.source, option.evidence.note) },
        on: { click: () => pick({ gradeId: option.id }) },
      });
      gradeRow.append(node);
      chips.push({ node, isOn: () => selectionOf().gradeId === option.id });
    }

    /**
     * 一行「这一档的数值 + 证据徽章」。
     *
     * 只在文本或等级变化时才重建子节点：芯片一点就会立刻刷新，而刷新节拍是每秒两次，
     * 无脑重建会让节点寿命变得不可预测（本文件的就地刷新纪律）。
     */
    const basisLineOf = (): { host: HTMLElement; set: (text: string, tier: string) => void } => {
      const host = el('p', { class: 'app-note' });
      let last = '';
      return {
        host,
        set: (text, tier) => {
          const key = `${text}|${tier}`;
          if (key === last) return;
          last = key;
          host.replaceChildren(el('span', { text }), tierBadge(tier));
        },
      };
    };
    const basisMaterial = basisLineOf();
    const basisSize = basisLineOf();
    const basisGrade = basisLineOf();

    // ---- 判定结果
    const fitCard = el('div', { class: 'app-card' });
    const fitVerdict = el('span', { class: 'app-now-value', text: '—' });
    const fitKv = el('div', { class: 'app-list' });
    const reasonList = el('ul', { class: 'app-alert-details' });
    fitCard.append(el('span', { class: 'app-card-label', text: '这条带合不合身' }), fitVerdict, fitKv, reasonList);

    const lightestNote = el('p', { class: 'app-note', text: '' });
    const budgetNote = el('p', { class: 'app-note', text: v.budgetScaleNote });
    const confirmStatus = el('p', { class: 'app-note', text: '' });

    const body = el('div', {}, [
      el('p', { class: 'app-note', text: v.shopIntro }),
      el('div', { class: 'app-card' }, [
        el('span', { class: 'app-card-label', text: v.shopMaterialTitle }),
        materialRow,
        basisMaterial.host,
      ]),
      el('div', { class: 'app-card' }, [
        el('span', { class: 'app-card-label', text: v.shopSizeTitle }),
        sizeRow,
        basisSize.host,
      ]),
      el('div', { class: 'app-card' }, [
        el('span', { class: 'app-card-label', text: v.shopGradeTitle }),
        gradeRow,
        basisGrade.host,
      ]),
      fitCard,
      lightestNote,
      budgetNote,
      el('button', {
        class: 'app-cta',
        type: 'button',
        text: v.shopConfirmLabel,
        attrs: { style: CTA_STYLE },
        on: {
          click: () => {
            confirmed = this.shopSummaryOf(selectionOf());
            this.refreshMineNow();
          },
        },
      }),
      confirmStatus,
      el('p', { class: 'app-note app-note-boundary', text: v.shopBoundaryNote }),
      el('p', { class: 'app-note', text: v.shopEvidenceNote }),
    ]);

    return {
      root: this.mineShell(this.vocab.mineItemShopTitle, body),
      refresh: () => {
        const sel = selectionOf();
        const fit = checkStrapFit(this.profile, sel);

        // ① 芯片的选中态：只改 class / 内联样式与 aria，不重建节点
        for (const chip of chips) {
          const on = chip.isOn();
          chip.node.className = on ? 'app-tab app-tab-active' : 'app-tab';
          chip.node.setAttribute('aria-pressed', on ? 'true' : 'false');
          chip.node.setAttribute('style', on ? CHIP_ON_STYLE : CHIP_OFF_STYLE);
        }

        // ② 三个维度的"这一档是什么数值、等级多高"
        const material = STRAP_MATERIAL_OPTIONS.find((m) => m.id === sel.materialId);
        const size = STRAP_SIZE_OPTIONS.find((s) => s.id === sel.sizeId);
        const grade = STRAP_GRADE_OPTIONS.find((g) => g.id === sel.gradeId);
        basisMaterial.set(
          material
            ? `${material.label}：面密度 ${material.arealDensityGm2 === null ? '未核实，按政策不给数值' : `${material.arealDensityGm2} g/m²`}`
            : '不在目录里',
          material?.evidence.tier ?? 'unverified',
        );
        basisSize.set(
          size
            ? `${size.label}：颈围 ${size.neckMinCm}–${size.neckMaxCm} cm · 带宽 ${size.widthMm} mm · 下料 ${size.strapLengthMm} mm`
            : '不在目录里',
          size?.evidence.tier ?? 'unverified',
        );
        basisGrade.set(
          grade ? `${grade.label}：相对倍率 ×${grade.thicknessFactor}` : '不在目录里',
          grade?.evidence.tier ?? 'unverified',
        );

        // ③ 判定结果（含逐条理由）
        const weightText = fit.strapWeightG === null ? '未核实' : `${fit.strapWeightG} g`;
        const totalText = fit.totalWeightG === null ? '—' : `${fit.totalWeightG} g`;
        const verdict =
          fit.strapWeightG === null
            ? '无法判定（证据未核实）'
            : fit.ok
              ? '合身'
              : `不合身${fit.overByG === null ? '' : ` · 超 ${fit.overByG} g`}`;
        if (fitVerdict.textContent !== verdict) fitVerdict.textContent = verdict;
        fitCard.setAttribute('style', fit.ok ? FIT_OK_STYLE : FIT_BAD_STYLE);
        const rows: Array<[string, string]> = [
          ['这条带（带体）', weightText],
          ['表盘（电子仓）', `${fit.podWeightG} g`],
          ['合计', totalText],
          ['重量预算', `${fit.budgetG} g（体重 2%）`],
          ['可用带长', `${fit.strapRangeMm[0]}–${fit.strapRangeMm[1]} mm`],
        ];
        const fitSignature = `${rows.map(([k, x]) => `${k}=${x}`).join('|')}|${fit.ok ? 'ok' : 'no'}|${fit.reasons.join('||')}`;
        if (fitKv.dataset.signature !== fitSignature) {
          fitKv.dataset.signature = fitSignature;
          fitKv.replaceChildren(
            ...rows.map(([k, x]) =>
              el('div', { class: 'app-kv' }, [
                el('span', { class: 'app-kv-key', text: k }),
                el('span', { class: 'app-kv-value', text: x }),
              ]),
            ),
          );
          reasonList.replaceChildren(...fit.reasons.map((r) => el('li', { text: r })));
        }

        // ④ 「最轻的一条」只在档案变化时重算（它要遍历整个目录）
        const lightestKey = `${this.profile.species}|${this.profile.breedId}|${this.profile.weightKg}|${this.profile.ageMonths}`;
        if (lightestNote.dataset.signature !== lightestKey) {
          lightestNote.dataset.signature = lightestKey;
          lightestNote.textContent = this.lightestNoteText();
        }

        // ⑤ 确认反馈
        const confirmText = confirmed ? `${v.shopConfirmedNote}选择：${confirmed}。` : '';
        if (confirmStatus.textContent !== confirmText) confirmStatus.textContent = confirmText;
        confirmStatus.setAttribute('style', confirmed ? 'color:#0f766e;font-weight:600;' : '');
      },
    };
  }

  /**
   * 当前档案下推荐的尺寸档：目录顺序里第一个「几何上戴得上」的档（颈围重叠 + 体型档命中）。
   *
   * 判定仍然只由 core 的 `checkStrapFit` 做，界面不另写一套规则；
   * 探针里的材质与轻重不影响 `sizeRecommended`（`collar-shop.test.ts` 有一条断言钉住这点）。
   */
  private recommendedSizeId(): StrapSizeId {
    for (const size of STRAP_SIZE_OPTIONS) {
      const probe: StrapSelection = { materialId: 'nylon-webbing', sizeId: size.id, gradeId: 'standard' };
      if (checkStrapFit(this.profile, probe).sizeRecommended) return size.id;
    }
    return 's';
  }

  /** 一句可核查的确认摘要（含合计与预算）。 */
  private shopSummaryOf(selection: StrapSelection): string {
    const label = <T extends { id: string; label: string }>(list: readonly T[], id: string): string =>
      list.find((x) => x.id === id)?.label ?? id;
    const fit = checkStrapFit(this.profile, selection);
    const total = fit.totalWeightG === null ? '克重未核实' : `合计 ${fit.totalWeightG} g`;
    return `${label(STRAP_MATERIAL_OPTIONS, selection.materialId)} · ${label(STRAP_SIZE_OPTIONS, selection.sizeId)} · ${label(STRAP_GRADE_OPTIONS, selection.gradeId)}（${total} / 预算 ${fit.budgetG} g）`;
  }

  /**
   * 「目录里最轻的一条」——回答用户看到"超预算"之后的下一个问题。
   *
   * 仍然只由 core 的两个函数给出（`lightestStrapFor` + `checkStrapFit`），界面不加任何规则。
   */
  private lightestNoteText(): string {
    const lightest = lightestStrapFor(this.profile);
    if (!lightest) return '目录里没有任何一条能通过尺寸判定的带体。';
    const fit = checkStrapFit(this.profile, lightest.selection);
    const material = STRAP_MATERIAL_OPTIONS.find((m) => m.id === lightest.selection.materialId)?.label ?? '';
    const size = STRAP_SIZE_OPTIONS.find((s) => s.id === lightest.selection.sizeId)?.label ?? '';
    const grade = STRAP_GRADE_OPTIONS.find((g) => g.id === lightest.selection.gradeId)?.label ?? '';
    const tail = fit.ok
      ? `在预算 ${fit.budgetG} g 之内`
      : `仍超预算 ${fit.overByG ?? '—'} g（预算 ${fit.budgetG} g）`;
    return `目录里这只${this.vocab.speciesNoun}戴得上的最轻一条：${size} · ${material} · ${grade}，合计 ${lightest.totalWeightG} g，${tail}。`;
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
    /** 「我的」页（原「档案」页）的选项数量与当前选中值（用于验证下拉真的可选、且选项齐全） */
    profileOptions: { breeds: number; ages: number; selectedBreed: string; selectedAge: string };
    /**
     * 「我的」页的事实：当前子视图、四个条目、以及三个子视图各自推出来的值。
     *
     * 为什么放进自检：这一轮新增的三个子视图都是**推导量**（电量来自演示时钟、位置来自行为
     * 时间线、商城来自 core 的目录与预算规则）。不把它们落成可断言的文本，
     * "曲线真的在动 / 位置真的跟着场景走 / 超预算真的写出了理由"就只能靠肉眼。
     */
    mine: {
      sub: MineSubView;
      entries: number;
      batteryPct: number;
      batteryCharging: boolean;
      /** 定位：当前锚点 id 与"本会话到过几个位置" */
      locationAnchorId: string;
      locationVisited: number;
      /** 商城：当前选择与判定结果 */
      shop: {
        materialId: string;
        sizeId: string;
        gradeId: string;
        strapWeightG: number | null;
        totalWeightG: number | null;
        budgetG: number;
        ok: boolean;
        reasons: number;
      };
    };
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
    // 「我的」页的三个推导值：与子视图用的是同一批纯函数/同一份时间线，因此自检读到的东西
    // 就是屏上显示的东西（不另算一遍，也就不会算出第二个答案）。
    const tS = this.demoSeconds();
    const battery = this.batteryOf(tS);
    const here = this.locationOf(tS);
    const shopSelection = this.shopSelection;
    const shopFit = shopSelection ? checkStrapFit(this.profile, shopSelection) : null;
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
      mine: {
        sub: this.mineSub,
        entries: this.body.querySelectorAll('.app-entry').length,
        batteryPct: Number(battery.pct.toFixed(1)),
        batteryCharging: battery.charging,
        locationAnchorId: here.anchorId ?? 'none',
        locationVisited: here.visited.length,
        shop: {
          materialId: shopSelection?.materialId ?? 'none',
          sizeId: shopSelection?.sizeId ?? 'none',
          gradeId: shopSelection?.gradeId ?? 'none',
          strapWeightG: shopFit?.strapWeightG ?? null,
          totalWeightG: shopFit?.totalWeightG ?? null,
          budgetG: shopFit?.budgetG ?? 0,
          ok: shopFit?.ok ?? false,
          reasons: shopFit?.reasons.length ?? 0,
        },
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

/**
 * 当前锚点已经连续停留了多久（秒）。
 *
 * 做法：先找到"此刻所在的段"（最后一个起点不晚于 `tS` 的段），再从它往前累加，
 * 直到锚点变了为止。这是**推导**，不是测量——它和「定位」一样，答案完全由行为时间线决定，
 * 因此同一个演示时刻永远得到同一个数。
 */
function anchorStayS(anchorId: string, segments: readonly AppBehaviorSegment[], tS: number): number {
  let last = -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg && seg.t <= tS) {
      last = i;
      break;
    }
  }
  if (last < 0) return 0;
  let stay = 0;
  for (let i = last; i >= 0; i--) {
    const seg = segments[i];
    if (!seg || seg.anchorId !== anchorId) break;
    // 当前段还没走完，只算到此刻为止
    stay += Math.min(seg.t + seg.durS, tS) - seg.t;
  }
  return Math.max(0, stay);
}

/** 秒 → 「x 秒 / x 分 / x 小时 y 分」。只用于展示时长，不做任何换算宣称。 */
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分`;
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}

/** 选项的 `title`：把证据来源与说明挂在芯片上（悬停可见，读屏也能读到）。 */
function evidenceTitle(source?: string, note?: string): string {
  return [source, note].filter((x): x is string => Boolean(x)).join(' — ');
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
