/**
 * 饲主状态同步视图（第一阶段）。
 *
 * 定位变化：中心从「让主人看见宠物的感知世界」转为「把宠物的客观情况同步给主人」。
 * 本视图呈现项圈可交付的四类内容——生理读数、环境读数、触觉相关身体事件、
 * 环境影像记录位。
 *
 * 三条文案纪律，由 scripts/check-claims.mjs 在构建期强制：
 *   1. 摄像头只能说「环境影像记录」；「宠物所见」「宠物视角相机」不是可用表述。
 *   2. 健康内容只能用非诊断表述，并给出转诊路径（AGENTS.md §3.4）。
 *   3. 不出现情绪推断类宣称——动物情绪体验不可直接测量。
 *
 * 样式统一由 main.ts 注入，本模块只负责结构与更新，便于场景切换时整体重挂。
 */
import type { Sample, Session, SimEvent, SimEventKind } from '@camp/core';
import { renderSparkline } from './sparkline.ts';

const EVENT_LABELS: Record<SimEventKind, string> = {
  scratch: '抓挠',
  rub: '摩擦',
  impact: '碰撞',
  'head-shake': '甩头',
  'posture-change': '姿势改变',
  vocalization: '发声',
  'elimination-outside-box': '砂盆外排泄',
  hiding: '躲藏',
};

const TREND_WINDOW = 60;
const HISTORY_CAP = TREND_WINDOW * 4;
const MAX_EVENT_ROWS = 12;
const SPARK_W = 320;
const SPARK_H = 64;

export interface OwnerStatusView {
  /** 推入一个采样点，刷新全部读数与趋势线 */
  push(sample: Sample): void;
  /** 推入一条身体事件 */
  pushEvent(event: SimEvent): void;
  /** 清空趋势与事件，读数回到占位符 */
  reset(): void;
}

/** 把秒数格式化为 分:秒 或 时:分:秒 */
function formatClock(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 读数格式化：缺失一律显示占位符，绝不补零或猜值 */
function fmt(value: number | undefined, digits: number): string {
  return value === undefined ? '–' : value.toFixed(digits);
}

function shell(session: Session): string {
  const p = session.profile;
  const species = p.species === 'cat' ? '猫' : '犬';
  return `
  <section class="card">
    <h2>档案</h2>
    <p class="muted">
      ${species} · ${p.breedId} · ${p.weightKg} kg · 肩高 ${p.heightCm} cm · ${p.ageMonths} 个月
    </p>
    <p class="muted">会话 <code>${session.id}</code> · 数据源 <code>${session.source}</code></p>
  </section>

  <section class="card">
    <h2>项圈读数</h2>
    <p class="muted">
      项圈戴在颈部，而触觉器官在面部触须与爪垫，位置本就错配——因此本页不提供触觉感受检测，
      只呈现项圈能交付的触觉相关身体事件。以下读数全部为仿真。
    </p>
    <div class="grid">
      <div class="metric"><span class="label">心率</span><span class="value" id="read-hr">–</span><span class="unit">bpm</span></div>
      <div class="metric"><span class="label">心率变异性</span><span class="value" id="read-hrv">–</span><span class="unit">ms</span></div>
      <div class="metric"><span class="label">呼吸</span><span class="value" id="read-rr">–</span><span class="unit">次/分</span></div>
      <div class="metric"><span class="label">体温</span><span class="value" id="read-temp">–</span><span class="unit">°C</span></div>
      <div class="metric"><span class="label">活动量</span><span class="value" id="read-activity">–</span><span class="unit">相对值</span></div>
      <div class="metric"><span class="label">姿态</span><span class="value small" id="read-posture">–</span><span class="unit">&nbsp;</span></div>
    </div>
  </section>

  <section class="card">
    <h2>环境读数</h2>
    <div class="grid">
      <div class="metric"><span class="label">噪声</span><span class="value" id="env-noise">–</span><span class="unit">dB(A)</span></div>
      <div class="metric"><span class="label">环境温度</span><span class="value" id="env-temp">–</span><span class="unit">°C</span></div>
      <div class="metric"><span class="label">光照</span><span class="value" id="env-light">–</span><span class="unit">lx</span></div>
    </div>
  </section>

  <section class="card">
    <h2>心率趋势 <span class="muted small">最近 ${TREND_WINDOW} 个采样点</span></h2>
    <div class="spark-wrap" id="trend-hr"></div>
    <p class="muted small">已同步到 <span id="clock">00:00</span></p>
  </section>

  <section class="card">
    <h2>身体事件 <span class="muted small">触觉相关，共 <span id="event-count">0</span> 条</span></h2>
    <p class="muted">抓挠、摩擦、碰撞、甩头、姿势改变属于项圈可交付的身体事件，与触觉感受不是一回事。</p>
    <p class="muted" id="event-empty">暂无事件。</p>
    <ul class="events" id="events"></ul>
  </section>

  <section class="card">
    <h2>环境影像记录</h2>
    <div class="camera">
      <div class="camera-frame">环境影像记录 · 仿真占位</div>
      <p class="muted">
        摄像头装在项圈上，记录的是宠物所处环境的画面；画面朝向随头部转动而变。
        它是环境记录，不是宠物眼睛看到的世界，也不代表宠物的视觉体验。
      </p>
    </div>
  </section>

  <section class="card boundary">
    <h2>边界与转诊</h2>
    <ul>
      <li>本页全部读数为<strong>仿真数据</strong>，不是真实测量，不构成兽医诊断或治疗建议。</li>
      <li>本页只提示可能值得关注的生理变化，属非诊断用途，不替代执业兽医的判断。</li>
      <li>仿真数据不得作为临床决策依据。</li>
      <li>若宠物出现持续异常，请咨询执业兽医。</li>
    </ul>
  </section>
  `;
}

/**
 * 把状态视图挂载到给定容器。返回句柄用于推入数据。
 * 重复挂载同一容器会整体替换内容（场景切换即用此路径）。
 */
export function mountOwnerStatus(root: HTMLElement, session: Session): OwnerStatusView {
  root.innerHTML = shell(session);

  const pick = (selector: string): HTMLElement => {
    const el = root.querySelector<HTMLElement>(selector);
    if (el === null) throw new Error(`状态视图缺少元素 ${selector}`);
    return el;
  };

  const refs = {
    hr: pick('#read-hr'),
    hrv: pick('#read-hrv'),
    rr: pick('#read-rr'),
    temp: pick('#read-temp'),
    activity: pick('#read-activity'),
    posture: pick('#read-posture'),
    noise: pick('#env-noise'),
    ambient: pick('#env-temp'),
    light: pick('#env-light'),
    trend: pick('#trend-hr'),
    clock: pick('#clock'),
    count: pick('#event-count'),
    list: pick('#events'),
    empty: pick('#event-empty'),
  };

  const history: number[] = [];
  let eventCount = 0;

  const setText = (el: HTMLElement, text: string): void => {
    el.textContent = text;
  };

  const redrawTrend = (): void => {
    refs.trend.innerHTML = renderSparkline(history, {
      width: SPARK_W,
      height: SPARK_H,
      window: TREND_WINDOW,
    });
  };

  const push = (sample: Sample): void => {
    setText(refs.hr, fmt(sample.hrBpm, 0));
    setText(refs.hrv, fmt(sample.hrvRmssdMs, 0));
    setText(refs.rr, fmt(sample.rrBpm, 1));
    setText(refs.temp, fmt(sample.tempC, 2));
    setText(refs.activity, fmt(sample.activity, 2));
    setText(refs.posture, sample.posture ?? '–');
    setText(refs.noise, fmt(sample.noiseDbA, 1));
    setText(refs.ambient, fmt(sample.ambientTempC, 1));
    setText(refs.light, fmt(sample.lightLux, 0));
    setText(refs.clock, formatClock(sample.t));

    if (sample.hrBpm !== undefined) {
      history.push(sample.hrBpm);
      // 只保留绘制窗口的数倍，避免长会话无限增长
      if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP);
    }
    redrawTrend();
  };

  const pushEvent = (event: SimEvent): void => {
    eventCount += 1;
    setText(refs.count, String(eventCount));
    refs.empty.hidden = true;

    const li = document.createElement('li');
    li.className = 'event';

    const time = document.createElement('span');
    time.className = 't';
    time.textContent = formatClock(event.t);

    const kind = document.createElement('span');
    kind.className = 'kind';
    kind.textContent = EVENT_LABELS[event.kind];

    const mag = document.createElement('span');
    mag.className = 'mag';
    mag.textContent = event.magnitude.toFixed(2);

    li.append(time, kind, mag);
    refs.list.prepend(li);

    while (refs.list.childElementCount > MAX_EVENT_ROWS) {
      refs.list.lastElementChild?.remove();
    }
  };

  const reset = (): void => {
    history.length = 0;
    eventCount = 0;
    refs.list.replaceChildren();
    refs.empty.hidden = false;
    setText(refs.count, '0');
    setText(refs.clock, '00:00');
    for (const el of [refs.hr, refs.hrv, refs.rr, refs.temp, refs.activity, refs.posture]) {
      setText(el, '–');
    }
    for (const el of [refs.noise, refs.ambient, refs.light]) setText(el, '–');
    redrawTrend();
  };

  reset();
  return { push, pushEvent, reset };
}
