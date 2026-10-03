/**
 * @camp/core —— 领域类型、稳健基线、漂移检测、档案推导、证据与措辞政策。
 *
 * 公共 API 仅包含本文件导出的内容；`apps/web` 与 `@camp/simulator` 只消费这些。
 *
 * ⚠️ core **不得在运行时导入任何其它 workspace 包**：Node 的类型剥离拒绝
 * node_modules 下的文件，而 workspace 包在测试时经 node_modules 符号链接解析。
 * 因此 core 自带所需的最小实现（见 drift.ts 的 makeShuffleRng）。
 */
export * from './types.ts';
export * from './baseline.ts';
export * from './drift.ts';
export * from './profile.ts';
export * from './home.ts';
export * from './claims.ts';
