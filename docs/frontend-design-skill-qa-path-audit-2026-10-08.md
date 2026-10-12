# frontend-design加载与视觉验收路径核定

2026-10-08，只读源码与安全元数据审计。未改产品、dist、tests、业务稿；未云调用、构建或启动应用；未打开Pi历史、thinking或凭据文件。复用已有安全计量，不重做PRD历史追溯。

结论：**本例技能已完整送达，不能据“加载成功”断言设计已正确执行；现有DOM检查也不是完整视觉验收。** 真实视觉修改Run `fa4429cf-5f91-4c93-bece-8a3c0d03941f` 在新稿写入前中断，不能把当前结构缺口冒称这次输出前中断的确定根因，也不能将更早原型的质量算成本Run的新交付。

版本边界：本轮已审**当前源码/defaults**及上述视觉修改Run的冻结技能、保存presentation、实际安全工具计量。既有 `prompt-structure-audit-evidence.json` 记录该Run冻结 `pm-workflows.ts`/`prototype-guidance.ts`/`model-runtime.ts` 与当前相同，`service.ts`/`agent.ts` 已有后续改动；其当前实现结论不倒推历史。**最初QE12生成Run的冻结defaults/源码未在本轮逐字比较，历史注入和当时强制门禁保持未核定**，不能用今天的建议解释最初原型为何不佳。Pi日志system占位记录为空也不能推出实际system prompt未发送。

## 可重复的本机证据

安全摘要：`.test-data/qe12-frontend-skill-qa-audit-2026-10-08/safe-summary.json`；只读核定脚本为同目录 `audit.mjs`（首次输出拒绝覆盖）。它只读取冻结skill、terminal/safe-terminal-metrics及SQLite中明确投影的模型/提示词字段，不打开native session或pi-auth。

| 核定项 | 实际证据 |
| --- | --- |
| skill原件 | 9363字符，hash `d91970639e9f5c37682ac7ab60094d35f1c7c1f38d731bd56396563aee10c1d3` 与真实load receipt一致；去frontmatter并trim后9074字符 |
| 模型可见tool结果 | 当前 `JSON.stringify({content,receipt})` 完整重建恰好9449字符，与实际安全toolResult计量9449一致；读取/返回代码没有此处截段 |
| run提示词 | 已保存presentation 1676字符，确含原型设计建议与“查看真实渲染截图”建议；实际workflow用户输入也已包含原型建议（旧prompt结构安全证据） |
| 视觉能力 | 实际所选 `DeepSeek-V4-Flash-0731` 条目 `supportsVision` 未填写，即unknown；这不能推断端点实际上必定不支持图片，但宿主没有确认能力 |
| 实际执行 | search_files1、load_skill1、list_artifact_versions1、read_draft3、read_file1；没有write/edit、原型执行、截图读取；outputs=0，status=interrupted |
| 保护 | 审计前后真实SQLite字节hash不变；不导出提示词/skill完整正文、wire或thinking |

`main/skills.ts:27` 的技能文件64KiB上限是超限拒绝，`load`返回完整 `stripFrontmatter(...).trim()` 与原件hash回执；`main/agent.ts:157` 的通用result完整JSON序列化，`load_skill`没有用其它工具的10000字符分页上限。`characters`回执统计原文，9074正文/9449JSON结果/9363原件分别代表不同层，不能相互当作截断差值。此证据说明加载链路完整，不说明模型遵循了每条设计建议。

## 各类提示词如何注入

| 入口 | 实际行为 |
| --- | --- |
| 普通任务、默认协作提示 | `main/system-prompt.ts` 默认包含PROTOTYPE_GUIDANCE；正文明确仅生成/修改原型适用 |
| 普通任务、自定义协作提示 | 用户已保存正文原样成为presentation，不强制追加整个默认风格建议；宿主权限与任务质量边界仍独立注入。只对历史默认全文完全相等做升级，不覆盖自定义文本 |
| prototype workflow | `main/pm-workflows.ts:103` 无论presentation是否自定义，均把原型建议加入本次workflow用户prompt；默认presentation可能也有一份建议 |
| skill发现与调用 | 所有模式由 `skillPromptSection` 注入发现元数据；`load_skill`正文作为真实toolResult进入Pi，显式 `/skill:name`则受控展开成user输入。`noSkills:true`仅禁Pi无授权的默认发现，不禁宿主AuthorizedSkills |
| 独立内容审查 | `main/agent.ts` reviewContent只收到独立文本prompt，无tools、无截图/image输入；当前不会自动继承主会话skill正文或设计讨论。它审引文与业务含义，不等于截图视觉审查 |

来源：`main/agent.ts:282–295`、`main/service.ts:674/800/813`、`main/system-prompt.ts:30–36`、`main/skills.ts:60–80`。本例保存presentation与真实workflow都含原型建议，因此不能解释为“自定义提示词把原型建议全部屏蔽”。

## DOM通过、截图存在与视觉检查的差别

`main/image-reading.ts:11` 要求 `supportsVision===true`，false与unknown均拒绝；`main/model-runtime.ts:35`仅true声明模型image输入。`read_prototype_screenshot`先调用该校验，再按report/截图/入口hash/case读取受控真实image。实际Run没有尝试截图读取，故本例只证明能力未确认和未看图，不能声称发生了MODEL_VISION_UNAVAILABLE错误。

`run_prototype_acceptance`跑已定义的DOM断言并留截图，passed的口径是具体执行结果；它不只支持业务步骤，也能检查容器无横溢和目标尺寸。`main/service.ts:946`自动host:render只覆盖1440×900下body可见、html无横溢，不能覆盖移动端、文本被省略、标签挤压、层级、配色、业务术语可读性等所有问题。截图存在是证据完整性要求，`main/task-acceptance.ts:97–99`没有要求主Agent实际看过该截图。

人工或模型可另定义更多视口/具体DOM用例，不能把这些可选能力说成已自动执行。`main/agent.ts:203`执行工具返回imageReads建议，未自动读取图片；prototype组需按需启用，当前完成门禁也未要求该组曾加载或截图receipt存在。

`main/service.ts:817–827`确有最多两轮同Pi有限修正，`main/task-completion.ts:11–20`只挑必需的静态/文本/DOM明确失败及引文绑定内容候选问题。没有截图像素视觉意见的结构化输入，也没有每次修正后必须重看新hash截图的循环。提示词要求“发现问题先修复”，这目前是工作方法建议，不能当作已经执行的宿主强制保证。

## 有证据的下一步缺口（尚未实施）

1. **明确分开视觉未验证与DOM通过。** 针对明确要求视觉修改的prototype任务，复用所选模型能力和实际imageRead receipt，记录截图是否被确认支持视觉的模型读取、绑定的成果hash/视口；能力unknown/false或没读图时保持视觉未验证。先核验端点/配置，不可直接把supportsVision置true或自动换模型。此改动解决“截图已有所以等于看过”的口径缺口，不保证主观美观。
2. **把可执行视觉检查接入既有限修正。** 优先按用户目标视口及关键对象复用现有无横溢/目标尺寸等断言，并在视觉能力可用时安排同次Pi真实截图检查；具体视觉反馈须绑定当前入口hash、视口和位置，修正后旧图失效，重新核对。仍受原工具/时限/最多两轮约束；无法完成则诚实未验证，不加无限Agent或把所有设计判断伪装成确定性DOM断言。单纯再追加一份skill提示词没有解决此执行链缺口。

这两点是源码可确认的能力缺口；实际本Run先中断且无新稿，仍需先恢复生成再观测检查链。未做新云试验，不推断模型内部原因或此前所有失败的共同根因。

通俗解释：设计skill是一份已经完整读到的制作方法，不是自动改好页面的程序。现在系统会检查页面能不能跑，也会拍照，但还不能保证模型真的看了照片、找出问题并改完。这次任务则连新稿都没写出，需把“生成中断”和“视觉未核验”分别处理。
