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
// 行为层：词汇、证据参数登记表、节律、时间线引擎（含猫的锚点能力契约）
export * from './behavior/index.ts';
// 生理读数层：项圈三通道（心率/呼吸/体表温）的读数有效性、分层基线、同条件漂移、睡眠呼吸频率
export * from './vitals/index.ts';
// 生理状态层：状态 → 心率/呼吸/体动的注入规则与项圈可观测特征（抽搐 / 呕吐）
export * from './physiology/index.ts';
