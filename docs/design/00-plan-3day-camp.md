<!-- claims-check:ignore-file -->
# 「项圈 + 伴侣视角」3 天 Camp 开发计划

> **状态**：已批准（2026-10-02）。本文件是团队三人的共同执行依据。
> 规划基于三份研究报告的交叉结论，见 [`../research/`](../research/)。

---

## 0. 目标、成功判据与硬约束

**目标**：3 天内交付一个**可扫码即看的网页应用** + 一套**项圈形态与数据仿真**，让猫狗主人通过自定义宠物档案（品种／体型／年龄），看见「同一间屋子在宠物感知下是什么样」，并得到一份**可核查的居家资源缺口清单**。

### 成功判据（v1.0）
1. 手机扫码可打开，无需头显、无需安装；`main` 推送后 GitHub Pages 自动发布。
2. 可选品种／体型／年龄，切换后感知参数与资源清单**随之改变**，且每个参数带证据等级标签。
3. 完成一次 90 秒体验脚本，末尾输出「你家缺哪几项资源」。
4. 完成 5–10 人前后测，产出**资源缺口识别率 X%→Y%** 的结果页。
5. 三天各有一个 tag 已推送 GitHub。

### 硬约束（来自三份报告，违反即返工）

| 约束 | 依据 | 落地方式 |
|---|---|---|
| **不做头显 VR** | 队友2：WebXR 在 iOS Safari **全版本不支持**；主力用户是手机（90后 42.7%、00后 26.3%） | 纯静态站，触摸／陀螺仪视差 |
| **不做声音语义翻译** | 队友2：猫行为咨询师已公开否定，焦虑发声与发情声相似，误译可能诱激发应激 | 若碰声音，只做「真实录音单向刺激」 |
| **不提供触觉感受检测** | 我的报告：触觉器官在**面部触须与爪垫**，项圈在颈部，位置根本错配 | 改为「触觉相关身体事件」（抓挠／摩擦／碰撞） |
| **不提供"还原宠物所见"** | 我的报告：30 fps 低于猫 CFF；视野朝向不同；无嗅觉通道 | 改为「环境影像记录」+「可核查物种参数可视化」 |
| **共用机制、分开参数** | 队友1：同一房间与叙事，猫狗各自的线索与行动分支 | 一套应用，两套参数与分支 |
| **只宣称可证伪的事** | 队友2：说「我们可视化猫的视野／听阈／身体尺度」，不说「我们知道猫在想什么」 | 见 [`02-evidence-policy.md`](02-evidence-policy.md) 的 CI 禁词测试 |
| **锚定权威框架** | 队友2：AAFP/ISFM「五大支柱」把"环境舒适度"变成**可核查的资源清单** | 见 §6 |

**明确不做**：不宣称提升宠物健康、不做诊断、不做情绪判断、不做 VR、不做 AI 情绪识别、不做语义翻译。

---

## 1. 最终产出形态

| # | 产出 | 说明 | 主责 |
|---|---|---|---|
| 1 | **Web 应用**（主交付） | 移动优先静态站，GitHub Pages 部署。含：宠物档案配置 → 感知参数卡 → 视角对比可视化 → 项圈数据面板 → 五大支柱资源清单 → 结果页 | B |
| 2 | **数据仿真器** | 生成带**已知真值**的多通道时序（生理／环境／行为事件），供应用消费与算法验证；预留 `DeviceAdapter` 接口以便将来接真机 | A |
| 3 | **项圈形态方案** | 尺寸/重量预算、传感器位置图、**触须无干涉区**标注、硬件路线文档（本次仿真，真机路径另附） | A |
| 4 | **感知参数与证据登记表** | 品种／体型／年龄 → 体高、视野、色觉、闪烁融合、听阈、活动能力；**每参数带证据等级与来源，冲突值显示为区间** | C |
| 5 | **验证结果** | 5–10 人前后测，窄命题：资源缺口识别率变化 | C |

**为什么是纯静态站**：数据是仿真的 → 不需要服务端；GitHub Pages 只托管静态资源；队友两个项目都是 `github.io`，架构一致；扫码即看是分发前提（队友2 的结论）。

---

## 2. 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 构建 | **Vite + TypeScript（strict）** | 一键 `build` 出静态产物，直接喂 GitHub Pages |
| UI | **原生 TS + DOM**，不引入 UI 框架 | 视图数量有限；3 天内减少构建与状态管理故障面 |
| 3D／视角对比 | **Three.js** | 同一房间用两套相机参数渲染（人眼 1.7 m／三色 vs 宠物低机位／二色／视野角），是队友2 认定的最强演示点 |
| 平面图表 | **uPlot** | 轻量、多序列时间对齐，正合"环境→生理"面板 |
| 状态与持久化 | URL query + `localStorage` | 无后端；档案可分享链接 |
| 测试 | **`node:test` + `node:assert`** | 零依赖；同时用 `tsc --noEmit` 做类型门禁 |
| 部署 | **GitHub Actions → Pages** | 推 `main` 自动发布；本地 `scripts/deploy` 作为回退 |

**开发端口**：Vite dev `5273`（生产为 Pages URL）。

---

## 3. 仓库结构

```
├─ AGENTS.md                      ← 面向 AI agent 的契约（硬约束 + 证据政策）
├─ package.json / pnpm-workspace.yaml / tsconfig.base.json
├─ .gitignore                     ← 排除 .tools/ node_modules/ dist/ data/
├─ README.md  CHANGELOG.md
├─ docs/
│  ├─ research/                   ← 三份研究报告归档（含归属说明）
│  ├─ design/                     产品定义 · 证据政策 · 验证方案 · 本计划
│  └─ hardware/                   项圈规格 · 传感器位置 · 真机路线
├─ packages/
│  ├─ core/          [C] 感知参数模型 · 证据登记 · 五大支柱规则 · 分析层
│  └─ simulator/     [A] 带真值的模拟数据生成器 · DeviceAdapter 接口
├─ apps/web/         [B] Vite 静态站
└─ scripts/          构建 · 回归 · 部署 · 禁词检查
```

---

## 4. 领域模型与数据流

```ts
export type Species = 'dog' | 'cat'
export type SizeClass = 'toy'|'small'|'medium'|'large'|'giant'|'cat-small'|'cat-standard'|'cat-large'
export type AgeBand = 'junior'|'adult'|'senior'|'geriatric'
export type Tier = 'strong'|'moderate'|'weak'|'unverified'|'disputed'

export interface PetProfile {
  species: Species; breedId: string
  weightKg: number; heightCm: number; ageMonths: number
}

export interface EvidenceTag { tier: Tier; source?: string; note?: string; range?: [number, number] }

export interface PerceptionProfile {
  cameraHeightM: number
  horizontalFovDeg: number; binocularFovDeg: number
  colorModel: 'dichromatic'|'trichromatic'
  conePeaksNm: EvidenceTag & { value: [number, number] | null }
  flickerFusionHz: EvidenceTag & { value: number | null }
  hearingRangeHz: EvidenceTag & { value: [number, number] | null }
  olfactory: EvidenceTag
  mobilityFlags: string[]
  collarBudget: CollarBudget
  evidence: Record<string, Tier>
}

export interface PillarGap { pillar: PillarId; status: 'ok'|'gap'|'unknown'
  requirement: string; actual: string; evidence: Tier; source?: string }
```

**数据流**
```
PetProfile ──► core.resolvePerceptionProfile() ──► PerceptionProfile（含证据标签）
PetProfile ──► simulator.generateSession(seed) ──► Session（含 truth）
HomeResources ──► core.evaluatePillars() ──► PillarGap[] ──► 结果页
```

**公共 API（三个包对外只暴露这些）**
- `core`: `resolvePerceptionProfile(p)`, `evaluatePillars(p, res)`, `analyzeSession(s)`, `EVIDENCE`, `CLAIMS`
- `simulator`: `generateSession(cfg)`, `listScenarios()`, 类型 `DeviceAdapter`
- `web`: 仅消费上述；不反向依赖

---

## 5. 感知参数模型与证据登记

### 5.1 参数如何由档案推导
- **体高 → 机位高度**：`cameraHeightM = clamp(heightCm/100 * 0.85, 0.15, 0.7)`
- **品种 → 吻长／耳形／颅型**：`breeds.ts` 存 `muzzleFactor`、`earType`、`brachycephalic`
- **年龄 → 感官与活动能力**：`senior`/`geriatric` 追加 `nightLight`、`ramp`、`lowEntry`
- **体型 → 项圈预算与资源尺寸**：重量上限 = 体重 2%（工程经验值，标 `weak`）；猫砂盆建议长度 = 体长 × 1.5

### 5.2 证据登记表（四处冲突必须显示为区间）

| 参数 | 值 | 等级 |
|---|---|---|
| 犬二色视觉视锥峰值 | 429 / 555 nm | `strong` |
| **猫闪烁融合频率** | **58 Hz ／ 70–80 Hz** | **`disputed`** |
| 犬闪烁融合频率 | 无单一数值 | `moderate` |
| **猫听阈** | **58 Hz–75 kHz ／ 45–64 kHz** | **`disputed`** |
| 犬听阈 | 67 Hz–45 kHz | `moderate` |
| **猫视锥数量** | **2 ／ 3** | **`disputed`** |
| 猫视野 | 200° 总／140° 双眼 | `moderate` |
| **犬视野** | 240°–250° | **`unverified`（不使用该数字）** |
| 犬嗅觉量级 | 高于人类 1–2 个数量级 | `weak` |
| 犬触须为独立感觉器官 | 是 | `strong` |
| **颈部项圈无法测触觉感受** | 位置错配 | `inference` |
| 五大支柱资源清单 | 见 §6 | `strong` |
| 主人细微信号识别能力 | 不优于非养犬者（n=647） | `strong` |
| 95% 猫主人自认了解环境 vs 42% 多猫同住 | — | `strong` |

---

## 6. 五大支柱资源清单

以 AAFP/ISFM「健康猫科环境五大支柱」为骨架，逐条转为**可核查规则**：

| 支柱 | 可核查要求（默认） | 老年/geriatric 追加 |
|---|---|---|
| 1 安全的地方 | 躲藏处 ≥ 1，且不在动线中央 | 低入口、易接近 |
| 2 多个且分离的关键资源 | 猫砂盆／食／水／睡窝／抓挠面各 ≥1，且**分布在 ≥2 个位置簇**；水食不并排 | 每项 ≥2，低位可达 |
| 3 玩耍与捕猎机会 | 每日互动玩耍 ≥2 次 | 低强度、短时多次 |
| 4 可预测的人宠互动 | 固定时段 | — |
| 5 尊重嗅觉的环境 | 无强香氛；清洁剂低味 | — |

**犬的适配**：五大支柱为猫科框架。犬侧以**同类可核查项**替代（独立休息区、每日运动与嗅闻机会、可预测作息、避免强香氛、安全退避处），并在 UI 明示「犬用清单由猫科框架类比改写，标注为 `moderate`」。**不假装犬有权威等价框架。**

**输出形态**：每项返回 `ok | gap | unknown`。`unknown` 用于用户未回答——**不猜、不默认合格**。

---

## 7. 数据模拟器

- **确定性**：`mulberry32(seed)`；同 seed 同输出（可复现回归）
- **场景**：`living-room-day`（默认）、`multi-cat-tension`、`noise-event`、`senior-mobility`
- **生成内容**：环境时序（噪声含突发瞬态、温湿度、光照）／生理时序（心率、HRV、呼吸、体温，**各通道不同滞后**）／行为事件（抓挠、摩擦、碰撞、甩头、姿势改变、发声计数）／资源相关行为（砂盆外排泄、躲藏、垂直空间使用）
- **真值 `truth`**：潜在舒适曲线、注入的资源缺口、注入的滞后
- **`DeviceAdapter` 接口**：为将来真机预留
- **验收**：同 seed 字节一致；滞后估计误差 ≤ 20 s；注入的资源缺口被全部检出

---

## 8. 三人分工

按工作流切分，**每人一个包 + 一个交付面**，边界清晰以减少 3 天内的合并冲突。

### A — 硬件与仿真线（`packages/simulator` + `docs/hardware`）
- 项圈规格：尺寸／重量预算、传感器位置图、**触须与面部无干涉区标注**
- 数据模拟器：四类场景、确定性 PRNG、真值输出、回归种子
- `DeviceAdapter` 接口与未来真机路线文档（含 Dinbeat UNO 作为传感器能力对标）
- **交付面**：`pnpm sim:generate` 可产出场景数据；项圈规格文档；形态示意图

### B — 前端与体验线（`apps/web`）
- 静态站骨架、路由、状态（URL + localStorage）
- **宠物档案配置**：品种／体型／年龄（决定一切下游参数）
- **视角对比可视化**：同一房间，人眼 vs 宠物（低机位／二色／视野角／闪烁融合差异）双画面对照
- 项圈数据面板、五大支柱资源清单 UI、结果页
- 移动端打磨、GitHub Pages 部署、90 秒脚本串场
- **交付面**：可扫码访问的线上 URL

### C — 感知模型与验证线（`packages/core` + `docs/design`）
- 感知参数模型（§5）+ 证据登记表（含 4 处 `disputed` 处理）
- 五大支柱规则化（§6）+ 犬用类比的降级标注
- 分析层：资源缺口识别、环境→生理滞后相关（含置换检验与多重比较校正）
- 措辞白名单 + 禁词 CI
- **验证设计**（§10）：前后测方案、量表、执行与结果页
- **交付面**：参数表带证据标签；验证报告

**交叉约定**：A 与 C 共享 `Sample`／`Session` 类型（由 C 定义，A 实现）；B 只消费两个包的公共 API；跨包改动走 PR。

---

## 9. 三天开发阶段（每阶段一个 tag）

### Day 1 — 骨架可跑 → `v0.1.0`
| 人 | 当日交付 |
|---|---|
| A | 项圈规格文档初稿；模拟器 v1（环境+生理时序 + 真值）；`DeviceAdapter` 接口 |
| B | Vite 静态站骨架；宠物档案配置（品种/体型/年龄）可用；路由与状态 |
| C | 感知参数模型 v1；证据登记表（含 `disputed`）；五大支柱规则 v1 |
| 集成 | 选档案 → 生成模拟数据 → 显示带证据标签的参数表 |

**验收**：`pnpm -r typecheck && pnpm -r test` 通过；能演示「换品种/体型/年龄 → 参数与清单变化」；首个 tag 已推送。

### Day 2 — 体验闭环 → `v0.2.0`
| 人 | 当日交付 |
|---|---|
| A | 模拟器 v2：四场景 + 资源相关行为 + 发声；回归种子脚本 |
| B | 视角对比可视化（Three.js 双画面）；数据面板（uPlot）；资源清单 UI |
| C | 分析层（缺口识别 + 滞后相关 + 置换检验）；禁词 CI 接入 |
| 集成 | 90 秒体验脚本全程走通，产出「缺哪几项」 |

**验收**：禁词测试通过；模拟器回归通过；手机浏览器实测可用。

### Day 3 — 验证与交付 → `v1.0.0`
| 人 | 当日交付 |
|---|---|
| A | 项圈形态呈现；真机路线文档定稿 |
| B | 移动端打磨；扫码入口；Actions → Pages 发布；演示串场脚本 |
| C | 5–10 人前后测执行；结果页；验证报告与证据边界声明 |
| 集成 | 演示彩排；README + CHANGELOG；三份报告归档完成 |

---

## 10. 验证设计（窄命题）

**命题**：使用该体验后，受试者对**居家资源缺口**的识别率从前测 X% 提升到后测 Y%。

- **流程**：前测（看 8 张居家照片，勾出可疑的资源缺口）→ 90 秒体验 → 后测（同组照片，顺序打乱）
- **主指标**：识别率变化（配对比较，报效应量与 95% CI）
- **次指标**（可选）：IRI 简版共情商数前後；「改善意愿」1–5 分
- **样本**：5–10 人，方便抽样，**明确标注为非代表性样本**
- **执行**：应用内建 `?mode=study` 模式，前后测数据导出 JSON
- **诚实边界**：结果页必须写明「n 小、方便抽样、无对照组、仅测即时识别率，不代表长期行为改变」

---

## 11. GitHub 工作流

- `main` = 集成分支；个人分支 `feat/<a|b|c>-<topic>`
- 跨包改动走 PR（至少 1 人 review）；包内自留地可直接提交 `main`
- Conventional Commits
- **阶段 tag**：`v0.0.1`（骨架）`v0.1.0`（Day1）`v0.2.0`（Day2）`v1.0.0`（Day3），annotated
- **每日集成纪律**：当日结束前必须 `main` 可构建、可演示
- **部署**：GitHub Actions push `main` → 构建 `apps/web` → 发布 Pages；本地 `scripts/deploy` 为回退
- **协作**：仓库为三人共同所有，均以 collaborator 身份加入

---

## 12. 边界情况与失败模式

| 风险 | 对策 |
|---|---|
| 三人合并冲突 | 按包切分所有权；跨包改动走 PR；每日集成纪律 |
| 证据争议被当成事实 | 4 处冲突值一律显示**区间 + `disputed` 标签** |
| 被质疑"拟人化" | 措辞白名单 + CI 禁词；主动引用"批判性拟人化"概念 |
| 3D 场景性能拖垮手机 | 少量几何体+纯色材质；「静态对比图」降级模式；不做实时阴影 |
| 视角可视化被误读为真实影像 | 画面固定水印「参数化可视化，非真实影像」 |
| 用户未答资源问题被默认合格 | 统一返回 `unknown`，**绝不默认 `ok`** |
| Day3 验证人数不足 | 设最低 3 人兜底；不足则如实写「n<5，仅作流程演示」 |

---

## 13. 明确假设

1. 3 天 Camp，**无真硬件**，数据全部仿真。
2. 交付以**网页**为主，项圈以**形态方案 + 仿真数据**呈现。
3. 界面语言中文；猫狗双分支，共用一套应用。
4. 三人各自有 GitHub 账号，可被加入同一仓库。
