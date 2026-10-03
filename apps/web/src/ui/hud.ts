/**
 * 场景 HUD：猫的行为（自主 / 手动 / 突发演示）、机位、图层、画质、资源清单、加载进度、降级提示。
 *
 * 边界纪律（三条，都会出现在界面上）：
 *   1. 猫的两种状态是**手动演示档位**，不是系统推断——文案由 `BOUNDARY_NOTE` 提供，不得改写掉。
 *   2. 资源清单里 `unknown` 必须显示为「需你确认」，不能因为没数据就看起来合格。
 *   3. 突发演示是**你手动触发的动画**，不命名任何状况、不构成诊断——文案由
 *      `INCIDENT_BOUNDARY_NOTE` 与 `INCIDENT_REFERRAL_NOTE` 提供，不得改写掉。
 */
import { INCIDENT_BOUNDARY_NOTE, INCIDENT_DEFS, INCIDENT_KINDS, INCIDENT_REFERRAL_NOTE, PILLAR_LABELS } from '@camp/core';
import type { CatIncidentKind, HomeResourceSummary, PillarId } from '@camp/core';
import type { AssetReport } from '../scene/assets.ts';
import type { BehaviorStatus } from '../scene/cat/cat-behavior.ts';
import type { CatStateId } from '../scene/cat/cat-states.ts';
import { CAT_STATES, BOUNDARY_NOTE } from '../scene/cat/cat-states.ts';
import type { QualityChoice } from '../scene/quality.ts';
import type { SceneStats } from '../scene/scene.ts';
import { el, tierBadge } from './dom.ts';

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
  private readonly checklistBody: HTMLElement;
  private readonly fatal: HTMLElement;
  private readonly presetHost: HTMLElement;
  private readonly callbacks: HudCallbacks;
  private readonly modeButtons = new Map<'auto' | 'manual', HTMLButtonElement>();
  private readonly behaviorLine: HTMLElement;
  private readonly incidentLine: HTMLElement;

  constructor(callbacks: HudCallbacks, initial: { labels?: boolean; highlights?: boolean; status?: boolean } = {}) {
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
    const incidentRow = el('div', { class: 'state-row' });
    for (const kind of INCIDENT_KINDS) {
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
      el('h2', { class: 'panel-title', text: '猫的行为' }),
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
    const layersPanel = el('section', { class: 'panel panel-layers' }, [
      el('h2', { class: 'panel-title', text: '图层与画质' }),
      this.switchRow('显示资源标签', initial.labels ?? true, (on) => this.callbacks.onLabels(on)),
      this.switchRow('显示猫头顶的状态', initial.status ?? true, (on) =>
        this.callbacks.onStatusLabel(on),
      ),
      this.switchRow('高亮猫的关键资源', initial.highlights ?? false, (on) =>
        this.callbacks.onHighlights(on),
      ),
      this.qualityRow(),
      (this.statsLine = el('p', { class: 'stats-line', text: '统计：等待渲染…' })),
      (this.issues = el('p', { class: 'issue-line' })),
    ]);

    // ---- 资源清单
    this.checklistBody = el('div', { class: 'checklist-body' });
    const checklist = el('aside', { class: 'checklist' }, [
      el('header', { class: 'checklist-head' }, [
        el('h2', { class: 'panel-title', text: '居家资源清单' }),
        el('p', {
          class: 'panel-foot',
          text: '按 AAFP/ISFM 健康猫科环境五大支柱核对。清单与房间用同一份布局数据。',
        }),
      ]),
      this.checklistBody,
    ]);

    // ---- 首屏提示：让「猫在自主行动」这件事一眼可见，而不是藏在面板里
    const intro = el('div', { class: 'intro-card' }, [
      el('h2', { class: 'panel-title', text: '这里有只会自己活动的猫' }),
      el('p', {
        class: 'panel-foot',
        text: '猫按仿真数据自己走动、跳上跳下、抓挠、进食、躲藏。左侧「猫的行为」面板可切到手动演示档位，或触发一次突发动作演示。',
      }),
      el('ul', { class: 'intro-list' }, [
        el('li', { text: '「猫特写」机位会实时跟随它当前所在位置' }),
        el('li', { text: '想先看房间：点「全景」并关掉资源标签' }),
        el('li', { text: '所有数据均为仿真，不构成任何诊断' }),
      ]),
    ]);

    const panels = el('div', { class: 'hud-panels' }, [intro, catPanel, cameraPanel, layersPanel]);

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
      checklist,
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

  /** 自主行为的实时状态：当前活动、姿势、所在位置与演示时钟。 */
  setBehaviorStatus(status: BehaviorStatus): void {
    const clock = formatClock(status.hourOfDay);
    const where = status.anchorLabel;
    this.behaviorLine.textContent = `自主行为 · ${clock} · ${status.activityLabel}（${status.postureLabel}）· ${where}`;
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

  setChecklist(summary: HomeResourceSummary): void {
    this.checklistBody.replaceChildren();
    const pillars = Object.keys(PILLAR_LABELS) as PillarId[];
    const statusZh: Record<string, string> = { ok: '达标', gap: '缺口', unknown: '需你确认' };
    for (const pillar of pillars) {
      const checks = summary.checks.filter((c) => c.pillar === pillar);
      if (checks.length === 0) continue;
      const okCount = checks.filter((c) => c.status === 'ok').length;
      const details = el('details', {
        class: 'pillar',
        attrs: { open: pillar === 'separated-resources' ? 'open' : 'false' },
      });
      details.append(
        el('summary', { class: 'pillar-head' }, [
          el('span', { class: 'pillar-label', text: PILLAR_LABELS[pillar] }),
          el('span', {
            class: 'pillar-count',
            text: `${okCount}/${checks.filter((c) => c.status !== 'unknown').length} 项达标`,
          }),
        ]),
      );
      const list = el('ul', { class: 'check-list' });
      for (const check of checks) {
        const item = el('li', { class: `check check-${check.status}` });
        item.append(
          el('div', { class: 'check-line' }, [
            el('span', { class: `check-status check-status-${check.status}`, text: statusZh[check.status] ?? check.status }),
            el('span', { class: 'check-req', text: check.requirement }),
            tierBadge(check.evidence),
          ]),
        );
        item.append(el('p', { class: 'check-actual', text: check.actual }));
        if (check.note) item.append(el('p', { class: 'check-note', text: check.note }));
        list.append(item);
      }
      details.append(list);
      this.checklistBody.append(details);
    }
    this.checklistBody.append(
      el('p', {
        class: 'panel-foot',
        text: `房间内共记录 ${Object.values(summary.counts).reduce((n, v) => n + (v ?? 0), 0)} 个关键资源点（${summary.cats} 只猫）。清单只是提示，不构成兽医或行为学诊断。`,
      }),
    );
  }

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
