// Separate test HOST process owns its Store and one genuine stdio child.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Store} from '../main/store.ts';
import {PrototypePublishOperation} from '../main/prototype-publish-operation.ts';
import {createPiMcpSession} from '../main/pi-mcp-runtime.ts';
const options=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const store=new Store(options.databaseDirectory);let child;
const domain=new PrototypePublishOperation(store,options.configuration,async input=>{
 const childConfig=path.join(options.directory,'phase-config.json');await fs.writeFile(childConfig,JSON.stringify({configuration:input.configuration,restoredDeployId:input.restoredDeployId,origin:options.origin,fixtureOrigin:options.origin,token:'LOCAL_SYNTHETIC_NOT_CREDENTIAL',evidencePath:options.childEvidencePath,hostPid:process.pid}));
 return createPiMcpSession({command:process.execPath,args:['--import',options.loader,options.serverPath,childConfig],env:options.env,cwd:options.directory,beforeDispatch:input.beforeDispatch});
},()=>{});
try{const receipt=await domain.create(options.runId,options.operationId);await fs.writeFile(options.resultPath,JSON.stringify({hostPid:process.pid,receipt}));}
finally{await domain.close();try{child=JSON.parse(await fs.readFile(options.childEvidencePath,'utf8'));const until=Date.now()+7000;while(Date.now()<until){try{process.kill(child.pid,0);await new Promise(resolve=>setTimeout(resolve,20));}catch{child.processAliveAfterClose=false;break;}}if(child.processAliveAfterClose!==false)throw Error('CHILD_NOT_CLOSED');await fs.writeFile(options.childEvidencePath,JSON.stringify(child));}catch(error){if(error.code!=='ENOENT')throw error;}store.close();}
