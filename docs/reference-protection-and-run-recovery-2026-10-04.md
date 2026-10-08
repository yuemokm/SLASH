# 参考原件保护与输出截断恢复

日期：2026-10-04。版本：0.3.6，代码、199项单测、开发与打包GUI、便携版启动验收完成。

## 用户要求

参考文件仅可读取。需要格式转换或脚本处理时，先复制原文件，只处理带区分后缀的新文件。同时调查并修复 `slash test` 最近任务终止的问题；不自动重放用户的真实任务或改写历史记录。

## 文件与处理边界

- 默认 `资源/参考资料` 与既有参考挂载属于受保护原件；自定义目录按真实项目结构和持久身份判断，不只依赖显示名。
- 写入检查在文件服务执行，覆盖草稿、应用、恢复、模板迁移和导出目标；父挂载、重复挂载、链接不能绕过。
- 导入仍可创建新参考文件，使用不覆盖的创建方式。模板与 skills 的正常编辑不受无关限制。
- 处理前复制到已授权的过程/成果目录，默认使用 `过程文件/处理副本/原名_处理副本_<8位ID>.扩展名`；记录源文件、源哈希、目标和处理结果。转换输出增加 `_提取文本_` 或 `_脚本结果_` 后缀，先进入待应用草稿，不覆盖原件或已有副本。
- Plan 继续只读。生成持久副本或转换输出属于 Build 写入能力，遵循现有权限与取消策略。
- 仅设置命令工作目录不能限制宿主脚本的文件访问。存在受保护参考资料时，任意宿主命令不能作为转换绕过路径。
- 当前提供内置 PDF/DOCX/文本提取和隔离 JavaScript 处理。只要项目存在参考原件，任意宿主 Python、PowerShell 等执行会被拒绝，包括完全访问模式；这是一项明确的兼容性限制，不宣称已提供任意宿主脚本的文件隔离。
- 专用 JavaScript 处理器采用独立 Chromium 沙箱窗口：不暴露 Node、preload 或通用业务 IPC；不授予网络、导航、新窗口和系统权限。只传入副本数据，结果由主进程校验后创建输出文件。禁止把 Node `vm` 或普通子进程称为隔离环境。

沙箱设计依据：[Electron 进程沙箱](https://www.electronjs.org/docs/latest/tutorial/sandbox)、[Electron 安全说明](https://www.electronjs.org/docs/latest/tutorial/security)。本轮不修改用户原件的 Windows ACL，也不宣称能阻止用户在外部编辑器手动修改文件。

## 任务终止调查

已通过 Pi 会话 system 中的三个挂载路径确认属于 slash test。2026-10-04 20:44:08.123 与 20:45:14.111（北京时间）两次 assistant 均为 stopReason=length、output=16，仅有少量 thinking，无正文、无工具调用、无 errorMessage。不是转换脚本失败。运行模型为 DeepSeek-V4-Flash-0731，应用当时固定 contextWindow=65536、maxTokens=12000。

按已安装 Pi 算法估算第一轮上下文约69182 token，超过配置窗口并侵占输出预算；Pi 会进一步压低输出上限。这是明确的预算风险与重要诱因，但没有原始 HTTP payload，不能声称实际请求 max_tokens 精确等于16；第二轮截断还需在恢复链路中复现。实时 Pi 日志与磁盘 SQLite 所见 state 不一致，未据此伪造主 Run ID或改写历史。

应用应在请求前检查完整上下文，优先复用 Pi 自带压缩与有界恢复能力，明确区分输出上限、用户取消、工具失败和真正完成，保留已生成内容并提供继续入口。不能仅重发同样的超长上下文，也不能无条件重新执行已发生的文件操作或外部发布。

## 验收

- 原件写入与别名绕过被拒绝；模板、成果编辑和导入新参考仍可使用。
- 副本字节与来源一致、路径受控、名称区分、重复操作不覆盖。
- 转换/脚本失败、超时、取消均不修改原件；沙箱无法访问主机文件或业务 IPC。
- 真实模型协议的输出截断可重现，保存部分内容和可恢复状态；后续继续不伪造成功。
- 开发、打包和最终便携版验证使用隔离测试数据，不调用用户真实模型重放任务。

副本成功与预览成功分开处理：无法预览的格式仍保存真实副本 ID、引用与会话草稿，提示可继续处理，避免原件已复制却无法进入下一步。异步预览也复核当前项目。

工作流引用未支持格式的已登记副本时，核验实际路径、权限、字节哈希与登记来源后，只注入元数据；回执明确 `metadata_only`、正文字符数为0。模型不得声称已读取正文。未登记文件、历史版本、被改动的副本及越权访问继续失败，不能把解析异常全部吞掉。Plan仅能查看元数据并制定处理方案，Build才能执行转换。

## 阶段验证记录

- 参考文件保护专项包含父/重复挂载、junction与hardlink、关闭后重新开启普通目录写权限、导入新参考、原始字节副本、草稿/恢复/模板写入阻断、受保护根AGENTS读写区分。
- 隔离脚本模块真实Electron验证13项通过：.test-data/reference-script-1791119824024/result.json。受控HTTP/UDP监听均0请求，源文件与工作副本hash均未变化；无限循环8秒终止、取消销毁窗口。
- 首次独立脚本夹具因ESM顶层等待app.whenReady造成90秒启动超时，已改为ready回调；真实测试又修复大Base64正则栈溢出并重新通过。首次失败报告保留，不把夹具失败误归为产品转换失败。
- 首轮全量单测发现 processProcessingCopy 在 Zod union 中重复 discriminator，导致6项失败，首次GUI也因此无法完成。已合并为唯一严格分支并新增3项真实IPC解析回归，保留初始失败日志。最终全量196/196通过，日志 `.test-data/reference-recovery-tests-final.log`；`npm run check`、`npm run build`通过。构建仍有既有大于500kB的bundle体积提示。
- 后续GUI先发现测试脚本误用basename定位引用按钮，按真实完整路径修正；再真实发现未支持格式的引用被工作流强制文本解析而使Run失败，保留 `.test-data/reference-recovery-ui-development-final2.log`。未清引用规避，补上述metadata_only处理和服务回归后重新构建验收。
- metadata_only 修复后的198项全量测试通过，但完整GUI又揭示Pi恢复时可能移除内存中的length消息，使结果断言误读前轮stop。真实session JSONL确认当前响应是length。改为记录本次prompt的message_end结果，不回退到前轮完成消息；真实重试成功时允许新stop覆盖。为此补充真正Service + createRuntime + 本地HTTP的先stop、再length集成回归，而非仅stub runtime。

## 运行时修复与证据

- 当前历史、用户输入及系统/工具说明一起估算；至少保留1024 tokens总生成预算和4096安全余量，不把生成预算承诺为正文数量。不足时仅调用一次Pi原生compact，压缩后仍不足则明确报错。
- provider最终onPayload复核max_tokens/max_completion_tokens/max_output_tokens，避免工具返回大段数据时绕过首发预检。保留Pi既有自动压缩与有界恢复。
- length保存为interrupted，保留partial、草稿与操作检查点，Build显式继续从未完成处续接，不重新发送原始任务；Plan为避免只有后半段方案而缺失确认选项，仍只读重新生成完整方案。压缩过程与失败以真实事件显示。每个模式恢复会话后重新设置当前许可工具，Plan仍只读。
- 本地真实Pi协议夹具已重现：固定65536、历史usage54920再叠加新system后，序列化生成上限为1；启用护栏时没有发出该HTTP请求。工具返回挤满上下文也被阻断，正常小上下文保持12000。它验证该故障机制，不能替代缺失的原始上游请求payload。

## 最终验收记录

- `npm run check` 通过；`npm test` 199/199 通过：`.test-data/reference-recovery-tests-final3.log`。
- `npm run build` 通过：`.test-data/reference-recovery-build-final3.log`，仍提示既有 bundle 体积大于500kB。
- 真实Pi输出截断回归：`.test-data/real-pi-length-tests.log`；未解析副本的Service回归：`.test-data/processing-source-context-tests.log`。
- 开发应用GUI 14/14：`.test-data/workspace-ui-development-1791121475597/result.json`；最终打包应用GUI 14/14：`.test-data/workspace-ui-packaged-1791121731419/result.json`，均无页面错误。覆盖不可预览副本引用到真实Pi任务、length中断、取消、Plan和重启恢复。
- 打包GUI前后EXE和app.asar的SHA-256一致，证据 `.test-data/reference-recovery-package-before.json` / `reference-recovery-package-after.json`。
- 便携版实际启动、品牌显示、IPC、测试加密配置恢复及正常退出通过：`.test-data/reference-recovery-portable/result.json`。打包日志 `.test-data/reference-recovery-pack-final.log`。
- 交付 `release/slash-0.3.6-portable.exe`，187372815字节，SHA-256 `769d23267e8dc2c997c87686ecf2278a1817edccc0c07bc47db8d796ce552220`。首轮pack为修复GUI发现的问题主动终止；最终版本在独立 `release/build-0.3.6-final` 目录生成。
- 验证使用隔离目录、本地HTTP模型夹具与测试凭据；未重放slash test真实任务，也未改写用户历史数据库。真实上游恢复后的任务效果未验证。

交付后需退出旧进程并重新执行 `npm run dev`，或启动新便携版；仅刷新页面无法更新Electron主进程中的文件保护和运行恢复逻辑。
