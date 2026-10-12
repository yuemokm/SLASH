# G2 多文件候选：后续桌面与浏览器验收入口

2026-10-11 只读核实。候选仍封存在 `.test-data/prototype-multifile-delivery-isolated-a4e1ced1cc4249cb9d708765aebd2263`，不进入当前统一集成窗口。本记录没有执行下面命令、启动应用/服务或调用模型。已实现与既有证据见 [候选交付记录](production-prototype-multifile-candidate-2026-10-11.md)。

## 现成入口及实际边界

| 入口 | 可直接复用的部分 | 不能据此证明的部分 |
| --- | --- | --- |
| `scripts/production-mcp-dispatch-electron.mts` | 隔离 profile、实际 built Electron/preload/main IPC；等待真实 MCP catalog 标记后改文件/撤权限/改连接；实收计数、Operation、丢回执不重传、关闭实例及源/dist哈希 | 当前种子是单个 Markdown 文本绑定，没有多文件 locator/codec；脚本需下一窗口定向适配，不能原样运行后登记多文件通过 |
| `scripts/production-g2-html-oauth-electron.mts` | 实际 `prototypeAcceptanceSave/Run/Get/Screenshot`；1440×900与390×844业务点击和截图；界面“重新运行自动检查”；逐项核对后实际 stdio 发送 | 当前自包含单HTML；不是本候选 CSS/JS/图片加载证明。人工审阅等待环节须真的查看截图和业务要求，不能直接写通过文件 |
| `scripts/prototype-acceptance-ui-smoke.mjs` | 实际构建主进程、HTML+app.js、验收面板/取消/受控截图/Plan拒绝/必检/ZIP导出，开发模式与独立profile | 合成界面回归不是模型业务正确性；不使用 `--packaged`，本轮不制作便携版 |
| `scripts/prototype-viewport-smoke.mjs` | 实际离线 Electron 浏览器；原生可信点击、桌面/手机视口、横向溢出、44px目标、网络阻断与窗口清理；临时转译仅写 `.test-data` | 内部快照帮助函数只放 `index.html`；可选命令行路径是带指定失败断言的旧页面，不能把新项目路径直接传入当通用通过检查 |
| `scripts/prototype-browser-smoke.mjs` | 既有 runner 的多页面跳转、原生输入、只读、存储隔离、故障/超时/撤权/网络阻断等回归 | 写死私有历史原型路径，存在预期失败用例；不是任意新 checkout 的自包含候选验收入口 |
| `scripts/prototype-browser-probe.mjs` | 最小离线 Electron 能力探针、isTrusted输入/点击、截图 | 不经过成果/验收/交付领域，只在环境打不开真实 runner 时作定位，不作为产品验收替代 |
| `scripts/production-g2-electron-integration.mts` | 现有真实恢复核对、正式 copy/Word、已有目标字节保留、实际 MCP 和版本变化反例 | 不是新多文件覆盖；保存对话框被测试桩替换，不能记为原生系统保存对话框已验 |

以上 `.mts` 可沿用 `node --import tsx scripts/<名称>.mts`，第一项还必须显式 `--execute`；`.mjs` 用 `node scripts/<名称>.mjs`。它们不是 package.json 已登记的 npm 专项命令。`npm run start` 会自行 build，不能作为冻结窗口的只读启动方式。统一builder完成对应版本 check/test/build 后，才由单一负责者执行桌面入口。

## 最小下一窗口步骤

1. 唯一builder先审封存 patch/hash、定向检查、集成与统一 build，保留源码和 dist 的实际版本身份。每次桌面试验使用新唯一 `.test-data` profile/project；移除 dev-server 环境变量和 `ELECTRON_RUN_AS_NODE`，按既有脚本验证 `app.getPath('userData')` 确实指向试验 profile。不触碰真实用户 profile。
2. 复用上述 HTML专项种子与本候选 `tests/prototype-delivery-service.test.ts` 的真实来源、任务输出、五文件及完整提案参数：`index.html/style.css/app.js/pixel.png/other.html`。浏览器必须改用实际 `runPrototypeAcceptance`，移除 Service测试的 `browserFixture`。用既有Save/Run/Get/Screenshot及任务重检入口收敛报告。增加确实由外部JS完成的点击反馈、CSS可见布局和多页跳转断言；PNG加载可由合成fixture的onload/naturalWidth检查更新反馈节点，再用已有text断言核对，另目视真实截图。现有严格步骤schema没有任意DOM属性断言，不能伪造naturalWidth检查类型。桌面/手机均查看实际像素与业务步骤。
3. 对比浏览器 `evidence.manifest` 的 `path/hash/bytes` 与提案 manifest 的 `path/sha256/bytes`，逐文件原字节等值；不能直接比较两种不同格式的总hash。同快照ZIP重新逐项解包比较；排除非web PRD，但目录内独立 `other.html` 仍按现有目录边界纳入。核对截图hash、specHash、报告当前性和全部人工事项，记录审阅者为Agent，不能写真实用户签字。
4. **正式程序负向入口**：当前production registry默认空，未经真实适配器注册的 `prototypeProject` 通过正规IPC必须明确unsupported、调用数0、没有自动退回单text。模型/request传fixture开关或host binding仍被strict schema拒绝。这条可在生产默认构造上验证。
5. **隔离正向入口**：完整 IPC→stdio 验收需要在专用测试主进程的Service构造位置注入fixture codec及 `allowFixturePrototypePublishing:true`，并保留真实浏览器backend与真实main批准/executeMcp流程。目前 `main/main.ts` 正式构造未注入它，现成脚本也不能改变其构造；下一窗口只定向适配现有桌面harness/测试composition，不新增模型字段、普通环境开关或生产平台选项。只在这个明确测试入口运行本机fixture，生产默认保持空registry。该入口尚未实现/执行，不能提前算通过。
6. 复用dispatch脚本的catalog等待门：正常绑定发送1次且每文件实收hash一致；等待期间真实改/增/删资源、撤workspace_read/external_action、改连接/schema、改来源、改必检合同、出现unknown或改args均0发送。人审持久证据缺失可用关闭实例后的隔离store模拟，必须注明是损坏/缺失模拟，没有“用户撤回按钮”。同版本重检仍允许原有效审批；新增报告本身不能充当撤授权反例。
7. fixture接受完整payload后退出：实际Operation与proposal为outcome_unknown，仅1发送、不自动重试；重启后记录仍保留，正式交付仍受unknown屏障保护。每场景留输入绑定、实收字节、操作状态、截图/错误和实例关闭记录；失败保留，不仅记总通过数。
8. 单文件回归分别验证：自包含HTML旁有PRD/独立HTML可继续作为 `single_file_text/not_asserted`，不是完整项目证明；已有实际本地加载依赖不得用入口单text冒充项目。资源编码字面量保持一次解码，避免复引入raw/normalized误判。

## 本地与真实provider的分界

本地可以验证浏览器加载完整静态文件、桌面/手机原生交互、同快照ZIP、真实IPC门禁、本地stdio实收和unknown持久语义。fixture server收到了文件，只证明本地交付链，不证明网站已上线。

真实发布仍需现有连接实际tool inputSchema、明确受授权目标及production codec；按schema表达能力验证大小/二进制/路径与调用回执。成功后逐个访问线上入口/CSS/JS/图片和路由，核验线上字节/版本与manifest，运行桌面/手机实际业务流程。仅工具返回URL或HTTP 200不足以通过。当前只读profile公共连接列表为空，没有真实provider schema，尚不能做这条验收；不新建连接、不登录、不发布。

React/Vite受控构建、源/配置/锁文件与构建产物回执，及超过100KB参数的真实上传适配仍未实现。`source_zip`不冒充静态可发布构建。原生静态本地通过不会取消上述目标，也不会证明动态依赖完整性。

通俗说明：接下来先在隔离桌面里确认网页的样式、脚本和图片都能用，而且发送的正是核对过的整套文件。真正上线还要有发布服务，并再次检查线上页面；本机收到文件不等于已经上线。
