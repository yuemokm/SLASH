# QE12：为何实际用了设计 Skill，页面仍难用

2026-10-08，只读核验。**原始页面确实加载了完整 frontend-design；已证实的问题是缺少有效的视觉反馈与修正闭环，验收范围不能保障可读、易用。** 不是 Skill 没安装，也不能把其偏品牌设计的措辞直接判为唯一原因。最新视觉任务加载后零稿，不能用它解释较早页面的形成。

## 实际稿链

| 实际 Run / 输出 | Skill 与修改事实 |
| --- | --- |
| 原 QE12 `abb6b748-e688-498e-9437-6b12f8c66a01`；[pending-1.html](../.test-data/qe12-navigation-retest-proposal/case-QE12/pending-1.html) | 16:46:25 UTC 已实际 load；17:00:59 首次写稿。正式回执原文件 9,363 字符，Pi 工具返回去 frontmatter 后正文 9,074 字符，与历史包完整正文逐字相等。不是只 discovery。 |
| LOCATION-SHORT `01847ed7-f05c-401d-ae7c-23cb58448176`；[pending-2.html](../.test-data/qe12-location-short-proposal/case-LOCATION-SHORT/pending-2.html) | 有 discovery，load=0。任务仅修定位/首次只读，保留其余页面；与原稿全部 style 逐字一致。 |
| DUPLICATE-CREATE `83555491-64e4-4dd4-83fa-ce9ef8ae7b24`；[pending-1.html](../.test-data/duplicate-create-repair-proposal/case-DUPLICATE-CREATE/pending-1.html) | discovery=0、load=0，限定重复分支；与 LOCATION-SHORT 的 style 和 form 逐字一致，仅两处弹窗/逻辑差异，未承担视觉重做。 |
| VISUAL-COPY `fa4429cf-5f91-4c93-bece-8a3c0d03941f` | 真实 load 同一完整 Skill；304.269 秒后 length 中断，0 编辑/0 稿。没有新页面，不能称本次设计实施失败的页面已产出。 |

上述输出的真实字节、ChangeSet、各轮 seed 串联均核对相等，实际版本绑定写在 [evidence.json](../.test-data/qe12-skill-use-causal-audit-2026-10-08/evidence.json)，不以文件名猜版本。

## 可证明的缺口

1. **生成时没有图像输入或看图反馈。** 四轮均无图片附件、imageReads、read_image/read_prototype_screenshot；原生 user/toolResult 图片块计数均 0。同模型 `DeepSeek-V4-Flash-0731` 的 supportsVision 未配置。与历史冻结一致的 `main/model-runtime.ts:30` 将其设为 text-only，`main/image-reading.ts:11` 和截图工具会拒绝未确认视觉能力。证明的是本路径不能看截图，不证明供应商模型本身一定不支持视觉。来源输入是业务资料，未提供具体视觉参考图/设计系统；原始提示及工作流虽提到移动/截图，也没有明确业务表单与来源说明的呈现分离。
2. **模型尝试的业务检查没有形成成功回看。** 原 QE12 定义了 5 个交互用例，但真实工具三次运行均 `ARTIFACT_NOT_FOUND`，没有一次成功的模型浏览器工具结果。SQLite 中两次成功来自自动验收内部 render；原正式 criterion 仅 **1440×900、body 可见、html 无横向溢出**。不能把这些内部成功当成模型定义 5 例通过。模型没有拿到任何 screenshot image。
3. **验收未检测本次实际可用性问题。** 原任务 automaticStatus=passed，但整体 unverified、内容审查 invalid；repairRounds=0。后验宿主原 10 例实际 8/10，三视口布局每例也仅“表单可见＋无横向溢出”；未测状态逐字换行、说明遮蔽主任务、自动编码伪装必填、完整地址可读、来源批注收纳。原 390 [真实截图](../.test-data/qe12-navigation-retest-proposal/case-QE12/browser/host-layout-390-3ea936c1-1b41-4721-b152-98225b431a05.png)已经显示这些首屏问题；[定位稿截图](../.test-data/qe12-coordinate-missing-batches/host-layout-390-c7261b1d-7927-489b-ab81-6057984903d4.png)继续保留。后来 5 例/73 步业务回归通过也未包含视觉验收，不能替代它。
4. **完整 Skill 中的可用性要求没有在稿中落实。** 历史 Skill 明确 brief 优先、移动响应、可读性、从使用者角度写文案，以及环境支持时看截图自查。原 HTML 仍把来源坐标/“业务对象=”/“仅落库”等评审批注放进录入表单，编码显示必填星号却自动生成，移动状态被挤成多行。原要求只说交付来源/落实对照，没有强迫逐字段显示技术批注。可确认交付违背这些适用要求；无法从日志确定模型为何选择这种表达。

## 版本与因果边界

原 QE12 和 VISUAL-COPY 实际加载的是有 GitHub 来源记录的隔离全局包，两轮内容相同、完整无截断。当前 Codex 本机 `C:/Users/yuemokm/.codex/skills/frontend-design/SKILL.md` 是另一版本；不能拿本机当前措辞倒推历史。详见 [版本对照](../.test-data/qe12-skill-use-causal-audit-2026-10-08/skill-version-comparison.json)。新版 prototype-guidance 的明确说明收纳/长地址建议是在原稿之后加入；原前三轮冻结版本与当前不同，不能说它们已收到新版指导。

Skill 的方案比较增加前置要求、原任务 11 次压缩可能影响指令保留、缺少具体参考可能增加模型自由发挥，均仅是候选解释。未读思考或压缩摘要正文，不能证明这些导致页面质量或后续 length。当前缺陷不应归因于确定的模型能力不足，也没有证据支持盲目换模型、提高 12,000 上限能解决。

下一步应把既定视觉目标转为同版本的实际截图与操作检查，并让检查发现的问题进入修稿回合；未确认视觉能力时明确模型无法看图，由宿主独立审阅反馈。仍保留全部字段、来源映射和业务回归，不把“先有一个小编辑”算完成。本次没有执行这一步，未来视觉 case 准备已暂停。

安全计数：[safe-counts.json](../.test-data/qe12-skill-use-causal-audit-2026-10-08/safe-counts.json)。31 项证据保护全部一致，0 云请求、未启动 app、未改产品/业务稿、未 build；没有读取或导出思考/摘要正文。

通俗说：设计要求确实送到了模型，但它做出的页面没有经过“看见实际手机效果、指出问题、再修改”的过程。后续测试主要证明按钮和校验能工作，无法发现说明太多、状态挤坏等问题；所以“用了设计 Skill”和“页面已经好用”之间仍缺一段真正的验收。

后续进展：上文“本次没有执行/准备暂停”仅指本因果审计时点。后来截图反馈机制已本地集成，并完成一次真实局部修订试验，但仍在写稿前 length 中断；独立图片请求被当前路由拒绝，能力未确认。当前状态及证据以 [后续真实结果](qe12-real-visual-local-result-2026-10-08.md) 为准，不改写本报告中的历史事实。
