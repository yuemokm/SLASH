import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {contentReviewTextHash as hash} from '../main/content-review.js';
import {buildContentReviewInput as candidate,reviewContent} from '../main/content-review.js';
import {selectHtmlRanges,htmlRequestTerms} from '../main/content-review-html-excerpts.js';
import {REVIEW_PROTOCOL_PROMPT} from '../main/content-review-protocol.js';
const doc=(id:string,text:string,path='index.html')=>({id,text,path,sha256:hash(text)});
const joined=(text:string,ranges:{start:number;end:number}[])=>ranges.map(r=>text.slice(r.start,r.end)).join('\n');
function valid(input:ReturnType<typeof candidate>){
 const all=[...input.requestContexts,...input.artifactContexts,...input.sourceContexts],count=all.length;
 const body=Math.floor((input.promptCharacterLimit-2500-REVIEW_PROTOCOL_PROMPT.length-count*400-JSON.stringify(input.snapshot.assumptions).length)/2);
 assert(all.reduce((n,c)=>n+c.includedCharacters,0)<=body);assert(input.prompt.length<=input.promptCharacterLimit);
 for(const c of all){const d=[...input.snapshot.requests,...input.snapshot.artifacts,...input.snapshot.sources].find(d=>d.id===c.id&&hash(d.text)===c.sha256)!;let end=0;assert(c.excerpts.length<=8);for(const e of c.excerpts){assert(e.start>=end);assert.equal(e.text,d.text.slice(e.start,e.end));assert.equal(e.startLine,d.text.slice(0,e.start).split('\n').length);assert.equal(e.endLine,d.text.slice(0,e.end).split('\n').length);end=e.end;}assert.equal(c.includedCharacters,c.excerpts.reduce((n,e)=>n+e.text.length,0));if(c.coverage==='full')assert.equal(c.includedCharacters,d.text.length);}
 const {inputHash,prompt,promptHash,...material}=input;assert.equal(inputHash,hash(JSON.stringify(material)));assert.equal(promptHash,hash(prompt));
}
test('synthetic style-heavy HTML preserves short PRD/request/source and adds actual DOM/events within the old budget',async()=>{
 const a=JSON.parse(await fs.readFile(new URL('./fixtures/content-review-html-style-old-input.json',import.meta.url),'utf8')),b=candidate(a.snapshot,{promptCharacters:a.promptCharacterLimit});valid(b);assert.deepEqual(a.snapshot,b.snapshot);assert.deepEqual(a.requestContexts,b.requestContexts);assert.deepEqual(a.artifactContexts.slice(1),b.artifactContexts.slice(1));assert.deepEqual(a.sourceContexts,b.sourceContexts);assert.equal(b.artifactContexts[1].coverage,'full');assert.equal(b.artifactContexts[0].includedCharacters,a.artifactContexts[0].includedCharacters);assert.equal(b.artifactContexts[0].coverage,'partial');assert.notEqual(a.inputHash,b.inputHash);
 const selected=b.artifactContexts[0].excerpts.map(e=>e.text).join('\n');assert(!a.artifactContexts[0].excerpts.some(e=>e.text.includes('addEventListener')));for(const marker of ['id="counter"','maxlength="12"','addEventListener','function update'])assert(selected.includes(marker));const script=/<script\b[^>]*>[\s\S]*?<\/script\s*>/.exec(b.snapshot.artifacts[0].text)![0];assert(selected.includes(script));
});
test('non-HTML selection remains byte-for-byte identical to a frozen small synthetic current allocator input',async()=>{const frozen=JSON.parse(await fs.readFile(new URL('./fixtures/content-review-non-html-selection-old-input.json',import.meta.url),'utf8'));assert.deepEqual(candidate(frozen.snapshot,{promptCharacters:frozen.promptCharacterLimit}),frozen);});
test('bounded ranges and budgets for CSS-heavy multiline and minified tail event scripts',()=>{
 const texts=[`<style>${'.x{color:red}'.repeat(1800)}</style><input id="name" maxlength="50"><script>name.addEventListener('input',()=>{});</script>`,`<style>${'.x{color:red}'.repeat(1800)}</style><input id="name"><script>${'var x=0;'.repeat(3000)}name.addEventListener('input',()=>{x++;});</script>`];
 for(const text of texts)for(const budget of [300,800,4216]){const {ranges}=selectHtmlRanges(text,budget,htmlRequestTerms('名称输入提示'));assert(ranges.length<=8);assert(ranges.reduce((n,r)=>n+r.end-r.start,0)<=budget);assert(joined(text,ranges).includes('addEventListener'));}
});
test('comments do not create script/DOM anchor regions; supplied text stays original',()=>{
 const real='<input id="actual" maxlength="50"><script>actual.addEventListener("input",()=>{});</script>',text=`<!-- ${'<input id="fake">'.repeat(200)} <script>fake()</script> -->`+real;
 const result=selectHtmlRanges(text,800,htmlRequestTerms('名称输入限制'));assert(joined(text,result.ranges).includes('id="actual"'));assert(joined(text,result.ranges).includes('actual.addEventListener'));assert(!result.limitations.length);
});
test('malformed and external-script limitations reach frozen input, prompt and receipt; no execution claims',async()=>{
 for(const text of ['<input id="name"><script src="https://invalid.example/test.js"></script>'+'.'.repeat(6000),'<input id="name"><script>'+"name.addEventListener('input',()=>{});".repeat(100),'<input id="name"><style>'+'.x{color:red}'.repeat(300)]){const input=candidate({requests:[{id:'r',text:'名称输入限制'}],artifacts:[doc('a',text)],sources:[]},{promptCharacters:12000});valid(input);assert.equal(input.artifactContexts[0].coverage,'partial');assert(input.coverageLimits.some(s=>s.startsWith('HTML选段: ')));assert(input.prompt.includes('HTML选段: '));const receipt=await reviewContent({input,reviewer:{provider:'offline',modelId:'none',protocol:'callback'},review:async()=>({raw:'{}',stopReason:'stop'})});assert(receipt.coverageLimits.some(s=>s.startsWith('HTML选段: ')));}
});
test('more than 100 regions has bounded explicit unknown fallback',()=>{
 const result=selectHtmlRanges('<script>x()</script>'.repeat(101),500,new Set());assert(result.limitations.includes('STRUCTURE_REGION_LIMIT'));assert.equal(result.ranges.length,1);assert.equal(result.ranges[0].end,500);
});
test('short full HTML still reports external/malformed static limitations using canonical refs',()=>{
 for(const text of ['<input id="name"><script src="https://invalid.example/test.js"></script>','<input id="name"><script>name()']){const input=candidate({requests:[{id:'same',text:'名称输入'}],artifacts:[doc('same',text)],sources:[doc('same','资料句。','source.md')]});valid(input);assert.equal(input.artifactContexts[0].coverage,'full');assert(input.coverageLimits.some(s=>s.startsWith('HTML选段: ref:A1 ')));assert(!input.coverageLimits.some(s=>s.startsWith('HTML选段: same ')));}
});
test('UTF16 CRLF astral symbols and nested-looking regions remain nonoverlapping exact original slices',()=>{
 const text='<html>😀\r\n<style>.x:before{content:"<script>"}</style>\r\n<input id="name" aria-label="名称😀">\r\n<script>'+"name.addEventListener('input',()=>{});\r\n".repeat(200)+'</script></html>';
 const input=candidate({requests:[{id:'r',text:'名称输入'}],artifacts:[doc('a',text)],sources:[]},{promptCharacters:12000});valid(input);assert.equal(input.artifactContexts[0].coverage,'partial');
});
test('old frozen input remains usable; new excerpts allow exact quote binding but fabricated quotes rejected',async()=>{
 const old=JSON.parse(await fs.readFile(new URL('./fixtures/content-review-short-old-input.json',import.meta.url),'utf8'));
 const empty={findings:[],coverage:{artifactRefs:['A1'],sourceRefs:['S1'],requestRefs:['R1'],directions:['fact_inference','scope_expansion','contradiction','cross_artifact_consistency','field_semantics','request_coverage'],limitations:[]}};
 const reviewer={provider:'offline',modelId:'none',protocol:'callback'};const checked=await reviewContent({input:old,reviewer,review:async()=>({raw:empty,stopReason:'stop'})});assert.equal(checked.versionState,'current');const prior=candidate({...old.snapshot,coverageLimits:['HTML选段: 历史调用方已有的限制']},{promptCharacters:old.promptCharacterLimit});const retained=await reviewContent({input:prior,reviewer,review:async()=>({raw:empty,stopReason:'stop'})});assert.equal(retained.versionState,'current');
 const text=`<style>${'.x{color:red}'.repeat(2000)}</style><input id="name"><script>name.addEventListener('input',()=>{});</script>`,s={requests:[{id:'r',text:'名称输入限制'}],artifacts:[doc('a',text)],sources:[doc('s','来源明确要求核验名称输入。','source.md')]},input=candidate(s,{promptCharacters:14000});valid(input);
 const finding=(quote:string)=>({...empty,findings:[{category:'request_coverage',severity:'advisory',confidence:'medium',explanation:'只验证原文绑定，不是业务验收。',artifacts:[{artifactRef:'A1',quote}],sources:[{sourceRef:'S1',quote:'来源明确要求核验名称输入。'}],requests:[]}]});
 const bound=await reviewContent({input,reviewer,review:async()=>({raw:finding("name.addEventListener('input',()=>{});"),stopReason:'stop'})});assert.equal(bound.findings.length,1);assert.equal(bound.findings[0].artifactBindings[0].quote,"name.addEventListener('input',()=>{});");
 const rejected=await reviewContent({input,reviewer,review:async()=>({raw:finding('伪造不存在的事件实现'),stopReason:'stop'})});assert.equal(rejected.findings.length,0);assert.equal(rejected.invalidFindings.length,1);
});
