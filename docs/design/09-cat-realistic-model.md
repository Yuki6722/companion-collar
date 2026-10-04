# 09 · 喵喵：写实蒙皮猫与真正的四足走路

> **状态**：已实现并实测。typecheck 3/3、单测 161/161（core 111 / simulator 45 / web 5）、
> 措辞门禁通过、构建 182 个文件、`git diff --check` 干净；
> 浏览器实测由 CDP 驱动真实 Chrome（约 46–53 fps）跑通走路 8/8 与场景回归 10/10。
> **范围**：把家居场景的「喵喵」换成写实蒙皮模型，并让它的四条腿**真的迈步走完位移**；
> 附独立动作检查页、走路检查入口、回归测试与来源/许可归档。
> **不在本阶段**：黑猫（代码里留了 `coat` 参数但**没有接线**）、模型碰撞体、
> 跟随相机避障、把原始 GLB 动画作为动作来源。

---

## 1. 交付清单

| 面 | 内容 | 落在哪 |
|---|---|---|
| 模型 | 写实蒙皮孟加拉家猫（CC BY 4.0，署名与哈希见 `CREDITS-CATS.md`） | `apps/web/public/assets/models/bengal-cat/bengal-cat.glb` |
| 共享接口 | `CatRig`（语义节点 + `ready/animate/dispose/debugInfo`），`buildCat()` 收敛为一行 | `src/scene/cat/cat-model.ts` |
| 动作驱动 | **唯一骨骼驱动**：四足 IK、按位移推进的四拍步态、坐卧/理毛/低头、项圈随颈骨、资源释放 | `src/scene/cat/cat-realistic.ts` |
| 相位语义 | 保留外部传入的步态相位；暴露当前姿势与相位 | `src/scene/cat/cat-controller.ts` |
| 位移时序 | 行走按真实经过时间推进；走完前保留当前时间线段（避免 20× 演示倍率瞬移） | `src/scene/cat/cat-behavior.ts` |
| 朝向 | 起步先朝行进方向转身，到达再转向资源朝向 | `src/scene/cat/locomotion.ts` |
| 场景接线 | 模型就绪后才推进行为、逐帧驱动骨骼、跟随相机、`?walk-check=1` 入口 | `src/scene/scene.ts` |
| 自检事实 | 快照新增 `cat`：`loaded / bones / walkWeight / action / feet / head` | `src/scene/selftest.ts`、`src/screens/home.ts` |
| 检查页 | 站立 / 行走 / 坐下 / 趴卧 / 舔爪 / 低头 六档 + 侧面·正面·三分之四机位 | `public/cat-studio.html`、`src/scene/cat/cat-studio.ts` |
| 测试 | 读**实际 GLB**，断言蒙皮形变、骨长、世界变换、步态连续、20× 下的真实迈步、追赶量不瞬移 | `apps/web/test/cat.test.ts` |
| 文档 | 本文 + README 一节 + 来源与许可 | 本文件、`README.md`、`models/CREDITS-CATS.md` |

## 2. 模型、来源与许可

| 项 | 值 |
|---|---|
| 文件 | `bengal-cat/bengal-cat.glb`（5,457,492 字节） |
| SHA-256 | `e0da658829088a397f761553e5f5567ef632345474aebe2ad7dce65b57a3a9b7` |
| 原作名 / 作者 | `Bengal Cat Non Commercial` / osmanarici2004_1 |
| 许可 | 文件内元数据与原始页面均为 **CC BY 4.0**（页面显示 CC Attribution） |
| 取得途径 | Objaverse 1.0 公开镜像 `allenai/objaverse`，`glbs/000-035/ad99670274254e4aa539a90a5dbdb24e.glb` |
| 原始内容 | 35,574 三角面、93 个骨骼关节、3 张内嵌贴图；含原始 `All Animations` |

**两条必须写在明处的边界**：

1. 原始标题里带 “Non Commercial”，而许可字段是 CC BY 4.0。项目**保留原始标题与作者**，
   不把标题改写成额外的授权声明；归属页同时列出两者，让复核者自己看到这处不一致。
2. **场景里的动作不是播放原始动画**。原始 `All Animations` 没有被使用；站立/行走/坐卧/理毛/低头
   全部由本项目按语义姿势与位移实时生成。这条决定了后面所有「动作对不对」都能被单元测试与
   数值回归覆盖，而不是「看起来像不像某段动画」。

## 3. 动作是怎么被驱动的

### 3.1 一个骨骼驱动，语义控制器不再直接摆几何

写实模型是**连续蒙皮网格**，没有「耳朵」「瞳孔」「尾段」这些可独立摆放的零件。因此 `CatRig`
保留原来的语义字段（`head / earL / tail[6] / legs[4] / collar / whiskerZone`），但它们的几何是
**不可见的控制手柄**（`visible:false` 的 `MeshBasicMaterial`）或空 `Group`：

- 语义层（`cat-controller.ts`）继续只描述「姿势 + 步态相位 + 突发动作」，不去动蒙皮网格；
- 驱动层（`cat-realistic.ts`）每帧从**骨骼静息姿态**重建，再按 `posture / activity / gaitPhase / incident`
  摆出姿势。两者只通过 `CatAnimationInput` 通信，没有第二个人碰骨骼。

这条分工是有代价的：`CAT_STATES` 里那些只对几何零件有效的参数（耳位、瞳孔、尾幅）在写实模型上
不再可见。**判断标准换成「档位切换必须在画面上真的不同」**（见 §6 的场景回归里那条手动档断言），
而不是「每个参数都得有落点」。

### 3.2 走路：相位由**位移距离**推进

脚滑与「原地踏步」是一枚硬币的两面，只有把相位与位移绑在一起才能同时消掉：

```
支撑相占比 support = 0.72；一个周期内爪在机体系里从 +0.105 走到 −0.105（视觉局部单位）
→ 摆动行程 = 0.21 × SCALE(0.62) / 0.72 = 0.1808 m
→ 每前进 0.1808 m，相位推进整整一个周期
```

支撑腿在一个周期里向后走的路程，正好等于身体前进的距离——所以**支撑爪在地面上是「钉住」的**。
`pawCycle()` 是四拍（后左 → 前左 → 后右 → 前右），任意相位至少有两条腿处于支撑相
（单测逐点断言 `stance ≥ 2`），因此不会出现「四条腿一起跳」的同步蹦。

其余两条纪律：

- **绝不缩放腿去迁就姿势**：`solve()` 用两段式 IK（肩/肘/腕 或 髋/膝/踝），目标不可达时把距离
  夹在 `|l1−l2| .. l1+l2` 内，宁可脚悬空也不改骨长。单测逐骨断言 `|length − length| < 1e-5`。
- **爪垫保持水平**：`solve()` 末尾按脚骨偏移量重建踝关节朝向，避免上下坡时爪尖插进地面。

### 3.3 坐卧、理毛、低头、项圈

| 状态 | 做法 |
|---|---|
| 趴卧 `lying` | 骨盆下降、四肢沿脚骨偏移量向躯干折叠（`fold`），尾巴沿脊线贴地 |
| 坐 `sitting` | 骨盆先降、脊柱再抬（`sit`），后肢前收、前肢支撑 |
| 蹲伏 `crouching` | `low = 0.45` 的中间态，四足仍着地 |
| 舔爪理毛 `grooming` | 左前爪抬到 `+0.25`、头随之下低并小幅点头 |
| 低头进食 `eating/drinking` | 颈与头依次下压 |
| 尾巴 | 6 段骨骼沿加权链做 `aim()`，不是六段断开的模型 |
| 项圈 | 每帧取 `Neck_M_` 的位置，并按「颈 → 头」切向量定向，因此低头时项圈跟着平面转 |
| 资源释放 | `dispose()` 遍历释放 geometry / material / texture / skeleton |

## 4. 三个故障与根因

这一节保留下来，是因为三个故障都**不是**「调参没调好」，而是各自违反了上面某条纪律。

### ① 位置在动，骨骼不迈步

`CatController.update(dt)` 的签名是 `update(dt, gaitPhase = 0)`。行为层每帧走的是
`setExternalTransform(t, phase)` → `applyTransform()`，而 `update(dt)` **默认值把相位清成了 0**。
于是位置一路在推，骨骼永远停在 `gaitPhase = 0` 的站姿。

修法：外部模式下默认沿用**上一次收到的相位**（`lastGaitPhase`），并把它与 `currentPosture()` 一起
暴露出来给骨骼驱动读。回归测试就是钉这一条：`setExternalTransform(t, 0.42)` 之后
`update(1/60)`，`gaitPhase()` 必须还是 `0.42`。

### ② 姿态冻结

四元数混合时，混合的**目标**与**源**指向了同一个对象（自己和自己插值），插值结果恒等于自身。
修法：每帧把混合前的值复制进 `prev` 表，用「上一帧的副本 → 本帧的目标」做 `slerpQuaternions`。

### ③ 先瞬移再走（本轮新修）

行为层的时钟刻意用 wall clock 推导推进量：后台标签页被降帧时，演示时钟不会停摆。这条对**数据**是对的，
但同一份「追赶量」被用在了**走路动画**上：

```ts
// ❌ 修复前：step 含「距上一帧的整段真实时间」
if (this.plan) this.travelElapsedS += step;
```

后果：模型加载、首帧着色器编译、标签页切回这类几秒空档，会被**一次性走完**。

**实测（CDP 驱动真实 Chrome，53 fps）**：

| | 修复前 | 修复后 |
|---|---|---|
| 单次采样最大位移 | **0.815 m = 18.6% 全程** | 0.121–0.162 m = 2.8–3.7% 全程 |
| 起步 50 ms 内（探索期，主线程被截图阻塞） | 0.45 m ≈ 8.7 m/s（参考步速 0.45 m/s） | — |
| 同样 4.38 m 位移耗时 | 10.47 s | 14.45–15.11 s（0.29–0.30 m/s） |

修法：

```ts
// ✅ 位移只吃**当帧渲染时间**，并沿用仓库既有的 0.1 s 上限；暂停时不推进
if (this.plan && !this.paused) this.travelElapsedS += Math.min(Math.max(dt, 0), 0.1);
```

注意这不是「把动画调慢」：60 fps 或 20 fps 下 0.1 s 上限根本不生效，动画就是实时；
它只在**一帧跨了秒级空档**时才起作用，而那正是必须放弃「补齐」的时刻。

## 5. 场景接线

| 接线 | 为什么这么接 |
|---|---|
| `catModelReady` 门控行为推进 | 模型是异步的（5.4 MB）。若让时钟在加载期间照跑，`?walk-check=1` 跳到的那段位移会在模型出现前走完 |
| 就绪后 `setPaused(true) → setPaused(false)` | 把墙钟重置到「模型到位这一刻」，避免第一帧吃掉整段加载时间 |
| 逐帧 `rig.animate(dt, {posture, gaitPhase, activity, incident, reducedMotion})` | 单一入口，检查页与场景共用同一套入参 |
| 跟随相机按**位移增量**平移 | 相机不做轨道跟随，只是把位移加到机位与 `controls.target` 上，因此猫在屏幕上位置恒定 |
| `?walk-check=1` 优先选 `posture === 'walking'` 的位移段 | 只按 `activity === 'locomoting'` 会命中「攀跳」段（有高差 → 位移带弧线），检查入口就变成了看跳 |
| 快照新增 `cat` 字段 | 「真的在迈步」与「只移动位置」在无头环境里必须能区分：只比 `catAt` 是分不出来的 |

## 6. 验证命令与实际结果

```bash
# 类型检查（web 的 tsconfig 已把 test/** 纳入，测试文件同样受 erasableSyntaxOnly 门禁约束）
node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/simulator/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json

# 单测（沙箱内逐个直接执行；node --test <目录> 会因派生子进程报 EPERM）
for f in packages/core/test/*.test.ts packages/simulator/test/*.test.ts apps/web/test/cat.test.ts; do node "$f"; done

node scripts/check-claims.mjs
node scripts/build-web.mjs
git diff --check
```

| 项 | 结果 |
|---|---|
| typecheck | **3/3 通过** |
| 单测 | **161/161**：core 111（behavior 30 / vitals 20 / physiology 15 / home 11 / baseline 10 / drift 10 / vitals-alerts 10 / profile 5）、simulator 45（simulator 22 / vitals 13 / physiology 10）、web 5 |
| 措辞门禁 | 通过（扫描 97 个文件，豁免 11 个，18 条禁词） |
| 构建 | `apps/web/dist` **182 个文件** |
| `git diff --check` | 干净 |
| **修复前会失败的回归** | 把 `travelElapsedS` 那一行改回旧写法，`cat.test.ts` 的第 5 条从 ✔ 变 ✖（已实测） |

### 浏览器实测

用 CDP 驱动真实 Chrome：`--headless=new --no-sandbox --use-angle=metal --remote-debugging-port=9224`
（`--use-angle=swiftshader` 也能跑，但软件光栅只有约 1–2 fps，无法观察步态）。

| 检查 | 入口 | 结果 |
|---|---|---|
| 走路 8/8 | `?view=cat-follow&app=off&walk-check=1&labels=off&debug=1` | 51.8 fps；一次位移 4.38 m / 15.11 s（0.29 m/s）；最大单次采样位移 0.130 m = **3.0% 全程**；有位移的采样 154 个；前左爪局部行程 **0.114 m**；到点后 `walkWeight` 降到 **0**；无页面报错 |
| 走路画面 4 帧 | 同上（关 `debug`） | 连续 4 帧都在 `walking` 且位置单调推进（`[-2.53,-0.28] → [-1.89,-0.55]`），四爪坐标可读 |
| 项圈 | `?view=cat-follow&debug=1` | `collar=true`、`partNames` 含带体/电子仓/双 ECG 电极/热敏电阻/状态灯；`?collar=zone` 打开无干涉区 |
| 手动档位 | `?behavior-off&debug=1` | 平静（趴卧，猫爬架顶台 `[2.6,1.45,-2.25]`）→ 激动（蹲伏，起居区地面 `[1.75,0,-1.05]`），姿势与位置都真的变了 |
| 突发演示 | `?debug=1` + `incident('seizure')` | `catMotion` 非空；40 帧内**头骨原点行程 0.009 m**（身体真的在动，不是只有标签在报） |
| 动作检查页 | `cat-studio.html` | 加载文案变为「可旋转检查 · 实时骨骼动画」；六个档位逐个 `aria-pressed=true`；无控制台报错 |

画面证据：[场景里行走](shots/home-cat-walk-realistic.png)（1280×800，跟随机位下的连续迈步）
与[检查页侧面行走](shots/cat-walk-studio.png)（1000×700，脚掌支撑与非同步四拍看得最清）。

### 场景自检（`scripts/smoke-scene.mjs`）前后对照

自检日志由 `?debug=1&auto=1` 生成。**为避免把两次运行混在一起，每次都用全新 Chrome profile
并在启动前确认只有一个 page target**（同一 profile 复用会触发会话恢复，把上一轮的 POST 混进日志——
第一版对照就踩过这个坑）。

| 断言 | 升级前（`HEAD`，程序化橘猫） | 本次 |
|---|---|---|
| 两种状态落在不同锚点 | ✖ | ✖ |
| 状态标签在突发期间切成动作名 | ✖ | ✖ |
| 突发期间姿势参数确实被改变 | ✖ | ✖ |
| 突发期间 App 把不可用的读数标出来 | ✓ | ✖ |
| 项圈部件齐全 | ✓（`parts=5`） | **✖ → 已修正断言** |
| 触须无干涉区可独立显示 | ✖ | **✖ → 已修正断言** |
| 切换到「激动不适」后参数确实改变 | ✖ | ✓ |
| 切回「平静舒适」后参数回到起点 | ✖ | ✓ |
| 合计未过 | **6 项** | **4 项** |

三处差异都要说清楚：

1. **真差异（产品）**：写实项圈多了一个状态指示灯，部件数 5 → 6，而旧断言写死 `parts === 5`。
   已改成 **按名字断言**必须存在的五个部件（带体 / 电子仓 / 双 ECG 电极 / 热敏电阻）——
   「硬件新增」与「部件丢了」不该给出同样的失败。
2. **真差异（测试写错了）**：`触须无干涉区可独立显示` 原来取「序列里第一条带项圈的快照」再要求
   它的 `whiskerZone === true`，而无干涉区默认关闭、序列到 19 s 才打开，所以**这条永远不可能过**。
   已改成「序列里存在 `whiskerZone=true` 的快照」。
3. **相位敏感，不是功能回归**：「突发期间 App 把不可用的读数标出来」读的是**注入后的第一条快照**。
   同一次序列里第 5–7 条快照的 `hr/rr` 都是 `motion-artifact`，只有第 3 条还是 `valid`；
   升级前那一条恰好已经进入伪迹窗口。也就是说伪迹判定本身两侧都在工作，断言抓的是相位。
   相位为何变了：模型加载门控把演示时钟的起跑点推后了（见 §5）。

剩下三条共有失败（锚点、标签动作名、姿势参数）升级前就存在，本次没有触动；它们与猫的模型无关。

## 7. 合并说明

**必须一起带入**（缺任何一项都不成立）：

- 资产与许可：`apps/web/public/assets/models/bengal-cat/bengal-cat.glb`（5.46 MB）、
  `apps/web/public/assets/models/CREDITS-CATS.md`（CC BY 4.0 署名，缺它不合规）
- 驱动与接线：`src/scene/cat/cat-realistic.ts`、`cat-model.ts`、`cat-controller.ts`、
  `cat-behavior.ts`、`locomotion.ts`、`scene.ts`、`selftest.ts`、`src/screens/home.ts`
- 检查页：`public/cat-studio.html`、`src/scene/cat/cat-studio.ts`、`src/ui/hud.ts`
- 测试与门禁：`apps/web/test/cat.test.ts`、`apps/web/tsconfig.json`、`apps/web/package.json`、
  `scripts/smoke-scene.mjs`
- 文档：`README.md`、`CHANGELOG.md`、本文件与两张截图

**必须排除**：`apps/web/src/scene/cat/cat-black-model.ts`、`cat-variants.ts`、
`apps/web/public/assets/models/black-cat/`（黑猫试验，未接线、已暂停）；
以及 `jeff-skeleton` 旧基线自带的 `models/cat/cat.glb`、`docs/design/04-cat-asset-wip.md`、
`scripts/build-cat-asset.mjs`（已被本次取代的 WIP）。

**推荐合并方式**：把承载本条提交的分支（或直接 cherry-pick 该提交）合进 `main`。
**不要**把 `jeff-skeleton` 整个合进 `main`——它历史里含上述三个 WIP 路径。

## 8. 边界与已知限制

- **不是动画播放**：原始 GLB 的动画轨道没有被采样；动作全部实时生成，因此「像不像某段动画」不是判据。
- **跟随相机会被家具挡**：机位只按位移平移，不做避障；猫贴墙走过柜体时会被挡一帧到几秒
  （已复核：挡住的只是过场，随后恢复可见）。要做避障就是另一件事了。
- **运行时切换手动档位仍被行为层覆盖**：`setManualCat()` 只是**暂停**行为运行时，而暂停后它仍会每帧
  写一次外部变换，把控制器拉回外部模式。这是升级前就存在的接线问题（升级前的同一构建上
  「两种状态落在不同锚点」同样是 ✖），本次没有改动。**受支持的入口是 `?behavior-off`**，
  它不创建行为运行时，手动档位完全生效（见 §6）。
- **慢机器上走路会变慢，但不会瞬移**：这就是 §4.3 的取舍——一帧最多推进 0.1 s 的位移，
  所以在只有 1–2 fps 的软件光栅环境里，走路按 1/10 速度播放。真实浏览器（几十 fps）不受影响。
- **`coat` 参数是预留口**：`createRealisticCat(coat)` 支持 `'bengal' | 'black'`，
  但仓库里没有任何已提交代码传 `'black'`；黑色毛皮那段着色只是给黑猫留的门，本次不交付。
