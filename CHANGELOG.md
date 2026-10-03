# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- **GitHub Pages 门禁与发布工作流** `.github/workflows/pages.yml`，分三个 job：
  - `verify`：`pnpm typecheck` + `pnpm test` + `pnpm check:claims`。
    措辞门禁进入 CI 后（见 `AGENTS.md` §4.3），「命中禁词即构建失败」才真正成立——
    本地可以忘，CI 不会忘。
  - `build`：`pnpm build` 后自检产物（`index.html`／`.nojekyll`／编译后的 `main.js` 与 `packages/core/src/index.js`），
    再交给 `actions/upload-pages-artifact`。
  - `configure-pages` 以 `enablement: true` 运行，尝试由 Actions 自行补齐 Pages 配置
    （协作者仅有 `write` 权限时直接调 Pages API 返回 404，需仓库所有者操作）；该步骤刻意设为
    `continue-on-error`，避免权限问题连带让门禁与构建变红。
  - `deploy`：仅 `main` 推送时经 `actions/deploy-pages` 发布，PR 只跑门禁与构建。
  - 权限取最小集（默认 `contents: read`，仅 `deploy` job 提权 `pages: write` + `id-token: write`）。
- 站点以**项目子路径**形式发布（`https://<owner>.github.io/companion-collar/`）。
  `apps/web/index.html` 的 import map 使用相对路径，构建产物自带 `.nojekyll`，因此子路径下无需额外改写。

### Fixed
- **测试脚本在 Node 24 下无法运行**：`packages/*/package.json` 的 `test` 由 `node --test test/`
  改为 `node --test "test/*.test.ts"`。
  症状：`Cannot find module '.../packages/core/test'`——Node 24 把目录参数当模块路径解析，
  而非测试目录。CI 首跑（run #1）即在此处失败。
  本地此前未暴露，是因为沙箱内按 `AGENTS.md` §6 的做法直接执行单个测试文件，绕开了目录参数。
  glob 形式在本机与 Linux runner 上都能正确发现测试文件。

## [0.0.1] - 2026-10-02

初始骨架。本日完成基础设施、共享领域模型、仿真器与文档归档。

### Added
- pnpm workspace 骨架：`packages/core`、`packages/simulator`、`apps/web`
- TypeScript strict 基线 `tsconfig.base.json`，含 `erasableSyntaxOnly` 门禁
- **措辞门禁** `scripts/check-claims.mjs`：白名单 + 12 条禁词扫描，
  支持行级否定标记与文件级 `claims-check:ignore-file` 豁免
- **无打包器构建**：`scripts/build-web.mjs`（tsc 编译 + import map）+ `scripts/dev-server.mjs`（零依赖静态服务器）
- `@camp/core`：领域类型（`PetProfile`／`PerceptionProfile`／`PillarGap`／`Session`／`EvidenceTag`）、
  档案推导（年龄分档、体型分档、项圈重量预算、相机机位高度）
- `@camp/simulator`：确定性 PRNG（mulberry32）、四类场景（客厅的一天／多猫紧张／噪声事件／老年行动力）、
  带**逐通道注入滞后**的真值数据生成、`DeviceAdapter` 接口与仿真实现、CLI
- **三份研究报告归档**至 `docs/research/`，含归属说明与各自对本项目的关键结论
- 文档：`AGENTS.md`（面向 AI agent 的契约）、`docs/design/00-plan-3day-camp.md`（已批准计划）、
  `docs/design/02-evidence-policy.md`（证据分级与措辞纪律）

### Notes
- Git 采用工作区内 MinGit 便携版（`.tools/git/`），不入库、不污染系统；
  github.com 直连超时，改走 npmmirror 镜像
- pnpm store / cache 指向工作区内 `.tools/`——沙箱会拦截工作区外的写入
- **TypeScript 钉在 `^5.9`**：`typescript@7` 是原生编译器预览版，需平台二进制包装不上
- **不用打包器**：Vite 7 的 rolldown / lightningcss 原生二进制在本环境安装失败
（`ERR_PNPM_SYMLINK_FAILED`）

### Verified
- `tsc -p` 三个包全部通过
- 单元测试 16/16 通过（core 5、simulator 11）
- 措辞门禁通过（扫描 20 个文件，豁免 4 个）
- 静态站构建产出 16 个文件

[Unreleased]: https://github.com/Yuki6722/companion-collar/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/Yuki6722/companion-collar/releases/tag/v0.0.1
