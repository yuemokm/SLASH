# 原生说明折叠可见性修复

2026-10-10，关联 PF06/PF08/PF09、F02/F12。修复原型验收器将关闭的原生 `details` 正文误判为可见的问题；不修改用户原型，不代表 QE12 七项视觉目标全部通过。

## 根因与最小改动

真实 QE12 736495…稿的说明默认关闭。旧正式回归 `.test-data/qe12-astra-visual-continuation-20261010/qa-after-revision-mLU9fm/report.json` 中，两个新增说明用例均在 `stepIndex=2` 失败：`[open]` 数量为 0，但正文 `visible` 被判为 true，后续原生点击未执行。原业务 15/150 与六状态 6/22 已通过；历史总报告仍为失败，不能改记为原 202 步通过。

`main/prototype-browser.ts` 原先只检查边界框、元素自身的 display/visibility/opacity。Chromium 可以保留关闭 `details` 后代的布局框，同时跳过渲染，边界框存在不足以证明可见。

现在保留正尺寸检查，并复用 `main/prototype-usability.ts` 已使用的 `el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})`。同一判断供 `visible`、最小目标尺寸及动作前可见性检查使用。关闭说明中的按钮仍拒绝为 `PROTOTYPE_TARGET_HIDDEN`；`enabled`、`readonly`、`checked` 的语义没有改变。`summary` 依旧可见并通过原生 CDP 鼠标操作展开、关闭；不向页面注入展开脚本。

runner 标识改为 `electron-snapshot-cdp-v6`，以区别旧证据。未做数据库迁移、删除或重写旧报告，也不扩大旧报告的自动失效规则。

## 真实验收

`tests/prototype-browser-visibility-electron-fixture.mjs` 使用真实 Electron 与当前源码，创建自身隔离 profile，结束自身进程；不启动用户应用、不调用模型、不构建 dist。

- 修复前 `node tests/prototype-browser-visibility-electron-fixture.mjs` 退出 1：`.test-data/prototype-visibility-electron-0uWSXF/report.json` 保留 v5 对关闭正文的真实误判。
- 修复后 `npx tsx --test tests/prototype-browser-visibility.test.ts tests/prototype-browser-diagnostics.test.ts tests/prototype-usability.test.ts` 退出 0，10/10。新正式测试入口含五组真实 Electron 检查：桌面与手机的关闭→展开→关闭→再展开、嵌套说明保留内层 open 状态、普通 CSS/原生隐藏与可见元素、关闭后代动作拒绝。常规入口不依赖未跟踪的 `.test-data` 成果。
- `node tests/prototype-browser-visibility-electron-fixture.mjs --qe12` 退出 0，`.test-data/prototype-visibility-electron-u5TeR6/report.json` 共九组预期状态检查通过。其中第五组正确返回 failed，验证不可操作关闭后代；其余通过。额外两组是保留真实稿的说明功能 2/30，另两组仅为展开正文截图 2/4，分开计数。`sourceRunner=true`、v6、窗口 0、`cloudCalls=0`、原稿 hash 未变。
- `npm run check` 退出 0；定向 `git diff --check` 无空白错误。

新功能复验保持原 1440×900 与 390×844 视口，并保留再展开后的末图。补充正文审阅截图使用 1440×900 与 390×2160；较高手机视口用于展示完整说明，不代替正式 390×844 功能验收，也不算新增两个功能。图片均在上述 u5TeR6 目录，由报告记录 SHA-256。

原独立说明 fixture 还存在后续潜在定位误差：原稿来源合写为 `03-D5/D7`，旧新用例曾要求不存在的独立字面 `03-D7`。另外保存 `suite-description-details-corrected.json` 核对原合写坐标；原 fixture、原失败报告与原成果均未改。这是新独立复验，不把旧未执行步骤追认为通过。

根代理统一构建后运行 `node tests/prototype-browser-visibility-electron-fixture.mjs --qe12 --dist`，退出 0；[编译版真实回执](../.test-data/prototype-visibility-electron-ds71Io/report.json) 的九组预期状态检查通过，包括五组基础检查、说明功能 2/30 与补充展开截图 2/4。回执记录 `sourceRunner=false`、`compiledRunner=true`、`electron-snapshot-cdp-v6`、`cloudCalls=0`、`activeBrowserCount=0`、`originalProtected=true`，fixture 本身未构建 dist。该证据确认编译产物包含修复，不改记历史失败的 202 步；用户已打开的旧开发应用仍需重启才能使用 v6。

## 尚未完成的成果要求

736495…稿仍有 V4 技术批注收纳遗漏，且新增 live hint “提交后自动生成，前端不展示。”存在 V3 语义回退。正式宿主 3 + required 9 超过单批 10 的问题由另一专项处理。本修复没有应用、导出或再次发送该任务，也不宣布七项视觉目标通过。

通俗说：说明本来已经折叠，检查工具却以为它还显示着。现在工具能识别真实折叠状态，并验证点击展开和关闭；页面剩余的文案问题仍需继续处理。

流程源：[prototype-native-visibility.mmd](diagrams/prototype-native-visibility.mmd)。
