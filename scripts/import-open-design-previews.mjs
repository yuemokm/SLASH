// Maintainer-only resource import. App runtime never executes source HTML.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const commit='0bd8251c9b5c0bed4b3aef87f53f9c1eadc493c7';
const root=path.resolve(process.argv.slice(2).find(value=>!value.startsWith('--'))||'.test-data/open-design-source-20261012');
if(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==commit)throw Error('Source commit mismatch');
const digest=value=>createHash('sha256').update(value).digest('hex');
const catalog=JSON.parse(await fs.readFile('main/data/open-design-catalog.json','utf8'));
const sample=process.argv.includes('--sample');
const output=sample?'.test-data/design-preview-samples':`public/design-previews/open-design/${commit}`;
await fs.mkdir(output,{recursive:true});
const entries={},failures=[];
const sourceUrl=relative=>`https://github.com/nexu-io/open-design/blob/${commit}/${relative}`;
const browser=await chromium.launch({headless:true,channel:process.env.SLASH_PREVIEW_BROWSER_CHANNEL||'chrome'});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,javaScriptEnabled:false,serviceWorkers:'block'});
 await context.route('**/*',route=>route.abort());
 const page=await context.newPage();
 for(const item of catalog.items.filter(item=>item.kind==='style'&&(!sample||['style:airbnb','style:stripe','style:brutalism'].includes(item.id)))){
  const relative=`${item.sourcePath}/components.html`;
  try{
   const html=await fs.readFile(path.join(root,relative),'utf8');
   // External CSS could materially change the appearance; never publish a
   // partly styled preview. External fonts use the source's local fallback.
   if(/<link\b[^>]*rel\s*=\s*["']stylesheet["']|@import\s/i.test(html))throw Error('external stylesheet requires review');
   await page.setContent(html,{waitUntil:'load'});
   const visibleText=await page.locator('body').innerText();
   if(visibleText.trim().length<100)throw Error('source page has insufficient visible content');
   const filename=`style-${item.id.split(':')[1]}.jpg`;
   const bytes=await page.screenshot({type:'jpeg',quality:82,animations:'disabled'});
   await fs.writeFile(path.join(output,filename),bytes);
   entries[item.id]={src:`design-previews/open-design/${commit}/${filename}`,kind:'source-components',sourceUrl:sourceUrl(relative),sourceHash:digest(html),imageHash:digest(bytes)};
   console.log(`PASS ${item.id} ${bytes.length} bytes`);
  }catch(error){failures.push({id:item.id,error:String(error)});console.log(`MISSING ${item.id} ${error}`);}
 }
 await context.close();
}finally{await browser.close();}
if(!sample){
 const manifestBytes=execFileSync('git',['-C',root,'show',`${commit}:data/plugin-previews/manifest.json`]);
 const manifest=JSON.parse(manifestBytes.toString('utf8'));
 const templates=catalog.items.filter(item=>item.kind==='template');
 for(let offset=0;offset<templates.length;offset+=4){
  await Promise.all(templates.slice(offset,offset+4).map(async item=>{
   const poster=manifest.previews[`example-${item.id.split(':')[1]}`]?.poster;
   if(!poster){failures.push({id:item.id,error:'No matching official poster in pinned manifest'});return;}
   const url=`https://repo-assets.open-design.ai/plugin-previews/${poster}`;
   try{
    const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
    if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error(`Invalid poster response ${response.status}`);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>5000000||bytes.length<1000||bytes[0]!==255||bytes[1]!==216)throw Error('Invalid JPEG poster');
    const filename=`template-${item.id.split(':')[1]}.jpg`;await fs.writeFile(path.join(output,filename),bytes);
    entries[item.id]={src:`design-previews/open-design/${commit}/${filename}`,kind:'official-poster',sourceUrl:url,sourceHash:digest(manifestBytes),imageHash:digest(bytes)};
    console.log(`PASS ${item.id} ${bytes.length} bytes`);
   }catch(error){failures.push({id:item.id,error:String(error)});console.log(`MISSING ${item.id} ${error}`);}
  }));
 }
 await fs.writeFile('main/data/open-design-previews.json',JSON.stringify({schemaVersion:1,commit,retrievedAt:new Date().toISOString(),entries,failures},null,2)+'\n');
}
await fs.writeFile(path.join(output,'import-result.json'),JSON.stringify({commit,sample,count:Object.keys(entries).length,entries,failures},null,2)+'\n');
console.log(JSON.stringify({sample,count:Object.keys(entries).length,failures}));
