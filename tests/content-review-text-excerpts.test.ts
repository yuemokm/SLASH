import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTextRanges,hasTextHeadings} from '../main/content-review-text-excerpts.js';
import {buildContentReviewInput,contentReviewTextHash} from '../main/content-review.js';

function selected(text:string,budget:number,terms:string[]){
 const result=selectTextRanges(text,budget,new Set(terms));
 assert(result.ranges.length<=8);
 assert(result.ranges.reduce((n,r)=>n+r.end-r.start,0)<=budget);
 for(const [index,r] of result.ranges.entries()){assert(r.start>=0&&r.end<=text.length&&r.end>r.start);if(index)assert(result.ranges[index-1].end<r.start);}
 return{...result,text:result.ranges.map(r=>text.slice(r.start,r.end)).join('\n<excerpt>\n')};
}

test('generic body retains nearest heading ancestry and next same-level boundary across blank paragraphs',()=>{
 const text='# DOCUMENT\n\n## OPERATIONS\n\n### ALPHA\n\nPlain preamble.\n\nTARGET FACT: '+('relevant detail '.repeat(5))+'\n\n### BETA\n\n'+('Unrelated body.\n\n'.repeat(80));
 const result=selected(text,240,['target fact']);
 for(const title of ['# DOCUMENT','## OPERATIONS','### ALPHA','### BETA'])assert(result.text.includes(title));
 assert(result.text.includes('TARGET FACT:'));assert(!result.text.includes('Unrelated body.\n\n'.repeat(80)));
 assert.deepEqual(result.ranges,selectTextRanges(text,240,new Set(['target fact'])).ranges);
});

test('boundary uses nearest section level; repeated titles and skipped levels do not attach an old branch',()=>{
 const text='# OLD\n\n## DUPLICATE\n\nold text\n\n# CURRENT\n\n#### DUPLICATE\n\nTARGET FACT\n\n##### DESCENDANT\n\nchild text\n\n## NEXT\n\n'+'x'.repeat(2000);
 const result=selected(text,90,['target fact']);
 assert(result.text.includes('# CURRENT'));assert(result.text.includes('#### DUPLICATE'));assert(result.text.includes('## NEXT'));assert(result.text.includes('TARGET FACT'));
 // Descendant is not the closing boundary; a sibling/ancestor closes the section.
 const target=result.ranges.find(r=>text.slice(r.start,r.end).includes('TARGET FACT'));assert(target);
 const beforeTarget=text.slice(target.start,text.indexOf('TARGET FACT'));
 assert(beforeTarget.includes('# CURRENT'));assert(beforeTarget.lastIndexOf('# CURRENT')>beforeTarget.lastIndexOf('# OLD'));
});

test('backtick/tilde fences, unclosed fences and indented hashes do not become headings',()=>{
 for(const fake of ['```md\n# FAKE\n```','~~~~\n## FAKE\n~~~\n# ALSO FAKE','    # INDENTED','\t# INDENTED','#No-space'])assert.equal(hasTextHeadings(fake),false);
 const text='# OWNER\n\n## CURRENT\n\n```md\n# FAKE\nTARGET FACT\n```\n\n## NEXT\n\n'+'unused'.repeat(500);
 const result=selected(text,110,['target fact']);assert(result.text.includes('# OWNER'));assert(result.text.includes('## CURRENT'));assert(result.text.includes('## NEXT'));assert(result.text.includes('TARGET FACT'));
 assert.equal(hasTextHeadings('```md\n# FAKE\n```\n\n## REAL'),true);
});

test('Setext heading and CRLF offsets remain original bytes; whole input bypasses selection',()=>{
 const text='PARENT\r\n======\r\n\r\nCHILD\r\n-----\r\n\r\nTARGET FACT\r\n\r\nNEXT\r\n----\r\n\r\n'+'irrelevant'.repeat(400);
 const result=selected(text,90,['target fact']);assert(result.text.includes('PARENT\r\n======'));assert(result.text.includes('CHILD\r\n-----'));assert(result.text.includes('NEXT\r\n----'));
 assert.deepEqual(selectTextRanges(text,text.length,new Set()),{ranges:[{start:0,end:text.length}],limitations:[]});
});

test('overlong heading cannot consume the highest relevant body; omissions have fixed limitation codes',()=>{
 const text='# '+('long-title'.repeat(300))+'\n\nTARGET FACT '+('body '.repeat(100))+'\n\n# NEXT\n\n'+'irrelevant'.repeat(200);
 const result=selected(text,80,['target fact']);assert(result.text.includes('TARGET FACT'));
 assert(result.ranges.some(r=>text.slice(r.start,r.end).startsWith('TARGET FACT')&&r.end-r.start>=40));
 assert(result.limitations.includes('HEADING_BACKGROUND_PARTIAL'));assert(result.limitations.includes('BODY_EXCERPT_LIMIT'));
});

test('many section candidates merge only exact blank gaps, stay within eight ranges and all tested budgets',()=>{
 const text='# ROOT\n\n'+Array.from({length:24},(_,i)=>`## Section ${i}\n\nTARGET_${i} ${'detail '.repeat(20)}\n\n${'irrelevant '.repeat(25)}\n\n`).join('');
 for(const budget of [1,13,80,170,380,1000]){
  const result=selected(text,budget,['target_2','target_8','target_19']);
  for(const r of result.ranges)assert.equal(text.slice(r.start,r.end).length,r.end-r.start);
  const anchor=text.indexOf('TARGET_2');assert(result.ranges.some(r=>r.start<=anchor&&r.end>anchor));
  if(budget>=80)assert(result.text.includes('TARGET_2'));
 }
});

test('a heading-only partial document still provides literal source text rather than an empty excerpt',()=>{
 const text=Array.from({length:30},(_,i)=>`## Heading ${i}\n\n`).join('');const result=selected(text,35,['heading 24']);assert(result.text.includes('Heading 24'));assert(result.limitations.includes('BODY_EXCERPT_LIMIT'));
});

test('heading limitations and source partial are present in the actual bounded model prompt after redistribution',()=>{
 const text='# '+('oversized '.repeat(5000))+'\n\nTARGET FACT requires confirmation.\n\n## NEXT\n\n'+'unrelated '.repeat(4000);
 const doc=(id:string,text:string)=>({id,text,sha256:contentReviewTextHash(text)});
 const input=buildContentReviewInput({requests:[{id:'r',text:'Review TARGET FACT.'}],artifacts:[doc('a','TARGET FACT is certain.')],sources:[doc('s',text)]},{promptCharacters:9000});
 assert(input.prompt.length<=9000);assert.equal(input.sourceContexts[0].coverage,'partial');assert(input.sourceContexts[0].excerpts.length<=8);
 assert(input.coverageLimits.some(v=>v.includes('HEADING_BACKGROUND_PARTIAL')));assert(input.prompt.includes('文本选段: ref:S1 HEADING_BACKGROUND_PARTIAL'));
 assert(input.sourceContexts[0].excerpts.some(e=>e.text.includes('TARGET FACT requires confirmation.')));
 for(const e of input.sourceContexts[0].excerpts)assert.equal(text.slice(e.start,e.end),e.text);
});
