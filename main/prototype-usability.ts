import type {PrototypeAcceptanceCase,PrototypeUsabilityIssue,PrototypeUsabilityObservation} from '../shared/prototype-acceptance.js';

/** This function is serialized into the runner's isolated world. Keep it self-contained.
 * No values, labels, attributes or page-authored selector strings leave the page. */
export function inspectPrototypeControlUsability(selector='body'):{ok:boolean;value?:boolean;reason?:string;usability?:PrototypeUsabilityObservation}{
 const viewport={width:window.innerWidth,height:window.innerHeight};
 const observation:PrototypeUsabilityObservation={checked:0,skipped:0,candidateCount:0,complete:true,issues:[],scope:'visible-enabled-native-fields-and-text-submit-buttons',coverage:'geometry-font-css-clipping-and-in-viewport-full-occlusion-only'};
 let roots:NodeListOf<Element>;
 try{roots=document.querySelectorAll(selector);}catch{return{ok:false,reason:'PROTOTYPE_SELECTOR_INVALID'};}
 if(roots.length!==1)return{ok:false,reason:'PROTOTYPE_SELECTOR_NOT_UNIQUE'};
 const root=roots[0],query='input,select,textarea,button',candidates:Element[]=[];
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT);let node:Node|null=root,nodeCount=0;
 while(node&&nodeCount<2000){
  nodeCount++;if((node as Element).matches(query))candidates.push(node as Element);
  if(candidates.length>80){observation.complete=false;break;}
  node=walker.nextNode();
 }
 if(node)observation.complete=false;
 observation.candidateCount=candidates.length;
 if(candidates.length>80)observation.complete=false;
 const cssSelector=(element:Element)=>{
  const parts:string[]=[];let current:Element|null=element;
  for(let depth=0;current&&depth<32;depth++,current=current.parentElement){
   let position=1,sibling=current.previousElementSibling;for(;sibling&&position<=2000;sibling=sibling.previousElementSibling)position++;
   if(sibling)observation.complete=false;
   // nth-child uses only positions, so IDs and names cannot expose field contents.
   parts.unshift(':nth-child('+position+')');if(current===document.documentElement)return 'html'+(parts.length>1?' > '+parts.slice(1).join(' > '):'');
  }
  observation.complete=false;return parts.join(' > ');
 };
 const add=(element:Element,code:PrototypeUsabilityIssue['code'],measurements:PrototypeUsabilityIssue['measurements'])=>{
  if(observation.issues.length>=20){observation.complete=false;return;}
  observation.issues.push({selector:cssSelector(element),viewport,code,measurements});
 };
 for(const element of candidates.slice(0,80)){
  const el=element as HTMLElement,style=getComputedStyle(el),box=el.getBoundingClientRect();
  const input=el instanceof HTMLInputElement;
  const isTextSubmit=el instanceof HTMLButtonElement&&el.type==='submit'&&!!el.form&&!!el.textContent?.trim()||input&&el.type==='submit'&&!!el.form&&!!el.value.trim();
  const field=el instanceof HTMLSelectElement||el instanceof HTMLTextAreaElement||input&&['text','search','email','tel','url','password','number','date','datetime-local','month','week','time'].includes(el.type);
  if((!field&&!isTextSubmit)||el.matches(':disabled')||el.getAttribute('aria-disabled')==='true'||el.closest('[inert]')||box.width<=0||box.height<=0||!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})){
   observation.skipped++;continue;
  }
  observation.checked++;
  const dimensions={width:Math.round(box.width*100)/100,height:Math.round(box.height*100)/100};
  const fontSize=parseFloat(style.fontSize);
  if(fontSize<12)add(el,'CONTROL_FONT_TOO_SMALL',{...dimensions,fontSize,minPixels:12});
  // Narrow-screen text submit targets use 44px; fields use a modest 32px guardrail.
  // Desktop guardrail is 24px. Icons, links, checkboxes/radios and disabled items are excluded.
  const minPixels=viewport.width<=480?(isTextSubmit?44:32):24;
  if(box.width<minPixels-1||box.height<minPixels-1)add(el,'CONTROL_TARGET_TOO_SMALL',{...dimensions,minPixels});
  let left=box.left,right=box.right,top=box.top,bottom=box.bottom,hitLeft=box.left,hitRight=box.right,hitTop=box.top,hitBottom=box.bottom,parent=el.parentElement,depth=0;
  for(;parent&&depth<32;parent=parent.parentElement,depth++){
   const ancestorStyle=getComputedStyle(parent),ancestor=parent.getBoundingClientRect();
   // Root viewport scrolling and the normal below-fold position are not CSS clipping.
   if(parent===document.body||parent===document.documentElement)continue;
   // A scroll container can reveal its remaining controls, so its initial
   // below-fold position is not a permanently clipped-control defect.
   if(['hidden','clip'].includes(ancestorStyle.overflowX)){left=Math.max(left,ancestor.left+parent.clientLeft);right=Math.min(right,ancestor.left+parent.clientLeft+parent.clientWidth);}
   if(['hidden','clip'].includes(ancestorStyle.overflowY)){top=Math.max(top,ancestor.top+parent.clientTop);bottom=Math.min(bottom,ancestor.top+parent.clientTop+parent.clientHeight);}
   // Hit-testing must stay in the currently exposed portion of scroll containers.
   if(['hidden','clip','auto','scroll'].includes(ancestorStyle.overflowX)){hitLeft=Math.max(hitLeft,ancestor.left+parent.clientLeft);hitRight=Math.min(hitRight,ancestor.left+parent.clientLeft+parent.clientWidth);}
   if(['hidden','clip','auto','scroll'].includes(ancestorStyle.overflowY)){hitTop=Math.max(hitTop,ancestor.top+parent.clientTop);hitBottom=Math.min(hitBottom,ancestor.top+parent.clientTop+parent.clientHeight);}
  }
  if(parent)observation.complete=false;
  const visibleWidth=Math.max(0,right-left),visibleHeight=Math.max(0,bottom-top);
  if(visibleWidth<box.width-1||visibleHeight<box.height-1)add(el,'CONTROL_CLIPPED',{...dimensions,visibleWidth,visibleHeight});
  // Native input values are allowed to scroll. Only fixed text of HTML submit buttons
  // is checked for clipped glyphs; normal multiline wrapping is accepted.
  if(el instanceof HTMLButtonElement&&isTextSubmit){
   const range=document.createRange(),textWalker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
   const textBoxes:DOMRect[]=[];let textNode=textWalker.nextNode(),textCount=0;
   for(;textNode&&textCount<100;textNode=textWalker.nextNode(),textCount++){
    range.selectNodeContents(textNode);const boxes=range.getClientRects();
    if(boxes.length+textBoxes.length>100)observation.complete=false;
    for(let index=0;index<boxes.length&&textBoxes.length<100;index++)textBoxes.push(boxes[index]);
   }
   if(textNode)observation.complete=false;
   const clipsX=['hidden','clip','auto','scroll'].includes(style.overflowX),clipsY=['hidden','clip','auto','scroll'].includes(style.overflowY);
   const textClipped=textBoxes.slice(0,100).some(text=>text.width>0&&text.height>0&&((clipsX&&(text.left<box.left-1||text.right>box.right+1))||(clipsY&&(text.top<box.top-1||text.bottom>box.bottom+1))));
   if(textClipped)add(el,'BUTTON_TEXT_CLIPPED',{...dimensions,scrollWidth:el.scrollWidth,availableWidth:el.clientWidth});
  }
  // Complete occlusion only: partial overlays, visual hierarchy and contrast need review.
  const viewLeft=Math.max(0,hitLeft),viewRight=Math.min(viewport.width,hitRight),viewTop=Math.max(0,hitTop),viewBottom=Math.min(viewport.height,hitBottom);
  if(style.pointerEvents!=='none'&&viewRight-viewLeft>2&&viewBottom-viewTop>2){
   const insetX=Math.min(4,(viewRight-viewLeft)/4),insetY=Math.min(4,(viewBottom-viewTop)/4);
   const points=[[(viewLeft+viewRight)/2,(viewTop+viewBottom)/2],[viewLeft+insetX,viewTop+insetY],[viewRight-insetX,viewTop+insetY],[viewLeft+insetX,viewBottom-insetY],[viewRight-insetX,viewBottom-insetY]];
   const hitSamples=points.filter(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit===el||!!hit&&el.contains(hit);}).length;
   if(hitSamples===0)add(el,'CONTROL_FULLY_OBSCURED',{...dimensions,hitSamples,visibleSamples:points.length});
  }
 }
 if(!observation.complete||observation.checked===0)return{ok:false,reason:!observation.complete?'PROTOTYPE_USABILITY_LIMIT':'PROTOTYPE_USABILITY_NOT_APPLICABLE',usability:observation};
 return{ok:true,value:observation.issues.length===0,usability:observation};
}

/** Caller must determine mobile applicability from explicit task intent or viewport support.
 * These host-authored cases retain the same snapshot/version guards as ordinary cases. */
export function buildPrototypeUsabilityBaselineCases(options:{mobile:boolean}):PrototypeAcceptanceCase[]{
 const viewports=[{width:1440,height:900},...(options.mobile?[{width:390,height:844}]:[])];
 return viewports.map(viewport=>({id:'host:control-usability:'+viewport.width,title:'宿主有限控件可用性 '+viewport.width+'×'+viewport.height,viewport,expectedDescription:'当前渲染且启用的原生表单控件/文字提交按钮：字号≥12px；桌面尺寸≥24px，移动字段≥32px、文字提交按钮≥44px，尺寸允许1 CSS px舍入差；无hidden/clip裁切/首屏完全遮挡。范围上限80候选/2000元素，空范围为未知；不代表整页视觉验收。',steps:[{action:'assert',assertion:'control-usability'}]}));
}
