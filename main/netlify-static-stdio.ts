import {readPrivateNetlifyBootstrap} from './netlify-static-bootstrap.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema, CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {openStaticPhase} from './netlify-static-phase.js';
import {staticPhaseArgumentsSchema, staticUploadArgumentsSchema} from '../shared/prototype-publish-operation.js';
import {PRIVATE_NETLIFY_TOKEN_ENV} from '../shared/netlify-static-private.js';

// Private compiled entry: no fixture origin, arbitrary URL, evidence path or credential file.
async function main() {
  if (process.argv.length !== 4 || !/^[a-f0-9]{64}$/.test(process.argv[3])) {
    throw Error('PRIVATE_BOOTSTRAP_INVALID');
  }
  const token = process.env[PRIVATE_NETLIFY_TOKEN_ENV];
  delete process.env[PRIVATE_NETLIFY_TOKEN_ENV];
  if (!token || !/^\S{10,4096}$/.test(token)) throw Error('PRIVATE_CREDENTIAL_MISSING');
  const bootstrap = await readPrivateNetlifyBootstrap(process.argv[2], process.argv[3]);
  const phase = openStaticPhase({...bootstrap, origin: 'https://api.netlify.com', token});
  const server = new Server({name: 'slash-private-netlify-static', version: '1'}, {capabilities: {tools: {}}});
  const names = bootstrap.configuration.version === 'netlify-static-recovery-v1' ?
    ['static_status'] : ['static_create', 'static_upload', 'static_status'];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: names.map(name => ({
      name,
      description: 'Host publication phase; unavailable to the generation model',
      inputSchema: z.toJSONSchema(name === 'static_upload' ?
        staticUploadArgumentsSchema : staticPhaseArgumentsSchema, {target: 'draft-7'}),
      annotations: {readOnlyHint: name === 'static_status', idempotentHint: name === 'static_status', openWorldHint: true}
    }))
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      if (!names.includes(request.params.name)) throw Error('PRIVATE_TOOL_DENIED');
      const method = request.params.name === 'static_create' ? phase.create :
        request.params.name === 'static_upload' ? phase.upload : phase.status;
      const value = await method(request.params.arguments, extra.signal);
      return {content: [{type: 'text', text: JSON.stringify(value)}], structuredContent: value};
    } catch {
      return {isError: true, content: [{type: 'text', text: 'PUBLISH_PHASE_UNCONFIRMED'}]};
    }
  });
  await server.connect(new StdioServerTransport());
}
main().catch(() => {
  process.stderr.write('PRIVATE_PUBLISHER_START_FAILED\n');
  process.exitCode = 1;
});

