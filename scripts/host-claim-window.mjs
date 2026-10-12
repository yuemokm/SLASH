// Test host process crashes after the atomic first receipt, before MCP launch.
import fs from 'node:fs/promises';
import {Store} from '../main/store.ts';
import {PrototypePublishOperation} from '../main/prototype-publish-operation.ts';
const {databaseDirectory,configuration,runId,operationId,evidencePath}=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const store=new Store(databaseDirectory),domain=new PrototypePublishOperation(store,configuration,()=>{throw Error('MCP_MUST_NOT_START');},()=>{});
const result=domain.claim(runId,operationId);
await fs.writeFile(evidencePath,JSON.stringify({pid:process.pid,claimed:result.claimed,operationId:result.receipt.operationId,hasInitialReceipt:Boolean(store.operationsForRun(runId)[0]),hasRecovery:Boolean(store.recoveryForOperation(result.receipt.operationId)),networkCalls:0}));
store.close();process.exit(0);
