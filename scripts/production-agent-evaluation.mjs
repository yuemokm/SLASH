// Offline only: no Electron launch, credential read, model request or baseline rewrite.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {summarizeProductionEvaluation} from '../main/production-agent-evaluation.ts';
import {requireEvaluationPath} from '../main/quality-evaluation.ts';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
try{
 if(args.length!==2||args[0]!=='--index')throw Error('PRODUCTION_INDEX_ARGUMENT_REQUIRED');
 const index=await requireEvaluationPath(path.join(repo,'.test-data'),path.resolve(args[1]));
 const summary=await summarizeProductionEvaluation(index,repo),folder=await fs.mkdtemp(path.join(repo,'.test-data','production-evaluation-'));
 await fs.writeFile(path.join(folder,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
 await fs.writeFile(path.join(folder,'regression.json'),JSON.stringify({schemaVersion:1,baselineChanged:false,items:summary.regression},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({releaseGatePassed:summary.releaseGatePassed,verified:summary.verified,denominator:summary.denominator,critical:summary.critical,comparable:summary.comparable,metrics:summary.metrics,performance:summary.performance,output:folder,cloudExecuted:false}));
 if(!summary.releaseGatePassed)process.exitCode=1;
}catch(error){console.error(JSON.stringify({status:'blocked',reason:error instanceof Error&&/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'PRODUCTION_EVALUATION_EVIDENCE_INVALID',cloudExecuted:false}));process.exitCode=1;}
