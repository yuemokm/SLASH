import fs from 'node:fs/promises';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
const server=new Server({name:'slash-delivery-local-fixture',version:'1'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'publish_document',inputSchema:{type:'object',properties:{document:{type:'object',properties:{content:{type:'string'}},required:['content']}},required:['document']}}]}));
server.setRequestHandler(CallToolRequestSchema,async request=>{await fs.appendFile(process.argv[2],JSON.stringify({tool:request.params.name,args:request.params.arguments})+'\n');return{content:[{type:'text',text:'isolated delivery saved'}],structuredContent:{success:true}};});
await server.connect(new StdioServerTransport());
