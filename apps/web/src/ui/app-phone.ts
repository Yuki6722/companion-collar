/**
 * App 模拟视图：右侧边栏里的 iPhone 机模。
 *
 * 为什么要把 App 放进 3D 场景页：本项目的产品形态是**主人手机上的 App**，
 * 而 3D 房间只是"数据从哪来"的说明。把 App 放在旁边、并且**实时**跟着场景时钟走，
 * 观众才能同时看到两件事：猫在做什么、以及主人手机上此刻显示什么。
 *
 * 三条纪律：
 *   1. **同一时刻**：所有读数都按场景演示时刻 `timeS` 去查仿真会话，不另起一套时钟；
 *   2. **读数带有效性**：无效窗口划线展示并给出原因，不把坏值当读数；
 *   3. **词汇来自 core**：活动名、事件名、突发名、边界句都从 `@camp/core` 取，
 *      本文件不新写一套面向用户的措辞。
 *
 * 性能：场景每帧都会推状态，这里按 ~2 Hz 节流更新 DOM（stage2 §6.6 的教训：
 * 节流必须落在消费方，而运行时该逐帧推）。
 */
import {
  CAT_ANCHOR_LABELS,
  CONDITION_LABELS,
  INCIDENT_DEFS,
  VALIDITY_LABELS,
  VITALS_BOUNDARY_NOTE,
  VITALS_SIM_NOTE,
  VITAL_LABELS,
  VITAL_UNITS,
  ageBandOf,
  collarBudgetOf,
  detectDrifts,
  evaluateVitalAlerts,
  highlightedChannels,
  rawReadingOf,
  readingOf,
  simEventLabel,
  sizeClassOf,
} from '@camp/core';
import type {
  PetProfile,
  ReadingValidity,
  Sample,
  Session,
  SimEventKind,
  VitalAlertSummary,
  VitalKey,
} from '@camp/core';
import { el } from './dom.ts';
import type { BehaviorStatus } from '../scene/cat/cat-behavior.ts';

type AppTab = 'live' | 'events' | 'drift' | 'profile';

const TABS: ReadonlyArray<{ id: AppTab; label: string }> = [
  { id: 'live', label: '实时' },
  { id: 'events', label: '事件流' },
  { id: 'drift', label: '漂移' },
  { id: 'profile', label: '档案' },
];

/** 事件流里最多展示多少条（手机屏幕小，滚动太长没有意义）。 */
const MAX_EVENT_ROWS = 40;

export interface AppPhoneOptions {
  profile: PetProfile;
  session: Session;
  /** 初始是否收起（窄屏默认收起，见 `home.ts`） */
  collapsed?: boolean;
}

export class AppPhone {
  readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly alertHost: HTMLElement;
  private readonly tabsHost: HTMLElement;
  private readonly clockEl: HTMLElement;
  private readonly collapseButton: HTMLButtonElement;
  private readonly screenEl: HTMLElement;

  private session: Session;
  private readonly profile: PetProfile;
  private tab: AppTab = 'live';
  private collapsed: boolean;
  /** 场景最近一次推来的状态与它对应的采样下标 */
  private status: { status: BehaviorStatus; index: number } | null = null;
  /** 最近一次提示评估结果（渲染与自检都用它） */
  private alert: VitalAlertSummary | null = null;
  /**
   * 已经弹过的那条提醒的"指纹"。
   *
   * 为什么需要它：评估每 0.5 秒跑一次，一次 30 秒的发作会产生几十次 `shouldNotify`。
   * 不去重的话弹窗会不停重建（看起来像闪烁），用户刚点掉又弹出来。
   * 指纹带**分钟桶**，因此持续发作每分钟最多弹一次，而不是每帧一次。
   */
  private alertFingerprint: string | null = null;
  /** 上一次真正重绘 DOM 的时间（毫秒，真实时间） */
  private lastRenderMs = 0;
  private lastClockText = '';

  constructor(opts: AppPhoneOptions) {
    this.profile = opts.profile;
    this.session = opts.session;
    this.collapsed = opts.collapsed ?? false;

    this.clockEl = el('span', { class: 'phone-clock', text: '--:--' });
    this.collapseButton = el('button', {
      class: 'app-dock-toggle',
      type: 'button',
      text: '收起',
      title: '收起 / 展开 App 预览',
      on: { click: () => this.setCollapsed(!this.collapsed) },
    });

    this.tabsHost = el('nav', { class: 'app-tabs', attrs: { 'aria-label': 'App 页面切换' } });
    for (const t of TABS) {
      const button = el('button', {
        class: 'app-tab',
        type: 'button',
        text: t.label,
        attrs: { 'aria-pressed': 'false' },
        on: {
          click: () => {
            this.tab = t.id;
            this.renderTabs();
            this.renderBody(0);
          },
        },
      });
      this.tabsHost.append(button);
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

    const phone = el('div', { class: 'phone' }, [
      el('div', { class: 'phone-notch' }),
      this.screenEl,
    ]);

    this.root = el('aside', { class: 'app-dock' }, [
      el('div', { class: 'app-dock-head' }, [
        el('span', { class: 'app-dock-title', text: 'App 预览（iPhone）' }),
        this.collapseButton,
      ]),
      phone,
    ]);

    this.setCollapsed(this.collapsed);
    this.renderTabs();
    this.renderBody(0);
  }

  /** 换会话（注入突发后会重建会话，读数必须跟着换）。 */
  setSession(session: Session, collapsed?: boolean): void {
    this.session = session;
    if (collapsed !== undefined) this.setCollapsed(collapsed);
    this.renderBody(0);
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
  }

  currentTab(): AppTab {
    return this.tab;
  }

  /** 切页签（也供自检动作使用：`live` / `events` / `drift` / `profile`）。 */
  selectTab(tab: string): void {
    if (!TABS.some((t) => t.id === tab)) return;
    this.tab = tab as AppTab;
    this.renderTabs();
    this.renderBody(0);
  }

  /** 自检用：手机屏上此刻显示的核心事实。 */
  snapshot(): {
    collapsed: boolean;
    tab: AppTab;
    hourOfDay: number;
    readings: Record<string, { value: number | null; validity: ReadingValidity | null }>;
    eventRows: number;
    /** 提示层事实：是否该弹、弹过没有、哪几路标红 */
    alert: { notify: boolean; red: string[]; popup: boolean; acute: boolean; reasons: number };
  } {
    const { status, index } = this.status ?? { status: null, index: -1 };
    const readings: Record<string, { value: number | null; validity: ReadingValidity | null }> = {};
    for (const key of ['hr', 'rr', 'temp'] as const) {
      const sample = index >= 0 ? this.session.samples[index] : undefined;
      readings[key] = sample
        ? { value: readingOf(sample, key), validity: sample.readingQuality?.[key]?.validity ?? null }
        : { value: null, validity: null };
    }
    return {
      collapsed: this.collapsed,
      tab: this.tab,
      hourOfDay: status?.hourOfDay ?? 0,
      readings,
      eventRows: this.body.querySelectorAll('.app-event-row').length,
      alert: {
        notify: this.alert?.shouldNotify ?? false,
        red: this.alert ? highlightedChannels(this.alert).map(String) : [],
        popup: this.alertHost.querySelector('.app-alert') !== null,
        acute: this.alert?.acuteWindow ?? false,
        reasons: this.alert?.details.length ?? 0,
      },
    };
  }

  /**
   * 场景每帧调用。节流在这里（消费方），而不是在场景里。
   */
  update(status: BehaviorStatus): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const index = this.sampleIndexAt(status.timeS);
    this.status = { status, index };

    // 提示评估**与页签无关**：主人在事件流页也该收到提醒。
    this.evaluateAlert(index, status.timeS);

    if (now - this.lastRenderMs < 500) {
      // 时钟走字比整屏重绘便宜，单独更新它，让"在动"这件事始终可见
      this.updateClock(status);
      return;
    }
    this.lastRenderMs = now;
    this.updateClock(status);
    this.renderBody(status.timeS);
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

  /** 弹窗：标题是产品口径，正文只列可核查的事实，边界与转诊路径必须一起出现。 */
  private showAlertPopup(alert: VitalAlertSummary): void {
    const accept = el('button', {
      class: 'app-alert-accept',
      type: 'button',
      text: '知道了',
      on: { click: () => this.alertHost.replaceChildren() },
    });
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
        el('p', { class: 'app-alert-boundary', text: alert.boundary }),
        el('p', { class: 'app-alert-referral', text: alert.referral }),
        accept,
      ]),
    );
  }

  private updateClock(status: BehaviorStatus): void {
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

  private renderTabs(): void {
    const buttons = this.tabsHost.querySelectorAll('.app-tab');
    buttons.forEach((node, i) => {
      const id = TABS[i]?.id;
      const active = id === this.tab;
      node.classList.toggle('app-tab-active', active);
      node.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  private renderBody(_tS: number): void {
    this.body.replaceChildren();
    switch (this.tab) {
      case 'live':
        this.renderLive();
        break;
      case 'events':
        this.renderEvents();
        break;
      case 'drift':
        this.renderDrift();
        break;
      case 'profile':
        this.renderProfile();
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- 实时

  private renderLive(): void {
    const { status, index } = this.status ?? { status: null, index: -1 };
    const samples = this.session.samples;
    const sample = index >= 0 ? (samples[index] as Sample) : undefined;

    this.body.append(
      el('div', { class: 'app-card app-now' }, [
        el('span', { class: 'app-card-label', text: '它现在' }),
        el('span', {
          class: 'app-now-value',
          text: status ? `${status.activityLabel} · ${status.postureLabel}` : '等待场景…',
        }),
        el('span', {
          class: 'app-now-where',
          text: status
            ? `${CAT_ANCHOR_LABELS[status.anchorId] ?? status.anchorLabel}${status.incident ? ` · 突发演示：${INCIDENT_DEFS[status.incident]?.label ?? status.incident}` : ''}`
            : '',
        }),
      ]),
    );

    // 处于急性生理窗口时，把"现在处于什么过程"直接说出来——
    // 这比让主人从三个数字里猜要诚实的多。
    if (sample?.physiologyState && sample.physiologyState !== 'idle') {
      this.body.append(
        el('div', { class: 'app-card app-acute' }, [
          el('span', { class: 'app-card-label', text: '生理过程' }),
          el('span', { class: 'app-card-value', text: describePhysiologyState(sample.physiologyState) }),
        ]),
      );
    }

    for (const key of ['hr', 'rr', 'temp'] as const) {
      this.body.append(this.vitalRow(key, sample));
    }

    // 逐通道给出"为什么被标出来"，这样红色不是没有解释的装饰。
    const flagged = this.alert?.channels.filter((c) => c.highlight || c.level === 'watch') ?? [];
    if (flagged.length > 0) {
      const list = el('ul', { class: 'app-alert-details' });
      for (const c of flagged) list.append(el('li', { text: c.reason }));
      this.body.append(el('div', { class: 'app-card' }, [el('span', { class: 'app-card-label', text: '读数说明' }), list]));
    }

    if (status) {
      this.body.append(
        el('p', {
          class: 'app-note',
          text: `读数按演示时刻 ${this.lastClockText} 从仿真会话取值；演示倍率 20×（1 秒当 20 秒）。`,
        }),
      );
    }
    this.body.append(el('p', { class: 'app-note app-note-boundary', text: VITALS_BOUNDARY_NOTE }));
  }

  private vitalRow(key: VitalKey, sample: Sample | undefined): HTMLElement {
    const q = sample?.readingQuality?.[key];
    const valid = sample ? readingOf(sample, key) : null;
    const raw = sample ? rawReadingOf(sample, key) : null;
    const shown = valid ?? raw;
    const invalid = valid === null;
    const condition = sample?.measurementCondition ?? 'resting';
    const channelAlert = this.alert?.channels.find((c) => c.key === key);
    const red = channelAlert?.level === 'alert' || channelAlert?.highlight === true;

    // 标记文案：无效窗口说清是哪种失效；有效窗口只说条件（诊室单独标出来，
    // 因为"诊室读数不能当基线"这件事必须一眼可见）。
    const flagText = !q
      ? '无数据'
      : invalid
        ? (VALIDITY_LABELS[q.validity].split('：')[0] ?? '不可用')
        : condition === 'clinic'
          ? '诊室'
          : channelAlert?.level === 'watch'
            ? '留意'
            : '可用';

    return el('div', { class: red ? 'app-vital app-vital-alert' : 'app-vital' }, [
      el('span', { class: 'app-vital-name', text: VITAL_LABELS[key] }),
      el('span', {
        class: red
          ? 'app-vital-value app-vital-value-alert'
          : invalid
            ? 'app-vital-value app-vital-invalid'
            : 'app-vital-value',
        text: shown === null ? '—' : shown.toFixed(key === 'temp' ? 1 : 0),
      }),
      el('span', { class: 'app-vital-unit', text: VITAL_UNITS[key] }),
      el('span', {
        class: q ? `app-vital-flag app-flag-${q.validity}` : 'app-vital-flag',
        text: flagText,
        title: q
          ? `${VALIDITY_LABELS[q.validity]}；测量条件：${CONDITION_LABELS[condition]}`
          : '本窗口没有该通道的读数',
      }),
    ]);
  }

  // ---------------------------------------------------------------- 事件流

  private renderEvents(): void {
    const { status } = this.status ?? { status: null };
    const events = this.session.events;
    const tNow = status?.timeS ?? 0;

    // 先给一句"你不在时发生了什么"的汇总——这是产品的主叙事。
    const counts = new Map<SimEventKind, number>();
    for (const ev of events) counts.set(ev.kind, (counts.get(ev.kind) ?? 0) + 1);
    const summary = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${simEventLabel(k)} ${v}`)
      .join(' · ');

    this.body.append(
      el('div', { class: 'app-card' }, [
        el('span', { class: 'app-card-label', text: '离线时段事件汇总' }),
        el('span', { class: 'app-card-value', text: summary || '（本段无事件）' }),
      ]),
    );

    const rows = events
      .filter((ev) => ev.t <= tNow)
      .slice(-MAX_EVENT_ROWS)
      .reverse();
    const list = el('div', { class: 'app-list' });
    for (const ev of rows) {
      list.append(
        el('div', { class: 'app-event-row' }, [
          el('span', { class: 'app-event-time', text: clockOf(ev.t) }),
          el('span', { class: 'app-event-name', text: simEventLabel(ev.kind) }),
          el('span', {
            class: 'app-event-mag',
            text: ev.kind === 'elimination-outside-box' || ev.kind === 'hiding' ? '' : `强度 ${ev.magnitude.toFixed(1)}`,
          }),
        ]),
      );
    }
    this.body.append(list);
    this.body.append(
      el('p', {
        class: 'app-note',
        text: '事件只描述"发生了一次什么"，不判断原因。抓挠、甩头、发声都属于这类事件。',
      }),
    );
  }

  // ---------------------------------------------------------------- 漂移

  private renderDrift(): void {
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
        { key: 'hr', label: '心率', unit: '次/分', baseline: pick('hrBpm', 0, half), recent: pick('hrBpm', half, samples.length) },
        { key: 'rr', label: '呼吸频率', unit: '次/分', baseline: pick('rrBpm', 0, half), recent: pick('rrBpm', half, samples.length) },
        { key: 'activity', label: '活动量', baseline: pick('activity', 0, half), recent: pick('activity', half, samples.length) },
        { key: 'vocalization', label: '发声次数', baseline: pick('vocalization', 0, half), recent: pick('vocalization', half, samples.length) },
      ],
      { permutations: 200 },
    );

    if (drift.length === 0) {
      this.body.append(el('p', { class: 'app-note', text: '数据不足，暂不给出漂移判断。' }));
      return;
    }

    for (const d of drift) {
      const tone = d.severity === 'notable' ? 'notable' : d.severity === 'watch' ? 'watch' : 'none';
      this.body.append(
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
    this.body.append(
      el('p', {
        class: 'app-note',
        text: '漂移只描述"相对这只猫自己前半段基线"的变化，不判断原因，也不区分正常波动与异常。',
      }),
    );
  }

  // ---------------------------------------------------------------- 档案

  private renderProfile(): void {
    const p = this.profile;
    const budget = collarBudgetOf(p);
    const rows: Array<[string, string]> = [
      ['物种 / 品种', `${p.species === 'cat' ? '猫' : '犬'} · ${p.breedId}`],
      ['年龄段', ageBandOf(p.ageMonths)],
      ['体型档', sizeClassOf(p.species, p.weightKg)],
      ['体重 / 肩高', `${p.weightKg} kg / ${p.heightCm} cm`],
      ['项圈重量预算', `${budget.maxWeightG} g（体重 2%，工程经验值）`],
    ];
    const list = el('div', { class: 'app-list' });
    for (const [k, v] of rows) {
      list.append(
        el('div', { class: 'app-kv' }, [
          el('span', { class: 'app-kv-key', text: k }),
          el('span', { class: 'app-kv-value', text: v }),
        ]),
      );
    }
    this.body.append(list);
    this.body.append(
      el('p', {
        class: 'app-note',
        text: '档案驱动的是"这只猫自己的基线"，不是种群平均值——跨猫比较会被年龄与体型主导。',
      }),
    );
    this.body.append(el('p', { class: 'app-note app-note-boundary', text: VITALS_SIM_NOTE }));
  }
}

/** 会话内秒 → 手机上的钟点（会话起点 09:00，与 `DAY_START_HOUR` 一致）。 */
function clockOf(tS: number): string {
  const hour = (9 + tS / 3600) % 24;
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
