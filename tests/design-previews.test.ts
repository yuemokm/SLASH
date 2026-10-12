import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {designCatalog,designSourceUrl} from '../main/design-systems.js';
import {designPreviewSchema,designSourceOpenRequestSchema} from '../shared/design-systems.js';

const digest=(value:Buffer)=>createHash('sha256').update(value).digest('hex');

test('185预览图逐项绑定固定来源，静态图片实际哈希匹配',async()=>{
 const previews=JSON.parse(await fs.readFile('main/data/open-design-previews.json','utf8')),view=designCatalog();
 assert.equal(previews.commit,view.source.commit);
 for(const item of view.items){
  assert.ok(item.sourceUrl!.endsWith(`/tree/${previews.commit}/${item.sourcePath}`));
  if(!item.preview){assert.ok(previews.failures.some((failure:{id:string})=>failure.id===item.id));continue;}
  assert.equal(designPreviewSchema.safeParse(item.preview).success,true);
  const image=await fs.readFile(path.join('public',item.preview.src));assert.equal(digest(image),item.preview.imageHash);assert.equal(image[0],255);assert.equal(image[1],216);
  if(item.kind==='style'){assert.equal(item.preview.kind,'source-components');assert.ok(item.preview.sourceUrl.endsWith(`${item.sourcePath}/components.html`));assert.ok(item.preview.sourceUrl.includes(`/blob/${previews.commit}/`));}
  else assert.match(item.preview.sourceUrl,new RegExp(`/example-${item.id.split(':')[1]}/[a-f0-9]{16}/poster.jpg$`));
 }
 assert.equal(view.items.filter(item=>item.kind==='style'&&item.preview).length,152);
 assert.equal(view.items.filter(item=>item.preview?.kind==='official-poster').length,33);
 assert.deepEqual(view.items.filter(item=>!item.preview).map(item=>item.id),['template:aster-atelier','template:contact-widget','template:live-artifact']);
});

test('来源入口按可信注册ID解析，拒绝任意URL/路径/未知身份',()=>{
 const item=designCatalog().items.find(item=>item.id==='style:airbnb')!;
 assert.equal(designSourceUrl(item.id,'image'),item.preview!.sourceUrl);assert.equal(designSourceUrl(item.id),item.sourceUrl);
 assert.throws(()=>designSourceUrl('style:missing'),/DESIGN_REFERENCE_NOT_FOUND/);
 for(const src of ['../../secret','https://attacker/image.jpg','design-previews/open-design/../../secret'])assert.equal(designPreviewSchema.safeParse({...item.preview,src}).success,false);
 for(const sourceUrl of ['https://github.com@attacker/image.jpg','javascript:alert(1)','file:///C:/secret'])assert.equal(designPreviewSchema.safeParse({...item.preview,sourceUrl}).success,false);
 assert.equal(designSourceOpenRequestSchema.safeParse({type:'designSourceOpen',id:item.id,target:'image',url:'https://attacker'}).success,false);
 assert.equal(designSourceOpenRequestSchema.safeParse({type:'designSourceOpen',id:item.id,target:'image'}).success,true);
 const first=designCatalog();first.items[0].preview!.src='attacker';assert.notEqual(designCatalog().items[0].preview!.src,'attacker');
});
