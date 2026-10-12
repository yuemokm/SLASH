import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createJiti} from 'jiti';
import {hash} from './files.js';
import type {TaskAcceptanceContract,TaskAcceptanceReport} from '../shared/task-acceptance.js';
import type {GoalReviewReceipt} from '../shared/pi-goal-review.js';
import type {PiGoalAuditImplementation} from './pi-goal-auditor.js';
const require=createRequire(import.meta.url),jiti=createJiti(import.meta.url,{moduleCache:true,fsCache:false});
let loaded:Promise<PiGoalAuditImplementation>|undefined;
/** Pinned MIT published source seam. Only the auditor is loaded, never goal.ts. */
export async function loadPiGoalAuditor(){const root=path.dirname(require.resolve('pi-goal-x/package.json')),manifest=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));if(manifest.name!=='pi-goal-x'||manifest.version!=='0.32.3'||manifest.license!=='MIT')throw Error('PI_GOAL_PACKAGE_VERSION_MISMATCH');return loaded??=(async()=>{const module=await jiti.import<{runGoalCompletionAuditor:PiGoalAuditImplementation}>(path.join(root,'extensions','goal-auditor.ts'));if(typeof module.runGoalCompletionAuditor!=='function')throw Error('PI_GOAL_AUDITOR_UNAVAILABLE');return module.runGoalCompletionAuditor;})().catch(error=>{loaded=undefined;throw error;});}
export function goalReviewInputHash(contract:TaskAcceptanceContract,report:TaskAcceptanceReport){return hash(JSON.stringify({contractHash:contract.contractHash,targets:report.targets,dependencies:report.dependencies,outputDependencies:report.outputDependencies,sources:report.sources,results:report.results,regression:report.regression}));}
export function goalReviewEligible(contract:TaskAcceptanceContract,report:TaskAcceptanceReport,hasExistingContentReview:boolean){return contract.scope==='deliverable'&&contract.outputs.some(output=>output.kind==='markdown'||output.kind==='flow')&&report.targets.length>0&&report.versionState==='current'&&report.status!=='failed'&&!hasExistingContentReview&&!report.contentReviewRequired&&!report.visualReviewRequired;}
export function refreshGoalReview(receipt:GoalReviewReceipt,contract:TaskAcceptanceContract,report:TaskAcceptanceReport):GoalReviewReceipt{if(receipt.runId!==contract.runId||receipt.contractHash!==contract.contractHash||receipt.inputHash!==goalReviewInputHash(contract,report)||report.versionState!=='current')return{...receipt,status:'unverified',versionState:report.versionState==='unavailable'?'unavailable':'stale',output:'',error:'成果、资料或用户要求已变化，旧完成核对意见已失效'};return receipt;}
