/**
 * 生理读数屏（`#/vitals`）：项圈三通道的**读数、可用性与真值对照**。
 *
 * 这一屏的设计目标不是"展示心率呼吸体温三个数字"，而是把三件事同时摆在眼前：
 *   1. **这个值可不可用**（运动伪迹 / 接触不良 / 固件拒收），坏值划线展示而不是藏起来；
 *   2. **读数与真值不是一回事**（仿真里才有真值，正好用来做对照）；
 *   3. **一天里有多少时间真的测得到**（可用率）——它比任何精度宣称都更有信息量。
 *
 * 措辞纪律：本屏所有面向用户的文案只描述**读数与测量条件**，不描述猫的状态或原因。
 * 常驻边界与仿真声明来自 `@camp/core`，不在这里另写一套。
 */
import {
  CONDITION_LABELS,
  PHYSIOLOGY_BOUNDARY_NOTE,
  PHYSIOLOGY_EPISODES,
  PHYSIOLOGY_EPISODE_KINDS,
  PHYSIOLOGY_UNGATED_NOTE,
  SLEEP_RR_QUESTIONS,
  VALIDITY_LABELS,
  VITALS_BOUNDARY_NOTE,
  VITALS_CONSTANTS,
  VITALS_PARAMS,
  VITALS_SIM_NOTE,
  VITAL_LABELS,
  VITAL_UNITS,
  buildPhysiologyTrace,
  collarBudgetOf,
  describeSeparability,
  episodeMotion,
  episodeSpanS,
  predictPhysiologyAt,
  readingOf,
  sleepRespRateSummary,
  summarizeAvailability,
  vitalsParam,
  vitalsParamText,
} from '@camp/core';
import type { PhysiologyBaseline, Sample, Session, VitalKey } from '@camp/core';
import { SCENARIOS, generateSession } from '@camp/simulator';
import type { ScenarioId } from '@camp/simulator';
import { DEMO_PROFILE } from '../pet.ts';
import { el, tierBadge } from '../ui/dom.ts';

const SEED = 42;
const MINUTES = 1440;
/** 折线图最多画这么多点：8640 个采样点画成 DOM 会把页面拖垮，且肉眼分辨不出来。 */
const CHART_POINTS = 180;

/**
 * 状态程序曲线使用的**个体静息基线**。
 *
 * 与 `data/physiology/curves.json` 里的一致：曲线一律是相对这条基线的偏离，
 * 而不是「正常范围」。理由是猫的心率参考区间本身存在来源冲突，
 * 呼吸频率在不同测量条件下是三个显著不同的量。
 */
const PHYSIO_BASELINE: PhysiologyBaseline = { hrBpm: 140, hrvRmssdMs: 45, rrBpm: 25 };

/**
 * App 通知阈值的**候选值**。与 `simulator/src/export-physiology.ts` 同一份口径。
 *
 * ⚠️ 全部是操作化常量，不是文献数字，也不构成任何判断。放在这里是为了让
 * 「阈值怎么来的」与「读数可用性」在同一屏上可见。
 */
const NOTIFY_CANDIDATES = [
  {
    label: '心率持续高于自身静息基线',
    feature: 'hrRelative',
    comparison: '>=',
    threshold: '0.25',
    minConsecutiveWindows: 2,
    gatedBy: 'readingQuality.hr.validity === valid',
  },
  {
    label: '呼吸频率持续高于自身静息基线',
    feature: 'rrBpm',
    comparison: '>=',
    threshold: '1.4 倍基线',
    minConsecutiveWindows: 2,
    gatedBy: 'readingQuality.rr.validity === valid',
  },
  {
    label: '机械频带互斥：高频抖动或低频用力二者之一出现',
    feature: 'tremorPower | retchPower',
    comparison: '>=',
    threshold: '0.5',
    minConsecutiveWindows: 1,
    gatedBy: '（该特征本身即来自加速度计）',
  },
] as const;

/** 通道 → 读数取值、真值字段、以及"为什么两者可能对不上"的一句话。 */
const CHANNEL_META: Record<
  VitalKey,
  {
    read: (s: Sample) => number | undefined;
    truth: 'hrTrueBpm' | 'rrTrueBpm' | 'tempCoreC';
    note: string;
  }
> = {
  hr: {
    read: (s) => s.hrBpm,
    truth: 'hrTrueBpm',
    note: '读数受体动、接触与**测量情境**影响：同一只猫进诊室，读数可以高一截，而真值不变。',
  },
  rr: {
    read: (s) => s.rrBpm,
    truth: 'rrTrueBpm',
    note: '颈部只有微弱的胸廓传导，因此呼吸读数的体动门限最严——它基本只在睡眠与静息窗口可用。',
  },
  temp: {
    read: (s) => s.tempSurfaceC,
    truth: 'tempCoreC',
    note: '体表温与核心温**无相关**（Kendall τ ≈ −0.01）。两条线看起来毫无关系，这不是画错了，而是这一屏最想说明的一点。',
  },
};

export function mountVitalsScreen(host: HTMLElement): () => void {
  /** 当前场景。屏幕内部切换时只改这一个变量，避免两处状态各写一份（见 stage2 §6.7）。 */
  let scenario: ScenarioId = scenarioFromUrl() ?? 'living-room-day';

  const root = el('div', { class: 'status-screen vitals-screen' });
  host.append(root);

  let session = buildSession(scenario);
  render();

  return () => {
    root.remove();
  };

  // ------------------------------------------------------------ 渲染

  function buildSession(id: ScenarioId): Session {
    return generateSession({
      profile: DEMO_PROFILE,
      seed: SEED,
      durationMin: MINUTES,
      scenario: id,
      behavior: { seed: SEED, timeScale: 20 },
    });
  }

  function render(): void {
    root.replaceChildren();

    root.append(
      el('p', { class: 'eyebrow', text: '第三阶段 · 项圈生理读数（仿真）' }),
      el('h1', { class: 'status-title', text: '心率 · 呼吸 · 体表温：读数与它的边界' }),
      el('p', {
        class: 'status-lead',
        text: '这一屏不回答「我的猫健康吗」。它回答三个可证伪的问题：这三个通道各读到了什么、哪些窗口的读数其实不可用、以及读数与真值差在哪里。',
      }),
      scenarioRow(),
      boundaryBlock(),
      channelGrid(),
      stateProgramSection(),
      chartSection(),
      availabilitySection(),
      sleepRrSection(),
      specSection(),
      constantsSection(),
    );
  }

  function scenarioRow(): HTMLElement {
    const ids: ScenarioId[] = ['living-room-day', 'vet-visit'];
    const row = el('div', { class: 'state-row' });
    for (const id of ids) {
      const active = id === scenario;
      row.append(
        el('button', {
          class: active ? 'state-btn state-btn-active' : 'state-btn',
          text: SCENARIOS[id].name,
          type: 'button',
          title: SCENARIOS[id].description,
          on: {
            click: () => {
              if (id === scenario) return;
              scenarioSet(id);
            },
          },
        }),
      );
    }
    return el('div', { class: 'vitals-scenario' }, [
      row,
      el('p', { class: 'state-hint', text: SCENARIOS[scenario].description }),
    ]);
  }

  function scenarioSet(id: ScenarioId): void {
    scenario = id;
    session = buildSession(id);
    // 重新渲染整屏；`render()` 只读当前状态，不再另存一份场景。
    render();
  }

  function boundaryBlock(): HTMLElement {
    return el('div', { class: 'vitals-boundary' }, [
      el('p', { class: 'boundary-note', text: VITALS_BOUNDARY_NOTE }),
      el('p', { class: 'boundary-note', text: VITALS_SIM_NOTE }),
    ]);
  }

  function channelGrid(): HTMLElement {
    const grid = el('div', { class: 'vitals-grid' });
    for (const key of ['hr', 'rr', 'temp'] as const) {
      grid.append(channelCard(key));
    }
    return el('section', {}, [el('h2', { class: 'panel-title', text: '三个通道各自的现状' }), grid]);
  }

  function channelCard(key: VitalKey): HTMLElement {
    const availability = summarizeAvailability(session.samples).channels[key];
    const samples = session.samples;
    // 最近一个**可用**读数：这是"现在读到什么"的唯一合法来源。
    let lastIndex = -1;
    for (let i = samples.length - 1; i >= 0; i--) {
      if (readingOf(samples[i] as Sample, key) !== null) {
        lastIndex = i;
        break;
      }
    }
    const last = lastIndex >= 0 ? (samples[lastIndex] as Sample) : null;
    const raw = last ? CHANNEL_META[key].read(last) : undefined;
    const q = last?.readingQuality?.[key];
    const topReason = Object.entries(availability.reasons)
      .filter(([k]) => k !== 'valid')
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];

    const validationId = key === 'hr' ? 'collarHeartRateValidation' : key === 'rr' ? 'collarRespRateValidation' : 'collarSurfaceTempValidation';
    const param = vitalsParam(validationId);

    return el('div', { class: 'vitals-card' }, [
      el('div', { class: 'vitals-card-head' }, [
        el('span', { class: 'vitals-card-name', text: VITAL_LABELS[key] }),
        param ? tierBadge(param.evidence.tier) : el('span'),
      ]),
      el('div', { class: 'vitals-value' }, [
        el('span', {
          class: 'vitals-number',
          text: raw === undefined ? '无可用读数' : `${raw.toFixed(1)}`,
        }),
        el('span', { class: 'vitals-unit', text: VITAL_UNITS[key] }),
      ]),
      el('p', {
        class: 'vitals-meta',
        text:
          last && q
            ? `最近可用窗口：${formatClock(last.t)} · ${CONDITION_LABELS[last.measurementCondition ?? 'resting']} · 质量 ${(q.score * 100).toFixed(0)}%`
            : '本段没有任何可用窗口',
      }),
      el('div', { class: 'vitals-bar' }, [
        el('div', {
          class: 'vitals-bar-fill',
          attrs: { style: `width: ${(availability.validShare * 100).toFixed(1)}%` },
        }),
      ]),
      el('p', {
        class: 'vitals-meta',
        text: `一天里可用 ${(availability.validShare * 100).toFixed(1)}%（${availability.validWindows}/${availability.totalWindows} 个窗口）` +
          (topReason ? `；主要失效原因：${VALIDITY_LABELS[topReason[0] as keyof typeof VALIDITY_LABELS]}（${topReason[1]} 次）` : ''),
      }),
      el('p', { class: 'vitals-note', text: CHANNEL_META[key].note }),
      param ? el('p', { class: 'vitals-meta', text: `验证状态：${vitalsParamText(validationId)}` }) : el('span'),
    ]);
  }

  /**
   * 状态程序：**抽搐 / 呕吐时心率与呼吸怎么变**。
   *
   * 这一节的存在理由：前面几节回答「读数可不可用」，这一节回答「某个动作发生时，
   * 读数会怎么走」。它是之后 App 做指标展示与提醒的直接依据——
   * 而提醒逻辑必须先在一条**知道答案**的曲线上跑通。
   *
   * 措辞纪律：状态名一律是**动作名**（抽搐、干呕），不是任何状况名，也不构成判断。
   */
  function stateProgramSection(): HTMLElement {
    const wrap = el('section', {});
    wrap.append(
      el('h2', { class: 'panel-title', text: '状态程序：抽搐与呕吐时，心率与呼吸怎么变' }),
      el('p', {
        class: 'vitals-note',
        text: '两个动作都不是方波，而是「前驱 → 动作 → 恢复」的多时相过程。曲线由同一套登记表生成（下方可见每一段的时长与取值来源），App 的指标图与提醒阈值直接吃这一份数据。',
      }),
      el('p', { class: 'boundary-note', text: PHYSIOLOGY_BOUNDARY_NOTE }),
    );

    for (const kind of PHYSIOLOGY_EPISODE_KINDS) {
      wrap.append(stateProgramCard(kind));
    }
    wrap.append(separabilityTable(), notifyCandidatesBlock());
    return wrap;
  }

  function stateProgramCard(kind: (typeof PHYSIOLOGY_EPISODE_KINDS)[number]): HTMLElement {
    const def = PHYSIOLOGY_EPISODES[kind];
    const trace = buildPhysiologyTrace(kind, PHYSIO_BASELINE, { stepS: 1 });
    // 一张图里画三条：心率、呼吸、体动伪影。共用纵轴刻度会让小量级的抖动看不见，
    // 因此各自归一化到自己的峰谷——图只回答「形状与时序」，不回答绝对量级。
    const hr = trace.samples.map((s) => s.hrBpm);
    const rr = trace.samples.map((s) => s.rrBpm);
    const motion = trace.samples.map((s) => s.motionArtifact);
    const unusable = trace.samples.map((s) => (s.readingTrustworthy ? 0 : 1) as number);

    const phases = el('ul', { class: 'status-list' });
    for (const p of def.phases) {
      phases.append(
        el('li', {}, [
          el('span', { class: 'status-key', text: `${p.label} ${p.ops.durationS}s` }),
          el('span', { text: p.hint }),
        ]),
      );
    }

    return el('div', { class: 'vitals-chart' }, [
      el('div', { class: 'vitals-chart-head' }, [
        el('span', { class: 'vitals-card-name', text: def.label }),
        el('span', {
          class: 'vitals-meta',
          text: `生理窗口 ${episodeSpanS(kind, false)} s · 真实过程约 ${Math.round(episodeSpanS(kind, true) / 60)} 分钟`,
        }),
      ]),
      el('p', { class: 'vitals-note', text: def.hint }),
      sparklineMulti([
        { values: hr, cls: 'spark-truth', label: '心率' },
        { values: rr, cls: 'spark-read', label: '呼吸' },
        { values: motion, cls: 'spark-motion', label: '体动伪影' },
      ]),
      el('p', {
        class: 'vitals-meta',
        text: `不可采信窗口占比 ${((unusable.reduce((a, b) => a + b, 0) / unusable.length) * 100).toFixed(0)}% —— 图上的阴影段就是这些窗口：`,
      }),
      unusableBand(unusable),
      el('p', { class: 'vitals-note', text: PHYSIOLOGY_UNGATED_NOTE }),
      phases,
      el('p', {
        class: 'vitals-meta',
        text: `证据：${def.evidence.source ?? ''} —— ${def.evidence.note ?? ''}`,
      }),
    ]);
  }

  /** 三条序列共用一套坐标，但**各自归一化**：图只回答形状与时序。 */
  function sparklineMulti(series: ReadonlyArray<{ values: readonly number[]; cls: string; label: string }>): SVGElement {
    const W = 640;
    const H = 130;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'vitals-spark');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `状态程序曲线：${series.map((s) => s.label).join('、')}`);

    for (const s of series) {
      const lo = Math.min(...s.values);
      const hi = Math.max(...s.values);
      const span = hi - lo || 1;
      const n = s.values.length;
      const pts = s.values
        .map((v, i) => {
          const x = n <= 1 ? 0 : (i / (n - 1)) * W;
          const y = H - ((v - lo) / span) * (H - 10) - 5;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      poly.setAttribute('points', pts);
      poly.setAttribute('class', s.cls);
      svg.append(poly);
    }
    return svg;
  }

  /** 读数不可采信的窗口带：提醒逻辑必须先跳过这些段，否则一定在运动伪影上误报。 */
  function unusableBand(flags: readonly number[]): HTMLElement {
    const wrap = el('div', { class: 'unusable-band' });
    for (const [i, f] of flags.entries()) {
      if (!f) continue;
      wrap.append(
        el('span', {
          class: 'unusable-tick',
          title: `t=${i}s：本段读数不可采信`,
        }),
      );
    }
    if (wrap.childElementCount === 0) wrap.append(el('span', { class: 'vitals-meta', text: '（本段没有不可采信窗口）' }));
    return wrap;
  }

  function separabilityTable(): HTMLElement {
    const at = (kind: 'seizure' | 'vomiting', t: number): ReturnType<typeof predictPhysiologyAt> =>
      predictPhysiologyAt({ ...PHYSIO_BASELINE, episode: kind, episodeElapsedS: t, motion: episodeMotion(kind) });
    const diffs = describeSeparability(at('seizure', 7.5).features, at('vomiting', 10).features);
    const list = el('ul', { class: 'status-list' });
    for (const d of diffs) {
      list.append(
        el('li', {}, [
          el('span', { class: 'status-key', text: d.feature }),
          el('span', {
            text: `抽搐 ${d.a} · 呕吐 ${d.b} · 相对差 ${(d.relativeDelta * 100).toFixed(0)}%`,
          }),
        ]),
      );
    }
    return el('div', {}, [
      el('p', { class: 'panel-subtitle', text: '两个动作在项圈通道上被拉开了哪些' }),
      el('p', {
        class: 'vitals-note',
        text: '⚠️ 这不是「算法能不能分开它们」的证据，而是**这套仿真参数在设计上**拉开了哪些通道。真实猫上的可分性未知，需要真机数据验证。',
      }),
      list,
    ]);
  }

  function notifyCandidatesBlock(): HTMLElement {
    const list = el('ul', { class: 'status-list' });
    for (const c of NOTIFY_CANDIDATES) {
      list.append(
        el('li', {}, [
          el('span', { class: 'status-key', text: c.label }),
          el('span', {
            text: `${c.feature} ${c.comparison} ${c.threshold} · 连续 ${c.minConsecutiveWindows} 个窗口 · 前置条件：${c.gatedBy}`,
          }),
        ]),
      );
    }
    return el('div', {}, [
      el('p', { class: 'panel-subtitle', text: '给 App 的通知阈值候选（操作化常量，不是文献数字）' }),
      el('p', {
        class: 'vitals-note',
        text: '提醒要做对，关键不在阈值高低，而在**先过读数有效性这一关**：抽搐发作当下的心率与呼吸都不可采信，若不过滤，报警一定落在运动伪影上。',
      }),
      list,
    ]);
  }

  function chartSection(): HTMLElement {    const wrap = el('section', {});
    wrap.append(
      el('h2', { class: 'panel-title', text: '读数 vs 真值（只有仿真才有真值）' }),
      el('p', {
        class: 'vitals-note',
        text: '同一个会话里同时存在两条线：一条是设备报出来的读数，一条是"如果有一台完美仪器会读到什么"。两条线的差距，就是本阶段要展示的全部内容。',
      }),
    );
    for (const key of ['hr', 'rr', 'temp'] as const) {
      wrap.append(chartBlock(key));
    }
    return wrap;
  }

  function chartBlock(key: VitalKey): HTMLElement {
    const truth = session.truth?.vitals ?? [];
    const stride = Math.max(1, Math.floor(session.samples.length / CHART_POINTS));
    const readPts: number[] = [];
    const truthPts: number[] = [];
    const truthKey = CHANNEL_META[key].truth as 'hrTrueBpm' | 'rrTrueBpm' | 'tempCoreC';
    for (let i = 0; i < session.samples.length; i += stride) {
      const raw = CHANNEL_META[key].read(session.samples[i] as Sample);
      if (raw !== undefined) readPts.push(raw);
      const t = truth[i];
      if (t) truthPts.push(t[truthKey]);
    }

    return el('div', { class: 'vitals-chart' }, [
      el('div', { class: 'vitals-chart-head' }, [
        el('span', { class: 'vitals-card-name', text: VITAL_LABELS[key] }),
        el('span', { class: 'vitals-legend' }, [
          el('span', { class: 'legend-swatch legend-read' }),
          el('span', { text: '读数' }),
          el('span', { class: 'legend-swatch legend-truth' }),
          el('span', { text: '真值' }),
        ]),
      ]),
      sparkline(readPts, truthPts),
    ]);
  }

  /** 手写 SVG 折线图：无打包器、无依赖，两个序列共用一套纵轴刻度。 */
  function sparkline(a: readonly number[], b: readonly number[]): SVGElement {
    const W = 640;
    const H = 120;
    const all = [...a, ...b].filter((v) => Number.isFinite(v));
    const lo = all.length > 0 ? Math.min(...all) : 0;
    const hi = all.length > 0 ? Math.max(...all) : 1;
    const span = hi - lo || 1;
    const toPoints = (xs: readonly number[], n: number): string =>
      xs
        .map((v, i) => {
          const x = n <= 1 ? 0 : (i / (n - 1)) * W;
          const y = H - ((v - lo) / span) * (H - 8) - 4;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'vitals-spark');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '读数与真值对照曲线');

    for (const [points, cls] of [
      [toPoints(a, a.length), 'spark-read'],
      [toPoints(b, b.length), 'spark-truth'],
    ] as const) {
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      poly.setAttribute('points', points);
      poly.setAttribute('class', cls);
      svg.append(poly);
    }
    return svg;
  }

  function availabilitySection(): HTMLElement {
    const availability = summarizeAvailability(session.samples);
    const list = el('ul', { class: 'status-list' });
    for (const key of ['hr', 'rr', 'temp'] as const) {
      const ch = availability.channels[key];
      const reasons = Object.entries(ch.reasons)
        .map(([k, v]) => `${VALIDITY_LABELS[k as keyof typeof VALIDITY_LABELS].split('：')[0]} ×${v}`)
        .join('、');
      list.append(
        el('li', {}, [
          el('span', { class: 'status-key', text: ch.label }),
          el('span', {
            text: `可用 ${(ch.validShare * 100).toFixed(1)}% / 报出 ${(ch.reportedShare * 100).toFixed(1)}% —— ${reasons || '（无失效窗口）'}`,
          }),
        ]),
      );
    }
    const conditions = Object.entries(availability.conditions)
      .map(([k, v]) => `${CONDITION_LABELS[k as keyof typeof CONDITION_LABELS]} ${(((v ?? 0) / session.samples.length) * 100).toFixed(0)}%`)
      .join('、');

    return el('section', {}, [
      el('h2', { class: 'panel-title', text: '可用性报告：一天里有多少时间真的测到了' }),
      el('p', {
        class: 'vitals-note',
        text: '这张表比任何精度宣称都更有信息量：「能测」与「能用」是两件事。报出比例远高于可用比例，差值就是这一天的无效窗口。',
      }),
      list,
      el('p', { class: 'vitals-meta', text: `测量条件分布：${conditions}` }),
    ]);
  }

  function sleepRrSection(): HTMLElement {
    const s = sleepRespRateSummary(session.samples);
    const list = el('ul', { class: 'check-list' });
    for (const q of SLEEP_RR_QUESTIONS) list.append(el('li', { class: 'check-note', text: q }));

    return el('section', {}, [
      el('h2', { class: 'panel-title', text: '睡眠呼吸频率：唯一一条有共识阈值的居家协议' }),
      el('div', { class: 'vitals-card' }, [
        el('div', { class: 'vitals-card-head' }, [
          el('span', { class: 'vitals-card-name', text: '睡眠窗口汇总' }),
          tierBadge(s.evidence.tier),
        ]),
        el('div', { class: 'vitals-value' }, [
          el('span', {
            class: 'vitals-number',
            text: s.medianBpm === null ? '无' : s.medianBpm.toFixed(1),
          }),
          el('span', { class: 'vitals-unit', text: '次/分（中位数）' }),
        ]),
        el('p', {
          class: 'vitals-meta',
          text: `可用睡眠读数 ${s.n} 个 · 识别睡眠时段 ${s.bouts.length} 个 · 超阈值时段 ${s.overThresholdBouts}/${s.manyBoutsNeeded} · 共识阈值 ${s.thresholdBpm} 次/分`,
        }),
        el('p', { class: 'vitals-note', text: s.message }),
        el('p', {
          class: 'vitals-meta',
          text: `阈值来源：${s.evidence.source ?? 'ACVIM 2020'}（${s.evidence.note ?? ''}）`,
        }),
      ]),
      el('p', { class: 'panel-subtitle', text: '要请主人回答的问题（可回答，不是"注意观察"）' }),
      list,
    ]);
  }

  function specSection(): HTMLElement {
    const budget = collarBudgetOf(DEMO_PROFILE);
    const observed = vitalsParamText('collarFormWeight');
    const weight = vitalsParam('collarWeightBudgetShare');
    const weightParam = vitalsParam('collarFormWeight');
    const rows: Array<[string, string]> = [
      ['重量预算（体重 2%）', `${budget.maxWeightG} g`],
      ['在售同类产品重量', observed],
      ['项圈带长范围', `${budget.strapMinMm}–${budget.strapMaxMm} mm`],
      ['心率通道选型', '双干电极 ECG 为主；PPG 为备选（颈部毛发与体动下可行性最低）'],
      ['呼吸通道选型', 'IMU 胸廓微动为主，只在睡眠/静息窗口采信'],
      ['体温通道选型', '贴颈体表热敏电阻 + 环境参考热敏'],
      ['硬约束', '面部触须是独立感觉器官，项圈必须在结构上留出无干涉区（德/奥/瑞法律禁止为美观修剪触须）'],
    ];
    const list = el('ul', { class: 'status-list' });
    for (const [k, v] of rows) {
      list.append(el('li', {}, [el('span', { class: 'status-key', text: k }), el('span', { text: v })]));
    }

    return el('section', {}, [
      el('h2', { class: 'panel-title', text: '项圈规格与佩戴约束' }),
      el('div', { class: 'vitals-card-head' }, [
        el('span', { class: 'vitals-card-name', text: '重量与通道选型' }),
        weight ? tierBadge(weight.evidence.tier) : el('span'),
        weightParam ? tierBadge(weightParam.evidence.tier) : el('span'),
      ]),
      list,
      el('p', {
        class: 'vitals-note',
        text: '「多参数项圈 60–100 g」与「摄像头型项圈约 100 g」合一会显著超过体重 2% 的预算——这正是摄像头与健康传感从未合一的工程原因。',
      }),
      el('p', {
        class: 'vitals-note',
        text: '本页只做形态与约束的方案呈现，不做真机实现；选型与真机验证路线见 docs/hardware/01-collar-spec.md。',
      }),
    ]);
  }

  function constantsSection(): HTMLElement {
    const list = el('ul', { class: 'status-list' });
    for (const c of VITALS_CONSTANTS) {
      list.append(
        el('li', {}, [
          el('span', { class: 'status-key', text: `${c.label}（${c.value} ${c.unit}）` }),
          el('span', { text: c.why }),
        ]),
      );
    }
    const params = el('ul', { class: 'status-list' });
    for (const p of VITALS_PARAMS) {
      params.append(
        el('li', {}, [
          el('span', { class: 'status-key', text: p.label }),
          tierBadge(p.evidence.tier),
          el('span', { text: vitalsParamText(p.id) }),
        ]),
      );
    }
    return el('section', {}, [
      el('h2', { class: 'panel-title', text: '证据登记表（每个数字都要能追到来源）' }),
      params,
      el('h2', { class: 'panel-title', text: '操作化常量（文献没给数值、本项目自行选定）' }),
      el('p', {
        class: 'vitals-note',
        text: '这些阈值不是文献结论，而是为了让链路能跑起来而选定的工程常量。混进登记表里会让"有来源的数字"与"我们拍的数字"看起来同级，所以单独列出并逐条写明理由。',
      }),
      list,
    ]);
  }
}

function formatClock(tS: number): string {
  const hour = (9 + tS / 3600) % 24;
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 从地址里取场景。
 *
 * 两种写法都要认：`/?scenario=vet-visit#/vitals`（查询串在 hash 前）与
 * `/#/vitals?scenario=vet-visit`（查询串在 hash 里）。用户会直接复制地址栏，
 * 只支持其中一种是"复制来的链接打不开"的常见来源。
 */
function scenarioFromUrl(): ScenarioId | null {
  const hash = window.location.hash;
  const q = hash.indexOf('?');
  const fromHash = q >= 0 ? hash.slice(q + 1) : '';
  const candidates = [window.location.search.replace(/^\?/, ''), fromHash];
  for (const raw of candidates) {
    if (!raw) continue;
    const id = new URLSearchParams(raw).get('scenario');
    if (id && id in SCENARIOS) return id as ScenarioId;
  }
  return null;
}
