// Read actual DOM through the application's existing sandboxed preview. This
// module never launches Electron, serves HTML, or modifies a model artifact.
import {createHash} from 'node:crypto';

export const hashBytes=bytes=>createHash('sha256').update(bytes).digest('hex');

function inventoryDom(requestedSelectors=[]){
 const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';};
 const text=el=>String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim().slice(0,180);
 const selector=el=>{
  for(const attr of ['id','data-testid','name']){const value=el.getAttribute(attr);if(!value)continue;const css=attr==='id'?'#'+CSS.escape(value):el.tagName.toLowerCase()+'['+attr+'="'+CSS.escape(value)+'"]';if(css.length<=200&&document.querySelectorAll(css).length===1)return css;}
  const parts=[];for(let node=el;node&&node.nodeType===1;node=node.parentElement){const tag=node.tagName.toLowerCase(),siblings=node.parentElement?[...node.parentElement.children].filter(n=>n.tagName===node.tagName):[node];parts.unshift(tag+(siblings.length>1?':nth-of-type('+(siblings.indexOf(node)+1)+')':''));const css=parts.join(' > ');if(css.length>200)return undefined;if(document.querySelectorAll(css).length===1)return css;}return undefined;
 };
 const controls=[...document.querySelectorAll('input,textarea,select,button,[role="button"],output')].slice(0,150).map(el=>{
  const label=[...(el.labels||[])].map(text).join(' ')||el.getAttribute('aria-label')||el.getAttribute('placeholder')||(['BUTTON','OUTPUT'].includes(el.tagName)?text(el):'');
  const value='value'in el?String(el.value):text(el),rect=el.getBoundingClientRect();
  return{selector:selector(el),tag:el.tagName.toLowerCase(),type:el.type||el.getAttribute('role')||'',label:label.slice(0,180),visible:visible(el),disabled:Boolean(el.disabled),readonly:'readOnly'in el?Boolean(el.readOnly):undefined,contentEditable:Boolean(el.isContentEditable),checked:'checked'in el?Boolean(el.checked):undefined,maxLength:'maxLength'in el&&el.maxLength>=0?el.maxLength:undefined,valueCharacters:value.length,valueFormat:/^JHWD\d{10}$/.test(value)?'JHWD_10_digits':value.includes('JHWD')?'JHWD_other':'other',options:el.tagName==='SELECT'?[...el.options].slice(0,30).map(o=>({value:o.value,label:text(o),disabled:o.disabled})):undefined,dimensions:{width:rect.width,height:rect.height}};
 });
 const messages=[...document.querySelectorAll('[role="alert"],[role="status"],label,small,[id],[class]')].filter(el=>visible(el)&&el.children.length<=1&&text(el)&&/(系统|模拟|演示|50|重复|失败|成功|提交|名称|编码|JHWD)/.test(text(el))).slice(0,100).map(el=>({selector:selector(el),text:text(el),valueFormat:/JHWD\d{10}(?!\d)/.test(text(el))?'JHWD_10_digits':text(el).includes('JHWD')?'JHWD_other':'other'}));
 const unique=regex=>{const found=controls.filter(c=>c.visible&&c.selector&&regex.test(c.label));return found.length===1?found[0].selector:undefined;};
 const selectorObservations=requestedSelectors.slice(0,30).map(selected=>{try{const nodes=document.querySelectorAll(selected);if(nodes.length!==1)return{selector:selected,count:nodes.length};const el=nodes[0],value='value'in el?String(el.value):text(el);return{selector:selected,count:1,tag:el.tagName.toLowerCase(),visible:visible(el),readonly:'readOnly'in el?Boolean(el.readOnly):undefined,contentEditable:Boolean(el.isContentEditable),disabled:Boolean(el.disabled),maxLength:'maxLength'in el?el.maxLength:undefined,valueFormat:/^JHWD\d{10}$/.test(value)?'JHWD_10_digits':value.includes('JHWD')?'JHWD_other':'other'};}catch{return{selector:selected,count:0,invalid:true};}});
 return{url:location.pathname,viewport:{width:innerWidth,height:innerHeight},pageOverflow:{scrollWidth:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0),availableWidth:document.documentElement.clientWidth},controls,messages,selectorObservations,candidates:{code:unique(/(网点|门店|机会门店)编码/),name:unique(/(网点|门店|机会门店)名称/),submit:unique(/^(提交|保存|新建)(门店|资料|信息)?$/)},notice:'Candidates identify real DOM only. They do not establish business expectations or successful interactions.'};
}

export async function inspectQualityPrototype({page,call,target,artifactHash,entrySteps=[],viewport={width:1440,height:900},selectors=[]}){
 const preview=await call({type:'preview',...target}),url=new URL(preview.url);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw Error('QUALITY_PROTOTYPE_PREVIEW_ORIGIN_INVALID');
 const frameId='quality-prototype-inspection-'+Date.now(),previewPrefix=url.pathname.slice(0,url.pathname.lastIndexOf('/')+1);let blockedRequests=0;
 const route=async handler=>{const request=handler.request();if(request.frame().name()!==frameId)return handler.fallback();const requested=new URL(request.url());if(requested.origin===url.origin&&requested.pathname.startsWith(previewPrefix))return handler.continue();blockedRequests++;return handler.abort('blockedbyclient');};await page.route('**/*',route);
 await page.evaluate(({frameId,url,viewport})=>{const frame=document.createElement('iframe');frame.id=frameId;frame.name=frameId;frame.title='质量验收的隔离DOM检查';frame.setAttribute('sandbox','allow-scripts allow-forms');Object.assign(frame.style,{position:'fixed',left:'0',top:'0',width:viewport.width+'px',height:viewport.height+'px',border:'0',zIndex:'2147483647'});frame.src=url;document.body.append(frame);},{frameId,url:preview.url,viewport});
 try{
  const element=await page.locator('#'+frameId).elementHandle(),frame=await element.contentFrame();if(!frame)throw Error('QUALITY_PROTOTYPE_PREVIEW_FRAME_MISSING');await frame.waitForURL(current=>current.origin===url.origin&&current.pathname===url.pathname,{waitUntil:'domcontentloaded',timeout:15000});
  for(const step of entrySteps){const el=frame.locator(step.selector);if(await el.count()!==1)throw Error('QUALITY_PROTOTYPE_ENTRY_AMBIGUOUS');if(step.action==='click')await el.click();else if(step.action==='fill')await el.fill(step.value);else if(step.action==='select')await el.selectOption(step.value);else if(step.action==='press')await el.press(step.key==='Space'?' ':step.key);else throw Error('QUALITY_PROTOTYPE_ENTRY_ACTION_INVALID');}
  const inventory=await frame.evaluate(inventoryDom,selectors);return{schemaVersion:1,artifactHash,target,entrySteps,inspectedAt:new Date().toISOString(),blockedRequests,...inventory};
 }finally{await page.locator('#'+frameId).evaluate(el=>el.remove()).catch(()=>{});await page.unroute('**/*',route);}
}
