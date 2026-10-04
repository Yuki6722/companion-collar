# 05 · 家猫在宅行为谱系（项目行为层证据底稿）

> **归档位置**：`docs/research/05-cat-home-behavior-repertoire.md`
> **撰写目的**：为「基线哨兵 · 离家事件流」提供**行为层**证据底稿——猫在家里有哪些动作、
> 各自由哪种传感器可观测、典型速率与时长是多少、证据等级如何。
> **检索日期**：2026-10-03。全部 URL 均经实际访问核实；付费墙或抓取失败者逐条标注。

---

## 0. 范围与边界

### 0.1 本报告只回答什么

只描述**外部可观测的行为**：姿势与位置、行为事件类别、事件之间的转换、事件的近似频次与时长。

### 0.2 本报告明确不做的事

| 不做 | 理由 |
|---|---|
| 不建模「猫在感受什么」 | 动物情绪体验不可直接测量（Mendl et al. 2010，本仓库既有依据） |
| 不做声音语义翻译 | 声音仅作为「发声事件计数」或「环境噪声事件」出现，不解释含义 |
| 不做情绪识别 / 疼痛表情评分 | 猫面部表情量表是**兽医临床工具**，需正对猫面部的高质量影像与受训评分者；颈部项圈物理上看不到面部 |
| 不做热量 / 能量消耗推算 | 项圈无气体交换或双标水测量能力；AJVR 2024 已证伪消费级精度 |

### 0.3 证据等级

| 等级 | 判定标准 |
|---|---|
| `strong` | ≥2 项**独立**同行评审研究相互一致 |
| `moderate` | 单项同行评审研究，或权威指南 / 综述汇总表 |
| `weak` | 二手来源、讲义材料、厂商材料、未同行评审的会议摘要 |
| `unverified` | 未取得可靠一手来源 → **不陈述具体数字** |
| `disputed` | 来源冲突 → **必须呈区间，不取单一数字** |

### 0.4 一处必须先说明的引用更正

任务书中「PLOS ONE 2020，n=61，三轴加速度计 + 气压传感器」指向的确实是
**Yamazaki et al. 2020, PLoS ONE 15(7): e0236795**，但有两点必须写清楚：

1. **n=61 只属于第三个子实验**（client-owned cats 的横向观察）。同一篇论文另有 n=10（设备对比）与 n=6（真值验证）。
2. 原文用词是 **air pressure sensor（气压传感器）**，跳数判定规则为「检测到 **≥40 cm** 的气压变化即计一次跳跃」。**低于 40 cm 的跳跃不会被计入。**

该研究存在**明确的利益冲突**：第一/通讯作者单位使用的是 JARMeC 借出的设备，共同作者 MY、HH 受雇于 JARMeC，
JARMeC 就相关设备申请了专利（JP2017-514095，状态 pending）。论文声明资助方未参与设计、分析与发表决策，
但**设备制造商深度介入是事实**。

---

## 1. 家猫 24 小时活动节律

### 1.1 核心结论

「猫是夜行性」是**过时且不准确**的通俗说法。而「猫是晨昏性」也同样不稳健——
是否具有可靠的 24 小时节律，**各研究不一致**。

### 1.2 已核实的一手证据

| 来源 | 样本 | 方法 | 关键发现 | 等级 |
|---|---|---|---|---|
| Yamazaki et al. 2020, PLoS ONE 15(7): e0236795 | n=61 客户饲养猫（雄 31 / 雌 30，1–19 岁） | 项圈三轴加速度计 + 气压传感器，佩戴 3 周，1 分钟 epoch | 日间静息/睡眠时间随年龄显著上升（r=0.41, p<0.05）；夜间随年龄变化极小（r=0.25）；性别无显著差异 | `moderate` |
| Piccione et al. 2014, *Biological Rhythm Research* 45(4): 615–623 | n=5 猫 + n=5 犬 | Actiwatch-Mini 连续 1 周总运动量 | 猫与犬的**光照期活动量均高于暗期**；但**猫未表现出总活动量的日节律**，犬有。作者结论：主人存在对两物种影响不同，**猫反而「失去节律」** | `moderate` |
| Piccione et al. 2012, *J Vet Behav* 8(4): 189 | — | — | **本次检索未取得该文可读全文或摘要**（ScienceDirect 403、IRIS 403、Europe PMC 无收录）。标题与卷页已在 Sharon 2020 参考文献表中核实，但**具体数值未核实** | `unverified` |

> 注：Piccione 2012 与 Piccione 2014 是**两篇不同的论文**，不要合并引用。

### 1.3 节律结论的冲突点（`disputed`）

- 一方（Yamazaki 2020，n=61）显示存在稳定的日间/夜间静息模式差异；
- 另一方（Piccione 2014，n=5）显示猫**没有**可检测的总活动量日节律。

样本量差 12 倍、测量指标不同（静息时长 vs 总活动计数）、饲养条件不同（客户家庭 vs 带花园公寓）。
因此本项目判定为 `disputed`：**只输出相对倾向权重，不输出峰值时刻**；「晨昏双峰」写成
「活动在一天内不均匀，常见清晨与傍晚两个窗口，但窗口时刻因个体与喂食制度大幅变动」。

**喂食制度是强混杂因子**：见 §7.1，研究中的猫 6/9 为定时喂食。

### 1.4 休息 / 睡眠 / 活动的日占比

| 指标 | 数值 | 来源与条件 | 等级 |
|---|---|---|---|
| 睡眠 + 休息占时间预算 | **约 50%** | Eckstein & Hart 2000, *Appl Anim Behav Sci* 68(2): 131–140；n=11 猫 | `moderate` |
| 口腔自我理毛占整体时间预算 | **4%**（＝非睡眠/休息时间的 8%） | 同上 | `moderate` |
| 「活动」占比 | **未取得可靠一手来源** | — | `unverified` |

**重要限制**：Eckstein & Hart 2000 的猫是「confined for the purposes of videotaping」
（为录像而限制活动）的实验条件，**不是家庭环境**。把「50%」直接搬到家猫场景需标注这一限制。
在真实家庭环境中以连续录像给出「睡眠/休息/活动」三分占比的同行评审研究，**本次未找到**。

---

## 2. 家猫行为谱系（ethogram）与逐项可观测性

### 2.1 已发表的 ethogram 骨架

Smit et al. 2023（*Sensors* 23(16): 7165，n=12 家养短毛猫，项圈 + 胸背带同时佩戴、连续 7 天录像）
给出目前对**项圈可观测性**最直接的 24 项 ethogram：

- **Active**：climbing、jumping horizontal、jumping vertical、fighting、playing、rolling、rubbing、running、trotting、walking
- **Inactive**：lying、sitting、standing
- **Maintenance**：digging、drinking、eating、grooming、littering、scratching、shaking
- **Other**：other、out of sight、allogrooming、human contact

**该研究的关键可用数字**（n=12，7 天录像，共 166,754 秒 ≈ 46 h 20 min）：

| 行为 | 观测值 | 备注 |
|---|---|---|
| 视野外（out of sight） | 38,395 s | **占全部录像 23.0%** —— 摄像头本身有近 1/4 时间看不到猫 |
| jumping vertical | 186 s | |
| jumping horizontal | 53 s | 两类合并为「jumping」 |
| fighting | 10 s | 样本量过小，剔除 |
| playing | 1 s | 样本量过小，剔除 |
| rolling / running / drinking / human contact | **0 s，完全未观测到** | 已从建模中剔除 |

> 这段数据本身就是结论：**在 46 小时的连续录像里，饮水、奔跑、翻滚、人猫直接接触一次都没出现。**
> 低频行为不是「难以检测」，而是**在有限观测窗内根本不会发生**。

### 2.2 可观测性判定：Smit 2023 的模型收敛过程

该研究反复迭代建模，把「模型识别不出来」的行为逐轮剔除或合并。**失败清单比成功清单更有信息量**：

| 行为 | 项圈加速度计能否识别 | 证据 |
|---|---|---|
| lying / sitting / standing / walking / trotting / active | ✅ 可识别（trotting 与 walking 被合并） | Smit 2023；最终轮 accuracy ≥ 0.75 |
| eating | ⚠️ 可识别但弱（RF 模型 specificity 仅 0.72） | Smit 2023 |
| grooming | ⚠️ 可识别，但**scratching 被频繁误判为 grooming**，第二轮被迫合并 | Smit 2023 |
| littering | ⚠️ 出现在可识别集合中 | Smit 2023 |
| **climbing** | ❌ 首轮 true positive = 0 | Smit 2023 |
| **rubbing / shaking** | ❌ 样本量不足被剔除 | Smit 2023 |
| **digging** | ❌ true positive = 0 | Smit 2023 |
| **allogrooming** | ❌ true positive = 0 | Smit 2023 |

**模型整体性能**：SOM 模型 Kappa 与总体准确率均 >0.95，但 RF 模型在项圈与胸背带两个佩戴位置之间
表现**更一致**；RF 的 Kappa 为 0.64–0.76、总体准确率 0.70–0.86；
**胸背带模型优于项圈模型**（作者归因于项圈可旋转、存在残余运动）。

> 对项目的直接含义：**项圈 IMU 的姿势分类可信，但「抓挠」不能靠项圈单通道独立成立。**
> 本项目把抓挠列为独立事件类别，只能依赖**多通道融合**，并接受它是**近似计数**而非精确分类。

### 2.3 独立验证

| 来源 | 样本 | 结论 | 等级 |
|---|---|---|---|
| Dunford et al. 2024, *Ecology and Evolution* 14(5): e11380 | 9 只室内家猫 + 5 只自由活动猫 | 随机森林 F-measure 最高 0.96；**高频数据（40 Hz）擅长快速行为，低频数据（1 Hz 均值）反而更准地识别慢速、非周期性行为如理毛与进食** | `moderate` |
| Galea et al.（经 Smit 2023 转述） | n=10 家猫，胸背带 | SOM 总体准确率 99.6% vs RF 98.9% | `moderate`（二手转述） |
| Watanabe et al.（经 Smit 2023 转述） | 单只猫，仅颅尾轴 | 饮水 100%、进食 68%、快步 78%、疾驰 71% | `weak`（n=1，仅单轴） |

> **Dunford 2024 的发现很实用**：采样频率会让「快行为」与「慢行为」的识别精度此消彼长，
> 单一频率不可能同时最优。仿真器若要同时输出姿势、抓挠与理毛，必须显式声明频率取舍。

---

## 3. 活动片段结构（bout structure）

### 3.1 已核实

| 命题 | 证据 | 等级 |
|---|---|---|
| 猫的活动是**突发式**的（短促活动 + 长时休息），而非均匀分布 | Eckstein & Hart 2000（50% 休息占比）+ Piccione 2014（无稳健日节律）共同支持 | `moderate` |
| **理毛片段趋向于跟随睡眠/休息之后**：睡眠/休息时长与「到下一次理毛片段的潜伏期」呈显著负相关 | Eckstein & Hart 2000（n=11） | `moderate` |
| 理毛由**若干短片段**组成；95% 的片段涉及 2–7 个身体部位 | Guillon et al. 2026, *Vet Dermatol* 37(5): 865–875（n=29 健康猫 + 7 只心因性脱毛猫，共 118 段视频） | `moderate` |
| 剥夺理毛 3 天后解除，12 小时内口腔理毛增加 **67%**、蹭抓理毛增加 **200%** | Eckstein & Hart 2000 | `moderate` |
| 抓挠的**具体触发条件**（睡醒后、进食后、特定地点） | Wilson 2016 与 Mengoli 2013 均为**主人问卷**，未测量时间序列上的前置事件 | `unverified` |

### 3.2 未取得的数字（全部 `unverified`）

- 每日**活动片段数**
- 活动 / 休息片段的**典型时长分布**
- 各姿势（坐/站/卧）占 24 小时的**确切百分比**

**结论**：项目**不应**给出「猫一天有 N 次活动爆发」这类具体数字。可以给出的是结构性描述：
「短促活动与长时休息交替」＋「活动量随年龄下降、静息随年龄上升」（后者有相关系数支撑）。

### 3.3 有支撑的方向性结论（对漂移检测最有用）

Yamazaki et al. 2020, n=61：

| 指标 | 与年龄的相关 | p |
|---|---|---|
| 每日平均活动量 | r = **−0.32** | p < 0.05 |
| 每日平均跳跃次数 | r = **−0.26** | p < 0.05 |
| 每日振动次数 | r = −0.20 | p = 0.12（不显著） |
| 总静息+睡眠时长 | r = **+0.45** | p < 0.05 |
| 日间静息+睡眠时长 | r = +0.41 | p < 0.05 |
| 夜间静息+睡眠时长 | r = +0.25 | p < 0.05 |

> **对仿真的直接用法**：这是「年龄」这一混杂因子的效应量。若跨猫比较，年龄会主导结果；
> 若只做**同一只猫的自身基线对比**，年龄漂移在数月尺度上可忽略。
> 这反过来**支持了本项目「只做自身基线」的设计决策**。

---

## 4. 跳跃与攀爬

### 4.1 跳跃的检测能力

| 命题 | 数值 | 来源 | 等级 |
|---|---|---|---|
| 猫的跳跃可被气压传感器计数，且与观察者计数无显著差异 | 「无显著差异」（原文未给具体计数均值） | Yamazaki 2020，n=6 | `moderate` |
| 跳跃事件的**类型**可被区分（jump up / down / across） | 731 次跳跃事件中 29 次误分类；每猫平均误分类率 **5.4%**（0%–12.5%），即正确率 **94.6%** | Sharon et al. 2020, *AJVR* 81(4): 334–343；n=13 健康客户饲养猫 | `moderate` |
| 跳跃检测的**物理下限** | 气压变化对应 **≥40 cm** 才计一次跳跃 | Yamazaki 2020 | `moderate` |

### 4.2 跳跃的频次与高度

| 命题 | 状态 |
|---|---|
| 家猫每天自然发生多少次跳跃 | **`unverified` —— 未取得可靠一手来源。** |
| 家猫的最大跳跃高度 | **`unverified` —— 未取得一手来源。** |

Sharon 2020 的 731 次跳跃是**被实验者主动诱导**的（"Each cat was encouraged to jump up, jump down,
and jump across"），观察时长 5–8 小时/只，**不能外推为自然日频次**。
「猫能跳 5–6 倍体长」「约 150 cm」等说法均来自宠物内容站（Catster、Cats.com），**非同行评审**。

**建议写法**：宣称「可检测跳跃事件与类型」，**不宣称**「正常猫每天跳 N 次」。

### 4.3 跳跃能力下降的临床意义（这一条证据很强）

| 命题 | 数值 | 来源 | 等级 |
|---|---|---|---|
| 猫骨关节炎最常见的行为改变包括「跳跃能力下降」与「跳跃高度降低」 | 分别 **71%** 与 **67%** | Clarke & Bennett 2006, *J Small Anim Pract* 47(8): 439–445，**n=28 患病猫队列** | `moderate` |
| 主人对活动能力变化的**主观评分与客观骨科异常无关联** | 129 只 ≥12 岁「被主人认为健康」的猫：骨科疾病 63/81（77.8%），主人报告的活动能力评分与骨科异常无关联 | Herrera et al. 2026, *JAVMA* | `moderate` |

> ⚠️ **71% / 67% 的读法**：n=28 的**临床患病队列**、无对照、非人群样本，
> 是「该 OA 队列内主人观察到的频率」，**不是患病率**。
> ⚠️ 「82% 的 >14 岁猫有 OA」属**转引数字**，一手摘要无此值 → 本项目**不使用**。

---

## 5. 抓挠行为

### 5.1 功能（多项研究一致）

| 功能 | 证据 |
|---|---|
| 视觉 + 化学标记（趾垫腺分泌物 + 表面划痕） | Mengoli et al. 2013；DePorter & Elzerman 2019 |
| 爪鞘维护 | Mengoli 2013 引用 Hart 1972，但明确指出「爪鞘本可由牙齿或自然脱落去除，故**这并非主要目的**」 |
| 休息后前肢与爪的伸展 | Wilson et al. 2016 |
| 应激/社会张力下**增加**（标记性抓挠） | Wilson 2016；Salgirli Demirbas et al. 2024 |

> **关于「唤醒后抓挠（post-arousal scratching）」**：本次检索**未找到**以此为名的猫科一手定量研究，
> 命中的均为啮齿动物或犬类文献。因此本项目**不使用该术语**作为已确立机制。

### 5.2 频次

| 指标 | 数值 | 来源 | 等级 |
|---|---|---|---|
| 主人报告存在**不当抓挠** | **52%**（2125/4105） | Wilson et al. 2016, *JFMS* 18(10): 791–797，n=4105，36 国 | `moderate`（问卷） |
| 不当抓挠者中**每日至少一次** | **65.0%**（1382 只） | 同上 | `moderate` |
| 其中**每日多次** | **35.4%**（752 只） | 同上 | `moderate` |
| 抓挠器愈多，不当抓挠愈少 | ≤7 个时 60.2%；>10 个时 32.4% | 同上 | `moderate` |
| 抓挠器高度 >3 ft（≈91 cm）时显著减少 | 55.2% vs 矮抓挠器 64.7%，p<0.0001 | 同上 | `moderate` |

### 5.3 单次抓挠片段的时长

**`unverified` —— 未取得可靠一手来源。** 现有问卷研究测量的是频次等级（0–6）与强度 VAS（1–10），
**没有一项测量单次抓挠的秒级时长**。

### 5.4 两处必须标注的争议

**① 利益冲突**：Salgirli Demirbas et al. 2024（*Front Vet Sci* 11: 1403068，n=1211）中，
作者 XJ、LM、SE 受雇于 **Ceva Santé Animale**，研究由 Ceva 资助，且**资助方参与数据收集**，
系已发表 Ceva 消费者研究的二次分析。该研究样本量很大，**容易被误当作独立证据**。
Wilson et al. 2016 亦为 Ceva 员工作者、数据分析在 CEVA 完成。

**② 因果方向未定（`disputed`）**：有一篇 2025 年 *Applied Animal Behaviour Science* 论文标题为
"Unwanted feline scratching in the home: A re-examination of its relationship with stress and marking"，
从标题即可看出它对「抓挠 = 应激/标记」这一通行解释持**再检验**立场（**本次未能取得全文或摘要**）。
因此**「抓挠增加 = 应激增加」这一因果表述应标 `disputed`**，不得作为单一解释陈述。
项目若做抓挠事件计数，**只能描述计数本身的变化趋势，不解释原因**。

---

## 6. 理毛（self-grooming）

| 指标 | 数值 | 来源 | 等级 |
|---|---|---|---|
| 口腔自我理毛占整体时间预算 | **4%** | Eckstein & Hart 2000, n=11 | `moderate` |
| 蹭抓理毛耗时 | 约为口腔理毛的 **1/50** | 同上 | `moderate` |
| 理毛占活动预算 | **4%**；由若干**短片段**组成 | Guillon et al. 2026 | `moderate` |
| 95% 的理毛片段覆盖 **2–7 个身体部位** | — | Guillon et al. 2026 | `moderate` |
| 长毛 vs 短毛对理毛时长/片段**无显著差异** | — | Guillon 2026；Kim et al. 2019, *JFMS* 21(4): 373–378（n=10） | `strong`（两项独立研究一致） |
| 心因性脱毛猫咬皮肤的时长为健康短毛猫的 **10 倍** | p<0.001 | Guillon et al. 2026 | `moderate` |
| 理毛序列**不**遵循严格固定模式，由相邻部位的概率性转移决定 | — | Hock & Schmidt 2026, *J Exp Anal Behav* 126(3): e70146（n=17，40 段序列）；Guillon 2026 | `strong` |
| 理毛片段的**平均时长（秒）** | **未取得可靠一手来源** | — | `unverified` |

**可观测**：理毛事件的**计数**与**总时长**；理毛总量上升（应激相关行为的常见指标）。
**不可观测**：理毛的**身体部位**、是否造成皮损（需摄像头或兽医检查）。

---

## 7. 进食 / 饮水 / 猫砂盆使用

本节定位是「**居家场景相关，但项圈不可观测**」，用来界定形态分工。

### 7.1 已核实的一手数据

Migny, Concordet & Reynolds 2026, *JFMS* 28(2): 1098612X251414320（n=9 健康室内猫，预实验，
智能喂食器 + 联网猫砂盆，观测 63–289 天，均值 118 ± 66 天）：

| 项目 | 发现 |
|---|---|
| 进食节律 | **9/9 猫**存在日周期个体剖面；**8/9 呈双峰**，主要在约 **04:00–08:00** 与 **16:00–20:00**（主人的活动时段） |
| 排粪尿节律 | **9/9 猫**呈双峰；主要在约 **04:00–08:00** 与 **20:00–24:00**（主人不活动或不在家时） |
| 个体稳定性 | 所有猫的 5 天滑动剖面重复性良好 → 行为**重复性高、变异低** |

> ⚠️ **限制**：Ceva 与 Novandsat 免费提供设备；n=9，作者自称 preliminary study；
> 进食记录保留率 84.9%、排泄 82.2%；**猫砂盆设备对排泄物重量的记录可靠性较低**，
> 因此原文改用**访问次数**分析。**6/9 猫为定时喂食** → 「进食双峰」部分由饲喂制度决定。

### 7.2 重要的否定结论（`unverified`，不得写数字）

| 项目 | 状态 |
|---|---|
| 每日**排尿次数**与**排粪次数**的独立典型值 | **未取得一手来源**（Migny 只报告合并访问次数的日周期形状，未区分排尿/排粪） |
| 每日**饮水量**（ml/kg/day） | **未取得同行评审的一手测量** |
| 每日**进食量**（g 或 kcal/kg） | 未取得可核实的 NRC/WSAVA 一手数值 |
| 进食片段时长、猫砂盆单次访问时长 | **未取得** |

### 7.3 为什么这一节对项目重要

Migny 2026 的**方法学结论比它的数字更有价值**：

> 「个体剖面**互不重叠**，尽管共享共同特征（如双峰性），这说明需要**个体化参考而非群体常模**。」

这是本项目「只做自身基线、不做跨猫阈值」这一设计决策的**一手文献支撑**（`moderate`）。

---

## 8. 躲藏与垂直空间使用

### 8.1 躲藏

| 命题 | 证据 | 等级 |
|---|---|---|
| 提供躲藏箱能**显著加快**新入舍猫的应激评分下降 | van der Leij et al. 2019, *PLoS ONE* 14(10): e0223492，**随机对照试验**，n=23（实验 12 / 对照 11），荷兰收容所 | `moderate` |
| 有躲藏箱的猫达到较低应激评分稳态**早 7 天** | 同上 | `moderate` |
| 躲藏箱**不能**防止体重下降 | 两组几乎全部猫头两周均显著减重 | `moderate` |
| 无躲藏机会时，应激猫会退到**猫砂盆后方**作为替代性躲藏 | 作者引用多项研究 | `moderate` |
| **家猫躲藏时长的确切数字** | **未取得可靠一手来源** | `unverified` |

> ⚠️ **外推限制（必须写明）**：van der Leij 2019 的人群是**新入收容所的猫**（急性应激、陌生环境），
> 不能直接外推到**已定居的家庭猫**。项目可以主张的是：躲藏处的**存在与使用情况可被观测**，
> 以及它是 AAFP/ISFM 指南明确列为必需资源的项目。

### 8.2 垂直空间使用

| 命题 | 数值 | 来源 | 等级 |
|---|---|---|---|
| 猫对**高处结构**有显著偏好 | χ²(2)=1234.2, p<0.001 | Hirsch et al. 2025, *Animals* 15(22): 3233；n=27 绝育家猫，**猫咖**环境，227 小时直接观察 | `moderate` |
| **家猫每天在垂直空间停留的时长占比** | **未取得一手来源** | — | `unverified` |
| **「项圈能否识别攀爬」** | **加速度计 true positive = 0** | Smit 2023 | `moderate`（**否定**结论） |

> ⚠️ Hirsch 2025 是**猫咖**（陌生人群、8–9 只猫合笼），「垂直空间重要」的方向可引用，
> 但**数值一律不可外推到家猫**。

### 8.3 指南层证据（可核查的资源清单）

Ellis et al. 2013, "AAFP and ISFM feline environmental needs guidelines", *JFMS* 15(3): 219–230，
提出**五支柱**框架，把「环境需求」操作化为**可核查的资源清单**。
`moderate`（权威指南）。

---

## 9. 人在场 / 不在场的影响

这是「离家事件流」的核心依据，也是**证据最参差**的一节。必须严格分层。

### 9.1 较强的证据

| 命题 | 数值 | 来源 | 等级 |
|---|---|---|---|
| **主人离开**时猫的**发声率显著上升** | 习惯化阶段 IRR = 3.23（p=0.0035）；体检阶段 IRR = 3.18（p=0.007） | Hare et al. 2025, *Appl Anim Behav Sci*；n=33 猫-主配对，受试内交叉设计 | `moderate` |
| 主人不在场时**没有检测到其他**猫反应差异 | 原文 "No other cat response effects were detected." | 同上 | `moderate` |
| 主人认为自己和猫在**在场**时都更舒适 | p<0.0001 | 同上（对猫而言这是**主观偏差**的证据） | `moderate` |
| 疫情限制期主人接触互动频率增加，与猫的**应激相关行为升高**相关 | — | Takagi et al. 2023, *Animals* 13(13): 2217 | `moderate`（相关性，因果未定） |

> ⚠️ **场景限制**：Hare 2025 的场景是**兽医体检**（高应激、陌生环境），
> 不能直接当作「家里没人时猫会叫得更多」的证据。但它是同方向上唯一受控、受试内、
> 有统计量的研究，**方向性可用，场景需标注**。

### 9.2 冲突证据：猫与主人的关系本质（`disputed`）

| 研究 | 方法 | 结论 |
|---|---|---|
| Vitale, Behnke & Udell 2019, *Current Biology* 29(18): R864–R865 | 使用人类婴儿文献的行为标准 | 猫对照护者表现出**可区分的依恋风格** |
| Potter & Mills 2015, *PLoS ONE* 10(9): e0135109 | n=20，**完全平衡的交叉设计**改编版 Strange Situation Test | **「猫与主人的关系构成安全依恋」在方法学上站不住**；唯一一致的差异是**主人在而非陌生人离开时猫叫得更多** |

**判定 `disputed`**：两个方向相反，且 Potter & Mills 明确批评了先前研究的方法学。
因此项目中**禁止**使用「依恋 / 想念主人」这类表述，**只能**使用可计数的事实：
「主人在场 vs 不在场时，发声事件计数存在差异」。

**这恰好是一个罕见的好消息**：证据最弱的关系解释，对应着**证据最一致的可观测事件**。

### 9.3 未取得的证据（全部 `unverified`）

| 命题 | 状态 |
|---|---|
| 主人不在时猫的**整体活动量**是否变化 | **未取得一手来源** |
| 「猫在门口迎接主人」的发生率 / 时长 | **未取得**（且 Smit 2023 的 46 小时录像里 `human contact` 为 **0 秒**） |
| 主人不在时**抓挠**是否增加 | **未取得一手来源** |
| 主人不在时**躲藏**是否增加 | **未取得一手来源** |

> **给项目的硬提醒**：「我不在时猫发生了什么」这一问题，**有直接受控证据支持的只有「发声事件计数」一项**。
> 活动量、抓挠、躲藏的变化方向目前**都是推测**。仿真器可以生成这些通道，
> 但产品文案必须把它们标为**待验证假设**，而不是文献结论。

---

## 10. 项圈**看不到**什么，以及物理原因

| 不可观测项 | 物理 / 方法学原因 |
|---|---|
| **饮水行为** | 饮水动作的加速度特征极微弱且非周期性；Smit 2023 的 46 小时录像中饮水**一次都没出现**，无法验证。可靠测量需**称重水碗或流量计** |
| **排尿 / 排粪量与次数** | 排泄发生在**项圈之外的物体上**（砂盆）；项圈无法感知猫是否在盆内，也无法感知排泄物质量。现有唯一可行方案是**联网猫砂盆** |
| **体重** | 需要**秤**。加速度计测量的是加速度，不是质量 |
| **进食量 / 热量摄入** | 需要**称重食盆**。项圈只能给出「疑似进食」的加速度模式，且 Smit 2023 中 eating 的 RF specificity 仅 0.72，**误报率过高** |
| **面部表情 / 疼痛表情评分** | 面部动作单元**都在头上**；项圈位于颈部腹侧、视角朝向胸口。这是**物理错配**，不是工程难度 |
| **呼吸频率 / 波形（由项圈）** | 项圈在颈部且与体表存在相对位移；**未找到**猫用项圈加速度计可靠提取呼吸频率的一手同行评审研究 |
| **心率 / HRV（由项圈）** | 颈部毛发浓密、项圈滑动 → 运动伪影；**未找到**猫用项圈 PPG 心率/HRV 的验证研究 |
| **体温（核心体温）** | 项圈贴颈测得的是**被毛表面温度**，与核心体温之间隔着被毛隔热层 |
| **攀爬（climbing）** | Smit 2023 首轮模型中 climbing 的 **true positive = 0** |
| **爬砂 / 掩埋（digging）** | Smit 2023 中 **true positive = 0** |
| **异体理毛（allogrooming）** | true positive = 0，且需区分「哪只猫理哪只猫」，单猫项圈原理上不可能完成 |
| **「猫在哪」/ 房间级位置** | 项圈无定位能力（无 GPS / UWB）。**空间占用只能由摄像头或固定式传感器承担** |
| **情绪状态 / 疼痛** | 情绪体验不可直接测量；可观测的只有**行为代理指标**，且特异性不足 |

---

## 11. 主表：行为 → 传感器 → 速率/时长 → 证据等级 → 来源

**传感器代码**：`IMU` = 项圈三轴加速度计；`MIC` = 项圈麦克风；`CAM` = 居家摄像头；
`ENV` = 环境噪声；`FIX` = 固定式设备
**可观测性**：`●` 已验证可识别 ｜ `◐` 可检测但不精确 / 需融合 ｜ `○` 可检测为事件但无已验证分类器 ｜ `✗` 物理上不可观测

| 行为 / 事件 | IMU | MIC | CAM | FIX | 典型频次 / 时长 | 证据等级 | 来源 |
|---|---|---|---|---|---|---|---|
| 卧 / 坐 / 站 / 行走 | ● | ○ | ● | ✗ | 占比无可靠数字 | `moderate`（可识别性）／`unverified`（占比） | Smit 2023 |
| 静息 + 睡眠 | ● | ✗ | ● | ✗ | **约 50% 的时间**（实验限制条件） | `moderate` | Eckstein & Hart 2000 |
| 静息/睡眠随年龄 | ● | ✗ | ● | ✗ | 总量 r=+0.45；日间 +0.41；夜间 +0.25 | `moderate` | Yamazaki 2020 |
| 活动量随年龄 | ● | ✗ | ○ | ✗ | r = −0.32 | `moderate` | Yamazaki 2020 |
| 跳跃（计数） | ●（气压） | ○ | ● | ✗ | **自然日频次无一手来源** | `unverified`（频次） | Yamazaki 2020 |
| 跳跃类型 | ● | ✗ | ● | ✗ | 正确率 94.6%；**下限 40 cm** | `moderate` | Sharon 2020 |
| 攀爬 | **✗** | ○ | ● | ✗ | true positive = 0 | `moderate`（否定） | Smit 2023 |
| 理毛 | ◐ | ○ | ● | ✗ | 占整体 **4%**；若干短片段；95% 覆盖 2–7 部位 | `moderate`（占比）／`unverified`（秒级时长） | Eckstein 2000；Guillon 2026 |
| 抓挠（物体） | ◐（**易误判为理毛**） | ◐ | ● | ✗ | 52% 有不当抓挠；其中 65.0% 每日≥1 次、35.4% 每日多次；**单次时长无来源** | `moderate`（频次）／`unverified`（时长） | Wilson 2016 |
| 抓挠的功能解释 | ✗ | ✗ | ✗ | ✗ | 应激/标记解释有再检验争议 | `disputed` | Mengoli 2013；2025 AABS 文（未取得全文） |
| 甩头 / 摩擦 | ○ | ○ | ● | ✗ | 无已验证猫用分类器 | `unverified` | Smit 2023 |
| 爬砂 / 掩埋 | **✗** | ○ | ● | ✗ | true positive = 0 | `moderate`（否定） | Smit 2023 |
| 进食 | ◐（specificity 0.72） | ◐ | ● | ● | 双峰（约 04–08 与 16–20）；**次数与时长无来源** | `moderate`（时序）／`unverified`（次数） | Migny 2026 |
| 饮水 | ◐ | ◐ | ● | ● | Smit 2023 的 46 小时录像中 **0 次** | `unverified` | Smit 2023 |
| 使用猫砂盆 | ◐ | ○ | ● | ● | 双峰（约 04–08 与 20–24）；**排尿/排粪次数无来源** | `moderate`（时序）／`unverified`（次数） | Migny 2026 |
| 躲藏 | ✗ | ✗ | ● | ✗ | **确切时长无来源** | `unverified` | — |
| 躲藏箱对应激评分 | ✗ | ✗ | ✗ | ✗ | 稳态早 **7 天**（**收容所人群**） | `moderate` | van der Leij 2019 |
| 垂直空间停留 | ✗ | ✗ | ● | ✗ | 偏好方向可引用；**家猫占比无来源** | `moderate`（方向）／`unverified`（占比） | Hirsch 2025 |
| 发声（仅计数） | ✗ | ● | ◐ | ✗ | 主人不在场时 IRR ≈ 3.2 | `moderate`（**兽医体检场景**） | Hare 2025 |
| 人猫直接接触 | ✗ | ○ | ● | ✗ | 46 小时录像中 **0 秒** | `moderate`（稀疏性） | Smit 2023 |
| 姿势/位置转换 | ◐ | ✗ | ● | ✗ | **转换率无一手来源** | `unverified` | — |
| 呼吸频率 | ○ | ◐ | ◐ | ✗ | **未取得猫用项圈验证研究** | `unverified` | — |
| 心率 / HRV | ○ | ◐ | ✗ | ✗ | **未取得猫用项圈 PPG 验证研究** | `unverified` | — |
| 核心体温 | ✗ | ✗ | ✗ | ✗ | 体表与直肠温不可换算 | `moderate`（否定） | Giannetto 2022 |
| 情绪状态 | ✗ | ✗ | ✗ | ✗ | 不可直接测量 | 原理上不可测 | Mendl 2010 |

---

## 12. 必须标 `disputed` 或 `unverified` 的主张清单

### 12.1 `disputed`（来源冲突，必须呈区间）

| # | 主张 | 冲突双方 | 项目中的正确写法 |
|---|---|---|---|
| D1 | 家猫是否有稳健的 24 小时活动节律 | Yamazaki 2020（n=61，有日/夜静息差异）**vs** Piccione 2014（n=5，**无**日节律，主人存在使猫「失去节律」） | 写「是否存在稳健日节律，文献意见不一致；只输出相对倾向，不给固定峰值时刻」 |
| D2 | 抓挠的功能与「应激/标记」的关系 | Mengoli 2013、Wilson 2016、Salgirli Demirbas 2024 支持**vs** 2025 AABS 再检验论文（本次未取得全文） | **只描述抓挠事件的计数变化**，不解释原因；必须解释时写「存在多种解释且文献有争议」 |
| D3 | 猫与主人是否形成安全依恋 | Vitale 2019 vs Potter & Mills 2015（后者批评前者方法学） | **禁止**「依恋 / 想念」表述；**只**用「发声事件计数的差异」 |
| D4 | 猫是否晨昏性 | 通俗与继续教育材料 **vs** Piccione 2014 的「无日节律」与 Migny 2026 的双峰部分由**饲喂制度**决定 | 写「活动在一天内不均匀，常见清晨与傍晚两个窗口，窗口时刻随个体与喂食制度大幅变动」 |

### 12.2 `unverified`（无可靠一手来源，**不得写具体数字**）

U1 每日活动**片段数**｜U2 活动/休息片段的**典型时长**｜U3 各姿势占 24 小时的**百分比**｜
U4 每日自然**跳跃次数**｜U5 家猫**最大跳跃高度**｜U6 抓挠**单次片段时长**｜U7 理毛片段的**秒级时长**｜
U8 每日**排尿/排粪次数**｜U9 每日**饮水量**｜U10 每日**进食量**｜U11 猫砂盆单次访问时长、进食片段时长｜
U12 家猫**垂直空间停留占比**｜U13 主人不在时**活动量**的变化方向｜U14 主人不在时**抓挠/躲藏**的变化方向｜
U15 「猫在门口迎接主人」的发生率｜U16 **呼吸频率**可由猫用项圈可靠测量｜U17 **心率/HRV** 可由猫用项圈可靠测量｜
U18 「post-arousal scratching」作为猫科已确立机制｜U19 Piccione 2012 的**具体数值**（只可引其存在）

### 12.3 需标注**利益冲突**的来源

| 来源 | 冲突情况 |
|---|---|
| Yamazaki et al. 2020 | 设备由 JARMeC 借出；两位作者为其雇员；**专利申请中 JP2017-514095** |
| Salgirli Demirbas et al. 2024 | 作者受雇于 **Ceva**；研究由 Ceva 资助且**参与数据收集** |
| Wilson et al. 2016 | 作者为 **Ceva Animal Health** 员工；数据分析在 CEVA 完成 |
| Migny et al. 2026 | 设备由 **Ceva 与 Novandsat** 免费提供；n=9 预实验 |
| Sharon et al. 2020 | 未声明设备厂商参与，冲突风险低 |

---

## 13. 对本项目行为层的直接结论

1. **项圈能可靠做的事**：姿势分类（卧/坐/站/活动）、静息与睡眠时长、活动量、
   跳跃事件计数与类型（≥40 cm）、发声事件计数、理毛总量的**近似**估计。
2. **项圈不能独立做的事**：抓挠（会被系统性误判为理毛，必须多通道融合）、攀爬（= 0）、
   爬砂（= 0）、异体理毛（= 0）、饮水、排泄、进食量、体重、面部表情、核心体温。
3. **跳跃是最强的项圈独有信号**：检测已验证（94.6% 类型正确率），
   且跳跃减少/高度降低是文献中最早的 OA 行为信号（71% / 67%），
   而主人主观评分与客观骨科异常**无关联**。但**不要写每日跳数**——没有一手来源。
4. **「离家事件流」有直接文献支持的通道只有「发声事件计数」**（Hare 2025：IRR≈3.2）。
   活动量、抓挠、躲藏的变化方向目前均为**假设**。
5. **「只做自身基线」有 Migny 2026 的一手支撑**：个体日剖面互不重叠。
6. **四处 `disputed`**（日节律稳健性、抓挠的应激解释、猫-主人依恋、晨昏性）；
   **十九处 `unverified`** 不得出现具体数字。

---

## 14. 参考文献

1. Yamazaki A, Edamura K, Tanegashima K, Tomo Y, Yamamoto M, Hirao H, Seki M, Asano K. (2020). Utility of a novel activity monitor assessing physical activities and sleep quality in cats. *PLoS ONE* 15(7): e0236795. https://doi.org/10.1371/journal.pone.0236795 ｜ https://pmc.ncbi.nlm.nih.gov/articles/PMC7394395/
2. Piccione G, Marafioti S, Giannetto C, Di Pietro S, Quartuccio M, Fazio F. (2014). Comparison of daily distribution of rest/activity in companion cats and dogs. *Biological Rhythm Research* 45(4): 615–623. https://doi.org/10.1080/09291016.2014.884303
3. Piccione G, et al. (2012). Daily rhythm of total activity pattern in domestic cats maintained in two different housing conditions. *Journal of Veterinary Behavior* 8(4): 189. https://doi.org/10.1016/j.jveb.2012.09.004（**仅核实到标题与卷页**）
4. Smit M, Ikurior SJ, Corner-Thomas RA, Andrews CJ, Draganova I, Thomas DG. (2023). The Use of Triaxial Accelerometers and Machine Learning Algorithms for Behavioural Identification in Domestic Cats: A Validation Study. *Sensors* 23(16): 7165. https://doi.org/10.3390/s23167165 ｜ https://pmc.ncbi.nlm.nih.gov/articles/PMC10458840/
5. Dunford CE, Marks NJ, Wilson RP, Scantlebury DM. (2024). Identifying animal behaviours from accelerometers. *Ecology and Evolution* 14(5): e11380. https://doi.org/10.1002/ece3.11380
6. Eckstein RA, Hart BL. (2000). The organization and control of grooming in cats. *Applied Animal Behaviour Science* 68(2): 131–140. https://doi.org/10.1016/S0168-1591(00)00094-0
7. Eckstein RA, Hart BL. (2000). Grooming and control of fleas in cats. *Applied Animal Behaviour Science* 68(2): 141–150. https://doi.org/10.1016/S0168-1591(00)00095-2
8. Guillon M, Naudin L, Cochet-Faivre N, Titeux E, Gilbert C. (2026). Exploring Normal to Abnormal Variations of Grooming Behaviours in Cats. *Veterinary Dermatology* 37(5): 865–875. https://doi.org/10.1111/vde.70109
9. Hock A, Schmidt M. (2026). Decoding diversity: Are there patterns in the organization of grooming movements in domestic cats? *Journal of the Experimental Analysis of Behavior* 126(3): e70146. https://doi.org/10.1002/jeab.70146
10. Kim HS, Hong JS, Park CW, Cho KH, Kim YY. (2019). Evaluation of grooming behaviour and apparent digestibility method in cats. *JFMS* 21(4): 373–378. https://doi.org/10.1177/1098612X18783837
11. Sharon KP, Thompson CM, Lascelles BDX, Parrish RS. (2020). Novel use of an activity monitor to model jumping behaviors in cats. *AJVR* 81(4): 334–343. https://doi.org/10.2460/ajvr.81.4.334
12. Wilson C, Bain M, DePorter T, Beck A, Grassi V, Landsberg G. (2016). Owner observations regarding cat scratching behavior. *JFMS* 18(10): 791–797. https://doi.org/10.1177/1098612X15594414
13. Mengoli M, et al. (2013). Scratching behaviour and its features: a questionnaire-based study in an Italian sample of domestic cats. *JFMS* 15(10): 886–892. https://doi.org/10.1177/1098612X13481468
14. Salgirli Demirbas Y, et al. (2024). Evaluating undesired scratching in domestic cats. *Frontiers in Veterinary Science* 11: 1403068. https://doi.org/10.3389/fvets.2024.1403068（**利益冲突：Ceva 资助并参与数据收集**）
15. DePorter TL, Elzerman AL. (2019). Common feline problem behaviors: Destructive scratching. *JFMS* 21(3): 235–243. https://doi.org/10.1177/1098612X19831205
16. Taylor S, Mackie IM, Heath S, Paramasivam SJ. (2025). Feline management practices and resource provision in the UK. *Veterinary Record* 197(3): e5561. https://doi.org/10.1002/vetr.5561
17. Migny R, Concordet D, Reynolds BS. (2026). Characterising individual feeding and elimination behaviours in healthy cats using a connected smart feeder and litter box. *JFMS* 28(2): 1098612X251414320. https://doi.org/10.1177/1098612X251414320 ｜ https://pmc.ncbi.nlm.nih.gov/articles/PMC12905059/
18. van der Leij WJR, Selman LDAM, Vernooij JCM, Vinke CM. (2019). The effect of a hiding box on stress levels and body weight in Dutch shelter cats; a randomized controlled trial. *PLoS ONE* 14(10): e0223492. https://doi.org/10.1371/journal.pone.0223492
19. Ellis SLH, Rodan I, Carney HC, Heath S, Rochlitz I, Shearburn LD, Sundahl E, Westropp JL. (2013). AAFP and ISFM feline environmental needs guidelines. *JFMS* 15(3): 219–230. https://doi.org/10.1177/1098612X13477537
20. Hirsch EN, Navarro Rivero B, Andersson M. (2025). Cats in a Cat Café: Individual Cat Behavior and Interactions with Humans. *Animals* 15(22): 3233. https://doi.org/10.3390/ani15223233
21. Hare LV, Marsilio S, Halperin I, Stellato AC, Moody CM. (2025). Owner presence versus absence during cat veterinary examinations. *Applied Animal Behaviour Science*.（AGRIS 记录 ID IND609281136；**本次未取得出版页 URL，仅取得摘要**）
22. Potter A, Mills DS. (2015). Domestic Cats Do Not Show Signs of Secure Attachment to Their Owners. *PLoS ONE* 10(9): e0135109. https://doi.org/10.1371/journal.pone.0135109
23. Vitale KR, Behnke AC, Udell MAR. (2019). Attachment bonds between domestic cats and humans. *Current Biology* 29(18): R864–R865. https://doi.org/10.1016/j.cub.2019.08.036
24. Takagi S, et al. (2023). Effects of the COVID-19 Pandemic on the Behavioural Tendencies of Cats and Dogs in Japan. *Animals* 13(13): 2217. https://doi.org/10.3390/ani13132217
25. Clarke SP, Bennett D. (2006). Feline osteoarthritis: a prospective study of 28 cases. *J Small Anim Pract* 47(8): 439–445. https://doi.org/10.1111/j.1748-5827.2006.00143.x
26. Herrera K, et al. (2026). Clinically important abnormalities are common in senior cats perceived to be healthy by owners. *JAVMA*. https://doi.org/10.2460/javma.26.04.0326 ｜ https://europepmc.org/articles/PMC13472236
27. Giannetto C, et al. (2022). Use of Infrared Thermometers for Cutaneous Temperature Recording. *Animals* 12(10): 1275. https://doi.org/10.3390/ani12101275
28. Prigent Garcia S, Chebly A. (2024). Accelerometers contribution to the knowledge of domestic cats' behavior: A comprehensive review. *Applied Animal Behaviour Science* 275: 106287. https://doi.org/10.1016/j.applanim.2024.106287（**本次未能解析其正文，汇总数字未核实**）
29. Thonen-Fleck C, et al. (2025). Physical Activity Monitors in Companion Animal Chronic Pain Research. *Animals* 15(14): 2025. https://doi.org/10.3390/ani15142025
30. Roshanravan F, Azizzadeh M, Khoshnegah J. (2026). Epidemiology and Risk Factors of Behavioral Disorders in Domestic Cats. Research Square 预印本。https://doi.org/10.21203/rs.3.rs-8855548/v1（**未同行评审，标 `weak`**）
