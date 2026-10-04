/**
 * 确定性伪随机数发生器。
 *
 * 全部仿真数据必须由它驱动，保证「同 seed 同输出」——这是回归测试可用的前提，
 * 也是「用已知真值验证分析层」这一方法论的基础。
 *
 * 注意：`@camp/core` 里另有一份**仅用于置换检验打乱**的最小实现，那不是重复：
 * core 不能在运行时导入任何其它 workspace 包（Node 的类型剥离拒绝 node_modules
 * 下的文件，而 workspace 包在测试时经 node_modules 符号链接解析）。
 */

/** mulberry32：小、快、无依赖，同 seed 严格同序列。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 可复现的辅助抽样器。 */
export class Rng {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** [0,1) */
  unit(): number {
    return this.next();
  }

  /** [min,max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** 标准正态（Box–Muller） */
  normal(mean = 0, sd = 1): number {
    const u1 = Math.max(this.next(), Number.EPSILON);
    const u2 = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** 以概率 p 返回 true */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** 均匀取一个元素（空数组返回 undefined） */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[Math.floor(this.next() * items.length)];
  }
}
