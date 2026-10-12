import fs from 'node:fs/promises';
import path from 'node:path';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
const [directory,mode]=process.argv.slice(2),server=new Server({name:'isolated-dispatch-fixture',version:'1'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>{await fs.writeFile(path.join(directory,'catalog-ready'),'ready');for(let i=0;i<1500;i++){if(await fs.access(path.join(directory,'catalog-release')).then(()=>true,()=>false))break;await new Promise(resolve=>setTimeout(resolve,10));if(i===1499)throw Error('fixture catalog not released');}return{tools:[{name:'publish.fixture',inputSchema:{type:'object',properties:{content:{type:'string'}},required:['content'],additionalProperties:false}}]};});
server.setRequestHandler(CallToolRequestSchema,async request=>{await fs.appendFile(path.join(directory,'server-calls.jsonl'),JSON.stringify(request.params)+'\n');if(mode==='remote_sensitive')throw Error('MCP_PRE_DISPATCH_REJECTED PRIVATE_FIXTURE_TOKEN=synthetic-secret https://private.example.invalid/account');if(mode==='lost')process.exit(42);return{content:[{type:'text',text:'fixture publication completed'}],structuredContent:{success:true,status:'completed'}};});
await server.connect(new StdioServerTransport());
