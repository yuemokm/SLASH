# 自动索引上下文摘要（2026-10-07）

真实QE16发现完整自动索引与来源片段、目录查询共同占用大量上下文。此改动仅缩小首次送给模型的managed索引；不改变用户模型配置、人工规则、来源正文预算、工具搜索分页或Pi原生压缩/重试。

`AgentIndexManager.read`仍使用`splitAgentsDocument`分出的人工区域与自动区域。磁盘AGENTS索引保持现有同步内容、扫描上限、冲突保护；manualContent完整传入既有workspaceRules入口。`main/agent-index-context.ts`只对managed区域生成只读投影：6000字符以内的小索引保持原样，大索引输出有界JSON摘要，包含实际结构、目录已索引项计数及有限真实路径，完整路径放不下则略去，不截成虚假路径。

摘要明确标partial，计数只指磁盘索引已记录条目，不将原扫描截断误称全项目覆盖。其余资料经search_files/read_file/read_image及既有授权按需读取；skill仍使用list_skills/load_skill。摘要不是来源正文、业务规则或授权。

原receipt.contentHash继续标识磁盘AGENTS全文；新增可选receipt.context记录managed原hash、注入hash、原/注入字符数、展示/已索引计数和full/partial。coverage只描述索引投影，所有模式均记录bodyRead=false；小索引full也不代表资料正文已阅读。Service现有上下文manifest与operation自然保存该回执，不新增模型循环。

专项`tests/agent-index-context.test.ts`覆盖实际文件生成的大索引、完整人工规则、真实路径与计数/hash绑定、小索引兼容、资源禁用与读后撤权、超长路径及人工区拒绝。实际运行效果仍需统一构建后的QE16，不能由字符数下降推定原型质量或上游上下文问题已解决。

收尾验证：`npm run check`通过；索引投影、统一AGENTS文件、项目上下文联合18/18通过，最终bodyRead字段专项4/4通过。只读读取旧QE16磁盘索引并运行纯投影函数：managed从54628字符降至5888字符（减少89.22%），保留16项结构与152项已索引记录的计数，显示16条真实路径，原全文hash仍为311b9751bde7bd195901c454471ba7c0fac0e789b94cc229ab462a9edae3b64d；未重新同步或改写该测试profile。此对比只测注入体积，未重新构建或发起云模型运行。

通俗解释：自动目录信息只先给模型一张小目录卡；你的人工要求完整保留，磁盘目录也还在。模型需要具体资料时继续按权限查找和读取，不会把“目录卡里没出现”当成资料不存在。

流程源图：[索引投影](agent-index-context-2026-10-07.mmd)。
