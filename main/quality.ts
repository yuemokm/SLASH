import {isTestCasePath,parseTestCaseSuite,TEST_CASE_NOTICE} from '../shared/test-cases.js';
import {analyseHtmlScriptBindings} from './html-script-bindings.js';
import {processDrawio,type FlowSpec,DEFAULT_FLOW_SPEC} from './flow.js';
import {validateMarkdownStructure} from './artifacts.js';
import type {ArtifactRecord} from './product-records.js';
import type {QualityAcceptanceMapping,QualityGate,QualityReportDetails} from '../shared/types.js';

export const QUALITY_CHECKER_VERSION='slash-quality-5';

export type QualitySeverity='blocking'|'warning';
export type QualityIssue={severity:QualitySeverity;code:string;message:string;line?:number;locator?:string};
export type QualityCheckKind='flow'|'html'|'markdown';
export type QualityContentReport={kind:QualityCheckKind;valid:boolean;issues:QualityIssue[];counts:{blocking:number;warnings:number};summary:string;checkerVersion:string;details?:QualityReportDetails};

export type QualityMarkdownOptions={
 isPrd?:boolean;
 /** Only sections from an explicitly selected template are mandatory. */
 requiredSections?:Array<{id:string;aliases:string[];required?:boolean}>;
};

const PRD_SECTIONS:Array<{id:string;aliases:string[];required?:boolean}>=[
 {id:'goals',aliases:['背景与目标','目标与范围','业务目标','目标','背景']},
 {id:'roles',aliases:['用户与角色','用户角色','角色','用户']},
 {id:'flow',aliases:['业务流程','主流程','业务过程','流程']},
 {id:'pages-fields',aliases:['页面与字段','页面字段','页面','字段']},
 {id:'permissions-rules',aliases:['权限与规则','权限规则','业务规则','规则','权限']},
 {id:'exceptions',aliases:['异常处理','异常与边界','异常','边界']},
 {id:'acceptance',aliases:['验收标准','验收条件','验收用例','验收','acceptance']},
];

function isPrdTitle(value:string){
 return /(?:\bprd\b|产品需求|需求文档)/i.test(value)&&!/(?:会议|纪要|笔记|访谈|minutes|notes)/i.test(value);
}

export function evaluateQualityGate(report:Pick<QualityContentReport,'valid'|'summary'>,sourceHash?:string,currentHash?:string):QualityGate{
 const reasons:string[]=[];
 if(!report.valid)reasons.push(report.summary);
 if(sourceHash&&currentHash&&sourceHash!==currentHash)reasons.push('成果文件已在检查后发生变化，请重新检查当前版本');
 const versionConflict=Boolean(sourceHash&&currentHash&&sourceHash!==currentHash);
 return {allowed:reasons.length===0,code:versionConflict?'VERSION_CONFLICT':reasons.length?'QUALITY_BLOCKED':'QUALITY_PASSED',reasons};
}

function report(kind:QualityCheckKind,issues:QualityIssue[],details?:QualityReportDetails):QualityContentReport{
 const blocking=issues.filter(issue=>issue.severity==='blocking').length;
 const warnings=issues.length-blocking;
 const summary=blocking?`静态检查发现 ${blocking} 个阻断项${warnings?`和 ${warnings} 个建议`:''}`:warnings?`静态检查未发现阻断项，有 ${warnings} 个建议`:'静态检查未发现阻断项';
 return {kind,checkerVersion:QUALITY_CHECKER_VERSION,valid:blocking===0,issues,counts:{blocking,warnings},summary:kind==='html'?`${summary}；核心交互仍需试用`:summary,details};
}

function lineAt(source:string,index:number){return source.slice(0,index).split(/\r\n|\n|\r/).length;}
function attrValue(attributes:string,name:string):string|undefined{
 const match=new RegExp(`(?:^|\\s)${quoteRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,'i').exec(attributes);
 return match?.[1]??match?.[2]??match?.[3];
}
function hasAttr(attributes:string,name:string){return new RegExp(`(?:^|\\s)${quoteRegExp(name)}(?:\\s*=|\\s|$)`,'i').test(attributes);}
function quoteRegExp(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

/** Default HTML delivery is offline. Only declarative loading dependencies are
 * blockers: navigation, data URLs and local paths are allowed. This bounded
 * static scan never executes code or proves local resources/browser behavior. */
function assetUrl(value:string){return value.replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi,(_,hex:string,decimal:string)=>{const code=parseInt(hex??decimal,hex?16:10);return code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/&(?:colon|sol|amp|quot|apos);/gi,entity=>({ '&colon;':':','&sol;':'/','&amp;':'&','&quot;':'"','&apos;':"'" }[entity.toLowerCase()]??entity)).trim();}
function cssExternalAssets(css:string,add:(value:string,index:number)=>void){
 // Consume comments and ordinary strings before looking for actual url/import
 // syntax; content:"url(https://...)" is text, not a loading dependency.
 const tokens=/\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\burl\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s)'";]*))\s*\)|@import\s+(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')/gi;
 for(const match of css.matchAll(tokens)){const value=match[1]??match[2]??match[3]??match[4]??match[5];if(value!==undefined)add(value,match.index??0);}
}

/** Positive declarative resource references only: no completeness proof and no JS execution. */
export function htmlLoadingAssets(html:string){const values:Array<{raw:string;url:string;index:number}>=[],add=(raw:string,index:number)=>values.push({raw,url:assetUrl(raw),index});
 const assetMarkup=html.replace(/<!--[\s\S]*?-->/g,value=>value.replace(/[^\r\n]/g,' ')).replace(/(<script\b(?:[^>"']|"[^"]*"|'[^']*')*>)([\s\S]*?)(<\/script\s*>)/gi,(_,open:string,body:string,close:string)=>open+body.replace(/[^\r\n]/g,' ')+close);
 for(const resourceTag of assetMarkup.matchAll(/<([a-z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)){
  const tag=resourceTag[1].toLowerCase(),attrs=resourceTag[2],index=resourceTag.index??0;
  if(tag==='link'&&(attrValue(attrs,'rel')??'').split(/\s+/).some(rel=>/^(?:stylesheet|preload|modulepreload|icon)$/i.test(rel))){const value=attrValue(attrs,'href');if(value)add(value,index);}
  if(['script','img','iframe','source','video','audio','embed','input','track'].includes(tag)){const value=attrValue(attrs,'src');if(value)add(value,index);}
  if(tag==='object'){const value=attrValue(attrs,'data');if(value)add(value,index);}
  if(tag==='video'){const value=attrValue(attrs,'poster');if(value)add(value,index);}
  if(tag==='img'||tag==='source')for(const candidate of (attrValue(attrs,'srcset')??'').split(',')){const value=candidate.trim().split(/\s+/,1)[0];if(value)add(value,index);}
  const style=attrValue(attrs,'style');if(style)cssExternalAssets(assetUrl(style),(value)=>add(value,index));
 }
 for(const style of assetMarkup.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi))cssExternalAssets(style[1],(value,index)=>add(value,(style.index??0)+style[0].indexOf(style[1])+index));
 return values;
}
function checkMarkdown(markdown:string,options:QualityMarkdownOptions={}):QualityContentReport{
 const issues:QualityIssue[]=[];
 const lines=markdown.split(/\r\n|\n|\r/);
 if(!markdown.trim())issues.push({severity:'blocking',code:'EMPTY_MARKDOWN',message:'Markdown 成果为空'});
 const advanceOffset=(start:number,raw:string)=>{const next=markdown[start+raw.length];const newline=next==='\r'?(markdown[start+raw.length+1]==='\n'?2:1):next==='\n'?1:0;return start+raw.length+newline;};
 type Heading={title:string;level:number;line:number;start:number;end:number;id?:string;bodyEnd:number};
 const headings:Heading[]=[];let offset=0;let fence:{char:string;length:number;line:number}|undefined;
 const ids=new Map<string,number[]>();
 const sectionMarker=/<!--\s*pm-section:([A-Za-z0-9][A-Za-z0-9_.:-]{0,127})\s*-->\s*$/i;
 for(let index=0;index<lines.length;index++){
  const raw=lines[index],line=index+1,trimmed=raw.trim(),fenceStart=/^(`{3,}|~{3,})/.exec(trimmed);
  if(fenceStart){const token=fenceStart[1];if(!fence)fence={char:token[0],length:token.length,line};else if(token[0]===fence.char&&token.length>=fence.length)fence=undefined;offset=advanceOffset(offset,raw);continue;}
  if(fence){offset=advanceOffset(offset,raw);continue;}
  const heading=/^(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(raw);
  if(heading){
   const marker=sectionMarker.exec(heading[2]),title=(marker?heading[2].slice(0,marker.index):heading[2]).trimEnd(),id=marker?.[1];
   if(id){const rows=ids.get(id)??[];rows.push(line);ids.set(id,rows);}
   if(/<!--\s*pm-section:/i.test(heading[2])&&!marker)issues.push({severity:'blocking',code:'MALFORMED_SECTION_ID',message:'章节标识格式无效',line});
   headings.push({title,level:heading[1].length,line,start:offset,end:offset+raw.length,id,bodyEnd:markdown.length});
   const previous=lines[index-1];if(previous){const previousHeading=/^(#{1,6})\s+/.exec(previous);if(previousHeading&&heading[1].length>previousHeading[1].length+1)issues.push({severity:'warning',code:'INVALID_LEVEL_GAP',message:`建议调整标题层级：从 ${previousHeading[1].length} 跳到 ${heading[1].length}`,line});}
  }
  if(/\[[^\]]+\]\((?:https?:\/\/|javascript:)/i.test(raw))issues.push({severity:'warning',code:'EXTERNAL_MARKDOWN_LINK',message:'Markdown 包含外部链接，交付时需确认目标可访问',line});
  offset=advanceOffset(offset,raw);
 }
 if(fence)issues.push({severity:'blocking',code:'UNCLOSED_CODE_FENCE',message:`代码围栏未闭合（起始于第 ${fence.line} 行）`,line:fence.line});
 for(const [id,rows] of ids)if(rows.length>1)for(const line of rows)issues.push({severity:'blocking',code:'DUPLICATE_SECTION_ID',message:`章节标识 ${id} 重复`,line});
 if(!headings.length)issues.push({severity:'warning',code:'NO_HEADINGS',message:'Markdown 没有标题，可能缺少成果结构'});
 const structural=validateMarkdownStructure(markdown,[]);
 for(const issue of structural.issues.filter(item=>item.code==='MALFORMED_SECTION_ID'))if(!issues.some(existing=>existing.code===issue.code&&existing.line===issue.line))issues.push({severity:'blocking',code:issue.code,message:issue.message,line:issue.line});
 for(let index=0;index<headings.length;index++){const heading=headings[index],next=headings.slice(index+1).find(item=>item.level<=heading.level);heading.bodyEnd=next?.start??markdown.length;}

 const inferredPrd=headings.some(heading=>heading.id==='prd'||(heading.level===1&&isPrdTitle(heading.title)));
 const isPrd=options.isPrd??inferredPrd;
 if(isPrd)for(const heading of headings)if(!heading.id)issues.push({severity:'warning',code:'MISSING_SECTION_ID',message:'建议为 PRD 章节添加稳定标识，便于局部修改与验收追踪',line:heading.line});
 const explicitTemplate=options.requiredSections!==undefined;
 const sectionSeverity:QualitySeverity=explicitTemplate?'blocking':'warning';
 const required=(options.requiredSections??(isPrd?PRD_SECTIONS:[])).filter(section=>section.required!==false);
 const missingSections:string[]=[],emptySections:string[]=[];let acceptanceHeading:Heading|undefined;
 const normalized=(value:string)=>value.toLocaleLowerCase().replace(/[\s、，,。:：/\\_-]+/g,'');
 const findSection=(section:{id:string;aliases:string[]})=>headings.find(heading=>heading.id===section.id||section.aliases.some(alias=>normalized(heading.title).includes(normalized(alias))));
 for(const section of required){
  const found=findSection(section);
  if(!found){missingSections.push(section.id);issues.push({severity:sectionSeverity,code:'MISSING_PRD_SECTION',message:explicitTemplate?`缺少所选模板的必填章节“${section.aliases[0]??section.id}”`:`可按本次范围补充“${section.aliases[0]??section.id}”；模块说明无需完整 PRD 章节`,locator:section.id});}
  else {const body=markdown.slice(found.end,found.bodyEnd).replace(/<!--(?:.|\n|\r)*?-->/g,'').trim();if(!body){emptySections.push(section.id);issues.push({severity:sectionSeverity,code:'EMPTY_PRD_SECTION',message:explicitTemplate?`所选模板的必填章节“${found.title}”没有正文`:`章节“${found.title}”没有正文，可按本次范围补充`,line:found.line,locator:section.id});}}
  if(section.id==='acceptance')acceptanceHeading=found;
 }

 const acceptance:QualityAcceptanceMapping[]=[];
 if(acceptanceHeading){
  const body=markdown.slice(acceptanceHeading.end,acceptanceHeading.bodyEnd),bodyLines=body.split(/\r\n|\n|\r/);let bodyOffset=acceptanceHeading.end;
  for(const raw of bodyLines){
   const line=lineAt(markdown,bodyOffset),criterionMatch=/^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+?)\s*$/.exec(raw),tableCriterion=/^\s*\|/.test(raw)&&/\b(?:AC|验收|AT)[-_ ]?\d+\b/i.test(raw),text=(criterionMatch?.[1]??(tableCriterion?raw.replace(/^\s*\||\|\s*$/g,' ').trim():(/\S/.test(raw)&&!/^\s*\|/.test(raw)&&!/^\s*(`{3,}|~{3,})/.test(raw)?raw.trim():'')));
   if(text){
    const idMatch=/\b(?:AC|验收|AT)[-_ ]?\d+\b/i.exec(text),references:string[]=[];const refPattern=/(?:pm-section|section|章节|页面|规则|流程|映射|maps?|implements|covers|ref)\s*[:#=→-]?\s*([A-Za-z0-9][A-Za-z0-9_.:-]{0,127})/gi;let ref:RegExpExecArray|null;
    while((ref=refPattern.exec(text)))if(!references.includes(ref[1]))references.push(ref[1]);
    for(const section of required)if(new RegExp(`(?:^|[|\\s])${section.id}(?:$|[|\\s])`,'i').test(text)&&!references.includes(section.id))references.push(section.id);
    const mappedReferences=references.filter(reference=>headings.some(heading=>heading.id===reference||normalized(heading.title).includes(normalized(reference))||required.some(section=>section.id===reference&&findSection(section)===heading))),unresolved=references.filter(reference=>!mappedReferences.includes(reference)),mapped=Boolean(idMatch&&mappedReferences.length>0&&unresolved.length===0);
    acceptance.push({id:idMatch?.[0],line,text,references,mapped});
    if(!idMatch)issues.push({severity:'warning',code:'ACCEPTANCE_CRITERION_UNSTABLE',message:'建议为验收条目添加稳定编号（例如 AC-1），便于后续追踪',line,locator:`acceptance:${line}`});
    else if(!references.length)issues.push({severity:'warning',code:'ACCEPTANCE_UNMAPPED',message:`建议将验收条目 ${idMatch[0]} 关联到本次涉及的页面、规则或章节`,line,locator:idMatch[0]});
    else if(unresolved.length)issues.push({severity:'warning',code:'ACCEPTANCE_MAPPING_TARGET_NOT_FOUND',message:`验收条目 ${idMatch[0]} 的章节引用需核对：${unresolved.join(', ')}`,line,locator:idMatch[0]});
    else if(!mappedReferences.length)issues.push({severity:'warning',code:'ACCEPTANCE_UNMAPPED',message:`验收条目 ${idMatch[0]} 的章节暂无法定位，建议补充关联`,line,locator:idMatch[0]});
   }
   bodyOffset=advanceOffset(bodyOffset,raw);
  }
  if(acceptance.length===0)issues.push({severity:'warning',code:'EMPTY_ACCEPTANCE_CRITERIA',message:'验收标准章节未发现可执行条目，建议按本次范围补充',line:acceptanceHeading.line,locator:'acceptance'});
 }
 const mappedCount=acceptance.filter(item=>item.mapped).length;
 const details:QualityReportDetails={metrics:{headings:headings.length,sections:headings.length,requiredSections:required.length,missingSections:missingSections.length,emptySections:emptySections.length,acceptanceCriteria:acceptance.length,acceptanceMapped:mappedCount,acceptanceUnmapped:acceptance.length-mappedCount},markdown:{headings:headings.length,sections:headings.length,requiredSections:required.length,missingSections,emptySections,acceptanceCriteria:acceptance.length,acceptanceMapped:mappedCount,acceptanceUnmapped:acceptance.length-mappedCount,acceptance}};
 return report('markdown',issues,details);
}

function checkHtml(html:string):QualityContentReport{
 const issues:QualityIssue[]=[];
 // Ignore comments and inline script strings when scanning markup; keep offsets
 // for line locators. This remains a static check, never a browser execution.
 const markup=html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,value=>value.replace(/[^\r\n]/g,' '));
 if(!html.trim())issues.push({severity:'blocking',code:'EMPTY_HTML',message:'HTML 成果为空'});
 if(!/<html(?:\s|>)/i.test(markup)||!/<\/html\s*>/i.test(markup))issues.push({severity:'blocking',code:'MISSING_HTML_ROOT',message:'HTML 缺少完整 html 根元素'});
 if(!/<body(?:\s|>)/i.test(markup)||!/<\/body\s*>/i.test(markup))issues.push({severity:'blocking',code:'MISSING_BODY',message:'HTML 缺少完整 body 元素'});
 if(!/<head(?:\s|>)/i.test(markup))issues.push({severity:'warning',code:'MISSING_HEAD',message:'HTML 没有 head 元素，建议声明标题和资源'});
 const ids=new Map<string,number[]>();for(const tag of markup.matchAll(/<[a-z][\w:-]*\b([^>]*)>/gi)){const id=attrValue(tag[1],'id');if(!id)continue;const rows=ids.get(id)??[];rows.push(lineAt(html,tag.index??0));ids.set(id,rows);}
 for(const [id,rows] of ids)if(rows.length>1)issues.push({severity:'blocking',code:'DUPLICATE_HTML_ID',message:`HTML id “${id}” 重复`,line:rows[1],locator:`#${id}`});
 const hasId=(target:string)=>{const key=target.replace(/^#/,'').split(/[?#]/,1)[0];return Boolean(key&&ids.has(key));};
 const scriptBindings=analyseHtmlScriptBindings(html);
 const controls=[...markup.matchAll(/<(button|input|select|textarea|summary|a)\b([^>]*?)(?:\/?>)/gi)];
 const formRanges=[...markup.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)];

 let buttons=0,forms=0,links=0,actions=0,brokenTargets=0,stateMarkers=0,externalResources=0;const externalSeen=new Set<string>();
 const addExternal=(raw:string,index:number)=>{const value=assetUrl(raw);if(/^(?:https?:)?\/\//i.test(value)){externalResources++;externalSeen.add(value);issues.push({severity:'blocking',code:'EXTERNAL_ASSET',message:'HTML 加载资源依赖外网，不满足默认离线交付；请使用本地或内嵌资源后重新验收',line:lineAt(html,index),locator:value});}};
 for(const asset of htmlLoadingAssets(html))addExternal(asset.raw,asset.index);
 for(const unsafe of html.matchAll(/\b(?:href|src|action)\s*=\s*(["'])javascript:[^"']*\1/gi))issues.push({severity:'blocking',code:'UNSAFE_SCRIPT_URL',message:'HTML 属性包含 javascript: 地址，交互路径不安全',line:lineAt(html,unsafe.index??0)});
 const controlScriptBinding=(attributes:string,tag:string)=>scriptBindings.forControl({tag,id:attrValue(attributes,'id'),classes:(attrValue(attributes,'class')??'').split(/\s+/).filter(Boolean)});
 const controlHasScriptBinding=(attributes:string,tag:string)=>controlScriptBinding(attributes,tag).status==='bound';
 const attrAction=(attributes:string,tag:string)=>Boolean(attrValue(attributes,'onclick')||attrValue(attributes,'onchange')||attrValue(attributes,'onsubmit')||attrValue(attributes,'data-action')||attrValue(attributes,'data-route')||attrValue(attributes,'data-target')||attrValue(attributes,'aria-controls')||attrValue(attributes,'form')||(['submit','reset'].includes((attrValue(attributes,'type')??'').toLowerCase())&&tag!=='a'));
 for(const control of controls){
  const tag=control[1].toLowerCase(),attributes=control[2]??'',index=control.index??0,disabled=hasAttr(attributes,'disabled'),target=attrValue(attributes,'data-target'),ariaTargets=(attrValue(attributes,'aria-controls')??'').split(/\s+/).filter(Boolean);
  for(const ariaTarget of ariaTargets)if(!hasId(ariaTarget)){brokenTargets++;issues.push({severity:'blocking',code:'BROKEN_INTERACTION_TARGET',message:`交互控件引用了不存在的目标 ${ariaTarget}`,line:lineAt(html,index),locator:ariaTarget});}
  if(target&&target.startsWith('#')&&!hasId(target)){brokenTargets++;issues.push({severity:'blocking',code:'BROKEN_INTERACTION_TARGET',message:`交互控件引用了不存在的目标 ${target}`,line:lineAt(html,index),locator:target});}
  if(target&&target.startsWith('#'))actions++;
  if(tag==='button')buttons++;
  if(tag==='a'){links++;const href=attrValue(attributes,'href');if(href){if(href!=='#'||attrAction(attributes,tag)||controlHasScriptBinding(attributes,tag))actions++;if(href.startsWith('#')&&href!=='#'&&!hasId(href)){brokenTargets++;issues.push({severity:'blocking',code:'BROKEN_ANCHOR',message:`页内链接指向不存在的元素 ${href}`,line:lineAt(html,index),locator:href});}if(href==='#'&&!attrAction(attributes,tag)&&!controlHasScriptBinding(attributes,tag)&&!disabled)issues.push({severity:'warning',code:'LINK_WITHOUT_DESTINATION',message:'链接使用 #，静态检查未发现交互处理，需试用确认',line:lineAt(html,index)});}else if(!attrValue(attributes,'id')&&!attrValue(attributes,'name')&&!attrAction(attributes,tag)&&!controlHasScriptBinding(attributes,tag)&&!disabled)issues.push({severity:controlScriptBinding(attributes,tag).status==='unknown'?'warning':'blocking',code:'LINK_WITHOUT_ACTION',message:'静态检查未发现链接的 href 或点击处理，需试用确认',line:lineAt(html,index)});else if(attrAction(attributes,tag)||controlHasScriptBinding(attributes,tag))actions++;}
  const inputType=(attrValue(attributes,'type')??'').toLowerCase(),isActionControl=tag==='button'||(tag==='input'&&['button','submit','reset','image'].includes(inputType));
  const nativeSubmit=tag==='button'&&(!inputType||inputType==='submit')&&formRanges.some(form=>index>(form.index??0)&&index<(form.index??0)+form[0].length);
  if(isActionControl&&!disabled){if(nativeSubmit||attrAction(attributes,tag)||controlHasScriptBinding(attributes,tag))actions++;else issues.push({severity:controlScriptBinding(attributes,tag).status==='unknown'?'warning':'blocking',code:'BUTTON_WITHOUT_ACTION',message:controlScriptBinding(attributes,tag).status==='unknown'?'静态检查无法确认按钮处理，需运行浏览器断言；未知不代表无实现或功能通过':'主要按钮未发现点击处理、提交类型或可定位的交互路径',line:lineAt(html,index),locator:attrValue(attributes,'id')?`#${attrValue(attributes,'id')}`:undefined});}
  if(!disabled&&(tag==='summary'||['select','textarea'].includes(tag)||(tag==='input'&&!isActionControl&&inputType!=='hidden'&&!hasAttr(attributes,'readonly'))))actions++;
  if(['input','select','textarea'].includes(tag)&&!attrValue(attributes,'name')&&!['button','submit','reset','image','hidden'].includes(inputType))issues.push({severity:'warning',code:'FORM_FIELD_WITHOUT_NAME',message:'表单字段缺少 name，提交值无法稳定定位',line:lineAt(html,index)});
 }
 for(const form of formRanges){forms++;const attributes=form[1]??'',body=form[2]??'',index=form.index??0,hasSubmit=[...body.matchAll(/<(button|input)\b([^>]*)>/gi)].some(control=>!hasAttr(control[2],'disabled')&&(control[1].toLowerCase()==='button'?['','submit'].includes((attrValue(control[2],'type')??'').toLowerCase()):['submit','image'].includes((attrValue(control[2],'type')??'').toLowerCase()))),hasHandler=Boolean(attrAction(attributes,'form')||controlHasScriptBinding(attributes,'form'));if(!hasSubmit&&!hasHandler)issues.push({severity:controlScriptBinding(attributes,'form').status==='unknown'?'warning':'blocking',code:'FORM_WITHOUT_SUBMIT_PATH',message:'静态检查未发现表单提交控件或处理入口，需试用确认',line:lineAt(html,index)});if(!hasAttr(attributes,'novalidate')&&!/\b(?:required|pattern\s*=|minlength\s*=|maxlength\s*=|min\s*=|max\s*=)/i.test(body))issues.push({severity:'warning',code:'FORM_WITHOUT_VALIDATION',message:'表单未发现字段校验属性',line:lineAt(html,index)});}
 stateMarkers=[...html.matchAll(/\b(?:data-state|data-status|aria-busy|aria-live)\s*=|\b(?:loading|loaded|error|empty|success|pending|submitted|idle|active|selected|disabled)\b/gi)].length;
 if(controls.length>0&&stateMarkers===0)issues.push({severity:'warning',code:'MISSING_STATE_FEEDBACK',message:'原型存在交互控件但没有发现 loading、error、empty、success 或提交状态标记'});
 const hasActiveControl=controls.some(control=>{const tag=control[1].toLowerCase(),attrs=control[2];return !hasAttr(attrs,'disabled')&&!hasAttr(attrs,'readonly')&&!(tag==='input'&&(attrValue(attrs,'type')??'').toLowerCase()==='hidden')&&!(tag==='a'&&!attrValue(attrs,'href')&&(attrValue(attrs,'id')||attrValue(attrs,'name')));});
 if(hasActiveControl&&actions===0)issues.push({severity:scriptBindings.hasUnknownBindings?'warning':'blocking',code:'NO_INTERACTION_PATH',message:'静态检查未发现可定位的交互入口，请试用确认核心流程'});
 if(controls.length===0)issues.push({severity:'warning',code:'NO_INTERACTIVE_CONTROLS',message:'原型没有发现按钮、链接或表单控件，核心流程无法通过静态检查'});
 if(/<script\b[^>]*>[^<]*(?:fetch|XMLHttpRequest|WebSocket)\s*\(/is.test(html))issues.push({severity:'warning',code:'RUNTIME_NETWORK_CALL',message:'HTML 脚本包含网络请求，静态交付需要额外运行环境'});
 if(!/<main\b/i.test(html)&&!/<div\b[^>]*(?:id|class)=["'][^"']*(?:app|root|main)/i.test(html))issues.push({severity:'warning',code:'MISSING_MAIN_ENTRY',message:'原型未发现 main 或 app 根入口'});
 const details:QualityReportDetails={metrics:{controls:controls.length,buttons,forms,links,actions,brokenTargets,stateMarkers,externalResources,externalResourceKinds:externalSeen.size},interactions:{controls:controls.length,buttons,forms,links,actions,brokenTargets,stateMarkers,externalResources}};
 return report('html',issues,details);
}

function checkFlow(xml:string,spec?:FlowSpec):QualityContentReport{
 try{const processed=processDrawio(xml,spec??DEFAULT_FLOW_SPEC);const issues:QualityIssue[]=processed.report.issues.map(issue=>({severity:issue.severity==='error'?'blocking':'warning',code:issue.code,message:issue.message,locator:`${issue.diagramId}${issue.cellId?`#${issue.cellId}`:''}`}));for(const limitation of processed.document.limitations)issues.push({severity:'warning',code:limitation.code,message:limitation.message,locator:limitation.diagramId});return report('flow',issues,{metrics:{diagrams:processed.report.counts.diagrams,vertices:processed.report.counts.vertices,edges:processed.report.counts.edges,errors:processed.report.counts.errors,warnings:processed.report.counts.warnings}});}catch(error){return report('flow',[{severity:'blocking',code:'FLOW_PARSE_FAILED',message:error instanceof Error?error.message:String(error)}],{metrics:{}});}
}

export function qualityCheckForArtifact(artifact:Pick<ArtifactRecord,'kind'|'relativePath'>,content:string,markdownOptions:QualityMarkdownOptions={}):QualityContentReport{
 if(isTestCasePath(artifact.relativePath)){try{const suite=parseTestCaseSuite(content);return {...report('markdown',[],{metrics:{testCases:suite.cases.length}}),summary:'用例结构有效；'+TEST_CASE_NOTICE};}catch(error){return report('markdown',[{severity:'blocking',code:'TEST_CASE_INVALID',message:error instanceof Error?error.message:String(error)}]);}}
 if(artifact.kind==='flow')return checkFlow(content);
 if(artifact.kind==='prototype')return checkHtml(content);
 if(['document','template','knowledge','reference'].includes(artifact.kind)){const filename=artifact.relativePath.split(/[\\/]/).at(-1)??artifact.relativePath;const isPrdPath=/\.(?:md|markdown)$/i.test(filename)&&isPrdTitle(filename);return checkMarkdown(content,{...(isPrdPath?{isPrd:true}:{}),...markdownOptions});}
 if(/\.(?:drawio|xml)$/i.test(artifact.relativePath))return checkFlow(content);
 if(/\.html?$/i.test(artifact.relativePath))return checkHtml(content);
 return checkMarkdown(content,markdownOptions);
}

export function qualityKindForArtifact(artifact:Pick<ArtifactRecord,'kind'|'relativePath'>):QualityCheckKind{
 if(artifact.kind==='flow'||/\.(?:drawio|xml)$/i.test(artifact.relativePath))return'flow';
 if(artifact.kind==='prototype'||/\.html?$/i.test(artifact.relativePath))return'html';
 return'markdown';
}

export {checkFlow,checkHtml,checkMarkdown};
