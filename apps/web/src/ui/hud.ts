/**
 * 场景 HUD：猫的行为（自主 / 手动 / 突发演示）、机位、图层与画质、加载进度、降级提示。
 *
 * 边界纪律（三条，都会出现在界面上）：
 *   1. 猫的两种状态是**手动演示档位**，不是系统推断——文案由 `BOUNDARY_NOTE` 提供，不得改写掉。
 *   2. 突发演示是**你手动触发的动画**，不命名任何状况、不构成诊断——文案由
 *      `INCIDENT_BOUNDARY_NOTE` 与 `INCIDENT_REFERRAL_NOTE` 提供，不得改写掉。
 *   3. 居家资源清单**不在这一层**：它是独立报告，见 `#/resources` 页（`ui/resource-list.ts`）。
 *      放在场景右栏时，它会把「猫在做什么」和「App 预览」都挤掉。
 */
import { INCIDENT_BOUNDARY_NOTE, INCIDENT_DEFS, INCIDENT_REFERRAL_NOTE } from '@camp/core';
import type { CatIncidentKind } from '@camp/core';
import type { AssetReport } from '../scene/assets.ts';
import type { BehaviorStatus } from '../scene/cat/cat-behavior.ts';
import type { CatStateId } from '../scene/cat/cat-states.ts';
import { CAT_STATES, BOUNDARY_NOTE } from '../scene/cat/cat-states.ts';
import type { QualityChoice } from '../scene/quality.ts';
import type { SceneStats } from '../scene/scene.ts';
import { el } from './dom.ts';

export interface PresetSpec {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  /** 该机位的说明（例如「按档案肩高推导」） */
  hint?: string;
  /** true 表示坐标由调用方给定（不落到场景的预设表里） */
  custom?: boolean;
}

/**
 * 左栏「突发演示」里可手动触发的动作。
 *
 * 只留两个：**抽搐**与**呕吐**——它们是"动作 + 多时相生理过程"都完整建模的两个，
 * 也是 App 端读数变化与提示演示最需要的两个。
 * 其余三种仍在 `core` 的 `INCIDENT_DEFS` 里，可用 `?incident=` 触发，只是不占左栏。
 */
export const MANUAL_INCIDENT_KINDS: readonly CatIncidentKind[] = ['seizure', 'vomit'];

export interface HudCallbacks {
  onCatState: (id: CatStateId) => void;
  onPreset: (preset: PresetSpec) => void;
  onLabels: (on: boolean) => void;
  /** 猫头顶状态标签的显隐（与资源标签分开） */
  onStatusLabel: (on: boolean) => void;
  onHighlights: (on: boolean) => void;
  onQuality: (choice: QualityChoice) => void;
  /** 切到自主行为 */
  onAutoCat: () => void;
  /** 切回手动演示档位 */
  onManualCat: () => void;
  /** 触发一次突发演示 */
  onIncident: (kind: CatIncidentKind) => void;
  /** 项圈硬件的显隐（第三阶段：形态方案可视化） */
  onCollar: (on: boolean) => void;
  /** 触须无干涉区的显隐 */
  onWhiskerZone: (on: boolean) => void;
}

export class Hud {
  readonly root: HTMLElement;
  readonly canvasHost: HTMLElement;
  readonly labelHost: HTMLElement;
  readonly loading: HTMLElement;
  private readonly progressBar: HTMLElement;
  private readonly progressText: HTMLElement;
  private readonly stateButtons = new Map<CatStateId, HTMLButtonElement>();
  private readonly hint: HTMLElement;
  private readonly statsLine: HTMLElement;
  private readonly issues: HTMLElement;
  private readonly fatal: HTMLElement;
  private readonly presetHost: HTMLElement;
  private readonly callbacks: HudCallbacks;
  private readonly modeButtons = new Map<'auto' | 'manual', HTMLButtonElement>();
  private readonly behaviorLine: HTMLElement;
  private readonly incidentLine: HTMLElement;

  constructor(
    callbacks: HudCallbacks,
    initial: {
      labels?: boolean;
      highlights?: boolean;
      status?: boolean;
      collar?: boolean;
      whiskerZone?: boolean;
    } = {},
  ) {
    this.callbacks = callbacks;

    this.canvasHost = el('div', { class: 'scene-host' });
    this.labelHost = el('div', { class: 'hotspot-layer' });
    this.canvasHost.append(this.labelHost);

    // ---- 猫的行为：自主 / 手动 / 突发演示
    this.behaviorLine = el('p', { class: 'state-hint behavior-line', text: '自主行为：准备中…' });

    const modeRow = el('div', { class: 'state-row' });
    for (const [key, label] of [
      ['auto', '自主行为'],
      ['manual', '手动演示'],
    ] as const) {
      const button = el(
        'button',
        {
          class: 'state-btn',
          type: 'button',
          attrs: { 'aria-pressed': 'false' },
          on: { click: () => (key === 'auto' ? this.callbacks.onAutoCat() : this.callbacks.onManualCat()) },
        },
        [el('span', { class: 'state-btn-label', text: label })],
      );
      this.modeButtons.set(key, button);
      modeRow.append(button);
    }

    this.stateButtons.clear();
    const stateRow = el('div', { class: 'state-row' });
    for (const id of ['calm', 'agitated'] as CatStateId[]) {
      const def = CAT_STATES[id];
      const button = el(
        'button',
        {
          class: 'state-btn',
          type: 'button',
          attrs: { 'aria-pressed': 'false' },
          on: { click: () => this.callbacks.onCatState(id) },
        },
        [el('span', { class: 'state-btn-label', text: def.label })],
      );
      this.stateButtons.set(id, button);
      stateRow.append(button);
    }
    this.hint = el('p', { class: 'state-hint' });

    // ---- 突发演示
    //
    // 左栏只保留两个按钮：**抽搐**与**呕吐**。它们是两个"动作 + 生理过程"都完整建模的突发
    // （见 `docs/design/06-physiology-state-program.md`），也是 App 端提示演示最需要的两个。
    // 其余三种（呼吸急促 / 僵直不动 / 躲藏退避）仍在 `core` 的词汇表里，
    // 可以用 `?incident=labored-breathing` 触发，只是不再占用左栏。
    const incidentRow = el('div', { class: 'state-row' });
    for (const kind of MANUAL_INCIDENT_KINDS) {
      const def = INCIDENT_DEFS[kind];
      const button = el(
        'button',
        {
          class: 'state-btn incident-btn',
          type: 'button',
          title: def.hint,
          on: { click: () => this.callbacks.onIncident(kind) },
        },
        [el('span', { class: 'state-btn-label', text: def.label })],
      );
      incidentRow.append(button);
    }
    this.incidentLine = el('p', { class: 'state-hint', text: '尚未触发突发演示。' });

    const catPanel = el('section', { class: 'panel panel-cat' }, [
      el('h2', { class: 'panel-title', text: '喵喵的行为' }),
      el('p', { class: 'state-hint' }, [
        el('a', { text: '模型与动作检查', attrs: { href: './cat-studio.html' } }),
        document.createTextNode(' · '),
        el('a', { text: '模型来源', attrs: { href: './assets/models/CREDITS-CATS.md', target: '_blank', rel: 'noopener' } }),
      ]),
      modeRow,
      this.behaviorLine,
      el('h3', { class: 'panel-subtitle', text: '手动演示档位' }),
      stateRow,
      this.hint,
      el('p', { class: 'boundary-note', text: BOUNDARY_NOTE }),
      el('h3', { class: 'panel-subtitle', text: '突发演示（手动触发）' }),
      incidentRow,
      this.incidentLine,
      el('p', { class: 'boundary-note', text: INCIDENT_BOUNDARY_NOTE }),
      el('p', { class: 'panel-foot', text: INCIDENT_REFERRAL_NOTE }),
    ]);

    // ---- 机位
    this.presetHost = el('div', { class: 'preset-row' });
    const cameraPanel = el('section', { class: 'panel panel-camera' }, [
      el('h2', { class: 'panel-title', text: '机位' }),
      this.presetHost,
      el('p', {
        class: 'panel-foot',
        text: '拖动旋转、双指缩放；机位按钮会平滑移动相机。',
      }),
    ]);

    // ---- 图层与画质
    //
    // 为什么折叠起来：这些是**看房间时的调节项**，不是主线信息。
    // 原来五六个开关 + 统计行常驻左栏，把「猫在做什么」挤到了下面——
    // 演示时最常被用到的只有前两个，其余收进 details，需要时再展开。
    // 工程信息（三角面数、资产问题）也一并收进来，它们属于「排查」而不是「观看」。
    const layersBody = el('div', { class: 'panel-body' }, [
      this.switchRow('显示资源标签', initial.labels ?? true, (on) => this.callbacks.onLabels(on)),
      this.switchRow('显示猫头顶的状态', initial.status ?? true, (on) =>
        this.callbacks.onStatusLabel(on),
      ),
      this.switchRow('高亮猫的关键资源', initial.highlights ?? false, (on) =>
        this.callbacks.onHighlights(on),
      ),
      // 项圈硬件默认**开**（它就是产品形态：猫脖子上那个带传感器的项圈）；
      // 无干涉区默认关，它是约束标注、讲解时才需要。
      this.switchRow('显示项圈与电极位置', initial.collar ?? true, (on) =>
        this.callbacks.onCollar(on),
      ),
      this.switchRow('标注触须无干涉区', initial.whiskerZone ?? false, (on) =>
        this.callbacks.onWhiskerZone(on),
      ),
      this.qualityRow(),
      (this.statsLine = el('p', { class: 'stats-line', text: '统计：等待渲染…' })),
      (this.issues = el('p', { class: 'issue-line' })),
    ]);
    const layersPanel = el('details', { class: 'panel panel-layers panel-fold' }, [
      el('summary', { class: 'panel-title', text: '图层与画质' }),
      layersBody,
    ]) as HTMLDetailsElement;

    const panels = el('div', { class: 'hud-panels' }, [catPanel, cameraPanel, layersPanel]);

    this.progressBar = el('div', { class: 'progress-bar' });
    this.progressText = el('p', { class: 'progress-text', text: '正在准备场景…' });
    this.loading = el('div', { class: 'loading' }, [
      el('div', { class: 'loading-card' }, [
        el('h2', { class: 'panel-title', text: '正在搭建样板间' }),
        el('div', { class: 'progress-track' }, [this.progressBar]),
        this.progressText,
        el('p', {
          class: 'panel-foot',
          text: '房间与家具先渲染，CC0 扫描模型与贴图随后替换占位件；断网也能看到完整房间。',
        }),
      ]),
    ]);

    this.fatal = el('div', { class: 'fatal', attrs: { hidden: 'hidden' } });

    this.root = el('div', { class: 'scene-screen' }, [
      this.canvasHost,
      panels,
      this.loading,
      this.fatal,
    ]);

    this.setCatState('calm');
  }

  addPreset(preset: PresetSpec): void {
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

  setCatState(id: CatStateId): void {
    for (const [key, button] of this.stateButtons) {
      const active = key === id;
      button.classList.toggle('state-btn-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    this.hint.textContent = CAT_STATES[id].hint;
  }

  /** 切换「自主行为 / 手动演示」两个模式按钮的高亮。 */
  setCatMode(mode: 'auto' | 'manual'): void {
    for (const [key, button] of this.modeButtons) {
      const active = key === mode;
      button.classList.toggle('state-btn-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    if (mode === 'manual') {
      this.behaviorLine.textContent = '手动演示：自主行为已暂停，猫停在原地。';
    }
  }

  /** 自主行为的实时状态：当前活动、姿势、所在位置、演示时钟与段内进展。 */
  setBehaviorStatus(status: BehaviorStatus): void {
    const clock = formatClock(status.hourOfDay);
    // 段内进展也要显示：`resting` 段平均 56 秒、最长超过 2 分钟，
    // 这段时间里活动名称是不变的，没有进展指示就会像卡住。
    const elapsed = Math.floor(status.segmentElapsedS ?? 0);
    this.behaviorLine.textContent =
      `自主行为 · ${clock} · ${status.activityLabel}（${status.postureLabel}）` +
      ` · ${status.anchorLabel} · 本段 ${elapsed}s`;
  }

  /** 突发演示的状态行。文案只描述动作，不命名任何状况。 */
  setIncidentStatus(kind: CatIncidentKind | null): void {
    if (!kind) {
      this.incidentLine.textContent = '尚未触发突发演示。';
      return;
    }
    const def = INCIDENT_DEFS[kind];
    this.incidentLine.textContent = `正在演示：${def.label} —— ${def.hint}`;
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

  setStats(stats: SceneStats): void {
    this.statsLine.textContent = `统计：${stats.fps} fps · ${(stats.triangles / 1000).toFixed(0)}k 三角面 · ${stats.drawCalls} 次绘制 · ${stats.models} 个扫描模型`;
  }

  // 居家资源清单已移出场景页：它现在有自己的页面（`#/resources`，见 ui/resource-list.ts）。
  // 留在右栏时，它与"看房间"互相遮挡，而它本身是一份**报告**，不是场景的操作控件。

  showFatal(message: string): void {
    this.fatal.removeAttribute('hidden');
    this.fatal.replaceChildren(
      el('div', { class: 'loading-card' }, [
        el('h2', { class: 'panel-title', text: '3D 场景无法启动' }),
        el('p', { class: 'panel-foot', text: message }),
        el('p', {
          class: 'panel-foot',
          text: '右侧的居家资源清单不依赖 3D，仍然可用；你也可以切到「工程自检」查看数据链路。',
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

/** 演示时钟：把当日小时数格式化成 `HH:MM`。 */
function formatClock(hourOfDay: number): string {
  const h = ((hourOfDay % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
