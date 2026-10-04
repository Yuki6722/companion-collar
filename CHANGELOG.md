# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added（喵喵：写实蒙皮模型与真正的四足走路）
- **家居场景的猫换成写实蒙皮模型**（CC BY 4.0 的孟加拉家猫，来源 / SHA-256 / 署名见
  [`models/CREDITS-CATS.md`](apps/web/public/assets/models/CREDITS-CATS.md)）。原程序化分块橘猫已替换；
  黑猫入口移除（代码里留了 `coat` 参数，**没有接线**）。设计、故障根因与实测数据见
  [`docs/design/09-cat-realistic-model.md`](docs/design/09-cat-realistic-model.md)。
- **`cat-realistic.ts` 是唯一骨骼驱动**：四足两段式 IK（**不缩放骨长**、爪垫保持水平）、
  按**位移距离**推进的四拍步态（支撑腿随身体前进而后移 ⇒ 不脚滑、也不原地踏步）、
  坐卧 / 蹲伏 / 理毛 / 低头、6 段尾巴沿脊线、项圈随颈骨定向、`dispose()` 释放
  geometry / material / texture / skeleton。`cat-model.ts` 收敛为共享 `CatRig` 接口。
- **动作检查页 `cat-studio.html`**：站立 / 行走 / 坐下 / 趴卧 / 舔爪理毛 / 低头进食六档，
  三个机位可旋转检查；场景与检查页共用同一模型与同一套动作驱动。
- **场景走路检查入口** `?view=cat-follow&app=off&walk-check=1&labels=off`：跳到第一个
  `posture === 'walking'` 的位移段，跟随机位陪它走完。
- **自检快照新增 `cat`**（`loaded / bones / walkWeight / action / feet / head`）与项圈**部件名**：
  「真的在迈步」与「只移动位置」在无头环境里必须能区分；`head` 是「身体真的在动」的可断言信号。

### Fixed（喵喵）
- **先瞬移再走**：位移推进把 wall clock 的追赶量（模型加载、首帧着色器编译、标签页切回）
  一次性走完。实测单次采样位移 **0.815 m = 全程 18.6%**（起步 50 ms 内 0.45 m ≈ 8.7 m/s，
  参考步速 0.45 m/s）。改为**只按当帧渲染时间推进、上限 0.1 s、暂停时不推进**：同样 4.38 m 的位移，
  最大单次采样位移降到 **0.121–0.162 m = 2.8–3.7%**，平均 0.29–0.30 m/s。回归测试在修复前会失败。
- **位置在动、骨骼不迈步**：`CatController.update(dt)` 的默认参数 `gaitPhase = 0` 把行为层刚写进去的
  相位清掉。改为外部模式默认沿用上次相位，并暴露 `gaitPhase()` / `currentPosture()`。
- **姿态冻结**：四元数混合的源与目标指向同一对象。改为对「上一帧副本 → 本帧目标」做 slerp。

### Changed（喵喵）
- **项圈硬件多了状态指示灯**（部件 5 → 6）；`scripts/smoke-scene.mjs` 的项圈断言从「数量等于 5」
  改为**按名字**断言必须存在的五个部件，这样「硬件新增」与「部件丢失」不会再给出同样的失败。
  同一处还把「触须无干涉区可独立显示」改成「序列里存在 `whiskerZone=true` 的快照」——
  原写法取的是第一条带项圈的快照，而无干涉区要到 19 s 才打开，这条断言**从写下起就不可能通过**。
- `apps/web/tsconfig.json` 纳入 `test/**`，使新增的场景测试同样受 `erasableSyntaxOnly` 与类型门禁约束。
- 行为层的自动序列改为**等资产就绪再起跑**：猫是异步加载的（5.4 MB），按固定墙钟起跑会把
  「演示时钟在推进」这类断言做成假阴性。

### Verified（喵喵）
- typecheck **3/3**；单测 **161/161**（core 111 / simulator 45 / web 5）；措辞门禁通过；构建 **182 个文件**
- 浏览器实测（CDP 驱动真实 Chrome，约 46–53 fps）：走路 8/8、场景回归 10/10；
  `cat-studio.html` 六档可切、无控制台报错
- 场景自检前后对照（同一套断言、同一台机器、每次全新 Chrome profile）：升级前 **6 项未过**、
  本次 **4 项未过**；差异与相位敏感项已在 09 号文档逐条说明

### Added（读数提示与项圈形态 · 第四轮反馈）
- **左栏突发演示只保留两项**：抽搐与呕吐（`MANUAL_INCIDENT_KINDS`）。它们是"动作 + 多时相生理过程"
  都完整建模的两个；其余三种仍可用 `?incident=` 触发，只是不再占左栏。
- **读数随手动突发产生相应变化**：
  - 心率 / 呼吸走生理状态机（前驱 → 动作 → 恢复），**不是方波**；
  - **体表温新增发作期响应**：慢通道（指数趋近）、有固定上限（抽搐 0.8 °C、呕吐 0.15 °C），
    且**由发作本身驱动，不由核心温推算**——写成函数关系会让"体表温与核心温无相关"这条结论作废。
    回归断言同时改为尺度无关（`|r| < 0.2`、`R² < 0.02`、拟合误差 ≥ 核心温自身标准差）。
- **App 端读数变化提示**（`@camp/core/src/vitals/alerts.ts`，判据与文案的唯一来源）：
  - 两类证据：①通道**可用**且与**同期同条件**参考值偏离超过阈值；②处于急性生理窗口且读数不可采信；
  - 三个"不比较"的前置条件：**跨条件不比、体动大不比、环境吵不比**；
  - 界面表现：该通道**数字变红**（不可用时划线 + 变红），并弹出**「宠物状态异常」**提醒，
    正文逐条列出可核查的证据（通道 / 当前值 / 参考值 / 偏离多少）、常驻边界句与转诊路径；
  - 阈值全部来自 `VITALS_CONSTANTS`（心率 15%、呼吸 20%、体表温 0.5 °C）；
    **误报率实测 0.5–0.7%/天窗口**，并由单测钉在 < 1%。
- **项圈默认可见**：猫脖子上戴着带传感器的项圈（带体 / 电子仓 / 双 ECG 电极 / 体表热敏电阻），
  `?collar=off` 可隐藏，`?collar=zone` 额外标出触须无干涉区。

### Fixed
- **伪迹步行器在有体动结束后继续"活着"**：原先每步 ×0.9 衰减，一次十几秒的高体动会把伪迹"充"到
  100 bpm 以上、随后用几分钟慢慢泄掉——而那几分钟体动已停、读数被标成 **valid**，
  界面上就是一段"心率仍然很高"的假读数。现改为每步 ×0.5、注入项用 `motion⁴`（低于门限的体动几乎不产生伪迹），
  并给伪迹加上下硬上限。
- **体表温的两处操作化取值过大**：环境耦合 0.35、自身慢漂 0.25 会让读数标准差达到 0.67 °C，
  任何亚度级阈值都变成噪声探测（实测误报 5%）。现取 0.12 / 0.15，并把理由写进常量说明。
- **提示层的参考值混用睡眠与静息**：睡眠的心率系统性低约 12%、呼吸低约 22%，
  混在一起会导致"只要猫醒了就报异常"（实测 25% 的窗口误报）。现按**当前条件**取参考值。
- **提示层不该做"行为期望"校正**：生理层的 `idleOpsForActivity` 目前没有被注入会话，
  按它校正会把正常走动读成"偏低"。已移除该校正，并用一条误报率断言把这个耦合钉住。

### Verified（第四轮）
- typecheck **3/3** 通过；静态站构建成功（**170 个文件**）；措辞门禁通过
- 新增单测：`core` 提示层 **10/10**；`simulator` 的 vitals 层扩到 **13/13**（含误报率与两条急性动作断言）
- 实测（`--seed 42`，24 小时）：注入抽搐 → 体表温 +0.51 → +0.81 °C 且心率/呼吸划线标红；
  注入呕吐 → 恢复段心率读数比参考值 **+35%** 且 alert
- 场景自检新增断言：项圈默认可见、App 判定需要提醒、数字标红、弹窗真的渲染、急性窗口被识别

### Added（场景页布局与 App 预览 · iPhone 机模）
- **右栏改成产品形态本身**：可收起的 **iPhone 机模**（CSS 画的机身 + 灵动岛 + Home 指示条），
  内含 App 的四个页签：**实时 / 事件流 / 漂移 / 档案**。
  - **实时**：心率、呼吸、体表温跟着场景演示时钟走，**无效窗口划线显示并给出失效原因**
    （运动伪迹 / 接触不良 / 固件拒收），并常驻读数边界句；
  - **事件流**：事件类型汇总 + 截止当前时刻的事件列表（时间 · 事件名 · 强度）；
  - **漂移**：心率 / 呼吸 / 活动量 / 发声次数，前半段基线 vs 后半段近期（复用 `core.detectDrifts`）；
  - **档案**：物种 / 品种 / 年龄段 / 体型档 / 项圈重量预算。
  - `?app=off` 收起；窄屏（≤900px）默认收起。设计见
    [`docs/design/07-app-mockup-layout.md`](docs/design/07-app-mockup-layout.md)。
- **居家资源清单移出主界面**，成为独立页面 `#/resources`（渲染抽到 `ui/resource-list.ts`）。
  它是一份**报告**，不是场景的操作控件；钉在右栏时会把「猫在做什么」和「App 预览」都挤掉。
- **左栏精简为"操作"**：模式、突发演示、机位；**图层与画质**（6 个开关 + 工程统计行）收进 `<details>`；
  首屏提示卡片并入"猫的行为"面板的说明行。
- ★ **单一时间线**：场景不再自己生成行为时间线，改用**会话里的 `behaviorTimeline`**；
  突发演示改为由 `screens/home.ts` 重建**带注入突发的会话**后交给场景（`HomeScene.applyTimeline`），
  画面、事件流、手机读数因此共用同一条时间轴。这同时关掉了 stage2 §10 的接缝 1。
  `BehaviorStatus` 新增 `timeS`（会话内秒）——`hourOfDay` 被 24 取模过，无法反推绝对时刻。
- `@camp/core` 补 `SIM_EVENT_LABELS` / `simEventLabel()`：事件名此前**没有中文名**，
  若在界面里就地写一套，同一件事会出现两种叫法。活动名 / 事件名 / 突发名 / 边界句现在都只有一处定义。

### Fixed
- `scripts/smoke-scene.mjs` 里一条**过时的断言**：它期望注入的突发是 `labored-breathing`，
  而自动序列注入的是 `seizure`（此前会误报失败）。已改为按实际注入断言。
- 场景自检新增 App 预览与项圈形态的断言：App 挂载 / 默认展开 / 页签可切换 / 读数是数值 /
  **突发期间呼吸读数被标为不可用**（防"把坏值当读数照抄"）/ 事件流有事件行 / 项圈部件数 = 5。
- 生理读数屏的 URL 形式：`#/vitals?scenario=…` 此前会被路由当成未知路由而**静默退回首页**。
  现 router 忽略 hash 内的查询串，读数屏从 search 与 hash 两处读参数。

### Added（项圈生理读数 · 第三阶段）
- **项圈生理读数（第三阶段）：读数 ≠ 真值**。这一阶段的目标是"做一个能测心率、呼吸、体表温的项圈"，
  做法是把**读数的可用性**做成一等数据，而不是把三个数字并排显示出来。
  设计与验收见 [`docs/design/05-collar-vitals.md`](docs/design/05-collar-vitals.md)，
  项圈规格与真机验证路线见 [`docs/hardware/01-collar-spec.md`](docs/hardware/01-collar-spec.md)。
  - `@camp/core/src/vitals/`：`params.ts`（证据登记表 + 操作化常量）、`readings.ts`（读数有效性与可用性）、
    `baseline.ts`（**按测量条件分层**的稳健基线）、`drift.ts`（**同条件**漂移，跨条件一律拒绝比较）、
    `sleeprr.ts`（睡眠呼吸频率——唯一有共识阈值的居家协议，阈值取自登记表）。
  - **`Sample.tempC` → `tempSurfaceC`，核心温移入 `truth.vitals`**：原先那个"干净的核心温"字段
    一定会被当成项圈能测的量。读数里只有设备真能测到的东西。
  - `Sample` 新增 `readingQuality`（`valid` / `motion-artifact` / `poor-contact` / `rejected-out-of-range`）、
    `measurementCondition`（`sleep` / `resting` / `active` / `post-event` / `clinic`）、`motionIndex`。
  - `simulator/src/vitals.ts`：三通道读数仿真，含**运动伪迹**、**项圈移位**（与体动无关的第二条失效通道）、
    固件拒收与**情境偏移**。硬规矩：**体表温的生成输入里没有核心温**——否则任何"换算"都会在评估里表现完美，
    那是自证预言而不是验证。
  - `simulator/src/eval-vitals.ts` + `pnpm sim:eval-vitals`：可用率与失真报告。
  - `apps/web` 新增 `#/vitals` 屏：三通道卡（无效读数**划线展示 + 原因**）、**读数 vs 真值折线**、
    可用性报告、睡眠呼吸频率与要请主人回答的四个问题、项圈规格卡、证据登记表与操作化常量。
  - 3D 场景里的**项圈硬件**（带体 / 电子仓 / 双 ECG 电极 / 体表热敏电阻）与**面部触须无干涉区**：
    `?collar=on｜zone` + HUD 两个独立开关。位置即能力——电极在颈侧、热敏电阻在颈腹侧这件事，
    看一眼比读一段文字更有效。
  - 新增 `vet-visit` 场景：**读数被情境抬高，真值一模一样**（用来演示"为什么诊室读数不能当基线"）。
- 措辞门禁新增 3 条禁词（三处**不得**出现在面向用户文案里的说法：由体表温推核心温、体温预警、等级宣称）。
  **记录一次收窄**：
  第一版把裸词「换算」列为禁词，立刻误伤「把演示秒换算成真实秒」这类合法句子——
  门禁一旦惩罚无辜用法，作者会去改正确的句子而不是错误的主张，因此改为禁**具体宣称**。

### Verified（第三阶段）
- typecheck **3/3** 通过（core / simulator / web）；静态站构建成功（**160 个文件**）
- 措辞门禁通过（扫描 82 个文件，豁免 9 个，18 条禁词）
- 新增单测：`core` 的 vitals 层 **20/20**、`simulator` 的 vitals 层 **9/9**；
  既有 `core`（behavior 29 / baseline 10 / drift 10 / home 11 / profile 5）与 `simulator` 22 项全部回归通过
- 实测可用率（`--seed 42 --minutes 1440`）：心率 **91.1%**、呼吸频率 **83.3%**、体表温 **72.6%**
- 体表温读数 vs 核心温真值：Pearson **r = −0.018**、线性拟合 **R² = 0.0003**、拟合后 **MAE = 0.77 °C**
  ——"由体表温推核心温"在仿真里必然失败，这是回归断言而不是结论
- ⚠️ 同一工作区另有一条进行中的工作（`packages/core/src/physiology/`）。本阶段落地期间它一度编译失败，
  把全仓 typecheck 与构建一起挡住（本阶段文件从未出现在错误清单里）；对方修复后两者均已通过。
  **它的自测文件目前仍有 4 项断言失败**，属对方进行中状态。
- ⚠️ 两个模块现在都在建模「突发 → 心率/呼吸/体温真值」（本阶段的 `simulator/src/vitals.ts`
  与对方的 `core/src/physiology/`）。**应合并为一个单一事实来源**，否则同一场抽搐会有两个体温上升值。
- 两次门禁收窄（同一类错误）：裸词「换算」会误伤「把演示秒换算成真实秒」这类合法句子，
  改为禁具体宣称；公共 API 守卫最初用 `/coreTemp/` 匹配、误伤真值侧函数，改为只匹配转换语义。

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
