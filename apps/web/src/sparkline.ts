/**
 * 零依赖 SVG 迷你趋势线。
 *
 * 为什么不用 uPlot：本仓决定不引入打包器（AGENTS.md §5.5.2），
 * 第三方库若以裸标识符导入，必须同步维护 apps/web/index.html 的 import map；
 * 第二阶段只需要一条趋势线，手写 SVG 更小、故障面更少。
 * 后续若图表复杂度上来，再按 import map 的既有约定接入。
 */

export interface SparklineBox {
  width: number;
  height: number;
  /** 只取末尾这么多点参与绘制，默认 60 */
  window?: number;
}

/**
 * 生成一条折线的 SVG 字符串。
 *
 * 刻意不做「看起来很忙」的假波动：
 * 点数不足 2、或所有取值相同时，退化为一条水平基线。
 */
export function renderSparkline(values: readonly number[], box: SparklineBox): string {
  const { width, height } = box;
  const win = box.window ?? 60;
  const pts = values.slice(-win);
  const pad = 6;
  const innerH = height - pad * 2;
  const head = `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-hidden="true">`;
  const tail = `</svg>`;

  if (pts.length < 2) {
    const y = (pad + innerH / 2).toFixed(1);
    return `${head}<line x1="0" y1="${y}" x2="${width}" y2="${y}" class="spark-base"/>${tail}`;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of pts) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;

  const stepX = width / (pts.length - 1);
  const coords: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    const v = pts[i];
    if (v === undefined) continue;
    const ratio = span === 0 ? 0.5 : (v - min) / span;
    const x = i * stepX;
    const y = pad + (1 - ratio) * innerH;
    coords.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  return `${head}<polyline class="spark-line" points="${coords.join(' ')}"/>${tail}`;
}
