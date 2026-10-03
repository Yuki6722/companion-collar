# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Changed
- **产品方向 v2**：从「感知参数可视化 + 居家资源核查」调整为 **「基线哨兵 + 离家事件流」**。
  一句话定位：**你上班时，它经历了什么；以及，它是否正在慢慢变化。**
  依据：「了解宠物感受」其实是四个问题，只有①不可回答（动物情绪体验不可直接测量）；
  主人真正的盲区是③渐变 —— PLOS ONE 2026（n=647）显示主人漏掉**细微**信号，
  AAFP 指南指出客户「被问到引导性问题前未意识到逐渐发生的变化」。
  完整计划见 `docs/design/00-plan-3day-camp.md`。
- `AGENTS.md` 同步重写：新增 §5.5.4（core 不得运行时跨包导入）、§5.5.5（措辞表单一事实来源）

### Added
- `@camp/core/src/baseline.ts`：稳健基线（中位数 / MAD / 1.4826×MAD 等效标准差）。
  样本不足返回 `null`（**绝不猜**）；常量信号标记 `degenerate`，`robustZ` 不会产生 Infinity。
- `@camp/core/src/drift.ts`：漂移检测 —— 稳健效应量 + **置换检验** + **持续性判据**。
  必须 `|delta| ≥ 1.0` **且** `p < 0.05` **且** `sustainedPct ≥ 0.6` 才报 `notable`，
  以避免把**单次尖峰**误判为漂移。`describeDrift` 只描述变化，不描述感受。
- `@camp/core/src/claims.ts`：措辞政策的**单一事实来源**（禁词表、允许宣称、否定标记、豁免目录）
- `@camp/core/test/`：`baseline.test.ts`（10 项）、`drift.test.ts`（10 项）、`helpers.ts`
- `apps/web` 无打包器构建：`scripts/build-web.mjs`（tsc + 浏览器 import map）、`scripts/dev-server.mjs`
- `docs/research/`：三份研究报告归档（含归属说明）；`AGENTS.md`；`docs/design/` 计划与证据政策

### Fixed
- **`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`**：workspace 包经 node_modules 符号链接解析，
  Node 的类型剥离拒绝该路径下的文件。因此 `@camp/core` 不再在**运行时**导入任何 workspace 包；
  置换检验改用 core 内部的最小 PRNG（`makeShuffleRng`），测试自带确定性抽样器。
- 措辞门禁此前把禁词表硬编码在脚本里，导致「描述禁词表」本身就会命中禁词。
  现收拢到 `core/src/claims.ts`，门禁与单元测试共用；`drift.test.ts` 直接遍历该表断言输出不含禁词。
- 仿真器不再重复实现 PRNG —— 保留在 simulator（数据生成），core 只保留打乱用途的最小实现。

### Verified
- typecheck 3/3 通过（core / simulator / web）
- 单元测试 **36/36** 通过（profile 5、baseline 10、drift 10、simulator 11）
- 措辞门禁通过（扫描 25 个文件，豁免 5 个，12 条禁词）
- 静态站构建产出 22 个文件

## [0.0.1] - 2026-10-02

初始骨架：pnpm workspace、TypeScript strict + `erasableSyntaxOnly` 门禁、措辞门禁、
无打包器构建、共享领域类型、确定性仿真器、三份研究报告归档。

[Unreleased]: https://github.com/Yuki6722/companion-collar/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/Yuki6722/companion-collar/releases/tag/v0.0.1
