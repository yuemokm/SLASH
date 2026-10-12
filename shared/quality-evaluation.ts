/** Offline business benchmark contract. Model self-report never satisfies a check. */
export type EvaluationStatus = 'satisfied' | 'violated' | 'unknown';
export type EvaluationEvidenceKind = 'business_review' | 'browser' | 'runtime';
export interface BenchmarkCheck {
  id: string;
  expected: string;
  basis: 'verified_source' | 'test_requirement';
  sourceIds: string[];
  locator: string;
  evidenceKind: EvaluationEvidenceKind;
}
export interface BenchmarkCase {
  id: string;
  title: string;
  requirementIds: string[];
  prompts: string[];
  checks: BenchmarkCheck[];
  requiresSavedArtifact: boolean;
}
export interface BenchmarkObservation {
  checkId: string;
  status: EvaluationStatus;
  kind: EvaluationEvidenceKind;
  artifactSha256: string;
  evidencePath: string;
  evidenceSha256?: string;
  observer: string;
  note: string;
}
export interface BenchmarkResult {
  schemaVersion: 1;
  caseId: string;
  execution: 'not_executed' | 'generated' | 'failed' | 'verification_invalid';
  elapsedMs: number | 'unknown';
  manualModificationCount: number | 'unknown';
  checks: Array<BenchmarkCheck & {status: EvaluationStatus; observation?: BenchmarkObservation}>;
  counts: Record<EvaluationStatus, number>;
  missingItems: string[];
  verdict: EvaluationStatus;
}
export function evaluateBenchmark(testCase: BenchmarkCase, observations: BenchmarkObservation[] = [], execution: BenchmarkResult['execution'] = 'not_executed'): BenchmarkResult {
  const ids = new Set(testCase.checks.map(check => check.id));
  const seen = new Set<string>();
  for (const observation of observations) {
    if (!ids.has(observation.checkId) || seen.has(observation.checkId)) throw Error('EVALUATION_CHECK_ID_INVALID');
    seen.add(observation.checkId);
    const check = testCase.checks.find(item => item.id === observation.checkId)!;
    if (!['satisfied', 'violated', 'unknown'].includes(observation.status) || observation.kind !== check.evidenceKind) throw Error('EVALUATION_EVIDENCE_KIND_INVALID');
    if (!/^[a-f0-9]{64}$/.test(observation.artifactSha256) || !observation.evidencePath.trim() || !observation.observer.trim() || !observation.note.trim()) throw Error('EVALUATION_EVIDENCE_REQUIRED');
    if (execution !== 'generated') throw Error('EVALUATION_OUTPUT_NOT_GENERATED');
  }
  const checks = testCase.checks.map(check => {
    const observation = observations.find(item => item.checkId === check.id);
    return {...check, status: observation?.status ?? 'unknown' as EvaluationStatus, ...(observation ? {observation} : {})};
  });
  const counts = {satisfied: 0, violated: 0, unknown: 0};
  checks.forEach(check => counts[check.status]++);
  return {schemaVersion: 1, caseId: testCase.id, execution, elapsedMs: 'unknown', manualModificationCount: 'unknown', checks, counts,
    missingItems: checks.filter(check => check.status === 'unknown').map(check => check.id),
    verdict: counts.violated ? 'violated' : counts.unknown || execution !== 'generated' ? 'unknown' : 'satisfied'};
}

export const BUSINESS_BENCHMARK_BASE_PROMPT = '基于提供的真实资料设计机会门店新建模块。按业务对象和阶段核对字段，交付中文模块PRD、可交互自包含HTML和来源/落实对照。未知的接口与规则在PRD或Slash交付说明中明确待确认。原型页面只呈现业务内容和正常操作反馈，不展示制作注释、演示标签或未接通接口等元说明；本地数据与未真实集成范围在Slash交付说明如实保留。使用write_draft保存成果。';
const basePrompt=BUSINESS_BENCHMARK_BASE_PROMPT;
const check = (id: string, expected: string, sourceIds: string[], locator: string, evidenceKind: EvaluationEvidenceKind = 'business_review', basis: BenchmarkCheck['basis'] = 'verified_source'): BenchmarkCheck => ({id, expected, sourceIds, locator, evidenceKind, basis});
const opportunity = '网点表：03 机会门店主数据';
/** Expectations are independently checked against source bytes by prepareBusinessBenchmark. */
const RAW_BUSINESS_BENCHMARK_CASES: Omit<BenchmarkCase,'requiresSavedArtifact'>[] = [
  {id: 'QE01', title: '机会门店编码业务对象', requirementIds: ['PF05', 'F09'], prompts: ['只针对机会门店网点编码写字段定义和模块PRD，保留来源坐标，勿套用终端网点规则。'], checks: [check('QE01-code', '自动计算、唯一，格式JHWD+10位顺序码；对照终端ZDWD仅为另一业务对象。', ['fields'], opportunity+' D2/F2/I2/K2；01终端网点主数据 D4/K4')]},
  {id: 'QE02', title: '必填与正式落库阶段', requirementIds: ['F08', 'F09'], prompts: ['分析机会门店新建与正式建档的必填规则，列出已知及待确认条件，不将全部必填机械当作首次新建必录。'], checks: [check('QE02-phase', '区分必填、仅正式落库使用和生命周期阶段；未明确对应关系的字段保留待确认。', ['fields','policy'], opportunity+' A1/H1；制度1.2')]},
  {id: 'QE03', title: '新增展示与后续变更', requirementIds: ['F09'], prompts: ['生成机会门店编码、名称在创建和后续变更两种操作下的字段矩阵及PRD，逐项引用坐标。'], checks: [check('QE03-dimensions', '编码和名称新增展示为是，前端发起变更为否；创建展示不等于手填编码。', ['fields'], opportunity+' F2/O2/P2/F3/O3/P3')]},
  {id: 'QE04', title: '名称录入与长度', requirementIds: ['F09','F10'], prompts: [basePrompt+'重点落实名称手工录入、50字符限制及命名规则说明。'], checks: [check('QE04-name', '名称手工录入、长度50，并保留命名说明来源。', ['fields'], opportunity+' D3/F3/G3/K3'), check('QE04-boundary', '浏览器实测名称50与51字符边界，明确校验反馈。', [], '测试输入：50与51个中文字符', 'browser', 'test_requirement')]},
  {id: 'QE05', title: '导入资料矛盾', requirementIds: ['F08'], prompts: ['核对制度与新增流程对机会门店后台导入的描述。输出冲突位置、适用阶段与明确待确认问题，不仅凭文件版本号裁决。请使用write_draft保存一份聚焦此问题的资料研究报告到约束对照.md，不仅在对话中回复。'], checks: [check('QE05-conflict', '制度限定上线初期批量导入/后续SFA手工，流程含后台导入；阶段/生效范围待确认。', ['policy','flow'], '制度提取行332；流程步骤20')]},
  {id: 'QE06', title: '判重服务边界', requirementIds: ['F09','F10'], prompts: [basePrompt+'重点设计提交、重复校验和异常反馈，区分原文流程与演示服务。'], checks: [check('QE06-duplicate', '流程步骤50提交、60系统和AI校验重复，具体判重字段和接口未明确，不虚构已接入服务。', ['flow'], '新增机会门店步骤50/60'), check('QE06-demo', '成功、重复、失败三条本地结果可实际操作并具有对应正常业务反馈；不要求页面展示演示或制作说明。', [], '模拟场景切换后提交', 'browser', 'test_requirement')]},
  {id: 'QE07', title: '生命周期定义', requirementIds: ['F09'], prompts: ['依据制度写机会门店与合作中门店的阶段定义和转化前置条件，明确资料未给出的条件。'], checks: [check('QE07-lifecycle', '机会门店未完成正式建档必录字段；合作中门店已完成；不得将模拟提交视为真实转化。', ['policy'], '门店生命周期1.2')]},
  {id: 'QE08', title: '来源与新增完整流程', requirementIds: ['F09'], prompts: ['根据新增机会门店流程写聚焦模块PRD，覆盖不同来源、信息填写、提交和系统判重，保留角色/系统归属与未知项。'], checks: [check('QE08-flow', 'POI推送、到店直接新建/后台导入、填写、提交、MDM+外部系统判重有来源；导入与制度冲突保留。', ['flow','policy'], '新增机会门店步骤10–70；制度行332')]},
  {id: 'QE09', title: '编码只读原型', requirementIds: ['F10'], prompts: [basePrompt+'新建页面应展示无法手填的编码；系统计算依据及未确认分配时机保留在PRD或Slash交付说明，不要求界面展示未知机制说明。'], checks: [check('QE09-readonly', '浏览器确认编码新增展示且无法手填；编码占位或示例值不能当作已验证的MDM分配，未集成范围写在Slash交付说明。', ['fields'], opportunity+' F2/O2/P2', 'browser')]},
  {id: 'QE10', title: '核心原型提交状态', requirementIds: ['F10'], prompts: [basePrompt+'用本地数据实现成功、重复、服务失败三种完整交互，界面使用正常业务反馈而非演示标签，失败保留输入可再提交，禁止调用业务网络；未集成范围写在Slash交付说明。'], checks: [check('QE10-states', '实际浏览器填写提交，分别看到成功/重复/失败结果，失败保留输入，无无反馈死按钮。', [], '模拟三条提交路径', 'browser', 'test_requirement')]},
  {id: 'QE11', title: '移动与桌面可用性', requirementIds: ['F10'], prompts: [basePrompt+'优先手机390×844，并兼容1280×800和1440×900，确保表单、提交及反馈完整可见可操作。'], checks: [check('QE11-viewports', '三种尺寸无横向溢出；关键控件可见可点，中文标签无遮挡；保存截图供人审。', [], '390×844、1280×800、1440×900', 'browser', 'test_requirement')]},
  {id: 'QE12', title: 'PRD与原型一致性', requirementIds: ['F09','F10'], prompts: [basePrompt], checks: [check('QE12-trace', '编码和名称的录入、展示、变更权限在PRD和原型相符，每项规则有表名/单元格或流程位置。', ['fields','flow'], opportunity+' 行2/3；流程步骤50/60')]},
  {id: 'QE13', title: '评审后名称修改', requirementIds: ['F11','F12'], prompts: [basePrompt, '评审意见：名称长度限制提示不明显。只增强名称输入处和提交错误提示的可读性，同步PRD交互说明与对照记录，保留原50字符规则及其它字段行为。'], checks: [check('QE13-revision', '实际差异覆盖HTML/PRD/对照，50字符业务规则保留，修改后的名称校验可操作。', ['fields'], opportunity+' G3/K3'), check('QE13-versions', '每轮有真实Run、成果哈希和保存版本，原件前后哈希一致。', [], '官方IPC版本/差异回执', 'runtime', 'test_requirement')]},
  {id: 'QE14', title: '明确覆盖旧规则的评审', requirementIds: ['F11','F12'], prompts: [basePrompt, '本次演示方案明确采用临时试点例外：新建时销售人员可手填网点编码，后续仍不可变更。只改本次PRD和原型，旧资料保留原样。说明此要求与原资料的冲突和影响，不伪称已有制度支持。'], checks: [check('QE14-override', '实现明确的本次试点手填例外，后续不可变更，标明用户测试要求覆盖旧规则及依据；不修改参考原件。', ['fields'], opportunity+' F2/P2'), check('QE14-scope', '原件哈希一致，成果版本/修改差异可定位。', [], '官方IPC修改记录及sourceChecks', 'runtime', 'test_requirement')]},
  {id: 'QE15', title: '不明确的编码变更范围', requirementIds: ['F08','F12'], prompts: [basePrompt, '评审希望编码可编辑，请指出受影响的创建与后续变更规则，给出需要澄清的具体范围问题。此轮只输出评审分析，不修改文件。'], checks: [check('QE15-clarify', '指出自动计算/前端不可变更来源，询问仅新建还是后续变更等具体范围；未擅改成果。', ['fields'], opportunity+' F2/O2/P2'), check('QE15-no-edit', '第二轮成果字节/版本保持一致，实际操作记录无成果写入。', [], '第二轮前后hash与版本/操作记录', 'runtime', 'test_requirement')]},
  {id: 'QE16', title: '三轮修改与回归', requirementIds: ['F12','F14'], prompts: [basePrompt, '改为失败提示显示在提交按钮旁，失败保留全部输入。同步PRD，业务规则保持现有资料。', '第二次评审：增强重复结果的查看反馈，并复测之前失败保留输入、编码只读和名称长度边界。保存修改与回归记录。'], checks: [check('QE16-regression', '第三轮实际浏览器重复反馈、失败保留输入、编码只读、名称边界同时有效。', ['fields','flow'], opportunity+' 行2/3；流程60', 'browser'), check('QE16-history', '三轮同会话均可定位到真实Run/版本/差异，未把前轮功能回退或对话回答当作修改。', [], '三轮官方IPC回执', 'runtime', 'test_requirement')]},
];
export const BUSINESS_BENCHMARK_CASES: BenchmarkCase[]=RAW_BUSINESS_BENCHMARK_CASES.map(testCase=>({...testCase,requiresSavedArtifact:testCase.id!=='QE02'}));
