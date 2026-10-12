# G2 跨工作表审查选段：隔离候选

日期：2026-10-11。状态：实现与定向证据完成，未合并根工程。仅解决审查候选池被错误成果引用收窄的问题，不修改当前真实评测试次。

唯一副本：`E:/code/slash/.test-data/spreadsheet-selection-isolated-b3031ae22dae463389a56aed1e333bab`，recovery独占。node_modules junction仅只读使用，未安装/修改依赖。类型检查--noEmit，outDir为副本内dist；测试.cwd及TEMP/TMP均在副本，全部临时profile/项目由既有测试清理，tsx缓存仍保留在副本temp。未运行根全量、build或云模型。

## 最小变更

patch仅两文件：

| 文件 | 作用 |
| --- | --- |
| main/content-review-spreadsheet-excerpts.ts | 没有完整精确request sheet名时，以全部已授权同源sheet为候选，成果提表不再排除其他表；排序优先独立request的真实sheet标题/正文相关词，再使用成果相关词 |
| tests/content-review-cross-sheet-selection.test.ts | 四个通用反例：中文部分对象名、英文部分对象名、范围不明确时错误成果指表、八表上限下请求对象优先 |

复用已有requestRelevance、sheet解析、ranges、8段/8表、预算、坐标和合并边界；没有新依赖、schema、工具或字段证据权限。没有硬编码QE05/业务对象/特定sheet名。精确request仍保持原候选规则（请求表+成果显式对照表），但排序也新增titleScore/requestScore，不能声称这一分支完全原样。

all候选仍沿现有quota平分，不表示每张表已完整覆盖，也不保证所有关键字段都能在预算内出现。超过8表明确SHEET_SELECTION_LIMIT，遗漏和partial保留；词匹配只是选段相关性，不替代业务对象的人工判断。

## 验收

修改前最终四反例0/4，修改后新四例+既有表格选择24/24。必要既有定向回归161/161，153831.1866 ms；包括上述选择、精确sheet/coords、隐藏与malformed边界、合并规则、预算/协议/引用hash、实际Service/Pi loopback审查与取消、授权撤回、真实登记字段链与workflow导航。loopback为本地协议夹具，不是云任务语义评测。

命令在副本执行：

```powershell
node --import tsx --test tests/content-review-cross-sheet-selection.test.ts
node --import tsx --test tests/content-review-cross-sheet-selection.test.ts tests/content-review-spreadsheet-selection.test.ts
$env:TEMP=Join-Path (Get-Location) 'temp'; $env:TMP=$env:TEMP
$reviewTests=@(Get-ChildItem tests -File -Filter 'content-review*.test.ts' | ForEach-Object { $_.FullName })
node --import tsx --test @reviewTests tests/authorized-read-concurrency.test.ts tests/evidence-search.test.ts tests/spreadsheet-navigation.test.ts tests/spreadsheet-field-evidence.test.ts tests/workflow-spreadsheet-catalog.test.ts
node node_modules/typescript/bin/tsc -p tsconfig.node.json --noEmit
```

日志为副本cross-sheet-before-final.log、cross-sheet-selection.log、selection-regression.log、selection-typecheck.log（成功无输出）。四反例之外第一轮fixture有两例未用标点包围英文sheet名，旧named边界没有识别其精确成果引用；已修正反例文本并保留首轮cross-sheet-before.log。最终red测试与patch所带测试一致，之后才改生产候选。

## 冻结真实首稿重放

重放使用只读诊断已证明两hash匹配的QE05首轮input；不调用模型、不改当前合同/草稿/真实profile，不将原回执换成新结果。

原字段选段9008/63164字符，全属01；候选7784/63164字符，包含同源五张表的有限片段。59392提示上限未变，候选prompt33146字符、六个ranges；inputHash变为`f0d206814589615d19aac35b2d2aa94656d1300cfb5b8b0ae87305df348aca51`，反映新选段，不继承旧审查结果。

03片段只有40775–42415（UTF-16，end不含）。逐格原文核对已确认完整包含：

- 行2 D2/F2/I2/K2/O2/P2；K2包含唯一标识、禁止重复建档及`{JHWD}{10位顺序码}`。
- 行3 D3/F3/G3/K3/O3/P3；G3为50，K3包含连锁与个体网点命名规则。

完整地址、起止与原文在副本replay/frozen-real-cell-coverage.json；这里仅证明这些原文进入候选审查，不证明完整03关键字段、字段业务含义、内置链或已核验field evidence。replay/frozen-real-input.json和frozen-real-replay-result.json保留原/候选材料，仍partial。

## 原新hash与patch

| 文件 | SHA256 |
| --- | --- |
| 根/原selector | 25DDD5CD7485A612AD9B1CE28F9494087945CAC75E9E88B52ECFA603322F55D7 |
| 候选selector | 97ED768A78E344B1357644A22C8550E8945909D8EDA4B1155712E6DA0CD19844 |
| 新测试 | E21D9B12555EC4D129E0F224E19F08025F9F4C192BB4D8C898E19B71CB5F7551 |
| spreadsheet-selection-candidate.patch | 388FE8C914610BD9FC8A775ADA7A72B271CA2499DB292FC6B755EC54301F88C7 |
| selection-regression.log | F52A056160418129ACCDC2AC26D96222100F3D0032574A256411C3A9D14FABE4 |

完整文件hash见副本original-hashes.json/final-hashes.json。结束时根selector hash等于原始值；`git apply --check`只读成功，未应用patch。

## 剩余问题

本诊断固定在首轮冻结稿，保留当时三个独立生成问题：生成模型字段正文只读前12000字符未到03；DOCX制度第2列被当作全局规则；新增流程业务步骤号被标成转换表格行号。它们不是本候选已解决的生成问题。QE05现已终态；[终稿独立审阅](../.test-data/quality-evaluation-ypLMK9/cases/QE05/independent-business-review.json)绑定终稿hash `3d39c0bd2f99540605deb73116f3e847c9fddb9c4da1722d8204c01f503a3657`，结论为 `violated`，不是真实用户验收。本文的历史首稿证据没有改写为终稿证据。

生成侧可复用search_files真实snippet行号和read_file带hash分页补读目标表；有字段证据要求时走已存在的copy/process/apply链。文本locator不能升级为已核验字段，runner原件已挂载但未登记链的区别见production-qe05-source-selection-diagnostic-2026-10-11.md。此次没有新工具、通用提示改动、处理链补种或额外云attempt。候选Electron/合并后运行、云审查实际收益、QE12/16共同改进仍未验证，留下一版本窗口。

通俗说明：稿子可能引用错表。候选让检查器先照任务找相关表，并保留其他同源表作对照；这增加发现用错表的机会，但不会自动纠正稿子或把没读完整的资料说成已经核验。
