# 原型浏览器分阶段耗时诊断

2026-10-11阶段预算修复：runner升为`electron-snapshot-cdp-v8`，隔离renderer加载与CDP启用的初始化上限为10秒，其余阶段及交互步骤仍3秒，整批60秒从原启动时间计算、不重置。兼容`PROTOTYPE_STEP_TIMEOUT`固定码，具体阶段以`timeoutPhase`区分；旧runner报告需重验。全量原失败报告`.test-data/prototype-visibility-electron-nFKE2V/report.json`记录初始化3014ms超时、12步全部未执行，不判交互失败或已证偶发。原样单独重放通过，仅支持单独运行成功，不证明资源争用根因。修复后真实Electron五个可见性场景及确定性生产计时器15项通过，组合33/33、check退出0；日志`.test-data/production-template-init-repair-20261011/targeted-{1,2}.log`，真实报告`.test-data/prototype-visibility-electron-xeUkF8/report.json`。该专项没有云调用、没有构建；其后当前根统一1334/1334及check/build退出0（production-word-ui-root-integration-20261011/unified-result.json），原visibility用例在全量中实际通过。下文预算描述保留为2026-10-08历史状态。

日期：2026-10-08。关联目标：真实原型质量验收、复杂任务耗时可解释性。

已有真实报告既出现“零步骤便超时”，也出现“步骤全部通过但截图取消”。旧报告没有阶段数据，无法由这些结果判断加载、视口、步骤还是截图阻塞。本次仅补宿主输出诊断，不修改断言、页面、云调用或验收预算。

## 输出与边界

`PrototypeCaseResult.diagnostics` 为可选字段，包含：

- `phaseTimings`：按执行顺序记录 `initialization`、`viewport`、`step`、`screenshot` 的 `elapsedMs`；只有 `step` 有从零起算的 `stepIndex`。
- `stoppedPhase`：检测到停止时关联的活动阶段，或刚结束的相关阶段。阶段外 setup 失败和最终撤权不编造阶段。
- `timeoutPhase`：仅实际 3 秒或总计时器在活动阶段触发时记录。外部取消、撤权、渲染器退出和断言不匹配不会产生此字段。
- `stopReason`：固定枚举；未列举的底层错误归一为 `PROTOTYPE_EXECUTION_UNAVAILABLE`，不写异常文本、页面文本或凭据。

耗时使用 `performance.now()` 单调时钟，在 `finally` 保存，因此取消或失败仍保留已测阶段。每例最多真实步骤数加 3 条；仅允许有限非负数字和安全枚举。总计时器在阶段外触发时可以保留停止原因，不虚构 `timeoutPhase`。

初始化包括既有 `loadURL` 与 CDP Runtime/Log 启用；视口包括既有设定、绘制等待与实测；截图包括截图前绘制、原生捕获、缩放与 PNG 转换。session/proxy/window 创建及清理不属于这些 bounded 阶段。阶段耗时之和不是完整任务耗时，也不包括后续报告落盘。

## 保持现有语义

原 `STEP_MS=3000` 和整批 `timeoutMs=60000` 不变；不启动新计时器、不延长或重置预算。未开始步骤仍为 `not_run`；截图失败保留之前 passed/failed 的步骤。断言失败后若截图实际超时，case 仍遵循原有 unknown 结果，诊断停止原因为截图超时，失败断言观察保留。第一个终止原因优先，避免后续取消或计时器回调覆盖已确定的终止原因。

`main/prototype-acceptance.ts` 对新 runner 诊断做输出校验，现有 case spread 将数据传入正式 evidence 与历史报告。缺少诊断字段的历史 JSON 和旧 runner 输出继续可读。输入 schema、规格内容与 specHash 计算未增加字段。

## 实现位置

- `shared/prototype-acceptance.ts`：可选结果类型与输出 schema。
- `main/prototype-browser-diagnostics.ts`：独立记录器，不能改变 runner 结果或预算。
- `main/prototype-browser.ts`：正式 bounded 路径和停止路径接入。
- `main/prototype-acceptance.ts`：输出校验和正式报告传播。
- `tests/prototype-browser-diagnostics-fixture.mjs`、`tests/prototype-browser-diagnostics.test.ts`、`tests/prototype-acceptance.test.ts`：离线正式 runner 路径、schema 和 domain 回归。

流程见 [Mermaid 源文件](prototype-browser-diagnostics-2026-10-08.mmd)。

## 本机验证与限制

`node --import tsx --test tests/prototype-acceptance.test.ts tests/prototype-browser-diagnostics.test.ts`：22/22 通过，13.117 秒（当时内部 runner fixture 10 项）。最终补充撤权、未开始的后续用例、清理后阶段外撤权后，`node --import tsx --test tests/prototype-browser-diagnostics.test.ts`：4/4 通过，内部 runner fixture 12/12 通过，0.879 秒。

fixture 用 Node module mock 提供 Electron API，直接导入正式 `runPrototypeAcceptance` 并触发其原有计时器回调。覆盖四阶段 3 秒超时、总超时、截图取消、撤权、setup 失败、成功、断言失败后截图超时、截图中新出现的运行错误；检查窗口计数清零。domain 测试覆盖保存/重读、旧 JSON 兼容、hash 不变和无效诊断拒绝。

以上是本机逻辑验证，不代表真实 Electron 性能、真实页面通过或云任务已自然完成。本子任务未 build、未启动用户应用、未发送云请求；统一类型检查/构建和集成状态由主代理记录。旧未知报告保持原样，不追补伪造阶段数据。

通俗解释：以后检查卡住时，报告能说明卡在“打开页面、调整窗口、操作页面、保存截图”的哪一步；取消不会被误写为超时。这次增加的是诊断能力，不代表原页面的问题已经全部修好。
