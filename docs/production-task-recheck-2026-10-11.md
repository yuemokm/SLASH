# G2 任务结束后的自动重检

状态：实现、定向验收、check/全量1154项/build及真实HTML桌面入口验收通过；真实模型业务质量另验。关联生产方案G2及PF02/PF09/PF11。流程源文件：`production-task-recheck-2026-10-11.mmd`。

## 问题与行为

旧任务在浏览器补验后没有同合同重检入口；保存草稿会改变合同身份，不能代替重新检查。首份报告产生前崩溃的任务也需要检查保留下来的成果。

质量面板增加“重新运行自动检查”。它复用宿主现有检查器，检查现有任务和当前版本，不重新调用模型、不生成或修改用户成果，不自动填写业务或视觉核对结论。

请求为 `taskAcceptanceRecheck {runId, expectedContractHash, expectedReportId}`。`expectedReportId` 必填，允许null；null明确表示用户看到的可信合同目前没有报告。无报告不等于无合同，不允许因此重新构造历史合同。

## 边界

- 只允许已经结束的Build任务；活动任务、正在保存成果或重复重检须等待。切换项目、合同/报告竞争更新和权限变化拒绝旧请求。
- 核对实际成果、依赖和来源版本。检查器或旧检查证据过期可重新取证；成果和来源内容变化不能借重检静默更新合同。
- 浏览器只执行冻结快照中的检查，网络限于该快照，拒绝外部请求、下载和权限。写入限于Slash报告/截图。
- 未知操作可保留并获取只读检查证据；不重放操作、不改recovery事实，正式交付仍受原未决操作屏障限制。
- 新报告不自动继承旧报告的人工核对。界面拒绝跨项目、跨Run及同Run新报告出现后的迟到响应。

## 实现与证据

| 项目 | 位置与验收 |
| --- | --- |
| 可执行契约 | `shared/types.ts` 的taskAcceptanceRecheckSchema |
| 宿主入口 | `main/main.ts` 路由、`main/service.ts` 的recheckTaskAcceptance；复用checkTaskAcceptance |
| 用户入口 | `src/TaskAcceptanceRecheck.tsx`、`src/TaskAcceptanceStatus.tsx` |
| UI/IPC | `tests/task-acceptance-recheck-ui.test.ts`；最新2/2、7个交互场景，日志`.test-data/production-task-recheck-ui-20261011-final.log` |
| Service边界 | `tests/task-acceptance-recheck-service.test.ts`；重检12项与交付7项合跑19/19通过，18474.9671ms；日志`.test-data/production-task-acceptance-recheck-service-20261011.log`。包含首报null、报告竞态、过期检查证据可重检与实际版本变化拒绝 |
| 真实桌面 | `scripts/production-g2-html-oauth-electron.mts`；attempt2合计6/6通过，真实UI重检保持同合同、逐项核对后单HTML stdio派发一次、版本变化拒绝；证据`.test-data/production-g2-html-oauth-4f1b91e2-365a-4111-85f7-ab84216ce74c/result.json`。合成业务，由Agent审阅，未真实模型/云发布/真人验收。attempt1脚本误读中间报告失败保留 |

通俗说明：任务停下后，可以重新检查已有成果；检查更新不代表自动批准发布，也不会把结果不明的旧操作再做一次。
