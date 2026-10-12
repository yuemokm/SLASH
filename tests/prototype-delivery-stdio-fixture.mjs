import fs from 'node:fs/promises';
import path from 'node:path';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
const [dir,mode]=process.argv.slice(2),server=new Server({name:'fixture-only-static-files',version:'1'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>{if(await fs.access(path.join(dir,'wait-catalog')).then(()=>true,()=>false)){await fs.writeFile(path.join(dir,'catalog-ready'),'ready');for(let i=0;i<1200;i++){if(await fs.access(path.join(dir,'catalog-release')).then(()=>true,()=>false))break;await new Promise(resolve=>setTimeout(resolve,10));if(i===1199)throw Error('catalog fixture wait timed out');}}return{tools:[{name:'fixture.publishFiles',inputSchema:JSON.parse(await fs.readFile(path.join(dir,'tool-schema.json'),'utf8'))}]};});
server.setRequestHandler(CallToolRequestSchema,async request=>{await fs.appendFile(path.join(dir,'received.jsonl'),JSON.stringify(request.params)+'\n');if(mode==='lost')process.exit(42);return{content:[{type:'text',text:'local fixture receipt'}],structuredContent:{success:true,status:'completed'}};});
await server.connect(new StdioServerTransport());
