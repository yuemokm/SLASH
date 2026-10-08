import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { _electron as electron, chromium } from 'playwright';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
// Execute only after root supplies final applied HTML + hash + independent review.
// All recorded inputs/frames are native product/prototype behavior, no page edits.
const dir = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(dir, '../../..');
const option = name => process.argv[process.argv.indexOf(name) + 1];
assert(process.argv.includes('--source') && process.argv.includes('--sha') && process.argv.includes('--review'), 'Final immutable source, sha and review receipt are required');
const source = path.resolve(option('--source')), expected = option('--sha'), review = path.resolve(option('--review'));
const compact = process.argv.includes('--compact'); const takeName = compact ? '05-repair-compact' : '05-repair';
for (const file of [source, review]) { const relative = path.relative(path.join(repo, '.test-data'), file); assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative)); }
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = await fs.readFile(source); assert.equal(hash(bytes), expected);
const reviewBytes = await fs.readFile(review); const reviewReceipt = JSON.parse(reviewBytes.toString('utf8'));
const prior = path.join(dir, '.capture/2026-10-05T09-02-41-727Z');
const profile = path.join(prior, 'profile'), project = path.join(prior, '演示隔离项目');
const destination = path.join(project, '原型/修订后.html');
const output = path.join(dir, '.capture', 'repair-' + new Date().toISOString().replace(/[:.]/g, '-'));
try { await fs.access(path.join(dir, 'assets/footage', takeName + '.mp4')); throw Error('Refusing to overwrite recorded repair footage'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.mkdir(output); await fs.writeFile(destination, bytes);
const result = { source, sha256: expected, independentReview: review, independentReviewSha256: hash(reviewBytes), independentReviewCounts: reviewReceipt.counts, sourceKind: 'actual_model_applied_html_immutable_copy', profile, startedAt: new Date().toISOString(), checks: [], pageErrors: [], notice: 'Only HTML revision; PRD and comparison were not changed. Simulated service failure/retry does not verify backend.' };
let app, context, page, stop = false, loop; const frames = [], start = Date.now();
const server = http.createServer((req, res) => { if (req.url !== '/' && req.url !== '/index.html') { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(bytes); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  app = await electron.launch({ executablePath: path.join(repo, 'node_modules/electron/dist/electron.exe'), cwd: repo, args: ['.'], env: { ...process.env, PM_SLASH_DATA_DIR: profile } });
  page = await app.firstWindow(); page.on('pageerror', error => result.pageErrors.push(error.message)); page.setDefaultTimeout(15000); await page.locator('.brand').waitFor();
  assert.equal(path.resolve(await app.evaluate(({ app }) => app.getPath('userData'))), profile);
  result.applicationVersion = await app.evaluate(({ app }) => app.getVersion());
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.unmaximize(); window.setContentSize(1840, 870); });
  await page.locator('.rail-item').filter({ has: page.getByText('成果', { exact: true }) }).click();
  await page.getByRole('button', { name: /^原型 4 个文件/ }).click(); await page.locator('.file-row').filter({ hasText: '修订后.html' }).getByRole('button', { name: '阅读', exact: true }).click();
  await page.screenshot({ path: path.join(dir, 'assets/footage/05-application.png') }); await app.close(); app = undefined;
  context = await chromium.launchPersistentContext(path.join(output, 'browser-profile'), { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, viewport: compact ? { width: 640, height: 650 } : { width: 950, height: 920 }, serviceWorkers: 'block', args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  await context.routeWebSocket('**/*', socket => socket.close());
  page = context.pages()[0]; page.on('pageerror', error => result.pageErrors.push(error.message)); await page.goto(origin);
  assert.equal(await page.evaluate(() => typeof window.pm), 'undefined');
  const frame = page; await frame.locator('.src-card[data-src="manual"]').click(); await frame.locator('#nextBtn').click();
  const recordingStart = Date.now();
  loop = (async () => { while (!stop) { const filename = path.join(output, String(frames.length).padStart(5, '0') + '.jpg'), t = (Date.now() - recordingStart) / 1000; await page.screenshot({ path: filename, type: 'jpeg', quality: 94 }); frames.push({ filename, t }); await wait(180); } })();
  await frame.locator('#f_name').fill('比赛合成机会门店 · 修订复验'); await frame.locator('#locBtn').click(); await frame.locator('#f_detail').fill('合成详细地址 · 修订复验'); await wait(4500);
  await frame.locator('#simulateFailure').check(); await frame.locator('#submitBtn').click(); await frame.locator('#serviceError').waitFor({ state: 'visible' });
  assert.match(await frame.locator('#serviceError').textContent(), /模拟服务失败/); assert.match(await frame.locator('#f_name').inputValue(), /修订复验/); assert.match(await frame.locator('#f_detail').inputValue(), /修订复验/); result.checks.push('Actual simulated service failure, name/detail inputs retained'); await wait(7000);
  await frame.locator('#f_detail').fill('合成详细地址 · 用户已调整'); await frame.locator('#serviceError').waitFor({ state: 'hidden' }); result.checks.push('Actual detail input clears prior service error'); await wait(5000);
  await frame.locator('#simulateFailure').uncheck(); await frame.locator('#retryBtn').click(); await frame.locator('.code-box').waitFor(); assert.match((await frame.locator('.code-box').textContent()).trim(), /^JHWD\d{10}$/); result.checks.push('Actual retry completes simulated success'); await wait(5000);
  await page.screenshot({ path: path.join(dir, 'assets/footage', takeName + '.png') });
  await wait(Math.max(0, 50000 - (Date.now() - recordingStart))); stop = true; await loop;
  const duration = (Date.now() - recordingStart) / 1000;
  await fs.writeFile(path.join(output, 'frames.txt'), frames.map((frame, index) => `file '${frame.filename.replace(/\\/g, '/')}'\nduration ${((frames[index + 1]?.t ?? duration) - frame.t).toFixed(4)}`).join('\n') + `\nfile '${frames.at(-1).filename.replace(/\\/g, '/')}'\n`);
  const mp4 = path.join(dir, 'assets/footage', takeName + '.mp4'); const encode = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(output, 'frames.txt'), '-r', '30', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', mp4], { encoding: 'utf8' }); assert.equal(encode.status, 0, encode.stderr);
  result.clip = { path: mp4, duration, sha256: hash(await fs.readFile(mp4)), frames: frames.length }; result.status = 'recorded';
  assert.equal(hash(await fs.readFile(destination)), expected); assert.deepEqual(result.pageErrors, []);
} catch (error) { result.status = 'failed'; result.error = error.stack; process.exitCode = 1; }
finally { stop = true; if (loop) await loop.catch(() => {}); if (app) await app.close(); if (context) await context.close(); await new Promise(resolve => server.close(resolve)); result.totalMs = Date.now() - start; await fs.writeFile(path.join(output, 'recording.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ output, status: result.status, error: result.error })); }
