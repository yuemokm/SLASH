import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { Store } from '../../../dist/main/store.js';
import { Service } from '../../../dist/main/service.js';
import { ensureLegacyFixtureMounts } from '../../../scripts/composer-smoke-helpers.mjs';

// Genuine renderer frames only. No model calls, mock reports, HTML changes,
// application source edits, user profile copies or desktop-wide recording.
const project = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(project, '../../..');
const output = path.join(project, '.capture', new Date().toISOString().replace(/[:.]/g, '-'));
const resumeIndex = process.argv.indexOf('--resume');
const resume = resumeIndex < 0 ? undefined : path.resolve(process.argv[resumeIndex + 1]);
const profile = path.join(resume || output, 'profile'), workspace = path.join(resume || output, '演示隔离项目');
const inside = value => { const relative = path.relative(project, value); assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative)); return value; };
for (const value of [output, profile, workspace]) inside(value);
await fs.mkdir(output, { recursive: true });
await fs.mkdir(path.join(project, 'assets/footage'), { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const baseline = path.join(repo, '.test-data/pm-business-real-2026-10-05T06-28-41-722Z/workspace/成果/机会门店新建');
const report = { startedAt: new Date().toISOString(), runtime: 'development', profile, workspace, sourceKind: 'unchanged_real_model_baseline_with_labelled_synthetic_rule_fixture', files: [], clips: [], pageErrors: [], checks: [], notice: 'Silent genuine application recording. Interactions are simulated prototype behavior, not backend verification. New repair success is not asserted.' };
const store = new Store(profile), service = new Service(store, () => '', () => {});
let sourceMount, resultMount, conversationId, requirementId;
try {
 if (resume) {
  conversationId = service.state.conversations[0].id;
  resultMount = service.state.mounts.find(value => value.name === '原型' && value.path === path.join(workspace, '原型')); assert(resultMount);
  report.files = JSON.parse(await fs.readFile(path.join(resume, 'recording.json'), 'utf8')).files;
 } else {
  await service.workspace(workspace); await ensureLegacyFixtureMounts(service);
  service.setPermission('workspace_read', 'allow'); service.setPermission('artifact_write', 'allow');
  conversationId = service.conversation(undefined, '机会门店演示 · 真实基线与合成输入');
  sourceMount = service.state.mounts.find(value => value.name === '参考资料');
  resultMount = service.state.mounts.find(value => value.name === '原型'); assert(sourceMount && resultMount);
  for (const filename of ['index.html', 'PRD.md', '约束对照.md']) {
    const bytes = await fs.readFile(path.join(baseline, filename));
    if (filename === 'index.html') assert.equal(hash(bytes), 'a09d1f6c3e4023a2b42345fe72ee9d6454b67d4a978b0a2d3feb5e66d80e3d94');
    await fs.writeFile(inside(path.join(resultMount.path, filename)), bytes);
    report.files.push({ filename, source: path.join(baseline, filename), sha256: hash(bytes), bytes: bytes.length });
  }
  const source = '# 演示字段规则（合成示例）\n仅演示四个独立维度，不是原始 Office 资料。\n| 字段 | A 是否仅用于正式落库 | H 是否必填 | O 新增展示 | P 后续发起变更 |\n| 网点编码 | 否 | 是 | 是 | 否 |\n| 网点名称 | 否 | 是 | 是 | 待确认 |\n';
  await fs.writeFile(inside(path.join(sourceMount.path, '演示字段规则.md')), source);
  const quote = source.split('\n').slice(2, 4).join('\n');
  const requirement = await service.recordRequirement(conversationId, { title: '网点编码 · 四个独立维度（合成示例）', summary: '展示候选规则、来源版本和人工核对边界；不代表真实业务规则自动通过。', status: 'draft', sources: [{ id: 'demo-source', mountId: sourceMount.id, relativePath: '演示字段规则.md', locator: '合成字段表 · 网点编码' }], assumptions: [], pendingQuestions: [{ id: 'human-review', question: '正式落库与创建阶段的含义仍需业务负责人核对。' }], confirmedFacts: [] });
  requirementId = requirement.id;
  await service.recordBusinessConstraints(conversationId, { requirementId, constraints: ['required', 'formal_only', 'create_visible', 'change_allowed'].map((dimension, index) => ({ id: 'demo-' + dimension, fieldKey: '网点编码', dimension, rawValue: ['是', '否', '是', '否'][index], interpretation: ['候选：必填不代表用户手动录入。', '候选：仅正式落库是独立维度。', '候选：新增时展示系统生成编码。', '候选：后续不可发起变更。'][index], stage: '创建 / 正式落库（待人工核对）', status: 'candidate', sourceRefIds: ['demo-source'], sourceEvidence: [{ sourceRefId: 'demo-source', locator: '合成字段表 · 网点编码 · ' + dimension, startLine: 3, endLine: 4, quote }] })) });
  service.save();
 }
} finally { service.dispose(); await Promise.allSettled([...service.agentIndex.queues.values()]); store.close(); }
let app, page;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const call = async request => { const value = await page.evaluate(input => window.pm.request(input), request); assert(value.ok, value.error); return value.data; };
const record = async (name, seconds, action) => {
  const frames = path.join(output, name); await fs.mkdir(frames);
  let stop = false; const start = Date.now(), list = [];
  const loop = (async () => { while (!stop) { const t = (Date.now() - start) / 1000; const filename = path.join(frames, String(list.length).padStart(5, '0') + '.jpg'); await page.screenshot({ path: filename, type: 'jpeg', quality: 94 }); list.push({ filename, t }); await wait(180); } })();
  try { await action(); await wait(Math.max(0, seconds * 1000 - (Date.now() - start))); } finally { stop = true; await loop; }
  const duration = (Date.now() - start) / 1000;
  const concat = list.map((frame, index) => `file '${frame.filename.replace(/\\/g, '/')}'\nduration ${((list[index + 1]?.t ?? duration) - frame.t).toFixed(4)}`).join('\n') + `\nfile '${list.at(-1).filename.replace(/\\/g, '/')}'\n`;
  const listPath = path.join(frames, 'frames.txt'); await fs.writeFile(listPath, concat);
  const mp4 = path.join(project, 'assets/footage', name + '.mp4');
  try { await fs.access(mp4); throw Error('Refusing to overwrite existing footage: ' + mp4); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const encoded = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listPath, '-r', '30', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', mp4], { encoding: 'utf8' }); assert.equal(encoded.status, 0, encoded.stderr);
  const screenshot = path.join(project, 'assets/footage', name + '.png'); await page.screenshot({ path: screenshot });
  report.clips.push({ name, path: mp4, screenshot, actualDuration: duration, frameCount: list.length, sha256: hash(await fs.readFile(mp4)), actions: 'Actual Playwright input and renderer frames; no injected UI or reports.' });
  await fs.writeFile(path.join(output, 'recording.json'), JSON.stringify(report, null, 2)); console.log('RECORDED ' + name);
};
const openHtml = async () => {
  await page.locator('.rail-item').filter({ has: page.getByText('成果', { exact: true }) }).click();
  const back = page.getByRole('button', { name: '返回目录列表', exact: true }); if (await back.isVisible()) await back.click();
  await page.getByRole('button', { name: /^原型 3 个文件/ }).click();
  await page.locator('.file-row').filter({ hasText: 'index.html' }).getByRole('button', { name: '阅读', exact: true }).click();
};
try {
  app = await electron.launch({ executablePath: path.join(repo, 'node_modules/electron/dist/electron.exe'), cwd: repo, args: ['.'], env: { ...process.env, PM_SLASH_DATA_DIR: profile } });
  page = await app.firstWindow(); page.setDefaultTimeout(15000); page.on('pageerror', error => report.pageErrors.push(error.message)); await page.locator('.brand').waitFor();
  assert.equal(path.resolve(await app.evaluate(({ app }) => app.getPath('userData'))), profile); report.version = await app.evaluate(({ app }) => app.getVersion());
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.unmaximize(); window.setContentSize(1840, 870); });
  await page.locator('.sidebar').getByRole('button', { name: '机会门店演示 · 真实基线与合成输入', exact: true }).click();
  if (!resume) await record('01-work', 20, async () => {
    await page.getByLabel('描述你的任务').fill('从资料形成 PRD、可交互原型与约束对照。这里展示真实模型基线，输入使用合成示例；不发送云模型请求。'); await wait(4000);
    await page.locator('.rail-item').filter({ has: page.getByText('成果', { exact: true }) }).click(); await page.getByRole('button', { name: /^原型 3 个文件/ }).click(); await wait(3500);
    await page.locator('.file-row').filter({ hasText: 'PRD.md' }).getByRole('button', { name: '阅读', exact: true }).click(); await wait(3500);
  });
  if (!resume) await record('02-rules', 28, async () => {
    await page.locator('.rail-item').filter({ has: page.getByText('会话', { exact: true }) }).click();
    const work = page.locator('.conversation').getByLabel('待确认与检查问题', { exact: true }); await work.locator(':scope > details > summary').click();
    const trace = work.locator(`[data-record-id="${requirementId}"] .business-trace`); await trace.locator(':scope > summary').click(); await trace.locator('.business-trace-field').waitFor(); await wait(7000);
    await trace.getByRole('button', { name: '阅读来源', exact: true }).first().click(); await page.locator('.document-reader').waitFor(); await wait(5000);
  });
  await openHtml();
  const frame = page.frameLocator('iframe');
  let hasPrototype = false; try { await fs.access(path.join(project, 'assets/footage/03-prototype.mp4')); hasPrototype = true; } catch {}
  if (!hasPrototype) await record('03-prototype', 30, async () => {
    await frame.locator('.src-card[data-src="manual"]').click(); await frame.locator('#nextBtn').click(); await frame.locator('#f_name').waitFor();
    assert.equal(await frame.locator('input[data-ro="1"]').getAttribute('readonly'), ''); await wait(4500);
    await frame.locator('#f_name').fill('比赛合成机会门店'); await frame.locator('#locBtn').click(); await wait(4000);
    assert.equal(await frame.locator('#f_loc').getAttribute('readonly'), ''); assert(await frame.locator('#f_detail').isEditable());
    await frame.locator('#f_detail').fill('合成详细地址 · 演示可调整'); await frame.locator('#f_detail').scrollIntoViewIfNeeded(); await wait(5000);
    await frame.locator('#submitBtn').click(); await frame.locator('.code-box').waitFor(); assert.match((await frame.locator('.code-box').textContent()).trim(), /^JHWD\d{10}$/); report.checks.push('Baseline actual readonly code, location/details permissions and simulated success observed.');
  });
  const target = { mountId: resultMount.id, path: 'index.html' };
  const prior = await call({ type: 'prototypeAcceptanceGet', ...target });
  if (!prior.spec) await call({ type: 'prototypeAcceptanceSave', ...target, mode: 'build', title: '基线界面观察 · 服务失败入口', cases: [{ id: 'service-failure', title: '服务失败需要明确入口', expectedDescription: '原型需有可操作的提交服务失败场景；输入校验不替代服务失败。', steps: [{ action: 'assert', assertion: 'count', selector: '#simulateFailure', expected: 1 }] }], sourceRefs: [], expectedRevision: 0 });
  const panel = page.getByLabel('原型验收', { exact: true }); await panel.locator(':scope > summary').click();
  await record('04-evidence', 25, async () => {
    await panel.getByRole('button', { name: '运行验收', exact: true }).click(); await panel.locator('[data-case-id="service-failure"]').waitFor();
    const item = panel.locator('[data-case-id="service-failure"]'); await item.locator('summary').click(); await item.getByText('实际结果不符合预期', { exact: false }).first().waitFor();
    await item.getByRole('button', { name: '查看截图', exact: true }).click(); await item.locator('img').waitFor(); await wait(6000);
    const view = await call({ type: 'prototypeAcceptanceGet', ...target }); assert.equal(view.latestReport.evidence.status, 'failed'); report.baselineExecution = view.latestReport;
    await item.getByRole('button', { name: '带证据回会话修正', exact: true }).click(); await wait(4000);
    assert.match(await page.getByLabel('描述你的任务').inputValue(), /PROTOTYPE_ASSERTION_MISMATCH/);
  });
  assert.deepEqual(report.pageErrors, []); report.status = 'recorded';
} catch (error) { report.status = 'failed'; report.error = error.stack; if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); process.exitCode = 1; }
finally { if (app) await app.close(); report.finishedAt = new Date().toISOString(); await fs.writeFile(path.join(output, 'recording.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ output, status: report.status, clips: report.clips.length, version: report.version, error: report.error })); }
