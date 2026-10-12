# 同文件并发读取的来源回执修复

根集成补充：48项相关回归、`npm run check`及`npm run build`通过；构建保留既有大chunk提示。原PRD默认续跑已自然因上游请求错误失败，保留4278字符草稿；已在新编译版正式启动fresh恢复，真实效果及完整Word尚待验收，未打包。

日期：2026-10-10。需求关联：F04 参考资料、F08 来源检索；本次验收标识 `F04-RC01`。状态：源代码与针对性回归已通过；当前真实 PRD Run 使用的 `dist` 保持冻结，尚未构建、桌面验收或云端验证该修复。

## 问题与证据

真实 SFA 续跑同一响应读取蓝图的409/529行时出现 `VERSION_CONFLICT`，但文件 SHA256 未变化。隔离复现直接使用冻结的 `dist/main/authorized-read.js`、真实 `Files` 只读适配器和小文本，不使用模型、live profile 或模拟读取底座。

- 同文件行分页并发且带 `expectedContentHash`：5/5批次出现一条错误版本冲突。
- 同文件行分页并发且不带哈希：正文返回成功，但一条来源回执误记为空串哈希、0字符、错误行号；取消版本检查不能解决问题。
- 顺序读取、不同文件并发和字符分页并发：成功且回执正确。
- 原始小文本与冻结编译文件的前后哈希一致。

复现脚本：`.test-data/qianhe-prd-20261010/reproduce-read-concurrency.mjs`。原始证据：`.test-data/qianhe-prd-20261010/repro-read-concurrency-2026-10-10T01-26-46-336Z/evidence.json`。源码验证：`.test-data/qianhe-prd-20261010/read-concurrency-fix-validation.json`。

## 最小变更

`main/authorized-read.ts` 的 `virtualReads` 临时映射原来仅由 mount/path 生成键。同文件并发调用覆盖同一键，Pi 原生读取填充后一个引用，前一个引用保留空值；任一调用结束还会删除共享键。

现在为每次行分页调用加入独立随机标识，并参与虚拟路径哈希。每个调用拥有自己的引用与清理键；调用 ID 即使重复也不会发生覆盖。随机标识只用于内部映射，不创建虚拟磁盘文件，不进入业务来源路径。继续使用 Pi 官方读取、分页和截断；授权检查、源内容哈希校验、来源回执和字符分页规则保持原语义。

流程图源：`docs/authorized-read-concurrency-2026-10-10.mmd`。本改动是现有读取适配器的局部纠错，没有新增或替换通用 Agent 能力。

## 验收与限制

新增 `tests/authorized-read-concurrency.test.ts`：同文件四页并发分别覆盖带/不带哈希，校验返回正文及各页来源哈希、字符数、行范围；另核验一个真实版本冲突只拒绝该页，并且后续读取正常。修复前前两项失败，修复后三项通过。

执行命令：

```powershell
node --import tsx --test tests/authorized-read-concurrency.test.ts tests/workflow-source-preview.test.ts tests/skills.test.ts tests/global-skills-service.test.ts
```

结果：24项通过、0失败，覆盖授权撤销、异步授权拒绝、真实 Word 文本读取、长单行字符续读及来源版本冲突。未运行全量测试、构建、打包或云调用；没有修改 `dist`、live profile 或正在运行的脚本。根代理待真实 Run 终态后统一集成检查与构建，该修复不能被描述为已作用于当前 Run。

通俗解释：同时读同一文件的几页时，每页现在各自保存临时记录，避免相互覆盖。资料没有变化时不应误报变化，读取过的内容也不能被记成“没读到”。
