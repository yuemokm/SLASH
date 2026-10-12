# DOCX处理正文的转换布局

2026-10-11根已合入v5及后续紧凑v6；本轮统一检查被中断，暂未完成全量测试/构建。关联F12资料处理与生产方案G2资料/成果核对。

main/docx-structured-text.ts复用Mammoth/Saxes已有行格及跨度，核对转换HTML矩形布局。有效合并表在原格文本旁添加列覆盖和覆盖行；原table/row/cell定位、连续原句和普通表文字保留。表头明确“转换HTML布局列已核对，非Word网格；业务含义仍需对照原文”，不自动解释业务对象或认定业务表头。

冲突、越界、空洞/不等列、嵌套及超预算使整个该表布局unknown；仍保留原节点文本和限制。默认展开槽位上限250000，自定义limits.cells同样生效。main/office-extraction.ts解析版本升为office-text-v5-docx-html-layout；版本进入既有处理缓存身份，旧结果冷缺失，不回填或覆盖历史成果。

隔离最终37/37（21582ms）、类型0、root applycheck0；根合入回执[ integration.json ](../.test-data/production-grid-review-identity-root-integration-20261011/integration.json)记录全部原/候选/实际hash及CRLF差异。候选seal fdfba26d…306dc8、patch ee6efdbf…8fa6ea、原失败/先版日志均保留。

真实原件只读重放：流程1050字符且正文hash保持58cdd84a…cf5161；制度15530→22485字符且原格文本/跨度全部保留，10表布局可证。制度SOP转换table[2]有8列/144槽，流程机会为table[1]、正式终端为table[2]；业务序号20不是正文第20行。原件与冻结复制本前后hash相同。证据为候选real-original-final-replay.json及独立docx-grid-readonly审计，未改原资料或项目Skill。

Files.read直接DOCX仍是mammoth.extractRawText独立入口，本次未升级；新结构只作用正式Office处理链。后续实际任务需证明读取新版处理结果。布局提取通过不表示模型语义质量已改善，不回填旧评测成绩。

后续离线送审发现实际覆盖代价：`source-layout-preflight-62904ad4-64aa-446c-8dfe-eb70a34dc7c3/input-1.json`中制度正文为22485字符，现有单来源上限只纳入20000字符，正式输入因此为partial；流程1050字符仍full，尚未调用云模型。下一隔离候选仅精简重复布局标注：保留原行格、横纵跨度及原句，正文只附布局列，结构对象仍保留完整覆盖行；不提高上限、不针对该文件硬编码。当前统一检查期间根源码保持冻结，此精简尚未合入。

紧凑候选现已完成隔离父审：`docx-layout-compact-candidate-ea2291c5-cd33-4342-b222-0f3c09d198e6`，seal `7fcfe5a4…752b05c`，正式Office解析版本为`office-text-v6-docx-html-layout-compact`。9项布局/序列化测试通过（2461ms）、类型检查退出0；原件hash不变，完整结构对象与v5深相等，制度正文18660字符、流程1050字符。仅去掉重复覆盖行标注和单列范围重复数字，原行格及横纵跨度仍在正文中。

`source-layout-v6-preflight-37217c12-c018-4433-8696-6d56839e7dd4`两份固定稿件均纳入制度18660/18660与流程1050/1050，来源覆盖full；实际Pi本地请求序列化2/2通过，未增加来源上限。父审已授权修正本次manifest遗留的历史标识后进行两次真实模型对照，保持原v2提示、high请求、schema、90秒、12000输出预算、零重试及封存运行时。此处仅证明完整资料能够送审，尚无本次云模型质量结论；v6仍未合入根目录，等待现有统一检查终态。

中断收尾后的当前根状态：已核原hash并应用紧凑v6三文件，候选与实际字节完全一致，[v6-integration.json](../.test-data/production-grid-review-identity-root-integration-20261011/v6-integration.json)记录身份。根9/9布局专项通过（1152.5973ms），node类型检查退出0。现正文标注为`[布局列2]`或`[布局列2–4]`，覆盖行仍由原行号/纵跨及结构对象保留；解析身份为`office-text-v6-docx-html-layout-compact`。旧v5处理结果不回填。

同窗口正确控制真实评审completed、0finding；原错稿请求中断结果unknown，另有独立新错稿样本，不声称成对因果或质量改善。独立probe的full只表示提取正文全量入prompt；正式Service仍保留Office/PDF原文件覆盖partial限制。Files.read及真实Agent新版结构读取收益仍未验证。

Mermaid源：[docx-html-layout-2026-10-11.mmd](diagrams/docx-html-layout-2026-10-11.mmd)。

后续同窗口已局部合入Agent DOCX入口与宿主正文身份：Files.read/授权分页/PM工作流复用本Office v6底座，详见[Agent读取身份](production-docx-agent-read-identity-2026-10-11.md)。上述“Files.read未升级”描述保留为布局补丁单独阶段的历史边界；当前根Agent入口已接新版底座，UI readDocument仍独立未改，真实模型读取与质量收益仍未验证。
