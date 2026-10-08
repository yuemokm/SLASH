import { _electron as electron } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { getBuiltinModels } from '@earendil-works/pi-ai/providers/all';
import { Store } from '../dist/main/store.js';
import { Service } from '../dist/main/service.js';

// Build/package separately. Every write uses a fresh isolated profile and
// loopback metadata; this script never opens a user's actual profile or keys.
const root = process.cwd(), packaged = process.argv.includes('--packaged');
const executableArg = process.argv.find(arg => arg.startsWith('--executable='));
const output = path.join(root, '.test-data', `model-limits-${packaged ? 'packaged' : 'development'}-${Date.now()}`);
const profile = path.join(output, 'profile'), workspace = path.join(output, '模型容量验证项目');
await fs.mkdir(output, { recursive: true });
const store = new Store(profile), service = new Service(store, () => '', () => {});
await service.workspace(workspace);
service.save();
store.close();
const evidence = { status: 'running', packaged, output, profile, checks: [], screenshots: [], pageErrors: [], metadataRequests: [], limitations: ['Isolated loopback metadata tests the actual settings and persistence flow; external provider quality or connectivity is not claimed.'] };
const fixtureId = 'fixture-capacity-model';
const sockets = new Set();
const server = createServer((req, res) => {
  evidence.metadataRequests.push({ method: req.method, url: req.url });
  const id = decodeURIComponent(req.url.split('/').at(-1));
  const metadata = id === fixtureId ? {
    id, context_window: 200000, max_output_tokens: 32768,
    capabilities: { effort: Object.fromEntries(['low', 'medium', 'high', 'xhigh', 'max'].map(level => [level, { supported: ['low', 'high'].includes(level) }])), thinking: { types: { adaptive: { supported: false }, enabled: { supported: true } } } },
  } : { id, owned_by: 'openai' };
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(metadata));
});
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
let app, page, settings, fixture, unknown, catalogEntry;
const check = name => { evidence.checks.push(name); console.log('PASS ' + name); };
const call = async request => {
  const response = await page.evaluate(value => window.pm.request(value), request);
  assert.ok(response.ok, response.error);
  return response.data;
};
const models = async () => (await call({ type: 'models' })).groups.flatMap(group => group.models);
const form = () => settings.locator('.subdialog');
const capacity = () => form().locator('.model-limits-settings');
const contextInput = () => form().getByLabel('上下文窗口（tokens）', { exact: true });
const outputInput = () => form().getByLabel('最大输出（tokens）', { exact: true });
async function launch() {
  const common = { cwd: root, env: { ...process.env, PM_SLASH_DATA_DIR: profile } };
  app = await electron.launch(packaged ? { ...common, executablePath: executableArg?.slice('--executable='.length) || path.join(root, 'release', 'win-unpacked', 'slash.exe') } : { ...common, args: ['.'] });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => evidence.pageErrors.push(error.message));
  await page.locator('.brand').waitFor();
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.unmaximize(); window.setSize(1280, 800); });
  settings = page.getByRole('dialog', { name: '设置', exact: true });
}
async function openSettings() {
  await page.getByRole('button', { name: '设置', exact: true }).first().click();
  await settings.waitFor();
  await settings.locator('.settings-nav button').filter({ hasText: '模型' }).first().click();
  await settings.getByRole('button', { name: '添加模型', exact: true }).waitFor();
}
async function edit(entry) {
  await settings.locator('.model-row').filter({ hasText: entry.name }).getByRole('button', { name: '编辑', exact: true }).click();
  await form().waitFor();
  assert.equal(await capacity().getAttribute('open'), null, 'Advanced model capacity starts collapsed');
  await capacity().locator(':scope > summary').click();
}
async function save() {
  await form().getByRole('button', { name: '保存模型', exact: true }).click();
  await form().waitFor({ state: 'hidden' });
}
async function values(context, output, source) {
  await capacity().locator(`.model-limit-value[data-value="${context}"]`).waitFor();
  await capacity().locator(`.model-limit-value[data-value="${output}"]`).waitFor();
  assert.deepEqual(await capacity().locator('.model-limit-value').evaluateAll(items => items.map(item => item.dataset.source)), source);
}
async function screenshot(name) {
  await capacity().scrollIntoViewIfNeeded();
  const file = name + '.png';
  await page.screenshot({ path: path.join(output, file) });
  evidence.screenshots.push(file);
  const geometry = await form().evaluate(element => {
    const rect = element.getBoundingClientRect(), body = element.querySelector('.subdialog-body'), actions = element.querySelector('.subdialog-actions').getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, overflow: body.scrollWidth - body.clientWidth, actionsBottom: actions.bottom, height: innerHeight, width: innerWidth };
  });
  assert.ok(geometry.x >= 0 && geometry.y >= 0 && geometry.right <= geometry.width + 1 && geometry.bottom <= geometry.height + 1 && geometry.overflow <= 1 && geometry.actionsBottom <= geometry.height + 1, JSON.stringify(geometry));
}

try {
  await launch();
  await openSettings();
  await settings.getByRole('button', { name: '添加模型', exact: true }).click();
  await form().getByLabel('供应商名称', { exact: true }).fill('fixture-capacity');
  await form().getByLabel('显示名称', { exact: true }).fill('容量验证模型');
  await form().getByLabel('API 地址', { exact: true }).fill(baseUrl);
  await form().getByLabel('模型 ID', { exact: true }).fill(fixtureId);
  await form().locator('input[type="password"]').fill('fixture-isolated-key');
  await form().getByLabel('支持图片输入（视觉模型）', { exact: true }).check();
  await capacity().locator(':scope > summary').click();
  assert.match(await capacity().innerText(), /新模型保存后可查看自动值/);
  await save();
  fixture = (await models()).find(entry => entry.provider === 'fixture-capacity');
  assert.ok(fixture?.hasKey && fixture.supportsVision);
  assert.equal(fixture.contextWindow, undefined);
  assert.equal(fixture.maxTokens, undefined);
  check('添加模型保留密钥、图片能力，容量默认自动');

  await edit(fixture);
  await values(65536, 12000, ['unverified-compatibility', 'unverified-compatibility']);
  assert.match(await capacity().innerText(), /兼容值.*未验证/);
  await screenshot('01-unverified');
  await capacity().getByRole('button', { name: '重新检测模型能力', exact: true }).click();
  await values(200000, 32768, ['provider-model-metadata', 'provider-model-metadata']);
  const detected = await call({ type: 'modelThinkingCapability', modelEntryId: fixture.id });
  assert.deepEqual(detected.levels, ['low', 'high']);
  assert.equal(detected.limits.status, 'verified');
  await screenshot('02-upstream');
  check('自动来源由未验证兼容值更新为当前上游元数据，思考档位同时保留');

  await contextInput().fill('180000');
  await outputInput().fill('24000');
  await values(180000, 24000, ['user-override', 'user-override']);
  await save();
  fixture = (await models()).find(entry => entry.id === fixture.id);
  assert.equal(fixture.contextWindow, 180000);
  assert.equal(fixture.maxTokens, 24000);
  assert.ok(fixture.hasKey && fixture.supportsVision);
  await edit(fixture);
  await values(180000, 24000, ['user-override', 'user-override']);
  await screenshot('03-manual');
  check('手动容量实际保存并清楚显示来源，已有密钥与视觉能力保留');

  const beforeInvalid = fixture;
  for (const value of ['0', '-1', '1.5', 'abc', '9007199254740992']) {
    await contextInput().fill(value);
    await form().getByRole('button', { name: '保存模型', exact: true }).click();
    assert.match(await form().getByRole('alert').innerText(), /大于 0 的整数/);
    assert.deepEqual((await models()).find(entry => entry.id === fixture.id), beforeInvalid);
  }
  await contextInput().fill('180000');
  for (const value of ['180000', '200000']) {
    await outputInput().fill(value);
    await form().getByRole('button', { name: '保存模型', exact: true }).click();
    assert.match(await form().getByRole('alert').innerText(), /最大输出必须小于上下文窗口/);
    assert.deepEqual((await models()).find(entry => entry.id === fixture.id), beforeInvalid);
  }
  await outputInput().fill('24000');
  await form().getByRole('button', { name: '取消', exact: true }).click();
  check('零、负数、小数、文字、溢出和输出超过窗口均阻止保存且不改已有配置');
  await app.close(); app = undefined;

  await launch();
  fixture = (await models()).find(entry => entry.id === fixture.id);
  assert.equal(fixture.contextWindow, 180000);
  assert.equal(fixture.maxTokens, 24000);
  assert.ok(fixture.hasKey && fixture.supportsVision);
  assert.deepEqual((await call({ type: 'modelThinkingCapability', modelEntryId: fixture.id })).levels, ['low', 'high']);
  await openSettings();
  await edit(fixture);
  assert.equal(await contextInput().inputValue(), '180000');
  assert.equal(await outputInput().inputValue(), '24000');
  await values(180000, 24000, ['user-override', 'user-override']);
  check('应用真实重启后手动数值、密钥、视觉与已检测思考档位恢复');

  await capacity().getByRole('button', { name: '恢复自动值', exact: true }).click();
  assert.equal(await contextInput().inputValue(), '');
  assert.equal(await outputInput().inputValue(), '');
  assert.match(await capacity().innerText(), /保存后重新确认/);
  await save();
  fixture = (await models()).find(entry => entry.id === fixture.id);
  assert.equal(fixture.contextWindow, undefined);
  assert.equal(fixture.maxTokens, undefined);
  assert.ok(fixture.hasKey && fixture.supportsVision);
  await edit(fixture);
  await values(200000, 32768, ['provider-model-metadata', 'provider-model-metadata']);
  await screenshot('04-restored-auto');
  await contextInput().fill('160000');
  await save();
  await edit(fixture);
  await values(160000, 32768, ['user-override', 'provider-model-metadata']);
  await contextInput().fill('');
  await save();
  check('恢复自动清除覆盖并恢复已验证上游来源，两个字段也可独立覆盖和清除');

  const catalog = getBuiltinModels('openai').find(model => model.api === 'openai-responses' && model.contextWindow > model.maxTokens);
  assert.ok(catalog);
  await call({ type: 'modelUpsert', model: { provider: 'fixture-pi', name: 'Pi 目录验证模型', baseUrl: catalog.baseUrl, modelId: catalog.id, protocol: catalog.api } });
  catalogEntry = (await models()).find(entry => entry.provider === 'fixture-pi');
  await call({ type: 'modelUpsert', model: { provider: 'fixture-unknown', name: '同名中转验证模型', baseUrl, modelId: catalog.id, protocol: catalog.api }, key: 'fixture-unknown-key' });
  unknown = (await models()).find(entry => entry.provider === 'fixture-unknown');
  await settings.getByRole('button', { name: '关闭设置', exact: true }).click();
  await openSettings();
  await edit(catalogEntry);
  await values(catalog.contextWindow, catalog.maxTokens, ['pi-catalog:openai', 'pi-catalog:openai']);
  await screenshot('05-pi-catalog');
  await form().getByLabel('API 地址', { exact: true }).fill(baseUrl);
  await capacity().getByText(/连接信息已修改/).waitFor();
  assert.equal(await capacity().locator('[data-source^="pi-catalog"]').count(), 0);
  assert.equal(await capacity().getByRole('button', { name: '重新检测模型能力', exact: true }).isDisabled(), true);
  await form().getByRole('button', { name: '取消', exact: true }).click();
  await edit(unknown);
  await values(65536, 12000, ['unverified-compatibility', 'unverified-compatibility']);
  await capacity().getByRole('button', { name: '重新检测模型能力', exact: true }).click();
  await capacity().getByRole('button', { name: '重新检测模型能力', exact: true }).waitFor();
  await values(65536, 12000, ['unverified-compatibility', 'unverified-compatibility']);
  await screenshot('06-same-name-proxy');
  await form().getByRole('button', { name: '取消', exact: true }).click();
  check('精确官方连接显示 Pi 来源，同名中转与普通模型列表不冒充已验证容量，改连接不显示旧来源');

  await app.close(); app = undefined;
  await launch();
  fixture = (await models()).find(entry => entry.id === fixture.id);
  assert.equal(fixture.contextWindow, undefined);
  assert.equal(fixture.maxTokens, undefined);
  const restored = await call({ type: 'modelThinkingCapability', modelEntryId: fixture.id });
  assert.equal(restored.limits.contextWindow, 200000);
  assert.equal(restored.limits.maxTokens, 32768);
  assert.equal(restored.limits.source, 'provider-model-metadata');
  assert.deepEqual(restored.levels, ['low', 'high']);
  await openSettings();
  await edit(fixture);
  assert.equal(await contextInput().inputValue(), '');
  assert.equal(await outputInput().inputValue(), '');
  await values(200000, 32768, ['provider-model-metadata', 'provider-model-metadata']);
  await screenshot('07-restart-auto');
  check('恢复自动后再次真实重启，无手动覆盖且上游容量与思考能力快照持久恢复');
  assert.deepEqual(evidence.pageErrors, []);
  evidence.models = await models();
  evidence.restoredCapability = restored;
  evidence.status = 'passed';
} catch (error) {
  evidence.status = 'failed'; evidence.error = String(error);
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(evidence, null, 2));
  if (app) await app.close();
  for (const socket of sockets) socket.destroy();
  await new Promise(resolve => server.close(resolve));
  console.log(JSON.stringify({ status: evidence.status, output, checks: evidence.checks.length, error: evidence.error }));
}
