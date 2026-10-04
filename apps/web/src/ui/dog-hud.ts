/**
 * 狗版场景的 HUD：柴犬的行为、场景清单、机位、图层与画质、加载进度、降级提示。
 *
 * 左栏的主线是**「这只柴犬在做什么」**：自主行为的一行实时状态 + 两个手动突发按钮。
 * 场景清单在它下面（折叠），因为"这个场景里有什么"是背景信息，
 * 而"它现在在做什么"才是演示时一直要看的东西。
 *
 * 措辞纪律：突发演示按钮只描述**动作**，不命名任何状况、不构成任何判断。
 * 文案来自 `@camp/core` 的 `DOG_INCIDENT_BOUNDARY_NOTE` / `DOG_INCIDENT_REFERRAL_NOTE`，
 * 本文件不得改写掉它们（见 `docs/design/02-evidence-policy.md`）。
 */
import { DOG_ACTIVITY_DEFS, DOG_INCIDENT_BOUNDARY_NOTE, DOG_INCIDENT_DEFS, DOG_INCIDENT_KINDS, DOG_INCIDENT_REFERRAL_NOTE } from '@camp/core';
import type { DogIncidentKind } from '@camp/core';
import { DOG_MANUAL_ACTIVITY_IDS } from '../scene/dog/dog-behavior.ts';
import type { DogBehaviorStatus, DogManualActivityId } from '../scene/dog/dog-behavior.ts';
import type { AssetReport } from '../scene/assets.ts';
import type { DogSceneStats } from '../scene/dog-scene.ts';
import { PROGRAM } from '../scene/dog/layout-dog.ts';
import type { QualityChoice } from '../scene/quality.ts';
import { el } from './dom.ts';

export interface DogPresetSpec {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  hint?: string;
}

export interface DogHudCallbacks {
  onPreset: (preset: DogPresetSpec) => void;
  onLabels: (on: boolean) => void;
  onHighlights: (on: boolean) => void;
  /** 整块院子的显隐 */
  onGarden: (on: boolean) => void;
  /** 朝院子的那面外墙皮（关掉 = 娃娃屋剖视） */
  onFacade: (on: boolean) => void;
  onQuality: (choice: QualityChoice) => void;
  /** 恢复自主行为 */
  onResumeBehavior: () => void;
  /** 暂停自主行为（柴犬停在原地） */
  onPauseBehavior: () => void;
  /** 触发一次突发演示 */
  onIncident: (kind: DogIncidentKind) => void;
  /** 手动触发一次院子里的活动：**走过去、然后做这件事**（与"原地发生"的突发区分开） */
  onActivity: (activity: DogManualActivityId) => void;
  /** 项圈硬件的显隐 */
  onCollar: (on: boolean) => void;
}

export interface DogHudInitial {
  labels?: boolean;
  highlights?: boolean;
  garden?: boolean;
  facade?: boolean;
  collar?: boolean;
}

/** 清单分组的中文标题。 */
const GROUP_TITLES: Readonly<Record<string, string>> = {
  room: '房间（人类生活用品）',
  dog: '狗的用品',
  yard: '院子',
};

export class DogHud {
  readonly root: HTMLElement;
  readonly canvasHost: HTMLElement;
  readonly labelHost: HTMLElement;
  readonly loading: HTMLElement;
  private readonly progressBar: HTMLElement;
  private readonly progressText: HTMLElement;
  private readonly presetHost: HTMLElement;
  private readonly presetIds: string[] = [];
  private readonly statsLine: HTMLElement;
  private readonly structureLine: HTMLElement;
  private readonly issues: HTMLElement;
  private readonly fatal: HTMLElement;
  private readonly callbacks: DogHudCallbacks;
  private readonly behaviorLine: HTMLElement;
  private readonly incidentLine: HTMLElement;
  private readonly activityLine: HTMLElement;
  private readonly modeButtons = new Map<'auto' | 'paused', HTMLButtonElement>();

  constructor(callbacks: DogHudCallbacks, initial: DogHudInitial = {}) {
    this.callbacks = callbacks;

    this.canvasHost = el('div', { class: 'scene-host' });
    this.labelHost = el('div', { class: 'hotspot-layer' });
    this.canvasHost.append(this.labelHost);

    // ---- 柴犬的行为：自主 / 暂停
    this.behaviorLine = el('p', { class: 'state-hint behavior-line', text: '自主行为：准备中…' });

    const modeRow = el('div', { class: 'state-row' });
    for (const [key, label] of [
      ['auto', '自主行为'],
      ['paused', '暂停'],
    ] as const) {
      const button = el(
        'button',
        {
          class: 'state-btn',
          type: 'button',
          attrs: { 'aria-pressed': 'false' },
          on: {
            click: () =>
              key === 'auto' ? this.callbacks.onResumeBehavior() : this.callbacks.onPauseBehavior(),
          },
        },
        [el('span', { class: 'state-btn-label', text: label })],
      );
      this.modeButtons.set(key, button);
      modeRow.append(button);
    }

    // ---- 突发演示（只描述动作，不命名状况）
    const incidentRow = el('div', { class: 'state-row' });
    for (const kind of DOG_INCIDENT_KINDS) {
      const def = DOG_INCIDENT_DEFS[kind];
      incidentRow.append(
        el(
          'button',
          {
            class: 'state-btn incident-btn',
            type: 'button',
            title: def.hint,
            on: { click: () => this.callbacks.onIncident(kind) },
          },
          [el('span', { class: 'state-btn-label', text: def.label })],
        ),
      );
    }
    this.incidentLine = el('p', { class: 'state-hint', text: '尚未触发突发演示。' });

    /**
     * ---- 院子里的活动：**每个活动一个按钮**（玩水 / 草地打滚 / 刨地 / 晒太阳）。
     *
     * 为什么与突发那一组平级、而不是塞进同一个 `state-row`：两组按钮的**语义不一样** ——
     * 突发是"原地发生"（`incidentKind` 段完全不寻路，见 `dog-behavior.ts` 的 `startSegment`），
     * 这一组是"走过去、然后做这件事"（复用同一套导航与算路）。放在同一行里，
     * 用户没法从界面上看出这两种点击的差别；`title` 里也各写一句说明。
     *
     * 数据源是 core 的活动定义：按钮文字取 `label`、一句话说明取 `hint`，
     * **一个字的文案都不在这里另写**（`@camp/core` 是面向用户词表的单一事实来源）。
     */
    const activityRow = el('div', { class: 'state-row' });
    for (const id of DOG_MANUAL_ACTIVITY_IDS) {
      const def = DOG_ACTIVITY_DEFS[id];
      activityRow.append(
        el(
          'button',
          {
            class: 'state-btn activity-btn',
            type: 'button',
            title: `${def.hint}。点这里会让它先走到那个位置，再做这件事（不是原地发生）。`,
            on: { click: () => this.callbacks.onActivity(id) },
          },
          [el('span', { class: 'state-btn-label', text: def.label })],
        ),
      );
    }
    this.activityLine = el('p', { class: 'state-hint', text: '尚未手动触发院子里的活动。' });

    const dogPanel = el('section', { class: 'panel panel-cat' }, [
      el('h2', { class: 'panel-title', text: '柴犬的行为' }),
      modeRow,
      this.behaviorLine,
      el('h3', { class: 'panel-subtitle', text: '院子里的活动（手动触发）' }),
      activityRow,
      this.activityLine,
      el('h3', { class: 'panel-subtitle', text: '突发演示（手动触发）' }),
      incidentRow,
      this.incidentLine,
      el('p', { class: 'boundary-note', text: DOG_INCIDENT_BOUNDARY_NOTE }),
      el('p', { class: 'panel-foot', text: DOG_INCIDENT_REFERRAL_NOTE }),
    ]);

    // ---- 场景清单：背景信息，收在行为面板下面
    const byGroup = new Map<string, string[]>();
    for (const item of PROGRAM) {
      const list = byGroup.get(item.group) ?? [];
      list.push(item.label);
      byGroup.set(item.group, list);
    }
    const listBody = el('div', { class: 'panel-body' });
    for (const [group, labels] of byGroup) {
      listBody.append(el('h3', { class: 'panel-subtitle', text: GROUP_TITLES[group] ?? group }));
      const ul = el('ul', { class: 'dog-checklist' });
      for (const label of labels) ul.append(el('li', { text: label }));
      listBody.append(ul);
    }
    const listPanel = el('details', { class: 'panel panel-layers panel-fold' }, [
      el('summary', { class: 'panel-title', text: '场景清单' }),
      listBody,
    ]) as HTMLDetailsElement;
    listPanel.open = true;

    // ---- 机位
    this.presetHost = el('div', { class: 'preset-row' });
    const cameraPanel = el('section', { class: 'panel panel-camera' }, [
      el('h2', { class: 'panel-title', text: '机位' }),
      this.presetHost,
      el('p', {
        class: 'panel-foot',
        text: '拖动旋转、滚轮缩放、右键平移；机位按钮会平滑移动相机。',
      }),
    ]);

    // ---- 图层与画质
    const layersBody = el('div', { class: 'panel-body' }, [
      this.switchRow('显示标签', initial.labels ?? true, (on) => this.callbacks.onLabels(on)),
      this.switchRow('高亮狗的用品', initial.highlights ?? false, (on) => this.callbacks.onHighlights(on)),
      this.switchRow('显示院子', initial.garden ?? true, (on) => this.callbacks.onGarden(on)),
      // 默认**开**：用户要的是真实场景，而站在院子里看不到外墙就不成立。
      // 关掉它就是猫版那种「娃娃屋剖视」，用来俯视核对室内布置。
      this.switchRow('朝院子的外墙（关掉＝剖视）', initial.facade ?? true, (on) => this.callbacks.onFacade(on)),
      // 项圈默认可见：它是本项目的产品形态，不该需要额外参数才看得到
      this.switchRow('显示项圈', initial.collar ?? true, (on) => this.callbacks.onCollar(on)),
      this.qualityRow(),
      (this.statsLine = el('p', { class: 'stats-line', text: '统计：等待渲染…' })),
      (this.structureLine = el('p', { class: 'stats-line', text: '结构：等待建模…' })),
      (this.issues = el('p', { class: 'issue-line' })),
    ]);
    const layersPanel = el('details', { class: 'panel panel-layers panel-fold' }, [
      el('summary', { class: 'panel-title', text: '图层与画质' }),
      layersBody,
    ]) as HTMLDetailsElement;

    const panels = el('div', { class: 'hud-panels' }, [dogPanel, cameraPanel, listPanel, layersPanel]);

    this.progressBar = el('div', { class: 'progress-bar' });
    this.progressText = el('p', { class: 'progress-text', text: '正在准备场景…' });
    this.loading = el('div', { class: 'loading' }, [
      el('div', { class: 'loading-card' }, [
        el('h2', { class: 'panel-title', text: '正在搭建狗的生活场景' }),
        el('div', { class: 'progress-track' }, [this.progressBar]),
        this.progressText,
        el('p', {
          class: 'panel-foot',
          text: '房间、厨房、家具、狗的用品与整个院子都是程序化建模；CC0 扫描模型与贴图到货后替换占位件，断网也能看到完整场景。',
        }),
      ]),
    ]);

    this.fatal = el('div', { class: 'fatal', attrs: { hidden: 'hidden' } });

    this.root = el('div', { class: 'scene-screen' }, [this.canvasHost, panels, this.loading, this.fatal]);
  }

  addPreset(preset: DogPresetSpec): void {
    this.presetIds.push(preset.id);
    const button = el(
      'button',
      {
        class: 'preset-btn',
        type: 'button',
        title: preset.hint ?? preset.label,
        on: { click: () => this.callbacks.onPreset(preset) },
      },
      [el('span', { text: preset.label })],
    );
    this.presetHost.append(button);
  }

  /** 左栏机位按钮的 id 列表（自检用：能发现「该删的机位没删」）。 */
  presetIdList(): string[] {
    return [...this.presetIds];
  }

  /** 切换「自主行为 / 暂停」两个按钮的高亮。 */
  setBehaviorMode(mode: 'auto' | 'paused'): void {
    for (const [key, button] of this.modeButtons) {
      const active = key === mode;
      button.classList.toggle('state-btn-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    if (mode === 'paused') this.behaviorLine.textContent = '已暂停：柴犬停在原地。';
  }

  /** 自主行为的实时状态：当前活动、姿态、所在位置、演示时钟与段内进展。 */
  setBehaviorStatus(status: DogBehaviorStatus): void {
    const clock = formatClock(status.hourOfDay);
    const elapsed = Math.floor(status.segmentElapsedS);
    const where = status.moving ? `前往${status.anchorLabel}` : status.anchorLabel;
    this.behaviorLine.textContent =
      `自主行为 · ${clock} · ${status.activityLabel}（${status.poseId}）· ${where}` +
      ` · 本段 ${elapsed}s/${Math.round(status.segmentRealDurationS)}s`;
  }

  /** 突发演示的状态行。文案只描述动作，不命名任何状况。 */
  setIncidentStatus(kind: DogIncidentKind | null): void {
    if (!kind) {
      this.incidentLine.textContent = '尚未触发突发演示。';
      return;
    }
    const def = DOG_INCIDENT_DEFS[kind];
    this.incidentLine.textContent = `正在演示：${def.label} —— ${def.hint}`;
  }

  /**
   * 手动活动的状态行：**执行中**显示动作名与它长什么样，执行结束由
   * `screens/dog.ts` 的实时状态回调（`status.manual` 变回 false）清掉。
   *
   * 文案只用 core 的活动名与说明，不解释它此刻的处境或感受 ——
   * 这一栏回答的是"它在做什么动作"，与突发那一行同一条纪律。
   */
  setGoDoStatus(activity: DogManualActivityId | null): void {
    if (!activity) {
      this.activityLine.textContent = '尚未手动触发院子里的活动。';
      return;
    }
    const def = DOG_ACTIVITY_DEFS[activity];
    this.activityLine.textContent = `正在做：${def.label} —— ${def.hint}`;
  }

  setProgress(done: number, total: number, label: string): void {
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    this.progressBar.style.width = `${percent}%`;
    this.progressText.textContent = `${percent}%（${done}/${total}）· ${label}`;
  }

  finishLoading(): void {
    this.loading.classList.add('loading-done');
    window.setTimeout(() => {
      this.loading.setAttribute('hidden', 'hidden');
    }, 520);
  }

  setAssetReport(report: AssetReport): void {
    if (report.issues.length === 0) {
      this.issues.textContent = `资产：${report.loadedModels.length} 个扫描模型、${report.loadedTiles.length} 组平铺贴图${report.envLoaded ? '、环境光' : ''} 全部就位。`;
      return;
    }
    this.issues.textContent = `有 ${report.issues.length} 项资产未就位，已用程序化占位件顶上：${report.issues
      .map((i) => `${i.id}（${i.reason}）`)
      .join('；')}`;
  }

  setStats(stats: DogSceneStats): void {
    this.statsLine.textContent = `统计：${stats.fps} fps · ${(stats.triangles / 1000).toFixed(0)}k 三角面 · ${stats.drawCalls} 次绘制 · ${stats.models} 个扫描模型`;
  }

  /**
   * 各功能组的构件规模。
   *
   * 为什么显示它：这一屏的交付物是**场景本身**，「建模到底建了多少东西」
   * 是唯一能一眼核对的量化事实（截图之外的补充）。
   */
  setStructure(rows: Array<{ name: string; nodes: number; meshes: number }>): void {
    this.structureLine.textContent = `结构：${rows
      .filter((r) => r.nodes > 0)
      .map((r) => `${SHORT_NAME[r.name] ?? r.name} ${r.meshes}`)
      .join(' · ')}（网格数）`;
  }

  showFatal(message: string): void {
    this.fatal.removeAttribute('hidden');
    this.fatal.replaceChildren(
      el('div', { class: 'loading-card' }, [
        el('h2', { class: 'panel-title', text: '3D 场景无法启动' }),
        el('p', { class: 'panel-foot', text: message }),
        el('p', {
          class: 'panel-foot',
          text: '可以切到「工程自检」查看数据链路，或换用较新版本的 Chrome / Safari。',
        }),
      ]),
    );
  }

  private switchRow(label: string, initial: boolean, onChange: (on: boolean) => void): HTMLElement {
    const input = el('input', { class: 'switch-input', type: 'checkbox' });
    input.checked = initial;
    input.addEventListener('change', () => onChange(input.checked));
    return el('label', { class: 'switch-row' }, [input, el('span', { text: label })]);
  }

  private qualityRow(): HTMLElement {
    const select = el('select', { class: 'quality-select' });
    for (const [value, label] of [
      ['auto', '自动'],
      ['high', '高'],
      ['medium', '中'],
      ['low', '低'],
    ] as const) {
      const option = el('option', { text: label });
      option.value = value;
      select.append(option);
    }
    select.addEventListener('change', () => this.callbacks.onQuality(select.value as QualityChoice));
    return el('label', { class: 'switch-row' }, [el('span', { text: '画质' }), select]);
  }
}

/** 结构行的短名：完整节点名太长，左栏放不下。 */
const SHORT_NAME: Readonly<Record<string, string>> = {
  'dog-room-shell': '房间',
  'garden-facade': '外墙',
  engawa: '木平台',
  'dog-kitchen': '厨房',
  'dog-furniture': '家具',
  'dog-gear': '狗用品',
  'dog-yard': '院子',
  shiba: '柴犬',
};

/** 演示时钟：把当日小时数格式化成 `HH:MM`。 */
function formatClock(hourOfDay: number): string {
  const h = ((hourOfDay % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
