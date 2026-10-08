# 比赛演示交付目录

直接分享的资料包：[slash-competition-materials-20261005.zip](output/slash-competition-materials-20261005.zip)，只包含最终9页PPT、180秒MP4、《答辩准备》和《参赛材料使用说明》。两份媒体文件的实际哈希已与各自最终验证记录核对。测试profile、数据库、模型配置、内部原件和工程依赖均不在ZIP中。

当前参赛演示版：[slash-competition-demo-final-v9.pptx](output/slash-competition-demo-final-v9.pptx)，9 页，16:9。SHA-256：`bbe925a109bae3558d3faff5c3c40cda7f9660f8b58ae6f1148fa840e28d90dc`，667106 字节。主线是已有资料、字段依据、草稿修改、真实交互与版本追溯；没有虚构效率百分比或排他性能力宣称。

本次结果分开说明：HTML经历三轮真实模型局部修订并应用，13项独立交互检查全部通过，另有8个宿主场景通过，两组不相加作业务总分。PRD地址/名称及关键四维/导入事实有真实模型修正，但随后表格结构自动修复中断。人工复核建议单列，未伪称新modelRun、全自动完成、全篇业务正确或真实后台已联通。

可交付的文档建议位于 [reviewed-documents](reviewed-documents/README.md)：[PRD-人工核对建议.md](reviewed-documents/PRD-人工核对建议.md) 和 [约束对照-人工核对建议.md](reviewed-documents/约束对照-人工核对建议.md)。它们由本对话助手协助人工审阅，未覆盖隔离项目正式文件；原版本、建议稿哈希及归属见 [source-manifest.json](reviewed-documents/source-manifest.json)。正式落库阶段、导入有效阶段、编码分配时机及真实服务接口继续待业务确认。

`content-design.md` 记录每页内容和视觉方案。`repair-result.json` 驱动第 7 页及相应状态说明。修改结果必须来自任务终态后的独立审查，不能由模型自评或关键词匹配填写。演示分镜见 `../../docs/competition-demo-outline.md`。

生成命令：

```powershell
& 'C:/Users/yuemokm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' 'E:/code/slash/deliverables/competition-2026-10-05/build-deck.mjs' --tag 新输出名称
```

已有输出不会覆盖，重新生成需使用新的 `--tag`。`--result` 可指定本目录内另一份审核 JSON。依赖使用 bundled Node 及 node_modules，目录中的 node_modules 是 Junction，交付 PPT 文件无需附带该链接。

所有幻灯片由 `@oai/artifact-tool` 创建。文字和第 4、7 页表格保持可编辑，截图嵌入原始 PNG。当前导出器会将自定义原生裁剪改为居中裁剪，因此脚本仅在草稿 OOXML 中修正第 3、5、6 页的 `srcRect`，截图字节和文字未改动。最终文件经首方重新导入、文件结构/布局/字体/原生表格检查，再逐页渲染和人工观察。不宣称已在原生 PowerPoint 打开验证。

`build/demo-final-v9/` 保存9张最终文件渲染图、[contact-sheet.png](build/demo-final-v9/contact-sheet.png)、逐页布局、[validation-delivery.json](build/demo-final-v9/validation-delivery.json)、evidence-manifest.json及visual-review.md。文件结构、布局、字体、两张原生表格及首方导入检查通过；9页全尺寸人工观察无文字溢出。最终备注已使用 reviewed-documents 可交付路径。未宣称在原生 PowerPoint 中打开验证。

历史 v8、草稿及构建中间文件仅保留过程记录。参赛ZIP由root统一整理PPT、MP4与答辩稿，不附运行profile、数据库、凭据、依赖目录或业务原件；本目录不直接等于全部需要打包的内容。

截图分两种：真实模型基线原型的实际浏览器观察，以及合成审批字段/验收表单的隔离产品功能验证。每页备注标明来源和边界，不能将后者当作新真实业务已经通过。截图使用演示数据，无真实客户名单或来源全文。
