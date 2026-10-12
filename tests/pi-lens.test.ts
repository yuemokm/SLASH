import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {analyzePiLensDraft,createPiLensTools} from '../main/pi-lens.js';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
test('pi-lens fixed published worker analyzes a disposable draft and leaves input unchanged',async()=>{
 const content='function compute(value) {\n  return eval(value);\n}\n';const draft={changeId:'draft-1',path:'prototype.js',content,contentHash:hash(content)};
 const receipt=await analyzePiLensDraft(draft);
 assert.equal(receipt.package,'pi-lens');assert.equal(receipt.version,'4.4.0');assert.equal(receipt.originalUntouched,true);assert.equal(draft.content,content);assert.equal(receipt.target.contentHash,hash(content));assert.ok(receipt.report);assert.ok(Array.isArray(receipt.report.diagnostics));
 assert.ok(receipt.report.diagnostics.some((item:any)=>item.rule==='no-global-eval-js'&&item.severity==='error'&&item.line===2));assert.ok(receipt.report.counts.blockers>0);
 const safe='function compute(value) {\n  return value + 1;\n}\n';const clean=await analyzePiLensDraft({changeId:'clean',path:'safe.js',content:safe,contentHash:hash(safe)});assert.equal(clean.report.counts.blockers,0);assert.ok(!clean.report.diagnostics.some((item:any)=>item.rule==='no-global-eval-js'));
 const html='<!doctype html><html><body><script>eval("document.title")</script></body></html>';const inline=await analyzePiLensDraft({changeId:'html',path:'index.html',content:html,contentHash:hash(html)});assert.ok(inline.report.diagnostics.some((item:any)=>item.rule==='no-global-eval-js'&&item.severity==='error'));
});
test('pi-lens rejects changed/unsupported draft and binds tool to the exact pending content',async()=>{
 await assert.rejects(analyzePiLensDraft({changeId:'a',path:'a.js',content:'abc',contentHash:hash('changed')}),/DRAFT_CHANGED/);
 await assert.rejects(analyzePiLensDraft({changeId:'a',path:'source.docx',content:'abc',contentHash:hash('abc')}),/UNSUPPORTED/);
 const tool=createPiLensTools({getDraft:async()=>({changeId:'other',path:'a.js',content:'abc',contentHash:hash('abc')})})[0];await assert.rejects(tool.execute('call',{changeId:'requested',expectedContentHash:hash('abc')},undefined,undefined,{} as never),/DRAFT_CHANGED/);
});
