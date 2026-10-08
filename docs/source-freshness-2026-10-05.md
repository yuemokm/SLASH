# 原始资料与提取文本的版本核对

状态：已交付 0.3.9 便携版。源码检查、全量 260 项测试、真实 XLSX 隔离回归、49 项打包桌面检查及最终 EXE 启动退出通过。真实云模型业务质量仍待验收。

## 解决的问题

PM 从字段 Excel 提取文本并生成 PRD 后，同事可能在外部更新原 Excel。此时提取文本没有变化，仅核对提取文本哈希会遗漏原始依据的变化。现有处理回执已经记录原件和副本，本轮把这条来源链用于业务规则核对。

## 产品行为

- 仅对有真实处理登记的输出核对来源链，不通过文件名或模型声明猜测出处。普通 Markdown 资料保持原流程。
- 区分提取文本、处理时副本与原始资料的版本。原件变化时提示重新读取和提取，旧规则及成果保留供比较。
- 原件暂时不可读、回执不完整、处理结果尚未应用分别给出明确状态，不能冒充完整有效。
- 已独立授权的文本仍可阅读；上游原件不可读不等于收回该文本权限。不得显示当前无权读取的原件内容或路径。
- 从已有工作问题回到会话重新读取、创建新副本并提取；不直接修改原件，不自动覆盖旧文本或成果。
- 哈希一致只证明本次检查到的版本关系，不证明业务规则正确、资料权威或原型交互已验证。

## 实现边界

复用 processing-copy、processing-result、ChangeSet 和当前项目的产品记录。新回执用可选字段补齐输出哈希与项目标识，兼容旧数据。检查按需执行，原件采用有上限的流式哈希；单次调用去重、有总量预算，遵守目录授权和项目切换守卫。不增加后台全盘扫描、独立资料管理中心或第二套 Agent 框架。

实现位置：`main/processing-provenance.ts` 提供共用核对器；`main/service.ts` 登记输出、建立按项目与规范化路径索引，并把核对结果加入规则查询；`main/delivery-gate.ts` 及 `main/main.ts` 让交付预检使用相同核对器。`shared/business-rules.ts` 的 `BusinessSourceCheck.provenance` 区分原件、副本和输出阶段；直接文本的读取权限与版本状态保持独立。`src/BusinessTrace.tsx` 仅追加单行结论、折叠详情和回会话动作。

正式应用以当前 ChangeSet 状态为准，不读取处理回执中原来固定的 pending 值。旧回执不补猜输出哈希。当前字节核对最多读取单文件 100 MB、单次总量 256 MB、64 份文件；每块 64 KB，并在异步读取前后核对授权和文件身份。预算不足显示未完整核对，不表示版本一致。

本轮核对一段已登记的“原件—副本—输出”关系；若该原件本身还是另一项登记输出，会明确提示仍有上游未核对。暂不递归证明多层转换的全部来源。提取前有意修改过的副本按处理时哈希核对，不宣称它与原件内容相同。

```mermaid
flowchart LR
  Original[只读原始资料] -->|登记版本| Copy[处理副本]
  Copy -->|处理时版本| Extract[提取文本草稿]
  Extract --> Changes[应用 ChangeSet]
  Changes --> Rule[规则引用文本位置]
  Rule --> Check[按需核对版本链]
  Original --> Check
  Copy --> Check
  Check --> Status[有效 / 变化 / 无法完整核对]
  Status --> Conversation[回会话重新读取和提取]
```

## 验收要求

| ID | 要求 | 验收证据 |
| --- | --- | --- |
| SF01 | 原件改变、文本不变时不能仍宣称来源链完整有效 | 隔离真实 XLSX 流程 + 契约测试 |
| SF02 | 副本或提取结果变化有独立提示，未应用结果不能冒充已保存 | 服务测试 |
| SF03 | 旧回执与直接文本兼容，不能猜测或伪造出处 | 兼容测试 |
| SF04 | 重启后来源关系可恢复，授权撤销或项目切换不泄露原件 | 持久化与权限测试 |
| SF05 | 大文件和重复引用受预算控制，读取只读 | 流式哈希及去重测试 |
| SF06 | 现有规则面板可理解地显示变化并回到会话 | Electron 桌面检查 |

真实资料测试只把 `slash test` 的资料复制到独立测试项目，修改测试拷贝，前后复核用户原件哈希；不对用户项目运行会写索引的初始化流程。实际结果如下。

## 已完成的源码与开发验收

- `npm run check`、`npm run build` 通过，日志为 `.test-data/source-freshness-check.log`、`source-freshness-build.log`。首轮类型检查发现 fs.stat 的重载返回类型带 undefined，已改用实际 Stats 类型；保留首轮失败日志。构建保留原有大于 500 kB 的前端包提示，未影响成功。
- 全量 `npm test` **260/260**，45.9 秒，日志 `.test-data/source-freshness-tests.log`。新增 `tests/processing-provenance.test.ts` 的 10 项覆盖来源身份、版本、权限、旧回执、未应用、预算、路径别名和交付一致性；定向合计 28/28。
- 真实资料最终回归 **14 项通过**：`scripts/pm-business-provenance-real-smoke.mjs`，证据 `.test-data/pm-business-provenance-real-MELjVE/report.json`。在最终源码上重新执行，修改隔离的「03 机会门店主数据」P2 后，原件阶段变更、旧提取文本和测试 PRD 仍一致、规则整体 stale；新 Store/Service 恢复后结论保持。
- 真实用户原件前后 SHA-256 均为 `995f8eb8534cfb88e73ba186062506625017e363aad09f1915cb3a0642366fe8`。脚本没有调用模型，PRD 明确为测试夹具。首轮成功报告 `pm-business-provenance-real-qXK3VC/report.json` 保留，不替代最终源码证据。
- 0.3.9 开发版来源专项 **8/8**：`.test-data/business-upstream-ui-development-1791158502543/result.json`；既有规则面板 **13/13**：`.test-data/business-rules-ui-development-1791158525917/result.json`。均为独立 profile、真实 Electron，页面错误 0。主代理另目视核对原件变化截图，来源变化结论为单行，详细版本信息默认折叠。

以上均不能证明真实云模型已完成业务成果生成。比赛场景及剩余业务验收见 [比赛演示与业务验收准备](competition-readiness.md)。

## 0.3.9 便携版交付

文件：`release/slash-0.3.9-portable.exe`，189,066,059 字节。SHA-256：`11b31e5179ac73b3ef6303395613d578c0ce1667f8e27bc93ddbc9691ecf0b22`。元数据在 `release/build-info.json`，旧版 EXE 保留。打包日志 `.test-data/pm-039-pack.log`，electron-builder 正常退出。

同一个 `release/build-0.3.9/win-unpacked/slash.exe` 完成以下 49 项，全部通过且页面错误为 0：

| 检查 | 数量 | 证据目录（.test-data 下，各含 result.json） |
| --- | ---: | --- |
| 新来源版本链 | 8 | business-upstream-ui-packaged-1791158683826 |
| 既有规则面板 | 13 | business-rules-ui-packaged-1791158704995 |
| 工作区、模式、目录及恢复 | 14 | workspace-ui-packaged-1791158757799 |
| Office 处理与原件保护 | 6 | office-processing-ui-packaged-1791158814514 |
| 模型容量与配置恢复 | 8 | model-limits-packaged-1791158850906 |

汇总为 `.test-data/pm-039-gui-summary.json`。检查前后 EXE / app.asar 的哈希不变，记录在 `pm-039-binaries-before.json` 与 `pm-039-binaries-after.json`。

最终便携 EXE 经 `scripts/portable-smoke.mjs` 直接启动，主窗口、IPC、独立夹具的加密模型配置恢复均通过，正常退出码 0。证据为 `.test-data/pm-039-portable/result.json`。该启动检查没有验证用户当前云模型连接，也没有读取用户密钥。
