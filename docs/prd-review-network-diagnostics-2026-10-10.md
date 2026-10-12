# 聚焦 PRD 审查：网络阶段诊断与文字观察窗口

2026-10-10，PF08。仅修改独立 fixture、观察器和测试，没有修改产品源码、dist、用户模型或 PRD 原稿。主代理执行云审查，子代理只做离线准备与本机 HTTP 验证。

## 现有证据与不能推导的结论

真实 case `33d4fb34-c8b8-43f3-832d-3ed2a8dc6ed7` 在60.134秒被测试审查截止取消，usage/stopReason未知。没有网络阶段记录，不能据此归因为供应商延迟、length、上下文过大或连接失败；0 findings不是业务通过。

冻结请求完整保留：用户要求843字符、PRD6653字符、来源选段18817/63164字符，共5个来源片段；渲染提示34437字符、57245 UTF-8字节，上限59392。14个工作表关键格完整。输入与提示哈希仍分别为 `97e4edccae5efdce7aa0298c2d0e1e685e2e102630c66074b5724ba4aad20f6d`、`0cffa6a76d57985596d7f525aa003785cbab2c7031b1c39a9194e4ea75e46bff`。

正式 `createRuntime.reviewContent` 使用独立、无工具的 `ModelRuntime.completeSimple`，不经过主会话 `agent.streamFunction`，因此已有主 Agent onPayload 观察器不能覆盖这条审查路径。响应块与预算诊断原来只在完整响应后返回，取消时不会保留中间网络阶段。

## 观察窗口纠正

历史真实 [PRD-DIMENSION结果](../.test-data/prd-dimension-repair-proposal/case-PRD-DIMENSION/ONE-PAGE-RESULT.md) 明确 content_review 用时 **152.376秒**并返回 finding。`main/service.ts` 的文字审查沿原 Run 预算；独立60秒期限属于视觉审查。前版夹具对文字审查设置60秒，是测试观察窗口，不是产品文字审查限制。

主代理据此批准本次使用 **240秒文字观察、280秒外层进程守卫**。这是有历史证据的测试窗口调整；产品预算、12,000输出请求上限、原 Pi 内部maxRetries1、模型与准确性门槛均未变。没有先以同样60秒重复发送一轮，也没有连接测试或更换模型。

## 最小安全观察与验证

`scripts/prd-review-transport-diagnostics.mjs` 透传原 fetch 参数、信号和响应字节，复用 `runtimeRequestDiagnostics` 的固定请求投影，明确标记来源为 fixture实际fetch请求。只保留请求次数、输出cap/thinking枚举、HTTP状态、响应类型枚举、headers/首字节/首事件/首次正文/首次思考/末事件时间、事件数、正文与思考字符数、完成原因枚举、数值usage及取消阶段。未知错误只分类；不保存原始正文、思考、请求/响应头、URL、密钥或上述内容哈希。

`tests/prd-review-transport-diagnostics.test.ts` 的3项真实loopback用例验证完整字节透传、headers前取消及流中取消；`tests/prd-review-transport-runtime.test.ts` 的2项正式createRuntime→Pi→loopback验证实际审查发送 `thinking.disabled / max_completion_tokens=12000`、原正文与stop保持、取消阶段正确且不伪造完成。合并 **5/5通过**，0云调用。完整流的UTF-8中文也实际由Pi读取；观察器未持久化测试隐私标记。`node --check` 和 `git diff --check`通过。

最新离线准备case：[f9056453-cff9-4149-a7f3-e01f26ff76af](../.test-data/prd-focused-review-f9056453-cff9-4149-a7f3-e01f26ff76af/preflight-result.json)。源码与编译版输入身份一致、14关键格保留，真实Electron预检2.910秒通过，凭据可解密，审查方法存在，模型调用0。本机Pi估计输入8610 token、窗口65536、configured/baseClamped输出均12000；这是宿主/Pi估计，不能当作供应商实际计费token或实际思考为零的证明。

主代理下一次使用该新case执行一次真实审查，新证据存 `network-diagnostics.json` 与最终合法 `content-review.json`。每个case的独占锁防止重发，输入与观察器哈希冻结。若没有headers，则仅认定在headers前等待/失败；若只有思考或部分正文，则记录实际计数与取消位置。没有完整、合法、引文绑定的结果仍保持未验证。

通俗说：此前给审稿等待一分钟，而同类任务过去就花过两分半。这次在有依据的时间内观察，同时明确记录请求卡在哪一段，才决定后续最小处理。
