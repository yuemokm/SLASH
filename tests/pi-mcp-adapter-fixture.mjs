import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
const server=new Server({name:'slash-pi-adapter-fixture',version:'1'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'echo.result',description:'Return request identity after an optional delay',inputSchema:{type:'object',properties:{id:{type:'string'},delay:{type:'number'},fail:{type:'boolean'}},required:['id'],additionalProperties:false}}]}));
server.setRequestHandler(CallToolRequestSchema,async request=>{const args=request.params.arguments??{};await new Promise(resolve=>setTimeout(resolve,Number(args.delay??0)));return{content:[{type:'text',text:String(args.id)}],structuredContent:{id:args.id},isError:args.fail===true};});
await server.connect(new StdioServerTransport());
