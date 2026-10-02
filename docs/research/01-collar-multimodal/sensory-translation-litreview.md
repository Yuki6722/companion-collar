# 跨物种感官转译（犬/猫视角 VR）科学依据调研报告

> 调研方法：通过 PubMed E-utilities、OpenAlex API、Semantic Scholar API、web_search / web_fetch 实检。
> 每条结论标注**证据强度**与**来源类型**。凡未能核实原文具体数值者，一律在正文标注「未核实」并在第 7 节汇总。
> 检索截止：本报告写作时。ACM Digital Library、Cambridge Core、MDPI、ScienceDirect 在本网络环境下返回 403/429，相关条目改用 DOI/OpenAlex/PubMed 元数据交叉验证。

---

## 1. 犬猫视觉

### 1.1 色彩视觉（dichromatic vision）

- **发现：犬为二色视觉（dichromatic），视锥色素光谱峰值约 429 nm（蓝）与 555 nm（黄绿）；视网膜仅含两类视锥光色素。**
  证据强度：**强**（行为学 + 增量阈值光谱敏感度函数 + 颜色匹配三重证据一致）。
  来源：[Color vision in the dog](https://pubmed.ncbi.nlm.nih.gov/2487095/)，Neitz J, Geist T, Jacobs GH，*Visual Neuroscience* 1989;3(2):119-25，DOI [10.1017/s0952523800004430](https://doi.org/10.1017/s0952523800004430)，**同行评审论文**。
  样本量与条件：**3 只家犬**；行为辨别实验（behavioral discrimination），测定 increment-threshold spectral sensitivity functions 并做直接颜色匹配测试。

- **发现：犬的行为表现与人类红绿色盲（deuteranopia）受试者相似；该研究同时提出了一种可用于动物界的色觉评估方法。**
  证据强度：**中**（方法较新颖，样本量与环境控制需参照原文；属于后续独立验证）。
  来源：[Are dogs red-green colour blind?](https://pubmed.ncbi.nlm.nih.gov/29291080/)，Siniscalchi M, d'Ingeo S, Fornelli S, Quaranta A，*Royal Society Open Science* 2017;4(11):170869，DOI [10.1098/rsos.170869](https://doi.org/10.1098/rsos.170869)，**同行评审论文**（开放获取，PMCID PMC5717654）。
  方法：使用为人类 deuteranopia（绿色盲）诊断设计的 Ishihara 测验的改良版本。**具体犬只数量未在摘要中给出 → 未核实。**

- **争议/补充：** 犬二色视觉这一结论本身争议很小（分子、电生理、行为三类证据收敛）。但**「犬看不见红色」是通俗化误读**——犬并非看不到长波长，而是缺少 L/M 分离的第三种视锥，因此红与绿、以及某些红-橙-黄之间的区分能力弱于正常三色觉人类；亮度线索仍可使用。

- **相关方法学工具（可支撑严谨实验设计）：**
  [An adaptation of the Cambridge Colour Test for use with animals](https://pubmed.ncbi.nlm.nih.gov/16962014/)，Mancuso K, Neitz M, Neitz J，*Visual Neuroscience* 2006;23(3-4):695-701，DOI [10.1017/S0952523806233364](https://doi.org/10.1017/S0952523806233364)，**同行评审论文**。
  该文验证对象为**松鼠猴（squirrel monkeys）**，**并非犬猫**；其价值在方法论（可用计算机显示器、不需逐刺激配亮度）。证据强度：**中（对犬猫为外推）**。

### 1.2 闪烁融合频率（critical flicker fusion frequency, CFF）

- **发现：犬的 CFF 显著高于早期 ERG（视网膜电图）研究所提示的水平；犬的杆体（rods）支持的闪烁辨别率远高于人类杆体；心理物理杆-锥转换点（rod-cone break）出现在比人类高得多的亮度水平，接近猫的水平。作者称这是**首个证明犬拥有发育良好、功能完善的视锥系统的心理物理学证据**。**
  证据强度：**中偏强**（唯一直接的行为学 CFF 测定，但样本极小且年代较早）。
  来源：[Behavioral determination of critical flicker fusion in dogs](https://pubmed.ncbi.nlm.nih.gov/2813532/)，Coile DC, Pollitz CH, Smith JC，*Physiology & Behavior* 1989;45(6):1087-92，DOI [10.1016/0031-9384(89)90092-9](https://doi.org/10.1016/0031-9384(89)90092-9)，**同行评审论文**。
  样本量与条件：**4 只 beagle 犬**；心理物理方法为 **conditioned suppression（条件抑制）**；测定 **steady-state CFF**；结论对比对象为既有 ERG CFF 数据。

  ⚠️ **关键限制：该论文摘要与 OpenAlex/PubMed 元数据中均未给出具体 Hz 数值。** 我未取得全文，因此**无法在此报告犬 CFF 的具体 Hz 数字**。任何声称「犬 CFF = XX Hz」并引用该文的说法，需回原文核对（见第 7 节）。

- **发现（猫）：猫存在成对的行为学与电生理时间调制敏感度（temporal modulation sensitivity）研究，可作为猫 CFF 的一手依据。**
  证据强度：**中**（方法学扎实，但具体 CFF 数值未核实）。
  来源：
  - [Temporal modulation sensitivity of the cat — I: Behavioral measures](https://doi.org/10.1016/0042-6989(75)90302-8)，Loop MS, Berkley MA，*Vision Research* 1975;15(5):555-561，**同行评审论文**。
  - [Temporal modulation sensitivity of the cat — II: Evoked potential estimates](https://doi.org/10.1016/0042-6989(75)90303-x)，Berkley MA, Loop MS, Evinger C，*Vision Research* 1975;15(5):563-568，**同行评审论文**。
  - [Temporal modulation sensitivity of the cat — I: Behavioral measures（ScienceDirect 记录）](https://www.sciencedirect.com/science/article/abs/pii/0042698975903028)
  ⚠️ 两文均未取得全文，**猫 CFF 的具体 Hz 数值未核实**。作者单位为 Florida State University。

- **待核验的一手线索（猫 ERG CFF 与视网膜组织学发育的关系）：**
  [Electro-retinographic critical fusion frequency of the retina in relation to the histological development in man and animals](https://pubmed.ncbi.nlm.nih.gov/14218249/)，Horsten GP, Winkelman JE，*Documenta Ophthalmologica* 1964;18:515-21，DOI [10.1007/BF00160603](https://doi.org/10.1007/BF00160603)，**同行评审论文（早期）**。
  证据强度：**弱**（年代久远、ERG 而非行为学、摘要不可得）。

- **重要方法学警告：** Coile 1989 的核心论点正是 **ERG 测得的 CFF 会低估行为学 CFF**。因此任何以 ERG 数据为依据的「犬猫刷新率需求」论述都应被标记为方法学不足。

### 1.3 暗光视觉、视野、空间分辨率、运动敏感性

- **未能完成充分检索。** 我确认了以下方向存在相关研究，但**未取得可点击的一手来源**：
  - 犬视野范围（常被引用的「约 240°–250°」及与品种头型/吻长相关）
  - 犬、猫的空间分辨率（cycles per degree）与近视程度
  - 猫暗光视觉（tapetal reflection / rod:cone 比例）
  - 运动刺激敏感性（除上节 temporal modulation sensitivity 外）
  上述各项均列入**第 7 节「无法验证」**。**请勿使用我未提供来源的数字。**

- **一项可用的旁证（犬视觉与听觉的生态关联）：**
  [Localization of noise, use of binaural cues, and a description of the superior olivary complex in the smallest carnivore, the least weasel (Mustela nivalis)](https://pubmed.ncbi.nlm.nih.gov/3675848/)，Heffner RS, Heffner HE，*Behavioral Neuroscience* 1987;101(5):701-8，DOI [10.1037//0735-7044.101.5.701](https://doi.org/10.1037//0735-7044.101.5.701)，**同行评审论文**。
  该文明确指出「**猫与犬具有相对良好的声源定位敏锐度**」，并讨论食肉目整体受压于精确定位的选择压力。证据强度：**中**（作为猫犬听觉定位的间接支持）。

---

## 2. 听觉

### 2.1 频率范围与超声感知

- **发现：犬的行为学听力图（audiogram）已有专门研究，且听力上限与体型相关（「large and small dogs」），并检测了鼓膜（tympanic membrane）大小作为解释变量。**
  证据强度：**强**（行为学测听，作者为该领域权威实验室，被引 126 次）。
  来源：[Hearing in large and small dogs: Absolute thresholds and size of the tympanic membrane](https://doi.org/10.1037/0735-7044.97.2.310)，Heffner HE，*Behavioral Neuroscience* 1983;97(2):310-318，**同行评审论文**（University of Kansas, Laboratory of Comparative Hearing）。
  ⚠️ **摘要不可得，因此「大口径犬上限约 45 kHz / 下限约 67 Hz」等我记忆中常见的具体数字在本次调研中未被验证 → 未核实，见第 7 节。**

- **发现（猫）：《家猫的听力范围》（Hearing range of the domestic cat）为一手行为学测听研究，被引 181 次。**
  证据强度：**强**（但具体边界数值本次未核实）。
  来源：[Hearing range of the domestic cat](https://doi.org/10.1016/0378-5955(85)90100-5)，Heffner RS, Heffner HE，*Hearing Research* 1985;19(1):85-88，**同行评审论文**（University of Kansas）。
  ⚠️ **摘要不可得 → 「猫上限约 64 kHz」这一常被引用的数字本次未验证。**

- **发现：犬的行为学听力图另有独立测定。**
  来源：[The dog audiogram](https://doi.org/10.1121/1.2018819)，Coultas MA, Defran RH, Dixon ML, Berry SS，*Journal of the Acoustical Society of America* 1981;70(S1):S31，**同行评审论文（会议摘要形式，仅 1 页）**。证据强度：**弱**（摘要篇幅，细节不足）。
  另有早期会议记录：[Hearing in large and small dogs (Canis familiaris)](https://doi.org/10.1121/1.2003586)，Heffner H，*JASA* 1976;60(S1):S88，**同行评审会议摘要**，证据强度：**弱**。

- **发现（超声感知的综述性说明）：** Acoustical Society of America 的 *Acoustics Today* 刊有关于猫及其他陆生哺乳动物超声听力的专题文章。
  来源：[Ultrasonic Hearing in Cats and Other Terrestrial Mammals](https://acousticstoday.org/wp-content/uploads/2021/03/Ultrasonic-Hearing-in-Cats-and-Other-Terrestrial-Mammals-M.-Charlotte-Kruger.pdf)，M. Charlotte Kruger，*Acoustics Today*（ASA），未注明确切年份（文件名标注 2021 年上传），**科普/行业媒体（由专业学会出版，作者为研究人员）**。
  证据强度：**中**（用于梳理超声听力机制与物种比较框架，非原始数据来源）。

### 2.2 噪声应激（noise-induced fear and anxiety）

- **发现：犬的噪声诱发恐惧与焦虑是可被营养干预调节的独立测量对象，说明存在可量化的噪声应激表型。**
  证据强度：**中**（单一干预试验，需注意资助方可能与饲料厂商相关）。
  来源：[Assessment of noise-induced fear and anxiety in dogs: Modification by a novel fish hydrolysate supplemented diet](https://www.sciencedirect.com/science/article/abs/pii/S1558787815000829)，*Journal of Veterinary Behavior*（Elsevier），约 2015，**同行评审论文**。
  ⚠️ 作者名单与具体样本量本次未取全文 → **部分未核实**。

- **发现：噪声恐惧犬（noise phobic dogs）在受控测试中，压力背心（pressure vest）对行为、唾液皮质醇、尿液催产素的影响已被实验检验。**这是把「环境/装备干预 → 生理应激指标」因果链做实的一个范例。
  证据强度：**中**（受控测试，但样本量与效应量需查原文）。
  来源：[The effect of a pressure vest on the behaviour, salivary cortisol and urine oxytocin of noise phobic dogs in a controlled test](https://www.sciencedirect.com/science/article/abs/pii/S0168159116302660)，*Applied Animal Behaviour Science*（Elsevier），2016，**同行评审论文**；赫尔辛基大学研究门户记录：[链接](https://researchportal.helsinki.fi/sv/publications/the-effect-of-a-pressure-vest-on-the-behaviour-salivary-cortisol-/)。
  ⚠️ 具体样本量未核实。

> **对产品构想的直接含义：** 噪声应激有一条**可测量的生理证据链**（行为 + 唾液皮质醇 + 尿液催产素）。这是产品若要宣称「提升宠物舒适度」时最可能站得住的证据类型；而单纯的主观视觉代入不具备这种可测量性。

---

## 3. 嗅觉

- **发现：犬与大鼠的嗅觉受体（olfactory receptor, OR）基因库已被系统比较，犬具有大规模 OR 基因家族，且相当比例在基因组中为假基因（pseudogenes）。**
  证据强度：**强**（基因组学一手研究，*Genome Biology*）。
  来源：[The dog and rat olfactory receptor repertoires](https://doi.org/10.1186/gb-2005-6-10-r83)（*Genome Biology* 2005;6(10):R83），**同行评审论文**（开放获取，Europe PMC 全文记录：[PMC1257466](http://staging.europepmc.org/backend/articlerender.fcgi?accid=PMC1257466)）。
  ⚠️ **精确的「功能性 OR 基因数」（常被引用的犬约 800–1100 个区间）本次未从原文摘要确认 → 未核实。**

- **发现：嗅觉球（olfactory bulb）、嗅束（olfactory tract）与嗅纹（olfactory stria）在人类、犬与山羊之间存在比较形态计量学差异。**
  证据强度：**中**（形态计量学，结构-功能推断需谨慎）。
  来源：[Comparative Morphometry of the Olfactory Bulb, Tract and Stria in the Human, Dog and Goat](https://scielo.conicyt.cl/scielo.php?script=sci_arttext&pid=S0717-95022011000300047&lng=en&nrm=iso&tlng=en)，*International Journal of Morphology* 2011;29(3)，**同行评审论文**。
  ⚠️ 具体比例数字未核实。

- **常见误传需警惕（本次调研未能找到可靠来源支持，见第 7 节）：**
  - 「犬嗅球占脑体积比例为人类的 40 倍」
  - 「犬嗅觉灵敏度为人类的 10 万倍」
  这两个数字在科普媒体中广泛流传，但我在本次检索中**未找到同行评审的一手来源**。**不建议在报告中引用。**

- **气味在环境评估中的作用：** 我未找到直接以「气味在犬猫环境福利评估中的作用」为题的同行评审研究。相关但不等价的工作见 QBA 部分（QBA 以视觉行为观察为主，不由嗅觉通道驱动）→ 列入第 7 节。

---

## 4. 动物主观体验与认识论问题

### 4.1 umwelt / 感觉生态学（sensory ecology）

- **发现：Nagel 的「What Is It Like to Be a Bat?」是「跨物种主观体验不可直接通达」这一论证的经典源头。**
  证据强度：**强（作为哲学论证的奠基文本）**。
  来源：Thomas Nagel, "What Is It Like to Be a Bat?", *The Philosophical Review*, 1974。**同行评审论文（哲学）**。
  ⚠️ 我在本次检索中只取到二手索引（[MPG 纯文献记录](https://pure.mpg.de/rest/items/item_3614950_7/component/file_3627339/content?download=true)、[Mendeley 记录](https://www.mendeley.com/catalogue/b9539d23-1e47-3a84-b6b1-bfecad9404db/)），**未取得 DOI 与 JSTOR 稳定链接 → 部分未核实**。

- **发现：Jakob von Uexküll 的 umwelt 概念（1934 年 *Streifzüge durch die Umwelten von Tieren und Menschen*，英译 *A Foray into the Worlds of Animals and Men*, 2010）是该领域的理论起点。**
  ⚠️ **本次检索未能取得该书的可靠来源链接 → 未能验证，见第 7 节。** 对现代 sensory ecology 教科书（Dusenbery 1992；Stevens 2013）同样**未取得来源**。

- **可用的间接支持（QBA 理论前提即感官生态学式主张）：** QBA 的核心假设是「行为的动态表达性质（expressive qualities）是可观察、可形式化分析的，并推定反映动物对其环境的体验」。
  来源：[Literature review of the use of Qualitative Behaviour Assessment with a fixed list of terms](https://pmc.ncbi.nlm.nih.gov/articles/PMC12827162/)，Czycholl I, Skovlund CR, Forkman B，*Frontiers in Veterinary Science* 2026;12:1588346，DOI [10.3389/fvets.2025.1588346](https://doi.org/10.3389/fvets.2025.1588346)，**综述（文献综述，非系统综述——作者自述）**。
  证据强度：**强（作为对该假设的权威表述来源）**。

### 4.2 能否从动物知觉推断「舒适」感受

- **发现：动物情绪的「意识体验」无法被直接测量，只能通过神经、行为与生理指标间接推断。这是当前动物情绪研究公认的方法论边界。**
  证据强度：**强**（该表述出自高被引综述的摘要，被引量高）。
  来源：[An integrative and functional framework for the study of animal emotion and mood](https://pubmed.ncbi.nlm.nih.gov/20685706/)，Mendl M, Burman OHP, Paul ES，*Proceedings of the Royal Society B* 2010;277(1696):2895-2904，DOI [10.1098/rspb.2010.0303](https://doi.org/10.1098/rspb.2010.0303)，**综述/理论框架论文（同行评审）**（PMCID PMC2982018）。该文有同期评论：*Proc Biol Sci* 2010;277(1696):2905-7, DOI [10.1098/rspb.2010.1017](https://doi.org/10.1098/rspb.2010.1017)。

- **发现：valence–arousal（效价-唤醒）维度框架可用于组织离散情绪状态，并为动物情绪与心境（mood）提供可检验假设。**
  证据强度：**强**（同一文献；此为动物情绪研究的主流整合框架）。
  来源：同上 Mendl, Burman & Paul 2010。
  ⚠️ Russell 1980 与 Barrett & Russell 1998 的原始 core affect 文献**本次未取得来源 → 未核实**。

- **发现：认知偏差（cognitive bias）范式被提出作为动物情绪状态的间接测量路径。**
  证据强度：**中**（理论提出，需查后续实证验证）。
  来源：Paul ES, Harding EJ, Mendl M, "Measuring emotional processes in animals: the utility of a cognitive approach", *Neuroscience & Biobehavioral Reviews*（约 2005）。⚠️ **本次仅通过 PubMed 作者检索页间接定位（[Paul ES 检索结果](https://pubmed.ncbi.nlm.nih.gov/?term=Paul+ES&cauthor_id=20685706)），未取得该文自身 DOI/URL → 部分未核实。**

- **人类中心主义风险的方法论讨论：** 本次未取得 de Waal「anthropodenial」原文与 Burghardt「critical anthropomorphism」原文的可点击来源 → **列入第 7 节**。

### 4.3 Qualitative Behaviour Assessment (QBA)

- **发现：QBA 于 2000 年首次进入文献，其动机是「传统基于行为谱（ethogram-based）的定量观察方法可能无法捕捉动物如何执行行为（demeanour）」。原始方法为 Free-Choice-Profiling（FCP）：多位观察者各自生成描述词，再以 Visual Analogue Scale (VAS) 评分，用 Generalised Procrustes Analysis (GPA) 求共识模式。**
  证据强度：**强**。
  来源：[Literature review of the use of Qualitative Behaviour Assessment with a fixed list of terms](https://pmc.ncbi.nlm.nih.gov/articles/PMC12827162/)，Czycholl I, Skovlund CR, Forkman B，*Frontiers in Veterinary Science*（2026-01-09 上线，卷 12，文章号 1588346），**综述（作者自述「不是全面综述」）**。
  原始出处（本次未取全文）：Wemelsfelder F, Hunter EA, Mendl MT, Lawrence AB, "Assessing the 'whole animal': a free choice profiling approach", *Animal Behaviour*（2000/2001）；爱丁堡大学研究门户记录：[链接](https://www.research.ed.ac.uk/en/publications/assessing-the-whole-animal-a-free-choice-profiling-approach/fingerprints/?sortBy=alphabetically)。**同行评审论文（原始方法论文）→ 未取全文，具体样本量未核实。**

- **发现（重要，直接关系到本产品构想）：QBA 已被扩展到犬猫。在 193 篇纳入的 fixed-list (FL) QBA 研究中，8.2% 用于犬（7.2%）与猫（1.0%）。**
  证据强度：**强（针对文献分布这一事实）**。
  来源：同上 Czycholl et al. 综述。
  样本量/方法：**WoS 检索 2023-10 至 2024-02；193 篇符合纳入标准的同行评审文章，发表年份 2011–2023**；三名作者分工提取数据，事先用 14 篇随机文献做独立提取一致性检验，**一致率 100%**。

- **发现（方法学批评，争议点）：FL QBA 的方法学路径**高度不统一**——术语生成方式、观察方法（个体 vs 群体观察、观察时长）、观察者训练水平与观察者间信度（inter-observer reliability）、统计分析方法均存在巨大差异；报告完整度也差异极大。**
  证据强度：**强**（该结论即为该综述的核心发现之一）。
  来源：同上。
  **对产品含义：** 「犬猫 QBA」虽存在，但**尚未标准化**；把某个特定 QBA 词表当作「宠物舒适度的客观指标」在方法学上站不住。

- **发现（本综述的自我限制）：** 作者明确说明该综述**不评估**所纳入的 QBA 研究「是否成功使用了 QBA」，因此该文不能用于论证 QBA 效度（validity）已确立。
  证据强度：**强**（作者自陈局限）。

- **相关但有边界问题的条目：** [Validation of qualitative behaviour assessment for dairy cows at pasture](https://www.eurcaw-ruminants-equines.eu/new-publication-validation-of-qualitative-behaviour-assessment-for-dairy-cows-at-pasture/)（EU Ruminant/Equine 网络通告），**科普/机构通告（二级来源）**，证据强度**弱**；且对象为奶牛，非犬猫。
  另有 QBA 相关研究专题汇总页：[Frontiers Research Topic 66021 PDF](https://public-pages-files-2025.frontiersin.org/research-topics/66021/pdf)，**出版方汇编**，证据强度**弱**。

---

## 5. 跨物种感官转译的既有尝试

### 5.1 犬类视觉模拟器 / dog vision filter

- **发现：市面上确实存在以「动物视觉」为名的图像滤镜/App。**
  证据强度：**弱（仅证明产品存在，不证明其科学准确性）**。
  来源：[Animal Vision : OpenCV Filters（Google Play）](https://play.google.com/store/apps/details?id=app.bhupesh.armorking.animalvision&hl=en-US)，开发者 Bhupesh，**商业应用商店页面**。

- **发现：有媒体（西班牙语 *El Espectador*）专门讨论 TikTok「犬类视觉滤镜」的准确性问题。**
  证据强度：**弱（科普媒体，但恰好指向准确性争议这一关键问题）**。
  来源：[¿Qué tan preciso es el filtro de TikTok que muestra cómo ven los perros?](https://www.elespectador.com/ciencia/que-tan-precisa-es-el-filtro-de-tiktok-que-muestra-como-ven-los-perros/)，*El Espectador*（哥伦比亚），年份未确认，**科普媒体**。

- **可用的科学依据边界（这是本节最重要的可验证结论）：** 视觉滤镜唯一有强证据支撑的部分是**二色视觉的光谱敏感度**（第 1.1 节 Neitz 1989：视锥峰值 429 nm 与 555 nm）。**滤镜无法转译的部分至少包括：**
  - 犬的**时间分辨率**（CFF，第 1.2 节；视频帧率是滤镜能力的硬上限）
  - 犬的**视野范围与空间分辨率**（第 1.3 节，未核实）
  - **嗅觉与听觉通道**（第 2、3 节）——这恰是犬类环境评估的主导通道
  因此「用滤镜让人看到狗眼中的世界」在**通道覆盖上从原理上就不完整**。
  证据强度：**强（此论证基于上述各节的一手文献）**。

- **未能找到：** 针对 dog vision filter 的**同行评审准确性评估或误差量化研究**。→ 列入第 7 节。

### 5.2 sensory substitution

- **发现：Bach-y-Rita 的触觉视觉替代（tactile vision substitution, TVSS）是该领域的奠基性工作，已有历史回顾性文献。**
  证据强度：**中**（奠基性但年代较早；我仅取到 PubMed 记录，未取全文）。
  来源：[Tactile vision substitution: past and future](https://pubmed.ncbi.nlm.nih.gov/6874260/?dopt=Abstract)，*PubMed*（PMID 6874260），**同行评审论文（综述）**，年份约 1983。⚠️ 作者与期刊名本次未从页面确认。

- **发现：sensory substitution 已有博士学位论文级别的系统性梳理（含对各子领域前人工作的回顾）。**
  证据强度：**中（学位论文，非同行评审，但覆盖面广）**。
  来源：[Thèse Kevin Arth, 2018（HAL tel-03022859）](https://theses.hal.science/tel-03022859/file/these_arth_kevin_2018.pdf)，**学位论文**。

- **另有触觉通道类型学的会议/论文材料：** [HAL hal-02434266](https://hal.science/hal-02434266/file/83ea68d12b910585a2fca12c36b087259f61.pdf)，**预印本/会议论文**，证据强度**弱**（未能确认标题与作者）。

- **关键概念区分（对本产品构想至关重要）：** sensory substitution 的原始目标是**为丧失某一通道的人类受试者，用另一通道承载该通道的功能性信息**（如盲人用触觉读取视觉信息），其**成功判据是功能可用性（functional utility），不是主观体验的等同**。把它外推为「让健全人类体验犬类主观感受」是**目标置换**。证据强度：**中**（基于上述文献的目标陈述）。

### 5.3 VR / XR 用于动物福利评估或环境设计

- **发现：已有把「第一人称 VR 代入流浪动物处境」用于提升人类-动物共情的设计研究。**
  证据强度：**中**（设计研究，属会议论文；共情提升的效应量与持久性需查原文）。
  来源：[iStrayPaws: Immersing in a Stray Animal's World through First-Person VR to Bridge Human-Animal Empathy](https://dl.acm.org/doi/pdf/10.1145/3641825.3687729)，ACM（DIS/相关会议），**同行评审会议论文**。
  ⚠️ 本网络对 ACM 返回 403，**作者、年份、具体实验设计未核实**。

- **发现：已有把 AR/混合现实（smart glasses）直接用于畜禽舍内，以改善动物福利的工作。**
  证据强度：**中**（新近论文，需查全文确认干预与结果指标）。
  来源：[Smart glasses in the chicken barn: Enhancing animal welfare through mixed reality](https://www.sciencedirect.com/science/article/pii/S2772375525000206)，*Smart Agricultural Technology*（Elsevier），约 2025，**同行评审论文**。
  ⚠️ 作者与样本量未核实。

- **发现（ACI 方向，与犬直接相关）：已有研究原型化「犬在家中控制屏幕的沉浸式屏幕界面」。**
  证据强度：**中**。
  来源：[Prototyping an Immersive Screen Interfaces for Dogs' to Control Screens in Their Home](https://dl.acm.org/doi/fullHtml/10.1145/3702336.3702342)，ACM，**同行评审会议论文**；另有 [MTMT 书目记录](https://m2.mtmt.hu/api/publication/36305980) 与 [OUCI 记录](https://ouci.dntb.gov.ua/en/works/loNByaVp/)。
  ⚠️ ACM 返回 403，**作者名单、年份、方法细节未核实**。

---

## 6. Animal-Computer Interaction (ACI)

- **发现（领域奠基文献）：Clara Mancini, "Animal-computer interaction: a manifesto"，2011 年发表于 ACM 的 *interactions* 杂志。** 这是 ACI 领域的宣言性文本。
  证据强度：**强（文献存在性与作者身份已通过三个独立元数据源交叉验证）**。
  来源与验证：
  - [Semantic Scholar 记录（DOI 解析）](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1145/1978822.1978836)：标题 "Animal-computer interaction: a manifesto"，作者 C. Mancini，venue INTR，**2011 年**，DOI [10.1145/1978822.1978836](https://doi.org/10.1145/1978822.1978836)，出版方记录的引用数 202。
  - [OpenAlex 记录 W2022687548](https://api.openalex.org/works?filter=title.search:hearing%20in%20large%20and%20small%20dogs)：同一 DOI，作者 Clara Mancini（The Open University，ORCID 0000-0003-1555-077X），期刊 *Interactions*（ACM，ISSN 1072-5520），2011，**OpenAlex 引用数 319**。
  - 会议/期刊入口：[ACM DL](https://doi.org/10.1145/1978822.1978836)（本网络 403）。
  ▸ 注意：OpenAlex 记录的标题为 "Animal-computer interaction"（可能省略了副标题），Semantic Scholar 记录的完整标题含 "a manifesto"。**副标题归属建议以 DOI 页面为准。**
  来源类型：**同行评审期刊论文（ACM *interactions*，行业/专业期刊）**。

- **发现（领域首批系统综述）：Hirskyj-Douglas I, Pons P, Read JC, Jaen J, "Seven Years after the Manifesto: Literature Review and Research Directions for Technologies in Animal Computer Interaction"，2018 年发表于 *Multimodal Technologies and Interaction*（MDPI），开放获取，被引 68 次（OpenAlex）。**
  证据强度：**强（作为该领域研究方向的权威梳理）**。
  来源：[OpenAlex 记录 W2806004443](https://api.openalex.org/works?filter=title.search:animal-computer%20interaction%20manifesto)；DOI [10.3390/mti2020030](https://doi.org/10.3390/mti2020030)；PDF：[MDPI PDF](https://www.mdpi.com/2414-4088/2/2/30/pdf?version=1527820480)。
  作者单位：Ilyena Hirskyj-Douglas（Aalto University，ORCID 0000-0001-6950-0570）、Patricia Pons（Universitat Politècnica de València）、Janet C. Read（University of Central Lancashire）、Javier Jaen（UPV）。
  来源类型：**同行评审综述论文**。
  ⚠️ MDPI 站点在本网络返回 403，**综述的具体主张与设计原则清单未取全文** → 列入第 7 节「部分未核实」。

- **未能验证的 ACI 条目（详见第 7 节）：**
  - Mancini 2013 CHI Extended Abstracts 论文（"ACI: changing perspective on HCI, participation and sustainability"）
  - Mancini 2017 "Towards an animal-centred ethics for Animal-Computer Interaction"
  - Melody Jackson / Georgia Tech FIDO 项目
  - Anna Zamansky / Tech4Animals
  - Dirk van der Linden、Steve North（GoSlow / orangutan）、Sarah Webber、Fiona French、Michelle Westerlaken
  - ACI 是否有独立期刊或学会（需核实期刊存在性与现状）

**已核实的 ACI 学者（由元数据确认）：** Clara Mancini（The Open University）、Ilyena Hirskyj-Douglas（Aalto University）、Patricia Pons（UPV）、Janet C. Read（UCLan）、Javier Jaen（UPV）。

---

## 7. 无法验证 / 存在矛盾的点

### 7.1 明确「找不到可靠来源」或「无法验证」

**A. 视觉具体数值**
1. **犬的 CFF 具体 Hz 数值未核实。** Coile et al. 1989 摘要与元数据未给出数值；我未取得全文（[PubMed 记录](https://pubmed.ncbi.nlm.nih.gov/2813532/)）。
2. **猫的 CFF 具体 Hz 数值未核实。** Loop & Berkley 1975 两篇论文均只取得元数据（[I](https://doi.org/10.1016/0042-6989(75)90302-8)、[II](https://doi.org/10.1016/0042-6989(75)90303-x)）。
3. **人类 CFF 的对照数值未取得一手来源。** 因此本报告**不做「犬/猫 XX Hz vs 人类 YY Hz」的具体对比**。
4. **犬视野范围**（常见引用 240°–250°）、**犬猫空间分辨率/近视**、**猫暗光视觉定量指标**、**运动敏感性（除 temporal modulation sensitivity 外）——全部未取得可点击来源。**
5. **犬视觉滤镜的同行评审准确性评估/误差量化研究——未找到。**

**B. 听觉具体数值**
6. **犬听力上下限具体 Hz 值未核实。** Heffner 1983（[DOI](https://doi.org/10.1037/0735-7044.97.2.310)）与 Coultas et al. 1981（[DOI](https://doi.org/10.1121/2018819)）均未取得摘要/全文。
7. **猫听力上限（常引 64 kHz）未核实。** Heffner & Heffner 1985（[DOI](https://doi.org/10.1016/0378-5955(85)90100-5)）未取得摘要/全文。
8. **噪声应激研究的具体样本量未核实**（[S1558787815000829](https://www.sciencedirect.com/science/article/abs/pii/S1558787815000829)、[S0168159116302660](https://www.sciencedirect.com/science/article/abs/pii/S0168159116302660)），因 Elsevier 页面仅返回题录信息。

**C. 嗅觉**
9. **犬功能性 OR 基因的确切数目未核实**（[Genome Biology 2005](https://doi.org/10.1186/gb-2005-6-10-r83) 摘要未取得）。
10. **嗅球体积的种间比例数字未核实**（[Int J Morphology 2011](https://scielo.conicyt.cl/scielo.php?script=sci_arttext&pid=S0717-95022011000300047&lng=en&nrm=iso&tlng=en) 未取全文）。
11. **广传的「犬嗅球为人类 40 倍」「犬嗅觉为人类 10 万倍」——本次检索未找到同行评审一手来源，不建议引用。**
12. **「气味在犬猫环境福利评估中的作用」——未找到以该问题为核心的同行评审研究。**

**D. 认识论 / 理论文献**
13. **Uexküll 的 umwelt 原始著作（1934/2010）——未取得可靠来源链接。**
14. **Nagel 1974 的 DOI / JSTOR 稳定链接——未取得**（仅有二手索引）。
15. **Modern sensory ecology 教科书（Dusenbery 1992；Stevens 2013）——未取得来源。**
16. **de Waal "anthropodenial"（1999）原文、Burghardt "critical anthropomorphism"（1991）原文——未取得来源。**
17. **Paul, Harding & Mendl（约 2005）认知偏差论文的自身 DOI/URL——未取得**（仅通过 PubMed 作者页间接定位）。
18. **Russell 1980、Barrett & Russell 1998 的 core affect 原文——未取得来源。**
19. **Wemelsfelder et al. 2000/2001 原始 QBA 论文样本量未核实**（仅有爱丁堡大学研究门户的指纹页，无全文）。

**E. 跨物种转译 / ACI**
20. **sensory substitution 奠基文献（PMID 6874260）的作者与期刊名未确认**；[HAL hal-02434266](https://hal.science/hal-02434266/file/83ea68d12b910585a2fca12c36b087259f61.pdf) 的标题与作者亦未确认。
21. **iStrayPaws 论文的作者、年份、实验设计未核实**（ACM 403）。
22. **"Prototyping an Immersive Screen Interfaces for Dogs'" 的作者与年份未核实**（ACM 403）。
23. **Smart glasses in the chicken barn 的作者与样本量未核实**。
24. **Mancini 2013 / 2017 论文、Melody Jackson / FIDO、Zamansky / Tech4Animals、van der Linden、North、Webber、French、Westerlaken——全部未验证。**
25. **ACI 是否存在独立期刊或学会——未验证。**
26. **Hirskyj-Douglas et al. 2018 综述的具体设计原则清单未取全文**（MDPI 403）。

### 7.2 存在争议或相互矛盾的结论

1. **CFF 测量方法之争（真实的方法学矛盾）：** Coile et al. 1989 明确指出其**行为学 CFF 高于既有 ERG 研究**所提示的水平，并据此主张犬拥有功能完善的视锥系统。**任何基于 ERG 数据的「犬类刷新率」论述都是方法学上过时或不充分的。** 证据强度：**强**（该矛盾即为该文核心论点）。
2. **QBA 的方法学不统一（真实的效度争议）：** FL QBA 在术语生成、观察方法、观察者训练、观察者间信度、统计分析上差异巨大；且 Czycholl et al. 2026 明确**不评估**这些研究是否「成功」。因此**不能把 QBA 当作已确立的宠物舒适度金标准**。证据强度：**强**。
3. **二色视觉的通俗化误读（概念混淆而非学术矛盾）：** 学术结论（犬二色视觉：视锥峰值 429/555 nm）稳定，但「犬看不见红色」是误读。证据强度：**强**（基于 [Neitz 1989](https://pubmed.ncbi.nlm.nih.gov/2813532/) 的机制表述）。
4. **"dog vision filter" 的准确性：** 唯一找到的直接讨论是科普媒体（[El Espectador](https://www.elespectador.com/ciencia/que-tan-precisa-es-el-filtro-de-tiktok-que-muestra-como-ven-los-perros/)），**无同行评审评估**。因此该类产品**既未被证实、也未被证伪**——这正是本产品构想最需要补的空白。
5. **犬嗅觉能力的大众数字（40 倍 / 10 万倍）：** 广泛流传但本次**未找到一手来源**，与第 3 节可核实的基因组学/形态计量学证据之间存在**数量级表述上的落差**。

---

## 8. 对产品构想的简要科学含义（基于上述可验证证据）

1. **唯一有强证据支持的可转译通道是色彩光谱敏感度**（犬：429/555 nm 二色视觉）。即使如此，也**只覆盖颜色维度**，不覆盖时间分辨率、视野、空间分辨率。
2. **通道覆盖从原理上不完整：** 犬的环境评估高度依赖嗅觉与听觉。VR 视觉代入**无法承载这两个通道**——而第 2.2 节显示噪声应激恰好有可测量的生理证据链。**若产品的目标是「判断环境对宠物是否舒适」，把资源投入声学与气味环境评估，比投入视觉代入更可能产生可验证的福利收益。**
3. **「感受宠物是否舒适」这一主张触及第 4.2 节的方法论边界：** 动物情绪的意识体验**不可直接测量**，只能间接推断（Mendl et al. 2010）。VR 视角代入改变的是**人类观察者的体验**，不改变**动物的状态**；两者之间没有已建立的推断通路。
4. **若要测量「舒适」，现有可用工具是 QBA 与 valence–arousal 指标，但 QBA 尚未标准化**（第 4.3 节），且对犬猫的 QBA 研究仅占文献的 8.2%。
5. **ACI 提供了该产品最合适的学术定位**：Mancini 2011 的宣言与 Hirskyj-Douglas et al. 2018 的综述是该领域公认的入口文献。
