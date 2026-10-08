import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {BUSINESS_BENCHMARK_CASES,evaluateBenchmark,type BenchmarkObservation} from '../shared/quality-evaluation.js';
import {auditEvaluationModels, evaluationHash, insideEvaluationRoot, recordBenchmarkReview} from '../main/quality-evaluation.js';

test('16 business benchmark cases retain independent expectations and unknown unmeasured metrics',()=>{
 assert.equal(BUSINESS_BENCHMARK_CASES.length,16);
 assert.equal(new Set(BUSINESS_BENCHMARK_CASES.map(item=>item.id)).size,16);
 for(const item of BUSINESS_BENCHMARK_CASES){
  assert.ok(item.prompts.length&&item.checks.length);
  const r=evaluateBenchmark(item);assert.equal(r.verdict,'unknown');assert.equal(r.counts.satisfied,0);
  assert.equal(r.elapsedMs,'unknown');assert.equal(r.manualModificationCount,'unknown');assert.equal(r.missingItems.length,item.checks.length);
  item.checks.forEach(check=>{if(check.basis==='verified_source')assert.ok(check.sourceIds.length&&check.locator);});
 }
 assert.equal(BUSINESS_BENCHMARK_CASES.find(item=>item.id==='QE16')?.prompts.length,3);
});
test('business self-report or wrong evidence cannot create a pass',()=>{
 const c=BUSINESS_BENCHMARK_CASES[0];
 const o:BenchmarkObservation={checkId:c.checks[0].id,status:'satisfied',kind:'business_review',artifactSha256:'a'.repeat(64),evidencePath:'review.json',observer:'independent human',note:'Source and PRD verified'};
 assert.throws(()=>evaluateBenchmark(c,[o]),/OUTPUT_NOT_GENERATED/);
 assert.throws(()=>evaluateBenchmark(c,[{...o,kind:'runtime'}],'generated'),/KIND_INVALID/);
 assert.throws(()=>evaluateBenchmark(c,[{...o,observer:''}],'generated'),/EVIDENCE_REQUIRED/);
 assert.throws(()=>evaluateBenchmark(c,[o,o],'generated'),/CHECK_ID_INVALID/);
 assert.equal(evaluateBenchmark(c,[o],'generated').verdict,'satisfied');
 assert.equal(evaluateBenchmark(c,[{...o,status:'violated'}],'generated').verdict,'violated');
});
test('read-only metadata audit cannot leak secrets or mutate profile',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slash-qe-metadata-')),file=path.join(root,'slash.sqlite');
 const db=new DatabaseSync(file);db.exec('CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
 db.prepare('INSERT INTO kv VALUES (?,?)').run('state',JSON.stringify({defaultModelId:'test-id',models:[{id:'test-id',name:'test',modelId:'m',baseUrl:'private-url',protocol:'openai-completions',apiKey:'secret-in-model'}],conversations:[{messages:['private history']}]}));
 db.prepare('INSERT INTO kv VALUES (?,?)').run('model-secret:test-id',JSON.stringify('NEVER-PRINT-SECRET'));db.close();
 const before=await evaluationHash(file),text=JSON.stringify(auditEvaluationModels(file));
 assert.doesNotMatch(text,/SECRET|secret-in-model|private history|private-url/);
 assert.match(text,/storedCredentialEntry/);assert.equal(await evaluationHash(file),before);
});
test('review binds evidence to actual artifact bytes and confined evidence paths',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-qe-review-')),artifact=path.join(dir,'PRD.md'),evidence=path.join(dir,'review.json');
 await fs.writeFile(artifact,'# Actual source-grounded PRD');await fs.writeFile(evidence,'{"review":"source checked"}');
 const hash=await evaluationHash(artifact),c=BUSINESS_BENCHMARK_CASES[0];
 const o:BenchmarkObservation={checkId:c.checks[0].id,status:'satisfied',kind:'business_review',artifactSha256:hash,evidencePath:evidence,observer:'human',note:'read actual files'};
 assert.equal((await recordBenchmarkReview(dir,c.id,[o],[{path:artifact,sha256:hash}])).verdict,'satisfied');
 await assert.rejects(recordBenchmarkReview(dir,c.id,[{...o,evidencePath:path.join(dir,'..','outside')}],[{path:artifact,sha256:hash}]),/OUTSIDE_ROOT/);
 await fs.writeFile(artifact,'changed');await assert.rejects(recordBenchmarkReview(dir,c.id,[o],[{path:artifact,sha256:hash}]),/ARTIFACT_CHANGED/);
 assert.equal(insideEvaluationRoot(dir,dir),false);assert.equal(insideEvaluationRoot(dir,path.join(dir,'..','escape')),false);
});
