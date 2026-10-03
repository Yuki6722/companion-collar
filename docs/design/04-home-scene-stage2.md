<!-- claims-check:ignore-file -->
# 04 · 猫的行为建模（第二阶段）

> **状态**：已实现。核心/仿真/前端三层门禁全绿；场景自检需人在普通终端跑一次（见 §8）。
> **范围**：让猫从「两套手动演示档位」升级为**由可验证真值驱动的自主行动个体**，
> 并支持本地手动触发一次**突发动作演示**。
> **不在本阶段**：多猫互动、真实寻路算法（A*/navmesh）、突发动作的真实生理精度宣称。

---

## 1. 目标与验收结果

| 目标 | 结果 |
|---|---|
| 调研：猫在家有哪些动作、突发时有什么可观察反应、各自证据等级 | ✅ [`docs/research/05`](../research/05-cat-home-behavior-repertoire.md) 与 [`06`](../research/06-cat-acute-observables.md) |
| 行为模型：可单测、确定性、与渲染解耦 | ✅ `@camp/core` 的 `behavior/`（7 个模块，25 项单测） |
| 猫按日节律在房间里自主行动 | ✅ 走动/攀跳/抓挠/理毛/进食/饮水/用砂盆/躲藏/高处停留，位置由 `layout.ts` 坐标驱动 |
| 突发动作可本地主动触发 | ✅ 抽搐 / 呼吸急促 / 僵直不动 / 躲藏退避 / 干呕，5 个按钮 + `?incident=` |
| 边界可见 | ✅ 自主行为 ≠ 手动档位；突发是「你手动触发的动画」、不命名疾病、不构成诊断、附转诊路径 |
| 门禁全绿 | ✅ typecheck 3/3、单测 83/83、措辞门禁通过、构建 136 个文件 |

---

## 2. 三层行为模型（为什么不是单层状态机）

任何时刻的猫 = **三条互相独立的轴**叠加，突发是第四条覆盖层：

| 轴 | 取值 | 谁决定 |
|---|---|---|
| **姿势** `CatPosture` | `lying` / `sitting` / `standing` / `crouching` / `walking` / `climbing` | 行为状态 |
| **行为状态** `CatActivityId` | `resting` / `alert` / `grooming` / `locomoting` / `playing` / `feeding` / `drinking` / `eliminating` / `scratching` / `hiding` / `perching` / `vomit` | 节律 + 计时器 + 事件 |
| **位置锚点** | 17 个具名锚点（`CAT_ANCHOR_IDS`） | 状态转换时选定；位移由 web 层执行 |
| **突发** `CatIncidentKind` | `seizure` / `labored-breathing` / `freezing` / `withdrawal` / `vomit` | 用户手动触发或仿真注入；有固定时长 |

**为什么这样切**：
- 现有 `cat-states.ts` 的 `CatPoseParams` 是**渲染参数**（耳位、瞳孔、尾频），属于表现层。
  行为层只输出**语义化的 activity + posture**，由表现层翻译。若把「尾巴 2.4 Hz」当行为模型，
  行为就再也无法脱离 three.js 单测。
- 位置与行为解耦：行为引擎只说「去哪、干什么」，寻路与动画在 web 层。
  因此**行为引擎可以在没有浏览器、没有 three.js 的环境下单测**。

---

## 3. 包归属与数据流

```
packages/core/src/behavior/          ← 纯函数、零运行时跨包 import
  vocabulary.ts      行为/姿势/突发动作的枚举与中文标签（单一事实来源）
  rng.ts             core 内部最小确定性抽样器（第 3 处刻意保留的重复）
  params.ts          参数登记表：每项带 EvidenceTag；操作化常量单列
  rhythm.ts          24 h 活动倾向（只输出相对权重，不输出峰值时刻）
  contract.ts        时间线类型 + 锚点 id 契约
  engine.ts          时间线构建 + 任意时刻求值 + 突发注入
  index.ts           公共 API
packages/simulator/src/behavior.ts   ← 把时间线接进 generateSession（消费 core）
apps/web/src/scene/cat/
  anchor-map.ts      锚点 → layout 坐标（不新增坐标，一律从 layout.ts 推导）
  locomotion.ts      位移推进、弧线、步态相位
  cat-behavior.ts    行为运行时：按 wall clock 求值并落到 rig 上
```

**数据流**

```
seed + durationS + injectIncidents
   └─► buildBehaviorTimeline() ──► CatBehaviorTimeline{segments, incidents, budgetS}
            │                              │
            │                              ├─► generateSession()：写进采样通道
            │                              │   （activityId / anchorId / posture）
            │                              └─► CatBehaviorRuntime ─► CatController
            │                                                        └─► 3D rig
            └─► truth.injectedIncidents（供回归断言）
```

---

## 4. 三条不变量（时间线为什么必须满足）

1. **连续覆盖**：`segments` 首尾相接、无空洞、无重叠，`Σ durS === durationS`。
   有了这条，`activityAt(t)` 才有唯一正确答案，回归断言也才有判据。
2. **不依赖 wall clock**：引擎是纯数据，画面推进由 `apps/web` 按 wall clock 做
   （沿用第一阶段踩过的坑：逐帧累加会在后台降帧时卡住）。
3. **突发是覆盖层**：注入一次突发只是在行为之上叠加一段带 `incidentKind` 的区间，
   并标记 `injected: true`，让「注入 → 还原」可被断言。

**一个实现细节值得记下**：躲藏退避（`withdrawal`）需要先走到躲藏点，
若「走完再开始计时」，注入时刻会被路程整体后推（实测 11–14 秒），
`注入 → 还原` 的断言随之失效。做法是**先把时间轴裁到 `事发时刻 − 路程`**（`rewindTo`），
再走一次贴地位移，使「到达」与「事发」落在同一时刻。因此注入时刻与落位时刻
的偏差被限制在 1 秒内（引擎刻意在事发前 1 秒结束前一个片段，
避免画面「先跳到事发动作再看它开始」）。

---

## 5. 证据政策如何落到代码里

| 政策 | 执行点 |
|---|---|
| `unverified` 不得展示具体数值 | `BehaviorParam.value` 恒为 `null`；`behaviorParamText()` 对 `unverified` 返回「未取得可靠来源」；单测断言其展示文本不含数字 |
| `disputed` 必须展示为区间 | `value` 必须是二元数组（或写明「无法归因」） |
| 每个参数带证据等级 | `BEHAVIOR_PARAMS` 每项必带 `EvidenceTag`（tier/source/note） |
| 操作化常量不得冒充文献数字 | `OPERATIVE_CONSTANTS` 单列一张表，每项必须写明「为什么这么选」 |
| 措辞纪律 | 行为层全部面向用户的文案进 `FORBIDDEN_TERMS` 单测；断言复刻门禁的**行级否定标记**规则 |

**当前登记表里的 4 处 `disputed`**：
24 小时节律稳健性、发声能否作为独立征象、长时间不动能否归因、
静息心率与呼吸频率（都是语境冲突，必须带测量条件）。
**12 处 `unverified`** 包括：每日跳数、活动片段数与时长、抓挠单次时长、
饮水量、排尿/排粪次数、躲藏时长占比、垂直空间占比、主人不在时活动量/抓挠/躲藏的方向。

**明确不做**：
- 不建模情绪或感受（`vocabulary.ts` 里没有任何情绪取值——不是遗漏，是设计）；
- 不给疾病名称（5 个突发动作全部是**动作名**）；
- 不做声音语义翻译（发声只作「有声/无声」计数）。

---

## 6. 突发演示：动作语义与渲染

| kind | 画面上是什么 | 演示时长 | 渲染做法 |
|---|---|---|---|
| `seizure` | 倒卧、全身与四肢高频抖动 | 15 s | 抖动叠加在躯干与四肢 |
| `labored-breathing` | 蹲伏不动、头部前伸、呼吸幅度与频率明显升高 | 60 s | `breathFreq`/`breathAmp` 大幅上调 |
| `freezing` | 长时间完全不移动（仅保留眨眼与呼吸）、弓背、头低垂、耳后压 | 60 s | 微动作归零、`arch` 上调 |
| `withdrawal` | 迅速移动到躲藏点、随后不再出现在开阔处 | 90 s | 走 `hiding` 活动 + 躲藏锚点 |
| `vomit` | 前低后高的「祈祷」姿态、腹部反复起伏 | 30 s | `bodyPitch` 前后起伏 |

**时长是操作化常量**：真实时长（如 `freezing` 的 10 分钟）在演示里被压缩，
避免演示时长时间看不到变化。这一点在界面上以「动画演示」措辞说明。

**常驻文案**（不可改写，来自 `core` 的 `INCIDENT_BOUNDARY_NOTE` / `INCIDENT_REFERRAL_NOTE`）：

> 突发演示：以上是你手动触发的动画演示，不是系统对猫的感受、情绪或身体状况的识别，
> 也不构成任何诊断。若你的猫真的出现类似表现，请录像并联系兽医。
>
> 以下情形在权威兽医资料中列为需要尽快就诊：张口呼吸或呼吸费力、公猫反复蹲砂盆却排不出尿、
> 反复呕吐、食欲下降持续三天以上。请录像并联系兽医，不要等待。

---

## 7. 房间锚点与可达性

- **权威坐标仍是 `layout.ts`**。`anchor-map.ts` 只做映射，不新增坐标。
- **锚点 id 是跨包契约**：单一事实来源是 `@camp/core` 的 `CAT_ANCHOR_IDS`；
  `simulator` 与 `apps/web` 各建一张表，core 单测断言两张表的 id 集合与契约一致。
  （这条断言在实现时立刻抓出了一次真实的不一致——测试夹具用了 `food`/`water` 这类临时 id。）
- **跳跃图由高度差决定**：高度差 > `jumpMinHeightM`(0.15 m) 走攀跳弧线，否则贴地走。
- **不引用「最大跳跃高度」数字**（该项 `unverified`）：可达性只由房间实际台面高度约束，
  最高的猫用台面是衣柜顶 2.4 m，记在 `anchorVerticalReachM` 并写明理由。
- **资源点停在物件前方**而不是中心，否则猫会站进碗里或砂盆里。
  地面锚点全部经静态检查（在房间内、不压家具）。

**已知限制**：没有寻路算法，位移是直线 + 弧线。样板间是单间且空旷，
直连在视觉上成立；换到多房间平面时这一层需要替换为网格寻路。

---

## 8. 怎么验证

```bash
# 沙箱内可直接执行
node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/simulator/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json
node packages/core/test/behavior.test.ts        # 25 项
node packages/simulator/test/simulator.test.ts  # 22 项
node scripts/check-claims.mjs
node scripts/build-web.mjs
```

**场景自检**（浏览器侧证据 → 文本断言；本环境的沙箱不允许启动浏览器，需人在普通终端跑一次）：

```bash
node scripts/dev-server.mjs            # 另开一个终端
chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
       --virtual-time-budget=25000 --window-size=1280,800 \
       "http://127.0.0.1:5273/?debug=1&auto=1"
node scripts/smoke-scene.mjs
```

自检现在断言两组事实：
- **手动路径未被破坏**（第一阶段的断言原样保留）：切到激动后尾巴/耳朵/瞳孔确实改变、
  两种状态落在不同锚点、切回平静参数回位；
- **自主行为真的在跑**：`catActivity` 至少出现 2 种活动、锚点或位置至少 2 个、
  演示时钟在推进、活动取值全部来自行为词汇表、注入的突发出现在快照里。

**URL 开关**（演示与截图用）：`?mode=manual`（回手动档位）、`?behavior-off`（关自主行为）、
`?incident=<kind>`（开场即触发一次突发）、`?state=calm|agitated`、`?view=<presetId>`。

---

## 9. 明确不做

- 不做情绪识别、不做疼痛/恐惧判别。突发演示只演示**动作**，不输出「它怎么了」的结论。
- 不做声音播放，也不做声音语义翻译（既有硬约束 3.2）。
- 不做多猫互动：猫-猫互动率（0.58 次/猫/小时）来自**猫咖**人群，不适用本项目。
- 不做真实寻路算法（见 §7 的已知限制）。
- 不把 `unverified` 参数变成数字（每日跳数、活动片段数/时长、最大跳跃高度、抓挠单次时长）。
- 不新增生理通道的精度宣称：呼吸与心率仍标注「未取得猫用项圈验证研究」。

---

## 10. 第二阶段接缝

1. `HomeScene` 支持传入 `behaviorTimeline`——目前 `screens/home.ts` 尚未接入
   `generateSession` 的产出，场景用的是本地按同一套规则生成的时间线。
   接上之后，「事件流屏/漂移报告屏」与 3D 场景会共用**同一条**时间线。
2. `HOME_RESOURCES` 支持用户自助编辑，接入宠物档案屏。
3. `CatRig` 换成有授权可用的写实猫模型（`cat-model.ts` 仍是唯一需要改的文件）。
4. 同一份房间数据驱动「现状 / 达标」双布局对比。
5. 多房间平面时，用网格寻路替换 `locomotion` 的直连位移。
