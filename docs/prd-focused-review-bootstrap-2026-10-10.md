# PRD 聚焦审查夹具：启动故障与零云预检

2026-10-10。仅修测试夹具 `scripts/prd-focused-review-fixture.mjs`，没有修改产品源码、dist、用户配置或 PRD 原稿。对应业务目标为 PF08/PRD 跨表字段维度审查；本记录不代表云语义已验收。

后续文字观察窗口已依据历史152.376秒审查纠正为240秒/280秒，新增安全网络阶段证据；下方60秒为此前夹具版本，不是产品文字审查限制。最新依据与验收见[网络诊断记录](prd-review-network-diagnostics-2026-10-10.md)。

## 原失败与定位

主代理执行已准备 case `prd-focused-review-834c33bb-e5fd-4f54-a391-bc632aaec729` 后，100秒外层守卫退出1，只有 cloud/child 独占锁，无 `review-started.json` 或模型回执。原 `CHILD_WITHOUT_RECEIPT` 保留。原夹具完整副本保存在该 case 的 `fixture-version-original.mjs`，SHA256 `2a5a397aa2f0482bbca27f1a075352ed0e2df2cc72a0b770fe8fee5ff6b08a74`，对应原准备身份。

只加阶段观察的新零云 case `eae1c1bf-89c6-4da9-b7ad-e7b95594d517` 在4毫秒到达 `electron_ready` 后停住，未导入 Agent。安装版 Electron 44 的 `resources/default_app.asar/main.js` 中，默认启动器等待应用 ESM 入口 import 完成；原夹具顶层等待 child，而 child 等待 `app.whenReady()`，形成相互等待。修复为 Electron 分支启动异步任务并让 ESM 入口完成，Node 准备/包装器仍等待自身结果。

修后进一步发现 profile 设置必须早于 Electron 初始化：异步设置 profile 的两个预检在约4秒到达凭据检查，但解密失败；入口改为同步验证隔离目录并设置 `app.setName('slash')` 与 `userData`，随后异步导入业务模块和等待 ready。最终同一授权加密记录能正常解密，未替换或输出密钥。预检记录中的 `ReferenceError` 是新增阶段计时变量同名造成的暂时性死区，已改名，失败记录保留。

## 最终本机证据

最新准备及预检 case：[33d4fb34-c8b8-43f3-832d-3ed2a8dc6ed7](../.test-data/prd-focused-review-33d4fb34-c8b8-43f3-832d-3ed2a8dc6ed7/preflight-result.json)。准备使用当前源码和编译版构建器，inputHash `97e4edccae5efdce7aa0298c2d0e1e685e2e102630c66074b5724ba4aad20f6d` 保持，14个关键单元格完整。

真实 Electron 预检退出0：Runtime 就绪2217毫秒，全部前置准备2218毫秒。凭据可解密、输入身份有效、正式 `reviewContent` 方法存在。`outerReviewCalls=0`、`cloudModelCalls=0`，预检 fetch 被显式拒绝，未调用模型审查、连接测试或生成任务。详见 [阶段记录](../.test-data/prd-focused-review-33d4fb34-c8b8-43f3-832d-3ed2a8dc6ed7/preflight-stages.json)。`node --check` 与 `git diff --check` 通过，自有预检进程已退出。

该版主代理执行云审查时使用 `--run-cloud --case-dir`，设置60秒测试审查窗口、100秒自有进程守卫、零外层重试与独占锁。Pi 正式 `createRuntime.reviewContent` 内部 `maxRetries=1` 保持，实际提供方重试未知，不能宣称只有一次 HTTP 请求。该版夹具保存安全枚举启动阶段、耗时及失败代码；原始 stdout/stderr 只计字节，不保存正文。合法业务发现另由正式 schema 与回执哈希验证。

通俗说：第一次根本没进入审稿，测试程序自己在等启动；修好启动顺序后，已经确认能读到正确资料并准备好模型，真正业务结论仍由后续审查决定。
