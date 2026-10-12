# G2 MCP 真派发前重验：隔离候选记录

## 2026-10-11 根集成状态

原 QE12 进程自然收尾后，候选已通过原文件/patch SHA 和 `git apply --check`，进入根工程。实际字节哈希及 CRLF/LF 差异见 [integration.json](../.test-data/production-three-candidate-integration-20261011/integration.json)；规范化行尾后与封存候选逐字相同。原有 dirty 改动保留，未改 Service。`npm run check` 通过；九文件定向集成 67 项中 MCP/工作表/权限等 65 项通过，两项工具说明临时目录夹具失败保留在 [targeted.log](../.test-data/production-three-candidate-integration-20261011/targeted.log)，夹具自身修复后该文件 3/3 通过。此候选尚待统一全量/build 与新版本桌面验收，不将本地 transport 通过称为真实渠道发布通过。

对应流程：[Mermaid](production-mcp-dispatch-candidate-2026-10-11.mmd)。下文保留候选隔离阶段的原始证据与限制。

日期：2026-10-11。状态：隔离候选完成，未合并主工程。需求：G2 正式交付门禁、外部写入 unknown 不重试；复用现有 Pi MCP 与 SDK transport，不增加依赖、不扩展多文件发布。

## 副本与所有权

唯一副本：`E:/code/slash/.test-data/mcp-dispatch-isolated-3635abf9a8e74a82af4920a2fefea2e9`，仅 recovery 子代理写入。主代理可只读审查；本批不复制回根源码。

副本复制 main/shared、必要 package/tsconfig、定向测试与既有 knowledge-web/lib 类型依赖。node_modules 仅为指向根依赖目录的 junction，使用期间未安装或修改依赖。tsconfig 的 outDir 为副本内 dist，类型检查使用 --noEmit；新测试临时 profile/project 均位于副本内 test-data/dispatch-UUID，退出时清理。没有运行根全量、build、打包或真实模型。

候选改动清单：

| 文件 | 改动 |
| --- | --- |
| main/integrations.ts | mcpCall 新增可选 async beforeDispatch；stdio 复用 Pi 现有 async hook；HTTP 在 catalog 完成后、callTool 前 await；之后再核 MCP connection，最后标记已派发 |
| main/main.ts | 保留 executeMcp 早期交付检查，实际 mcpCall 传入同一 closure |
| tests/mcp-dispatch-guard.test.ts | 真实 Service/TaskDelivery 绑定、stdio 与 HTTP 本地传输竞态与计数 |
| tests/mcp-dispatch-guard-fixture.mjs | SDK stdio 本地工具服务，目录等待、实际调用 JSONL 与失联注入 |

main/service.ts 与共享契约均未改变。可选参数兼容现有三参数调用；不新建执行框架。patch 包含以上四文件，已对根当前文件运行只读 `git apply --check`，未应用。

## 证据与语义

新反例通过实际 Service.send 的注入 runtime 创建真实草稿、登记任务输出、产生外部提案、完成自动报告、写入人工核对并批准。仅 runtime 是离线注入，不调用付费模型；传输使用真实 SDK stdio 子进程或 loopback HTTP 服务，服务端记录收到的 tools/call。

stdio/HTTP 各五个场景：

| catalog 等待期间或派发边界 | 服务端调用数 | 结果 |
| --- | ---: | --- |
| 修改真实 Change.content 成果 | 0 | failed，未发送 |
| 删除该提案真实持久人工核对记录 | 0 | failed，未发送 |
| 当前绑定全部有效 | 1 | succeeded，收到的正文等于成果 |
| 服务端记录调用后失联 | 1 | outcome_unknown，不重试 |
| async 交付 guard 后停用连接 | 0 | failed，连接再核拒绝 |

删除核对记录是模拟持久证据缺失/撤回的故障注入，不代表实现了用户撤回入口。此批以实际成果修改为主要真实竞态证明。有效性检查失败发生在 dispatched/invoked 标记前；服务端已收到后失联保留 unknown，不能把它算作未执行。

新专项共 13/13 通过，包含上述十例、既有回执分类两例、main 接线静态断言一例，65363.4799 ms。静态 main 断言与 noEmit 类型检查仅证明源码接线，不能记作 Electron 桌面通过。

必要既有 MCP 回归 4/4 通过，4667.6471 ms：旧 schema/stdio 兼容、匿名 HTTP 第二页工具、写后断线单次发送、真实 HTTP 401/403 不刷新或重放，以及 Pi SDK2 固定目录/并发隔离。目录测试包含旧三参数 mcpCall，证明可选 closure 不破坏普通调用。

命令均在副本 cwd 执行：

```powershell
node --import tsx --test tests/mcp-dispatch-guard.test.ts tests/integrations.test.ts
node --import tsx --test --test-name-pattern '旧连接 schema|匿名 HTTP|真实 SDK HTTP|fixed six' tests/mcp-connections.test.ts tests/pi-mcp-runtime.test.ts
node node_modules/typescript/bin/tsc -p tsconfig.node.json --noEmit
```

日志：副本 `dispatch-guard-tests.log`、`existing-mcp-regression.log`、`dispatch-guard-typecheck.log`（成功无输出）。首轮类型检查因副本缺现有 knowledge-web/lib 传递类型依赖失败，补复制后通过；不是产品源码修复。

## 哈希与交付

原始记录为副本 original-hashes.json，最终完整清单为 final-hashes.json。结束时根 main/integrations.ts、main/main.ts、main/service.ts 的 SHA256 均等于 original，证明本批未改这三项根文件。

| 文件 | 原始 SHA256 | 候选 SHA256 |
| --- | --- | --- |
| main/integrations.ts | 1327383BC31C949C158C64D8D9358F0183570A30AFD0E48C1D39D1348D820164 | 994E9397B12E1F28E24FF6D70198DB884821C48C7258F5C33807A312236D4DEF |
| main/main.ts | C76288A8BADFCB78FD1753B3DA585C52CABE3BE6FCFF3C53D194887EC3D1EBD3 | 6EA2F3D9EFAAE8DD3F5464A0D97C5F1A6FE17C507FA332FDD0A73843D506781D |
| main/service.ts（未改） | 2A2BDD178C89AD544073B53E059C1B2E7B1148705D16D350CAAC027B0811E614 | 同原始 |

最终 patch：副本 `mcp-dispatch-candidate.patch`，SHA256 `591F547FE79C377F9D0029229638328138EC9176948DAD2D959F4B024B10E60E`。新增测试、夹具和两个日志哈希详见 final-hashes.json。

## 未覆盖范围

候选尚未进入根工程，尚未对这份候选做真实 Electron 审批界面验收。传输目标是本地真实测试服务，未验证飞书/钉钉/实际站点发布；HTTP 认证夹具不代表真实账号授权。此批仍是现有单个文本参数成果绑定，不支持默认 HTML 项目多文件静态构建包发布；多文件最小设计保留在 production-multifile-delivery-design-2026-10-11.md，另开版本窗口实现。

通俗说明：等待连接时，文件可能已被修改。候选把最后检查移到真正发送之前；检查不通过就没有发送。已经发出却收不到结果时，会保留“结果未知”，不会再次发布。
