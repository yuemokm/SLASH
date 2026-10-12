# G2 多文件原型真实浏览器验收与导航等待隔离候选

2026-10-11。全部写入本唯一隔离目录。根 `main/shared/src/scripts/tests/public/dist` 与依赖没有修改、安装或重建。上游多文件与增量候选只读；未调用真实模型、正式 IPC 发布或外部发布服务。

## 实现与原因

复用 `PrototypeAcceptanceDomain.save/start/get/screenshot/snapshotForTask`、实际 `runPrototypeAcceptance` 和候选 `immutablePrototypeStaticBytes`，沿用现有严格步骤 schema，未添加测试专用产品断言。真实来源、pending HTML 草稿与五文件 `index.html/style.css/app.js/pixel.png/other.html` 都在隔离项目中。CSS computed marker、PNG load/naturalWidth+naturalHeight=1 转为业务反馈文本；实际外部 JS 用 `isTrusted` 核验输入和确认按钮。PRD 非网页附件被排除，独立第二页仍在父目录网页边界内。

原 v6 两轮真实导航失败。`diagnostic/electron.log` 证明原生 mouseReleased 已返回，旧文档 paint 开始后 4ms 导航开始，19ms 后新页加载完成，但旧 paint promise 不再完成并在原 3 秒预算超时。

唯一产品改动候选是 `main/prototype-browser.ts`：输入前观察主文档导航，竞速现有 paint 与主导航开始；新主文档加载后再等待新 paint。同页锚点及子 frame 不等待主文档 load。保留原 3 秒步骤、全局预算、取消和安全拦截；主 load/provisional 错误不能成为成功。真实反例还发现初版仅 action finally 会遗留监听；最终加 destroyed settle/dispose，销毁后移除所有输入导航监听。版本由 v6 升 v7，使旧检查器证据不能冒充新观察。

官方语义依据：[Electron webContents navigation events](https://www.electronjs.org/docs/latest/api/web-contents/#navigation-events)；本机已安装 Electron 44.0.0 类型签名核对 details.isMainFrame/isSameDocument 及 did-frame-finish-load/did-fail-load。没有替换执行底座或新通用 Agent 能力。

## 通过的证据

- `candidate-final/report.json`：4 用例、44 步；1440×900 与 390×844，可信输入/点击、实际 CSS/JS/PNG、相对第二页导航均通过，4 张真实截图。报告 specHash/入口 hash/当前性核对通过。
- `candidate-final/manifest-file-equality.json`：浏览器 evidence.manifest 的每个 path/hash/bytes 与不可变 delivery manifest 的 path/sha256/bytes 等值；没有把不同格式总 hash 直接等同。
- `candidate-final/zip-byte-equality.json`：同快照 ZIP 的五文件逐项解包，原字节、hash、长度完全相等；`accepted-project.zip` 可供审查。
- 三个缺 CSS/JS/PNG 反例由真实浏览器返回资源阻断 unknown，均未通过；自包含单 HTML 旧 inline 点击路径 passed，仅记 single_file_text/not_asserted。
- `navigation-regression-v3/report.json`：9 真实场景全部满足预期；前 5 项普通可信按钮、hash、手机/桌面来回、Enter 跨页实际 passed；后 4 项外部导航拒绝、子 frame CSP 拒绝、主导航取消、主导航超时实际 unknown，正是正确的负向结果。取消保留 CANCELLED，超时保留 STEP_TIMEOUT，9 场景四项导航监听全部归零，浏览器实例归零。
- `observer-contract.log`：6 协议单测通过，覆盖主/子/same-document 区分、main load/provisional 失败、destroyed settle 与幂等清理。它们是模拟事件协议测试，不当作真实页面验收。
- `navigation-typecheck.log`：候选浏览器及其只读原依赖类型检查 exit0；`patch-apply-check.log`：根 `git apply --check` exit0，仅检查、未应用。

上面结果不合并成虚构总测试数。`candidate-manifest.json` 记录最终源码、补丁及关键证据哈希。

## 历史失败与边界

原启动失败、两轮原 v6 导航失败、v7 首版监听泄漏和两个测试预期过严的失败均保留在相应独立目录和日志，未倒填通过。第一次 TS CLI 因工程存在 tsconfig 要求 `--ignoreConfig`，之后实际执行明确 exit0。

人工事项：本 Agent 目视手机主页和手机第二页，文本、输入及按钮在像素范围内；父代理已目视最终四图，1440/390 主页与第二页无明显内容/控件裁切，输入反馈可见。白色像素 PNG 只证明加载解码，没有证明图形质量。父代理认可进入集成候选，正式根集成仍待复验。没有真实用户签字、人审持久化、整体设计感或业务正确性批准。没有 actual IPC→stdio 多文件发布、真实 provider/schema/线上资源与路由验证、React/Vite 受控构建或超过 100KB 上传证明。

直接需求关联：F10 原型运行、F15 同快照本地交付、F19 取消/超时；PF08/PF09/PF11、G2。原自动 report.requirements 的 F07/F12 为辅助历史标签，本交付以 candidate-manifest.requirementMapping 的直接映射为准，不代表需求收集或完整关联修改能力已经验收。代码位置、用例、边界及证据均封存在本隔离目录；正式集成由父代理决定。

通俗说明：这次确认了整套网页文件确实能在浏览器里运行，发送前核对的版本与导出的 ZIP 相同。还修了“网页已经跳过去，检查器却仍在等旧网页”的问题。网页真正上线和正式应用内发布，还需要后续单独验证。


## 根集成状态（2026-10-11 追加）

导航等待修复已核原文件hash并以封存字节合入根 `main/prototype-browser.ts`，实际hash `a22241c05faf388b366c9cb33acadfc5af6b59d52ac9b2ab75c93a2d2b6fb650`；只合导航等待，未合多文件Service候选。六项协议测试已移入默认回归 `tests/prototype-browser-navigation-observer.test.mjs`，仅把隔离文件路径替换成真实根源码相对路径。流程源为 [导航等待Mermaid](diagrams/prototype-browser-navigation-wait-2026-10-11.mmd)。根回执位于 `.test-data/production-navigation-root-integration-20261011/integration.json`，本版本完整check/test/build及真实桌面仍待统一执行；隔离旧失败全部保留。

根统一 `npm run check`、1269/1269 全量与 `npm run build` 已通过，未打包。当前 built main/preload 的正式 prototypeAcceptanceSave/Run/Get/Screenshot 四场景实际通过，桌面1440×900与手机390×844均覆盖可信输入、保存反馈、相对跨页往返和无横向溢出；本地 HTML/CSS/JS/PNG manifest 逐字节 hash 核对通过。报告 `41d0d0c4-207b-4512-9794-586f3977841a`，入口 SHA `d9a1eaecf5b2b66af817e894cb03c4aab23a71da3fa18888d71a7adf27d782cc`，[报告及四图](../.test-data/production-navigation-main-electron-d5202b6c-b818-4a58-82ab-c34a635ae379/result.json)。Agent及父代理实际目视合成页面，正文、输入和按钮无明显裁切覆盖；仅证明合成流程布局和导航，不代表真实业务或整体设计质量通过。无模型/发布/真人验收，实例已关闭，输入源码和runtime前后hash一致。
