// Run with node --import tsx. Default preparation and review make no model request.
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {prepareBusinessBenchmark, recordBenchmarkReview, requireEvaluationPath} from '../main/quality-evaluation.ts';
import {recordProductionInitialReview} from './production-agent-initial-stage.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);if(i<0)return undefined;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('EVALUATION_ARGUMENT_VALUE_REQUIRED');return args[i+1];};
try {
 const allowed=new Set(['--prepare','--source-root','--model-database','--review','--review-initial','--test-dir','--case','--observations','--prototype-checks']);
 for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw Error('EVALUATION_ARGUMENT_UNKNOWN');if(!['--prepare','--review','--review-initial','--prototype-checks'].includes(args[i]))i++;}
 if(args.includes('--review-initial')&&!args.includes('--prepare')&&!args.includes('--review')){
  const reviewed=await recordProductionInitialReview({repo,testDir:value('--test-dir'),caseId:value('--case'),observationsPath:value('--observations')});
  console.log(JSON.stringify({status:reviewed.result.verdict,counts:reviewed.result.counts,reviewEvidence:reviewed.reviewEvidence,proof:reviewed.proof,cloudExecuted:false}));if(reviewed.result.verdict!=='satisfied')process.exitCode=1;
 } else if(args.includes('--prepare')&&!args.includes('--review')&&!args.includes('--review-initial')) {
  const m=await prepareBusinessBenchmark(repo,value('--source-root')??'E:\\code\\slash test\\资源\\参考资料',value('--model-database'),{prototypeChecks:args.includes('--prototype-checks')});
  console.log(JSON.stringify({status:m.preflight,testDir:m.output,cases:m.cases.length,factChecks:m.factChecks,modelMetadata:m.modelMetadata,cloudExecuted:false}));
  if(m.preflight!=='passed')process.exitCode=1;
 } else if(args.includes('--review')&&!args.includes('--prepare')&&!args.includes('--review-initial')) {
  const dir=await requireEvaluationPath(path.join(repo,'.test-data'),path.resolve(value('--test-dir')??''));
  const caseId=value('--case'),receiptPath=await requireEvaluationPath(dir,path.join(dir,'cases',caseId??'','execution.json'));
  const receipt=JSON.parse(await fs.readFile(receiptPath,'utf8'));
  if(receipt.status!=='generated_pending_independent_review'||receipt.caseId!==caseId||!receipt.cloudExecuted)throw Error('EVALUATION_GENERATED_RECEIPT_REQUIRED');
  const observationsPath=await requireEvaluationPath(dir,path.resolve(value('--observations')??''));
  const result=await recordBenchmarkReview(dir,caseId,JSON.parse(await fs.readFile(observationsPath,'utf8')),receipt.artifacts);
  result.elapsedMs=receipt.elapsedMs??'unknown';
  // A human must explicitly record this; no inferred savings or silent zero.
  result.manualModificationCount=receipt.manualModificationCount??'unknown';
  const target=await requireEvaluationPath(dir,path.join(dir,'cases',caseId,'result.json'));
  await fs.writeFile(target,JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:result.verdict,counts:result.counts,result:target,cloudExecuted:false}));
 } else throw Error('EVALUATION_SELECT_PREPARE_OR_REVIEW');
} catch(error) {console.error(JSON.stringify({status:'failed',reason:/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'EVALUATION_PREFLIGHT_FAILED',cloudExecuted:false}));process.exitCode=1;}
