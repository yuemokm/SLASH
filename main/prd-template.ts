import {createHash} from 'node:crypto';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type {Root} from 'mdast';
import type {TaskPrdTemplate,PrdTemplateSection,PrdTemplateTable} from '../shared/prd-template.js';
import type {TaskHostCheckOutcome,TaskAcceptanceContract} from '../shared/task-acceptance.js';
import {businessPathKey} from '../shared/business-rules.js';

export const PRD_TEMPLATE_STRUCTURE_VERSION='prd-template-structure-1';
export const eligiblePrdTemplateOutputs=(contract:TaskAcceptanceContract)=>contract.outputs.filter(o=>o.kind==='markdown'&&/\.(?:md|markdown)$/i.test(o.target.path)&&!/_处理副本_/.test(o.target.path)&&!(contract.template&&o.target.mountId===contract.template.source.mountId&&businessPathKey(o.target.path)===businessPathKey(contract.template.source.path)));
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const plain=(node:{value?:string;children?:unknown[]}):string=>node.value??node.children?.map(child=>plain(child as typeof node)).join('')??'';
const norm=(v:string)=>v.toLocaleLowerCase().replace(/[\s\x60*_，,。:：/\\、（）()\-]+/g,'');
const titleParts=(v:string)=>{const m=/^\s*(\d+(?:[.．][\dXx]+)*)(?:[.．、]\s*|\s+)(.*)$/.exec(v);return{ordinal:m?.[1].replaceAll('．','.'),title:(m?.[2]??v).trim()};};
type Section=PrdTemplateSection&{start:number;end:number;body:string};
type Parsed={sections:Section[];tables:PrdTemplateTable[]};
// Reusable schema labels, never field values, sample statuses or rows.
const schemaLabel=/术语|定义|序号|名称|版本|说明|编号|模块|角色|功能|优先级|菜单|描述|业务对象|字段|类型|来源|长度|范围|必填|唯一|默认值|校验|备注|节点|发生地|工具|触发|提供方|调用方|参数|返回|类别|需求项|指标|要求/i;
function parse(content:string):Parsed{
 if(Buffer.byteLength(content)>2_000_000)throw Error('PRD_TEMPLATE_CONTENT_LIMIT');
 const tree=unified().use(remarkParse).use(remarkGfm).parse(content) as Root;
 const sections:Section[]=[],tables:PrdTemplateTable[]=[],stack:Section[]=[];
 const headings=tree.children.filter(n=>n.type==='heading'),title=headings[0];
 // An unnumbered title before peer sections describes the document itself.
 const laterHeadings=headings.slice(1),omitTitle=!!title&&!titleParts(plain(title)).ordinal&&(laterHeadings.some(h=>h.depth===title.depth||!!titleParts(plain(h)).ordinal)||laterHeadings.length>0&&laterHeadings.every(h=>h.depth>title.depth));
 for(const node of tree.children){
  if(node.type==='heading'){
   if(node===title&&omitTitle)continue;
   const parts=titleParts(plain(node)),start=node.position?.start.offset??0;
   while(stack.length&&stack.at(-1)!.level>=node.depth)stack.pop()!.end=start;
   const ambiguous=!!parts.ordinal&&/^[\dXx]+[.．][\dXx]+(?:[.．][\dXx]+)*(?:\s|$)/.test(parts.title);
   const section:Section={id:'section:'+sections.length,parentId:stack.at(-1)?.id,title:parts.title,ordinal:parts.ordinal,level:node.depth,slot:!!parts.ordinal&&(parts.ordinal.includes('X')||parts.ordinal.includes('x'))||/\[[^\]]*\]/.test(parts.title),...(ambiguous?{ambiguous:true}:{}),locator:'line:'+(node.position?.start.line??1),start,end:content.length,body:''};sections.push(section);stack.push(section);
  }
  if(node.type==='table'){
   const labels=(node.children[0]?.children.map(plain)??[]).map(v=>v.trim()),recognized=labels.filter(v=>schemaLabel.test(v)).length;
   // DOCX uses the first row for layout; GFM syntax alone cannot prove a header.
   const known=labels.length>=2&&new Set(labels.map(norm)).size===labels.length&&labels.every(v=>v.length>0&&v.length<=80&&!/\[[^\]]*\]|^\d+$|原状态|目标状态/.test(v))&&recognized>=Math.max(2,Math.ceil(labels.length*.6));
   tables.push({id:'table:'+tables.length,sectionId:stack.at(-1)?.id,columns:labels,known,locator:'line:'+(node.position?.start.line??1)});
  }
 }
 for(const s of sections)s.body=content.slice(s.start,sections.find(child=>child.parentId===s.id)?.start??s.end);
 if(sections.length>1000||tables.length>500)throw Error('PRD_TEMPLATE_STRUCTURE_LIMIT');
 return{sections,tables};
}
export function freezePrdTemplate(input:Omit<TaskPrdTemplate,'schemaVersion'|'structureVersion'|'snapshotHash'|'sections'|'tables'|'state'|'limitations'>,content?:string,limitations:string[]=[]):TaskPrdTemplate{
 const parsed=content===undefined?{sections:[],tables:[]}:parse(content);
 if(!parsed.sections.length)limitations.push('模板尚无可核对的标题结构');
 if(parsed.tables.some(t=>!t.known))limitations.push('部分表格不能可靠判定必填表头；示例状态和业务值未纳入硬性要求');
 if(parsed.sections.some(s=>s.ambiguous))limitations.push('部分标题含编号续段，层级或样例槽位尚未可靠确定；未将其文字作为必需业务名称');
 const value={schemaVersion:1 as const,...input,structureVersion:PRD_TEMPLATE_STRUCTURE_VERSION,state:content===undefined||!parsed.sections.length?'unverified' as const:'ready' as const,sections:parsed.sections.map(({start:_,end:__,body:___,...s})=>s),tables:parsed.tables,limitations:[...limitations]};
 return{...value,snapshotHash:digest(JSON.stringify(value))};
}
export function prdTemplateSnapshotValid(template:TaskPrdTemplate){const {snapshotHash,outputId:_,...body}=template;return digest(JSON.stringify(body))===snapshotHash;}
const omitted=(body:string)=>/^(?:待确认(?:原因|说明)?|不适用|暂不涉及|无需集成)[：:]\s*[^\n]{6,}$/.test(body.replace(/^#{1,6}.*$/gm,'').trim());
const slotMatches=(expected:PrdTemplateSection,actual:Section)=>{
 if(!expected.slot)return false;
 if(expected.ordinal){const segments=expected.ordinal.split('.'),actualSegments=actual.ordinal?.split('.');return !!actualSegments&&segments.length===actualSegments.length&&segments.every((part,index)=>/^[xX]$/.test(part)?/^\d+$/.test(actualSegments[index]):part===actualSegments[index]);}
 const literal=norm(expected.title.replace(/\[[^\]]*\]/g,''));return !literal||norm(actual.title).includes(literal);
};
/** Deterministic structural observations only; semantic interpretation stays unverified. */
export function checkPrdTemplate(template:TaskPrdTemplate,content:string,targetHash:string):TaskHostCheckOutcome{
 if(template.state!=='ready'||!prdTemplateSnapshotValid(template))return{status:'unverified',reason:'所选模板结构尚未冻结或无法核对',evidence:[]};
 const actual=parse(content),matches=new Map<string,Section[]>(),failures:string[]=[],unknown=[...template.limitations];
 for(const expected of template.sections){
  if(expected.ambiguous){matches.set(expected.id,[]);unknown.push('标题编号续段歧义，未设为必需业务名称：'+expected.locator);continue;}
  const parents=expected.parentId?matches.get(expected.parentId)??[]:[undefined],found:Section[]=[];
  for(const parent of parents){
   const children=actual.sections.filter(s=>s.parentId===parent?.id);
   const candidates=children.filter(s=>norm(s.title)===norm(expected.title)&&(!expected.ordinal||!s.ordinal||expected.ordinal===s.ordinal)||slotMatches(expected,s)||expected.ordinal&&s.ordinal===expected.ordinal);
   if(candidates.length)found.push(...candidates);
   else if(parent&&omitted(parent.body))unknown.push('章节明确待确认或不适用：'+expected.title);
   else failures.push('缺少模板章节：'+(parent?parent.title+' / ':'')+(expected.ordinal?expected.ordinal+' ':'')+expected.title);
  }
  matches.set(expected.id,found);
  for(const section of found){const direct=section.body.replace(/^#{1,6}.*$/gm,'').replace(/\[表格 table\[\d+\]\]/g,'').trim();if(!direct&&!actual.sections.some(child=>child.parentId===section.id))failures.push('模板章节没有内容：'+section.title);}
 }
 for(const table of template.tables){
  if(!table.known)continue;
  let scopeId=table.sectionId;
  while(scopeId&&!matches.get(scopeId)?.length)scopeId=template.sections.find(s=>s.id===scopeId)?.parentId;
  const owners=scopeId?matches.get(scopeId)??[]:[undefined];
  for(const owner of owners){
   const descendant=(id:string|undefined)=>{if(!owner)return !id;while(id){if(id===owner.id)return true;id=actual.sections.find(s=>s.id===id)?.parentId;}return false;};
   const fallback=scopeId!==table.sectionId,candidates=actual.tables.filter(t=>fallback?descendant(t.sectionId):t.sectionId===owner?.id),wanted=table.columns.map(norm);
   if(!fallback&&!candidates.length&&actual.tables.some(t=>descendant(t.sectionId)&&wanted.every(c=>t.columns.some(a=>norm(a)===c)))){unknown.push('模板表格已出现在新增子章节，表格归属尚待确认：'+table.locator);continue;}
   const ranked=candidates.map(t=>({table:t,overlap:t.columns.filter(c=>wanted.includes(norm(c))).length})).sort((a,b)=>b.overlap-a.overlap);
   if(ranked.length>1&&ranked[0].overlap===wanted.length&&ranked[1].overlap===wanted.length)unknown.push('同一章节有多个同表头表格，具体归属待确认：'+table.locator);
   const selected=ranked[0]?.table,missing=table.columns.filter(c=>!selected?.columns.some(a=>norm(a)===norm(c)));
   if(missing.length){if(!selected&&owner&&omitted(owner.body))unknown.push('表格待确认或不适用：'+table.locator);else failures.push((owner?owner.title+'：':'')+'缺少模板表格列：'+missing.join('、'));}
  }
 }
 const reason=failures.length?failures.join('；'):unknown.length?'已识别的模板结构满足检查；仍有未确认覆盖：'+[...new Set(unknown)].join('；'):'已识别模板章节与表头结构满足检查；业务含义仍未验证';
 return{status:failures.length?'failed':unknown.length?'unverified':'passed',reason,evidence:[{kind:'text_observation',targetHash,checkerVersion:PRD_TEMPLATE_STRUCTURE_VERSION,observed:JSON.stringify({missing:failures,coverageUnknown:[...new Set(unknown)],sections:template.sections.length,tables:template.tables.length}),locator:template.source.path}]};
}
