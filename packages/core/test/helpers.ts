/**
 * 测试用的确定性抽样器。
 *
 * 刻意**不依赖任何 workspace 包**：那些包经 node_modules 符号链接解析，
 * 而 Node 的类型剥离会拒绝 node_modules 下的文件（ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING）。
 * 因此 core 的测试必须自带这一小段。
 */

/** mulberry32 → 标准正态抽样器（Box–Muller）。 */
export function makeNormal(seed: number): () => number {
  let a = seed >>> 0;
  const unit = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => {
    const u1 = Math.max(unit(), Number.EPSILON);
    const u2 = unit();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
}

/** 生成 n 个 N(mean, sd) 样本。 */
export function normalSeries(seed: number, n: number, mean: number, sd: number): number[] {
  const g = makeNormal(seed);
  return Array.from({ length: n }, () => mean + sd * g());
}

/** [0,1) 均匀抽样器，用于构造尖峰位置等。 */
export function makeUnit(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
