# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- **家居空间建模（第一阶段）**：`apps/web` 新增「家居场景」屏（默认首页）——
  7.2×5.6×2.75 m 写实风格开间样板间，含猫爬架、饮水机、食盆、猫砂盆 ×2、猫窝、纸箱、抓板、
  壁挂跳台与柜顶通道，以及床、衣柜、冰箱、开放式厨房、电视与电视柜、沙发、茶几、置物架、地毯、
  落地灯等饲主家具。设计、资产许可与验证方式见 [`docs/design/03-home-scene-stage1.md`](docs/design/03-home-scene-stage1.md)，
  截图见 `docs/design/shots/`。
- **橘猫的两套手动演示状态**（平静舒适 / 激动不适）：参数化姿态、耳朵、尾巴、瞳孔、呼吸与动作幅度，
  0.8 s 过渡且**可中途打断**。状态推进由 wall clock 推导而非逐帧累加 —— 否则后台标签降帧会卡住状态。
  界面明确标注这是手动演示档位，**不是**系统对猫状态的推断。
- `@camp/core/src/home.ts`：居家资源清单规则（`summarizeHomeResources`）——
  把房间里的资源折算成 AAFP/ISFM 检查项，逐条带证据等级与来源；
  **与房间内容无关的项固定 `unknown`**，界面显示「需你确认」，绝不因缺数据而默认合格；
  指南未给米制阈值的判据（分离距离、离通道距离、可俯瞰高度）标为**操作化常量**并写明理由。
  新增 11 项单测（`packages/core/test/home.test.ts`）。
- `scripts/fetch-assets.mjs`：幂等抓取 CC0 资产（13.09 MB，含字节校验与许可清单生成）。
- `scripts/smoke-scene.mjs`：场景自检断言 —— 读取浏览器回传的快照，验证渲染、资产替换与状态切换。
- `apps/web/public/styles.css`、`scripts/dev-server.mjs` 的 `POST /__selftest` 端点（仅本地预览）。

### Changed
- **家具风格统一为现代简约**（截图核对后逐件替换，取舍记录见设计文档 §4）：
  - 边柜：`painted_wooden_cabinet`（做旧白 + 锈迹）→ `vintage_wooden_drawer_01`（柚木抽屉柜）；
  - 置物架：`Shelf_01`（风化灰蓝金属）→ 程序化浅橡木开架（薄侧板 + 薄隔板 + 无背板）；
  - 沙发：`sofa_03`（深色木框 + 织锦靠垫）→ 程序化现代低矮布艺款（米灰亚麻、方正座块、
    细金属脚），并**正对东墙电视**（原先朝向反了，沙发是背对电视的）；
  - CC0 库里没有现代款沙发与开架，因此这两件改为程序化：**扫描件负责材质真实，程序化负责风格可控**。
  - 织纹按物件尺寸调强度：同一个 256px 织纹贴图铺在 2 m 宽的沙发上会读成「灯芯绒」，
    现按面宽压低法线强度与织格尺寸（沙发/床品/地毯/猫毯分别取值）。
- 资产总量 13.09 → **10.56 MB**（少两个扫描模型目录）；客厅机位改到沙发前方，能拍到沙发正面。
- `apps/web` 从单页骨架改为**两屏 + hash 路由**：家居场景 / 工程自检；骨架自检内容迁移到 `screens/status.ts`。
- `scripts/build-web.mjs` 新增 three vendoring：把 `three.module.js`/`three.core.js` 与**递归解析**出的
  addon 依赖复制到 `dist/vendor/three/`，由 import map 指向同源路径（运行时零外链）。
- `scripts/dev-server.mjs` 补齐 `.gltf/.glb/.bin/.hdr` MIME；`.gitattributes` 标注 3D 资产为二进制。
- `README.md` 结构说明与快速开始同步（`apps/web` 已不是 Vite 站）。
- **产品方向 v2**：从「感知参数可视化 + 居家资源核查」调整为 **「基线哨兵 + 离家事件流」**。
  一句话定位：**你上班时，它经历了什么；以及，它是否正在慢慢变化。**
  依据：「了解宠物感受」其实是四个问题，只有①不可回答（动物情绪体验不可直接测量）；
  主人真正的盲区是③渐变 —— PLOS ONE 2026（n=647）显示主人漏掉**细微**信号，
  AAFP 指南指出客户「被问到引导性问题前未意识到逐渐发生的变化」。
  完整计划见 `docs/design/00-plan-3day-camp.md`。
- `AGENTS.md` 同步重写：新增 §5.5.4（core 不得运行时跨包导入）、§5.5.5（措辞表单一事实来源）

### Verified
- typecheck 3/3 通过（core / simulator / web）
- 单元测试 **47/47** 通过（core profile 5、baseline 10、drift 10、home 11、simulator 11）
- 措辞门禁通过；静态站构建产出 **122 个文件**
- 场景自检通过：`models=6 tiles=3 env=1 placeholdersLeft=0 issues=0`，且切到激动后
  尾巴/耳朵/瞳孔参数确实改变、两种状态落在不同锚点、切回平静后参数回到起点

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
