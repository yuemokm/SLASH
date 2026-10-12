# Agent读取DOCX的正文与身份

2026-10-11根局部集成，关联F12资料处理及生产方案G2来源版本核对。候选manifest `64c5ff4e…e8db78`，product patch `122862ab…76f0c9`、tests patch `90821f76…7825`。根回执：[docx-read-integration.json](../.test-data/production-grid-review-identity-root-integration-20261011/docx-read-integration.json)。

`main/files.ts`对授权DOCX的宿主快照复用既有Office安全提取底座；直接Agent入口保留2,000,000字节限额，实读后复核字节与授权，转换等待后再次检查文件身份。根Office使用v6紧凑布局，未被隔离候选v5覆盖。Office模块只接收宿主提供的字节，不解析路径、授予权限或读写原文件。

`main/authorized-read.ts`与`main/pm-workflows.ts`将实际正文全文hash和解析版本写入宿主`textExtraction`回执；分页片段不冒充全文。工作流`current`的`contentHash`仍表示原文件字节，Agent的`read:`回执则表示实际提取正文；上下文用明确的版本与`hashKind`区分，不能混比。`shared/docx-read-identity.ts`严格定义宿主schema，没有开放模型自行声明来源身份。非DOCX保留原读取钩子，历史before字符串不重新解释。

`main/service.ts`将模型实际读到的同一快照写入来源manifest，避免读取A后原文件变B却登记B；恢复核对按版本类型检查原文件字节或已读正文身份，并检查解析身份与目录授权。旧DOCX回执缺新身份时要求重读，不回填历史、不迁移数据库。Office内容审查仍partial，新结构不证明图片、文本框、批注等全部内容已读。

隔离证据为新12项及受影响旧25项分轮通过；原58/61、36/37等失败日志保留，不能记成一次37/37。根合入后check退出0，六文件组合专项46/46（25257ms）通过，覆盖DOCX身份、工作流、恢复、并发读取、审查缓存身份和v6布局；证据为`docx-read-root-targeted.log`，会话51932已退出0。此前统一全量中断记录仍不计通过，当前最终统一check/test/build均exit0、1334/1334，证据production-word-ui-root-integration-20261011/unified-result.json。

界面`readDocument`的20MB入口随后已合入同快照安全阅读，使用独立`readingText`省略宿主自身元信息并保留业务正文，原Agent text/hash不变；详见[Word阅读安全统一](production-word-ui-read-safety-2026-10-11.md)。当前根完整构建与root built小DOCX1440/390已通过；小文档验证不代表长文或复杂Word视觉覆盖。真实云模型是否读到新版结构及业务判断收益仍未验。本次不打包，也不宣称真实MCP远端发布或真人验收。

通俗解释：Agent读Word时会保留表格信息，同时记住它实际读到的版本。文件或解析方式改变后，旧凭证不会被当成新版凭证，需要重新读取。

Mermaid源：[docx-agent-read-identity-2026-10-11.mmd](diagrams/docx-agent-read-identity-2026-10-11.mmd)。

后续完整全量1326项中1321通过、5失败，test退出1且未启动build，保留`.test-data/production-docx-read-v6-unified-20261011/test.log`。四项模板失败定位为模板字节身份被误当业务正文；现已收窄到专门模板复核，真实DOCX正文身份校验不放宽。另一个浏览器初始化超时按独立启动预算修复。四文件组合33/33及check退出0，见`.test-data/production-template-init-repair-20261011/targeted-result.json`；最终全量已由当前1334/1334及build退出0完成，原失败记录保留。直接DOCX读取证明与评测准备生成TXT后模型读TXT的证明须分开记录，不因TXT含新版结构便宣称模型调用了直接DOCX入口。
