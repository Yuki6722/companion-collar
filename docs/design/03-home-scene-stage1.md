<!-- claims-check:ignore-file -->
# 03 · 家居空间建模（第一阶段）

> **状态**：已实现并通过自检。
> **范围**：浏览器里的**一间写实风格开间样板间** + 一只橘猫的**两套手动演示状态**。
> **不在本阶段**：与仿真数据联动、用户自助编辑布局、「现状/达标方案」对比布局。

---

## 1. 目标与验收结果

| 目标 | 结果 |
|---|---|
| 打开页面即进入 3D 样板间，无打包器、无运行时外链 | ✅ `tsc` + import map；资产全部在 `dist/` 内（13.09 MB） |
| 猫的全部生活用品齐备 | ✅ 猫爬架、饮水机、食盆、猫砂盆 ×2、猫窝、纸箱、抓板 ×2、壁挂跳台 ×2、柜顶通道、玩具 |
| 饲主家具齐备 | ✅ 床、床头柜+台灯、衣柜、冰箱、开放式厨房（台面+吊柜+岛台+吧台凳+油烟机）、电视+电视柜、沙发、茶几、置物架、地毯、落地灯、窗帘、挂画、鞋柜 |
| 写实风格、不做卡通 | ✅ CC0 扫描模型 + ACES 色调映射 + HDRI 环境光 + 单一暖色日光与软阴影（见 §4 的取舍记录） |
| 橘猫两种状态可随时手动切换 | ✅ 参数化两套；0.8 s 过渡、可中途打断；`?state=` 可指定开场状态 |
| 门禁全绿 | ✅ typecheck 3/3、单测 47/47、措辞门禁通过、构建产出 122 个文件 |

**画面证据**（`docs/design/shots/`，均为无头 Chrome + SwiftShader 实拍）：

| 文件 | 内容 |
|---|---|
| [`home-hero.png`](shots/home-hero.png) | 全景（不显示资源标签） |
| [`home-labels-on.png`](shots/home-labels-on.png) | 全景 + 资源标签（默认形态） |
| [`home-living.png`](shots/home-living.png) | 客厅机位 |
| [`home-cat-zone-calm.png`](shots/home-cat-zone-calm.png) | 猫特写 · 平静舒适 |
| [`home-cat-zone-agitated.png`](shots/home-cat-zone-agitated.png) | 猫特写 · 激动不适 |

---

## 2. 房间平面

开间 **7.2 m(X) × 5.6 m(Z) × 2.75 m(Y)**，向北开一整面窗（x ∈ [-1.6, 1.6]，窗台 0.5 m），
入户门在南墙东段（x ∈ [2.55, 3.45]）。坐标原点在房间中心，+Z 朝入户侧。

```
                    −Z 北墙（窗）
   ┌──────────────────────────────────────────────┐
   │  衣柜   床（床头靠西墙）        窗      猫爬架 │
   │  ▓▓▓   ▒▒▒▒▒▒▒▒▒▒▒▒      ┌──┐      ▣ 猫砂盆? │
   │        边几/台灯  猫砂盆B  │窗│   食盆 饮水机  │
   │                            └──┘               │
   │  厨房台面              地毯      TV 墙        │
   │  ▬▬▬▬▬        沙发 茶几  ▭▭     ▯电视         │
   │  岛台+吧凳            置物架   猫砂盆A         │
   │  冰箱           🚪入户门                     │
   └──────────────────────────────────────────────┘
                    +Z 南墙（厨房 + 门）
```

> 上图是示意；**权威坐标在 [`apps/web/src/scene/layout.ts`](../../apps/web/src/scene/layout.ts)**。

---

## 3. 猫的两套演示状态

**边界（必须与实现一起读）**：这两个状态是**作者编写的动画档位**，由用户手动切换，
**不是**系统对猫的感受、情绪或健康状况的识别或推断，也不构成任何诊断。
项目不做情绪识别，也不把状态差异当作临床依据。界面上的原话见 `cat-states.ts` 的 `BOUNDARY_NOTE`。

| 参数 | 平静舒适 | 激动不适 |
|---|---|---|
| 位置 | 猫爬架顶台（1.45 m），面朝窗外 | 起居区地面，贴地蹲伏，面朝入户方向 |
| 耳朵 | 前立、偶发单耳轻转 | 向后压平并外旋 |
| 尾巴 | 0.40 Hz、小幅、尾尖轻卷 | 2.40 Hz、大幅拍打 |
| 瞳孔 | 0.85（中等竖裂） | 1.40（明显放大） |
| 眨眼 | 每 5 s 一次慢眨眼 | 基本不眨、眼睑开后角 |
| 呼吸 | 0.42 Hz、幅度 0.028 | 1.05 Hz、幅度 0.07 |
| 微动作 | 缓慢转头、踩奶 | 反复换重心、快速扫视 |
| 腿 | 完全收拢（1.05） | 半收拢（0.82） |

实现要点：
- **过渡由 wall clock 推导，不依赖渲染帧**。否则页面被切到后台（浏览器降帧）时状态推进会停住，
  自检也拿不到正确值——这一点是自检真抓出来的 bug（第一版用逐帧累加）。
- **可打断**：`setState()` 会先把当前混合值快照成新的起点，连点两下不会跳变。
- **`snapTo()`**：首屏以某状态开场、以及文档截图使用，不做过渡（无头环境帧数不可控）。

---

## 4. 资产：选型、许可与体积

全部来自 [Poly Haven](https://polyhaven.com)，许可 **CC0 1.0**（可商用、无需署名；仍在
[`apps/web/public/assets/CREDITS.md`](../../apps/web/public/assets/CREDITS.md) 逐项记录来源，便于复核）。
抓取脚本 `scripts/fetch-assets.mjs` 幂等、带字节校验，可离线复现。

| 类型 | 内容 |
|---|---|
| 扫描模型（1k） | `sofa_03`（米色布沙发）、`coffee_table_round_01`、`Shelf_01`、`painted_wooden_cabinet`（边柜）、`potted_plant_02`、`modern_ceiling_lamp_01` |
| 平铺 PBR | 木地板 `wood_floor_deck`、墙面 `painted_plaster_wall`、石材 `marble_01` |
| 环境光 | 室内 HDRI `hotel_room`（**只作 IBL**，背景是程序化天空，只在窗口处可见） |

**选型取舍（第一版被否掉的原因）**：最初按名字选了 `sofa_02`（黑皮切斯特菲尔德）、
`CoffeeTable_01`（青绿雕花）、`throw_pillows_01`（锯齿撞色）——缩略图对比后发现与暖色样板间严重冲突，
整体换成现在这一组；`old_bed_frame`（3.85 MB）与 `desk_lamp_arm_01`（2.75 MB）也因体积/性价比被排除，
床架与落地灯改程序化。**资产总量 13.09 MB**（软预算 15 MB，硬上限 25 MB，脚本会拦）。

**为什么冰箱、电视、厨房、衣柜、猫爬架、猫砂盆、饮水机全是程序化**：CC0 库里没有尺寸合适的整装电器与猫用品，
而它们的位置必须严格服从布局数据（见 §5）。程序化还带来一个附加好处：**尺寸可核对**。

---

## 5. 场景与清单共用同一份数据

```
layers/layout.ts（权威坐标）
   ├─► build-room / build-kitchen / build-furniture / build-cat-gear   ──► 3D 物件
   └─► HOME_RESOURCES: HomeResourceItem[]                              ──► @camp/core.summarizeHomeResources()
                                                                              └─► 资源清单面板 / 热区标签
```

`@camp/core` 新增 `home.ts`（纯函数、零依赖、可脱开浏览器单测）：

- `summarizeHomeResources(items, { cats, trafficPath })` → `checks: HomeResourceCheck[]`
- 规则来源是研究报告归档的检查项编号（`rs1…rs4`、`sp1…sp3`、`pl1/pl2`、`in1…in3`、`sm1…sm3`），
  证据等级与来源逐条标注；
- **与房间内容无关的项固定 `unknown`**（作息、清洁剂、互动方式），界面显示「需你确认」——
  绝不因为「没这几项」而看起来全部合格；
- 「分离」「不在通道上」「可俯瞰」需要米制阈值，指南没给，因此作为**操作化常量**标注并写明理由
  （`RESOURCE_SEPARATION_MIN_M = 1.5`、`RESOURCE_CLUSTER_MAX_M = 2`、`HIDE_OFF_PATH_MIN_M = 0.8`、`PERCH_MIN_H_M = 0.9`）。

当前样板间按 1 只猫配全：猫砂盆 2（= 猫数 + 1）、饮水 2 处、食盆 1 处、睡窝 2 处、抓挠面 3 处、
躲藏处 2 处、可俯瞰高处 5 处 —— 几何可判定的检查项**全部达标**，其余为人需确认。

---

## 6. 工程接线

| 事项 | 做法 |
|---|---|
| three.js | `three@0.186.1` + `@types/three@0.186.0`（devDependency，仅构建期源码） |
| 免打包器 | `build-web.mjs` 把 `three.module.js`/`three.core.js` 与**递归解析出的 addon 依赖**复制到 `dist/vendor/three/`，由 `index.html` 的 import map 指向同源路径 |
| 为什么递归 | `GLTFLoader` 依赖 `utils/BufferGeometryUtils.js` 与 `utils/SkeletonUtils.js`；手写清单会随 three 升级漏文件，且要到运行时才炸 |
| 首屏策略 | 先用**程序化贴图与占位件**把房间渲染出来，CC0 贴图/模型到货后就地替换（`MaterialLibrary.setTiles()` 不重建几何） |
| 降级 | 单项资产失败只记账并保留占位件；无 WebGL 时显示说明且**资源清单照常可用**（清单不依赖 3D） |
| 画质 | 自动/高/中/低：DPR 上限、阴影分辨率与开关、猫毛壳层数、装饰件是否加载 |
| 移动端与省电 | 触摸交给 OrbitControls；`visibilitychange` 暂停渲染循环；`prefers-reduced-motion` 关闭高频微动作 |

---

## 7. 怎么验证

```bash
node packages/core/test/home.test.ts        # 资源清单规则单测（11 项）
node scripts/check-claims.mjs               # 措辞门禁
node scripts/build-web.mjs                  # 构建（含 three vendoring）
node scripts/dev-server.mjs                 # 本地预览 http://localhost:5273
```

**场景自检**（浏览器侧证据 → 文本断言）：

1. 用能启动浏览器的终端打开 `http://127.0.0.1:5273/?debug=1&auto=1`，
   页面会把三条快照 POST 到本地预览服务的 `/__selftest`，落到 `.tools/selftest.jsonl`；
2. `node scripts/smoke-scene.mjs` 读取该日志并断言：WebGL 可用、确实渲染了三角形、6 个扫描模型与
   3 组平铺贴图全部到货、无资产失败、占位件已被替换、**切到激动后尾巴/耳朵/瞳孔参数确实改变**、
   两种状态落在不同锚点、切回平静后参数回到起点。

最近一次自检结果：`webgl=1; models=6; tiles=3; env=1; tris≈2.5×10⁵; draws≈410; fps≈45–83; placeholdersLeft=0; issues=0`。

**已知限制（如实记录）**：
- 本环境的沙箱**不允许启动浏览器**（Chromium 的进程间通信用命名管道），因此截图与自检日志需要在
  普通终端里跑一次；沙箱内只能验证类型、单测、措辞门禁与构建产物。
- 3D 画面的**审美**无法自动判定，只能靠 `docs/design/shots/` 的人工核对。
- 相机「飞过去」的缓动依赖渲染帧；URL 指定机位时用 `immediate` 直接到位，避免截图结果随帧数漂移。

---

## 8. 明确不做

- 不做头显/WebXR，只做普通屏幕的平面 3D；
- 不做对猫状态或情绪的自动识别与推断（两种状态是手动演示档位）；
- 不做声音播放、不做真实传感器接入；
- 不做「现状 / 达标方案」双布局对比（本阶段是「全达标示范」）。

## 9. 第二阶段接缝

1. `CatController.setState()` → 由 `@camp/simulator` 的 `truth.comfortCurve` 驱动（仿真真值，语义诚实）；
2. `HOME_RESOURCES` → 用户自助编辑，接入宠物档案屏；
3. `CatRig` → 换成有授权可用的写实猫模型（`cat-model.ts` 是唯一需要改的文件）；
4. 同一份房间数据驱动「现状 / 达标」双布局对比。
