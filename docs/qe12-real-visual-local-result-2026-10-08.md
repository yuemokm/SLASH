# 真实局部视觉修订：未产出新版

2026-10-08 后续实测。结论：**原稿的业务路径可以运行，但真实视觉修订仍在落稿前中断，不能宣称画面改善。** 产品源码和编译版本本轮未改。

## 本次结果

| 核定项 | 实际结果 |
| --- | --- |
| 修订前基线 | 正式受限 Electron runner，15/15 用例、150/150 步通过；含原生定位、必填、电话校验、成功和重复阻断。只证明具体业务路径，不证明美观。 |
| 新任务 | `494ad139-e4f0-40d5-832b-a5c7b79512cf`，普通 Build，原 Pi/当前配置；单次发送，独立工作区，正式文件不覆盖。 |
| Skill | 正式全局 `frontend-design` 已加载，原件 9,363 字符；不是仅发现或仅安装。 |
| 终态 | 351.204 秒，`interrupted / model_output_limit / length`；宿主取消 0 次，编辑/写入/新草稿均为 0。 |
| 最后一轮安全诊断 | 请求 `thinking.type=disabled`、`max_completion_tokens=12000`；响应只有 1 个 thinking 块，正文/工具调用为 0，输出 usage 12,000。只读枚举、数量与计量，未读取或导出思考正文。 |
| 原始资料保护 | 根代理独立重算 814 项哈希全部一致；精确 Run 终态后正常关闭测试应用，所属主进程/包装进程已退出。 |
| 后稿检查 | 没有新稿，未执行；未用旧稿通过结果替代新稿验收。 |

请求声明与实际响应形状不一致，应优先核对该端点的思考关闭及工具调用兼容性；不能仅凭这一点断言供应商忽略参数、Pi 丢参或模型固有能力不足。白山[官方文档](https://ai.baishan.com/docs/docs/llm-api.html)提供 `thinking.type=disabled` 示例，但示例型号不同，不能代替当前 `DeepSeek-V4-Flash-0731` 路由的实测认证。当前 12,000 是未验证兼容配置，不等于供应商真实最大能力，不盲目提高。

## 看图能力的独立诊断

同一配置路由的一次 GET `/models` 返回 200、找到型号，但无明确图片模态声明；一次原 Pi 图片补全返回 HTTP 400，没有可评分答案。保持 `unknown_request_rejected`，不永久标记为不支持。零重试、未换模型、未改配置，没有发送业务原型截图或思考内容。图片能力仍未确认，自动视觉复核不可作为已完成。

## 保留证据及下一目标

- [终态安全投影](../.test-data/qe12-visual-local-revision-b83fmbs0/case-VISUAL-LOCAL/root-terminal-safe.json)、[真实请求/响应计量](../.test-data/qe12-visual-local-revision-b83fmbs0/case-VISUAL-LOCAL/root-runtime-safe.json)、[正常关闭回执](../.test-data/qe12-visual-local-revision-b83fmbs0/case-VISUAL-LOCAL/app-close-proof.json)。
- [旧稿真实业务基线](../.test-data/qe12-visual-local-revision-b83fmbs0/baseline-original-tNFqwA/report.json)。原用例保留，定位操作及重复阻断的测试迁移在 `migration-diff.json` 中事先登记；没有在输出后降低标准。
- [图片请求安全报告](../.test-data/vision-capability-probe-2026-10-08/case-da0e34d6-1d17-4605-8f43-0d16a83baade/result.safe.r2.json)。首次本地启动/凭据失败均另行保留，不冒充发出请求。

下一顺序：先核对模型接入的真实工具调用和思考控制，再验证局部修改能写出完整草稿；随后对同版本桌面/手机截图及原业务路径复核。现有截图反馈机制本地接通不等于云端质量验收通过。完整开发目标继续 active，不重复发送这次失败任务。

简单说：设计方法已读到，但旧页面没经过有效的看图修正；这次让它修改时又在真正动手前中断了。需要先让模型稳定完成修改，再用实际页面验证好不好用。

## 后续：同一 Run 内分段要求仍未落稿

独立 case `qe12-visual-staged-revision-l825bbgx/case-VISUAL-STAGED`，Run `4cbf0837-65d9-4abe-9b8a-e59fb28acede`。保留完整七项改版目标、原模型/Skill/权限/限额和正式自动检查，仅在单次 send 中规定先表单、后说明的小批修改顺序；没有第二次 send、追加继续或跨 Run 草稿承接。发送前冻结 6 例/77 步 required 子集、独立 15 例/150 步业务 QA 和七项人工视觉核对表。

实际结果：**601.675 秒，测试宿主在 600 秒发出一次官方取消，终态 cancelled，零新草稿。** 这是测试上限，不是产品默认 30 分钟超时，也不是本轮自然 length 中断。完整全局 frontend-design 已加载一次；两页 read_draft 合计完整读取 19,192 字符，回执哈希与实际 seed 一致。后稿业务 QA、截图和七项视觉验收均未执行，不能使用旧稿结果代替。

安全审计核定了两个实际编辑尝试：

1. 11:09:50 的原生工具调用只有目标和哈希，缺少 oldText/newText 或 edits；参数校验拒绝并将错误返回 Pi。校验在官方操作日志 o.log 之前，因此执行列表没有这一条。模型随后自行继续，宿主没有重发。该消息 stopReason=toolUse、output=12000；单凭计量不能认定它被截断或推断思考内容。
2. 11:11:34 提交合法的 **21 项** 批次，仅第八项旧文本不匹配。模型漏抄原容器的 `id="g-name"`，其他 20 项均唯一匹配；不是顺序依赖，也不是权限、版本或草稿归属失败。新文本同样遗漏该 ID，而现有 JS 引用三次，required 用例也依赖它。Pi 原生纯匹配内存回放在同一项拒绝，整批未提交是正确保护；不得通过忽略属性、删除失败项或应用其余项来伪造成功。

根代理独立核对 seed/脚本哈希、源 ID 和用例引用，831 项保护哈希全部一致。终态后正常关闭测试应用，所属 PID 24524/19712 已退出，执行 session 27701 exit0。模型成果未应用。本轮没有产品代码改动、构建或便携版；审计只新增安全元数据，不导出思考、原始请求、编辑正文或凭据。

证据：[根终态投影](../.test-data/qe12-visual-staged-revision-l825bbgx/case-VISUAL-STAGED/root-terminal-safe.json)、[最小失败审计](../.test-data/qe12-visual-staged-revision-l825bbgx/failure-audit-final-4cbf0837.json)、[ID 引用核对](../.test-data/qe12-visual-staged-revision-l825bbgx/failure-audit-id-references-4cbf0837.json)、[正常关闭回执](../.test-data/qe12-visual-staged-revision-l825bbgx/case-VISUAL-STAGED/app-close-proof.json)。

本轮证明的是：仅写分段提示没有保证小步执行；模型仍一次生成 21 项，且遗漏实际属性。后续应优先补参数拒绝的可观测性和精确修改的恢复反馈，继续复用 Pi 的匹配与原子保护。这个软件改进方向尚未实施，不能承诺会消除长任务等待；不重复当前长云任务、不盲改限额。完整视觉、业务依据与跨成果质量目标仍 active。

通俗说：模型读到了原文，但修改时漏抄了一个页面标识，还把许多改动一次提交。编辑器阻止了这次不可靠修改；设计 Skill 本身不能保证它正确改稿和检查实际画面。

## 后续软件修复，与本次真实失败分别记录

参数拒绝记录、检查点持久化、安全可读的执行失败与原生匹配恢复反馈现已完成，详见 [草稿修改恢复及本机/桌面验收](draft-edit-recovery-2026-10-08.md)。独立编译回放在本机复现三次参数拒绝及第八项匹配失败，重读后正确小批修改可生成待应用草稿；不改变本次真实云试验的零稿结论，也不代替后稿业务或视觉验收。没有重跑长云任务或修改旧原型。
