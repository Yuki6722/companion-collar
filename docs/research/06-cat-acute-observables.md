# 06 · 猫在疾病与急性痛苦下的居家可观察信号

> **归档位置**：`docs/research/06-cat-acute-observables.md`
> **适用范围**：本项目的行为模型、项圈事件流定义、漂移报告与突发演示的措辞与边界
> **检索日期**：2026-10-03。全部 URL 均经实际访问核实；付费墙或抓取失败者逐条标注。

---

## 0. 范围与不可逾越的边界

### 0.1 本文回答什么

只回答两个**可证伪**的问题：

1. **哪些可观察、可计数的事件与姿态/位置变化**，在同行评审文献或权威兽医指南中
   **被记录下来与**某些状况**同时出现**（association）；
2. 这些变化里，**哪些是颈部形态的项圈在物理上可能看到的**，哪些不是。

### 0.2 本文不回答什么（硬边界，违反即返工）

- **本项目不做诊断，也不宣称能检出疾病。** 全文动词一律是「被记录为与……相关」「文献中报告」；
  不使用「识别出」「证明患有」「筛查」。
- **关联不等于因果，更不等于诊断。** 同一个可观察变化（例如活动量下降）在文献中同时与
  骨关节炎、疼痛、恐惧、肥胖、环境改变、正常衰老相关。**没有一项可观察信号是特异指标。**
- **所有数值都是仿真数据。** 文中的临床参考区间只用于让仿真贴近现实、以及给用户的边界说明，
  **不构成任何兽医诊断依据**（`AGENTS.md` §3.4）。
- **本文中的犬类研究不得移植到猫。** 凡涉及犬的数据，已在标题与证据列显式标注 `犬`。

### 0.3 证据等级

| 等级 | 定义 |
|---|---|
| `strong` | 多个相互独立的同行评审发现一致 |
| `moderate` | 单一研究，或权威综述 / 指南 |
| `weak` | 二手来源、讲义、厂商材料 |
| `unverified` | 无可信一手来源 → **禁止展示具体数字** |
| `disputed` | 来源冲突 → **必须展示为区间**并标注冲突 |

---

## 1. 为什么「猫病了但主人没看出来」是有证据的

### 1.1 猫的疼痛与疾病表现本身就很细微软

- 2022 ISFM 急性疼痛共识指南原文：「Pain has traditionally been under-recognised in cats.
  Pain assessment tools are not widely implemented, and **signs of pain in this species may be subtle**.」
  （[PMC10845386](https://pmc.ncbi.nlm.nih.gov/articles/PMC10845386/)，PMID 34937455）— `moderate`
- 同指南的关键句：「Signs of pain may be subtle and misinterpreted; for example, when a cat simply
  reduces movement and **'freezes' due to fear**.」— `moderate`
  **这一句是本项目最重要的假阳性来源**：项圈看到「长时间低活动/不动」，**无法区分疼痛与恐惧**。
- 2024 ISFM/AAFP 长期 NSAID 共识指南：「Chronic pain may be **challenging to detect** in this species…」
  （[PMC11103309](https://pmc.ncbi.nlm.nih.gov/articles/PMC11103309/)）— `moderate`
- iCatCare 立场声明：「Pain assessment tools are not widely implemented…」且猫
  「less demonstrative and less likely to show overt signs of pain, **such as vocalization**」
  （[icatcare.org](https://icatcare.org/position-statements/cats-deserve-pain-relief-too)）— `moderate`

### 1.2 AAFP 2021 老年猫指南：主人往往要「被问到」才想起来

**可引用的原文（定性、无百分比）：**

> 「Client observations can help the veterinarian detect subtle changes; however, **many clients may be
> unaware of gradual changes until we ask provocative questions**.」

- 来源：2021 AAFP Feline Senior Care Guidelines，*J Feline Med Surg* 2021;23(7):613-638，
  DOI [10.1177/1098612X211021538](https://doi.org/10.1177/1098612X211021538)，PMID 34167339，
  全文 [PMC10812122](https://pmc.ncbi.nlm.nih.gov/articles/PMC10812122/) — `moderate`
- ⚠️ 原文用词是 **provocative questions**，不是 leading questions。转述时说「追问式提问」。
- 同指南：「The cat's innate ability to hide ailments makes regular physical examination that much
  more critical in the elderly cat.」
- 该指南 Table 2 标题为《Identifying the subtle signs of pain at home and in the practice》，
  是一份**客户教育清单**，按「行为模式 / 活动能力 / 触碰反应」三类组织。

### 1.3 犬的研究：主人并不比非主人更能识别细微疼痛（`犬`）

> Gardeweg SMA, Picard DE, van Herwijnen IR. *The abilities in dog pain sign recognition…*
> **PLOS ONE** 2026;21(4):e0344512. DOI [10.1371/journal.pone.0344512](https://doi.org/10.1371/journal.pone.0344512)，
> PMID 41920795，全文 [PMC13042741](https://pmc.ncbi.nlm.nih.gov/articles/PMC13042741/) — 已读全文，`moderate`

**设计与样本**

| 项 | 值 |
|---|---|
| 总 n | **647**（530 养犬者 + 117 非养犬者） |
| 国家 / 语言 | 荷兰；荷兰语问卷 |
| 方法 | 17 项行为征象按 0–4 分评「像疼痛的可能性」；3 段文字案例 |
| 统计 | Mann-Whitney U；**Bonferroni 阈值 P < 0.003**（17 组比较），P < 0.05 只能算趋势 |
| 人口学偏斜（作者自标为局限） | 88% 为女性；非养犬者更年轻 |

**核心结果（务必按原文写，不要加强）**

1. **17 项征象中只有 3 项**在两组间有差异：
   「转头或转身体避开」z = −3.51, P < 0.001；「僵住/冻结」z = −2.68, **P = 0.007
   （高于 Bonferroni 阈值 0.003，只能算趋势）**；「舔表面」P = 0.007（趋势）。
2. **方向是「主人评分更低」**：转头/转身体避开「(很)可能」养犬者 52%（274/530）vs 非养犬者 67%（78/117）；
   僵住 43%（228/530）vs 58%（68/117）。
3. **细微疼痛案例两组无差异**：panosteitis 案例 53% vs 55%，**P = 0.618**。
4. **明显运动疼痛案例几乎人人识别**：patella luxation 97% vs 92%，P = 0.010。

**必须写明的三点否证（防止过度引用）**

- ❌ 该文**没有测量「误读为应激」的比例**。原文只有推测句（「**Possibly**, dog owners recognise
  signs such as 'turning head or body away' and 'freezing'… as a stress/fear sign」）。
  **「系统性把转头避开/僵住误读为应激」这句话没有数据支撑。**
- ❌ 该文**没有效应量**（无 Cohen's d、无 OR、无 CI）。
- ❌ **该文没有猫的数据，也没有主张可外推到猫。** 全文提及「猫」仅两次，且都是人户统计。

> **→ 引用纪律**：可以写「在**犬**上，n=647 的研究显示主人对细微疼痛征象的判断并不优于非主人」；
> **不可以**写「猫主人也这样」。

### 1.4 猫本身有更直接的量化证据（本项目应当改用这一条）

**Enomoto M, Lascelles BDX, Gruen ME. Development of a checklist for the detection of degenerative
joint disease-associated pain in cats. *JFMS* 2020;22(12):1137-1147.**
DOI [10.1177/1098612X20907424](https://doi.org/10.1177/1098612X20907424)，PMID 32122226 — `moderate`

- 汇总 5 项研究、**n = 249 只 DJD 疼痛猫 + 53 只非 DJD 猫**。
- 同一份 6 题二选一清单：
  - **已被引导（DJD-informed）**的主人：敏感度/特异度 ≈ **99% / 100%**
  - **未被引导**的主人：**55% / 97%**
- **→ 未被引导时约 45% 的 DJD 疼痛猫没有被主人报告的信号识别出来。**
  这是猫上的、可直接引用的「主人漏报」量化，机制上正是 AAFP 那句「provocative questions」的实证。

**第二个猫证据（疾病而非疼痛）**：
Herrera K, et al. Clinically important abnormalities are common in senior cats perceived to be healthy
by owners. *JAVMA* 2026. DOI [10.2460/javma.26.04.0326](https://doi.org/10.2460/javma.26.04.0326)，
[PMC13472236](https://pmc.ncbi.nlm.nih.gov/articles/PMC13472236/) — `moderate`

- **n = 129** 只客户所有、**≥12 岁**（均值 14.7 ± 2.6 岁）、**入组要求主人自认健康**的猫。
- 筛查中新发现的疾病：**CKD 61.3%（49/80）**、**高血压 96.4%（54/56）**、**甲亢 64.7%（11/17）**。
- 体格检查（n=83）：**100% 有异常**；牙科疾病 82/82（100%），其中 90.2% 为新发现；
  骨科疾病 63/81（77.8%），其中 84.1% 为新发现；肌肉流失 92.6%（75/81）。
- **主人报告 vs 客观发现的落差**：「**75.6% (34 of 45)** of affected cats had no owner-reported change
  and only **1.3% (1 of 78)** had reported increased thirst.」；认知功能障碍征象 54/128（42.2%），
  而「**None of the cats had previously reported FCDS**」；FMPI-sf 异常 58/77（75.3%），
  但曾被报告骨科疾病者仅 10/58（17.2%）。
- 作者结论：「Reliance on owner-reported changes **underestimated** disease burden.」

**第三个猫证据（独立复现）**：Mortier F, et al. *J Vet Intern Med* 2024;38(4):2089-2098.
DOI [10.1111/jvim.17138](https://doi.org/10.1111/jvim.17138)，PMID 38967102 — `moderate`（仅读摘要）
- **n = 259** 只「表面健康」的成熟成猫与老年猫；基线时 **21%** 并不健康；2 年内
  **28% 的成熟成猫、54% 的老年猫**出现新疾病。
- ⚠️ Herrera 2026 把该文引为「21%（22 of 259）… 37%（73 of 201）」，与主摘要的 28%/54% 不符 →
  **以主摘要为准**。

### 1.5 反向证据：主人**能**看到明显变化时，观察是有价值的（必须一并呈现）

- **Maniaki E, et al. *JFMS* 2023;25(6).** DOI [10.1177/1098612X231178765](https://doi.org/10.1177/1098612X231178765)，
  PMID 37382593：盲法巢式病例对照，**n = 57**。病例组 FMPI 更低（**P = 0.003**）、
  VetMetrica Comfort 更低（**P = 0.002**）、总疼痛评分更高（**P < 0.0001**）— `moderate`
- **Klinck MP, et al. *Can Vet J* 2012;53(11):1181-1186.** PMID 23633711：
  **n = 50** 例确诊 OA 的猫，**主人报告异常是 30% 病例的首要发现、并在 64% 病例中与体检/影像共同触发诊断** — `moderate`
- **Blanchard T, et al. *Animals* 2023;13(23):3646.** DOI [10.3390/ani13233646](https://doi.org/10.3390/ani13233646)：
  **n = 270 只猫 + 304 只犬**，**24% 的猫主人低估了自己猫的体况** — `moderate`

> **→ 结论措辞纪律**：不许写「X% 的主人发现不了疾病」这种单一标题句。正确写法是：
> **「主人对逐渐发生的变化容易漏报，且漏报程度因疾病而异（猫上已有量化：CKD 相关排尿变化 75.6%
> 未被报告；未受引导时 DJD 疼痛清单敏感度 55%）；但当变化足够明显时，主人的观察确实与客观检查结果一致。」**

---

## 2. 居家可观察的急性表现与紧急程度

> 每条给出：**在家能看到什么** → **来源自己的紧急度措辞** → **来源** → 等级。

### 2.1 呕吐（区分呕吐 vs 反流）

- **能看到**：呕吐是「主动用力」过程——「normally preceded by **excessive salivation, repeated
  swallowing, retching, and forceful contractions** of the abdominal muscles and the diaphragm」；
  **反流（regurgitation）**是「a **passive** motion that does not require effort… expelled food and
  fluid tends to be **undigested** and may have a **cylindrical shape**」。
- **紧急度（来源措辞）**：偶发且无其他症状、持续「less than 1 to 2 days」可先支持治疗；
  「vomiting that occurs **more often than once or twice daily**, and vomiting accompanied by
  **blood, abdominal pain, depression, dehydration, weakness, fever, weight loss**…
  requires a detailed examination」；「Some causes of severe or longterm vomiting are **life-threatening**.」
- 来源：[MSD Veterinary Manual, Vomiting in Cats](https://www.msdvetmanual.com/cat-owners/digestive-disorders-of-cats/vomiting-in-cats) — `moderate`（猫专属）

### 2.2 腹泻

- **能看到**：软便/水样便、颜色改变、果冻样物、排便费力、次数增多、黏液与/或鲜血。
- **紧急度（来源措辞）**：「always important to have your cat checked… whenever diarrhoea is **severe**,
  **accompanied by other signs** of your cat being unwell, or if the diarrhoea continues for
  **more than a few days**」；**黑便（melaena）「should prompt contact」**。
- 来源：[iCatCare, Diarrhoea in cats](https://icatcare.org/articles/diarrhoea-in-cats) — `moderate`

### 2.3 食欲下降 / 厌食

- **紧急度（来源措辞，含猫专属时间阈值）**：「contact your veterinary team as soon as possible」；
  「this should be done **urgently if your cat has had a reduced appetite for three days or more**」；
  「as a species, they can **develop liver problems if they go without food even for a short time**.」
- 来源：[iCatCare, Inappetence in cats](https://icatcare.org/articles/inappetence-in-cats) — `moderate`
- **「≥3 天」是本项目可引用的少数猫专属数值阈值之一**。流传的「>24 小时需就医」**未取得一手来源**。

### 2.4 精神沉郁 / 无力

- **能看到**：不回应、不移动、对周围淡漠；常与其他征象同时出现。
- **紧急度**：**未找到任何来源给出「无力 = 某级紧急度」的独立规则**；紧急度由**所伴综合征**决定。
- 来源：[MSD, Pancreatitis in Dogs and Cats](https://www.msdvetmanual.com/digestive-system/the-exocrine-pancreas/pancreatitis-in-dogs-and-cats) — `moderate`
- 作为独立红旗：`unverified`。

### 2.5 躲藏

- **能看到（原文）**：「Becoming withdrawn and **hiding is a typical feline response to pain** – cats
  will do this to try and protect themselves, conserve energy and minimise the risk of experiencing any
  further pain… may hide in **unusual places** where they are partially or fully concealed and appear
  **more sedentary than usual** or even **seem depressed**.」
- 来源：[iCatCare, How to spot signs of pain in cats](https://icatcare.org/news/how-to-spot-signs-of-pain-in-cats-pain-awareness-month-2026) — `moderate`
- ⚠️ **未找到任何量化「病猫 vs 健康猫躲藏时长」的同行评审研究**（`unverified`，不得给数字）。

### 2.6 夜间发声（嚎叫/喵叫）

- **关联（临床描述级）**：甲亢、认知功能障碍综合征、疼痛、系统性高血压、耳聋、饥饿。
- **证据状态**：**未找到任何一手研究把夜间发声对上述任一诊断做过量化** → `weak`，**禁止给百分比**。
- 来源：[iCatCare, Hyperthyroidism in cats](https://icatcare.org/articles/hyperthyroidism-in-cats)（该页文字只覆盖「不安/烦躁」）

### 2.7 烦躁不安 / 来回踱步

- **能看到**：「Increased activity, restlessness, or irritability」是甲亢经典征象；同页另有一句对传感器
  有意义的观察：猫「may also **pant when they're stressed**, which is **very unusual in healthy cats**」。
- ⚠️ 「pacing（踱步）」这个词**未在任何已读来源正文中核实**，只能写「不安/来回移动」。`weak`

### 2.8 姿态改变：弓背、蜷缩、「祈祷姿势」

- **「祈祷姿势」的一手定义**：「Clinical signs that may suggest the presence of abdominal pain or
  discomfort include a **prayer position (forepaws on the ground with hind end elevated)** and resistance
  to pressure during ultrasonographic examination」；同章指出腹痛报告比例偏低
  「most likely due to **lack of recognition of pain**」。
  [MSD, Pancreatitis](https://www.msdvetmanual.com/digestive-system/the-exocrine-pancreas/pancreatitis-in-dogs-and-cats) — `moderate`
- **蜷缩**：猫咳嗽时可「their neck stretched out and **body crouched low to the ground**」，容易被误认为
  呕吐/毛球，建议录像。[iCatCare, Asthma and chronic bronchitis](https://icatcare.org/articles/asthma-and-chronic-bronchitis-in-cats) — `moderate`
- ⚠️ **「prayer position 特指胰腺炎/腹膜炎/膈疝/胃内异物」这一说法不成立。**
  只有「腹部不适」被一手来源支持；另三种关联为 `unverified`。

### 2.9 不愿移动

- **能看到**：「A cat may **hesitate when climbing up or down from furniture** or find it challenging to
  **navigate the stairs**… may have a **stiff gait**… **less likely to engage in play or hunting**.」
- **紧急度（来源措辞）**：安排「a health assessment **as soon as possible**」。
- 来源：iCatCare pain article — `moderate`

### 2.10 步态改变 / 跛行

- **急性、最需警惕的一类：猫动脉血栓栓塞** —— 「**pulselessness** (no femoral pulse), **pallor**,
  **poikilothermy** (decreased rectal temperature and **cold hind limbs**), and, initially,
  **extreme pain**. The gastrocnemius muscles tend to be **very firm**. Cats often can move the legs
  above the stifles, and the **tail is commonly unaffected**.」
  [MSD, Arterial Thromboembolism](https://www.msdvetmanual.com/circulatory-system/various-cardiovascular-diseases-in-dogs-and-cats/arterial-thromboembolism-in-dogs-and-cats) — `moderate`
- **慢性层面（重要反直觉事实）**：AAHA 原文「Cats are **unlikely to present or display overt lameness**.」
  （[AAHA Trends, Aug 2022](https://www.aaha.org/trends-magazine/august-2022/f1-cat-signs/)）
  → 对项圈的含义：**「没看到跛行」不能当作「没有骨科问题」**。

### 2.11 震颤 / 虚脱 / 定向障碍 / 癫痫

- **肝性脑病（HE）分级**：1 级「mild vacillating lethargy and decreased mental alertness (ie,
  **confusion or disorientation**)」；2 级加「inappropriate behaviors (house soiling…)」；
  3 级「**head pressing**, aimless wandering, circling, amaurotic blindness, marked personality change」；
  4 级「**risk for impending death**」。[MSD, Hepatic Encephalopathy](https://www.msdvetmanual.com/digestive-system/hepatic-diseases-of-small-animals/hepatic-encephalopathy-in-small-animals) — `moderate`
- **癫痫持续状态**：「treatment is essential to **prevent death** from hyperthermia, acidosis,
  hypoperfusion, and hypoxia, as well as **permanent brain damage**」。
  [MSD, Anticonvulsants for Emergency Treatment of Seizures](https://www.msdvetmanual.com/pharmacology/systemic-pharmacotherapeutics-of-the-nervous-system/anticonvulsants-for-emergency-treatment-of-seizures-in-dogs-and-cats) — `moderate`
- ⚠️ 「head pressing 与血液黏滞度过高相关」：`unverified`，不要写。

### 2.13 呼吸困难 / 张口呼吸

- **能看到**：呼吸快、**张口呼吸/喘**、呼吸有声音、呼吸费力。猫在呼吸窘迫时的典型**姿态**：
  「Cats might **crouch or sit in an upright position**.」
- **紧急度（来源措辞）**：「**this is an emergency – your cat must be seen by a vet urgently**」；
  「**Asthma attacks can be life-threatening**」。[iCatCare, Asthma](https://icatcare.org/articles/asthma-and-chronic-bronchitis-in-cats)、
  [MSD 急症评估](https://www.msdvetmanual.com/special-pet-topics/emergencies/evaluation-and-initial-treatment-of-dog-and-cat-emergencies)
  —— **两个独立权威来源一致** → `strong`

### 2.14 排尿费力 / 尿闭（**公猫重点**）

- **能看到**：「**Repeated attempts to urinate without passing anything**；Crying or discomfort when
  straining to urinate；**Urinating outside the litter tray**；Increased agitation；**Licking around the
  genital area**；Refusing food and seeming depressed；Vomiting.」该病「occurs **almost exclusively in
  male cats**」。
- **紧急度（来源措辞）**：「Urethral obstruction **must be treated as an emergency**」；
  「**Contact your vet immediately**… this is an emergency」；「Without treatment, it can cause kidney
  failure and can be **fatal within 2-3 days**. It is also **incredibly painful**.」
  [iCatCare, Urethral obstruction](https://icatcare.org/articles/urethral-obstruction-in-cats) — `moderate`
- **机制（一手）**：「Complete UO causes **uremia within 36–48 hours**… and **death within approximately
  72 hours**.」；血钾 **> 7 mEq/L** 可致心动过缓/心律失常，**> 7.5 mEq/L** 可致命。
  [MSD, Urethral Obstruction](https://www.merckvetmanual.com/urinary-system/urolithiasis-in-small-animals/urethral-obstruction-in-small-animals) — `moderate`
- ⚠️ 流传很广的「24–72 小时」**未取得一手来源**；已核实的是 **2–3 天** 与 **尿毒症 36–48 h、死亡约 72 h**。

### 2.18 分诊分级体系

- **RECOVER 的红/橙/黄/绿分诊色码：未能核实。** 检索到的是改编自人类五分法的兽医分诊清单
  （Ruys et al., *J Vet Emerg Crit Care* 2012, DOI [10.1111/j.1476-4431.2012.00736.x](https://doi.org/10.1111/j.1476-4431.2012.00736.x)），
  但 Wiley 页返回 403，**未读到任何分级内容** → `unverified`，**本文不引用任何色码体系**。

---

## 3. 与疼痛/疾病相关的行为改变总清单（按量表归属）

### 3.1 五个可核实的量表

| 量表 | 结构 | 用于 | 关键数值 |
|---|---|---|---|
| **FMPI**（猫肌肉骨骼疼痛指数，NC State） | 17 个活动条目（0–4 分） | **主人填写** | 17 条 ICC 0.814；Cronbach's α 0.903。2024 ISFM/AAFP 标为 `Validated` |
| **MI-CAT(C)**（蒙特利尔猫关节炎测试·照护者版） | subscale 1 共 18 项、subscale 2 共 20 项，是/否 | **主人/照护者填写** | 2024 ISFM/AAFP 标为 `Moderately validated` |
| **Feline Grimace Scale（FGS）** | **5 个面部动作单元**，每个 0/1/2 | **受训观察者**；已在主人中单独验证 | 阈值 **> 0.39 / 1.0**：敏感度 **90.7%**、特异度 **86.6%**，**AUC 0.94（95% CI 0.89–0.98）** |
| **UNESP-Botucatu MCPS**（长表） | 10 项 / 3 个子量表，总分 0–30 | 术后/急性疼痛 | 救援镇痛阈值 **> 7**：敏感度 96.5%、特异度 99.5% |
| **UFEPS-SF**（短版） | **4 项**，总分 0–12 | 术后/急性疼痛 | 阈值 **≥ 4/12**，不确定区 3–4，AUC 0.99 |

**FGS 的 5 个动作单元（原文定义）**

1. **耳位**：「tips of ears **pulled apart and rotated outwards**」
2. **眼周收紧**：「height between eyelids **smaller than 50% of eyes width**」
3. **口鼻紧张**：「flattening and stretching of the muzzle **from round to an elliptical shape**」
4. **胡须位置**：「movement of whiskers **forward**… as if standing on end (**spiked**)」
5. **头位**：「head **below the shoulder line** or tilted down」

- 来源：Evangelista MC, et al. *Sci Rep* 2019;9:19128，DOI [10.1038/s41598-019-55693-8](https://doi.org/10.1038/s41598-019-55693-8) — `moderate`（单一研究谱系）
- **验证人群**：35 只自然发生**急性**疼痛的客户所有猫 + 20 只健康对照。
  **全部效力证据都是急性疼痛** → **不得用于慢性疼痛**。
- **照料者可用性**：Monteiro BP, et al. *JFMS* 2023;25(1):1098612X221145499（**仅摘要**）：
  n=3039 回答、1262 完成、66 国；照料者与兽医总体「无显著差异」，仅口鼻紧张例外（P = 0.035）；
  照料者单人 ICC 分别为耳 0.65、眼 0.69、口鼻 0.58、**胡须 0.37**、**头位 0.38**。
- **AU 权重存在分歧（`disputed`）**：Steagall PV, et al. *Vet J* 2025;314:106448（**仅摘要**）：
  量表呈单维度；**口鼻紧张是唯一敏感度低于 70% 的 AU，胡须变化是唯一特异度低于 70% 的 AU**；
  **评分者性别影响评分**（P = 0.02）。
- **FGS 阈值表述冲突（`disputed`）**：原始文献 **> 0.39（0–1 制）**；2022 ISFM 表 **≥ 0.4/1.0**；
  iCatCare 面向主人的表述是「总分 out of 10，干预分 **≥ 4**」。
  **引用时统一用 0–1 制 + > 0.39。**

### 3.2 合并去重后的可观察征象清单

> 来源键：**FG**=Feline Grimace Scale；**U**=UFEPS-SF；**U10**=UFEPS 长表；**I**=2022 ISFM 急性疼痛指南；
> **N**=2024 ISFM/AAFP NSAID 指南；**A**=AAHA 2022；**iC**=International Cat Care。

| 可观察征象 | 含此征象的量表 | 等级 |
|---|---|---|
| 躲藏、退缩、躲在异常位置 | I、N、iC、A | `strong` |
| 减少社交互动、回避主人或其他动物 | N、iC、I、A、MI-CAT(C) | `strong` |
| 活动量下降、更多时间静卧 | I、N、iC、A | `strong` |
| 停止玩耍 | iC、I、N、A | `strong` |
| 不愿/犹豫跳跃、爬高、上下楼梯 | iC、N、A、FMPI | `strong` |
| 步态僵硬 | iC、N、I、MI-CAT(C) | `strong` |
| 停止理毛 → 被毛蓬乱、油腻、打结 | N、iC、A、I | `strong` |
| 过度理毛、专注某一部位 | **仅 N、A** | `moderate` |
| 指甲过长 | **仅 iC** | `moderate` |
| 食欲下降、偏好软食 | N、iC、I、A、U10（**U 已删除该项**） | `strong` |
| 单侧咀嚼、掉食、流涎、抓嘴 | iC、N、I、A | `strong` |
| 乱尿乱拉、避用砂盆 | iC、N、A、FMPI、MI-CAT(C)（**急性量表均无**） | `strong` |
| 排尿疼痛表现 | **仅 N** | `moderate` |
| 弓背蜷缩、头低垂、侧卧 | U、I、FG、N | `strong` |
| 腹壁/侧腹紧绷、后肢屈伸 | U、I | `moderate`（同一研究谱系） |
| 烦躁、频繁变换姿势 | U、I | `moderate` |
| 对环境淡漠、面朝墙角 | U、I | `moderate` |
| 精神沉郁、表情呆滞 | I、iC、N | `strong` |
| 触碰痛处有反应、抗拒被抱 | U、I、N、A | `strong` |
| 被接近或被摸时哈气、抓咬 | iC、I、A、N | `strong` |
| 过度舔咬伤口 | I、U、N | `strong` |
| 不愿移动 | I、N、MI-CAT(C) | `strong` |
| 耳位外展/压平 | FG、I | `moderate` |
| 眯眼、眼睑收紧 | FG、I、U | `moderate` |
| 口鼻紧绷、变扁 | FG、I | `moderate` |
| 胡须僵直前指 | FG、I | `moderate` |
| 头位下倾 | FG、N | `moderate` |
| 用力甩尾 | **仅 U/U10** | `moderate` |
| 皮肤抽动、追尾、逃窜 | **仅 N** | `moderate` |
| 睡眠时间增多、睡眠节律改变 | I、A、iC | `moderate` |
| 体重下降 | N、A、iC | `strong` |
| 口臭 | N、A | `moderate` |
| 肌肉萎缩 | **仅 N** | `moderate` |
| 抗拒触碰头部与口腔 | **仅 N** | `moderate` |
| 甩头 | **仅 I** | `moderate` |
| 抓挠、瘙痒（耳病/皮肤病） | N | `moderate` |
| 抓挠标记行为减少 | **仅 iC** | `moderate` |
| 狩猎与外出探索减少 | **仅 iC** | `moderate` |

### 3.3 量表之间的**明确分歧**（必须写出，不要合并）

1. **发声 —— `disputed`。** Glasgow CMPS-Feline 与 2022 ISFM 指南把发声算作征象；
   但 **UFEPS-SF 明确删除了发声项**，**FGS 完全没有发声项**；
   AAHA 与 iCatCare 反而强调「猫更少表现出明显疼痛，例如发声」。
   → **本项目只把发声当作「有声/无声」事件计数，绝不作独立疼痛征象，也绝不作语义翻译**
   （与 `AGENTS.md` §3.2 一致）。
2. **食欲 —— 量表级分歧。** UFEPS 长表含食欲，**短表删除**（理由：禁食/住院状态下难以评估）
   → **居家可靠、诊室不可靠**。
3. **乱尿乱拉 —— 只在主人侧。** 存在于 iC、N、A 与主人量表，**在任何急性临床量表中都不存在**。
4. **甩尾** 只有 UFEPS 系列记录。
5. **过度理毛、皮肤抽动、追尾、排尿疼痛、抗拒口腔触碰** 只有 2024 ISFM/AAFP 表 2 收录。
6. **面部动作单元属单一研究谱系** → 只给 `moderate`，不给 `strong`。

---

## 4. 项圈相对基线可能看到的偏离（含证据与假阳性）

> **方法学前提**：全部只做「相对这只猫自己基线」的偏离检测，**不做绝对阈值判断**。
> 这一选择有实证支撑：诊室应激会系统性抬高生理读数，**诊所读数不能当基线**。

### 4.1 活动量与静息/睡眠时间

- **证据**：Yamazaki A, et al. *PLoS ONE* 2020;15(7):e0236795（**n = 61**）：
  「The amount of physical activity and the number of jumps **significantly decreased** with the age of
  the cat. In contrast, the **resting and sleeping times significantly increased**」— `moderate`
- ⚠️ **利益冲突必须披露**：设备由 **JARMeC** 借出，两名作者为其雇员，
  JARMeC「is applying for a patent (Status: Pending, Patent No. **JP2017-514095**)」。
- ⚠️ 具体效应量（相关系数、回归斜率、各年龄组均值）**未在摘要中给出 → `unverified`**。
- ⚠️ **该研究没有疾病组**：疾病导致的活动下降是**推断**，不是该文证明的。
- **假阳性**：正常衰老（同文）；项圈旋转、松紧与残余移位；多猫家庭、访客、季节天气、玩耍、发情。

### 4.2 跳跃次数与跳跃高度

- **人群数据（务必分开归属）**：
  - **Lascelles BDX, et al. *Vet Surg* 2010;39(5):535-544**（n = 100 只随机猫）：
    **92% 有影像学 DJD**，**91% 至少一处附肢 DJD**，55% 至少一处中轴 DJD — `moderate`
  - **Slingerland LI, et al. *Vet J* 2011;187(3):304-309**（n = 100 只 ≥6 岁猫）：
    **61% 至少一个关节有 OA、48% 多关节**；主人感知的活动与理毛减少与 OA 相关（P = 0.008）、
    不当排泄增加（P = 0.046）— `moderate`
  - **「跳跃能力下降 71% / 跳跃高度降低 67%」** 来自 **Clarke SP, Bennett D. *J Small Anim Pract*
    2006;47(8):439-445**，「Alterations in both the ability to jump (**71 per cent**) and the height
    (**67 per cent**) of jump… were the most frequent signs of disease.」
    ⚠️ **n = 28 只临床患病猫、无对照、非人群样本** → 是**该队列内主人观察到的频率**，**不是患病率**。
  - **「82% 的 >14 岁猫有 OA」：`unverified` / `weak`，本项目禁止使用。**
- **项圈可测性**：加速度计可测**跳跃次数**；PLOS ONE 2020 的**跳跃高度用的是气压传感器**。
  **没有任何研究把项圈推得的「跳跃高度」与居家视频金标准做过验证** → 只能作为**相对基线的代理量**。
- **假阳性**：肥胖、笼养/空间受限、主人作息改变、被其他猫占据高点、年龄。

### 4.3 静息时间 / 睡眠增多

- **可核实的数字只有年龄效应**（Yamazaki 2020）。**未检索到任何「疾病导致猫睡眠时间增加」的量化研究**
  → 作为疾病信号为 `unverified`。
- 项圈侧的行为分类上限：Smit 2023（*Sensors* 23(16):7165）：**项圈模型持续差于胸背带模型**
  （项圈 RF 准确率 0.70 vs 胸背带 0.72–0.86）— `moderate`

### 4.4 躲藏

- **临床描述支持**（iCatCare：hiding 是猫对疼痛的典型反应），但**没有任何量化「病猫 vs 健康猫躲藏时长」
  的同行评审研究**，也**没有项圈检测躲藏的验证** → `unverified`
- **物理限制**：加速度计只能看到「低活动」，**无法区分躲藏与安静休息**——要区分必须有室内定位或摄像头。

### 4.5 理毛：减少与过度

- **减少**：与 OA 相关（Slingerland 2011：P = 0.008，但受年龄混杂）— `moderate`
- **过度**：只在 2024 ISFM/AAFP 表中出现（神经病理性疼痛）→ `moderate`
- **项圈能否区分理毛？** Smit 2023 有 grooming 类别，但其结果**把抓挠系统性误分类为理毛，必须合并**；
  逐行为 precision 0.25–1.00、sensitivity 0.02–1.00 → 理毛类主张为 `weak`

### 4.6 夜间发声

- 关联级描述：甲亢、认知功能障碍综合征、疼痛、高血压、耳聋、饥饿。
- **未找到任何一手研究量化过「夜间发声 ↔ 某诊断」** → `weak`，**禁止给百分比**。
- **项圈限制**：麦克风无法区分猫叫、呼噜、其他猫、电视、主人声音；本项目政策本就禁止语义解读。

### 4.8 猫砂盆使用模式

- **一手、同行评审、开放获取**：Langenfeld-McCoy N, et al. *Animals* 2026;16(9):1319，
  DOI [10.3390/ani16091319](https://doi.org/10.3390/ani16091319)：
  **加权 F1 92.7%（交叉验证训练）/ 89.9%（验证）**；CKD 的画像为
  「**increased urination frequency, longer elimination durations, and reduced post-elimination
  covering behavior**」。
- ⚠️ **利益冲突必须披露**：多作者为**雀巢普瑞纳研究中心**雇员，设备为 **Purina Petivity**；
  回顾性设计、无预注册。
- **其他疾病与猫砂盆监测的关联：未取得验证研究** → `unverified`。
- **假阳性**：多猫家庭（需个体识别）、猫砂种类与清洁度、饮食改变、应激/领地冲突、
  **盆外标记（设备完全看不到）**。

### 4.9 呼吸频率

- **最强的白大衣效应量化**：Dijkstra E, Teske E, Szatmári V. *Vet J* 2018;234:96-101（**仅摘要**）：
  - 诊室、88 只健康猫：**区间 28–176 次/分，中位 64；计算出的参考区间 32–135**
  - **家中静息（视频，n=32）：中位 27，区间 16–60**
  - **家中午睡（视频，n=38）：中位 20，区间 9–28**
  - 作者结论：教科书参考区间反映的是**家中静息**频率，用在诊室不合适，
    会把大量猫误判为呼吸急促。`strong`（数字来自摘要）/ `moderate`（临床外推）
- **教科书区间**：MSD「Resting Respiratory Rates」猫 **16–40 次/分**
  （改编自 Reece WO, *Dukes' Physiology of Domestic Animals*, 12th ed.）— `strong`
- **项圈式呼吸频率验证研究：未找到任何一篇** → `unverified`

### 4.10 心率 / HRV

- **MSD 静息表：猫 120–140 bpm**（改编自 Dukes' 12th ed.）— `strong`
- **MSD 分诊表：猫正常 150–220 bpm**；心动过缓 **<150**、心动过速 **>220** — `strong`（就「表里这么写」而言）
- **教学医院实测**：Griffin FC, et al. *JFMS* 2021;23(4):364-369：
  文中「An HR of **120–150 bpm** was considered to be within the normal range for a
  **non-stressed** cat」；21 只健康猫实测：门诊入口 **176 ± 35**、检查室 **195**、处置区 **226** bpm — `moderate`
- **结论（重要）**：所谓「120–140 vs 140–220 冲突」**不是数值冲突，而是语境冲突**：
  静止/睡眠 vs 诊室检查。
  - **140–220 这个版本未能在任何实际读到的一手来源中核实** → `unverified`，**不要使用**。
  - MSD 分诊表的 **150–220** 已核实。
  - → 项目应展示为区间 **并标注测量条件**，**绝不合并成单一数字**。
- **HRV**：**未找到任何猫用项圈 HRV 验证研究或参考值** → `unverified`

### 4.13 机器学习在猫可穿戴数据上的实际能力上限

- **已验证的行为分类**：Smit 2023：项圈 RF **Kappa 0.642 / 准确率 0.70**；
  **必须合并行为**（抓挠→理毛、小跑→行走；攀爬/跳跃/摩擦/挖掘/抖身/互相理毛因样本量小被移除）。
  人群是**健康群体笼养**，不是居家宠物 — `moderate`
- **已验证的早期 DJD 检测**：Montout AX, et al. *Vet J* 2025;311:106352（**仅摘要**）：
  56 只装配、**51 只进入分析**（24 健康 / 27 主人报告活动变化），项圈加速度计 14 天；
  **AUC 0.78（CI 0.65–0.88）、敏感度 68%（0.64–0.77）@ 75% 特异度（0.68–0.79）**。
  作者自述「there is **no universal objective assessment method** for DJD-associated pain in cats」；
  标签是**主人报告 + 骨科检查**，即**代理标签而非金标准**；**22% 装配猫被排除** — `moderate`
- **这是「项圈能不能看出病」的现实上限，应写进漂移引擎的预期性能与诚实边界。**
- **厂商/消费级主张**（厂商新闻稿）**不构成验证** — `weak`

### 4.14 已记录的假阳性 / 假阴性来源清单

| # | 来源 | 说明 |
|---|---|---|
| 1 | Smit 2023 | **项圈旋转、松紧、残余移位**；项圈模型差于胸背带模型 |
| 2 | Smit 2023 | **佩戴位置敏感性**；部分行为在观察期内从未出现 |
| 3 | Smit 2023 | **低频行为被合并或删除**；逐行为 precision 0.25–1.00、sensitivity 0.02–1.00 |
| 4 | Dijkstra 2018、Griffin 2021 | **应激 / 白大衣效应**：呼吸频率诊室中位 64 vs 家中静息 27 vs 午睡 20；心率 176/195/226 |
| 5 | Yamazaki 2020 | **正常衰老**：健康猫的活动与跳跃随年龄下降、静息与睡眠上升——**直接与任何"活动下降"提示冲突** |
| 6 | 2022 ISFM 指南 | **「僵住」可由恐惧产生**，与疼痛不可区分 |
| 7 | 多处 | **设备/算法所有权偏倚**：Yamazaki 2020（JARMeC）、Petivity CKD 研究（普瑞纳作者） |
| 8 | Langenfeld-McCoy 2026 | **砂盆数据缺失**：盆外排泄、多猫识别、砂种与清洁度改变 |
| 9 | 多处 | **缺少金标准**：无猫用项圈 RR 验证、无验证过的猫 HRV 穿戴 |

---

## 5. 项圈**看不到**什么，以及物理原因

| 看不到的信号 | 物理/传感原因 | 需要的设备类别 |
|---|---|---|
| **排尿量、排尿次数** | 发生在猫砂盆，**远离颈部** | 带传感器的猫砂盆 |
| **饮水量** | 发生在水碗，远离颈部 | 微芯片识别饮水机 |
| **进食量** | 发生在食盆，远离颈部；项圈无计量能力 | 计量食盆 / 微芯片喂食器 |
| **体重与体况评分** | 项圈**无法承载体重**；这是力学问题 | 秤；体况评分需人工触诊 |
| **躲藏时长** | 加速度计只看到「低活动」，**无法区分躲藏与安静休息** | 室内定位 / 摄像头 |
| **口腔疼痛**（单侧咀嚼、掉食、流涎、抓嘴） | 需要**口腔检查**；项圈最多看到「进食相关活动改变」或甩头 | 口腔检查（兽医） |
| **面部疼痛表情**（FGS 的 5 个动作单元） | 耳、眼周、口鼻、胡须、头位**都在头部** | 摄像头 / 主人目视 |
| **触觉感受** | 触觉器官在**面部触须与爪垫**，传感器在颈部 —— **位置错配** | 无（物理上不可解） |
| **心率 / HRV**（作为可依赖读数） | **无任何猫用项圈验证研究**；且诊室应激使读数翻倍以上 | 心电（兽医）/ 未验证的接触式 PPG |
| **呼吸频率**（作为可依赖读数） | **无任何猫用项圈验证研究**；最强的量化来自**人做视频观察** | 视频观察（现有最佳） |
| **体温（核心）** | 皮肤/耳温与**直肠温不可换算**：61 只猫中耳廓红外中位 **35.7 °C** vs 直肠 **38.3 °C**，**无相关性**（Kendall tau −0.01），平均偏差 **−2.7 ± 1.44 °C**，「**cannot be recommended**」（Barton JC, et al. *JAVMA* 2022;260(7):752-757）。另有研究认为耳温可替代（Sousa MG, et al. *JFMS* 2013;15(4):275-279）→ **`disputed`** | 直肠温度计 |
| **血液指标** | 需要采血与实验室 | 兽医检验 |
| **叫声语义** | 无转译依据；且**连疼痛量表本身都不把发声当可靠征象** | 无（项目政策禁止） |

---

## 6. 急诊红旗清单（每条带来源）

| # | 红旗 | 来源措辞（原文） | 来源 | 等级 |
|---|---|---|---|---|
| 1 | **呼吸费力 / 张口呼吸 / 哮喘发作** | 「this is an **emergency** – your cat must be seen by a vet **urgently**」；「Asthma attacks can be **life-threatening**」 | [iCatCare, Asthma](https://icatcare.org/articles/asthma-and-chronic-bronchitis-in-cats) | `strong` |
| 2 | **张口呼吸的机制性红旗** | 「Open-mouth breathing and a **bluish tinge** to the gums or skin indicate **severe oxygen loss**.」；呼吸窘迫姿态「Cats might **crouch or sit in an upright position**.」 | [MSD 急症评估](https://www.msdvetmanual.com/special-pet-topics/emergencies/evaluation-and-initial-treatment-of-dog-and-cat-emergencies) | `strong` |
| 3 | **公猫排尿困难 / 尿闭** | 「Urethral obstruction **must be treated as an emergency**」；「**fatal within 2-3 days**. It is also **incredibly painful**」 | [iCatCare, Urethral obstruction](https://icatcare.org/articles/urethral-obstruction-in-cats) | `strong` |
| 4 | **尿闭的病理时间线** | 「Complete UO causes uremia within **36–48 hours**… death within approximately **72 hours**」 | [MSD, Urethral Obstruction](https://www.merckvetmanual.com/urinary-system/urolithiasis-in-small-animals/urethral-obstruction-in-small-animals) | `moderate` |
| 5 | **猫自发性膀胱炎（FIC）堵塞** | 「should be treated as an **emergency**… **immediately**」 | [iCatCare, FIC](https://icatcare.org/articles/feline-idiopathic-cystitis-fic-in-cats) | `strong` |
| 6 | **反复呕吐** | 「vomiting that occurs **more often than once or twice daily**… requires a detailed examination」 | [MSD, Vomiting in Cats](https://www.msdvetmanual.com/cat-owners/digestive-disorders-of-cats/vomiting-in-cats) | `moderate` |
| 7 | **食欲下降 ≥3 天** | 「this should be done **urgently if your cat has had a reduced appetite for three days or more**」 | [iCatCare, Inappetence](https://icatcare.org/articles/inappetence-in-cats) | `moderate` |
| 8 | **综合急诊清单（可直接整段引用）** | 「trauma, shock, poisoning, severe burns, **breathing difficulty**, ongoing **seizures**, abnormal heart rhythms, **loss of consciousness**, **severe bleeding**, **blocked urine flow**, prolapsed organs…, possible snakebite, heat stroke…」 | [MSD 急症评估](https://www.msdvetmanual.com/special-pet-topics/emergencies/evaluation-and-initial-treatment-of-dog-and-cat-emergencies) | `strong` |
| 9 | **外伤（坠落/车祸）** | 「Has been involved in any **trauma**, such as a fall or being hit by a car, that may have caused a **broken bone or internal injuries**」 | [Univ. of Illinois VTH](https://vetmed.illinois.edu/pet-health-columns/animal-emergency-room/) | `strong` |
| 10 | **中毒** | 「Contact your veterinary team for advice **immediately**」 | [iCatCare, Cats and poisons](https://icatcare.org/articles/cats-and-poisons/) | `strong` |
| 11 | **百合（对猫致命）** | 「**Less than one leaf eaten**, or a small amount of pollen licked off the coat by a cat is enough to cause **kidney failure**… it can prove **fatal**」 | 同上 | `strong` |
| 12 | **犬用除蚤药（permethrin）用于猫** | 「**Dog flea products should never be used on cats**… **contact your veterinary team immediately**」 | 同上 | `strong` |
| 13 | **癫痫持续状态** | 「treatment is essential to **prevent death**… as well as **permanent brain damage**」 | [MSD, Anticonvulsants](https://www.msdvetmanual.com/pharmacology/systemic-pharmacotherapeutics-of-the-nervous-system/anticonvulsants-for-emergency-treatment-of-seizures-in-dogs-and-cats) | `moderate` |
| 14 | **头抵墙 / 肝性脑病分级** | 3 级含「**head pressing**」；4 级「**risk for impending death**」 | [MSD, Hepatic Encephalopathy](https://www.msdvetmanual.com/digestive-system/hepatic-diseases-of-small-animals/hepatic-encephalopathy-in-small-animals) | `moderate` |
| 15 | **胃肠道梗阻** | 「is an **emergency condition**」 | [MSD, GI Obstruction](https://www.msdvetmanual.com/digestive-system/surgical-problems-of-the-gastrointestinal-tract-in-small-animals/gastrointestinal-obstruction-in-small-animals) | `moderate` |

⚠️ **未取得任何一手来源、不得写成红旗的两项**：「腹胀/腹部剧痛」与「无法站立」。

---

## 7. 必须标 `unverified` / `disputed`、禁止给数字的清单

### 7.1 禁止使用（`unverified`）

| 主张 | 状态与原因 |
|---|---|
| 「82% 的 >14 岁猫有 OA」 | 一手摘要无此数字，只见于二手转引 → **禁用** |
| 「140–220 bpm 是猫心率范围」 | 未在任何实际读到的一手来源中核实 → **禁用** |
| 「猫的夜间发声 = 甲亢 / CDS / 疼痛」的任何百分比 | 只有临床教学级关联，**无量化研究** → **禁用数字** |
| 「9/10 猫主人不知道 CKD」 | 仅见于未能打开的学位论文 → **禁用** |
| 「81% 猫体重下降但仅 52% 主人察觉」 | 非 PubMed 收录、PDF 无法打开 → **禁用**；替代：24% 主人低估体况（Blanchard 2023，`moderate`） |
| 「>24 小时不进食需就医」（猫） | 未取得一手来源；可引用的是「**≥3 天**」 |
| 「prayer position 特指胰腺炎/腹膜炎/膈疝/胃内异物」 | 只有「腹部不适」有一手支持 → 另三种**禁用** |
| 「head pressing 与血液黏滞度过高相关」 | 未找到一手来源 → **禁用** |
| 猫用项圈**呼吸频率**的任何参考值 | **无任何验证研究** → **禁用数字** |
| 猫用穿戴 **HRV** 的任何参考值 | **无任何验证研究** → **禁用** |
| 饮水量（ml/kg/day）与饮水机类设备的验证 | 来源付费墙或厂商材料 → **禁用数字** |
| CSU 猫急性疼痛量表的条目与评分 | 所有获取渠道失败 → **禁用条目清单** |
| 「主人未识别率 = X%」的**单一**标题式百分比 | Herrera 2026（漏报高）vs Klinck 2012 / Maniaki 2023（主人观察有效）→ **必须按疾病分述** |
| RECOVER 红/橙/黄/绿分诊色码 | Ruys 2012 的 Wiley 页 403，未读到内容 → **不引用任何色码** |
| PLOS ONE 2026 的「误读为应激」比例 | **该文从未测量**，只有推测句 → **禁用** |
| 把 PLOS ONE 2026 的任何数字用来说明**猫** | 该文为**犬**研究，作者未主张可外推 → **禁用** |

### 7.2 必须展示为区间（`disputed`）

| 参数 | 冲突双方 | 处理 |
|---|---|---|
| **心率** | MSD 静息表 **120–140** vs MSD 分诊表 **150–220**（教学医院实测 176/195/226） | **不是数值冲突而是语境冲突**：静止/睡眠 vs 诊室检查。展示为区间 + 明确标注测量条件 |
| **呼吸频率** | 教科书 16–40 vs 诊室中位 64（28–176）vs 家中静息中位 27（16–60）vs 午睡中位 20（9–28） | 展示为区间 + 测量条件；**统计基线一律用居家静息/午睡** |
| **体温** | 直肠 38.1–39.2 °C vs 耳廓红外中位 35.7 °C（无相关） | 展示为区间 + **测量部位**说明；**项圈皮肤温不得换算为直肠温** |
| **FGS 阈值表述** | 原始 > 0.39（0–1 制）vs ISFM 表 ≥ 0.4/1.0 vs iCatCare「out of 10，≥4」 | 统一用 **0–1 制 + > 0.39** |
| **FGS 动作单元权重** | 2025 研究：口鼻紧张敏感度最低、胡须特异度最低；评分者性别影响评分 | 展示为区间；不得声称 5 个 AU 等权 |
| **跳跃相关百分比（71% / 67%）** | n=28 的临床队列 vs 一般人群 | 必须写明是**队列内观察频率**，不得当患病率 |
| **是否能把「长时间不动」归因** | 可能是疼痛，也可能是恐惧（2022 ISFM 原文） | **不给数值、不给区间**；必须写「无法区分」，并列入假阳性清单 |

---

## 8. 措辞建议：UI 可说什么、不可说什么

| ❌ 不可说 | ✅ 可说 |
|---|---|
| 「你的猫可能有关节炎」 | 「过去 7 天，跳跃事件数比该猫 30 天基线低 X%」 |
| 「它在疼痛」 | 「检测到 3 次『长时间静止』区间（>Y 分钟），基线为 0 次」 |
| 「它感到焦虑」 | 「离家时段内躲藏位置事件占比从 A% 变为 B%」 |
| 「它在叫你，意思是……」 | 「22:00–06:00 检测到 N 次发声事件，基线中位为 M 次」（**不做任何语义解读**） |
| 「心率 180，说明它不舒服」 | 「静息心率相对该猫自身基线上升 X」（**并注明：单次心率不能指示疼痛**） |
| 「项圈可以筛查肾病」 | 不输出（**未验证**）。若必须提及，措辞为「下列指标项圈**测不到**，需要固定式传感器」 |
| 「本应用帮你读懂宠物」 | 「本应用汇总你不在家时发生的**事件与比值**，并提示相对**这只宠物自己基线**的变化；**不构成诊断**」 |

**必须常驻的边界句（每条提示附近）**：

> 关联不等于诊断。文献记录的是「这些可观察变化与某些状况**同时出现**」。
> 本页只描述**相对这只猫自身基线**的变化，不判断原因、不判断感受。任何持续异常，请带记录咨询兽医。

---

## 9. 参考文献

> 标注 **[全文]** = 读到全文；**[摘要]** = 仅读到摘要（付费墙）；**[记录]** = 仅核实到书目记录。

### 9.1 主人识别与漏报

1. Gardeweg SMA, Picard DE, van Herwijnen IR. The abilities in dog pain sign recognition… **PLoS One** 2026;21(4):e0344512. DOI [10.1371/journal.pone.0344512](https://doi.org/10.1371/journal.pone.0344512) · PMID 41920795 · [PMC13042741](https://pmc.ncbi.nlm.nih.gov/articles/PMC13042741/) — **[全文]** · **犬研究**
2. Ray M, et al. 2021 AAFP Feline Senior Care Guidelines. **J Feline Med Surg** 2021;23(7):613-638. DOI [10.1177/1098612X211021538](https://doi.org/10.1177/1098612X211021538) · PMID 34167339 · [PMC10812122](https://pmc.ncbi.nlm.nih.gov/articles/PMC10812122/) — **[全文]**
3. Herrera K, et al. Clinically important abnormalities are common in senior cats perceived to be healthy by owners. **JAVMA** 2026. DOI [10.2460/javma.26.04.0326](https://doi.org/10.2460/javma.26.04.0326) · PMID 42526494 · [PMC13472236](https://pmc.ncbi.nlm.nih.gov/articles/PMC13472236/) — **[全文]**
4. Mortier F, et al. Value of repeated health screening in 259 apparently healthy mature adult and senior cats followed for 2 years. **J Vet Intern Med** 2024;38(4):2089-2098. DOI [10.1111/jvim.17138](https://doi.org/10.1111/jvim.17138) · PMID 38967102 — **[摘要]**
5. Enomoto M, Lascelles BDX, Gruen ME. Development of a checklist for the detection of degenerative joint disease-associated pain in cats. **JFMS** 2020;22(12):1137-1147. DOI [10.1177/1098612X20907424](https://doi.org/10.1177/1098612X20907424) · PMID 32122226 — **[摘要]**
6. Maniaki E, Murrell J, Langley-Hobbs SJ, Blackwell EJ. Do owner-reported changes in mobility reflect measures of activity, pain and degenerative joint disease in cats? **JFMS** 2023;25(6). DOI [10.1177/1098612X231178765](https://doi.org/10.1177/1098612X231178765) · PMID 37382593 — **[摘要]**
7. Klinck MP, Frank D, Guillot M, Troncy E. Owner-perceived signs and veterinary diagnosis in 50 cases of feline osteoarthritis. **Can Vet J** 2012;53(11):1181-1186. PMID 23633711 · [PMC3474573](https://pmc.ncbi.nlm.nih.gov/articles/PMC3474573/) — **[摘要]**
8. Blanchard T, et al. The Perception of the Body Condition of Cats and Dogs by French Pet Owners. **Animals** 2023;13(23):3646. DOI [10.3390/ani13233646](https://doi.org/10.3390/ani13233646) · PMID 38066997 — **[摘要]**

### 9.2 疼痛评估量表与指南

9. Evangelista MC, et al. Facial expressions of pain in cats: the development and validation of a Feline Grimace Scale. **Sci Rep** 2019;9:19128. DOI [10.1038/s41598-019-55693-8](https://doi.org/10.1038/s41598-019-55693-8) · PMID 31836868 · [PMC6911058](https://pmc.ncbi.nlm.nih.gov/articles/PMC6911058/) — **[全文]**
10. Monteiro BP, Lee NH, Steagall PV. Can cat caregivers reliably assess acute pain in cats using the Feline Grimace Scale? **JFMS** 2023;25(1). DOI [10.1177/1098612X221145499](https://doi.org/10.1177/1098612X221145499) · PMID 36649089 — **[摘要]**
11. Steagall PV, et al. Understanding the Feline Grimace Scale. **Vet J** 2025;314:106448. DOI [10.1016/j.tvjl.2025.106448](https://doi.org/10.1016/j.tvjl.2025.106448) · PMID 40998152 — **[摘要]**
12. Brondani JT, et al. Validation of the English version of the UNESP-Botucatu MCPS. **BMC Vet Res** 2013;9:143. DOI [10.1186/1746-6148-9-143](https://doi.org/10.1186/1746-6148-9-143) — **[全文]**
13. Luna SPL, et al. Multilingual validation of the short form of the Unesp-Botucatu Feline Pain Scale (UFEPS-SF). **PeerJ** 2022;10:e13134. DOI [10.7717/peerj.13134](https://doi.org/10.7717/peerj.13134) · PMID 35345592 · [PMC8957279](https://pmc.ncbi.nlm.nih.gov/articles/PMC8957279/) — **[全文]**
14. Steagall PV, et al. 2022 ISFM Consensus Guidelines on the Management of Acute Pain in Cats. **JFMS** 2022;24(1):4-30. DOI [10.1177/1098612X211066268](https://doi.org/10.1177/1098612X211066268) · PMID 34937455 · [PMC10845386](https://pmc.ncbi.nlm.nih.gov/articles/PMC10845386/) — **[全文]**
15. Taylor S, et al. 2024 ISFM and AAFP consensus guidelines on the long-term use of NSAIDs in cats. **JFMS** 2024;26(4). DOI [10.1177/1098612X241241951](https://doi.org/10.1177/1098612X241241951) · PMID 38587872 · [PMC11103309](https://pmc.ncbi.nlm.nih.gov/articles/PMC11103309/) — **[全文]**
16. Gruen ME, et al. 2022 AAHA Pain Management Guidelines for Dogs and Cats. **J Am Anim Hosp Assoc** 2022;58(2):55-76. DOI [10.5326/jaaha-ms-7292](https://doi.org/10.5326/jaaha-ms-7292) · PMID 35195712 — **[执行摘要]**
17. Benito J, et al. Reliability and discriminatory testing of a client-based metrology instrument, FMPI. **Vet J** 2013;196(3):368-373. DOI [10.1016/j.tvjl.2012.12.015](https://doi.org/10.1016/j.tvjl.2012.12.015) — **[记录]**
18. Enomoto M, Lascelles BDX, Robertson JB, Gruen ME. Refinement of the FMPI and development of the short-form FMPI. **JFMS** 2022;24(2):142-151. DOI [10.1177/1098612X211011984](https://doi.org/10.1177/1098612X211011984) — **[全文（Table 8 后截断）]**
19. Gruen ME, et al. Criterion Validation Testing of Clinical Metrology Instruments… **PLoS One** 2015;10(7):e0131839. DOI [10.1371/journal.pone.0131839](https://doi.org/10.1371/journal.pone.0131839) — **[全文]**
20. NC State University, Translational Research in Pain — Clinical Metrology Instruments. [cvm.ncsu.edu](https://cvm.ncsu.edu/translational-research-in-pain/clinical-metrology-instruments/)。原文：「This is **not a diagnostic tool**, rather a tool to **screen** for the possibility of DJD-pain being present.」

### 9.3 骨关节炎 / DJD 与跳跃

21. Lascelles BDX, et al. Cross-sectional study of the prevalence of radiographic degenerative joint disease in domesticated cats. **Vet Surg** 2010;39(5):535-544. DOI [10.1111/j.1532-950X.2010.00708.x](https://doi.org/10.1111/j.1532-950X.2010.00708.x) · PMID 20561321 — **[摘要]**
22. Slingerland LI, Hazewinkel HAW, Meij BP, Picavet P, Voorhout G. Cross-sectional study of the prevalence and clinical features of osteoarthritis in 100 cats. **Vet J** 2011;187(3):304-309. DOI [10.1016/j.tvjl.2009.12.014](https://doi.org/10.1016/j.tvjl.2009.12.014) · PMID 20083417 — **[摘要]**
23. Clarke SP, Bennett D. Feline osteoarthritis: a prospective study of 28 cases. **J Small Anim Pract** 2006;47(8):439-445. DOI [10.1111/j.1748-5827.2006.00143.x](https://doi.org/10.1111/j.1748-5827.2006.00143.x) · PMID 16911111 — **[摘要]**
24. Bennett D, Zainal Ariffin SM, Johnston P. Osteoarthritis in the cat: 1. how common is it and how easy to recognise? **JFMS** 2012;14(1):65-75. DOI [10.1177/1098612X11432828](https://doi.org/10.1177/1098612X11432828) — **[摘要]**

### 9.4 传感器、可穿戴与生理参考区间

25. Yamazaki A, Edamura K, Tanegashima K, et al. Utility of a novel activity monitor assessing physical activities and sleep quality in cats. **PLoS One** 2020;15(7):e0236795. DOI [10.1371/journal.pone.0236795](https://doi.org/10.1371/journal.pone.0236795) · PMID 32735625 · [PMC7394395](https://pmc.ncbi.nlm.nih.gov/articles/PMC7394395/) — **[摘要 + 利益冲突声明]**
26. Smit M, et al. The Use of Triaxial Accelerometers and Machine Learning Algorithms for Behavioural Identification in Domestic Cats. **Sensors** 2023;23(16):7165. DOI [10.3390/s23167165](https://doi.org/10.3390/s23167165) · PMID 37631701 · [PMC10458840](https://pmc.ncbi.nlm.nih.gov/articles/PMC10458840/) — **[全文]**
27. Montout AX, et al. Accelerometer-derived classifiers for early detection of degenerative joint disease in cats. **Vet J** 2025;311:106352. DOI [10.1016/j.tvjl.2025.106352](https://doi.org/10.1016/j.tvjl.2025.106352) · PMID 40204089 — **[摘要]**
28. Langenfeld-McCoy N, et al. Enhancing Detection of Feline Chronic Kidney Disease Through Smart Litter Box Monitoring. **Animals** 2026;16(9):1319. DOI [10.3390/ani16091319](https://doi.org/10.3390/ani16091319) · [PMC13162653](https://pmc.ncbi.nlm.nih.gov/articles/PMC13162653/) — **[摘要]**。⚠️ 多作者为雀巢普瑞纳研究中心雇员
29. Dijkstra E, Teske E, Szatmári V. Respiratory rate of clinically healthy cats measured in veterinary consultation rooms. **Vet J** 2018;234:96-101. DOI [10.1016/j.tvjl.2018.02.014](https://doi.org/10.1016/j.tvjl.2018.02.014) · PMID 29680402 — **[摘要]**
30. Griffin FC, et al. Heart rate assessment in healthy cats in a veterinary teaching hospital. **JFMS** 2021;23(4):364-369. DOI [10.1177/1098612X20959046](https://doi.org/10.1177/1098612X20959046) · [PMC10812216](https://pmc.ncbi.nlm.nih.gov/articles/PMC10812216/) — **[全文]**
31. Barton JC, et al. Evaluation of noncontact infrared thermometry compared with rectal thermometry in cats. **JAVMA** 2022;260(7):752-757. DOI [10.2460/javma.21.09.0403](https://doi.org/10.2460/javma.21.09.0403) — **[记录]**
32. Sousa MG, et al. Comparison of auricular and rectal temperature measurement in healthy cats. **JFMS** 2013;15(4):275-279. DOI [10.1177/1098612X12464873](https://doi.org/10.1177/1098612X12464873) — **[记录]**
33. MSD/Merck Veterinary Manual — Resting Heart Rates. [merckvetmanual.com](https://www.merckvetmanual.com/multimedia/table/resting-heart-rates) — **[全文]**
34. MSD/Merck Veterinary Manual — Resting Respiratory Rates. [merckvetmanual.com](https://www.merckvetmanual.com/multimedia/table/resting-respiratory-rates) — **[全文]**
35. MSD/Merck Veterinary Manual — Parameters to Evaluate During Triage. [merckvetmanual.com](https://www.merckvetmanual.com/multimedia/table/parameters-to-evaluate-during-triage) — **[全文]**

### 9.5 权威指南与面向主人的来源

36. MSD Veterinary Manual — Vomiting in Cats. [msdvetmanual.com](https://www.msdvetmanual.com/cat-owners/digestive-disorders-of-cats/vomiting-in-cats) — **[全文]**
37. MSD Veterinary Manual — Pancreatitis in Dogs and Cats. [msdvetmanual.com](https://www.msdvetmanual.com/digestive-system/the-exocrine-pancreas/pancreatitis-in-dogs-and-cats) — **[全文]**
38. MSD Veterinary Manual — Urethral Obstruction in Small Animals. [merckvetmanual.com](https://www.merckvetmanual.com/urinary-system/urolithiasis-in-small-animals/urethral-obstruction-in-small-animals) — **[全文]**
39. MSD Veterinary Manual — Hepatic Encephalopathy in Small Animals. [msdvetmanual.com](https://www.msdvetmanual.com/digestive-system/hepatic-diseases-of-small-animals/hepatic-encephalopathy-in-small-animals) — **[全文]**
40. MSD Veterinary Manual — Gastrointestinal Obstruction in Small Animals. [msdvetmanual.com](https://www.msdvetmanual.com/digestive-system/surgical-problems-of-the-gastrointestinal-tract-in-small-animals/gastrointestinal-obstruction-in-small-animals) — **[全文]**
41. MSD Veterinary Manual — Arterial Thromboembolism in Dogs and Cats. [msdvetmanual.com](https://www.msdvetmanual.com/circulatory-system/various-cardiovascular-diseases-in-dogs-and-cats/arterial-thromboembolism-in-dogs-and-cats) — **[全文]**
42. MSD Veterinary Manual — Evaluation and Initial Treatment of Dog and Cat Emergencies. [msdvetmanual.com](https://www.msdvetmanual.com/special-pet-topics/emergencies/evaluation-and-initial-treatment-of-dog-and-cat-emergencies) — **[全文]**
43. MSD Veterinary Manual — Anticonvulsants for Emergency Treatment of Seizures. [msdvetmanual.com](https://www.msdvetmanual.com/pharmacology/systemic-pharmacotherapeutics-of-the-nervous-system/anticonvulsants-for-emergency-treatment-of-seizures-in-dogs-and-cats) — **[全文]**
44. International Cat Care — How to spot signs of pain in cats. [icatcare.org](https://icatcare.org/news/how-to-spot-signs-of-pain-in-cats-pain-awareness-month-2026) — **[全文]**
45. International Cat Care — Cats Deserve Pain Relief Too（立场声明）. [icatcare.org](https://icatcare.org/position-statements/cats-deserve-pain-relief-too) — **[全文]**
46. International Cat Care — Urethral obstruction in cats. [icatcare.org](https://icatcare.org/articles/urethral-obstruction-in-cats) — **[全文]**
47. International Cat Care — Asthma and chronic bronchitis in cats. [icatcare.org](https://icatcare.org/articles/asthma-and-chronic-bronchitis-in-cats) — **[全文]**
48. International Cat Care — Diarrhoea in cats. [icatcare.org](https://icatcare.org/articles/diarrhoea-in-cats) — **[全文]**
49. International Cat Care — Inappetence in cats. [icatcare.org](https://icatcare.org/articles/inappetence-in-cats) — **[全文]**
50. International Cat Care — Hyperthyroidism in cats. [icatcare.org](https://icatcare.org/articles/hyperthyroidism-in-cats) — **[全文]**
51. International Cat Care — Feline idiopathic cystitis (FIC) in cats. [icatcare.org](https://icatcare.org/articles/feline-idiopathic-cystitis-fic-in-cats) — **[全文]**
52. International Cat Care — Cats and poisons. [icatcare.org](https://icatcare.org/articles/cats-and-poisons/) — **[全文]**
53. AAHA Trends — Feline Pain: Can You Read the Signs?（2022-08-01）. [aaha.org](https://www.aaha.org/trends-magazine/august-2022/f1-cat-signs/) — **[全文]**
54. University of Illinois Veterinary Teaching Hospital — Animal Emergency Room. [vetmed.illinois.edu](https://vetmed.illinois.edu/pet-health-columns/animal-emergency-room/) — **[全文]**

### 9.6 检索失败、未能引用其措辞的来源（记录在案，供后续补检）

| 来源 | 状态 |
|---|---|
| Cornell Feline Health Center 各健康专题正文 | 返回 200 但**只有导航**，正文由客户端渲染 |
| VCA Animal Hospitals | **HTTP 403**（Cloudflare） |
| AVMA 官方正文 | 200 但**正文为空** |
| AAFP / catvets.com / catfriendly.com | **HTTP 403** |
| TICA — What are signs of a medical emergency in cats? | **HTTP 403** |
| *Veterinary Dermatology* 2025 猫理毛论文（DOI 10.1111/vde.70109） | **403，仅见标题** |
| 各量表 PDF（FMPI、MI-CAT(C)、AAHA/WSAVA 汇编等） | 抓取层拒绝 `application/pdf`，**全部未读** |
| Ruys L, et al. *J Vet Emerg Crit Care* 2012（分诊分级） | **403，未读到内容** |

---

## 10. 对本项目的一句话总结

猫的疾病与急性痛苦**在居家条件下确实留下可观察的痕迹**（拒跳、停玩、停止理毛、躲藏、弓背、
乱尿、食欲下降、体重下降、面部表情改变），但这些痕迹**没有一项是特异的**——
**每一项都同时与正常衰老、恐惧、环境变化、发情相关**（`disputed`：2022 ISFM 原文即指出猫
「reduces movement and 'freezes' **due to fear**」）。因此本项目的立场只能是：
**只检测「相对这只猫自己基线」的可计数变化，只描述事件与比值，绝不下诊断结论**——
而这一点恰恰是有证据支撑的：主人对这些逐渐发生的变化**系统性漏报**（猫上已量化：
未受引导时 DJD 疼痛清单敏感度 55%；CKD 猫中 75.6% 的排尿变化未被报告），
而**诊所读数不能当基线**（诊室呼吸频率中位 64 vs 家中静息 27 vs 午睡 20 次/分）。
