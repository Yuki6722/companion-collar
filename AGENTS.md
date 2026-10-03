<!-- claims-check:ignore-file -->
# AGENTS.md — 给 AI agent 的项目说明

> 本文件是**面向 AI agent 的契约**。接手本仓库的 agent 请先读完本文件，再动手。
> 人类协作者也建议读一遍——它记录了所有「为什么这么做」的判断依据。

---

## 1. 这个仓库是什么

**companion-collar / 基线哨兵 · 离家事件流**：3 天 Vibe Coding Camp 的团队交付。

> **一句话定位**：**你上班时，它经历了什么；以及，它是否正在慢慢变化。**

面向**在外工作的年轻养宠人**：白天不在家，不知道宠物的健康状况。产品由两部分组成：

- **离家事件流** —— 按主人不在家的时段，汇总「发生了什么事件」（抓挠、摩擦、碰撞、甩头、姿势改变、发声、环境噪声），只描述**事件与比值**
- **基线哨兵** —— 相对**这只宠物自己的基线**检测指标漂移（活动、静息活动、心率、HRV、呼吸、发声、抓挠、躲藏占比、噪声事件），只描述**变化**

配套一个**项圈形态方案 + 数据仿真器**（本次不造真硬件，数据全部仿真且带已知真值）。

**为什么是这个方向**：「了解宠物感受」其实是四个问题——①它现在感觉如何（**不可回答**，Mendl et al. 2010：动物情绪体验不可直接测量）②我不在时发生了什么（可回答）③它在慢慢变化吗（可回答，**且这是主人的盲区**，PLOS ONE 2026 n=647 + AAFP 指南）④我家环境够不够（可回答）。**本项目只回答 ② 和 ③**；市面产品都在答 ①，这正是它们答不好的原因。

**团队三人**（由各自的研究报告确定分工）：

| 代号 | 工作流 | 交付面 |
|---|---|---|
| **A** | 硬件与仿真线 | `pnpm sim:generate` 产出带注入漂移的场景数据；项圈规格与形态方案 |
| **B** | 前端与体验线 | 可扫码访问的线上 URL（事件流 / 漂移报告 / 宠物档案三屏） |
| **C** | 基线引擎与验证线 | 带证据标签的漂移输出；前后测验证报告 |

---

## 2. 阅读顺序

1. 本文件（硬约束 + 证据政策）
2. [`docs/research/`](docs/research/) —— 三份研究报告，本项目的**全部科学依据**。**改动任何面向用户的主张前，先回到这里核对。**
3. [`docs/design/00-plan-3day-camp.md`](docs/design/00-plan-3day-camp.md) —— 已批准的完整开发计划
4. [`docs/design/02-evidence-policy.md`](docs/design/02-evidence-policy.md) —— 证据分级与措辞纪律
5. [`README.md`](README.md) —— 面向人的快速上手

---

## 3. 硬约束（违反即返工）

这四条来自三份报告的交叉结论，**不是偏好，是有证据支撑的边界**：

### 3.1 不做头显 VR / WebXR
iOS Safari 全版本不支持 WebXR，而主力用户是手机端。真做头显等于锁定最小受众。

### 3.2 不做声音语义翻译
猫行为咨询师（十年、3000+ 例）已公开指出：猫的焦虑发声与发情声相似，标准化翻译可能造成危险误判；合成声还可能诱发应激与攻击。**若碰声音，只做真实录音的单向刺激。**

### 3.3 不提供触觉感受检测
宠物的触觉器官在**面部触须与爪垫**，项圈在颈部——传感器位置与感觉器官位置**根本错配**，这是物理问题，不是工程难度问题。
项圈可交付的只有**触觉相关身体事件**（抓挠、摩擦、碰撞、甩头、姿势改变）。

### 3.4 不提供生理读数用于临床
全部数据为仿真。任何读数都不构成兽医诊断依据。做健康提示时必须给出边界与转诊路径。

---

## 4. 证据政策（本仓库最独特的部分）

### 4.1 每个参数必须带证据等级
`Tier = 'strong' | 'moderate' | 'weak' | 'unverified' | 'disputed'`

- **`unverified` → 不得展示具体数值。** 例如犬视野常引 240°–250°，但三份报告都未取得一手来源，因此**不使用该数字**。
- **`disputed` → 必须展示为区间**，并给出「来源冲突」提示，不打单一数字。

### 4.2 当前已知的四处冲突参数（不要擅自合并成一个数字）

| 参数 | 冲突双方 |
|---|---|
| 猫闪烁融合频率 | 58 Hz（Loop & Frey 1982，同行评审直接行为学测量）vs 70–80 Hz（兽医继续教育材料） |
| 猫听阈 | 58 Hz–75 kHz（综述汇总表）vs 45–64 kHz（常见引用） |
| 猫视锥数量 | 2（主流动物视觉文献）vs 3（兽医材料） |
| 犬视野 | 240°–250°（广泛流传）vs **无一手来源** → 标 `unverified`，不使用 |

### 4.3 措辞纪律由 CI 强制
`pnpm check:claims` 扫描源码与文档，命中禁词即**构建失败**。

- 例外一：同一行含否定标记（`不构成`/`不是`/`禁止`/`❌` 等）视为边界说明。
- 例外二：文件前 15 行含 `claims-check:ignore-file` 者整份豁免——供 policy 文本自身使用。
- `docs/research/` 整目录豁免（归档的第三方与历史报告需要能批判性地讨论这些词）。

**允许的宣称只有这些**（可证伪）：可视化猫的视野与身体尺度 · 按证据等级展示听阈范围 · 核查居家资源是否符合权威指南 · 提示可能值得关注的生理变化（非诊断） · 环境影像记录。

**方法论立场**：只说可证伪的事。说「我们可视化猫的视野与身体尺度」，不说「我们知道猫在想什么」。主动承认先行工作（iStrayPaws, VRST 2024 已证明第一人称动物 VR 可提升共情），比被质疑后承认更有说服力。

---

## 5. 包边界与公共 API

```
@camp/core        ← 领域类型、稳健基线、漂移检测、档案推导、措辞政策
@camp/simulator   ← 依赖 core；仿真数据生成、DeviceAdapter 实现、CLI
@camp/web         ← 依赖以上两者；不反向被依赖
```

**规则**
- `core` 是唯一定义共享类型的地方。`simulator` 与 `web` 只消费，不重复定义。
- `web` 绝不反向依赖或绕过公共 API 访问内部文件。
- 跨包改动走 PR，包内自留地可直接提交 `main`。

**类型层保障**：凡面向用户展示的参数值，其类型必须携带 `EvidenceTag`——没有证据标签的参数**无法通过类型检查**。

---

## 5.5 代码约束（编译期强制，踩过坑）

### 5.5.1 只能用「可擦除语法」
Node 的类型剥离是 **strip-only**：它只删除类型，不做代码生成。因此以下语法**全仓禁用**，否则运行时会抛 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`：

- ❌ `constructor(private readonly x: T)` —— **参数属性**
- ❌ `enum` / `const enum`
- ❌ `namespace` / `module`
- ❌ 构造函数参数上的装饰器元数据

**替代写法**：
```ts
class Foo {
  private readonly bar: Bar;
  constructor(bar: Bar) { this.bar = bar; }   // 显式赋值
}
```

`tsconfig.base.json` 已开启 **`erasableSyntaxOnly: true`**，会在 `pnpm typecheck` 阶段直接报错——不要靠记忆，靠门禁。

### 5.5.2 不用打包器
**决策**：不用 Vite / webpack / esbuild。构建 = `tsc` 编译 + 浏览器原生 **import map**。

**原因**：本环境下 Vite 7 的依赖图（rolldown / lightningcss 原生二进制）安装失败（`ERR_PNPM_SYMLINK_FAILED`），而应用是原生 TS + DOM，打包器不带来实际价值。tsc + import map 零原生依赖，GitHub Pages 部署无需任何构建工具链。

import map 定义在 [`apps/web/index.html`](apps/web/index.html)，把 `@camp/*` 裸标识符映射到编译产物。**新增 workspace 包时必须同步更新该映射**，否则浏览器无法解析。

**第三方库（目前只有 three）走同一套机制**：`three` 与 `three/addons/` 也映射到同源路径 `./vendor/three/…`，由 `scripts/build-web.mjs` 在构建时把运行时**递归解析并复制**进 `dist/vendor/three/`。
- 为什么递归：`GLTFLoader` 依赖 `utils/BufferGeometryUtils.js`、`utils/SkeletonUtils.js`，手写清单会随 three 升级漏文件，且要到运行时才炸。
- 为什么复制而不是指向 `node_modules`：部署产物只有 `dist`，运行时必须零外链。
- three 是 `apps/web` 的 **devDependency**（只作构建期源码），`@types/three` 同理；**不要在 `core` 里引入 three**。

### 5.5.3 TypeScript 必须是 5.x
`typescript@7` 是原生编译器预览版，需要平台二进制包 `@typescript/typescript-win32-x64`，在本环境装不上。**钉在 `^5.9`**。

### 5.5.4 `core` 不得在运行时导入其它 workspace 包
Node 的类型剥离（strip-only）**明确拒绝 node_modules 下的文件**——而 workspace 包在跑测试时是经 node_modules 符号链接解析的，于是抛：

```
ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING
```

**推论（务必遵守）**
- `@camp/core` 源码里**不能出现运行时的跨包 import**（连 `export ... from '@camp/core'` 这种转发都不行）
- 依赖方向只能是 `simulator → core`、`web → core + simulator`
- 因此 `core` 自带所需的最小实现。目前两处刻意保留的"重复"，**都不是疏忽**：
  - `core/src/drift.ts` 的 `makeShuffleRng` —— 置换检验只需要打乱能力
  - `simulator/src/prng.ts` 的 `Rng` —— 数据生成需要完整抽样器（正态、区间、概率）
- **测试文件也不例外**：`packages/core/test/helpers.ts` 自带确定性抽样器，正是为了不 import `@camp/simulator`

### 5.5.5 措辞表的单一事实来源
禁词表只在 **`packages/core/src/claims.ts`** 定义一处。`scripts/check-claims.mjs`（构建期门禁）与 `core/test/drift.test.ts`（断言输出不含禁词）都从那里读取。

**新增禁词只改 `claims.ts` 一处**，门禁与测试同时生效。该文件带 `claims-check:ignore-file` —— 它必须能写出禁词本身。

### 5.5.6 `simulator` 对 core 的**运行时**导入也必须用相对路径（2026-10 补记）
§5.5.4 只写了「`core` 不得反向导入」，**反过来的方向有同一个坑**，而且更隐蔽：

```ts
// ❌ 运行时导入会炸
import { activityAt } from '@camp/core';
// ✅ 相对路径
import { activityAt } from '../../core/src/index.ts';
```

**症状**：`node packages/simulator/test/simulator.test.ts` 抛
`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`，指向
`packages/simulator/node_modules/@camp/core/src/index.ts`。

**原因**：`@camp/core` 是 pnpm 在 `node_modules` 下建的**目录联接**，
而 Node 24 的类型剥离（strip-only）**拒绝处理 `node_modules` 下的任何文件**。

**为什么以前没暴露**：`simulator` 过去对 core 只有**类型**导入，类型会被整段剥掉，
从不产生运行时模块请求。**一旦新增一个运行时函数导入（例如行为层的 `activityAt`），
整条链路立刻失败。** web 侧不受影响，因为浏览器走 `index.html` 的 import map。

**纪律**：`simulator` 源码中，凡是**运行时**用到 core 的一律走相对路径；
仅类型导入可以保留 `@camp/core`（可读性更好，且会被剥掉）。
`tsc` 经 node_modules 联接解析 `@camp/core`，`tsconfig.build.json` 按相对路径产出，
浏览器经 import map 解析——三条路径互不冲突。

---

## 6. 命令

```bash
pnpm install
node scripts/fetch-assets.mjs  # 一次性抓取 CC0 3D 资产（已入库，通常无需重跑）
pnpm dev            # 构建 + 静态预览 http://localhost:5273
pnpm build          # 静态站点 → apps/web/dist（无打包器，tsc 编译；含 three vendoring）
pnpm typecheck      # 全 workspace 类型检查（含 erasableSyntaxOnly 门禁）
pnpm test           # node:test 单元测试
pnpm check:claims   # 措辞门禁
pnpm verify         # 以上三者串联（提交前必跑）
pnpm sim:generate -- --seed 42 --scenario noise-event --minutes 240
```

> `pnpm add` 在本仓库要带 `--store-dir .tools/pnpm-store`：`node_modules` 是用那个 store 链接出来的，
> 不指定会报 `ERR_PNPM_UNEXPECTED_STORE`。示例：
> `node <bundled>/pnpm.mjs --store-dir .tools/pnpm-store --filter @camp/web add -D three@0.186.1`.

### ⚠️ DSH 沙箱内的已知限制

沙箱禁止「带管道 stdio 的子进程」，因此以下命令在 **agent 会话内**会失败（人类终端与 CI 不受影响）：

| 命令 | 症状 | 沙箱内的替代做法 |
|---|---|---|
| `pnpm -r <script>` | `Error: spawn EPERM` | 直接调用工具，见下 |
| `node --test <目录>` | `Error: spawn EPERM`（runner 为每个文件派生进程） | **直接执行测试文件** |
| 启动浏览器（Chrome/Edge 无头） | `mojo platform_channel.cc: Check failed` —— 进程间通信用命名管道，被拦截 | 场景自检改由**人在普通终端跑一次**，agent 只读日志断言（`scripts/smoke-scene.mjs`） |

```bash
# 沙箱内的等价验证方式
node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json
node packages/core/test/profile.test.ts          # 同进程执行，node:test 照常工作
node packages/core/test/home.test.ts
node packages/simulator/test/simulator.test.ts
node scripts/check-claims.mjs
node scripts/build-web.mjs                        # 内部 spawn 已用 stdio:'inherit'
node scripts/smoke-scene.mjs                       # 读浏览器回传的自检日志做断言
```

**不要给 `pnpm -r <script>` 传 `--store-dir`**——pnpm 会把它当脚本参数转发下去，导致 `tsc` 报参数错误。该参数只对 `install` / `add` 有效。

---

## 7. 目录结构

```
AGENTS.md                  ← 本文件
packages/core/             [C] 领域类型 · 稳健基线 · 漂移检测 · 居家资源清单规则 · 措辞政策
  src/behavior/               行为词汇 · 证据参数登记表 · 节律 · 时间线引擎
  src/vitals/                 项圈三通道：读数有效性 · 分层基线 · 同条件漂移 · 睡眠呼吸频率
  src/physiology/             状态程序：抽搐/呕吐时的心率·呼吸·体动注入规则与项圈可观测特征
packages/simulator/        [A] 仿真数据生成器 · DeviceAdapter · 行为时间线 · 生理读数仿真 · 曲线导出
apps/web/                  [B] 静态站（tsc + 浏览器 import map，无打包器）
  public/assets/              CC0 3D 资产（模型 / 平铺贴图 / HDRI）+ CREDITS.md
  src/scene/                  3D 场景：layout（权威坐标）· build-* · cat/ · materials · textures
    cat/                        猫模型（含**项圈硬件与触须无干涉区**）· 控制器 · 行为运行时 · 位移推进
  src/screens/                家居场景（含右栏 **App 预览机模**）/ **生理读数** / **居家资源** / 工程自检
docs/research/             七份研究报告（团队共同依据，含归属说明）
docs/design/               产品定义 · 证据政策 · 验证方案 · 三日计划 · 03/04 家居场景各阶段 · 05 项圈生理读数 · 06 状态程序 · 07 布局与 App 预览
docs/design/shots/         场景截图（人工核对的画面证据）
docs/hardware/             项圈规格 · 传感器位置 · 失效源定义 · 真机验证路线
scripts/                   构建 · three vendoring · 资产抓取 · 措辞门禁 · 场景自检 · 部署
data/                      运行时数据（不入库）
```

---

## 8. 关键决策及其理由（避免重复论证）

| 决策 | 理由 | 来源 |
|---|---|---|
| 主交付是**纯静态站**，无后端 | 数据全仿真 → 不需要服务端；GitHub Pages 只托管静态资源；扫码即看是分发前提 | 队友2 报告 |
| 内容骨架锚定 **AAFP/ISFM 五大支柱** | 专业上「环境舒适度」不是感受，而是**可核查的资源清单**（砂盆、食水、睡窝、抓挠面、躲藏处、垂直空间，且需多处分布） | 队友2 报告 |
| **共用机制、分开参数** | 同一房间与叙事，猫狗各自的信息与行动分支；不做万能宠物滤镜 | 队友1 报告 |
| 验证用**窄命题** | 测「居家资源缺口识别率 X%→Y%」，不测「更懂宠物」。后者不可证伪，且「以宠物视角观察自家环境 → 行为改变」这条因果链**无任何直接研究** | 队友2 报告 |
| 仿真器**必须带已知真值** | 没有真硬件时，唯一能证明分析层正确的方法，就是造一个知道答案的数据源 | 本仓库设计 |
| 项目空缺判断 | **没有一款在售产品同时具备摄像头与健康传感**（摄像头型不测生命体征；传感型不带摄像头） | 我的报告 |

---

## 9. 当前进度

**方向（v2）**：从「感知参数可视化」调整为 **「基线哨兵 + 离家事件流」**。完整计划见 [`docs/design/00-plan-3day-camp.md`](docs/design/00-plan-3day-camp.md)。

已完成：
- ✅ 仓库骨架、TypeScript strict + `erasableSyntaxOnly` 门禁、无打包器构建
- ✅ 措辞门禁，禁词表已收拢为**单一事实来源**（`core/src/claims.ts`）
- ✅ `@camp/core`：领域类型、档案推导、**稳健基线（中位数/MAD）**、**漂移检测（稳健效应量 + 置换检验 + 持续性判据）**
- ✅ `@camp/simulator`：确定性 PRNG、四场景、逐通道注入滞后的真值数据、`DeviceAdapter`
- ✅ 三份研究报告归档；`AGENTS.md`、三日计划、证据政策
- ✅ **家居空间建模（第一阶段）**：`apps/web` 的 3D 样板间（写实风格、CC0 扫描模型 + HDRI 环境光）、
  橘猫的两套**手动演示状态**、`@camp/core` 的居家资源清单规则（`summarizeHomeResources`）。
  设计与验收见 [`docs/design/03-home-scene-stage1.md`](docs/design/03-home-scene-stage1.md)
- ✅ **行为建模（第二阶段）**：`@camp/core/src/behavior/` 的行为引擎（词汇、证据参数登记表、
  节律、时间线）、`simulator` 的行为时间线与突发真值、`apps/web` 的**自主行动猫**与
  **手动突发演示**。调研见 [`docs/research/05`](docs/research/05-cat-home-behavior-repertoire.md)
  与 [`06`](docs/research/06-cat-acute-observables.md)，
  设计与验收见 [`docs/design/04-home-scene-stage2.md`](docs/design/04-home-scene-stage2.md)
- ✅ 门禁全绿（**第二阶段验收时的记录**）：typecheck 3/3、测试 83/83、措辞门禁通过、构建 136 个文件
- ✅ **项圈生理读数（第三阶段）**：`@camp/core/src/vitals/`（读数有效性、分层基线、同条件漂移、
  睡眠呼吸频率）、`simulator` 的三通道**读数/真值分离**仿真（运动伪迹、项圈移位、固件拒收、情境偏移）、
  `apps/web` 的 `#/vitals` 屏与 3D 项圈硬件（含触须无干涉区）。
  设计与验收见 [`docs/design/05-collar-vitals.md`](docs/design/05-collar-vitals.md)，
  规格见 [`docs/hardware/01-collar-spec.md`](docs/hardware/01-collar-spec.md)
- ✅ 措辞门禁通过；`core` 的 vitals 层单测 20 项、`simulator` 的 vitals 层单测 9 项全绿
- ✅ **生理状态程序（抽搐 / 呕吐时心率与呼吸怎么变）**：`@camp/core/src/physiology/`
  （多时相状态机、项圈可观测特征、曲线生成）、`simulator` 把状态机接进已有的读数链路
  （替掉平铺的固定百分比表）、`pnpm sim:curves` 导出带真值的曲线 JSON、
  `#/vitals` 屏新增状态程序一节。设计与证据表见
  [`docs/design/06-physiology-state-program.md`](docs/design/06-physiology-state-program.md)。
  单测：core 15 项 + simulator 10 项全绿
- ✅ **场景页布局与 App 预览（iPhone 机模）**：右栏改为**可收起的 iPhone 机模**（实时 / 事件流 /
  漂移 / 档案四个页签，实时页按演示时钟取会话读数并标出无效窗口）；居家资源清单移出主界面，
  成为独立页面 `#/resources`；左栏精简为「操作 + 折叠的图层与画质」。
  ★ 同时**关掉了 stage2 §10 的接缝 1**：场景不再自己生成时间线，改用会话里的 `behaviorTimeline`；
  突发演示改为由 `screens/home.ts` 重建**带注入突发的会话**后交给场景，
  于是画面、事件流、手机读数共用同一条时间轴。设计与验收见
  [`docs/design/07-app-mockup-layout.md`](docs/design/07-app-mockup-layout.md)
- ✅ **读数变化提示与项圈形态（第四轮反馈）**：左栏突发按钮收敛为**抽搐 / 呕吐**两个；
  读数随手动突发产生相应变化（心率/呼吸走生理状态机；**体表温新增发作期响应**，慢通道且有上限、
  由发作本身驱动而非由核心温推算）；`@camp/core/src/vitals/alerts.ts` 统一判据，
  App 端**数字变红 + 弹窗「宠物状态异常」**（正文逐条列出可核查的证据 + 边界句 + 转诊路径）；
  项圈默认可见。误报率实测 **0.5–0.7%/天窗口**，并由单测钉在 < 1%。
  设计与验收见 [`docs/design/08-alerts-and-collar.md`](docs/design/08-alerts-and-collar.md)

待办：
- ⏳ `simulator`：注入**渐进漂移**（线性斜坡）+ `truth.injectedDrift` + 回归断言（Day 1，A）
- ⏳ `core`：`eventRateByKind` / `summarizeAwayWindows` / 离家窗口异常检测（Day 2，C）
- ⏳ `apps/web` 三屏：事件流 / 漂移报告 / 宠物档案（含离家时段）（Day 2，B）
  —— 这三个页签**已在 App 预览机模里出了第一版**，但独立大屏版本仍未做
- ⏳ 5–10 人前后测：漂移识别率（Day 3，C）
- ⏳ **GitHub Pages 启用**（建议提前跑通，避免 Day 3 卡壳）
- ⏳ 家居场景第三阶段候选：用户自助编辑 `HOME_RESOURCES`；「现状 / 达标」双布局对比
- ⏳ 生理读数后续：真机 `DeviceAdapter` 实现；体表温 vs 直肠温的裁决实验（见 hardware §4.2）
- ⏳ 生理状态程序后续：给 `labored-breathing` / `withdrawal` / `freezing` 建立生理时相
  （目前走兜底平表）；`INCIDENT_DEFS.seizure.demoDurationS` 是否从 15 s 提到 30 s
  以容纳完整恢复段（见 design 06 §6.3）

阶段 tag：`v0.0.1`（骨架）→ `v0.1.0`（Day1）→ `v0.2.0`（Day2）→ `v1.0.0`（Day3）

---

## 10. 约定

- **提交**：Conventional Commits，scope 用包名（`feat(core): …` / `feat(web): …` / `feat(sim): …` / `docs: …`）
- **分支**：`main` 为集成；个人分支 `feat/<a|b|c>-<topic>`
- **tag**：每阶段一个 annotated tag，tag message 写明当日交付与验收结果
- **每日集成纪律**：当日结束前 `main` 必须可构建、可演示；未完成的功能留在分支并标 `wip`

---

## 11. 凭证与安全（agent 必读）

- **绝不把任何令牌写入仓库**。`.gitignore` 已排除 `.env*`、`*.pem`、`id_rsa*`、`.tools/`。
- 本机 GitHub 认证走 `gh` CLI（`C:\Program Files\GitHub CLI\gh.exe`，账号 `Yuki6722`，scope `repo`）。**不要在日志或提交信息里回显令牌。**
- 推送前跑 `scripts/preflight`（若存在）扫描敏感文件名。
- 工作区外的写入会被沙箱拦截：pnpm store / cache 已指向工作区内 `.tools/`。**新增工具时请遵循同一原则，不要污染系统目录。**
