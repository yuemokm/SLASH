# 真实PRD有限验收：未证明语义质量提升

日期：2026-10-12。需求 F02/F10/F12、PF03/PF05/PF09。样例 **PRD-DIMENSION-HARNESS-20261012**；历史路径 `QE12/PRD.md` 不指原型QE12基准。

候选确实通过生产工具补读、识别隔离资料证据链缺失，并正常给出不通过；**没有指出范围内的D5/D6合并格说明错误，因此未证明PRD审稿质量提升**。没有据此改变默认PRD审查、自动改稿或应用变更。

## 真实结果与构建边界

| 路径 | 实际结果 | 证据与限制 |
| --- | --- | --- |
| wire4基线 | 1个HTTP，163.673秒，正常completed；2条引用绑定无效，最终unverified/invalid | 启动15:00:36Z，跨最终build的15:02:08Z；结束编译hash锁拒绝。原始finding正文未持久化，无法区分身份与原句失配，语义未验证，不能直接算漏检 |
| 独立候选 | 1个审查会话，5个HTTP均completed，144.261秒，10次只读工具，disapproved，upstreamApproved=false，exit0 | 从当前完整dist复制到专属runtime快照，所有锁定产物及原文件hash保持；不是与旧基线的公平A/B |

候选实际工具：read_draft 1次、read_file 3次、read_spreadsheet_field_evidence 3次、get_task_acceptance 3次。实际用量累计176658 totalTokens，其中cacheRead 133120；配置cost=0不表示免费。保留240秒观察、12工具上限及0外层重试，没有补跑。候选供应商终态与工具受控可达不等于真实供应商取消、故障恢复或语义稳定性均已通过。

两路均使用相同已冻结PRD全文、63164字符来源全文及原限定请求，详见[准备记录](harness-prd-semantic-validation-2026-10-12.md)。原请求hash为 `3bf5bd543ad08d08907268dbbec8a378653492c8ed49992fa4da3ea6dc636092`。生产请求只追加当前真实mount映射；各路contract request hash不同，完整值分别在下列JSON内。基线选段18159字符、prompt34597；候选选段18209字符、prompt34650；14关键格和预先冻结的12处来源引文均覆盖。动态身份造成选段边缘差异，不宣称提示逐字相同或严格单变量。

- [基线独立记录（含inputHash/promptHash、contract请求hash、构建时间及语义未验证项）](../.test-data/harness-prd-semantic-9f66b39e-8ba0-4e35-90ad-4e158f09316f/baseline/independent-observation.json)
- [基线原回执](../.test-data/harness-prd-semantic-9f66b39e-8ba0-4e35-90ad-4e158f09316f/baseline/receipt.json)
- [候选实际结果（含各输入hash、工具与sourceRead回执）](../.test-data/harness-prd-semantic-df03d96a-296b-4ea1-bddf-f8470c1b35ef/candidate/result.json)
- [候选原始审查文本](../.test-data/harness-prd-semantic-df03d96a-296b-4ea1-bddf-f8470c1b35ef/candidate/auditor-output.txt)与[独立逐项判断](../.test-data/harness-prd-semantic-df03d96a-296b-4ea1-bddf-f8470c1b35ef/candidate/independent-judgement.json)。仅最终审查正文，无密钥、请求头或思考原文。

## 独立语义判断

- **范围内漏检1项**：PRD第75行错误称D5/D6为合并格，来源实际为字段规则区域K5:K7；候选未指出，相关证据实际可见。
- **范围外旧差异未提及，不扣为任务失败**：网点编码展示与03表N2/O2不符，属于两目标行之外；本次completion auditor只核限定成果，无需强制全稿审查。未越界扩修。
- **准确的fixture限制**：仅复制了真实提取文本，未包含原XLSX及已登记提取链；正式字段工具不能证明原Excel。候选识别此缺口并保留不通过，属于环境识别能力。
- **保留误报边界**：候选建议因证据链缺失将确定值写为unknown，只适用于本隔离验收的不确定性，不能推回原实际资料环境，不能据此判原真实PRD事实错误或改其合法内容。没有应用该建议。
- 候选保留首次定位只读、F/P两个维度及详细地址可编辑；未见01/02同名字段移植。宿主业务状态仍unverified，模型没有升级成业务通过。

实际配置/路由业务标签均为wangshu/gpt-6-astra，同一entry。回执 `baishan/gpt-6-astra` 是既有 `OPENAI_COMPATIBLE_RUNTIME_PROVIDER='baishan'` 内部注册别名；两路端点hash和代理hash一致（详见独立JSON），不是新auditor改供应商。未打印地址或凭据；传输诊断只记安全计数，不保存请求URL。

生产 `Service.taskContentReviewInput` 与 `Runtime.reviewGoalCompletion`、原Service网关均真实调用；历史稿由离线fixture导入，未调用生成模型。defaultTaskEligibility=false，本PRD不属于新增默认auditor触发路径。原稿、来源、profile及旧基线证据保留；未apply、未打包。

流程：[Mermaid源](harness-prd-real-acceptance-2026-10-12.mmd)。通俗解释：新审查会找资料，也能发现“缺少原Excel证明”；但它漏掉了本次允许修改的一处文字错误，现在不能说审稿更准。
