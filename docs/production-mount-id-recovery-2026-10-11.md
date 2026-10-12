# 未知保存目录编号的可恢复诊断

需求/验收标识：QE12-unknown-mount-id-recovery。关联 PM 成果保存与工具可恢复性要求；不改变项目 Skill 的前置规则，不新增目录查询能力。

实际 QE12 新生成变体 Run b7314551-0bea-4fa5-b8db-f164ff41ecce 在原 session 86618 中发送一次，1129999ms后 runner 失败 EVALUATION_NO_SAVED_ARTIFACT。host loop succeeded只是执行结束；acceptance unverified、outputCount=0、repairRounds=0。5次write_draft将本Run正确 mountId 的 a0ad 写为 a0da，却得到“PERMISSION_DENIED: 目录未授权”，于是改path并最终误称需重新授权。该试次没有PRD/HTML保存成果，仍保留失败，不计原48通过。

最小变更位置：main/files.ts 的精确目录查询，main/service.ts 现有工具catch与unknownDraftMountDiagnostic。真实宿主精确查不到ID才产生 UnknownMountIdError/MOUNT_ID_UNKNOWN，classified correctable/correct_input。已知禁用、只读、越界、物理保护、参考资料、链接、模式、审批、取消、fatal与unknown优先级继续走已有规则。资料正文或普通同code错误不触发恢复名单。

write_draft恢复提示只来自可信 context-manifest 的原Run授权与当前 enabled/write 目录的交集。同ID必须唯一，path与原write身份必须一致。复用 Files.resolve('.',true) 排除实际受保护/不可写目的地；异步核验后再检查授权、权限、Run/manifest绑定。单目录条件不符合便排除该目录；全局Run、权限或manifest绑定变化则清空名单，没有全workspace回退。只展示精确ID和名称，不含路径、资料或凭据；要求照抄ID、遵守原任务路径，不通过改path/申请新权限绕过，不自动选择目录。

HTML beforeArtifactWrite在Files.draft之前读取既有目标；MD直接进入draft。两条均经过原Service gateway与Capability gate。旧收据、hash、schema及数据库历史不迁移，不增加工具/时间预算。

候选证据位于 `.test-data/mount-id-recovery-7021b9e3ad17404582c311270fc09578`：

- 离线受控runtime调用真实Service/Files/Store：15/15，47679.3169ms，session96554 exit0。包含MD/HTML未知ID、同ID异path/write、缺失绑定、参考目录误标write=true、await授权变更、原输入完整保存、自动Operation/recovery状态、取消/unknown、旧历史不改。
- 既有Files与tool-outcome回归14/14，14719.0642ms，session41473 exit0。
- 产品类型检查0；最终产品与新增可移植test类型检查0，types-seal.log。
- 自包含默认测试数据的MD/HTML链1/1，9254.9164ms，session3155 exit0。默认无需历史.test-data；SLASH_MOUNT_ID_PAYLOAD_ROOT仅用于另行离线复用精确原失败payload，SLASH_MOUNT_ID_EVIDENCE可选输出证据。没有复制Service作为持久test fixture。
- 原86618 exit1及六个自有进程全部退出；lock保留，3来源、253Skill、11runtime hash不变。5个实际失败输入按Pi session原字节另存unsaved-attempt-payloads，不登记成果。

所有首轮失败保留：10/11是测试循环未计先前已保存MD；14/15是workspace fixture没有独立“参考资料”挂载；定向原反例记录确切assert.ok(reference)错误，补显式受保护测试挂载后1/1。两轮类型首失败分别为隔离复制漏既有knowledge-web导入、测试tsconfig缺原rewriteRelativeImportExtensions及fixture第六构造参数；修fixture/检查配置后通过，没有放宽产品保护。

可入根测试：tests/mount-id-recovery.test.ts，导入当前main/shared；推荐 `node --import tsx --test --test-concurrency=1 tests/mount-id-recovery.test.ts tests/files.test.ts tests/tool-outcome.test.ts` 和现有 `npm run check`。集成者仅局部移植两文件；候选Service base dd1eb64…fcc0，根已有后续发布变更，不整份覆盖。根集成已完成（production-mount-id-root-integration-20261011/integration.json）：Files原hash吻合，Service只合import、现有catch与新增诊断三处，发布/Word/模板保持。原session38801退出0，npm run check通过（5400ms），上述三文件自包含组合29/29（61734.6686ms），0失败/取消/跳过；根full/build待统一窗口，未作新云任务。首次集成证据脚本在patch已应用后因CRLF匹配失败，随后仅修验证脚本并补回执，未重复patch，失败记录保留。

原未保存HTML还有源代码可证缺口：成功后取消不恢复submit按钮、重复无已有记录入口、服务失败仅靠隐藏名称字符串触发、PRD要求的错误聚焦/成功返回目标门店未实现。手机单行只读地址全文可读仍待实际浏览器。此处不人工改稿、无界面验收、无远端发布或云重跑。

通俗解释：位置已允许，只是编号打错。Agent现在能得到“编号没对上，请照抄这些已允许的编号”，无需误请用户重新授权；保存成功也仍须另做业务质量验收。
