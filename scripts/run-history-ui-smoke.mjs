// Renderer-only fixture: no user profile, Service, model request, or resume action.
// Root builds the renderer before running this script.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const renderer = path.join(root, 'dist', 'renderer');
const output = path.join(root, '.test-data', `run-history-ui-${Date.now()}`);
await fs.mkdir(output, { recursive: true });
const day = '2026-10-05T12:04:00.000Z', today = '2026-10-06T09:56:00.000Z';
const msg = (role, text, time, runId) => ({ role, text, time, runId });
const run = (id, conversationId, startedAt, status, extra = {}) => ({ id, conversationId, startedAt, status, updatedAt: today, ...extra });
const fixture = {
  root: 'E:\\synthetic-ui-fixture', mounts: [], changes: [], connections: [], pendingApprovals: [], models: [], model: { id: '', baseUrl: '', hasKey: false },
  conversations: [
    { id: 'live', title: '历史中断与当前生成', archived: false, messages: [msg('user', '昨日任务输入', day), msg('tool', 'read_file 合成工具记录', '2026-10-05T12:05:00Z'), msg('assistant', '已关联的历史回复', '2026-10-05T12:06:00Z', 'linked'), msg('user', '今日正在执行的输入', today)] },
    { id: 'failed', title: '最新任务失败', archived: false, messages: [msg('user', '昨日已完成输入', day), msg('assistant', '昨日已完成回复', '2026-10-05T12:06:00Z', 'completed'), msg('user', '今日失败任务输入', today)] },
    { id: 'plan', title: '方案待确认', archived: false, messages: [msg('user', '合成方案输入', day)] },
  ],
  runs: [
    run('live-now', 'live', today, 'running', { phase: 'generating' }),
    run('failed-now', 'failed', today, 'failed', { phase: 'failed', error: '今日失败标识', resumable: true }),
    run('pending-plan', 'plan', day, 'awaiting_plan', { mode: 'plan', proposal: { status: 'pending', summary: '合成待确认方案', options: [], selectedOptionIds: [], customText: '', createdAt: day } }),
    run('orphan-yesterday', 'live', day, 'interrupted', { phase: 'interrupted', error: '应用退出：昨日中断标识', resumable: true }),
    run('linked', 'live', '2026-10-05T12:05:30Z', 'succeeded'),
    run('completed', 'failed', day, 'succeeded'),
  ],
};
const server = createServer(async (request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(renderer, relative);
    if (!file.startsWith(renderer + path.sep)) { response.writeHead(403).end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
    response.writeHead(200, { 'content-type': mime }); response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const result = { status: 'running', output, checks: [], pageErrors: [], limitations: ['Synthetic bridge verifies renderer presentation only; no live model, recovery, or desktop IPC integration is exercised.'] };
let browser, page;
const check = name => { result.checks.push(name); console.log('PASS ' + name); };
const anchor = id => page.locator('.reply-run-anchor').filter({ has: page.locator(`[data-run-id="${id}"]`) });
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 1366, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  page.setDefaultTimeout(12000); page.on('pageerror', error => result.pageErrors.push(error.message));
  await page.addInitScript(state => {
    window.__fixtureCalls = [];
    window.pm = {
      subscribe: () => () => {},
      request: async request => {
        window.__fixtureCalls.push(request.type);
        const data = {
          state, windowTheme: null, projects: [], externalActions: [],
          productRecords: { workspaceId: 'fixture', revision: 1, requirements: [], artifacts: [], reviews: [], artifactLinks: [], designPackages: [] },
          decisionCenter: { items: [] },
          modelThinkingCapability: { levels: [], status: 'unsupported', fingerprint: 'fixture', source: 'fixture' },
          runCheckpoint: { runId: request.runId, attempt: 1, phase: 'interrupted', updatedAt: state.runs.find(run => run.id === request.runId)?.startedAt, assistantText: '', completedOperations: [], safeToResume: true },
        }[request.type];
        return data !== undefined ? { ok: true, data } : { ok: false, error: 'Fixture forbids ' + request.type };
      },
    };
  }, fixture);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const old = anchor('orphan-yesterday'); await old.waitFor();
  const order = await page.locator('.messages').evaluate(element => [...element.children].map(child => ({ text: child.textContent, run: child.querySelector('.reply-details')?.dataset.runId })));
  assert.ok(order.findIndex(item => item.run === 'orphan-yesterday') > order.findIndex(item => item.text.includes('昨日任务输入')));
  assert.ok(order.findIndex(item => item.run === 'orphan-yesterday') < order.findIndex(item => item.text.includes('今日正在执行的输入')));
  assert.ok(order.findIndex(item => item.run === 'orphan-yesterday') < order.findIndex(item => item.run === 'live-now'));
  assert.equal(await old.locator('time').first().getAttribute('datetime'), day);
  assert.match(await old.locator('time').first().innerText(), /2026.*10.*5/);
  await page.locator('.messages').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: path.join(output, 'historical-order.png') });
  await old.getByRole('button', { name: '生成与执行', exact: true }).click();
  await old.getByText('应用退出：昨日中断标识', { exact: true }).waitFor();
  await old.getByRole('button', { name: '继续任务', exact: true }).waitFor();
  check('旧中断入口带原日期，处于原用户输入后、今日输入和live之前，恢复入口保留');
  const linked = page.locator('.message.assistant').filter({ hasText: '已关联的历史回复' });
  assert.equal(await linked.getByRole('button', { name: '生成与执行', exact: true }).getAttribute('aria-expanded'), 'false');
  assert.equal(await linked.getByRole('button', { name: '工作记录与项目历史', exact: true }).count(), 1);
  assert.equal(await anchor('linked').count(), 0);
  check('已关联助手footer保持默认折叠且无重复任务入口');
  await page.screenshot({ path: path.join(output, 'historical-before-live.png') });
  await page.locator('.sidebar').getByRole('button', { name: '最新任务失败', exact: true }).click();
  const failed = anchor('failed-now'); await failed.waitFor();
  assert.equal(await page.locator('.messages > :last-child .reply-details').getAttribute('data-run-id'), 'failed-now');
  await failed.getByRole('button', { name: '生成与执行', exact: true }).click();
  await failed.getByText('今日失败标识', { exact: true }).waitFor();
  await failed.getByRole('button', { name: '继续任务', exact: true }).waitFor();
  check('最新无正文失败仍在对话末尾显示真实错误及继续入口');
  await page.screenshot({ path: path.join(output, 'latest-failure.png') });
  await page.locator('.sidebar').getByRole('button', { name: '方案待确认', exact: true }).click();
  const plan = anchor('pending-plan'); await plan.waitFor();
  await plan.getByRole('button', { name: '生成与执行', exact: true }).click();
  await plan.getByRole('button', { name: '确认并开始 Build', exact: true }).waitFor();
  await plan.getByLabel('自定义方案补充').waitFor();
  check('无正文待确认Plan保留方案与确认入口');
  assert.deepEqual(result.pageErrors, []);
  result.calls = await page.evaluate(() => window.__fixtureCalls);
  assert.ok(!result.calls.some(type => ['send', 'resume', 'planConfirm', 'planDraft', 'cancel'].includes(type)));
  result.status = 'passed';
} catch (error) {
  result.status = 'failed'; result.error = String(error.stack || error); process.exitCode = 1;
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log('Evidence: ' + path.join(output, 'result.json'));
}
