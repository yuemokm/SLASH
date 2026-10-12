import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..'), port = 3322, base = `http://127.0.0.1:${port}`;
const output = path.join(root, 'test-results', `auth-ui-${Date.now()}`);
await mkdir(output, { recursive: true });
let child, browser, logs = '';
const evidence = { mockedAuth: true, realAccountsCreated: 0, emailsSent: 0, checks: [], errors: [] };
try {
  child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, env: { ...process.env, KNOWLEDGE_LOCAL_FIXTURE: 'false', NEXT_PUBLIC_SUPABASE_URL: 'https://knowledge-auth.example.invalid', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', NEXT_TELEMETRY_DISABLED: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => logs += data); child.stderr.on('data', data => logs += data);
  let ready = false;
  for (let i = 0; i < 90; i++) { try { if ((await fetch(base)).ok) { ready = true; break; } } catch {} if (child.exitCode !== null) throw Error('Next dev exited'); await new Promise(resolve => setTimeout(resolve, 500)); }
  assert.ok(ready);
  browser = await chromium.launch({ headless: true, ...(process.env.KNOWLEDGE_SMOKE_BROWSER_CHANNEL ? { channel: process.env.KNOWLEDGE_SMOKE_BROWSER_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1150, height: 900 } });
  page.on('pageerror', error => evidence.errors.push(error.message));
  let signup, loginAttempts = 0;
  await page.route('https://knowledge-auth.example.invalid/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/auth/v1/signup') {
      signup = { body: request.postDataJSON(), redirect: url.searchParams.get('redirect_to') };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user: { id: 'fixture-user', email: 'colleague@example.invalid' }, session: null }) });
    } else if (url.pathname === '/auth/v1/token') {
      loginAttempts++;
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error_code: 'email_not_confirmed', message: 'Email not confirmed' }) });
    } else { evidence.errors.push(`Unexpected auth request ${url.pathname}`); await route.abort(); }
  });
  await page.goto(base);
  await page.getByRole('button', { name: '没有账号？注册' }).click();
  await page.getByLabel('邮箱', { exact: true }).fill('colleague@example.invalid');
  await page.getByLabel('密码', { exact: true }).fill('fixture-password-123');
  await page.getByRole('button', { name: '注册并发送确认邮件' }).click();
  await page.getByRole('status').filter({ hasText: '请检查邮箱' }).waitFor();
  assert.equal(signup.body.email, 'colleague@example.invalid'); assert.equal(signup.redirect, `${base}/`);
  assert.equal(signup.body.data && Object.keys(signup.body.data).length, 0);
  evidence.checks.push('explicit signup uses official SDK with current-origin confirmation redirect', 'registration waits for email confirmation and grants no knowledge access');
  await page.getByLabel('密码', { exact: true }).fill('fixture-password-123');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '邮箱尚未确认' }).waitFor(); assert.equal(loginAttempts, 1);
  evidence.checks.push('unconfirmed email gets actionable login message');
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true }); evidence.checks.push('registration/login fit mobile 390px');
  assert.deepEqual(evidence.errors, []); evidence.passed = true;
} catch (error) { evidence.passed = false; evidence.failure = String(error); process.exitCode = 1; }
finally {
  await browser?.close();
  if (child && child.exitCode === null) { if (process.platform === 'win32') await new Promise(resolve => { const stop = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); stop.on('close', resolve); }); else child.kill('SIGTERM'); }
  await writeFile(path.join(output, 'result.json'), JSON.stringify(evidence, null, 2)); await writeFile(path.join(output, 'server.log'), logs); console.log(JSON.stringify({ output, ...evidence }, null, 2));
}
