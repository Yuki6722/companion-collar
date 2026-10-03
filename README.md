# 项圈 · 伴侣视角（companion-collar）

> 3 天 Vibe Coding Camp 交付。给猫狗主人：**自定义宠物档案（品种 / 体型 / 年龄）**，看见「同一间屋子在宠物感知下是什么样」，并得到一份**可核查的居家资源缺口清单**。

---

## 这是什么 / 这不是什么

| 是 | 不是 |
|---|---|
| 参数化的**感知差异可视化**（视野、体高、色觉、闪烁融合） | ❌ 不是「还原宠物所见」的真实影像 |
| **按证据等级**展示的物种参数（含来源冲突提示） | ❌ 不是感官数值的权威背书 |
| 依附 **AAFP/ISFM 五大支柱**的资源缺口核查 | ❌ 不是「你的猫幸福吗」的情绪判断 |
| 项圈**形态方案 + 仿真数据流** | ❌ 不是可购买的真机硬件 |
| 提示**可能值得关注**的生理变化 | ❌ 不是诊断、不是治疗建议 |

### 三条硬边界（违反即返工）

1. **不做头显 VR。** WebXR 在 iOS Safari 全版本不受支持，而主力用户是手机。
2. **不做声音语义翻译。** 专业行为咨询师已公开指出猫的焦虑发声与发情声相似，标准化翻译可能造成危险误判。
3. **不宣称检测触觉感受。** 宠物的触觉器官在**面部触须与爪垫**，项圈在颈部——传感器位置与感觉器官位置根本错配。项圈能测的只是**触觉相关身体事件**（抓挠、摩擦、碰撞）。

---

## 快速开始

```bash
pnpm install
node scripts/fetch-assets.mjs   # 一次性抓取 CC0 3D 资产（已入库，通常无需重跑）
pnpm build                      # tsc + import map → apps/web/dist
pnpm dev                        # 静态预览 http://localhost:5273
pnpm verify                     # typecheck + 单元测试 + 措辞门禁
pnpm sim:generate               # 生成一份仿真会话数据
```

打开后默认进入**家居场景**（3D 样板间 + 居家资源清单），右上角可切到**工程自检**。

> ⚠️ **`pnpm dev` 在本机需要能监听端口**。若你是在 DSH 沙箱会话里跑，
> 监听会被拦成 `EACCES`，请在**普通终端**里执行，或按提示给该命令一次沙箱豁免。

## 可以直接打开看的演示入口

构建产物是静态站，用 `node scripts/dev-server.mjs` 起本地静态服务即可（端口 5273）。
它会同时打印本机地址与**局域网地址**——手机同网段输入局域网地址就能看（无需后端）。

| 想看什么 | 打开的地址 |
|---|---|
| **默认：一只在自己活动的猫** | `http://localhost:5273/` |
| 猫特写（相机实时跟随它当前位置） | `http://localhost:5273/?view=cat-follow` |
| 全景（不显示资源标签） | `http://localhost:5273/?view=overview&labels=off` |
| 开场就触发一次**呼吸急促**演示 | `http://localhost:5273/?incident=labored-breathing` |
| 开场就触发一次**抽搐**演示 | `http://localhost:5273/?incident=seizure` |
| 开场就触发一次**躲藏退避**演示 | `http://localhost:5273/?incident=withdrawal` |
| 回到第一阶段的**手动演示档位** | `http://localhost:5273/?mode=manual` |
| 关掉自主行为（只看房间） | `http://localhost:5273/?behavior-off` |
| 自检徽章 + 自动回传快照 | `http://localhost:5273/?debug=1&auto=1` |

其余可用参数：`?state=calm|agitated`（手动档位开场）、`?view=<overview|living|kitchen|bedroom|catZone|cat-follow>`、`?labels=off`（关资源标签）、`?status=off`（关猫头顶的状态标签）。

**猫在做什么**有两个地方能看到：

- **头顶状态标签**（默认开启）——直接标出当前行为与姿势，例如「理毛 · 坐」；
  触发突发演示时会换成醒目配色并显示动作名。动画本身难以表达「抽搐」这类动作，
  这个标签的作用就是把**行为模型外显**：观众不用猜它在抓挠还是在抖。
- **左侧「猫的行为」面板**——同样的信息加上演示时钟与所在位置，可切手动档位、触发突发演示。

突发演示只演示**动作**，不命名任何状况、不构成诊断，面板上常驻边界说明与转诊路径。

## 仓库结构

```
packages/core/        领域类型 · 稳健基线 · 漂移检测 · 居家资源清单规则 · 措辞政策  [C]
  src/behavior/         猫的行为词汇 · 证据参数登记表 · 节律 · 时间线引擎
packages/simulator/   带已知真值的仿真数据生成器 · DeviceAdapter · 行为时间线    [A]
apps/web/             无打包器静态站（tsc + 浏览器 import map → Pages）          [B]
                        家居场景（3D 样板间 + 自主行动的猫） · 工程自检
docs/research/        六份研究报告（团队共同依据）
docs/design/          产品定义 · 证据政策 · 验证方案 · 家居场景设计（03 第一阶段 / 04 行为建模）
docs/hardware/        项圈规格 · 传感器位置 · 真机路线
scripts/              构建 · three vendoring · 资产抓取 · 禁词门禁 · 场景自检 · 部署
```

> 家居空间建模（第一阶段）的设计、资产许可与验证方式见
> [`docs/design/03-home-scene-stage1.md`](docs/design/03-home-scene-stage1.md)；
> 猫的行为建模（第二阶段，含自主行动与突发演示）见
> [`docs/design/04-home-scene-stage2.md`](docs/design/04-home-scene-stage2.md)，
> 证据底稿见 [`docs/research/05`](docs/research/05-cat-home-behavior-repertoire.md) 与
> [`docs/research/06`](docs/research/06-cat-acute-observables.md)。

## 三人分工

| 人 | 工作流 | 交付面 |
|---|---|---|
| **A** | 硬件与仿真线 | `pnpm sim:generate` 产出场景数据；项圈规格与形态方案 |
| **B** | 前端与体验线 | 可扫码访问的线上 URL |
| **C** | 感知模型与验证线 | 带证据标签的参数表；前后测验证报告 |

## 证据边界（重要，别跳过）

- **每个参数都带证据等级**：`strong` / `moderate` / `weak` / `unverified` / `disputed`。
- **已知来源冲突的参数显示为区间**，不打单一数字。当前有 4 处：猫闪烁融合频率、猫听阈、猫视锥数量、犬视野。
- **措辞受 CI 门禁约束。** `pnpm check:claims` 会扫描源码与构建产物，命中禁词即失败。完整禁词表、判据与豁免机制见 [docs/design/02-evidence-policy.md](docs/design/02-evidence-policy.md)。

> **给 AI agent 的说明**：接手本仓库前请先读 [AGENTS.md](AGENTS.md)。它包含硬约束、证据政策、包边界与当前进度。

## 免责声明

本项目为研究与设计转译产物，**不构成兽医诊断或治疗建议**。仿真数据不是真实测量。任何生理读数都不应作为临床决策依据；宠物健康问题请咨询执业兽医。
