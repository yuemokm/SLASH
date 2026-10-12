# 原型离线交付与运行错误反馈

日期：2026-10-09。关联 PF03/PF08/PF09/PF11、QE12。用户要求继续原型质量、任务可靠性等待完成项，并明确代码实现使用 GPT-6.1 Sol / High 子代理；主代理负责设计、审查、统一构建与验收。云知识库已退出产品范围。

## 已确认的问题

1. 正式 `slash-quality-4` 对用户实际 SFA 原稿返回 `valid:true / blocking:0`，尽管第7行从 `https://unpkg.com/vue@3/dist/vue.global.prod.js` 加载运行依赖。该原稿在正式离线浏览器中已被阻断。主代理本轮再次只读回放，证据 `.test-data/offline-delivery-20261009/before.json`；原文件 SHA256 仍为 `e6400601f02bbc100bcc86f30c36a59c518c0f216c319e88b05e7ffe20847c94`。
2. 宿主已经自动为每个成果添加必检静态项，但外部资源只记 warning，无法产生既有有限修正所需的 failed。另一方面，只读 `run_prototype_acceptance` 的 `outcome_unknown` 被全局未知副作用判断命中，即使另有静态失败也会阻止修稿。
3. HTML 本地导出在没有必检浏览器规格时直接复制或打包，未执行入口静态质量检查。需要复用既有质量检查与打包器，并保留用户显式关闭可选质量检查的语义，不能把“已跳过”描述为“已通过”。
4. 原型 runner 只保存 `PROTOTYPE_RUNTIME_EXCEPTION`，丢失错误位置；触发异常的点击仍可能显示 passed，首次出错阶段还可能被后续截图覆盖。

## SFA 实际交互诊断

对已有预编译隔离副本运行正式 dist runner，并附加只读 CDP 观察器，两个失败动作均得到 `HierarchyRequestError`：`appendChild` 的目标节点不支持该操作。Vue 实例 `$el` 实测为 `nodeType=3 / #text`，实际 `#app` 容器为元素。

隔离对照仅将 `this.$el.appendChild(t)` 改为 `document.querySelector('#app').appendChild(t)`，两例分别8/5步全部通过，错误为空，活跃浏览器0。证据 `.test-data/actual-sfa-runtime-diagnosis-20261009/report-final.json`。原稿、产品源码与当时 dist 未被该诊断改写。首次诊断误选 `#app .phone` 得到 null 的失败记录仍保留，不作为正式结论。

这证明两个交互报错的局部原因和修复方向，不证明 Slash 云模型已生成正确新版，更不证明整体布局、视觉或业务规则已经验收。

## 本轮实现契约

- 复用 `qualityCheckForArtifact`，明确的远程加载依赖按默认离线要求记阻断；普通跳转外链、本地资源、data资源不能按外网加载误报。注释及内联脚本中的标签字符串不能冒充实际HTML标签。
- 只读原型验收结果未知不冻结原有最多两轮修稿；真实外部写入及进程结果未知继续阻止重放。原型 unknown 仍为未验证，不能由此改为业务通过。
- 草稿创建、编辑和显式保存仍可保留有问题的成果；交付检查与写稿分开。默认 HTML 导出走静态检查，显式关闭时明确跳过；权限、版本核对和原件保护不能跳过。
- runner 仅记录有界的错误类别、白名单 DOM 操作、首次阶段/步骤以及属于冻结快照的相对文件和行列；不持久化任意控制台正文、参数、堆栈或外部URL。安全字段为现有诊断的可选增量，旧报告可读，无破坏性数据库迁移。
- 已触发页面异常的动作不能显示为通过；后续步骤保留未运行，整例仍为 unknown。超时、取消、撤权、沙箱与离线规则不放宽。

本轮属于现有静态检查、runner、修稿和导出链的定向修复，没有新增或替换通用 Agent 底座、打包器、检索引擎或新依赖。

## 验收记录

实现已集成：`main/quality.ts`（quality-5）、`main/service.ts`（精确未知副作用判断及导出入口快照）、`main/main.ts` / `main/artifacts.ts`（绑定实际写出字节）、`src/App.tsx`（已跳过/静态范围提示）；runner 契约、诊断、回传与详细证据见 [运行诊断](prototype-runtime-diagnostics-2026-10-09.md)。无新增依赖。

- 主代理 `npm run check`、`npm run build` 退出0；日志 `.test-data/prototype-reliability-{check,build}-20261009.log`，renderer `index-BOxB7XFc.js`。构建仍提示入口 chunk 大于500KB，未据此宣称启动性能已解决。
- 主代理 `node --import tsx --test` 合并执行 quality、artifacts、delivery-gate、task-regression-service、prototype-acceptance、prototype-browser-diagnostics、prototype-acceptance-draft、dev-renderer-readiness 共8个 `.test.ts`，**90/90通过**，日志 `.test-data/prototype-reliability-regression-20261009.tap`；`git diff --check` 通过。与子代理专项有重叠，不相加为独立覆盖数。
- Service回归实际验证只读浏览器unknown与CDN静态失败并存时，同任务第二轮可编辑同一pending；真实进程未知仍不修稿。模型及浏览器在此Service单测中为流程模拟，不能称云模型端到端完成。
- 导出覆盖默认拒绝、显式关闭的skipped、源版本冲突、撤权、ZIP实际入口核验与拒绝提交保留旧目标。入口静态通过不代表外置CSS、动态JS、业务或视觉通过。
- 实际SFA原稿保持原哈希，quality-5现在将第7行CDN记为blocking。原稿未替换，真实云生成、整体视觉和业务仍未验证；runner unknown没有被篡改成通过，unknown本身也未被纳入自动修正条件。
- 正式编译版 `node tests/prototype-browser-runtime-electron-fixture.mjs --sfa --dist` 退出0、5项检查通过，证据 `.test-data/prototype-runtime-electron-O9XR7C/report.json`，compiledRunner=true、v5、活动浏览器0、云调用0、原稿未变。两项真实SFA用例仍unknown；通过表示诊断器能准确指出错误，不表示原型已经修好。

流程见 [Mermaid](prototype-delivery-reliability-2026-10-09.mmd)。主进程改动需关闭开发应用后重新运行根目录“双击启动开发环境.bat”。本轮未制作便携版。

通俗说：页面依赖外网打不开时，应该明确指出并让原任务修稿；按钮真正报错时，应该知道错在哪一行。保留草稿，才能继续修；能导出文件也不等于业务与视觉已经合格。
