import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.js';
import { Service } from '../main/service.js';
import { connectionDiscoveriesSchema, type ConnectionDiscovery } from '../shared/types.js';
import type { AgentConnectionView, RuntimeOptions } from '../main/agent.js';

const installed: ConnectionDiscovery[] = [{ id: 'official-feishu', provider: 'feishu', name: '飞书官方 CLI', command: 'lark-cli', version: '1.0', source: 'path', capabilities: ['document_delivery'], available: true }];

test('UI CLI discovery excludes a manually configured MCP while preserving the managed connection registry', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-ui-discovery-'));
  const store = new Store(path.join(dir, 'db'));
  t.after(async () => { store.close(); await fs.rm(dir, { recursive: true, force: true }); });
  const service = new Service(store, () => 'key', () => {}, undefined, { discoverConnections: async () => installed });
  const manual = { id: 'manual-mcp', name: '手动 MCP', kind: 'mcp' as const, command: 'node', args: ['server.js'], enabled: true, source: 'manual' as const };
  service.state.connections.push(manual);
  service.save();

  const uiCandidates = connectionDiscoveriesSchema.parse(await service.discoverConnections());
  assert.deepEqual(uiCandidates, installed);
  assert.equal(uiCandidates.some(item => item.id === manual.id), false);
  assert.deepEqual(service.state.connections.find(item => item.id === manual.id), manual);
  assert.equal(service.state.connections.some(item => item.discoveryId === installed[0].id && item.kind === 'cli'), true);
  assert.equal(service.listAgentConnections().some(item => item.name === manual.name && item.kind === 'mcp'), true);
  assert.equal(connectionDiscoveriesSchema.safeParse([manual]).success, false, 'The renderer contract rejects a merged agent view rather than masking its missing provider.');
});

test('Pi discover_connections still returns the merged MCP and discovered CLI view', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-agent-discovery-'));
  const store = new Store(path.join(dir, 'db'));
  t.after(async () => { store.close(); await fs.rm(dir, { recursive: true, force: true }); });
  let resolveDiscovery!: (items: AgentConnectionView[]) => void;
  let rejectDiscovery!: (reason: unknown) => void;
  const received = new Promise<AgentConnectionView[]>((resolve, reject) => { resolveDiscovery = resolve; rejectDiscovery = reject; });
  const runtime = async (options: RuntimeOptions) => ({
    messages: [{ role: 'assistant', stopReason: 'stop' }], sessionFile: undefined,
    prompt: async () => { try { resolveDiscovery(await options.discoverConnections()); } catch (reason) { rejectDiscovery(reason); } },
    abort: async () => {}, dispose: () => {},
  });
  const service = new Service(store, () => 'key', () => {}, runtime as never, { discoverConnections: async () => installed });
  await service.workspace(path.join(dir, 'workspace'));
  service.state.connections.push({ id: 'manual-mcp', name: '手动 MCP', kind: 'mcp', command: 'node', args: [], enabled: true, source: 'manual' });
  service.state.permissions = { ...service.state.permissions!, connection_config: 'allow' };
  service.save();
  const conversation = service.conversation();
  const runId = await service.send(conversation, '发现本机连接', 'build', 'standard');
  const timeout = setTimeout(() => rejectDiscovery(new Error('Agent discovery did not run')), 3000);
  const merged = await received.finally(() => clearTimeout(timeout));
  assert.equal(merged.some(item => item.name === '手动 MCP' && item.kind === 'mcp'), true);
  assert.equal(merged.some(item => item.name === installed[0].name && item.kind === 'cli'), true);
  // Model completion is followed by host validation. Wait for finalization,
  // including native queue cleanup, rather than treating validating as done.
  for (let attempt = 0; attempt < 600 && (!service.state.runs.find(run => run.id === runId)?.finishedAt || service.active.has(runId)); attempt++) await new Promise(resolve => setTimeout(resolve, 5));
  const run = service.state.runs.find(run => run.id === runId)!;
  assert.equal(run.status, 'succeeded', run.error);
  assert.ok(run.finishedAt);
  assert.equal(service.active.has(runId), false);
});
