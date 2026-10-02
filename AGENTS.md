<!-- claims-check:ignore-file -->
# AGENTS.md — 给 AI agent 的项目说明

> 本文件是**面向 AI agent 的契约**。接手本仓库的 agent 请先读完本文件，再动手。
> 人类协作者也建议读一遍——它记录了所有「为什么这么做」的判断依据。

---

## 1. 这个仓库是什么

**companion-collar / 项圈 · 伴侣视角**：3 天 Vibe Coding Camp 的团队交付。给猫狗主人一个网页应用，可**自定义宠物档案（品种 / 体型 / 年龄）**，看见「同一间屋子在宠物感知下是什么样」，并得到一份**可核查的居家资源缺口清单**。

配套一个**项圈形态方案 + 数据仿真器**（本次不造真硬件，数据全部仿真且带已知真值）。

**团队三人**（由各自的研究报告确定分工）：

| 代号 | 工作流 | 交付面 |
|---|---|---|
| **A** | 硬件与仿真线 | `pnpm sim:generate` 产出场景数据；项圈规格与形态方案 |
| **B** | 前端与体验线 | 可扫码访问的线上 URL |
| **C** | 感知模型与验证线 | 带证据标签的参数表；前后测验证报告 |

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
@camp/core        ← 类型、感知参数模型、证据登记、五大支柱规则、分析层
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

### 5.5.3 TypeScript 必须是 5.x
`typescript@7` 是原生编译器预览版，需要平台二进制包 `@typescript/typescript-win32-x64`，在本环境装不上。**钉在 `^5.9`**。

---

## 6. 命令

```bash
pnpm install
pnpm dev            # 构建 + 静态预览 http://localhost:5273
pnpm build          # 静态站点 → apps/web/dist（无打包器，tsc 编译）
pnpm typecheck      # 全 workspace 类型检查（含 erasableSyntaxOnly 门禁）
pnpm test           # node:test 单元测试
pnpm check:claims   # 措辞门禁
pnpm verify         # 以上三者串联（提交前必跑）
pnpm sim:generate -- --seed 42 --scenario noise-event --minutes 240
```

### ⚠️ DSH 沙箱内的两个已知限制

沙箱禁止「带管道 stdio 的子进程」，因此以下命令在 **agent 会话内**会失败（人类终端与 CI 不受影响）：

| 命令 | 症状 | 沙箱内的替代做法 |
|---|---|---|
| `pnpm -r <script>` | `Error: spawn EPERM` | 直接调用工具，见下 |
| `node --test <目录>` | `Error: spawn EPERM`（runner 为每个文件派生进程） | **直接执行测试文件** |

```bash
# 沙箱内的等价验证方式
node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json
node packages/core/test/profile.test.ts          # 同进程执行，node:test 照常工作
node packages/simulator/test/simulator.test.ts
node scripts/check-claims.mjs
node scripts/build-web.mjs                        # 内部 spawn 已用 stdio:'inherit'
```

**不要给 `pnpm -r <script>` 传 `--store-dir`**——pnpm 会把它当脚本参数转发下去，导致 `tsc` 报参数错误。该参数只对 `install` / `add` 有效。

---

## 7. 目录结构

```
AGENTS.md                  ← 本文件
packages/core/             [C] 感知参数 · 证据登记 · 五大支柱 · 分析层
packages/simulator/        [A] 仿真数据生成器 · DeviceAdapter
apps/web/                  [B] 静态站（tsc 编译 + 浏览器 import map，无打包器）
docs/research/             三份研究报告（团队共同依据，含归属说明）
docs/design/               产品定义 · 证据政策 · 验证方案 · 三日计划
docs/hardware/             项圈规格 · 传感器位置 · 真机路线
scripts/                   构建 · 措辞门禁 · 部署
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

- ✅ 仓库骨架、TypeScript strict 基线、措辞门禁
- ✅ `@camp/core`：领域类型、档案推导（年龄/体型/项圈预算/机位高度）
- ✅ `@camp/simulator`：确定性 PRNG、四场景、带注入滞后的真值数据、`DeviceAdapter`
- ✅ 三份研究报告归档
- ⏳ `resolvePerceptionProfile` + 证据登记表（Day 1，负责 C）
- ⏳ 五大支柱规则化（Day 1，负责 C）
- ⏳ 前端完整 UI：档案配置、视角对比、资源清单（Day 2，负责 B）
- ⏳ 项圈规格与形态方案（Day 1–3，负责 A）
- ⏳ 前后测验证（Day 3，负责 C）

阶段 tag：`v0.1.0`（Day1 骨架可跑）→ `v0.2.0`（Day2 体验闭环）→ `v1.0.0`（Day3 交付）

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
