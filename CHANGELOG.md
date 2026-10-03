# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- **行为建模（第二阶段）：让猫在场景中自主行动**。调研底稿见
  [`docs/research/05`](docs/research/05-cat-home-behavior-repertoire.md)（家猫在宅行为谱系）
  与 [`06`](docs/research/06-cat-acute-observables.md)（急性可观察信号），
  设计与验收见 [`docs/design/04-home-scene-stage2.md`](docs/design/04-home-scene-stage2.md)。
  - `@camp/core/src/behavior/`：行为词汇（**单一事实来源**）、证据参数登记表、24 小时活动倾向、
    行为调度、时间线引擎。时间线满足三条不变量：**连续覆盖**（`Σ durS === durationS`）、
    **不依赖 wall clock**、**突发是覆盖层而非新轴**。
  - 证据政策落到类型上：`unverified` 参数的 `value` 恒为 `null`（界面显示「未取得可靠来源」），
    `disputed` 必须是二元区间；操作化常量单列一张表并逐项写明「为什么这么选」。
  - `@camp/simulator`：行为时间线接入会话——采样通道增补 `activityId`/`anchorId`，
    **事件流改由行为段派生**（保证「抓挠事件必定落在抓挠段内」），
    突发注入写入 `truth.injectedIncidents`，突发区间内生理读数同向变化。
  - `apps/web`：猫按时间线自主走动、攀跳、抓挠、理毛、进食、饮水、用猫砂盆、躲藏、高处停留；
    **头顶状态标签**把行为模型外显；手动演示档位原样保留并与自主行为互斥；
    五种突发动作演示（抽搐 / 呼吸急促 / 僵直不动 / 躲藏退避 / 干呕）。
  - 5 种突发的**身体动作配方**（`IncidentMotion`）：抖动 / 呼吸 / 僵直等通道。
    `freezing` 刻意不做抖动——它要传达的正是「长时间静止」，只能靠僵直与更慢更浅的呼吸区分。
  - `ACTIVITY_MOTION`：进食/饮水/用砂盆三者的姿势都是「蹲伏」，靠头部与重心微动作区分。

### Fixed
- **「点突发没反应」**：突发此前只换姿势、没有任何身体动作，于是「抽搐」在画面上
  就是一只趴着不动的猫。现按配方驱动抖动/呼吸/僵直。
- **「点突发后头顶标签不更新」**：`HomeScene` 的两条创建运行时的路径各写了一份 `onStatus`，
  点突发那条漏了标签。现提成**一个字段**，结构上不可能再漏。
- **「猫会瞬移、看不到吃/喝/用砂盆」**：演示倍率把一切压扁——位移段真实时长仅 0.3–3 秒、
  进食仅约 0.5 秒。现把**位移时长与时间线时长解耦**（位移只花自己走得完的时间，
  到得早就地等待），倍率 60→20、步速 0.45→0.3 m/s，并给位移动画加 12 秒上限。
- **突发演示被倍率二次压缩**：`demoDurationS` 已是「给人看的秒数」，再乘 20× 后
  15 秒的抽搐只渲染 0.75 秒。现突发段按**真实时间**推进。
- **`simulator` 对 core 的运行时导入必然失败**：`@camp/core` 是 node_modules 目录联接，
  而 Node 24 拒绝为该路径下的文件剥类型（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`）。
  过去只有类型导入才没暴露；现改相对路径，并在 `AGENTS.md` §5.5.6 记下该约束。
- `scripts/dev-server.mjs` 默认监听 `0.0.0.0` 并打印局域网地址（扫码即看的分发前提）。

### Verified
- typecheck 3/3 通过（core / simulator / web）
- 单元测试 **87/87** 通过（core 61、simulator 22，含行为 26）
- 措辞门禁通过（扫描 68 个文件，豁免 7 个，12 条禁词）
- 静态站构建产出 **138 个文件**

### Added（家居空间建模 · 第一阶段）
- **家居空间建模（第一阶段）**：`apps/web` 新增「家居场景」屏（默认首页）——
  7.2×5.6×2.75 m 写实风格开间样板间，含猫爬架、饮水机、食盆、猫砂盆 ×2、猫窝、纸箱、抓板、
  壁挂跳台与柜顶通道，以及床、衣柜、冰箱、开放式厨房、电视与电视柜、沙发、茶几、置物架、地毯、
  落地灯等饲主家具。设计、资产许可与验证方式见 [`docs/design/03-home-scene-stage1.md`](docs/design/03-home-scene-stage1.md)，
  截图见 `docs/design/shots/`。
- **橘猫的两套手动演示状态**（平静舒适 / 激动不适）：参数化姿态、耳朵、尾巴、瞳孔、呼吸与动作幅度，
  0.8 s 过渡且**可中途打断**。姿态与位置都由 wall clock 推导而非逐帧累加——否则后台标签降帧会卡住状态。
  界面明确标注这是手动演示档位，**不是**系统对猫状态或情绪的推断。
- `@camp/core/src/home.ts`：居家资源清单规则（`summarizeHomeResources`）——
  把房间里的资源折算成 AAFP/ISFM 检查项，逐条带证据等级与来源；
  **与房间内容无关的项固定 `unknown`**（界面显示「需你确认」），绝不因缺数据而默认合格；
  指南未给米制阈值的判据（分离距离、离通道距离、可俯瞰高度）标为**操作化常量**并写明理由。
  新增 11 项单测（`packages/core/test/home.test.ts`）。
- `scripts/fetch-assets.mjs`：幂等抓取 CC0 资产（10.56 MB，含字节校验与许可清单生成）。
- `scripts/smoke-scene.mjs`：场景自检断言——读取浏览器回传的快照，验证渲染、资产替换与状态切换。
- `apps/web/public/styles.css`；`scripts/dev-server.mjs` 增加 `POST /__selftest` 端点（仅本地预览）。

### Changed
- `apps/web` 从单页骨架改为**两屏 + hash 路由**：家居场景 / 工程自检（原骨架自检内容迁到 `screens/status.ts`）。
- `scripts/build-web.mjs` 增加 three vendoring：把 `three.module.js`/`three.core.js` 与**递归解析**出的
  addon 依赖复制到 `dist/vendor/three/`，由 import map 指向同源路径（运行时零外链）。
- 家具风格统一为现代简约（截图核对后逐件替换）：边柜 → 柚木抽屉柜；置物架 → 程序化浅橡木开架；
  沙发 → 程序化现代低矮布艺款并**正对电视**。取舍记录见设计文档 §4。
- `scripts/dev-server.mjs` 补齐 `.gltf/.glb/.bin/.hdr` MIME；`.gitattributes` 标注 3D 资产为二进制。

### Verified
- typecheck 3/3 通过（core / simulator / web）；静态站构建产出 106 个文件
- 单元测试 **27/27** 通过（core profile 5 + home 11、simulator 11）
- 措辞门禁通过；场景自检 11/11 通过（`scripts/smoke-scene.mjs`）

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
