import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { Store } from '../dist/main/store.js';
import { Service } from '../dist/main/service.js';
import { ensureLegacyFixtureMounts, composerTrigger, composerPopup } from './composer-smoke-helpers.mjs';

// Product GUI fixture only: actual host runner and report/screenshot IPC, not a
// model business acceptance result. Owner must build before running this file.
const root = process.cwd(), packaged = process.argv.includes('--packaged');
const index = process.argv.indexOf('--executable');
if (index >= 0 && (!process.argv[index + 1] || process.argv[index + 1].startsWith('--'))) throw Error('--executable requires a path');
const executablePath = index >= 0 ? path.resolve(process.argv[index + 1]) : path.join(root, 'release', 'win-unpacked', 'slash.exe');
const runtime = packaged ? 'packaged' : 'development';
const testRoot = path.resolve(root, '.test-data'), output = path.join(testRoot, `prototype-acceptance-ui-${runtime}-${Date.now()}`), profile = path.join(output, 'profile'), workspace = path.join(output, 'synthetic-project');
for (const file of [output, profile, workspace]) { const relative = path.relative(testRoot, file); assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative)); }
await fs.mkdir(output, { recursive: true });
const evidence = { status: 'running', runtime, packaged, executable: packaged ? executablePath : path.join(root, 'node_modules/electron/dist/electron.exe'), actualExecutable: null, appVersion: null, output, profile, workspace, checks: [], screenshots: [], snapshots: [], pageErrors: [], notice: 'Synthetic local GUI fixture uses real acceptance service, isolated host execution and controlled screenshot IPC. It is not evidence of model-generated business correctness.' };
const file = 'GUI验收/index.html', script = 'GUI验收/app.js';
const html = '<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>验收 GUI 合成页面</title><main><h1>机会门店 GUI 合成演示</h1><label>编码<input id="code" readonly value="JHWD0000000001"></label><label>名称<input id="name" maxlength="50"></label><button id="submit">模拟提交</button><p id="result">尚未提交</p><p>本页仅用于产品 GUI 回归，非真实模型生成物。</p></main><script src="app.js"></script></html>';
const js = "document.querySelector('#submit').onclick=()=>{document.querySelector('#result').textContent='保存成功（模拟）';};";
let mount, exportMount;
const store = new Store(profile), service = new Service(store, () => '', () => {});
try {
  await service.workspace(workspace); await ensureLegacyFixtureMounts(service);
  service.setPermission('workspace_read', 'allow'); service.setPermission('artifact_write', 'allow');
  service.conversation(undefined, '原型验收 GUI 专项'); mount = service.state.mounts.find(value => value.name === '原型'); exportMount = service.state.mounts.find(value => value.name === '产出材料'); assert(mount && exportMount);
  await fs.mkdir(path.join(mount.path, 'GUI验收')); await fs.writeFile(path.join(mount.path, file), html); await fs.writeFile(path.join(mount.path, script), js); service.save();
} finally { service.dispose(); await Promise.allSettled([...service.agentIndex.queues.values()]); store.close(); }
const target = { mountId: mount.id, path: file };
const passingCases = [
  { id: 'code', title: '编码只读', expectedDescription: '模拟编码可见且不可编辑', steps: [{ action: 'assert', assertion: 'readonly', selector: '#code', expected: true }] },
  { id: 'success', title: '模拟提交成功', expectedDescription: '输入后提交显示成功', steps: [{ action: 'fill', selector: '#name', value: '合成验收门店' }, { action: 'click', selector: '#submit' }, { action: 'assert', assertion: 'text', selector: '#result', expected: '保存成功（模拟）', match: 'equals' }] },
];
const failingCase = { id: 'missing-failure', title: '缺少服务失败入口', expectedDescription: '演示失败反馈应有一个明确入口', steps: [{ action: 'assert', assertion: 'count', selector: '#service-error', expected: 1 }] };
let app, page;
const check = (name) => { evidence.checks.push(name); console.log('PASS ' + name); };
const call = async (request) => { const value = await page.evaluate(input => window.pm.request(input), request); assert(value.ok, value.error); return value.data; };
const read = async () => { const view = await call({ type: 'prototypeAcceptanceGet', ...target }); evidence.snapshots.push(view); return view; };
const panel = () => page.getByLabel('原型验收', { exact: true });
const shot = async (name) => { const filename = name + '.png'; await panel().screenshot({ path: path.join(output, filename) }); evidence.screenshots.push(filename); };
const expand = async () => { if (!await panel().evaluate(element => element.open)) await panel().locator(':scope > summary').click(); };
const refresh = async () => { await panel().getByRole('button', { name: '刷新记录', exact: true }).click(); await panel().getByRole('button', { name: '刷新记录', exact: true }).waitFor(); };
const save = async (cases) => { const prior = await read(); await call({ type: 'prototypeAcceptanceSave', ...target, mode: 'build', title: 'GUI 合成验收', cases, sourceRefs: [], expectedRevision: prior.spec?.revision ?? 0 }); await refresh(); };
const waitReport = async (executionId) => { const deadline = Date.now() + 30000; while (Date.now() < deadline) { const value = await read(); if (!value.activeRun && value.latestReport?.evidence.executionId === executionId) return value; await new Promise(resolve => setTimeout(resolve, 200)); } throw Error('Timed out waiting for real runner report'); };
const run = async () => {
  const previous = (await read()).latestReport?.evidence.executionId;
  await panel().getByRole('button', { name: '运行验收', exact: true }).click();
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { const value = await read(); const id = value.activeRun?.executionId || value.latestReport?.evidence.executionId; if (id && id !== previous) return id; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw Error('Run did not create an execution record');
};
const mode = async (label) => { await composerTrigger(page, '模式').click(); await composerPopup(page, '模式').getByRole('radio').filter({ hasText: label }).click(); };
try {
  const common = { cwd: root, env: { ...process.env, PM_SLASH_DATA_DIR: profile } };
  app = await electron.launch(packaged ? { ...common, executablePath } : { ...common, args: ['.'] }); page = await app.firstWindow(); page.setDefaultTimeout(15000); page.on('pageerror', error => evidence.pageErrors.push(error.message)); await page.locator('.brand').waitFor();
  assert.equal(path.resolve(await app.evaluate(({ app }) => app.getPath('userData'))), path.resolve(profile)); evidence.actualExecutable = await app.evaluate(({ app }) => app.getPath('exe')); evidence.appVersion = await app.evaluate(({ app }) => app.getVersion());
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.unmaximize(); window.setSize(1280, 900); });
  await page.locator('.rail-item').filter({ has: page.getByText('成果', { exact: true }) }).click(); await page.getByRole('button', { name: /^原型 2 个文件/ }).click();
  await page.locator('.file-row').filter({ hasText: 'index.html' }).getByRole('button', { name: '阅读', exact: true }).click(); await expand();
  await panel().getByRole('button', { name: '在会话中准备验收', exact: true }).waitFor(); await shot('empty');
  await panel().getByRole('button', { name: '在会话中准备验收', exact: true }).click(); assert.match(await page.getByLabel('描述你的任务').inputValue(), /独立导出预期|探索性建议/); await expand(); check('未注册HTML空态可回会话准备，预期独立于当前DOM');
  await save([...passingCases, failingCase]); assert.equal((await read()).spec.required, false); assert.equal(await panel().getByRole('checkbox', { name: '作为交付要求', exact: true }).isChecked(), false); check('用例默认建议，不强制成果注册或交付要求');
  await mode('Plan'); await expand(); assert(await panel().getByRole('button', { name: '运行验收', exact: true }).isDisabled()); assert(await panel().getByRole('checkbox', { name: '作为交付要求', exact: true }).isDisabled());
  const planSpec = (await read()).spec;
  for (const request of [{ type: 'prototypeAcceptanceRun', ...target, mode: 'plan', expectedRevision: planSpec.revision }, { type: 'prototypeAcceptanceRequired', ...target, mode: 'plan', required: true, expectedRevision: planSpec.revision, expectedSpecHash: planSpec.specHash }]) {
    const response = await page.evaluate(input => window.pm.request(input), request); assert.equal(response.ok, false); assert.match(response.error, /PLAN_TOOL_DENIED/);
  }
  const afterPlan = await read(); assert.equal(afterPlan.spec.required, false); assert.equal(afterPlan.activeRun, undefined); await shot('plan-readonly'); await mode('Build'); check('Plan运行与修改交付要求由界面和真实后端同时拒绝，状态未改');
  const failedExecution = await run(); check('真实运行立即显示状态与取消入口'); const failedView = await waitReport(failedExecution); assert.equal(failedView.latestReport.evidence.status, 'failed'); await refresh();
  const failure = panel().locator('[data-case-id="missing-failure"]'); await failure.locator('summary').click(); assert.match(await failure.innerText(), /实际结果不符合预期/); assert.doesNotMatch(await failure.innerText(), /PROTOTYPE_ASSERTION_MISMATCH/); await failure.getByRole('button', { name: '查看截图', exact: true }).click(); await failure.locator('img').waitFor(); assert.match(await failure.locator('img').getAttribute('src'), /^data:image\/png;base64,/); await shot('failure-and-controlled-screenshot');
  await failure.getByRole('button', { name: '带证据回会话修正', exact: true }).click(); const prompt = await page.getByLabel('描述你的任务').inputValue(); assert(prompt.includes(failedView.latestReport.reportId)); assert.match(prompt, /截图证据 ID|实际/); assert.match(prompt, /PROTOTYPE_ASSERTION_MISMATCH/); check('失败原因中文可读，受控截图和原始code仅携证据预填回会话');
  await expand(); await panel().getByRole('checkbox', { name: '作为交付要求', exact: true }).click(); await panel().locator('input[type="checkbox"]:checked').waitFor(); const requiredView = await read(); assert(requiredView.spec.required); assert.equal(requiredView.spec.requiredSpecHash, requiredView.spec.specHash); check('用户点击交付要求绑定当前specHash');
  await save(passingCases); await panel().getByText('验收范围已变，需确认', { exact: true }).waitFor(); assert((await read()).needsConfirmation); await shot('scope-needs-confirmation');
  await panel().getByRole('button', { name: '确认当前验收范围', exact: true }).click(); assert.equal((await read()).needsConfirmation, false); check('修改验收范围不会自动确认，明确点击才重新绑定');
  const passExecution = await run(); const passedView = await waitReport(passExecution); assert.equal(passedView.latestReport.evidence.status, 'passed'); await refresh(); await shot('real-passed'); check('实际native交互与断言通过并记录时间/版本');
  await fs.writeFile(path.join(mount.path, 'GUI验收/附件说明.md'), '# 合成附件\n本附件不属于网页快照，测试必须提示未打包。');
  const zipFile = path.join(exportMount.path, '验收快照导出.zip');
  await app.evaluate(({ dialog }, filePath) => { globalThis.__prototypeSmokeSaveDialog = dialog.showSaveDialog; dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, zipFile);
  try {
    await page.locator('.preview-more > summary').click(); await page.locator('.preview-more-actions').getByRole('button', { name: '打包项目', exact: true }).click();
    try { await Promise.race([
      page.locator('.notice').filter({ hasText: '非网页附件未打包' }).waitFor({ timeout: 30000 }),
      page.locator('.alert').waitFor({ timeout: 30000 }).then(async () => { throw Error(`Export host rejected: ${await page.locator('.alert').textContent()}`); }),
    ]); }
    catch (error) { throw Error(`${error.message}; actual UI alert: ${(await page.locator('.alert').allTextContents()).join(' | ')}`); }
    await page.locator('.notice').screenshot({ path: path.join(output, 'export-snapshot-notice.png') }); evidence.screenshots.push('export-snapshot-notice.png');
    const files = new AdmZip(zipFile).getEntries().map(value => value.entryName); assert(files.includes('index.html')); assert(files.includes('app.js')); assert(!files.some(value => value.endsWith('附件说明.md'))); evidence.export = { path: zipFile, bytes: (await fs.stat(zipFile)).size, files, notice: await page.locator('.notice').textContent() }; check('真实必检ZIP导出使用验收快照，并显示非网页附件未打包notice');
  } finally { await app.evaluate(({ dialog }) => { dialog.showSaveDialog = globalThis.__prototypeSmokeSaveDialog; delete globalThis.__prototypeSmokeSaveDialog; }); }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 820)); await page.waitForFunction(() => innerWidth < 1100); const dimensions = await panel().evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth, parent: element.closest('.preview').clientWidth, bodyHeight: element.querySelector('.prototype-acceptance-body').clientHeight })); assert(dimensions.scroll <= dimensions.width); assert(dimensions.width <= dimensions.parent); assert(dimensions.bodyHeight <= 390); await shot('narrow-inline-layout'); check('真实窄窗布局在预览内、滚动区域有界且无横向溢出');
  const success = panel().locator('[data-case-id="success"]'); await success.locator('summary').click(); await success.getByRole('button', { name: '查看截图', exact: true }).click(); await success.locator('img').waitFor();
  await fs.writeFile(path.join(mount.path, script), js + '\n// dependency changed by isolated regression fixture'); await panel().locator(':scope > summary').click(); await expand();
  await panel().locator(':scope > summary').filter({ hasText: '版本已变' }).waitFor(); assert.equal((await read()).latestReport.versionState, 'stale'); assert.equal(await panel().locator('img').count(), 0); assert.equal(await success.locator('[data-status="passed"]').count(), 0); await shot('dependency-stale'); check('HTML不变而JS变化，重新展开核验stale且清旧截图/通过');
  await fs.writeFile(path.join(mount.path, script), js); await save([{ id: 'cancel', title: '取消等待中的验收', expectedDescription: '等待不存在的结果，供取消真实执行验证', steps: [{ action: 'assert', assertion: 'text', selector: '#result', expected: '不会出现的结果', match: 'equals' }] }]);
  const cancelledExecution = await run(); await panel().getByRole('button', { name: '取消执行', exact: true }).click(); const cancelledView = await waitReport(cancelledExecution); assert.equal(cancelledView.latestReport.evidence.status, 'unknown'); assert.match(cancelledView.latestReport.evidence.reason || cancelledView.latestReport.evidence.cases.map(value => value.reason).join(' '), /取消|CANCELLED/i); assert.equal(cancelledView.activeRun, undefined); assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1); await refresh(); await shot('cancelled-unknown'); check('取消有真实终态回执、无活动执行且隔离窗口已销毁，剩余未知');
  assert.deepEqual(evidence.pageErrors, []); evidence.status = 'passed';
} catch (error) { evidence.status = 'failed'; evidence.error = error.stack; if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); process.exitCode = 1; }
finally { if (app) await app.close(); await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify({ status: evidence.status, runtime, output, checks: evidence.checks.length, appVersion: evidence.appVersion, error: evidence.error })); }
