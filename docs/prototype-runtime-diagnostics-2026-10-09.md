# 原型运行异常：安全定位与真实 SFA 对照

2026-10-09，关联 PF06/PF08/PF09、F02/F12。此次改动帮助主 Agent 看到原型发生异常的操作及代码位置；不等于已完成用户原型的自动修复或视觉改版。

## 真实根因与保护

在既有 `.test-data/actual-sfa-layout-20261009/fixed.html` 固定副本上，未修改的正式受限 Electron v4 runner 重现访中和外勤两处 `PROTOTYPE_RUNTIME_EXCEPTION`。独立只读 CDP 观察器确认二者都是 `HierarchyRequestError`：Vue 多根模板的 `$el` 是 `nodeType=3` 的文本节点，`toast` 调用 `this.$el.appendChild` 无法添加子节点；实际 `#app` 容器是 `nodeType=1`。

同一副本仅在隔离诊断中把该调用改为 `document.querySelector('#app').appendChild`，两条完整用例 8/5 步分别通过。证据：`.test-data/actual-sfa-runtime-diagnosis-20261009/report-final.json`。报告中的 `QE12/index.html:697:281` 是预编译固定副本的位置；用户原稿同一业务方法位于第 319 行。第一次误用 `#app .phone` 选择器产生 null 的失败保留在 `report.json`，不作为根因或通过依据。

原稿 `E:/code/slash test/成果/成果/原型/异动端SFA主要界面.html` 哈希仍为 `e6400601f02bbc100bcc86f30c36a59c518c0f216c319e88b05e7ffe20847c94`。此次没有写用户原稿、调用云模型、修改 dist、放宽 CSP、安装依赖或构建打包；隔离手工稿不当作 Slash 已自动改善原型的交付。

## 产品改动与安全契约

- `shared/prototype-acceptance.ts`：输出 `diagnostics.runtimeErrors` 为可选字段，每用例最多 3 项；每项只有固定错误类别、错误类型、可选白名单 DOM 方法、实际阶段/步骤及最多 3 个快照相对路径的 1-based 行列。
- `main/prototype-browser-diagnostics.ts`：只识别少数标准浏览器错误形态。最多查看错误描述前 8 KiB/前 7 行并马上丢弃原文；未知文案归为 `generic_runtime`。源位置必须属于当前执行随机 origin 内的已登记快照，拒绝 query/hash、用户密码、外来 URL、未登记路径和非法坐标。函数名、错误正文、console 参数及原始堆栈不持久化或发送给 Agent。
- `main/prototype-browser.ts`：Vue 已捕获再 console.error 的异常与未捕获异常均能进入诊断。动作中发生运行异常时该步骤保持 `unknown`，后续为 `not_run`；首次异常实际 `phase/stepIndex` 不会被随后截图改成截图阶段。真正的后续取消、撤权、超时等仍有自身终止原因，首次运行错误定位保留。
- `main/prototype-acceptance.ts`：正式 domain 再校验结构、实际用例步数及快照位置范围，回执与 `get_prototype_acceptance` 保存/返回相同安全字段。runner 输出版本升级为 `electron-snapshot-cdp-v5` 并回传到正式报告；旧输出无此字段仍兼容。

示例安全错误：

```json
{"category":"dom_node_operation_unsupported","errorType":"HierarchyRequestError","domMethod":"appendChild","phase":"step","stepIndex":5,"locations":[{"path":"QE12/index.html","line":697,"column":281}]}
```

## 验收与限制

真实 Electron 源码加载专项 `node tests/prototype-browser-runtime-electron-fixture.mjs --sfa` 的 5 项检查通过。三个合成案例分别验证未捕获 DOM 异常、捕获后 console.error 及隐私字符串过滤、无异常旧行为；两项真实 SFA 复验保留 `unknown`，具体失败操作分别是第 6/3 步（0-based `stepIndex=5/2`），得到 `appendChild` 及固定副本 697:281 位置。该通过仅表示执行器正确暴露失败，不表示 SFA 用例已通过。

证据：`.test-data/prototype-runtime-electron-0UB1FI/report.json`，5 检查通过、`activeBrowserCount=0`、`cloudCalls=0`、`originalProtected=true`。源码以现有 tsx 加载，无 dist/build 写入；这不是用户当前已打开应用的运行版本。

2026-10-10 编译版复验：主代理完成统一构建后，`node tests/prototype-browser-runtime-electron-fixture.mjs --sfa --dist` 直接读取现有 `dist/main/prototype-browser.js`，5/5 检查通过。证据 `.test-data/prototype-runtime-electron-O9XR7C/report.json` 明确 `sourceRunner=false`、`compiledRunner=true`、v5、窗口 0、原稿哈希未变。复验脚本没有再构建或打包。

`npx tsx --test tests/prototype-browser-diagnostics.test.ts tests/prototype-acceptance.test.ts tests/prototype-acceptance-draft.test.ts` 最终 45/45 通过（内含正式 runner mock fixture 的 14 项）；`npm run check` 通过。专项包含结构拒绝、隐私过滤、首次阶段保留、取消/超时优先级、旧报告兼容，以及正式 domain 持久化/`get` 返回相同定位和 v5 版本。原有无诊断历史保留；runner 版本更新不会自动把旧报告标为 stale，旧证据仍按文件、授权、范围版本规则核对。这次不扩大历史失效机制。

`taskRepairPrompt` 当前只对符合条件的 `failed` 项发起有限修正，`unknown` 不会凭此自动修复。新字段使实际 `get/run_prototype_acceptance` 报告可操作；它不是自动修复闭环已完成的证据。

通俗说：以前程序只告诉 Agent“页面运行出错”，容易反复猜。这次能安全地告诉它“第几步、哪行、哪类错误”；真正那份原型仍需要走正式修改和完整复验。

流程源：[prototype-runtime-diagnostics.mmd](diagrams/prototype-runtime-diagnostics.mmd)。
