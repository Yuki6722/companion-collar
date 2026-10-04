/**
 * 应用入口 —— 饲主状态同步（第一阶段）。
 *
 * 项目中心已从「可视化宠物的感知世界」转为「把宠物的客观情况同步给饲主」：
 * 项圈传感（生理 + 环境 + 触觉相关身体事件）+ 环境影像记录位。
 *
 * 数据来源：@camp/simulator 的确定性仿真（同 seed 同输出，带已知真值）。
 * 真机接入点：DeviceAdapter —— 详见下方 load() 中的说明。
 */
import type { PetProfile, Session } from '@camp/core';
import { collarBudgetOf } from '@camp/core';
import { SCENARIOS, SimulatorAdapter, generateSession } from '@camp/simulator';
import type { ScenarioId } from '@camp/simulator';
import { mountOwnerStatus } from './owner-status.ts';
import type { OwnerStatusView } from './owner-status.ts';

/** 播放节拍：每 150ms 前进一个采样点（仿真间隔为 10s） */
const TICK_MS = 150;
const SEED = 42;
const DURATION_MIN = 240;

const profile: PetProfile = {
  species: 'cat',
  breedId: 'domestic-shorthair',
  weightKg: 4.2,
  heightCm: 24,
  ageMonths: 36,
};

const STYLES = `
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;background:#f6f7f9;color:#232830;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.65}
.page{max-width:760px;margin:0 auto;padding:28px 18px 56px}
.kicker{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#0f766e;font-weight:700;margin:0 0 8px}
h1{font-size:26px;margin:0 0 12px;line-height:1.3}
.lede{color:#3d434e;margin:0 0 24px}
.card{background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:18px;margin:0 0 16px}
.card h2{font-size:15px;margin:0 0 10px}
.muted{color:#6b7280;font-size:14px;margin:0 0 12px}
.small{font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.metric{background:#f9fafb;border:1px solid #eef0f3;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}
.metric .label{font-size:12px;color:#6b7280}
.metric .value{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}
.metric .value.small{font-size:15px;font-weight:500}
.metric .unit{font-size:11px;color:#9ca3af;min-height:14px}
.controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
select,button{font:inherit;padding:8px 12px;border-radius:8px;border:1px solid #d5d9de;background:#fff;color:inherit}
button{cursor:pointer;background:#0f766e;border-color:#0f766e;color:#fff;font-weight:600}
button:hover{filter:brightness(1.08)}
.spark-wrap{background:#f9fafb;border:1px solid #eef0f3;border-radius:10px;padding:8px;margin-bottom:8px}
.spark{width:100%;height:64px;display:block}
.spark-line{fill:none;stroke:#0f766e;stroke-width:2;vector-effect:non-scaling-stroke}
.spark-base{stroke:#d5d9de;stroke-width:1;vector-effect:non-scaling-stroke}
.events{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.event{display:flex;align-items:center;gap:10px;background:#f9fafb;border:1px solid #eef0f3;border-radius:8px;padding:7px 10px;font-size:14px}
.event .t{color:#9ca3af;font-variant-numeric:tabular-nums;font-size:12px}
.event .kind{font-weight:600}
.event .mag{margin-left:auto;color:#9ca3af;font-variant-numeric:tabular-nums;font-size:12px}
.camera-frame{aspect-ratio:16/9;background:repeating-linear-gradient(45deg,#eef1f4,#eef1f4 12px,#e6eaee 12px,#e6eaee 24px);border:1px dashed #c9cfd6;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:13px;margin-bottom:10px}
.boundary{border-color:#eadfc8;background:#fdf9f1}
.boundary ul{margin:0;padding-left:18px;color:#3d434e;font-size:14px}
.boundary li{margin-bottom:6px}
code{background:#eef1f4;padding:1px 5px;border-radius:4px;font-size:13px}
`;

function buildSession(scenario: ScenarioId): Session {
  return generateSession({
    profile,
    seed: SEED,
    durationMin: DURATION_MIN,
    scenario,
  });
}

/** 项圈声明的能力集。展示的是 DeviceAdapter 的契约，不是真实硬件。 */
function capabilityLine(session: Session): string {
  const caps = new SimulatorAdapter(session).capabilities;
  const parts: string[] = [];
  if (caps.camera) parts.push('摄像头');
  if (caps.hr) parts.push('心率');
  if (caps.rr) parts.push('呼吸');
  if (caps.temp) parts.push('体温');
  if (caps.imu) parts.push('姿态');
  if (caps.audio) parts.push('音频');
  return parts.join(' · ');
}

function isScenarioId(value: string): value is ScenarioId {
  return Object.prototype.hasOwnProperty.call(SCENARIOS, value);
}

const app = document.querySelector<HTMLDivElement>('#app');
if (app === null) {
  throw new Error('找不到 #app 挂载点');
}

app.innerHTML = `
<style>${STYLES}</style>
<main class="page">
  <header>
    <p class="kicker">项圈 · 饲主状态同步</p>
    <h1>把宠物的客观情况同步给饲主</h1>
    <p class="lede">
      项圈采集生理与环境读数，记录触觉相关身体事件；外置摄像头提供环境影像记录。
      本页数据全部为仿真，用于验证链路与交互，不是真实测量。
    </p>
  </header>

  <section class="card controls">
    <label for="scenario">场景</label>
    <select id="scenario"></select>
    <button id="toggle" type="button">暂停</button>
    <span class="muted small" id="progress">0 / 0</span>
  </section>

  <section class="card">
    <h2>项圈能力</h2>
    <p class="muted small" id="caps"></p>
    <p class="muted small" id="budget"></p>
  </section>

  <div id="status"></div>
</main>
`;

/**
 * 查询必须存在的元素，缺失即抛错。
 *
 * 不用「先 querySelector、再在顶层统一判空」的写法：function 声明会被提升，
 * TypeScript 不会把顶层判空得到的收窄带进这些闭包，闭包内会重新视为可能为 null。
 */
function required<T extends Element>(root: HTMLElement, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (el === null) throw new Error(`页面骨架缺少元素 ${selector}`);
  return el;
}

const selectEl = required<HTMLSelectElement>(app, '#scenario');
const toggleEl = required<HTMLButtonElement>(app, '#toggle');
const progressEl = required<HTMLElement>(app, '#progress');
const capsEl = required<HTMLElement>(app, '#caps');
const budgetEl = required<HTMLElement>(app, '#budget');
const statusHost = required<HTMLElement>(app, '#status');

for (const def of Object.values(SCENARIOS)) {
  const opt = document.createElement('option');
  opt.value = def.id;
  opt.textContent = def.name;
  selectEl.append(opt);
}

const budget = collarBudgetOf(profile);
budgetEl.textContent =
  `项圈重量上限 ${budget.maxWeightG} g（按体重 2% 的工程经验值，证据等级 weak）；` +
  `带宽容度 ${budget.strapMinMm}–${budget.strapMaxMm} mm。`;

let session: Session = buildSession('living-room-day');
let view: OwnerStatusView | null = null;
let cursor = 0;
let eventCursor = 0;
let timer: number | null = null;

function updateProgress(): void {
  progressEl.textContent = `已同步 ${cursor} / ${session.samples.length} 个采样点`;
}

function tick(): void {
  const sample = session.samples[cursor];
  if (sample === undefined) {
    pause();
    progressEl.textContent = `已同步完毕 · 共 ${session.samples.length} 个采样点`;
    return;
  }
  view?.push(sample);

  // 事件按时间轴推进：采样点跨过事件时间即推送
  while (eventCursor < session.events.length) {
    const ev = session.events[eventCursor];
    if (ev === undefined || ev.t > sample.t) break;
    view?.pushEvent(ev);
    eventCursor += 1;
  }

  cursor += 1;
  updateProgress();
}

function play(): void {
  if (timer !== null) return;
  timer = window.setInterval(tick, TICK_MS);
  toggleEl.textContent = '暂停';
}

function pause(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  toggleEl.textContent = '播放';
}

/**
 * 载入（或切换）场景并重新挂载视图。
 *
 * 这里用本地循环驱动采样，而没有直接调用 SimulatorAdapter.start()：
 * 后者的实现每次调用都从第 0 个采样点重放，无法支持「暂停后继续」。
 * 真机接入时替换此处即可——adapter.start(onSample) 的契约不变。
 */
function load(scenario: ScenarioId): void {
  pause();
  session = buildSession(scenario);
  cursor = 0;
  eventCursor = 0;
  view = mountOwnerStatus(statusHost, session);
  capsEl.textContent = `项圈声明的能力（当前为仿真）：${capabilityLine(session)}`;
  updateProgress();
  play();
}

toggleEl.addEventListener('click', () => {
  if (timer === null) play();
  else pause();
});

selectEl.addEventListener('change', () => {
  const value = selectEl.value;
  if (isScenarioId(value)) load(value);
});

load('living-room-day');
