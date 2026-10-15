# 常用文件作为会话上下文

需求：F02/F03/F10、PF03/PF05/PF08/PF09。用户要求添加常用文件，原入口仅允许PNG/JPEG/WEBP/GIF。现在会话“添加→添加文件或图片”支持多选，也接受拖入及带文件的粘贴；原图片视觉行为保留。

## 已实现与边界

- 文字资料：PDF、DOCX、XLSX、PPTX、TXT、Markdown、CSV/TSV、JSON/JSONL、HTML/XML/SVG、YAML/TOML/INI、日志及常用源代码。
- Office复用已安装Mammoth/ExcelJS及`office-extraction`安全包校验；PDF复用已有PDFParse字节提取接口。PPTX复用AdmZip/Saxes，按presentation页序及本地slide关系提取文字，不按文件编号猜页序。无新增依赖、Agent执行底座或云知识库。
- DOC/XLS/PPT旧二进制格式须先另存为DOCX/XLSX/PPTX；不接受任意二进制。普通文本支持UTF-8或带BOM的UTF-16；不猜测GBK编码。
- PDF扫描件没有可读文字时明确失败，未做OCR。DOCX图片、XLSX图表/图片、PPTX图片/图表/备注/版式均不作为已提取内容；公式不执行，仅保留已有缓存及原解析限制。HTML/XML等仅作源文本，不执行脚本、实体或链接。部分不符合受限本地slide关系结构的PPTX会明确失败。
- 每份附件显示文件名、类型、读取状态、失败原因及移除入口。单份失败保留，其余成功附件不丢；失败可逐项重试。错误卡展示可读原因，完整宿主错误码保留在详细tooltip。
- 运行中的原文字队列合同不扩大。带新附件的Enter发送被明确阻断，原输入与附件保留，可待本轮结束后发送新任务。

## 可执行接口与持久化

`shared/types.ts`新增严格请求schema：

```json
{"type":"attachmentAttach","path":"C:/用户选择的文件/客户要求.docx","workspaceRoot":"E:/项目"}
```

返回`ContextAttachmentRef`。文档使用`shared/context-attachments.ts`的严格`documentAttachmentSchema`，包含`kind=document`、id/name/mimeType/size、原字节sha256、createdAt、parserVersion、提取文字textHash、原文字数/includedCharacters、truncated及limitations。发送沿用`send.attachmentIds`，不把原文件路径当正文。旧`visionAttach`及图片元信息继续兼容。

原`vision-attachments/<workspaceHash>/`仓库兼容增加文档：`.bin`保留实际读入的原字节，`.txt`保留有界提取正文，`.json`为元信息。图片仍为原`.bin/.json`结构。无需SQL迁移或改写已有图片/用户历史数据。移除输入芯片不删除历史快照；未引用快照目前没有自动清理策略。

导入只读取用户实际添加的精确路径，不授予其所在目录访问权。IPC在开始及解析结束复核当前workspace。读入最多分配初始文件大小+1字节，复核size/mtime/ctime，竞争变化拒绝。后续读取使用不可变快照，复核原字节hash及提取正文hash；原文件修改或删除不静默更换已存附件依据。

## 正文进入模型的路径与预算

`main/main.ts`沿用Service附件准备hook，先`AttachmentRepository.prepareContext`，文档正文放入`documentContextText`；只把图片送入原VisionBridge，再合并原图片回执。`main/service.ts`在同一Run的`session.prompt`中注入文档正文，保持用户原文及独立图像证据。正文为JSON资料，转义`<`并明确为不可信参考数据，不能扩大目录/工具权限；没有为文档添加视觉模型依赖。

最多8个不同附件，单份12MiB（PDF仍为原10,000,000字节/200页）。单份提取快照最多40,000字符。发送总正文预算为`min(60,000, floor(contextWindow × 15%) − 2,048)`字符，均分到本次文档；过小预算拒绝。这里是基于已解析模型token容量的保守字符上限，另留元信息余量，不是精确token计数；继续沿用运行时的上下文/压缩门禁。

上传截断和本次发送的预算截断分别记录，实际`contextIncludedCharacters/contextTruncated`持久保存到原Run及所属用户消息。会话历史显示文件名/类型/实际截断；重启读回同快照。Office/PDF/PPTX解析在Worker内仅接收捕获字节及文件名，不接收文件路径或目录权限，60秒超时/内存限额/解析异常明确失败；主窗不承担同步解包。

## 验收证据

| 需求/路径 | 用例及证据 | 结果 |
| --- | --- | --- |
| PF05/PF09，仓库/schema/解析器 | `tests/context-attachments.test.ts`：中文常用格式、DOCX表格、XLSX缓存、PPTX页序/外链/DTD、PDF扫描失败、预算、源文件修改/删除、跨workspace、快照篡改、有界增长、图片混合、无视觉Service | 首批13项通过；错误文案补充1项通过 |
| PF03/PF09，原图片/Office/PDF路径 | 与`vision-bridge`、`runtime-model-images`、`pdf`、`office-extraction`合并定向 | 38/38，自然退出0；`.test-data/context-attachments-tests-2026-10-13.txt` |
| PF08，实际Electron/IPC/Worker/Service | `scripts/context-attachments-ui-smoke.mjs` | 9组通过；`.test-data/context-attachments-ui-1791889253412/result.json`及7组桌面/窄窗/历史截图 |
| PF08，简明错误反馈 | 同脚本`CONTEXT_ATTACHMENT_UI_FOCUS=error` | 1组真实UI补充通过；`.test-data/context-attachments-ui-1791889556234/result.json`及`error-readable.png`；无重跑完整9组 |
| PF03/PF05，真实附件上下文 | 上述隔离Electron的本机OpenAI协议fixture捕获各文档真实正文/sha/parserVersion，纯文本模型无图片输入；实际重启保留引用与截断，队列附件明确阻断 | 本机链路通过，不代表真实云供应商效果 |
| 工程 | `npm run check`、`npm run build` | 通过；构建保留已有大chunk警告，无打包 |

首轮专项因测试清理顺序先删除打开的SQLite目录而失败，已改为先关Store再清理，后续自然退出通过。UI早期失败为种子会话标题参数及Electron原生dialog的Playwright filechooser事件假设，证据保留在之前隔离目录；最终通过使用真实input文件选择所得原生File。

未验证真实云模型回答质量、操作系统剪贴板和手动原生文件对话框、所有现实Office变体及加密格式。不宣称OCR、图片/图表解读或任意二进制支持。拖入/粘贴测试用选择器获得的真实File构造浏览器事件，不是系统剪贴板实测。主进程/preload接口已更新，请重启开发应用；未打包、未提交Git。

流程源文件：[file-context-attachments-2026-10-13.mmd](file-context-attachments-2026-10-13.mmd)。
