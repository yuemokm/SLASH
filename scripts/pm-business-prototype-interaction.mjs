import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

// Selectors below were read from the actual 2026-10-05 model-generated DOM.
// This script never writes or injects prototype content or simulates its backend.
const args = process.argv.slice(2);
const arg = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const root = process.cwd();
const artifact = path.resolve(arg('--artifact') || '.test-data/pm-business-prototype-real-20261005-1444/index.html');
const out = path.resolve(arg('--out') || `.test-data/pm-business-prototype-interaction-${Date.now()}`);
const applied = arg('--applied') ? path.resolve(arg('--applied')) : undefined;
const executable = arg('--executable') || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const testRoot = path.resolve(root, '.test-data');
const inside = (p) => { const relative = path.relative(testRoot, p); return relative && !relative.startsWith('..') && !path.isAbsolute(relative); };
assert(inside(artifact) && inside(out), 'Artifact and all browser evidence must remain under .test-data');
if (applied) assert(inside(applied), 'Applied artifact must be an isolated test artifact');
await fs.mkdir(out, { recursive: true });
const bytes = await fs.readFile(artifact);
const html = bytes.toString('utf8');
const hash = (v) => createHash('sha256').update(v).digest('hex');
const sha256 = hash(bytes);
if (applied) assert.equal(hash(await fs.readFile(applied)), sha256, 'Draft copy differs from final applied artifact');
const result = { sourceKind: 'real_model_generated_html', sourceState: applied ? 'applied_hash_verified' : 'pending_draft_copy', artifact, applied, sha256, bytes: bytes.length, characters: html.length, executable, profile: path.join(out, 'browser-profile'), startedAt: new Date().toISOString(), checks: [], screenshots: [], blockedRequests: [], pageErrors: [], notice: 'Actual artifact unchanged; isolated browser; only exact local test origin allowed. Demo interactions do not verify backend correctness.' };
const server = http.createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/index.html') { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(bytes);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let context;
try {
  context = await chromium.launchPersistentContext(result.profile, { executablePath: executable, headless: true, viewport: { width: 420, height: 900 }, serviceWorkers: 'block', args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--no-default-browser-check'] });
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    result.blockedRequests.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*', (socket) => { result.blockedRequests.push(socket.url()); socket.close(); });
  const page = context.pages()[0] || await context.newPage();
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  const check = async (id, title, action) => {
    try { const detail = await action(); result.checks.push({ id, title, status: 'pass', detail }); }
    catch (error) { result.checks.push({ id, title, status: 'fail', detail: error.message }); }
  };
  const screenshot = async (name, fullPage = false) => {
    const file = path.join(out, `${name}.png`); await page.screenshot({ path: file, fullPage }); result.screenshots.push(file);
  };
  const enter = async () => {
    await page.goto(`${origin}/index.html`);
    await page.locator('.src-card[data-src="manual"]').click();
    await page.locator('#nextBtn').click();
    await page.locator('#f_name').waitFor();
  };
  const submit = async () => { await page.locator('#submitBtn').click(); };
  const dialogTitle = () => page.locator('#dialog .d-title');
  await page.goto(`${origin}/index.html`);
  await check('isolation', '普通浏览器没有 Electron 主应用 IPC', async () => {
    const globals = await page.evaluate(() => ({ pm: typeof window.pm, require: typeof window.require, ipcRenderer: typeof window.ipcRenderer }));
    assert.deepEqual(globals, { pm: 'undefined', require: 'undefined', ipcRenderer: 'undefined' }); return globals;
  });
  await check('source-required', '未选择来源不能进入填写', async () => {
    await page.locator('#nextBtn').click(); assert.equal(await dialogTitle().textContent(), '请选择来源'); await page.locator('#dlgBtn').click();
    return '真实选择来源弹窗';
  });
  await enter();
  await fs.writeFile(path.join(out, 'actual-form-dom.html'), await page.locator('#app').evaluate((element) => element.outerHTML));
  await screenshot('01-form-code-and-name');
  await check('code-readonly', '编码在新增页可见、自动生成占位且无法手填', async () => {
    const code = page.locator('input[data-ro="1"]');
    assert.equal(await code.count(), 1); assert(await code.isVisible()); assert.equal(await code.getAttribute('readonly'), '');
    const before = await code.inputValue(); await code.focus(); await page.keyboard.press('Control+A'); await page.keyboard.insertText('JHWD0000000001');
    assert.equal(await code.inputValue(), before); assert.equal(before, '提交后自动生成'); return { placeholder: before, userEditBlocked: true };
  });
  await check('empty-form-required', '空表提交阻止并标出名称、定位、详细地址', async () => {
    await submit(); assert.equal(await dialogTitle().textContent(), '请完善必填项'); assert(await page.locator('#err_name').isVisible());
    for (const id of ['f_name', 'f_loc', 'f_detail']) assert(await page.locator(`#${id}`).evaluate((element) => element.closest('.field').classList.contains('err')));
    await screenshot('02-empty-form-validation'); await page.locator('#dlgBtn').click(); return '网点名称、定位地址、详细地址均显示必填错误';
  });
  await check('name-length-50', '名称真实用户输入最多 50 字符', async () => {
    const name = page.locator('#f_name'); assert.equal(await name.getAttribute('maxlength'), '50');
    await name.focus(); await page.keyboard.insertText('验'.repeat(51)); assert.equal((await name.inputValue()).length, 50);
    return { attemptedCharacters: 51, acceptedCharacters: (await name.inputValue()).length };
  });
  await check('location-readonly', 'F7 定位地址自动带出且不可手动调整', async () => {
    await page.locator('#locBtn').click();
    const loc = page.locator('#f_loc'); const before = await loc.inputValue(); assert(before.includes('104.059175')); assert.equal(await loc.getAttribute('readonly'), '');
    await loc.focus(); await page.keyboard.press('Control+A'); await page.keyboard.insertText('手动修改定位'); assert.equal(await loc.inputValue(), before); return { value: before, userEditBlocked: true };
  });
  await check('detail-editable', 'F8 详细地址自动带出后可修改', async () => {
    const detail = page.locator('#f_detail'); const before = await detail.inputValue(); assert(before.includes('迈普大厦')); assert(await detail.isEditable());
    await detail.fill('四川省成都市武侯区天府三街288号二楼（验收修改）'); assert((await detail.inputValue()).includes('验收修改'));
    await detail.scrollIntoViewIfNeeded(); await screenshot('03-location-and-edited-detail'); return { before, after: await detail.inputValue() };
  });
  await check('detail-required', '空详细地址阻止提交', async () => {
    await page.locator('#f_detail').fill(''); await submit(); assert.equal(await dialogTitle().textContent(), '请完善必填项');
    assert(await page.locator('#f_detail').evaluate((element) => element.closest('.field').classList.contains('err'))); await page.locator('#dlgBtn').click();
    await page.locator('#f_detail').fill('四川省成都市武侯区天府三街288号二楼（验收修改）'); return '真实校验错误状态';
  });
  await check('phone-validation', '非法电话阻止提交并显示字段错误', async () => {
    await page.locator('#f_phone').fill('123'); await submit(); assert((await page.locator('#err_phone').textContent()).includes('格式不正确')); assert(await page.locator('#err_phone').isVisible());
    await page.locator('#dlgBtn').click(); await page.locator('#f_phone').fill(''); return await page.locator('#err_phone').textContent();
  });
  await page.locator('#f_name').fill('验收专用机会门店（本地演示）');
  await check('submit-loading', '提交显示模拟校验过程', async () => { await submit(); assert.equal(await dialogTitle().textContent(), '提交校验中…'); return '实际页面 1400ms 模拟计时器'; });
  await check('success-generated-code', '成功路径展示 JHWD + 10 位模拟编码', async () => {
    await page.locator('.code-box').waitFor(); const code = (await page.locator('.code-box').textContent()).trim(); assert.match(code, /^JHWD\d{10}$/);
    assert((await page.locator('.success-card .tag').textContent()).includes('模拟编码')); assert((await page.locator('.kv').textContent()).includes('验收专用机会门店'));
    await screenshot('04-success-generated-code', true); return { code, simulationExplicit: true, sequentialBackendAllocation: 'not_verified' };
  });
  await enter(); await page.locator('#f_name').fill('惠优乐超市'); await page.locator('#locBtn').click();
  await check('duplicate-return', '预置重复门店可进入警告并返回修改', async () => {
    await submit(); await page.waitForFunction(() => document.querySelector('#dialog .d-title')?.textContent === '疑似重复门店');
    await screenshot('05-duplicate-warning'); await page.locator('#dlgBtn').click(); assert(await page.locator('#f_name').isEditable()); assert.equal(await page.locator('#f_name').inputValue(), '惠优乐超市');
    return '实际输入预置模拟门店，警告后保留字段并可修改';
  });
  const controls = await page.locator('button,select,input').evaluateAll((elements) => elements.map((element) => ({ tag: element.tagName, id: element.id, text: element.textContent, type: element.getAttribute('type'), options: element.tagName === 'SELECT' ? Array.from(element.options).map((option) => option.textContent) : undefined })));
  await fs.writeFile(path.join(out, 'actual-controls.json'), JSON.stringify(controls, null, 2));
  result.checks.push({ id: 'service-failure-simulation', title: '提交服务失败模拟路径', status: 'fail', detail: '实际 DOM 没有失败场景选择/触发入口；validateAndSubmit 的 setTimeout 只实现预置名称重复与成功两条分支。必填/电话错误是输入校验，不能冒充服务失败。未注入或修补生成页。' });
  result.checks.push({ id: 'code-edit-request-diff', title: '用户要求编码可编辑后的真实差异', status: 'unknown', detail: '当前仅基线生成物；待实际修改成果，不由验收脚本改页。' });
  await check('mobile-width', '420px 窄屏无水平溢出', async () => { const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth })); assert(dimensions.document <= dimensions.viewport); return dimensions; });
  assert.equal(hash(await fs.readFile(artifact)), sha256, 'Prototype changed during validation');
  result.artifactUnchanged = true;
} catch (error) { result.harnessError = error.stack; process.exitCode = 1; }
finally {
  if (context) await context.close(); await new Promise((resolve) => server.close(resolve));
  result.finishedAt = new Date().toISOString(); result.counts = Object.fromEntries(['pass', 'fail', 'unknown'].map((status) => [status, result.checks.filter((check) => check.status === status).length]));
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ result: path.join(out, 'result.json'), sha256, counts: result.counts, harnessError: result.harnessError, pageErrors: result.pageErrors }, null, 2));
}
