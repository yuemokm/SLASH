# billion-context 0.1.188：固定发布物本机验证

2026-10-08。结论：**保留 Pi 原生压缩为默认。** billion-context 的可检索、可恢复压缩已经实际运行成功，基础故障检查也通过；尚未证明它能让真实 PM 修订更准确或减少完整任务成本，Slash 的权限、生命周期与回退适配也尚未完成。这里不是认定它“不稳定”，而是区分已验证能力和仍缺的证据。

本记录配合 [原生机制与同材料 A/B 准入](billion-context-comparison-2026-10-08.md)。未更改生产模型路由、未加入运行依赖、未读取用户密钥、未发云请求。辅助六包的产品集成与本次候选研究是两个范围。

## 发布接口与可行路径

审计对象为 npm `billion-context@0.1.188`，直接运行发布的 `dist/index.js`，没有重建其源码。`dist/build-info.json` 为 `62598940`，发布 CLI SHA256 为 `d8d2909ef32798507447542b959da6eead5485e6b27c7f5dcb73dece1e75c280`。完整 tarball 位于 `%TEMP%/slash-billion-runtime-20261008/package`；source map 只用于静态阅读。

固定包的 `exports` 提供默认 DSH、`./server` OpenCode、`./dsh`、`./client` 入口；**`./server` 并非通用 headless HTTP server API**。独立代理应采用正式 CLI：`node <package>/dist/index.js start --config <file> --host 127.0.0.1 --port <port> --no-auto-update`。Pi 原生扩展文件在发布物中，但模块导入有自动代理/全局 fetch/WebSocket 接管等启动副作用，不宜未经宿主限制直接导入 Slash 主进程。

官方合作协议可通过本机 HTTP 复用，已实跑以下接口。接口定义见固定构建 [PLUGIN.md](https://github.com/ranxianglei/billion-context/blob/62598940/PLUGIN.md)。

| 接口 | 本轮用途与边界 |
| --- | --- |
| `/bili/<absolute upstream URL>/v1/chat/completions` | 将显式上游地址路由经过代理；本轮只有 localhost 合成上游 |
| `GET /__bili/plugin/manifest` | 获取正式 compress、decompress、search_context、acp_status、acp_cache schemas |
| `x-bili-plugin: pi` / `x-bili-plugin-conversation` | 显式宿主会话绑定，保留宿主工具执行；另报 context-window/max-output，避免猜模型预算 |
| `POST /__bili/plugin/tool` | 宿主提供 conversationId/tool/args/nativeCaller；模型不得控制宿主会话身份或任意导出路径 |
| `GET /__bili/plugin/status`、`snapshot` | 检查会话、原历史、revision、真实折叠块和可压缩范围；不是只看200响应 |

可行适配是私有 loopback 子进程、每项目独立状态、Slash gateway 绑定会话及工具预算、明确唯一压缩所有者。保留当前 Pi 执行器/工具网关，压缩代理只是候选替代点；不能在同一请求上同时启用两套自动压缩，也不能把默认扩展的环境探测视为已完成凭据适配。

## 可复现的真实包实验

运行：

```powershell
node scripts/billion-context-local-audit.mjs
# 可显式传入已解包的固定0.1.188目录，脚本会核验版本
node scripts/billion-context-local-audit.mjs C:\path\to\billion-context-0.1.188\package
```

脚本不安装、不构建。只有合成 PM 历史和 `SYNTHETIC_ONLY` 假凭据。启动子进程仅继承系统必需环境，HOME/XDG/TEMP/会话目录全部隔离，关闭自更新、advisory、release-notes、MITM及环境代理；预置新鲜的合成 registry cache，Node 网络守卫拒绝非 loopback 连接。没有观察到外网连接尝试。每次输出独立证据目录、阶段日志及60秒总看门狗。

固定模型夹具的摘要、reasoning 和 usage 是确定字符串/数值，**只用于协议和状态机验收，不能证明模型语义、真实 token、费用或缓存收益**。UTF-8 请求 JSON 的大小是实际收到的字节数。

| 检查 | 实测结果 | 结论限制 |
| --- | --- | --- |
| 触发和正式压缩 | 合成 usage 与75%阈值触发实际 ACTIVE nudge；正式 compress 创建 b1 | 强制机制试验，不是对供应商窗口的测量 |
| 请求体积 | B 自身相同 nudge 状态下，折叠4条历史前后 72,456 → 63,912 bytes，约12% | **不是 Pi vs B 对照**。也不是token/费用；初次冷请求无nudge，与折叠后相比甚至会被提示开销抵消 |
| 原文找回 | summary故意省略第二次修订哨兵；实际后续请求不再带该哨兵；search_context找到block，full/toFile导出含4条原始全文，逐条完整字符串核对 | 证明可取回被省略原文，不证明模型能主动选对检索或完成修订 |
| 连续折叠 | 再执行3次真实compress和受控toFile恢复，核对每个范围原始全文 | 四个不同历史范围，不是多层T2/T3反复重摘要或长期千轮压力验收 |
| 原生工具/思考 | nonstream reasoning_content保持；工具call ID、名称、完整参数、对应tool result各一份。SSE思考字段和分片JSON参数拼接完整，finish_reason正确 | 只测openai-completions合成协议，未测签名/opaque reasoning、并行多tool、其他协议和供应商 |
| 取消 | AbortController取消等待中的请求，上游response连接关闭 | 尚未测工具已产生外部副作用但回执丢失的unknown结果恢复 |
| 断连及超时 | 默认上游断连发3次**模型HTTP请求**后502；公开config `network.replayRetryMax:1`实测只发1次。`network.upstreamTimeoutMs:200`约216–217ms后502 | 不是业务工具重复执行证据；不能设0来关闭，0会落回默认3。可设1统一交给Pi重试，仍须宿主总预算验收 |
| 强杀与重启 | Windows终止子进程后重开、重绑同会话，原始16条历史保持；**另行断言4个compression blocks与重启前完全一致** | 未测压缩落盘瞬间崩溃、截断状态文件或应用级恢复 |
| 隔离 | A/B会话合成哨兵没有逻辑串话；然而同一loopback客户端知道A的conversationId即可查询A | 上游loopback/Origin门不是Slash项目授权。需要私有gateway或分项目进程/状态目录，不能裸露共享管理API |

完成版本的三次独立运行（Qb16yc/M276Uy/ttnbwE）均exit0，总机制耗时6.84/6.96/6.99秒，每次18个合成上游请求。随后加强逐条全文断言的YxYFbq通过；主代理独立复核BG2Brf也exit0。复核目录为 `%TEMP%/slash-billion-local-BG2Brf/evidence.json`。精选机器回执保存在 [本机证据](evidence/billion-context-local-2026-10-08.json)。全部是本机协议试验，不是整任务性能基准。

## 还原方式与稳定性缺口

本次显式使用 `{blockId,full:true,toFile:<isolated allowed path>}`，包确实把全文写到指定路径，宿主实际读回。未来接线必须由宿主生成导出路径并校验所在目录，不能透传模型任意 `toFile`，也不能让全局检索读取其他项目状态。

固定发布物 `src/decompress-shared.ts` 的whole-block实现，在省略toFile时对 `body.length > 10000` 写OS临时文件并返回回读指针；较小正文直接返回inline。该长正文分支没有读取 `args.inline`，不能因别处提示写了 `inline:true` 就承诺能强制大段inline。本轮没有依赖默认还原路径；受控回读与Slash来源权限还未产品接线。

实际故障检查是积极证据，但尚未满足默认替换的全部硬门：应用退出/项目切换/授权撤销、工具副作用unknown、代理半流崩溃、状态损坏、全部模型协议和签名思考，以及退出B后从完整Pi历史继续A均未完成。代理失败时不得在有partial或已发工具的请求中静默重发；回滚应在明确终态后的新请求边界进行，独立保留原始Pi日志、草稿版本和操作账本。

官方 [#2362](https://github.com/ranxianglei/billion-context/issues/2362) 报告0.1.186/187的Responses/DSH相邻压缩悬空refs问题；不能写成已在本轮openai-completions/Pi0.1.188复现。官方 [#2402](https://github.com/ranxianglei/billion-context/pull/2402) 修复双驻留代理共享目录时旧内存不收敛的问题。本轮固定0.1.188源码中的 `persist.ts guardedBuild()` 仍只返回较新disk payload而不刷新live session，且未找到该PR的 `convergeToDisk` / `warnOnNewPeers`；不能以PR已合并推定这个固定发布物已经包含修复。可由宿主一状态目录单实例避免该条件，本轮未启动共享状态双writer。

许可也不能只记录“MIT”：该固定发布物LICENSE附产品可见署名条款，采用时需在文档/关于等合适位置注明 billion-context 与适用的 acp-kernel并提供链接。依据 [固定构建LICENSE](https://github.com/ranxianglei/billion-context/blob/62598940/LICENSE)。

## 下一步与决定

保留原生是当前证据下的决定，不是拒绝复用。billion-context对“摘要省掉的细节可以检索并取回”有明确机制优势，值得进入 [同材料极小PM A/B](billion-context-comparison-2026-10-08.md)；素材已备于 `tests/fixtures/context-pm-material.json`，expected仅供外部断言，不能喂给模型。下一次应使用相同模型、原始history/窗口/思考/输出预算，逐项检查F/P修订和unknown、只改两行及来源版本，并累计全部摘要/检索/主任务调用的真实用量与耗时。官方5x与95–97%缓存数字只属于作者自述，本轮未验证、不作为Slash收益。

通俗解释：新方案已证实能把压缩前的原文找回来。但“找得到”不等于模型会在实际工作中找对、改对；换进去还需把权限、退出和故障恢复接好。现在直接换默认方案，证据还不够。
