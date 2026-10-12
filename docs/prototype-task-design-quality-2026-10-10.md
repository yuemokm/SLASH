# 原型 Agent 按任务设计与图审规则

2026-10-10，关联 F10、PF03/PF08/PF10。用户要求原型同时具备实际使用价值与设计感，并明确原型界面不放与产品无关的制作/演示提示。本轮复用现有Pi、全局frontend-design技能、隔离浏览器及图审/有限修稿，未新增依赖、执行框架或审批入口。选型依据见[Pi复用调研](../exa-results/pi-prototype-design-reuse-audit-2026-10-10.md)，实际产品问题见[根代理体验审查](prototype-product-quality-audit-2026-10-10.md)。

## 制作指导

`main/prototype-guidance.ts` 区分新建、整体体验改善与精确修改；按业务表单、工作台或C端实际任务选择结构，不把表单机械套为管理后台或营销落地页。写稿前用几句话给出可观察的设计结论：使用者、主要任务、必要输入到完成反馈的路径、分区和关键状态、布局与token取舍；不要求展示长篇推理，也不新增长方案比较或等待批准门槛。

表单围绕完成任务组织必要输入、选填及主动作，避免填写到底再回滚找提交；信息密度适合内容与终端，不固定桌面窄单列或机械铺满宽屏。实际检查正常流程、错误恢复和适用的取消/返回、焦点与反馈；执行器自动滚到按钮或DOM通过不能证明动作易找或效率合理。使用现有 `run_prototype_acceptance`、`read_prototype_screenshot`，实际收到图片才声明已看图，修稿后核对新版本。

界面只放产品规则、字段、状态和正常反馈。制作/演示/模拟、来源坐标与接口/落库技术元信息放到Slash交付说明或关联资料，保留来源映射，不另建免责声明区。业务状态可用模拟数据呈现；交付说明仍须如实说明真实后台未接、待确认及未验证范围，不把原型成功反馈当作外部业务真实执行。此取舍改变此前强制保留界面模拟标记和说明折叠的要求；历史稿/旧测试保留，新成果验收须使用根代理适配的新标准，不能声称旧23/202原字节通过。

`main/system-prompt.ts` 与 `main/pm-workflows.ts` 已共同引用该指导，因此不复制第二套规则、不修改工作流字段。用户自定义提示保留；已接收Run仍使用其冻结系统提示，不覆写旧快照。

## 有界层级图审与修稿

`main/prototype-visual-review.ts` 的既有 `hierarchy` 类别现在检查截图内可见的任务入口、必要输入、主动作、分区/密度、技术批注负担与选项可读性，要求解释它如何影响本次任务。不得根据截图判断视口外、滚动后、焦点/键盘、提交/返回或后台事实；不因个人风格、留白本身、特效与营销倾向提出重设计。

仍为3图/12MiB、最多4个局部候选、6000字符用户要求预算；响应字段/类别与严格JSON格式不变，图片/入口/视口/版本/权限绑定不变，零发现仍不判passed。`main/task-completion.ts` 仅把当前规则、同版本、有效绑定的high候选送入已有最多两轮修稿；medium/low、损坏/过期证据和未知外部副作用不放宽。

修稿可在原授权内调整绑定可见分区与必要关联布局，不再把局部候选理解成只能改两行文案；它不授权整页随意重做、改变业务流程/字段/JS或删减锁定回归。用户要求产品视角时，不强制界面保留模拟/制作元信息，真实限制在交付说明中保留。范围外或不可见的必要调整仍保留意见与未验证状态。

## 版本与历史兼容

规则版本升为 `slash-visual-review-2`，未升级response协议、receipt字段结构或数据库。`shared/prototype-visual-review.ts` 同时接受v1历史与v2；`verifyVisualReview` 继续核验旧v1哈希，`isCurrentVisualReview` 将历史完整性与当前规则候选资格分开。

新 `inputHash` 包含规则版本与完整 `VISUAL_REVIEW_POLICY` 文本的SHA-256，并保留合同、全部要求hash及图片身份；仅readAt变化仍可共享身份，要求或策略变化不能复用旧身份。`main/service.ts` 刷新v1缓存时返回stale派生图审并隐藏候选，不再读图片、不发模型；`main/task-acceptance-model-view.ts` 也不向模型输出旧规则候选。依照原聚合语义，派生任务报告可以stale；原报告、原DOM通过结果和automaticStatus保留，不改写旧证据。

## 本地验收与限制

实际命令：

```powershell
npx tsx --test tests/prototype-guidance.test.ts tests/prototype-visual-review.test.ts tests/prototype-visual-review-runtime.test.ts tests/content-review-repair-scope.test.ts tests/task-regression-service.test.ts
npm run check
```

本地相关42/42通过，类型检查退出0。检查覆盖实际Service向runtime传递用户范围与真实来源版本、工作流指导且不覆盖自定义提示/旧Run快照；正式审查回调中的要求与截图身份、policyHash绑定；high/版本/严格schema门槛；Service新旧规则刷新、v1历史哈希及旧意见隐藏；原权限/预算/取消、有限两轮与未知副作用回归。原生Pi图像传输测试使用本机HTTP，零云、不污染父会话；Service/候选规则测试含流程夹具，不能当作真实新页面质量证明。

本轮未build、未发云、未改用户原型或配置。用户新增55000→40000点的15000点硬预算由根代理核对和预控，真实Astra新稿验收暂缓。整体布局、美感、正常流程与焦点是否改善仍待真实Agent生成新稿、同任务/视口对照和浏览器操作确认，不能以代码检查或旧七项限定通过宣称新目标完成。

通俗说：Agent现在先围绕用户要做的事组织页面，看图时也检查主动作与信息层级；页面不再被要求显示制作免责声明。但能否实际生成更好用的页面，还需要新的真实稿来证明。

流程源：[prototype-task-design-quality-2026-10-10.mmd](prototype-task-design-quality-2026-10-10.mmd)。

## 根代理集成核验

2026-10-10：源码冻结后，根代理联合运行 prototype-guidance、prototype-visual-review、prototype-visual-review-runtime、content-review-repair-scope、content-review-diagnostics、task-regression-service、task-acceptance-model-view、task-acceptance-model-view-service、quality-evaluation、quality-prototype-checks 十个测试文件，72/72通过、无跳过；`npm run check`与`npm run build`退出0。构建仍有既有的大于500kB前端分块提示；未执行安装包构建。此计数为一次联合运行，不与此前专项次数累加。

本次额度限制下新增云模型调用为0，真实新稿尚未生成。余额查询与请求费用预控未核验，云启动保持禁止；55000点起算、最多新增15000点、40000点停止线不以token估算替代。主进程指导已改动，使用新规则需重启开发应用；浏览器当前打开的旧稿不因此自动更新。
