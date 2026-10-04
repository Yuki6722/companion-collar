/**
 * 24 小时活动倾向：把「猫一天里什么时候更可能动起来」写成确定性函数。
 *
 * ⚠️ 这是本模块最重要的一个取舍，务必连注释一起读：
 *   `crepuscularRhythm` 在证据登记表里是 **`disputed`**（n=61 的研究显示日间/夜间静息时长
 *   有差异，而 n=5 的研究未检出总活动量的日节律）。因此本函数**只输出 0–1 的相对倾向权重**，
 *   用于在行为选择时加权；它**不输出峰值时刻**，界面上也**不展示它的数值**。
 *   一旦把它当成「猫在 06:00 最活跃」的确切事实使用，就违反了证据政策。
 *
 * 另外，进食的双峰（约 04–08 与 16–20）在文献里**部分由饲喂制度决定**，
 * 因此它在这里被当作「饲主作息」的代理，而不是猫的内生节律。
 */
import type { EvidenceTag } from '../types.ts';

export interface RhythmDef {
  id: string;
  label: string;
  evidence: EvidenceTag;
}

/** 各时段的基准活动倾向。相邻时段之间做平滑插值，避免行为在整点突变。 */
const BASE_BY_HOUR: readonly number[] = [
  0.1, 0.12, 0.14, 0.2, 0.5, 0.92, // 00–05
  0.78, 0.86, 0.88, 0.72, 0.5, 0.42, // 06–11
  0.34, 0.3, 0.3, 0.34, 0.52, 0.8, // 12–17
  0.9, 0.76, 0.58, 0.36, 0.24, 0.14, // 18–23
];

/** 饲主活动时段（演示用代理）：进食与砂盆使用的双峰都落在它两侧。 */
const OWNER_ACTIVE_FROM_H = 7;
const OWNER_ACTIVE_TO_H = 22;

/**
 * 24 小时活动倾向（0–1）。
 *
 * @param hourOfDay 当日小时数，可为小数；越界会自动取模。
 */
export function activityWeightAt(hourOfDay: number): number {
  const h = ((hourOfDay % 24) + 24) % 24;
  const i0 = Math.floor(h);
  const i1 = (i0 + 1) % 24;
  const frac = h - i0;
  const a = BASE_BY_HOUR[i0] ?? 0.3;
  const b = BASE_BY_HOUR[i1] ?? 0.3;
  // 平滑插值：线性段读起来会在整点出现折角，用 smoothstep 让曲线连续
  const k = frac * frac * (3 - 2 * frac);
  return a + (b - a) * k;
}

/** 是否处于「主人通常不在家」的时段（用于进食/砂盆窗口与无人时段差异建模）。 */
export function isOwnerAwayHour(hourOfDay: number): boolean {
  const h = ((hourOfDay % 24) + 24) % 24;
  return h < OWNER_ACTIVE_FROM_H || h >= OWNER_ACTIVE_TO_H;
}

export const OWNER_ACTIVE_HOURS: readonly [number, number] = [OWNER_ACTIVE_FROM_H, OWNER_ACTIVE_TO_H];

export const RHYTHM_DEFS: readonly RhythmDef[] = [
  {
    id: 'activityWeightAt',
    label: '24 小时活动倾向（相对权重，非峰值时刻）',
    evidence: {
      tier: 'disputed',
      source:
        'Yamazaki et al. 2020, PLoS ONE 15(7): e0236795；Piccione et al. 2014, Biological Rhythm Research 45(4): 615–623',
      note: '来源冲突：是否存在稳健日节律，文献意见不一致（样本量 61 vs 5，测量指标与饲养条件均不同）。因此只输出相对倾向，不输出峰值时刻。进食双峰另有 04–08 / 16–20 的记录，但部分由饲喂制度决定。',
      range: [0, 1],
    },
  },
];
