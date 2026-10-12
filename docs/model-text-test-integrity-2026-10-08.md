# 模型文字测试：完整回复才通过

关联 PF03 / F03，以及真实任务完成率目标。2026-10-08 已实现并验证；不等于真实原型质量通过。

原 `testConfiguredModel` 只排除 error/aborted，把 length 甚至无正文也返回成功，设置还会显示原始 JSON。现复用原 Pi/provider，只有正常 stop、非空文字且没有工具调用才通过；截断、纯思考、取消、错误和其它未完成状态明确失败。每次开始清除旧结果，失败替换旧成功；结果用可读说明呈现。

保留 `modelTest` 接口及 modelId/model/reply/notice；保持 min(256, 原上限)、60 秒、零重试。模型配置、限额、能力、权限、会话历史不改变。实际请求声明关闭思考却仍返回 thinking 时，只提示关闭控制尚未核实，不永久判定支持/不支持。成功仅证明本次文字连接，不证明工具和图片能力。

代码：`main/model-connection-test.ts`、`main/main.ts`、`src/model-test-result.ts`、`src/SettingsModal.tsx`。流程见 [Mermaid](model-text-test-integrity-2026-10-08.mmd)。

## 验证

- 根代理4文件相关组合39/39通过，含17项新测试及真实 Pi→本机 HTTP；不将重叠数量相加。日志 `.test-data/model-connection-root-tests.tap`。
- `npm run check`、`npm run build` exit0，日志 `.test-data/model-connection-root-{check,build}.log`；构建仍有既有 bundle 大小提示，无便携版。
- 编译版实际设置按钮→官方 preload/IPC→Pi→本机 SSE，4/4通过：成功→纯思考截断失败→成功→部分文字截断失败。每次开始清空旧结果；4次操作=4请求，零重试/页面错误，应用正常关闭，7个源码/编译文件身份由根代理独立复核。根代理查看了真实失败截图。证据 [result.json](../.test-data/model-text-ui-1791456465108/result.json)；脚本 `scripts/model-text-test-ui-smoke.mjs`。首轮测试选择器错误证据保留在1791456416650，仅修fixture后以新目录重跑。

固定本机响应验证程序行为，不冒充云模型通过。未读取原账号凭据或修改业务稿。主进程有更新，重启启动 BAT 加载。

## 同轮模型接入核对

当前模型两次真实、无业务副作用的短工具请求均HTTP200/toolUse，名称和固定参数校验通过（不执行工具）。单变量仅 max_completion_tokens→max_tokens，分别76/75输出token，不能据1321/2570毫秒差异断言提速。均声明thinking.disabled且返回thinking块；不能证明字段名差异导致长任务截断，因此未改兼容默认。见 [安全报告](../.test-data/vision-capability-probe-2026-10-08/token-field-pair-2026-10-08/pair.safe.json)。

额外零云、7次本机HTTP核对：Pi原生 thinkingSignature 会按同模型身份回传reasoning字段，原配置与 requiresReasoningContentOnAssistantMessages=true 相同；该flag只在reasoning=true时补空字段，不会恢复无签名内容。不能据此认定原生历史丢失，更不能把这个开关当修复。见 [合成历史报告](../.test-data/vision-capability-probe-2026-10-08/reasoning-history-local.safe.json)。未读取真实思考正文。

剩余：真实综合任务仍在首次落稿前达到输出上限，看图能力未确认。下一步应验证保留全部原要求的分段落稿与最终完整回归；已有原型指导明确分段，不能重复追加同类提示词或再盲试参数。完整输出质量目标继续active。

简单说：软件不再把“回了一点内容”或“只想没答”当作连接成功；这修好了测试判断，长任务能否稳定交付仍需继续验证。
