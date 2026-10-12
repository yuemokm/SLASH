# 模型测试供应商标识与 HTTP 522

**后续证据更新：**用户说明同 API 在 DSH 可用后，根代理通过显式本机代理访问原 wangshu 端点，模型列表 HTTP 200，`gpt-6-astra` responses 流式请求 HTTP 200、完整 `response.completed` 和正文 `OK`；新增可选代理后，正式编译版 `testModelTextConnection` 15,971 ms 返回“连接成功”。因此下面“网关至源站”只保留为此前阶段性排查方向，不能再将失败一概归咎供应商；代理路径差异已实测。最小产品修复及验证见[模型条目的可选代理](model-proxy-2026-10-09.md)。

关联 F03 / PF03。2026-10-09 用户报告 `gpt-6-astra` 测试错误；根代理在实际 Slash 设置界面确认 `wangshu / gpt-6-astra / responses` 已保存，并通过该条目测试复现 `baishan API error (522): 522 status code (no body)`。用户随后要求停止 ComputerUse，后续未操作其界面。

`baishan` 是 Slash 注册 Pi runtime 时的内部键，不能据此认定请求发送到了百山云。软件确定的问题是测试错误使用内部标识，未显示真实配置身份；HTTP 522 无正文是上游请求失败的事实，现有证据不能确定其服务端根因，也不能证明模型 ID 无效。

## 修改

- `main/main.ts` 将已保存条目的供应商与显示名传给原文字测试函数。
- `main/model-connection-test.ts` 的失败信息显示供应商、名称、模型 ID（名称不同时）和协议；内部 `baishan API error` 转为“上游 API 错误”。
- HTTP 522 且明确 `no body` 时显示“上游服务返回 HTTP 522，且未提供错误正文。本次请求未完成，不能据此判定模型无效”；其他 HTTP 状态及原有错误正文继续保留。
- Pi 内部 provider、模型额度、256-token 测试上限、60 秒期限、零重试、协议和成功条件均未改变。截断、空正文、取消、意外工具调用继续失败。

流程见 [Mermaid](model-test-provider-identity-2026-10-09.mmd)。

## 验证与限制

`tests/model-connection-test.test.ts` 19 项通过，包含真实 Pi → 本机 HTTP 的 responses 522 无正文请求；校验实际 `wangshu / gpt-6-astra / responses` 标识、只请求一次、`max_output_tokens=256`、无 reasoning 参数及无密钥泄露。401、400、有正文 522、length、纯思考、空正文和原成功条件均覆盖。

统一模型连接/思考/限额/设置/原型视觉 5 文件 61/61 项回归通过，日志 `.test-data/model-test-identity-regression-20261009.tap`。`npm run check` 与唯一 `npm run build` 均退出 0，日志 `.test-data/model-test-identity-{check,build}-20261009.log`，renderer `index-BCYkJjNe.js`；只有既有 bundle 大小提示，无便携版。编译版 `dist` 的正式 Pi → 本机 responses 522 单请求验证也通过，报告 `.test-data/model-test-identity-20261009/compiled.safe.json`；未操作或关闭用户当前窗口。主进程改动需用户稍后重新启动开发应用加载。

根代理实际 UI 请求是云端 522 证据；本机固定响应测试只证明软件错误呈现和原边界，没有代替真实云模型成功。exec/node_repl 对相同 userData 路径的磁盘读取只见旧配置，与实际 UI 不一致；不能据此认定用户没有保存模型，实际 UI 是本次配置事实依据。此次未改用户数据库、模型配置或业务稿。

用户另提供 `https://wangshu-api.com/v1`。一次无鉴权 `/v1/models` 网络诊断保存在 `.test-data/model-test-identity-20261009/network.safe.json`：本机 DNS 12 毫秒返回 `198.18.0.158`，HTTPS 15 秒超时，未收到 HTTP 状态或错误正文。此地址属于特殊用途范围，不能作为该站真实公网 IP 或单独归因 DNS 故障；此次只证明该探测环境未及时收到响应，不能证明其模型授权成功或复现用户的 522。诊断未发送鉴权头、模型请求或额外重试。

## 后续实测与数据保护（2026-10-09）

用户手测新版仍返回 `wangshu · wangshu（gpt-6-astra · responses）` 的 HTTP 522 无正文：真实配置标识修复已生效，云连接仍未恢复。现有证据不能区分请求兼容性、域名入口、网络路径或上游故障；没有为此自动切换协议、域名、默认模型或增加重试。

工具环境直接只读 `AppData/Roaming/slash/slash.sqlite` 仍看到旧配置，与实际窗口不一致。进程当时打开的数据库与同名路径新打开的数据库文件标识及长度不同，原因未定，不能据此断言用户未保存或已丢失数据。已只读保留 DB/WAL 的一致快照，保护位置为 `C:/Users/yuemokm/AppData/Local/SlashDiagnostics/active-db-40c3b91f0a524655a34a242c42ec9f9a`；快照包含用户资料与加密配置，未放入仓库、未输出密钥、未覆盖当前路径。其用途是保全证据，不表示已经完成恢复；不得仅为加载代码就建议立即关闭窗口或覆盖数据库。

原 profile 的标准 safeStorage 只读凭据路径未能正常解密，按主代理要求已停止，没有扩大解密或扫描其他 profile，新增真实云模型请求为 **0**。后续以用户实际窗口的单变量手测结果为准。源码检索未发现完整用户 profile 的正式备份/恢复入口，正常设置保存不能代替完整数据保护。

包含最新视觉要求选择与旧覆盖提示清理的统一回归 44/44 通过，`npm run check` 和唯一 `npm run build` 均退出 0。日志为 `.test-data/model-final-regression-20261009.tap`、`.test-data/model-final-check-20261009.log`、`.test-data/model-final-build-20261009.log`；renderer `index-BCYkJjNe.js`，只有既有 bundle 大小提示，无便携版。

简单说：软件现在说明了真实失败对象；用户测试确认连接仍失败。已保护当时真实数据，不会拿旧配置冒充当前设置，也不会把本机测试通过说成云模型已修好。

## 用户新授权凭据的独立请求结果（2026-10-09）

根代理使用用户新授权的密钥，在 `node_repl` 内存中直接执行 `fetch`，绕过 Slash 和 Pi。每次请求设置 `redirect: manual`、20 秒期限，未自动跟随重定向；模型请求均为短文本、256 输出上限、非流式。结果如下，未记录密钥、完整鉴权头或原始 HTML。

| 请求 | 结果 | 耗时 |
| --- | --- | --- |
| `GET https://wangshu-api.com/v1/models` | 超时，未收到 HTTP 响应 | 20,013 ms |
| `GET https://www.wangshu-api.com/v1/models` | HTTP 522；`server: cloudflare`；HTML 正文 7,267 bytes | 19,996 ms |
| `POST https://wangshu-api.com/v1/responses` | 超时；请求体含 `model: gpt-6-astra`、`input: Reply OK.`、`max_output_tokens: 256`、`stream: false` | 20,015 ms |
| `POST https://wangshu-api.com/v1/chat/completions` | 超时；同模型、短句 `messages`、`max_tokens: 256`、`stream: false` | 20,013 ms |
| `POST https://www.wangshu-api.com/v1/responses` | 超时；请求体与无 www 的 responses 相同 | 20,007 ms |

五次请求没有成功模型回复，没有返回 usage；未收到 usage 不保证供应商零计费。密钥只在根代理测试内存中使用，已从全局变量清除，没有写入文件或转发给子代理。

离开 Slash/Pi 后，最小 responses、completions 以及模型列表仍失败；模型列表的 Cloudflare 522 使“网关至源站连通故障”成为优先排查方向。Cloudflare 的状态解释见[官方 HTTP 522 文档](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-522/)。这组结果不足以彻底排除所有软件兼容问题，也没有证明供应商整体或所有网络路径都不可用；不能通过自动换协议、增加重试或掩盖错误宣称修复。

此次仅补充诊断记录，没有修改代码或重复检查/构建。此前最终状态仍为相关回归 44/44、`npm run check` 与 `npm run build` 通过。

简单说：用新密钥直接访问服务，同样没有成功，连模型列表也返回 522。下一步优先让供应商核查该入口连接源站的情况，现阶段不能靠修改 Slash 的错误文字解决连接问题。
