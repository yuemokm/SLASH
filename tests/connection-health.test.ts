import assert from 'node:assert/strict';
import {test} from 'node:test';
import {capabilityHash,summarizeConnectionFailure,summarizeConnectionHealth} from '../main/connection-health.js';

test('连接健康快照区分 CLI 能力检查与 MCP 工具能力',()=>{
 const cli=summarizeConnectionHealth('cli-1',{kind:'cli',version:'dws 1.0',notice:'ok'},'2026-09-27T00:00:00.000Z');
 assert.equal(cli.status,'healthy');assert.equal(cli.version,'dws 1.0');assert.deepEqual(cli.capabilities,[]);
 const mcp=summarizeConnectionHealth('mcp-1',{kind:'mcp',tools:[{name:'publish'},{name:'read'}]},'2026-09-27T00:00:00.000Z');
 assert.equal(mcp.status,'healthy');assert.deepEqual(mcp.capabilities,['publish','read']);assert.match(capabilityHash(mcp),/^[a-f0-9]{64}$/);
 const empty=summarizeConnectionHealth('mcp-2',{kind:'mcp',tools:[]},'2026-09-27T00:00:00.000Z');assert.equal(empty.status,'degraded');
});

test('连接检查失败保留诊断摘要并限制长度',()=>{
 const snapshot=summarizeConnectionFailure('cli-1',new Error('认证失败'),'2026-09-27T00:00:00.000Z');
 assert.equal(snapshot.status,'failed');assert.equal(snapshot.capabilities.length,0);assert.equal(snapshot.diagnostic,'认证失败');
});
