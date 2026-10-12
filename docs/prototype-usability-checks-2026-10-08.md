# 同版本原型的有限控件检查

需求：QE12 / 原型输出质量。实现位置：`shared/prototype-acceptance.ts` 的固定 `control-usability` 断言、`main/prototype-usability.ts`、既有 `main/prototype-browser.ts`。沿用授权快照、沙箱、离线、固定代码、3 秒阶段/60 秒总时限和截图限制；没有开放 Agent JavaScript。

宿主 `buildPrototypeUsabilityBaselineCases({mobile})` 固定桌面 1440×900；只有调用方从用户明确移动要求认定 `mobile:true` 才附加 390×844。页面自己写 viewport meta 不能替代用户要求。结果归属当前精确快照/草稿，沿用既有版本与权限核对。

## 固定范围

- 当前渲染且启用的原生文本/数字/日期字段、select、textarea，以及有文字且关联 form 的 submit 控件。隐藏、禁用、inert、checkbox/radio、图标按钮、普通链接和普通 `type=button` 不适用；跳过数不表示这些控件已通过。
- 字号至少 12 CSS px；桌面控件宽高至少 24px，移动字段至少 32px、文字提交按钮至少 44px。尺寸允许 1 CSS px 舍入差。这是明确的保守检查阈值，不是完整可访问性认证。
- 祖先 `overflow:hidden/clip` 的控件几何裁切；HTML submit 按钮固定文字被自身 overflow 裁切。原生输入值/选项文字可滚动，故不据其长度判错；不输出 value、label、text、id、name。
- 仅当前视口内、且在滚动容器当前可见部分的 5 个固定取样点全部不能命中本控件时，记录遮挡问题。屏外/滚动容器尚未滚到的字段不判遮挡；`pointer-events:none` 不据命中失败判遮挡。部分遮挡、对比度、布局层级仍需看图。
- 最多遍历 2000 元素、收集 80 候选、返回 20 问题；祖先/结构定位最多 32 层，按钮文字矩形/文本节点最多各 100。超限为 `unknown` 并保留已发现问题；0 适用控件也为 `unknown`。

结果含固定 scope/coverage、checked/skipped/candidateCount/complete、问题 code、结构 selector、viewport 和数值。结构 selector 通过真实 runner 的唯一选择器断言复验，不输出用户属性。`passed` 只说明此有限控件范围没有发现上述问题，不能表示整页好用、业务正确或审美通过。

## 实际证据

命令 `node tests/prototype-usability-electron-fixture.mjs` 在独立临时目录转译 4 个生产模块，直接运行真实 Electron 受限 runner；未 build、未调用云、未修改业务稿、未改 Electron 导出或 mock 主进程。

最终证据：[report.json](../.test-data/prototype-usability-hHSKpT/report.json)。13 组 fixture 验证：可见控件、隐藏/禁用/小图标排除、字号/尺寸/按钮裁切/祖先裁切、返回 selector 唯一匹配、完全遮挡、正常屏外控件、可滚动长表单、子像素容差、0 控件 unknown、候选/元素上限 unknown、网络阻断以及实际旧稿回放。loopback 请求 0；全部浏览器窗口清理完成。`npm run check` 通过；`prototype-usability`、`prototype-browser-diagnostics`、`prototype-acceptance` 共 24 项 Node 测试通过。Node 诊断测试中 Electron mock 仅在独立子进程；真实 Electron 证据来自本 fixture。

保留失败和边界记录：首次 [19wfBo/report.json](../.test-data/prototype-usability-19wfBo/report.json) 中冷启动桌面 initialization 实际超过既有 3 秒限制，mobile 成功。后续 fixture 单独保存冷启动观察，不放宽生产时限、不声称冷启动稳定性已经修复。早期 [fhbqIO/report.json](../.test-data/prototype-usability-fhbqIO/report.json) 曾把旧稿移动提交按钮 43.82px 与严格 44px 的 0.18px 差报错；此记录保留，最终固定 1px 舍入容差以避免假阳性。

只读回放源 `.test-data/duplicate-create-repair-proposal/case-DUPLICATE-CREATE/pending-1.html`，23,152 字节，前后 SHA-256 均为 `f966a552213bfbaf64a843637a2db4f31240c2b7ebed2f2c6a5769cd65e6996b`。最终桌面/移动均检查 21、跳过 18、候选 39、0 几何问题，有限断言均通过。真实截图：[桌面](../.test-data/prototype-usability-hHSKpT/actual-old-prototype-entry-0.png)、[手机](../.test-data/prototype-usability-hHSKpT/actual-old-prototype-entry-1.png)。

**这也是检查边界的反例：用户评价难用的旧稿，仍能通过新的有限控件检查。状态挤成四行、来源批注挤占任务、层级和文案问题均未被这些几何规则覆盖。不能把该结果当成 QE12 视觉质量已解决；仍需同版本看图反馈、修稿与复查。** 本轮未进行云视觉评审、未修改该业务页面，未验证所有交互状态或全部滚动位置。

通俗说：新增检查能发现“输入框太小、按钮字被切掉、按钮被挡住”等硬问题；页面说明是否太多、排版是否拥挤，仍要看真实画面判断。旧稿两种尺寸都能通过，正说明不能把自动通过当成页面已经好用。

流程图源：[prototype-usability-checks.mmd](diagrams/prototype-usability-checks.mmd)。
