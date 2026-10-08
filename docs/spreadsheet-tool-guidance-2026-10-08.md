# 表格字段工具参数与错误恢复

2026-10-08 桌面PRD模板复测补充：同次请求H9和F9时，实际失败是F9:F18跨行合并，模型却把H9误写为合并格。现有 `OFFICE_VALUE_MERGE_AMBIGUOUS` 增加values索引、valueCell、fieldCell、masterAddress和mergeRange，说明整次不返回部分证据，允许调用者显式单独重查其他正常格；不泄露业务正文、不改参数、不自动重试。真实Excel离线回放准确拒绝values[1]的F9:F18，独立H9返回“是”，原件未变。最终Service专项22/22、类型检查与根代理构建通过，证据目录 `.test-data/prd-template-findrows-retest/diagnostic-fix`。此修复没有新的云请求，不证明模型已经会正确解释表格；原复测仍unverified。

真实QE12的两批共16次字段工具调用失败：第一批把字段名称格同时作为规则值，第二批将登记提取TXT换成原XLSX。此次修正明确参数语义和错误原因，不放宽验证、增加模型调用或改变业务判断。

`path`使用已登记且已应用的内置XLSX提取TXT；`expectedContentHash`是该TXT正文SHA-256。工作表、字段、规则值和列头地址仍为原Excel坐标。`fieldCell`只标识字段名称，`values`不能包含字段名称格或指向同一合并主格；`headerCells`指向相应值列的明确列头。说明进入现有原生Pi工具JSONschema。

同主格返回`OFFICE_FIELD_VALUE_SAME_CELL`，携带具体values索引、请求地址及实际主格。真实跨字段行仍返回`OFFICE_FIELD_ROW_MISMATCH`，携带输入地址及字段行区间。不同于字段名称格的跨行/跨列合并值仍严格拒绝。错误不包含单元格业务正文；任何非法项导致整次拒绝，不发布其它合法项的部分证据。

Office路径误用在业务权限、Files目录授权及异步后的授权快照核验后，返回`SPREADSHEET_EXTRACTED_TEXT_REQUIRED`，提示从当前Run既有来源回执选择登记提取TXT及其hash。宿主不自动切换来源、改hash、删除非法项或重试；通用`readBusinessText`保持原行为。

新增回归使用既有真实Service/Store/Files/XLSX提取fixture，覆盖同格、合并同主格、跨行及合并歧义、权限优先、Office误用、输入不变/原件不变和显式改正后的合法证据。原生Pi本地HTTP fixture额外验证工具schema确实带参数说明，非法请求的具体错误地址抵达模型工具回执，随后fixture显式改正才返回证据。该测试证明本地软件链路，不证明真实云模型会自行改正或正确解释业务。

版本、取消、晚到撤权、伪造提取链、响应/字节上限、当前Run证据引用与Plan只读保护沿用原实现和专项测试。返回current仍仅证明真实原值/位置/版本；semanticStatus保持unverified、humanConfirmed保持false。本次真实QE12的30分钟失败、缺HTML和文档业务反例保留，不因软件修复回填为通过。

对应流程图：[spreadsheet-tool-guidance-2026-10-08.mmd](spreadsheet-tool-guidance-2026-10-08.mmd)。验证结果以本轮专项日志及最终交付记录为准。

最终验证：专项31/31、`npm run check`、正常`npm run build`均通过；根代理有界并发全量636/636通过，0失败、0取消、0跳过，耗时213836.2378ms。构建日志`.test-data/spreadsheet-tool-guidance-final-build.log`，全量日志`.test-data/spreadsheet-tool-guidance-final-tests.tap`。没有新云复测，不把本地Pi fixture的显式纠正称为真实模型已学会自修。正式运行代码与构建已同步，用户需退出旧开发应用再运行启动bat；未制作便携版。

本轮定向验证：`npx tsx --test tests/spreadsheet-field-evidence.test.ts tests/office-extraction.test.ts` 31/31通过、零skip；`npm run check`通过。记录位于`.test-data/spreadsheet-tool-guidance-candidate/formal-targeted-tests.tap`及`formal-check.log`。统一全量测试和构建由根代理另行执行，此处不声称已完成。

通俗说明：模型填错工具参数时，软件现在明确指出是哪一个格子重复、应使用哪类文件。它仍然不会偷偷帮模型改参数，更不会把位置核验当成业务正确。
