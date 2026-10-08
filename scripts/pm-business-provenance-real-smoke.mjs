// Run: node --import tsx scripts/pm-business-provenance-real-smoke.mjs [authorized-xlsx]
// This is a real Office/Service provenance regression, not a cloud-model or
// business-quality evaluation. All writes stay inside a newly created project.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReadStream, constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import ExcelJS from 'exceljs';
import {Service} from '../main/service.ts';
import {Store} from '../main/store.ts';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const authorizedRoot = path.resolve('E:\\code\\slash test');
const requestedSource = path.resolve(process.argv[2] ?? path.join(authorizedRoot, '资源', '参考资料', '字段梳理', '05 网点主数据.xlsx'));
const within = (root, target) => {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
};
assert.ok(within(authorizedRoot, requestedSource), 'Source must be inside the authorized real reference project');
assert.equal(path.extname(requestedSource).toLowerCase(), '.xlsx');
const originalInfo = await fs.lstat(requestedSource);
assert.ok(originalInfo.isFile() && !originalInfo.isSymbolicLink(), 'Source must be a regular XLSX');
const source = await fs.realpath(requestedSource);
assert.ok(within(await fs.realpath(authorizedRoot), source), 'Resolved source must remain inside the authorized reference project');
await fs.mkdir(path.join(repo, '.test-data'), {recursive: true});
const runRoot = await fs.mkdtemp(path.join(repo, '.test-data', 'pm-business-provenance-real-'));
const project = path.join(runRoot, 'project');
const profile = path.join(runRoot, 'profile');
assert.ok(within(path.join(repo, '.test-data'), project));
const reportPath = path.join(runRoot, 'report.json');
const sha = async filename => {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(filename)) hash.update(bytes);
  return hash.digest('hex');
};
const sourceBefore = await sha(source);
const report = {
  startedAt: new Date().toISOString(), runRoot, project, profile, source,
  status: 'running', modelExecuted: false, cloudExecuted: false, buildPerformed: false,
  boundary: 'Real XLSX extraction and Service provenance/persistence regression. PRD is an explicit test fixture, not AI output. Version-current does not establish business semantics or interaction quality.',
  sourceSha256Before: sourceBefore,
  fixedCoordinates: {sheet: '03 机会门店主数据', field: 'D2', source: 'F2', createVisible: 'O2', changeAllowed: 'P2'},
  sourceVersions: {}, checks: {}, assertions: [],
};
let store, service, keyCalls = 0, runtimeCalls = 0;
const check = (name, action) => { action(); report.assertions.push({name, status: 'passed'}); };
const newService = () => new Service(store, () => {keyCalls++; throw Error('MODEL_CALL_FORBIDDEN');}, () => {}, async () => {runtimeCalls++; throw Error('MODEL_CALL_FORBIDDEN');});
async function closeService() {
  if (service) {
    assert.equal(service.active.size + service.starting.size, 0, 'No model run may exist in this regression');
    service.dispose();
    await Promise.allSettled([...service.agentIndex.queues.values()]);
    service = undefined;
  }
  if (store) {store.close(); store = undefined;}
}
function locateMount(view, role) {
  const node = view.appliedNodes.find(item => item.role === role);
  assert.ok(node?.path, 'Applied project tree must contain role ' + role);
  const mount = service.state.mounts.find(item => path.resolve(item.path).toLowerCase() === path.resolve(service.state.root, node.path).toLowerCase());
  assert.ok(mount?.enabled, 'Applied role must map to an enabled mount');
  return mount;
}
function summarize(view) {
  const item = view.items[0];
  return {workspaceId: view.workspaceId, revision: view.revision, notice: view.notice,
    itemStatus: item.status, constraintStatus: item.constraint.status,
    sourceChecks: item.sourceChecks, implementations: item.implementations.map(value => ({status: value.status, contentHash: value.ref.contentHash, actualHash: value.actualHash})),
    counts: view.counts};
}
function assertChain(view, expected, receipt, hashes) {
  assert.equal(view.items.length, 1);
  const item = view.items[0], direct = item.sourceChecks[0], chain = direct.provenance;
  assert.equal(item.constraint.status, 'candidate');
  assert.equal(item.status, expected === 'current' ? 'current' : 'stale');
  assert.equal(direct.status, 'current', 'Unchanged extracted text keeps its direct version status');
  assert.ok(chain, 'Registered processed output must expose its processing chain');
  assert.equal(chain.kind, 'processing_chain');
  assert.equal(chain.receiptId, receipt.changeId);
  assert.equal(chain.operation, 'extract_text');
  assert.equal(chain.status, expected);
  assert.equal(chain.stages.original.status, expected === 'current' ? 'current' : 'changed');
  assert.equal(chain.stages.original.expectedHash, hashes.originalBefore);
  assert.equal(chain.stages.original.actualHash, expected === 'current' ? hashes.originalBefore : hashes.originalAfter);
  assert.equal(chain.stages.copy.status, 'current');
  assert.equal(chain.stages.copy.expectedHash, hashes.copy);
  assert.equal(chain.stages.copy.actualHash, hashes.copy);
  assert.equal(chain.stages.output.status, 'current');
  assert.equal(chain.stages.output.expectedHash, hashes.output);
  assert.equal(chain.stages.output.actualHash, hashes.output);
  assert.equal(item.implementations.length, 1);
  assert.equal(item.implementations[0].status, 'current');
  assert.equal(view.passed, undefined);
}

try {
  report.codeSha256 = {};
  for (const relative of ['scripts/pm-business-provenance-real-smoke.mjs', 'main/service.ts', 'main/business-rules.ts', 'shared/business-rules.ts', 'main/office-extraction.ts']) report.codeSha256[relative] = await sha(path.join(repo, relative));
  store = new Store(profile); service = newService();
  await service.workspace(project);
  service.setPermission('workspace_read', 'allow'); service.setPermission('artifact_write', 'allow');
  check('fresh isolated project has no old runs or conversations', () => {assert.equal(service.state.runs.length, 0); assert.equal(service.state.conversations.length, 0); assert.equal(path.resolve(service.state.root), path.resolve(project));});
  const tree = await service.projectTreeGet(), resource = locateMount(tree, 'resource'), output = locateMount(tree, 'output');
  const isolatedRelative = '参考资料/真实资料回归/05 网点主数据.xlsx';
  const isolatedOriginal = path.join(resource.path, isolatedRelative);
  assert.ok(within(project, isolatedOriginal));
  await fs.mkdir(path.dirname(isolatedOriginal), {recursive: true});
  await fs.copyFile(source, isolatedOriginal, constants.COPYFILE_EXCL);
  const isolatedBefore = await sha(isolatedOriginal);
  check('real reference copied byte-for-byte into the isolated project', () => assert.equal(isolatedBefore, sourceBefore));
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(isolatedOriginal);
  const sheet = workbook.getWorksheet(report.fixedCoordinates.sheet);
  check('fixed opportunity sheet and field coordinates match the true source', () => {
    assert.ok(sheet); assert.equal(sheet.getCell('D2').value, '网点编码'); assert.equal(sheet.getCell('F2').value, '自动计算');
    assert.equal(sheet.getCell('O1').value, '新增页面展示'); assert.equal(sheet.getCell('O2').value, '是');
    assert.equal(sheet.getCell('P1').value, '是否允许前端发起变更修改'); assert.equal(sheet.getCell('P2').value, '否');
  });
  const copy = await service.copyForProcessing({mountId: resource.id, path: isolatedRelative});
  const processingMount = service.state.mounts.find(item => item.id === copy.copy.mountId);
  const copyAbsolute = path.join(processingMount.path, copy.copy.path);
  check('registered processing copy preserves the original hash and stays isolated', () => {assert.equal(copy.source.contentHash, sourceBefore); assert.ok(within(project, copyAbsolute));});
  const receipt = await service.processProcessingCopy(copy.id, 'extract_text');
  check('actual extraction creates a pending ChangeSet', () => assert.equal(service.state.changes.find(item => item.id === receipt.changeId)?.status, 'pending'));
  await service.apply(receipt.changeId);
  const txtMount = service.state.mounts.find(item => item.id === receipt.output.mountId), txtAbsolute = path.join(txtMount.path, receipt.output.path);
  const txt = await fs.readFile(txtAbsolute, 'utf8'), outputHash = await sha(txtAbsolute), copyHash = await sha(copyAbsolute);
  const persistedReceipt = store.get('processing-result:' + receipt.changeId, null);
  check('applied processed output has a workspace identity and exact output hash receipt', () => {assert.ok(persistedReceipt.workspaceId); assert.equal(persistedReceipt.outputHash, outputHash); assert.equal(service.state.changes.find(item => item.id === receipt.changeId)?.status, 'applied');});
  const lines = txt.replace(/\r\n|\r/g, '\n').split('\n'), sheetStart = lines.findIndex(line => line === '工作表: "03 机会门店主数据"');
  assert.ok(sheetStart >= 0); const nextSheet = lines.findIndex((line, index) => index > sheetStart && line.startsWith('工作表: '));
  const sheetEnd = nextSheet < 0 ? lines.length : nextSheet;
  const start = lines.findIndex((line, index) => index > sheetStart && index < sheetEnd && line.startsWith('D2: '));
  const end = lines.findIndex((line, index) => index > start && index < sheetEnd && line.startsWith('P2: '));
  assert.ok(start >= 0 && end > start);
  const quote = lines.slice(start, end + 1).join('\n');
  check('extracted evidence binds to opportunity sheet D2/F2/O2/P2', () => {assert.match(quote, /D2: "文本: 网点编码"/); assert.match(quote, /F2: "文本: 自动计算"/); assert.match(quote, /O2: "文本: 是"/); assert.match(quote, /P2: "文本: 否"/);});
  const conversation = service.conversation(undefined, '真实资料来源链隔离回归（非模型任务）');
  const requirement = await service.recordRequirement(conversation, {title: '测试夹具：机会网点编码来源链', summary: '仅验证已登记处理链的版本状态与持久化。', status: 'draft', sources: [{id: 'real-xlsx-extracted', mountId: receipt.output.mountId, relativePath: receipt.output.path, locator: '03 机会门店主数据 D2/F2/O2/P2'}], assumptions: [], pendingQuestions: [], confirmedFacts: []});
  const recorded = await service.recordBusinessConstraints(conversation, {requirementId: requirement.id, constraints: [{id: 'opportunity-code-change', fieldKey: '网点编码', dimension: 'change_allowed', rawValue: '否', interpretation: '候选解释：前端不允许修改编码；此回归不判定业务含义。', stage: '机会门店', status: 'candidate', sourceRefIds: ['real-xlsx-extracted'], sourceEvidence: [{sourceRefId: 'real-xlsx-extracted', locator: '03 机会门店主数据 D2/F2/O2/P2（P1：是否允许前端发起变更修改）', startLine: start + 1, endLine: end + 1, quote}]}]});
  const prdRelative = 'PRD/来源链回归测试夹具.md', prdAbsolute = path.join(output.path, prdRelative);
  const prd = '# 测试夹具：非 AI 输出，仅用于来源链版本回归\n机会门店网点编码由系统自动计算；新增页面展示；前端不可修改。\n';
  await fs.mkdir(path.dirname(prdAbsolute), {recursive: true}); await fs.writeFile(prdAbsolute, prd, {flag: 'wx'});
  await service.bindBusinessImplementation(conversation, {requirementId: requirement.id, bindings: [{constraintId: 'opportunity-code-change', mountId: output.id, path: prdRelative, locator: '测试夹具第2行', startLine: 2, endLine: 2, quote: prd.split('\n')[1]}]});
  const hashes = {originalBefore: isolatedBefore, copy: copyHash, output: outputHash, prd: await sha(prdAbsolute)};
  const current = await service.checkBusinessRules({requirementId: requirement.id});
  check('applied real extraction chain and fixture binding are version-current', () => assertChain(current, 'current', receipt, hashes));
  report.checks.beforeMutation = summarize(current);
  sheet.getCell('P2').value = '是';
  await workbook.xlsx.writeFile(isolatedOriginal);
  hashes.originalAfter = await sha(isolatedOriginal);
  const mutated = new ExcelJS.Workbook(); await mutated.xlsx.readFile(isolatedOriginal);
  check('only the isolated original is changed as a valid XLSX', () => {assert.notEqual(hashes.originalAfter, hashes.originalBefore); assert.equal(mutated.getWorksheet(report.fixedCoordinates.sheet).getCell('P2').value, '是');});
  assert.equal(await sha(txtAbsolute), outputHash); assert.equal(await sha(copyAbsolute), copyHash); assert.equal(await sha(prdAbsolute), hashes.prd);
  report.assertions.push({name: 'processed text, registered copy and fixture PRD remain untouched', status: 'passed'});
  const stale = await service.checkBusinessRules({requirementId: requirement.id});
  check('unchanged text cannot mask a changed original; chain and whole rule become stale', () => assertChain(stale, 'stale', receipt, hashes));
  report.checks.afterMutation = summarize(stale);
  report.identities = {conversationId: conversation, requirementId: requirement.id, constraintId: 'opportunity-code-change', processingCopyId: copy.id, processingReceiptId: receipt.changeId, workspaceId: current.workspaceId};
  report.paths = {isolatedOriginal, registeredCopy: copyAbsolute, extractedText: txtAbsolute, fixturePrd: prdAbsolute};
  report.sourceVersions = hashes;
  report.sourceEvidenceLocator = {sheet: report.fixedCoordinates.sheet, startLine: start + 1, endLine: end + 1, quoteHash: createHash('sha256').update(quote).digest('hex')};
  report.persistedConstraintHash = recorded.businessConstraints.find(item => item.id === 'opportunity-code-change').sourceSnapshots[0].contentHash;
  await closeService();
  store = new Store(profile); service = newService(); await service.initializeDefaultProject();
  check('new Store and Service restore only the isolated project without replay', () => {assert.equal(path.resolve(service.state.root), path.resolve(project)); assert.equal(service.state.runs.length, 0); assert.equal(service.state.conversations.length, 1); assert.equal(service.state.changes.find(item => item.id === receipt.changeId)?.status, 'applied');});
  const restored = await service.checkBusinessRules({requirementId: requirement.id});
  check('original-stale/text-current/implementation-current survives Service restart', () => {assert.equal(restored.workspaceId, current.workspaceId); assertChain(restored, 'stale', receipt, hashes); assert.equal(store.get('processing-result:' + receipt.changeId, null).outputHash, outputHash); assert.equal(restored.items[0].constraint.sourceSnapshots[0].contentHash, outputHash);});
  report.checks.afterRestart = summarize(restored);
  check('no credential or model runtime has been invoked', () => {assert.equal(keyCalls, 0); assert.equal(runtimeCalls, 0);});
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  try {await closeService();} catch (error) {report.status = 'failed'; report.cleanupError = error instanceof Error ? error.message : String(error); process.exitCode = 1;}
  report.sourceSha256After = await sha(source); report.originalUnchanged = report.sourceSha256After === sourceBefore;
  if (!report.originalUnchanged) {report.status = 'failed'; process.exitCode = 1;}
  report.keyCalls = keyCalls; report.runtimeCalls = runtimeCalls; report.finishedAt = new Date().toISOString();
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), {flag: 'wx'});
  console.log(JSON.stringify({status: report.status, assertions: report.assertions.length, originalUnchanged: report.originalUnchanged, modelExecuted: false, reportPath, ...(report.error ? {error: report.error} : {})}));
}
