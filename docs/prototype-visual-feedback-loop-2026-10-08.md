# 原型真实截图反馈与有限修稿

关联 QE12 / 原型输出质量。实现状态：代码与专项本地测试完成；普通云模型与用户真实任务视觉改善未验证。无新增依赖、自动模型切换、云调用、发布或正式成果写入。

## 实际链路

Build 每轮沿用 TaskAcceptance 的真实浏览器检查报告。在原自动检查后，只在当前所选模型 `supportsVision === true` 时，从同版本 `prototype_report` 中读取真实 PNG，通过原 Pi `reviewContent` 的无工具只读补全发送图片。没有视觉能力确认、预算或有效截图时，保存明确的视觉未验证说明。Plan 不执行。

每轮至多 3 图、合计 12 MiB、4 个候选。图审输出请求为 `min(原配置上限, 2048)`，保留用户思考档位，原生 Pi 继续约束上下文。独立图审 60 秒超时，只把视觉审查记为未验证，不取消父任务、不重新发送整个任务。图审消耗原工具预算，父任务取消可中断图审。

只接收严格 JSON 的遮挡、裁切、可读性、间距、对齐与层级问题。每项具有截图 ref、归一化矩形、成果 outputId/entryHash、浏览器 reportId/executionId、screenshotId/hash、caseId 和 CSS viewport。宿主检查 schema、哈希及相互绑定；高置信度仅表示局部候选可进入原有修稿，不表示意见正确。

候选进入原父 Pi 会话最多 2 轮 `read_draft/edit_draft → 重检查 → 新截图审查`。不得删除业务规则、真实/模拟标记、来源或锁定用例来过关，不保存正式文件，不重复未知外部动作。中低置信度留给人工核对。未发现候选仍为 `unverified`，不会出现视觉 `passed`。

新 HTML 的默认检查保留原桌面加载/横向溢出检查，并接入原生控件可用性基线；只有用户输入明确移动需求时补手机视口。已有锁定规格不覆盖、不降标。具体控件检测边界由 `prototype-usability` 文档与实现说明。

## 身份、恢复与展示

图审回执附加为派生 TaskAcceptance 报告，保留原自动检查状态与历史，支持重启读取。成果/依赖/输入变化、撤权、截图丢失/过期/损坏都会隐藏旧截图身份及全部意见。损坏回执即使重算 resultHash，也不能形成修稿候选。

`get_task_acceptance` 沿用原分页。summary 提供有界状态、候选摘要与覆盖限制；report 保留截图身份与最多 4 项候选，排除图片二进制和无关元数据。普通操作日志只保存图数、哈希、模型、耗时、usage、请求上限、思考档位和安全诊断，不存图片或原始模型响应。`completion` 区分 completed / failed / invalid / interrupted；仅完成审查程序记录 succeeded，其余 failed；succeeded 不表示视觉通过。

## 本轮真实验证

- `tests/prototype-visual-review.test.ts`：截图与成果身份、无候选不通过、严格 schema/区域/未知 ref、重算哈希损坏回执、调用期间变化、取消、重启、依赖变化、撤权隐藏、模型报告投影、Service 能力/预算门禁和独立超时。
- `tests/prototype-visual-review-runtime.test.ts`：正式 createRuntime/Pi → 127.0.0.1 HTTP fixture 捕获真实 image_url 数据，原模型、无工具、2048 上限、父会话历史不变；未知视觉和预取消不发送请求。
- 上述专项最终 9/9 通过；与既有 TaskAcceptance/分页组合的前次 30/30 通过；`npx tsc -p tsconfig.node.json --noEmit` 通过。
- 浏览器完整端到端、根代理全量回归/check/build与桌面展示由根代理统一验收。本子任务未启动应用、未 build、未调用云模型。

## 根代理最终集成验收

21个相关文件串行组合148/148通过，零失败、取消或跳过；npm run check及npm run build均exit0。日志分别为 .test-data/prototype-visual-loop-integration-final.tap、prototype-visual-loop-final-check.log、prototype-visual-loop-final-build.log。上述9/30项是此前子集，不叠加计数；本轮未运行全仓全量测试。

首次组合142/146的4项失败保留在 .test-data/prototype-visual-loop-integration.tap。除旧测试整体passed期望和模拟runner缺新断言外，发现真实兼容缺陷：整体视觉unverified不应阻止继承已通过的具体业务DOM用例；宿主host检查不能成为用户业务基线。现仅继承当前、非自动失败且证据完整的具体业务用例，origin保持previous_verified；失败或依赖过期不继承。保存后、手动重验及重启重验对HTML恢复visualReviewRequired，不新增图片请求；新截图身份与缓存不一致时明确unverified，不扩大缓存绑定规则。

独立fixture scripts/prototype-visual-loop-local-fixture.mjs / prototype-visual-loop-local-host.mjs 使用最终dist、真实Electron受限runner、正式Service及默认createRuntime/Pi。新隔离目录 [report.json](../.test-data/prototype-visual-loop-local-6ocmlQ/report.json) 4例/38项通过：

- 单轮局部间距修正实际write一次、edit一次、图审两次，入口及PNG哈希随编辑更新；零候选仍unverified。
- 持续候选实际edit两次、图审三次；两轮封顶仍needs_human。
- 不支持视觉零图片请求；Plan零图片请求、零草稿，awaiting_plan。
- 三个Build均保留同一冻结业务基线，真实名称校验/模拟提交回归通过，只有pending草稿；正式fixture文件未变。

共21次仅127.0.0.1请求，5次无工具图审、15个实际PNG块，覆盖1440×900及390×844。根代理独立核对报告38项passed、8个源码及5个编译模块hash与执行记录一致；报告不保存原始模型正文、base64、思考或凭据。首次fixture因入口等待Electron就绪而没有进入Service，失败 [启动诊断](../.test-data/prototype-visual-loop-local-sFnDpf/startup-diagnostic.json) 保留；仅修测试入口包装后以全新目录执行，没有改产品超时、检查标准或用mock替代浏览器。

固定本地响应只证明图片传输、版本绑定、权限及有限修稿机制，不证明云模型能正确发现视觉问题或真实原型已改善。UI已有服务端渲染状态测试；完整桌面点击/布局仍未实际验证。本轮无新云调用、无真实业务稿修改、无便携版。重启启动BAT加载主进程更新。

通俗解释：软件现在能把刚生成页面的真实截图交给已确认能看图的当前模型，提出带位置的局部问题，再让原任务修两次。模型不会因为“没看出问题”就宣布页面合格；看不了图、超时或截图过期都会明确保留“尚未验证”。

2026-10-08 后续云端验证：一次真实局部视觉修订在写稿前输出上限中断，未触发截图复核；同路由独立图片补全HTTP400，能力保持未知。上文“无新云调用”仅属于机制集成验收阶段，不能描述本后续试验。详见 [真实结果](qe12-real-visual-local-result-2026-10-08.md)。本地机制通过与云端真实视觉质量仍须分开。

2026-10-09 补充：[截图选择去重](prototype-screenshot-selection-2026-10-09.md)修复了真实本地报告中相同桌面初始PNG占据两个送审名额的问题。保持三图/12MiB、模型门槛和两轮限制；不同成果、版本或CSS视口不合并。已有持久报告的源码重放和专项测试通过，根构建与当前用户新原型的真实视觉效果尚待验证。
