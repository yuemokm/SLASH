# Word UI 阅读安全统一（2026-10-11）

当前根已按封存三个最小补丁合入，回执`.test-data/production-word-ui-root-integration-20261011/integration.json`（abebeb0b…e0ec）。所有基线hash已核；Service仅合导入与阅读方法，保留模板原字节修复；保留v6 Agent正文/解析身份和浏览器v8。唯一负责者串行检查已完成：`.test-data/production-word-ui-root-integration-20261011/unified-result.json`：check/test/build均exit0，1334/1334、0失败/取消/跳过，599749.0373ms，三阶段源码快照不变；未打包。当前root built桌面result为`built-desktop-5676b17e-9fcd-4b42-89f0-3e3e577c4269/result.json`，正式IPC和可信阅读点击、1440/390各12见证通过，实例6584关闭、pageErrors为空；父Agent已目视两张top图。

需求：F01/PF01 授权资料阅读、F02 版本引用、PF08 会话读取。阅读证据覆盖隔离及当前根编译版本的正式IPC小DOCX阅读；完整check/test/build另有上述统一记录。仍不代表真实业务任务、真人验收、长文滚动或复杂Word版式全面通过。

## 最小变化

- main/main.ts 的 DOCX readDocument 分支委派 Service.readWordDocument；非 DOCX、readFileVersion 历史快照及 Agent 2 MB 入口保持原契约。
- Service 的只读方法捕获原 root、businessAuthorization 与 workspace_read，并复用已有 assertBusinessAccess（含项目切换中检查），解析期间及返回前重核。最终根集成仅合这一个方法/import，保留 baseline 的模板字节回执修复。
- 新 main/word-document-reading.ts 保留 UI 20,000,000 字节输入限制，stat 和实际 Buffer 两次界限均核；Office 包安全校验/解压/XML 上限及 2,000,000 字节正文输出限制复用现有底座。
- 同一捕获 Buffer 产生原字节 SHA-256 version 与正文；解析后权限、授权路径、stat 身份及实际最新字节 hash 必须仍相符。变化拒绝，不重试，不返回部分正文。
- Office snapshot 新增 readingText。同一已验证结构树按阅读模式序列化，只省略宿主自身生成的技术头、表格/布局坐标及诊断；标题、普通表格、合并/嵌套表格各格业务文本、列表及原文字面 HTML 保留。复杂表格以原单元格次序阅读，并由现有 notice 明确提取覆盖限制。
- 原 extractOfficeText 仍返回原 Agent text；原 v6 parserVersion 与 Agent text/hash 不变。阅读模式不重复登记 structure，也不迁移历史 source receipt。
- 临时 DocumentContent 新增可选 host-only wordPresentation:'host-structured-v1'；旧响应保持兼容，无数据库迁移。App 保留 skipHtml、原表格组件和链接处理；Word 标记路径才启用 remarkHostWordBreaks，将值恰为 <br/> 的 html 节点转为安全 break。转义的用户文本及其他 HTML 不转换，不开启 rawHTML。

## 实际结果

- word-regression.log：session 55905 实际 exit0，52/52（6 文件，19672.7778ms），含 8 个新场景及 12 个 Agent DOCX 身份场景。两端产品类型检查、包含新测试的类型检查 exit0。
- agent-identity-and-reading-evidence.json：冻结原 v6 实现临时生成模块，与新 snapshot/原 API 对照；小实际 DOCX 的 Agent text SHA 均 6128245ee497c9fe28309a0783c2fbc229ded36565743b3c681911cb2bac2c19。structure/diagnostics 深相等；嵌套普通容器、表格、列表、图片、warning 另组亦深相等。临时原模块已清理，不作为永久复制实现维护。
- 原 App skipHtml 实证没有整表丢失：12 项业务见证原已保留，只丢宿主单元格换行。新 App SSR 两行以安全 break 分开，未删业务见证。
- desktop-final.log：session 5078 实际 exit0；Electron PID19016 退出0。正式 IPC → 实际 App 资源目录可信点击阅读 → 会话 Word 阅读，1440×940 / 390×844 各12见证保留，精确业务文本 Range 两行 y 分别405.08→428.17、415.08→438.17；安全 br=1。
- 四张真实截图及 result.json 位于 .test-data/desktop-1b81d960-36df-4461-bea5-f3912dfa5ee0。父 Agent 已目视批准该小 DOCX 的可读性及无横向裁剪；documentOverflow=0，reader scrollWidth=clientWidth（608/390）。用户 <script>/<br/> 字面文本保留，script/img 节点0、执行标志false。短文无需滚动，top/bottom 图不能证明长文滚动验收。没有真实模型或云请求。

## 保留失败与边界

- word-tests-first.log：5/8，阅读递归未传 reading 标志导致结构重复4→8（产品已修，保持4断言）；React break 后空白断言及 Store 清理顺序错误。word-tests-second.log：6/8，保留产品反例与错误清理属性；最终8/8后组合52/52。
- 首轮 main 实现脚本遇 CRLF 替换未命中，类型检查失败；脚本和日志均保留。首次新测试类型检查发现构造参数/可选 permissions，已按真实 API 修测试；未放宽类型或产品门禁。
- desktop-first.log / desktop-second.log：分别 session97002 exit1（测量 __name 不在浏览器上下文）与14319 exit1（br.nextSibling 是 React 空白节点）；Electron12640/18316均退出0，原失败 report/screenshot 未回填 passed。第三轮精确 Range/DOM 在 assert 前保存，未注入产品 __name，未跳过 y 断言。
- 构建 Vite 与 tsc 各exit0；多余 copy main/preload.cjs 报不存在（源实际 preload.cts）。tsc 已生成真实 dist/main/preload.cjs，桌面运行使用它。不是打包，不运行 electron-builder。
- root-office-base-comparison.json：捕获原始 CRLF 与当前根均83fb92c947e0856568f91ced6b61ba67cb3a93b9a5fa36941d1b0d8fb8a7e8dd；Git LF 比较为334a99a2baddeb624baea23c90946a5de1e73f01b2eadddfda48bcce7b9cedd9。仅换行归一差异，无 Office 语义/注释差异。Service/main 根有 baseline 合并，不能整文件覆盖。
- Word 图片 OCR、完整页眉页脚/文本框/批注/页面版式、长文滚动、真实业务大 Word、当前根同版本集成构建已通过；这些阅读覆盖项仍未验证；Office Agent readCoverage 仍 partial。

通俗解释：阅读 Word 时，显示的内容和引用版本来自同一份文件；文件或权限中途改变就拒绝返回。普通表格中的多行文字不会粘在一起，文档里写的 HTML 也只作为文字显示。
