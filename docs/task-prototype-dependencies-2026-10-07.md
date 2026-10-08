# 混合成果草稿的原型依赖

QE16 首轮草稿的 HTML 登记哈希与实际 Change 一致。Task 适配器把同目录 PRD.md、约束对照.md 当成浏览器快照依赖，预览快照既有格式规则拒绝 Markdown，随后 Service 将路径错误映射为 TARGET_CHANGED。这个错误会在浏览器执行之前中止 HTML 的静态、DOM 和内容审查；保存之后同一内容恢复可读不能说明原草稿内容曾变化。

`shared/prototype-acceptance.ts` 的 `isPrototypeSnapshotPath` 原样复用既有 Web 文件格式规则。`main/service.ts` 依赖选择、`main/prototype-acceptance.ts` 的草稿 overlay 和磁盘快照使用同一规则，避免允许类型漂移。仅从原型依赖中排除不支持的格式；Markdown 仍作为独立 Task 输出参与检查。

未扩大允许后缀，未改变 mount、目录范围、祖先归属、版本哈希、基础文件冲突、符号链接及数量/体积限制。CSS、JS 与子目录资源继续绑定实际 Change 和 hash；发生原件冲突或依赖编辑时不能沿用旧报告。

`tests/task-prototype-dependencies.test.ts` 使用真实 Service、Store、Files、PrototypeAcceptanceDomain 和模拟运行时。混合 HTML、两份 Markdown 与子目录 CSS 的快照包含 HTML/CSS，文档仍保留为独立输出，静态检查恢复执行。故意改变 CSS 内容或正式基础文件仍被拒绝，所有成果保持 pending；没有浏览器适配器时 DOM 检查仍为 unverified。专项不代替正式浏览器验收或真实模型自动修稿。

流程源文件见 `docs/diagrams/task-acceptance.mmd`；候选定位证据保留在 `.test-data/task-prototype-dependency-candidate/` 和真实 QE16 case 内。生产集成后的真实复测由根代理统一构建后执行。

通俗解释：网页检查只读取它能预览的文件，需求文档接受自己的检查。系统仍会阻止读取不属于当前任务的草稿，以及继续使用已经被修改的文件版本。
