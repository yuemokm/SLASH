# 2026-10-07 单次输出上限的可操作恢复

关联 F19 任务恢复、增量草稿制作。只改善明确继续时的反馈与错误来源说明，不改变输出数值、不增加自动重发或重试次数。

## 真实反馈任务的边界

隔离反馈 Run `1d1048a3-2c25-4b32-8da4-6b0aba0c1560` 为 interrupted / model_output_limit，实际 API 为 openai-completions。最后 native assistant stopReason=length，usage output=12000、input=1947、cacheRead=34560、totalTokens=48507；正文 0 字符，工具候选 0，只有 thinking block（仅记录计数 41023 字符，不展示内容）。已完成 read_file 2 / read_draft 5，没有执行 edit/write，不是大型工具参数已被执行后失败。

隔离配置没有 contextWindow / maxTokens 字段，也没有可信模型元数据缓存。解析的 65536 / 12000 来自 `UNVERIFIED_MODEL_LIMITS` 宿主兼容值，不是 fixture 手动值、用户声明、精确 Pi 目录或上游容量证明。当前模型运行文件 hash 与反馈 receipt 的 manifest 一致。禁止网络的 Pi payload 构造核对显示 `model.samplingParams` 被保留并进入 body，字段为 `max_completion_tokens:12000` 与 `thinking:{type:'disabled'}`；不能声称这证明实际 Flash0731 端点关闭思考生效，也不能用另一模型/官方接口的规则代替本端点事实。当前证据不支持继续增大未知回退。

## 产品行为

Service 创建 Run 时保留当次解析限额及字段来源。只有 MODEL_OUTPUT_LIMIT 且 maxTokensSource=unverified-compatibility，错误附“当前输出兼容上限 12000 token，可在模型设置核对；这是宿主未验证兼容值，不代表上游真实限额”。数值由当次解析结果取值，不写死提示值；明确用户或已验证输出限额不会被误标为兼容上限。

官方 resume 对 model_output_limit 增加简短宿主反馈：先提交一个范围小且完整有效的工具调用，等待回执，再逐块推进；不要把多项修改集中在同一响应；上一轮未完成工具参数没有执行。保留原任务完整目标、已生成部分回复、完成工具与草稿检查点，仍禁止重放已成功外部/文件操作。Plan 只读和原恢复链/权限保持不变；普通失败不注入此输出上限反馈。用户决定继续后才产生一次新尝试，没有后台无限续作。

## 验证

`tests/runtime-recovery.test.ts` 复用真实 Service+Pi 的 length / 旧 stop 边界与持久 session，验证兼容限额提示；明确输出 override 的真实 SSE length 工具候选由 Pi 标失败、不进入 write_draft 宿主网关，没有文件或草稿写入。续作测试验证完整目标、小块反馈、已完成操作/部分回复保留；普通失败恢复不含该反馈。恢复链、精确继续和模型限额回归一并验证。

`npm run check` 通过；上述定向回归 24/24 通过，日志 `.test-data/output-limit-guidance-targeted-20261007.log`。未自行构建或修改 dist。

新增引导是否让真实模型及时提交增量编辑仍需一次有限恢复及实际验收；本文件不将提示改善当作上游控制问题已经解决。
