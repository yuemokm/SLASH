# 模型条目的可选代理

关联 F03/PF03。用户说明相同 API 在 DSH 可用后，继续比较网络路径。此前绕过 Slash/Pi 的直接请求失败，不能据此断定供应商整体不可用。

## 实际证据

工具环境只读检查发现 WinINET 系统代理关闭、WinHTTP 为 direct、Node 代理环境变量未设置；Mihomo TUN 开启、DNS 为 `198.18.0.2`、fake-ip 范围 `198.18.0.1/16`，本机 `127.0.0.1:7897` 有代理监听。此前 DNS 返回特殊用途地址与这一环境相符，不能把它视作服务真实公网 IP。DSH 已安装，但工具进程列表未找到其运行进程，未读取其他客户端密钥，未确认 DSH 的具体请求传输。

根代理用用户新授权、仅在内存使用的同一凭据，通过显式 `undici ProxyAgent` 访问原地址 `https://wangshu-api.com/v1`：模型列表 HTTP 200，1,485 ms，包含 `gpt-6-astra`；responses 非流式短请求在 25 秒期限内未完成；responses 流式请求 HTTP 200，11,029 ms，收到完整 `response.completed` 和正文 `OK`。流式请求模型 `gpt-6-astra`、输入 `Reply only OK.`、输出上限 256。没有换 API 域名、模型或密钥，也没有自动打开系统代理。

这说明在本次环境中，显式代理路径已使原端点成功；软件此前缺少为模型指定该网络路径的设置。它不证明 DSH 使用了同一代理，也不代表所有后续会话、工具调用或图片能力都已云验收。原 HTTP 522 记录继续保留，故障不能一概归咎供应商；其网络路径差异已得到实际请求支持。

## 最小修改

- 既有模型新增/编辑表单的“连接详情”增加可选代理地址，留空保持原网络连接。示例仅为占位文字，不自动填写端口、不改默认模型或用户已保存条目。
- `ModelEntry.proxyUrl` 是可选字段，IPC 的 `null` 表示清除，旧调用省略字段保留原值；非法地址在写入配置/凭据之前拒绝。只接受 HTTP/HTTPS 主机及端口，拒绝内嵌凭据、路径、查询、片段及 SOCKS 等协议。
- `openAICompatibleProviderConfig` 使用 Pi 0.86.1 已公开的 `ProviderConfigInput.streamSimple` 和官方 `api/*.lazy` 的 `options.fetch` 注入条目代理。保留官方请求体、事件解析、重试和取消；不修改 vendor 或全局 fetch/dispatcher。
- 文字测试、正式会话、独立只读审查、图片请求与模型能力刷新透传同一条目代理。原内部 provider 和既有直连条目不变；没有扩展浏览器/MCP/发布连接的代理。
- `undici` 按已有安装版本 `7.29.1` 锁为直接依赖，复用其 `ProxyAgent`；代理连接有界缓存，淘汰时优雅关闭活跃请求。文字测试结果说明是否使用已配置代理，仍拒绝空正文、截断、取消和非正常结束。

Pi 的公开 HTTP fetch 注入定义见本机安装的 `@earendil-works/pi-ai/dist/types.d.ts`，provider hook 定义见 `@earendil-works/pi-coding-agent/dist/core/provider-composer.d.ts`。Electron 的 `net.fetch` 使用 Chromium 网络栈并支持系统代理，与 Node fetch 不同，见[官方 net 文档](https://www.electronjs.org/docs/latest/api/net#netfetchinput-init)；本次只增加显式模型代理，不更换全局网络栈。

流程见 [Mermaid](model-proxy-2026-10-09.mmd)。

## 验证

必要回归 6 文件 58/58 通过，日志 `.test-data/model-proxy-regression-20261009.tap`：本机 CONNECT 代理承载实际 Pi 文字测试、正式会话、只读审查及 `runtime.complete`，校验原 responses 流式参数、原模型和一次测试请求；旧直连条目不经过该代理，全局 fetch 未修改；522 无正文保持失败，取消保持 aborted，无回退直连。配置持久化、清除、省略保留、非法地址原子拒绝、原模型能力及缺失终态边界均通过。

`npm run check` 与唯一 `npm run build` 均退出 0，日志 `.test-data/model-proxy-check-20261009.log`、`.test-data/model-proxy-build-20261009.log`，renderer `index-C9I1zk0n.js`；仅既有 bundle 大小与插件耗时提示，无便携版。初次 ModelEntry 手写类型缺字段导致检查失败，已补齐；初次 tsx 测试进程导入阻塞已只停止本任务进程，最终用 `node --import tsx --test` 完成回归，没有改变生产取消行为或删减必要断言。

没有修改用户实际模型配置、重启其应用或恢复/覆盖数据库；此前保护快照继续保留。

编译后根代理在 `node_repl` 直接加载正式 `dist/main/model-connection-test.js` 的 `testModelTextConnection`，以仅在内存中的用户授权密钥执行一次真实文字测试：`provider/name: wangshu`、`id: gpt-6-astra`、`baseUrl: https://wangshu-api.com/v1`、`proxyUrl: http://127.0.0.1:7897`、`protocol: openai-responses`。**15,971 ms 成功返回“连接成功”**，notice 明确“本次使用已配置的模型代理”；没有替换 mock、改正式中文测试提示或放宽成功条件。根代理随后清除了测试密钥引用，并关闭其两个 ProxyAgent 连接。本轮在测试代码编译后没有再次构建。

此真实成功仅验证正式文字连接测试，不证明长任务、工具调用或图片能力已经云验收。用户可到 **设置 → 模型 → 编辑 wangshu → 连接详情 → 代理地址（可选）** 填入自己明确使用的代理地址；当前本机验证值为 `http://127.0.0.1:7897`。保留原 API 地址、模型 ID、协议和密钥，再保存并测试。此处不自动修改配置或系统代理开关，也不要求恢复/覆盖旧数据库。

简单说：同一模型通过本机代理已经能回复。现在软件允许在这个模型里明确填写代理，让测试和聊天都走相同路径；其他模型保持原来的连接方式。
