# HTML 静态交互绑定检查

对应质量开发目标第3项的验收可靠性。真实 QE16 第一轮用 `var $=function(id){return document.getElementById(id)}` 绑定 locate/reset，旧静态扫描误报 BUTTON_WITHOUT_ACTION；真实浏览器已证明按钮执行。现在 main/html-script-bindings.ts 使用生产依赖 Acorn 8.19.0 只读解析 AST，main/quality.ts 不再回退到 raw script 正则判断事件。

- `bound` 只证明具体控件有可识别的语法绑定；不证明动作正确。支持简单字面量 lookup、唯一未重写 helper/alias、同步无参 IIFE、document/body class 委托和 querySelectorAll.forEach。原生 submit/reset/summary 与已有 HTML 处理路径保留。
- `unbound` 在完整可判断范围内没有绑定，真正缺入口继续 blocking。其他按钮的 listener、注释和字符串不能让本按钮通过。
- `unknown` 表示复杂初始化、外部脚本、动态选择器/代码、重写或遮蔽、跨脚本变更、解析或预算不足等限制。按钮与全局入口检查均给明确 warning，不增加已证明 actions，不声称没有实现或功能通过。单个 class querySelector 不能证明所有同类控件。

非 JavaScript MIME（JSON、ld+json、importmap等）不作为脚本分析；module 按 module 解析，经典 JS 按 script 解析。脚本限100个、每个250000字符、总1000000字符、每份AST40000节点；限制只产生未知提示，诊断最多16项。模块不执行脚本、不访问网络、不增加权限。严格浏览器断言与独立内容审查保持原流程；真实“失败提示 display:none”问题仍需浏览器修复证据。

`QUALITY_CHECKER_VERSION='slash-quality-4'` 从 main/quality.ts 导出，raw质量报告、task static evidence、交付 gate 和手动质量报告共用。main/task-acceptance.ts 本地读取旧 static evidence 时，规则版本不符会在返回副本标 stale，并把原passed结果置unverified；历史存储不改，不自动复查、不调用模型。产品 package 版本不变。

实现位置：main/html-script-bindings.ts、main/quality.ts；版本接线仅 main/task-acceptance.ts、main/delivery-gate.ts、main/main.ts。专项在 tests/html-script-bindings.test.ts，包含真实不可变 snapshot1 的可选只读验证；没有用户测试资料的环境会明确 skip 该项，独立 fixture 仍执行。流程图在同名 `.mmd`。

解冻集成后，相关模块严格TypeScript检查、两份测试脚本语法检查通过；html-script-bindings、原quality、fault helper、driver四份正式测试合跑 **56/56通过、零skipped**（47733.2147ms）。其中真实snapshot1仅做只读AST核验，Service/native edit是真实本地API，DOM/浏览器故障报告明确为模拟。结果与文件hash在 `.test-data/quality-fault-development/integrated-verification.json`。本模块不宣称真实浏览器行为或业务人工确认通过，完整应用构建/全量回归由根统一执行。

通俗解释：页面用常见简写绑定按钮时，检查器现在能看懂，不会误报没有动作。遇到复杂写法会说明还要试用；真正点击之后能不能正确工作，仍由浏览器检查。
