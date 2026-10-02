const refs = [
 ['Ellis et al. · 2013','AAFP and ISFM Feline Environmental Needs Guidelines','猫环境指南','全文已核验','安全场所、资源配置、嗅觉环境与可预测互动。仅适用于猫，不可直接推广犬。','https://journals.sagepub.com/doi/full/10.1177/1098612X13477537'],
 ['AAHA · 2015','Canine and Feline Behavior Management Guidelines','猫犬联合指南','全文已核验','支持避免强迫暴露于不可逃避的刺激；不是本原型的效果试验。','https://www.aaha.org/wp-content/uploads/globalassets/02-guidelines/behavior-management/behaviormgmt_booklet.pdf'],
 ['Englund & Cronin · 2023','Choice, control, and animal welfare','综述 / 理论框架','全文已核验','区分选择与控制；直接证据仍有限，跨物种推广须谨慎。','https://www.frontiersin.org/journals/veterinary-science/articles/10.3389/fvets.2023.1250251/full'],
 ['Grigg et al. · 2021','Stress-Related Behaviors in Companion Dogs Exposed to Common Household Noises','原始观察研究','全文已核验','386 位犬主人问卷及 62 个视频/合集；未实测视频声音频率、声压，存在选择偏差。','https://www.frontiersin.org/journals/veterinary-science/articles/10.3389/fvets.2021.760845/full'],
 ['Duranton & Horowitz · 2019','Let me sniff! Nosework induces positive judgment bias in pet dogs','原始干预研究','摘要 / 片段','两周鼻部搜索活动与判断偏向任务；不能据此证明一次虚拟嗅闻改善福利。','https://doi.org/10.1016/j.applanim.2018.12.009'],
 ['Lind et al. · 2017','High visual acuity revealed in dogs','原始行为实验','全文已核验','小样本犬的视敏度有显著个体差异；不能据此生成精确品种滤镜。','https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0188557'],
 ['Clark & Clark · 2016','猫二色视觉行为研究','原始行为实验','摘要已核验','仅两只训练猫；支持二色视觉，但作者讨论历史文献中的争议。','https://pubmed.ncbi.nlm.nih.gov/27720709/'],
 ['Neitz et al. · 1989 / Kasparson et al. · 2013','犬色觉与颜色线索利用','原始行为研究','摘要与后续论文交叉','支持非黑白视觉；经典论文入口访问受限，未将搜索摘要当作全文。','https://pubmed.ncbi.nlm.nih.gov/2487095/','https://doi.org/10.1098/rspb.2013.1356'],
 ['Kang et al. · 2009','猫与人暗光视觉的同任务比较','原始实验','摘要及图注','优势取决于亮度和空间频率，不是所有暗部细节都更清晰。','https://pubmed.ncbi.nlm.nih.gov/19458146/'],
 ['LSU School of Veterinary Medicine','Hearing Ranges of Laboratory Animals','兽医资料 / 原始研究索引','页面已核验','频率范围依赖检测声压；不能换算为统一的声音响度倍率。','https://www.lsu.edu/vetmed/deafness/hearingrange.php'],
 ['Craven et al. · 2010','The fluid dynamics of canine olfaction','原始机制研究','全文已核验','鼻腔结构、嗅闻与气流；不说明气味的主观颜色或精确时间标签。','https://pmc.ncbi.nlm.nih.gov/articles/PMC2871809/'],
 ['Li et al. · 2005','Pseudogenization of a Sweet-Receptor Gene Accounts for Cats’ Indifference toward Sugar','原始分子研究','全文已核验','猫甜味受体机制差异，不等于没有味觉。','https://journals.plos.org/plosgenetics/article?id=10.1371/journal.pgen.0010003'],
 ['Chemical Senses · 2025','猫狗味觉受体与食物感知综述','研究综述','全文已核验','犬保留甜味感受；猫狗受体响应不能照搬人的味道体验。','https://academic.oup.com/chemse/article/doi/10.1093/chemse/bjaf052/8317703'],
 ['Döring et al. · 2025','犬触须的感觉功能研究','原始解剖 / 行为研究','全文已核验','11 犬示例录像及 6 具犬尸体组织样本；不支持精确测距或通用触觉阈值。','https://oa-fund.ub.uni-muenchen.de/id/eprint/2017/1/s41598-025-91629-1.pdf'],
 ['Slovak & Foster · 2020/2021','Whisker-friendly bowls 与进食行为','原始比较研究','全文已核验','38 猫完成研究；未发现所测进食指标显著改善，也不证明一切胡须接触都无不适。','https://pmc.ncbi.nlm.nih.gov/articles/PMC10812207/'],
 ['van der Leij et al. · 2019','The effect of a hiding box on stress levels and body weight in Dutch shelter cats','原始随机试验','全文已核验','23 只收容所猫；应激评分下降更快，但未显著减少体重下降。','https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0223492'],
 ['Haywood et al. · 2021','Providing Humans With Practical, Best Practice Handling Guidelines','原始人猫互动研究','全文已核验','支持选择、身体语言和适当接触；收容情境，不证明 VR 或长期家庭效果。','https://www.frontiersin.org/journals/veterinary-science/articles/10.3389/fvets.2021.714143/full'],
 ['Marshmallow Laser Feast · 2015','In the Eyes of the Animal','艺术装置 / 官方资料','创作者及委托方已核验','多感官艺术性转译；不同版本物种数量描述存在差异，不作为准确还原证据。','https://marshmallowlaserfeast.com/project/in-the-eyes-of-the-animal/','https://www.andfestival.org.uk/events/in-the-eyes-of-the-animal-marshmallow-laser-feast/'],
 ['Manekoware / Fire Hose Games · 2015','Catlateral Damage 原版','商业游戏 / 官方资料','商店页面已核验','原版列有 VR 支持；不将支持信息套到 Remeowstered，也不保证现代设备兼容。','https://store.steampowered.com/app/329860/Catlateral_Damage/'],
 ['Chris Woebken / Kenichi Okada','Animal Superpowers','设计装置 / 官方资料','创作者页面已核验','跨感官转译的设计先例，非生物学验证。','https://chriswoebken.com/ANIMAL-SUPERPOWERS'],
 ['Xu et al. · VRST 2024','iStrayPaws: Immersing in a Stray Animal’s World through First-Person VR to Bridge Human-Animal Empathy','研究原型','仅摘要','作者报告共情指标改善；样本、效应量与持续时间未核验，不写成长效。','https://doi.org/10.1145/3641825.3687729'],
 ['Flores Vargas et al. · ISMAR 2023','Now I Wanna Be a Dog','研究原型','元数据 / 研究主题','核实声音与触觉对动物具身的研究主题；未取得全文，不引用未知实验结果。','https://doi.org/10.1109/ISMAR59233.2023.00107','https://www.scss.tcd.ie/Rachel.McDonnell/portfolio.shtml'],
 ['Ahn et al. · 2016','Experiencing Nature: Embodying Animals in Immersive Virtual Environments','原始实验','作者研究页及原文','研究自然联结等指标；不是猫狗照护改善证据。','https://vhil.stanford.edu/publications/environmental-behavior/experiencing-nature-embodying-animals-immersive-virtual'],
 ['Martingano, Herrera & Konrath · 2021','Virtual Reality Improves Emotional but Not Cognitive Empathy: A Meta-Analysis','元分析','首轮原文已核验','43 项研究、5,644 人；结论需与不同纳入范围的后续综述并列阅读。','https://doi.org/10.1037/tmb0000034','https://assets.pubpub.org/dtdajcsa/11623854085420.pdf'],
 ['Lee, Shin & Gil · 2024','Measurement of Empathy in Virtual Reality with Head-Mounted Displays: A Systematic Review','系统综述','作者机构完整摘要','111 篇论文；与 2021 元分析结论不完全一致，未取得全文，不能归因其差异。','https://ksp.etri.re.kr/ksp/article/read?id=68750','https://doi.org/10.1109/TVCG.2024.3372076'],
 ['Herrera et al. · 2018','Building long-term empathy','原始比较实验','全文已核验','Study 2 共 439 人、桌面组 113 人；人类社会议题，不是宠物研究。未显著不同不等于等效。','https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0204494'],
 ['Kukshinov et al. · 2025','Seeing Is Not Thinking: Testing Capabilities of VR to Promote Perspective-Taking','原始实验','作者托管全文','96 人；明确换位思考任务有影响，视点主效应未显著。按刊期 2025 引用，不按 PDF 文件名。','https://anchitmishra.com/assets/pdf/IEEE-VR-2024.pdf'],
 ['Furbo','Furbo 360° Dog Camera','产品官方资料','功能已核验','双向音频、投喂与吠叫提醒为厂商功能描述，不等于临床疗效。','https://www.furbo.com/us/pages/comparison'],
 ['Petcube','Petcube Bites 2','产品官方资料','页面已核验','视频、双向音频及投喂是观察与回应功能，不直接读取情绪。','https://petcube.com/store/product/bites-2/'],
 ['FluentPet','Connect FAQ / App','产品官方资料','页面已核验','记录按钮事件不等于自动识别按键者或翻译思想。','https://support.fluent.pet/en/articles/6881999-connect-faq-app'],
 ['Bastos et al. · 2024','Soundboard-trained dogs 的词语反应研究','原始行为研究','论文摘要及利益声明','受训练犬的特定词反应；存在 FluentPet 雇佣/咨询关系，不称独立商业验证。','https://pubmed.ncbi.nlm.nih.gov/39196871/'],
 ['Bastos et al. · 2024','犬双按钮组合研究','原始数据研究','原文已核验','152 犬、194,901 次互动；非随机组合不等于完整语言或语法。','https://www.nature.com/articles/s41598-024-79517-6'],
 ['Twine','An open-source tool for telling interactive, nonlinear stories','官方技术文档','页面已核验','简单分支故事可无代码制作并导出 HTML；复杂定制仍有学习成本。','https://twinery.org/'],
 ['Three.js','PointerLockControls','官方技术文档','页面已核验','第一人称鼠标控制组件，不能替代场景、交互和内容制作。','https://threejs.org/docs/pages/PointerLockControls.html'],
 ['Pannellum','Panorama viewer / Tour example','官方技术文档','页面已核验','场景切换与热点漫游；需正确全景资产，不产生真实空间位移。','https://pannellum.org/','https://pannellum.org/documentation/examples/tour/'],
 ['MDN','DeviceOrientationEvent.requestPermission()','官方技术文档','页面已核验','手机增强方案需权限、安全上下文及兼容性检查；本次不依赖手机。','https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static']
];
const cite=(...ids)=>ids.map(n=>`<a class="cite" href="#ref-${n}" aria-label="查看来源 ${n}：${refs[n-1][1]}" title="${refs[n-1][0]}">[${String(n).padStart(2,'0')}]</a>`).join(' ');
const head=(n,label,title,intro)=>`<div class="section-head"><span>${n} / ${label}</span><h2>${title}</h2><p>${intro}</p></div>`;
const architecture=document.getElementById('architecture');
architecture.insertAdjacentHTML('beforeend',`
 <div class="evidence-line">共同原则的依据：猫犬联合行为指南与选择/控制框架；猫的空间策略仍需使用猫专属证据。${cite(1,2,3)}</div>
 <div class="module-map" aria-label="一套产品的三层架构"><div class="module-layer"><b>01</b><div><strong>共享层</strong><p>房间、事件、视点切换、选择、修改环境与回放。</p></div><span>同一产品</span></div><div class="module-layer"><b>02</b><div><strong>物种层</strong><p>猫：藏身与自主接近。狗：声音与探索。分别注明来源。</p></div><span>两条分支</span></div><div class="module-layer"><b>03</b><div><strong>个体层</strong><p>体型、眼高、年龄、活动能力与经历，不被“猫/狗”按钮包办。</p></div><span>本情境角色</span></div></div>
 <div class="table-wrap"><table><caption>提取共性，而不抹平差异</caption><thead><tr><th>共同设计问题</th><th>猫模块</th><th>狗模块</th><th>不可越过的边界</th></tr></thead><tbody>
 <tr><td>我能否改变距离？</td><td>自主退出、藏身后观察</td><td>保持距离、退开或靠近主人</td><td>不能保证同一个选择让所有个体更安心。${cite(1,2,4)}</td></tr>
 <tr><td>我可以去哪里？</td><td>桌下、遮蔽处；可达高处是可选项</td><td>按具体体型判断通道与视线</td><td>猫箱不等于狗笼；猫并非都能跳高。${cite(1,2)}</td></tr>
 <tr><td>我怎样获得信息？</td><td>熟悉物体与气味线索</td><td>主动嗅闻、调查声源</td><td>这是叙事重点，不是“猫只躲、狗只闻”。${cite(1,5,11)}</td></tr>
 <tr><td>主人能做什么？</td><td>等待接近、暂停接触、保留退路</td><td>观察反应、处理干扰、允许离开</td><td>原型呈现条件与选择，不诊断真实情绪。${cite(2,4,17)}</td></tr></tbody></table></div>
 <div class="callout"><strong>一个共性主题就足够：把选择还给它。</strong><p>“可选择”与“能控制结果”并不完全相同。提供多个按钮，只有当行动确实改变场景中的路径或互动方式，才构成有意义的反馈。这个统一框架是设计推导，不是已经验证的猫狗通用心理模型。${cite(3)}</p></div>`);

const senses=[
 {name:'视觉',en:'VISION',cat:'猫色觉实验支持二色视觉，但仅 2 只训练猫；暗光优势与目标尺度有关，不等于所有细节都清晰。',dog:'狗不是黑白视觉。视敏度研究中犬间差异很大，不能设置统一的“比人模糊几倍”。',common:'相比人的视点，眼高、遮挡与相对尺度首先改变可见信息；这属于可检查的场景几何。',design:'优先做同房间视点对照。颜色、模糊与暗视只作有标识的近似，不用滤镜代替任务。',refs:[6,7,8,9],level:'行为实验 · 含小样本'},
 {name:'听觉',en:'HEARING',cat:'可检测比人更高的频率，但听力范围依赖声压、年龄与个体；不能据此编造主观响度。',dog:'部分犬会对家居声音出现应激相关行为；主人可能低估反应，研究未准确测量视频声压与频率。',common:'可听频段、检测阈值、主观响度和恐惧反应，是四个不同问题。',design:'做声源方向、距离、间歇性与可退避空间。若用超声降频，标“听觉转译”，不全局放大。',refs:[4,10],level:'测听资料 / 观察研究'},
 {name:'嗅觉',en:'SMELL',cat:'熟悉气味是环境信息的一部分；环境指南建议尊重嗅觉环境，不等于清洁必然引起恐慌。',dog:'主动嗅闻和鼻腔气流机制重要。嗅闻活动研究不能证明一次游戏中的嗅闻改善福利。',common:'气味可以影响信息获取，但猫狗如何处理信息不能合并成一个“超强嗅觉倍数”。',design:'可用“按住嗅闻才显露局部线索”。彩色轨迹、标签与时间印记都是视觉替代，不是动物真的看见。',refs:[1,5,11],level:'机制研究 / 指南'},
 {name:'味觉',en:'TASTE',cat:'正常甜味受体缺失有分子依据；不是没有味觉，也不是所有食物都无味。',dog:'保留甜味感受，对多类味物质有反应；受体激活不能等同人的主观味道。',common:'屏幕不能直接改变人的味觉体验；味蕾数量也不是强度倍率。',design:'留作知识卡或食物选择后的说明。Camp 不为凑齐五感增加一个假装真实的味觉模块。',refs:[12,13],level:'分子研究 / 综述'},
 {name:'触觉',en:'TOUCH',cat:'胡须相关触觉可作定性说明；“胡须友好碗”研究未发现所测进食指标显著改善，别把深碗必然疼痛设为痛点。',dog:'犬触须研究支持机械感受功能，但示例录像和组织研究不能量化“比人敏感几倍”。',common:'胡须不等于全部触觉，也不是固定的身体宽度尺；无触觉设备时只能用其他感官表达。',design:'近物边缘提示属于触觉的视觉替代。三天主线可以不做，优先空间与选择。',refs:[14,15],level:'解剖 / 小样本研究'}
];
const cases=[
 ['多感官艺术装置','In the Eyes of the Animal','MLF · 2015','不同动物重新组织同一森林的信息；委托方明确称艺术性解释。','借鉴信息层次与声音叙事，不把作品当动物真实感知或照护效果证据。',[18]],
 ['桌面 / VR 商业游戏','Catlateral Damage 原版','Manekoware · 2015','从猫视点移动、跳跃、蹲伏、推落物品；原版官方商店列有 VR 支持。','借鉴家具成为可探索空间。娱乐机制不证明感知准确；不要与新版混淆。',[19]],
 ['可穿戴设计原型','Animal Superpowers','Chris Woebken / Kenichi Okada','通过视觉、声音与振动进行跨感官编码；不是一套统一的 VR 产品。','借鉴“转译”方法，但装置宣传中的生物学说法仍需单独核验。',[20]],
 ['动物换位研究原型','iStrayPaws','Xu et al. · VRST 2024','第一人称呈现流浪动物处境；作者摘要报告共情指标改善。','仅摘要已核验。未确认样本、效应与追踪，不把量表变化写成长效。',[21]],
 ['动物具身研究','Now I Wanna Be a Dog','Flores Vargas et al. · ISMAR 2023','研究声音和触觉对狗化身具身体验的影响。','仅核实主题与元数据，未取得全文；具身感不等于准确理解犬感知。',[22]]
];
const routes={
 a:{label:'A · 分支短片 / 2.5D',tag:'默认推荐 · 低开发风险',title:'用镜头、选择和重放，做出一段完整体验。',intro:'没有确定的三维开发能力时，把精力放在 6–8 个有说服力的第一人称画面、两次选择和清楚的前后对比。',time:'约 1–2 天制作，留第 3 天润色',requires:'有人能制作静帧、剪辑短镜头或整理场景渲染。',tools:'普通网页 / Twine / 带超链接的演示文稿',build:['同一房间先呈现人的视点，再用切镜呈现猫或狗的视点。','让用户选择路线或主人动作，不使用只有“继续”的伪互动。','每次选择后显示同一位置的前后画面，突出通道或互动的变化。'],wow:'关键揭示：从上方看见的出口，到了低视点却被家具遮住。随后一次调整，画面与选择立刻改变。',cost:'自由探索较少；静帧不能冒充实时三维或头显 VR。',ref:[33]},
 b:{label:'B · 单房间桌面 3D',tag:'空间感最强 · 有基础再选',title:'只做一个房间，三个观察点，一次可见改变。',intro:'若已经有模型，且至少一人熟悉网页三维或引擎，3D 能把环境设计优势直接变成可探索的关系。',time:'约 2–3 天，依赖现成资产与熟练者',requires:'可用场景模型 + 熟悉三维开发的人；不把从零学引擎算进同一预算。',tools:'Three.js / 已熟悉引擎的桌面或 Web 导出',build:['共享同一份场景几何，设置人、选定猫和选定犬的观察机位。','用点击到点代替复杂自由移动，减少碰撞和导航开发。','只让用户移开一个障碍或改变人的站位，随后回到原机位复看。'],wow:'关键揭示：同一模型的尺度与遮挡会随观察点改变，用户能够自己验证，而非只相信旁白。',cost:'建模、性能和控制成本更高。没有开发基础时，先完成 A，不让学习成本吞掉展示。',ref:[34]},
 c:{label:'C · 360° 热点漫游',tag:'已有全景资产时合适',title:'可以环顾的场景，加上少量有意义的热点。',intro:'已有正确全景渲染时，拖动环顾与热点切换能够表达空间包围感；它是观看位置间的跳转，不是自由走动。',time:'约 1–2 天，前提是全景资产已备好',requires:'在不同真实机位分别拍摄或渲染全景；不能把高位全景向下平移当低机位。',tools:'Pannellum / 浏览器全景查看器',build:['分别准备人、猫、狗角色的合适机位全景。','只放 3 个热点：线索、退路、主人行动。','选择后切换到改变环境后的匹配机位，保留对比关系。'],wow:'关键揭示：主动转头寻找出口，再在相同观看位置发现环境已被调整。',cost:'没有全景资产时未必省时间；不能产生真实空间位移，也不能称已实现 VR 具身。',ref:[35]}
};
const story={
 cat:[['00–10','人的判断','人看见桌下的猫和旁边的箱子。提问：这里通行方便吗？'],['10–20','进入角色','切到本情境成年猫的低机位；家具尺寸不变，改变的是观察位置。'],['20–40','寻找退路','给出“留在原地观察 / 退出 / 去遮蔽处”选择，显示哪些路径受阻。'],['40–55','猫的线索','探索可达藏身处；高处只作个体能力允许时的可选项，不强迫跳跃。'],['55–75','主人做一次改变','选择移开箱子或暂停接近。立即回到相同机位，看清路径如何改变。'],['75–90','带走一个问题','我会先观察什么，再靠近它？给出一条来源，并说明这不是猫的内心实录。']],
 dog:[['00–10','人的判断','同一个客厅、同一个整理事件。人觉得只是挪了一把椅子、走近几步。'],['10–20','进入角色','切到本情境中型成年犬机位；不同体型犬需另外设定，不假定犬总比猫高。'],['20–40','寻找选择','定位温和的环境声音，选择保持距离、退开或靠近主人；不编造“标准反应”。'],['40–55','狗的线索','主动点击调查局部气味标记；明确它是视觉编码，不是犬真的看见气味。'],['55–75','主人做一次改变','选择留出通道或暂停干扰。重放相同位置，显示可用路线而非“恐惧值”。'],['75–90','带走一个问题','它需要先了解，还是想暂时离开？观察真实个体再判断，不把脚本当诊断。']]
};
document.getElementById('report-content').innerHTML=`
<section id="senses" class="section">${head('03','SENSORY EVIDENCE','五感是依据，不必全部做成特效。','检测能力、行为反应与主观体验不是同一件事。下面保留猫狗差异与研究限制；卡片中的转译方式均为设计建议。')}
<div class="view-switch" role="group" aria-label="五感对比显示"><button class="selected" data-sense="all" aria-pressed="true">猫狗对照</button><button data-sense="cat" aria-pressed="false">只看猫</button><button data-sense="dog" aria-pressed="false">只看狗</button></div>
<div class="sense-list">${senses.map((s,i)=>`<article class="sense-card"><div class="sense-title"><span class="sense-num">0${i+1}</span><h3>${s.name}<small>${s.en}</small></h3><span class="method">${s.level}</span></div><div class="sense-columns"><div data-animal="cat"><span class="pill cat">猫</span><p>${s.cat}</p></div><div data-animal="dog"><span class="pill dog">狗</span><p>${s.dog}</p></div></div><div class="sense-common"><b>共同边界</b><p>${s.common}</p></div><div class="sense-design"><b>如何转译</b><p>${s.design}</p></div><div class="source-line">证据来源 ${cite(...s.refs)}</div></article>`).join('')}</div>
<div class="table-wrap"><table><caption>从“模拟”到“隐喻”：为每个效果贴对标签</caption><thead><tr><th>层级</th><th>可以做什么</th><th>应该怎样说明</th><th>Camp 取舍</th></tr></thead><tbody><tr><td><span class="pill">物理条件</span></td><td>眼高、遮挡、家具尺寸、可走路径、声源位置</td><td>选定角色与场景的几何/声源设计，不是动物意识</td><td>主线优先</td></tr><tr><td><span class="pill dog">感知近似</span></td><td>颜色可辨性、远处细节、暗部轮廓</td><td>依据研究的示意，未校准为具体动物的等效体验</td><td>最多加一项</td></tr><tr><td><span class="pill cat">感官替代</span></td><td>气味可视化、超声降频、触须边缘提示</td><td>用人能感知的信息表达另一种信息</td><td>非必需；显式标注</td></tr><tr><td><span class="pill neutral">叙事假设</span></td><td>角色旁白、情绪表达、镜头节奏</td><td>情境创作，不是读取真实宠物思想</td><td>不显示虚构恐惧百分比</td></tr></tbody></table></div></section>

<section id="cases" class="section">${head('04','PRECEDENTS','参考机制，而不是照搬宣传。','动物视角并非全新概念。项目的贡献可以放在“有证据的空间问题 + 主人可执行的调整”，而不是声称第一次让人变成动物。')}
<div class="case-grid">${cases.map(c=>`<article class="case-card"><span class="small-label">${c[0]}</span><h3>${c[1]}</h3><div class="case-meta">${c[2]}</div><p>${c[3]}</p><div class="case-lesson">${c[4]}</div><div class="source-line">${cite(...c[5])}</div></article>`).join('')}</div>
<h3 class="subheading">联系人与宠物的产品：观察之后，要有回应</h3><div class="triple product-grid"><article class="panel"><span class="small-label">REMOTE OBSERVATION</span><h3>Furbo 360</h3><p>摄像、双向音频、投喂、吠叫提醒。借鉴“收到线索—观察情境—回应”的流程，不把设备功能当临床疗效。</p>${cite(28)}</article><article class="panel"><span class="small-label">REPLAY & RESPONSE</span><h3>Petcube Bites 2</h3><p>远程观察与回应。可借鉴第三人称回放，对照刚才第一人称中被忽略的空间事件。</p>${cite(29)}</article><article class="panel"><span class="small-label">ACTIVE CHOICE</span><h3>FluentPet Connect</h3><p>按钮事件与记录。借鉴主动表达与重复观察，不称宠物思想翻译器；设备不能自动识别谁按键。</p>${cite(30)}</article></div>
<details class="evidence-detail"><summary>发声按钮“有研究”，为什么仍不能说宠物会讲人话？</summary><p>两项 2024 年研究分别报告特定声音词的情境相符反应，以及部分双按钮组合不符合随机解释。这支持有限的学习与组合现象，不证明完整语法或抽象思想，也不能从犬推广到猫。相关研究存在 FluentPet 雇佣或咨询关系，不应称独立商业验证。${cite(31,32)}</p></details>
<div class="revision"><span class="pill">本轮研究修正</span><h3>“被打动”与“理解准确”，证据并不总是一致。</h3><p>2021 年元分析（43 项研究、5,644 人）报告情感共情改善，认知共情总体未显著改善；2024 年系统综述的摘要（111 篇论文）则报告某些条件下认知共情可增强，情感共情未胜过二维视频。纳入范围与测量不同，不能把前一项研究写成领域定论。${cite(24,25)}</p><p>动物具身研究对自然联结等指标的结果，也不自动证明猫狗照护改善。另一项 96 人实验提醒：明确的换位思考任务可能比仅改变第一/第三人称视点更关键；它是人类场景研究，仍不能直接证明宠物体验有效。${cite(23,27)}</p><strong>设计推论：给用户一个可观察、可判断、可改变的问题，不只让他“看起来像宠物”。</strong></div></section>

<section id="routes" class="section">${head('05','LAPTOP-FIRST ROUTES','只有电脑，把效果做在关键时刻。','没有头显不是放弃体验的理由。选能按时完成的媒介，把“视点揭示、主动选择、即时重放”做好。下列工时为设计估计，取决于技能与现成素材。')}
<div class="route-selector" role="group" aria-label="制作路线"><button data-route="a" class="selected" aria-pressed="true">A · 分支短片 / 2.5D</button><button data-route="b" aria-pressed="false">B · 单房间 3D</button><button data-route="c" aria-pressed="false">C · 360° 热点漫游</button></div><article id="route-panel" class="route-panel" aria-live="polite"></article>
<div class="callout"><strong>别把电脑版说成与头显等效。</strong><p>Herrera 等的研究包含使用键鼠与屏幕体验相同叙事的桌面组；某些自报告差异不显著，但头显的空间临场感与部分行为指标不同。研究主题也不是宠物。电脑适合承载叙事和决策；本次无法验证头显条件下的身体归属感或长期照护改变。${cite(26)}</p></div>
<div class="effort-grid"><div><span>必须保留</span><p>同一房间的视点反差<br>一次真正改变结果的选择<br>同位置前后重放</p></div><div><span>有余力再做</span><p>耳机空间声音<br>一项感知示意<br>猫狗各自的线索动画</p></div><div><span>这次先放下</span><p>五感全覆盖与精准滤镜<br>开放世界和复杂宠物 AI<br>头显采购与长期效果验证</p></div></div>
<details class="evidence-detail"><summary>后续若想用手机增加“转头看”的感觉</summary><p>陀螺仪观看只是可选增强，依赖权限、安全上下文与浏览器支持；必须保留拖动观看。纸盒眼镜仍需要额外硬件，不能假定你们已有。本轮主交付只依赖电脑。${cite(36)}</p></details></section>

<section id="story" class="section">${head('06','90-SECOND EXPERIENCE','同一个家，我还有多少选择？','一套共同事件，两条角色支线。以下是可直接用于故事板的设计建议，不是动物行为实录。通过切换查看猫与狗各自的 90 秒体验。')}
<div class="view-switch" role="group" aria-label="查看角色脚本"><button data-story="cat" class="selected" aria-pressed="true">猫的支线</button><button data-story="dog" aria-pressed="false">狗的支线</button></div><div class="storyboard" id="storyboard" aria-live="polite"></div>
<div class="loop-strip" aria-label="体验闭环"><span>进入视点</span><i>›</i><span>发现条件</span><i>›</i><span>证据解释</span><i>›</i><span>主人调整</span><i>›</i><span>同位重放</span></div>
<p class="note">选择猫或狗不是选择一套固定性格。猫也会调查气味，狗也会躲藏；支线是为聚焦叙事而选取的情境。藏身、退出与人的互动方式有物种限定的依据。${cite(1,2,4,17)}</p></section>

<section id="camp" class="section">${head('07','CAMP DELIVERY','做一次清楚的体验，不背上大型研究任务。','短期 Camp 的目标是作品可体验、逻辑可解释、边界不误导。少量走查用来发现问题，不用于证明疗效或统计显著性。')}
<div class="days"><article><span class="day">DAY 01</span><h3>定机制，锁范围</h3><ul><li>确定共同事件与猫狗两条支线。</li><li>每条只留一个发现、一次调整。</li><li>完成 6–8 幅故事板；素材不齐就选路线 A。</li></ul><div class="day-output">交付：一句定位 + 故事板 + 3–5 条核心证据</div></article><article><span class="day">DAY 02</span><h3>串成可走通的体验</h3><ul><li>先让“开始—选择—重放—结束”完整。</li><li>猫狗共用画面与逻辑，只替换必要内容。</li><li>补音效与镜头节奏；不要先堆特效。</li></ul><div class="day-output">交付：一个浏览器入口 + 两条短分支</div></article><article><span class="day">DAY 03</span><h3>走查，修一轮，录备份</h3><ul><li>找约 3 位同学，每人 5 分钟。</li><li>改掉一处卡点和一处科学误解。</li><li>录制完整演示，断网也能展示。</li></ul><div class="day-output">交付：可玩版 + 演示视频 + 一页依据与反思</div></article></div>
<div class="check-panel"><div><span class="small-label">15 MINUTES IS A START</span><h3>只检查三个问题</h3><p>人数与时间只是预算建议。若没有外部体验者，做团队走查，并如实写“尚未进行外部用户测试”。</p></div><ol><li><strong>能不能独立走完？</strong><span>记录停在哪一页、哪一个按钮，而不只问“好不好用”。</span></li><li><strong>能不能说出一项调整？</strong><span>一个发现的空间问题 + 一个具体改变，不要求填写长问卷。</span></li><li><strong>有没有误以为这是精确还原？</strong><span>如果认为彩色气味就是动物真实所见，修改提示与表现。</span></li></ol></div>
<div class="pitch"><span class="small-label">可用于展示的定位句</span><blockquote>我们让猫和狗的主人，在同一个日常空间里体验不同的信息和行动条件，再通过一次具体调整，看见相处方式可以怎样改变。</blockquote><p>本次以桌面第一人称交互呈现 VR 构想；重点展示跨物种视角与行动闭环，不宣称复制宠物主观体验。</p></div>
<details class="evidence-detail"><summary>对比上一版：这次主动收窄了哪些要求？</summary><ul><li>从“首选猫”调整为“共用架构 + 猫狗双入口”，保留各自的证据。</li><li>从默认做 3D，调整为根据既有技能选 A/B/C；无确定开发能力时 A 最稳。</li><li>从较完整前后测，调整为短时走查；不以少量人次生成百分比或推广结论。</li><li>保留对科学真实性的要求，但把“精确复刻”改为“明确标识的模拟、近似与替代”。</li></ul></details></section>

<section id="sources" class="section">${head('08','SOURCES & LIMITS','证据可以追溯，结论可以被修正。','整合两轮研究，采用原始研究、权威指南、创作者与官方产品资料。此为面向设计决策的快速证据综述，不是穷尽性的系统综述。每条来源注明实际访问层级。')}
<div class="limitations"><h3>目前仍不能证明</h3><ul><li>这套颜色、声音和线索编码与某一只宠物的感知等效。</li><li>一次桌面体验会长期改变主人行为，或改善真实动物福利。</li><li>同一行为在猫狗、不同个体和不同场景里代表同一种情绪。</li><li>桌面体验结果可以直接替代未来头显版本的测试。</li></ul></div>
<p class="source-key"><span class="pill">指南 / 共识</span> 不等于单项试验　<span class="pill dog">原始研究</span> 保留样本与情境限制　<span class="pill cat">官方产品</span> 功能不是效果　<span class="pill neutral">仅摘要</span> 不冒充读过全文</p>
<ol class="references">${refs.map((r,i)=>`<li id="ref-${i+1}"><div class="ref-number">${String(i+1).padStart(2,'0')}</div><div><div class="ref-meta">${r[0]} <span>${r[2]}</span><span>${r[3]}</span></div><a class="ref-title" href="${r[5]}" target="_blank" rel="noopener noreferrer">${r[1]}</a><p>${r[4]}</p>${r[6]?`<a class="second-source" href="${r[6]}" target="_blank" rel="noopener noreferrer">补充原始入口</a>`:''}</div></li>`).join('')}</ol>
<div class="method-note"><strong>阅读方法</strong><p>文中编号链接对应本页来源清单。单项实验结果只适用于其研究条件；多个链接也不自动代表独立证据。案例功能以官方说明为准，未来购买或部署前需另行确认当前兼容性。本页场景、路线、工时和脚本均为设计推导；概念图为 AI 生成，不作为研究证据。</p></div></section>`;

function renderRoute(key){const r=routes[key];document.getElementById('route-panel').innerHTML=`<div class="route-summary"><span class="pill">${r.tag}</span><h3>${r.title}</h3><p>${r.intro}</p><div class="route-time">${r.time}</div><div class="route-tools"><strong>条件</strong><p>${r.requires}</p><strong>工具</strong><p>${r.tools} ${cite(...r.ref)}</p></div></div><div class="route-content"><span class="small-label">把这三件事做好</span><ol>${r.build.map(t=>`<li>${t}</li>`).join('')}</ol><div class="wow"><strong>效果来自哪里</strong><p>${r.wow}</p></div><p class="route-cost"><strong>取舍：</strong>${r.cost}</p></div>`;}
function renderStory(key){document.getElementById('storyboard').innerHTML=story[key].map((s,i)=>`<article class="story-step"><div class="step-top"><span>${s[0]} 秒</span><b>0${i+1}</b></div><h3>${s[1]}</h3><p>${s[2]}</p></article>`).join('');}
function setGroup(button,selector){document.querySelectorAll(selector).forEach(b=>{const on=b===button;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});}
document.querySelectorAll('[data-sense]').forEach(b=>b.addEventListener('click',()=>{setGroup(b,'[data-sense]');const key=b.dataset.sense;document.querySelectorAll('[data-animal]').forEach(el=>el.hidden=key!=='all'&&el.dataset.animal!==key);document.querySelector('.sense-list').classList.toggle('single-view',key!=='all');}));
document.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',()=>{setGroup(b,'[data-route]');renderRoute(b.dataset.route);}));
document.querySelectorAll('[data-story]').forEach(b=>b.addEventListener('click',()=>{setGroup(b,'[data-story]');renderStory(b.dataset.story);}));
renderRoute('a');renderStory('cat');
const navLinks=[...document.querySelectorAll('nav a')];
const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting){navLinks.forEach(a=>{const on=a.getAttribute('href')==='#'+e.target.id;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});}}},{rootMargin:'-10% 0px -65% 0px',threshold:0});
document.querySelectorAll('main>section,#report-content>section').forEach(s=>observer.observe(s));
