import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('real Electron source runner respects native details, nested summary and ordinary hidden visibility',()=>{
 const child=spawnSync(process.execPath,[fileURLToPath(new URL('./prototype-browser-visibility-electron-fixture.mjs',import.meta.url))],{cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8',timeout:100000,windowsHide:true});
 assert.equal(child.status,0,(child.stdout+child.stderr).slice(-6000));
 const report=JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1)!);
 assert.equal(report.status,'passed');assert.equal(report.checks,5);assert.equal(report.cloudCalls,0);
});
