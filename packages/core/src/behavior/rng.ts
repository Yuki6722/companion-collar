/**
 * core 内部的确定性抽样器，**仅**供行为引擎使用。
 *
 * 为什么不复用 `@camp/simulator` 的 `Rng`（两个硬约束，与 `drift.ts` 的 `makeShuffleRng` 同源）：
 *   1. 依赖方向：`simulator → core`，不能反向；
 *   2. Node 的类型剥离（strip-only）**明确拒绝 node_modules 下的文件**，而 workspace 包在跑测试时
 *      是经 node_modules 符号链接解析的（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`）。
 *      因此 core 不能在**运行时**导入任何其它 workspace 包。
 *
 * 与 `drift.ts` 的 `makeShuffleRng` 的区别（这是本次刻意保留的第二处重复）：
 *   置换检验只需要「打乱」能力（返回 [0,1) 的均匀数即可）；
 *   行为引擎还需要**有界区间抽样、概率判定与按权重选择**，所以这里补一个最小的分布封装。
 */

export interface BehaviorRng {
  /** [0, 1) 均匀分布 */
  next(): number;
  /** [lo, hi) 均匀分布 */
  range(lo: number, hi: number): number;
  /** 以 p 的概率返回 true */
  chance(p: number): boolean;
  /** 按权重取下标；权重全为 0 或数组为空时返回 0 */
  weightedIndex(weights: readonly number[]): number;
  /** 等概率取一个元素；数组为空时返回 undefined */
  pick<T>(items: readonly T[]): T | undefined;
}

/** 32 位确定性 PRNG（mulberry32），实现与 simulator 的版本一致，便于跨包对账。 */
export function makeBehaviorRng(seed: number): BehaviorRng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (lo: number, hi: number): number => lo + (hi - lo) * next();

  const weightedIndex = (weights: readonly number[]): number => {
    let total = 0;
    for (const w of weights) total += w > 0 ? w : 0;
    if (!(total > 0)) return 0;
    let roll = next() * total;
    for (const [i, w] of weights.entries()) {
      const safe = w > 0 ? w : 0;
      if (roll < safe) return i;
      roll -= safe;
    }
    return weights.length - 1;
  };

  return {
    next,
    range,
    chance: (p: number): boolean => next() < p,
    weightedIndex,
    pick<T>(items: readonly T[]): T | undefined {
      if (items.length === 0) return undefined;
      return items[Math.min(items.length - 1, Math.floor(next() * items.length))];
    },
  };
}
