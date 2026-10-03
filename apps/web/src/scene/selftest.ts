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
  /** 猫当前的混合参数（用于断言「切换确实改变了状态」） */
  catPose: Record<string, number | boolean>;
  issues: string[];
  /** 槽位状态：区分「资产没到」与「资产到了没换上」 */
  slots?: Record<string, string | number>;
  /** 猫的世界坐标（保留两位小数）：用于断言状态切换真的把它挪到了另一个锚点 */
  catAt?: [number, number, number];
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
    // 时间点刻意错开：等资产与首帧稳定 → 切激动（含 0.8 s 过渡）→ 回传 → 切回平静 → 回传
    window.setTimeout(() => post(), 6000);
    window.setTimeout(() => {
      call(handle, 'setCatState', 'agitated');
    }, 8000);
    window.setTimeout(() => post(), 10_500);
    window.setTimeout(() => {
      call(handle, 'setCatState', 'calm');
    }, 12_000);
    window.setTimeout(() => post(), 14_500);
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
