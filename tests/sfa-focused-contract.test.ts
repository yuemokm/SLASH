import test from 'node:test';
import assert from 'node:assert/strict';
import {prototypeAcceptanceDefinitionSchema} from '../shared/prototype-acceptance.js';
// Standalone fixture contract deliberately independent of app implementation.
// @ts-expect-error fixture is a JavaScript module
import {assertCssOnly,styleRange,taskPrompt,focusedCases} from '../scripts/sfa-focused-contract.mjs';
test('synthetic HTML produces bounded UTF-16 CSS hints and a text-only incremental task',()=>{
 // No private SFA content or ignored output/.test-data dependency belongs in
 // repository tests. Exact real-source identity stays in prepare/preflight.
 const prefix='<html><head><script>/*'+'合成🙂'.repeat(30000)+'*/</script>',css='\n.btn{min-height:34px;color:blue}\n',html=prefix+'<style>'+css+'</style></head><body>synthetic</body></html>';
 const range=styleRange(html);assert.equal(range.start,prefix.length+'<style>'.length);assert.equal(range.end,range.start+css.length);assert.equal(html.slice(range.start,range.end),css);assert.equal(range.css,css);
 const prompt=taskPrompt({mountId:'synthetic-mount',path:'synthetic/index.html',html});
 for(const required of ['mountId=synthetic-mount','path=synthetic/index.html','offset='+range.start,'limit='+css.length,'read_draft','edit_draft','expectedContentHash','不整页write_draft','不apply','不发送图像','至少44 CSS px','320及390'])assert(prompt.includes(required),required);
 assert(!prompt.includes('合成🙂'));assert(!prompt.includes(css));
});
test('focused browser cases retain schema-valid explicit geometry and interaction checks',()=>{
 const parsed=prototypeAcceptanceDefinitionSchema.parse({mountId:'synthetic-mount',path:'synthetic/index.html',title:'focused',cases:focusedCases,sourceRefs:[]});
 assert.equal(parsed.cases.length,7);assert.equal(parsed.cases.reduce((n,c)=>n+c.steps.length,0),46);
 const steps=parsed.cases.flatMap(c=>c.steps),geometry=steps.filter(s=>s.action==='assert'&&s.assertion==='min-target-size');assert.equal(geometry.length,24);
 assert(geometry.every(s=>s.action==='assert'&&s.assertion==='min-target-size'&&s.minPixels===44));
 assert(parsed.cases.every(c=>c.steps.some(s=>s.action==='assert'&&s.assertion==='no-horizontal-overflow')));
 assert(steps.some(s=>s.action==='click'));assert(steps.some(s=>s.action==='fill'));assert(parsed.cases.some(c=>c.viewport?.width===320));assert(parsed.cases.some(c=>c.viewport?.width===390));
});
test('non-CSS source changes and new online dependencies cannot pass scope guard',()=>{
 const html='<html><style>.btn{height:34px}</style><body>3/5</body><script>mock()</script></html>',after=html.replace('34px','44px');assertCssOnly(html,after);
 for(const bad of [after.replace('3/5','4/5'),after.replace('mock()','real()'),html,after.replace('44px','44px;background:url(https://bad)'),after.replace('44px','44px}@import "https://bad"; .extra{height:44px')])assert.throws(()=>assertCssOnly(html,bad));
});
