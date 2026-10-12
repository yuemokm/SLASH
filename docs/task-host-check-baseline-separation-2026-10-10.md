# 宿主检查与冻结回归独立执行

日期：2026-10-10。关联当前原型修改交付目标、任务冻结基线和 F15 质量/版本保护。源于本轮真实 QE12 续作发现的自动检查缺口；本文本机修复没有再次调用云模型。

`Service.registerTaskChange` 为移动 HTML 固定登记页面运行、桌面控件、移动控件共 3 项宿主检查。任务修改前还会冻结用户已确认的 9 项原行为。原 `checkTaskCriterion → PrototypeAcceptanceDomain.runCases` 自动把 required9 加到 host3，12 项违反既有每批 10 项上限；`TaskAcceptanceDomain.validate` 随后本来已独立执行完整 baseline9。此问题不是实际丢失或失败的原行为，而是宿主检查重复合批导致未验证，不能据此降低原 9 项标准。

最小修复：

- `main/task-prototype-host.ts` 集中生成原固定宿主标准，`registerTaskChange` 复用；标准、视口和断言保持原值。
- `Service.checkTaskCriterion` 仅在 criterion 与宿主标准完整一致、请求/输出真实绑定、任务存在同一目标的 `user_confirmed` 冻结基线时选择内部 `runTaskHostCases`。不能只靠 host ID 前缀取得该通路。
- `shared/prototype-acceptance.ts` 新增内部可执行 proof schema；`runTaskHostCases` 再核对当前 required 仍已确认、目标、specId/revision/hash/完整 cases 均与任务冻结证明一致。该 proof 与方法均不接入 IPC/模型 schema；普通 `runCases` 没有绕过选项，继续自动并入已确认 required 用例。
- 独立通路复用原快照、来源、runner、取消、授权、草稿 owner、内容 hash、依赖及完成后版本核验。只拆宿主批次，不拆或删除冻结回归。`TaskAcceptanceDomain.validate` 原来的独立 regression 循环无需修改，完整 9 项继续执行并参与任务结果。
- 新报告 origin `host_task_check` 沿现有 JSON 存储，不加数据库列或迁移。3 项的当前观察可按 reportId 被任务证据核验和重开读取，但报告 gate 不放行，也不进入正式规格的 latestReport。它不能冒充完整 required9 通过；正式回归/交付门禁仍使用完整范围的报告。旧 origin/未声明 origin 的历史读取行为保持。

正常路径执行两批 3 与 9，分别保存其断言、截图与版本；冻结9失败时任务仍失败。缺失、修改或不再当前确认的 proof 不允许独立执行。普通新增模型用例与真实冻结基线合计超过10时，仍按原上限拒绝，未扩大全局预算；多个真实冻结范围超预算亦未被本次修改自动放宽。

## 浏览器检查器升级保护

本轮浏览器 v6 修正 closed-details 内容的可见性。原 `version()` 仅核对规格、hash 和授权，无法阻止 v5 的错误“可见”通过记录继续当作当前 v6 检查。

生产 `main/main.ts` 在注入 `runPrototypeAcceptance` 时一并注入同模块 `PROTOTYPE_BROWSER_VERSION`；`ServiceBackendHooks.expectedPrototypeRunnerVersion` 透传为 Domain `expectedRunnerVersion`。只在宿主明确声明期望版本时核对：旧证据 runnerVersion 不一致标 stale，提示重新检查；不可用状态不降为 stale。Task 的 `refreshEvidence` 复用此检查，正式 required 交付/导出保持阻断。before-write 不再把陈旧非必检报告继承为 previous_verified；用户已确认的原9仍完整冻结，不因观察陈旧删除。

旧存储观察、截图、通过状态和原版本字段保留，读取不自动重跑浏览器。新版本真实重验后才能产生当前证据。未声明 expected 的模拟/自定义 runner 保持原行为，不冒充正式 v6。此入口只标识宿主检查器版本，不证明业务含义正确。

## 检查与限制

- `npx tsx --test tests/task-host-baseline-service.test.ts`：6/6。真实 Service、Store、Files、草稿与证据链；runner 为明确的流程模拟，不是浏览器视觉验收。覆盖3+9完整独立执行、伪造 host 定义/IPC 选项拒绝、partial gate/latest 隔离、冻结9失败、关 Store 重开不重放、proof/hash/cases错误、取消、撤权、运行中内容变化、v5陈旧与v6恢复、before-write和交付门禁；生产 main 接线有只读源码检查，并配合主进程类型检查，不冒充启动应用验证。
- 在新增版本入口前，`npx tsx --test tests/task-host-baseline-service.test.ts tests/task-regression-service.test.ts tests/prototype-acceptance-draft.test.ts tests/task-acceptance.test.ts tests/prototype-tools-runtime.test.ts`：51/51。覆盖原冻结范围冲突/上限、来源及权限撤销、合法续作、有限修复、实际 Pi 调用与证据持久化。版本入口新增用例另外通过；没有把两次不同阶段计数重复合成一套全量数字。
- `npm run check`：通过。源码交由主代理统一 build；本代理没有 build、打包或再次发云。

## 正式零云 Service 与浏览器验收

主代理统一构建后执行：

```powershell
node .test-data/qe12-host-service-browser-20261010/fixture.mjs --run-local --case-dir .test-data/qe12-host-service-browser-b5db9464-549f-4a1f-a688-d56551f56e12
```

实际回执：[report.json](../.test-data/qe12-host-service-browser-b5db9464-549f-4a1f-a688-d56551f56e12/report.json) 为 `passed_real_service_browser`；[launcher.json](../.test-data/qe12-host-service-browser-b5db9464-549f-4a1f-a688-d56551f56e12/launcher.json) 为 exit 0、未超时。全新无模型、无凭据 profile 与临时 workspace 仅使用历史 QE12 前后稿和原冻结9项；正式 Service 调用 dist 实际 `runPrototypeAcceptance`，期望与实际 runner 均为 `electron-snapshot-cdp-v6`。云调用0次、未启动生产 UI，与上文模拟 runner 测试分开记录。

| 实际批次 | 用例/步骤 | 结果 | 浏览器耗时 |
| --- | --- | --- | --- |
| 宿主页面及桌面/移动控件 | 3项/4步 | passed，独立持久化 | 1.441秒 |
| 原冻结回归 | 9项/88步 | passed，完整保留并独立持久化 | 38.120秒 |

18项流程保护检查通过，包括 partial 报告不放行、完整报告为正式 latest、原 saved 规格未替换且缺 saved 报告仍阻断、普通合批超10仍拒绝、错误版本不可写、外部基稿变化使证据失效及恢复后 current、原文件保持前稿、重开保留任务及两份报告且不重放浏览器。`protectedInputsUnchanged=true`，收尾 `activeBrowserCount=0`。

任务结果严格保留机器回执：`automaticStatus=passed`、`versionState=current`、render/regression 均 passed；总 `status=unverified`。这次零云验收没有执行模型视觉审查，不能当作完整视觉、业务语义或用户确认通过。它证明实际浏览器已按两批执行原标准，且版本、持久化与交付门禁没有因拆批放宽；已执行证据保持原样。

通俗解释：原来的3项页面检查和9项旧功能检查被重复塞进一个只能容纳10项的批次。现在按原标准分两批检查，旧功能一项也没少；只过页面检查仍不能交付。浏览器检查规则升级后，旧检查也会明确提示重验，不把旧结果直接当作新规则通过。
