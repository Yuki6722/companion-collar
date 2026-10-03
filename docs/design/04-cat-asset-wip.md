# 04 · 猫资产（FBX 来源 · 粗糙版 · wip）

> **状态**：未完成，标 `wip`。**先不要用。**
> **范围**：一个把上游 FBX 猫转成运行时 GLB 的构建脚本与产物，放在 `jeff-skeleton` 分支上备查。
> **不在本次**：接入场景、替换 `CatRig`、许可与 `CREDITS.md` 归档、与控制器/演示状态对接。

---

## 1. 这是什么

| 项 | 值 |
|---|---|
| 转换脚本 | [`scripts/build-cat-asset.mjs`](../../scripts/build-cat-asset.mjs) |
| 产物 | [`apps/web/public/assets/models/cat/cat.glb`](../../apps/web/public/assets/models/cat/cat.glb)（288,640 B / 281.9 KiB） |
| 上游 | Quaternius · Animal Pack Vol.2 · Cat（FBX，365,628 B） |
| 上游许可 | 上游标注 **CC0**；⚠️ 本仓库**尚未核实**该许可，也**尚未**把归属写进 `public/assets/CREDITS.md` |
| 输入位置 | `.tools/cat-asset/Cat.fbx`（`.tools/` 已被 gitignore，**不入库**） |
| 构建确定性 | ✅ 同一输入两次产出 sha256 一致：`7587f5a9…25b71b` |

构建：`node scripts/build-cat-asset.mjs`

---

## 2. 为什么说"粗糙"

实测（脚本自身输出）：

| 指标 | 值 | 说明 |
|---|---|---|
| 三角面 | **807** | 极低模。样板间里随便一件家具通常数千面，近距离猫特写会明显穿帮 |
| 骨骼 | 34 根，1 个 SkinnedMesh | |
| 动画 | `CatArmature\|Idle` 1.67 s · `CatArmature\|Walking` 1.67 s | 只有两段，且是「整只猫」的烘焙动作 |
| 成品尺寸 | 0.191 × 0.600 × 0.759 m | 爪垫落在 y = 0、朝向 +Z，与 `cat-model.ts` 的建模约定一致 |
| 转换告警 | `Vertex has more than 4 skinning weights… Deleting additional weights` | 上游 FBX 每顶点骨骼权重超过 4，被 FBXLoader 丢弃 → 蒙皮精度有损 |

上色是**按材质名硬编码**的：上游三个材质槽 `Grey` / `White` / `Pink` 在 FBX 里颜色已塌成同一个灰，
脚本按材质名重新分配橘猫配色（`0xb9a893` / `0xf2efe9` / `0xd98f8e`）。
副作用：**换一个上游模型，这套映射会整体失效**。

---

## 3. 为什么现在不能用

### 3.1 全仓没有代码引用它

`grep -rn "cat.glb"`（排除 `.tools/`）只命中本脚本自身与产物路径。
`apps/web` 的场景、路由、自检都没有加载它。

### 3.2 它与 `CatRig` 接口不兼容

[`scene/cat/cat-model.ts`](../../apps/web/src/scene/cat/cat-model.ts) 的 `buildCat()` 返回 `CatRig`，
控制器实际依赖这些**具名部件**：

```
rig.root · body · head · torso · chest · hips · legs[]
rig.earL / earR · eyeL / eyeR · pupilL / pupilR · tail[]（6 段）
```

`cat-controller.ts` 与 `cat-states.ts` 的两套演示档位（耳朵压平、瞳孔缩放、尾巴摆幅与卷曲、呼吸幅度）
全部作用在这些具名部件上。而 GLB 是**一个 SkinnedMesh + 两段烘焙动画**：既没有可单独驱动的
耳朵 / 尾巴 / 瞳孔节点，也没有「平静 / 激动」两套参数化姿态。

→ 想换用它，必须先写一层**适配器**，把烘焙动画或骨骼节点映射成 `CatRig` 的字段。
这正是 `cat-model.ts` 文档里预留的「替换缝」，但**这道缝目前还没人接**。

### 3.3 许可与归属未归档

`apps/web/public/assets/CREDITS.md` 由 [`scripts/fetch-assets.mjs`](../../scripts/fetch-assets.mjs) 生成，
其中关于猫的表述仍是「猫没有可信的 CC0 写实模型 → 橘猫程序化重建」。
该表述描述的是**当前实际在用的**程序化猫，因此现在并不算错；但**一旦真要启用这个 GLB，
必须先改 `CREDITS.md` 与 `fetch-assets.mjs` 的生成文案**，否则资产来源没有记录。

### 3.4 `Cat.fbx` 无法被脚本自动取得

`build-cat-asset.mjs` 原本提示「先跑 `node scripts/fetch-assets.mjs`（会下载并解出 Cat.fbx）」，
但 `fetch-assets.mjs` 里**没有任何下载 `Cat.fbx` 的逻辑**。本次已把该提示改成如实说明（需手动放置）。
这也是它属于 `wip` 的一部分：**在干净 clone 上无法复现。**

---

## 4. 本地预览（不入库）

预览页在本机 `.tools/cat-preview/`（`index.html` + `serve.mjs`）：可切换动画、显示骨架 / 线框，
并打印实测包围盒。按 `.gitignore` 的「本地工具不入库」原则，它留在仓库之外。

---

## 5. 启用前必须补齐

1. 核实上游许可，把归属写进 `apps/web/public/assets/CREDITS.md`，并同步改 `fetch-assets.mjs` 的生成文案；
2. 让 `Cat.fbx` 可复现取得（并入 `fetch-assets.mjs`，或改为入库）；
3. 写 `CatRig` 适配层，或明确放弃「平静 / 激动」两套参数化演示；
4. 提高模型精度（当前 807 面）；
5. 补 `docs/design/shots/` 的实拍截图作为画面证据。

**在此之前：不要把它接进场景，也不要在交付里引用它。**
