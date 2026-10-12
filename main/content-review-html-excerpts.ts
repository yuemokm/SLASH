// Offline selection candidate only. These are original UTF16 ranges, never
// executed HTML, normalized DOM, generated summaries or security validation.
type Range={start:number;end:number};
type Unit=Range&{anchor:number;score:number};
export function htmlRequestTerms(text:string){const result=new Set<string>();for(const token of text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}|[\p{Script=Han}]{2,}/gu)??[]){if(/^[a-z]/.test(token))result.add(token);else for(let i=0;i+2<=token.length&&result.size<256;i++)result.add(token.slice(i,i+2));if(result.size>=256)break;}return result;}
const intersects=(a:Range,b:Range)=>a.start<b.end&&b.start<a.end;
const size=(ranges:Range[])=>ranges.reduce((n,r)=>n+r.end-r.start,0);
function merge(ranges:Range[]){const result:Range[]=[];for(const r of [...ranges].sort((a,b)=>a.start-b.start)){const prev=result.at(-1);if(prev&&prev.end>=r.start)prev.end=Math.max(prev.end,r.end);else result.push({...r});}return result;}
function score(text:string,relevance:Set<string>){const lower=text.toLowerCase();let value=0;for(const term of relevance)if(lower.includes(term))value++;return value;}
function pick(units:Unit[],budget:number,slots:number,complete=false){let selected:Range[]=[];for(const unit of units.sort((a,b)=>b.score-a.score||a.start-b.start)){const left=budget-size(selected);if(left<=0)break;if(complete&&unit.end-unit.start>left)continue;const length=Math.min(unit.end-unit.start,left),start=Math.max(unit.start,Math.min(unit.anchor-Math.floor(length/2),unit.end-length)),next=merge([...selected,{start,end:start+length}]);if(next.length>slots||size(next)>budget)continue;selected=next;}return selected;}
function staticRegions(text:string){
 const masked=text.replace(/<!--[\s\S]*?-->/g,value=>value.replace(/[^\r\n]/g,' '));
 let regionStarts=0;for(const _ of masked.matchAll(/<(?:script|style)\b/gi)){if(++regionStarts>100)return {masked,scripts:[] as Range[],styles:[] as Range[],markup:[] as Range[],limitations:['STRUCTURE_REGION_LIMIT']};}
 const scripts:Range[]=[],styles:Range[]=[];const limitations:string[]=[];
 // Mirrors the bounded static region extraction already used in html-script-bindings.
 // External scripts remain unavailable: selecting their tag does not read a URL.
 for(const m of masked.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)){const start=m.index!,range={start,end:start+m[0].length};(m[1].toLowerCase()==='script'?scripts:styles).push(range);if(m[1].toLowerCase()==='script'&&/\bsrc\s*=/i.test(m[2]))limitations.push('EXTERNAL_SCRIPT_NOT_READ');}
 for(const m of masked.matchAll(/<(script|style)\b[^>]*>/gi))if(![...scripts,...styles].some(r=>r.start<=m.index!&&r.end>m.index!)){(m[1].toLowerCase()==='script'?scripts:styles).push({start:m.index!,end:text.length});limitations.push('UNTERMINATED_SCRIPT_OR_STYLE');}
 const excluded=merge([...scripts,...styles]),markup:Range[]=[];let previous=0;for(const r of excluded){if(r.start>previous)markup.push({start:previous,end:r.start});previous=Math.max(previous,r.end);}if(previous<text.length)markup.push({start:previous,end:text.length});
 return{masked,scripts,styles,markup,limitations};
}

/** Literal candidate hints only: no JS, DOM execution, entity guessing or field equivalence. */
export function conditionalHtmlFieldLabels(text:string){
 const {masked,markup,limitations}=staticRegions(text),labels:string[]=[];let visited=0;
 for(const region of markup)for(const match of masked.slice(region.start,region.end).matchAll(/<label\b[^>]*>([\s\S]*?)<\/label\s*>/gi)){
  if(++visited>128){limitations.push('CANDIDATE_LABEL_SCAN_LIMIT');return{labels,limitations:[...new Set(limitations)]};}
  const body=match[1],plain=body.replace(/<[^>]*>/g,'');
  if(!/当|若|仅|时|阶段|状态/.test(plain)||!/必填|只读|允许|禁止/.test(plain))continue;
  const literal=body.split('<',1)[0].trim().replace(/[\s*:：＊]+$/u,'');
  if(body.length>2048||literal.length<4||literal.length>80||/[&<>]/.test(literal)||/<label\b/i.test(body)){
   limitations.push('CANDIDATE_LABEL_UNSUPPORTED');continue;
  }
  if(!labels.includes(literal))labels.push(literal);
 }
 return{labels,limitations:[...new Set(limitations)]};
}

export function selectHtmlRanges(text:string,budget:number,relevance:Set<string>){
 const {masked,scripts,styles,markup,limitations}=staticRegions(text);
 if(limitations.includes('STRUCTURE_REGION_LIMIT'))return {ranges:[{start:0,end:Math.min(text.length,budget)}],limitations};
 const domUnits:Unit[]=[];for(const region of markup){const part=masked.slice(region.start,region.end);for(const m of part.matchAll(/<(?:input|select|textarea|button|summary|a)\b[^>]*>/gi)){const anchor=region.start+m.index!,start=Math.max(region.start,anchor-230),end=Math.min(region.end,anchor+m[0].length+230);domUnits.push({start,end,anchor,score:score(masked.slice(start,end),relevance)});}}
 if(!domUnits.length)for(const r of markup)if(text.slice(r.start,r.end).trim())domUnits.push({...r,anchor:r.start,score:score(text.slice(r.start,r.end),relevance)});
 const scriptSize=size(scripts),wholeScript=scriptSize>0&&scriptSize<=Math.floor(budget*.75)&&scripts.length<=4;
 let scriptSelected:Range[]=wholeScript?scripts.map(r=>({...r})):[];
 if(!wholeScript){const units:Unit[]=[];for(const region of scripts){const part=text.slice(region.start,region.end);for(const m of part.matchAll(/[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g)){const start=region.start+m.index!,end=start+m[0].length,handler=m[0].search(/\.addEventListener\s*\(|\bon(?:click|submit|change|input)\s*=/i);units.push({start,end,anchor:start+Math.max(0,handler),score:score(m[0],relevance)+(handler>=0?5:0)});}}scriptSelected=pick(units,Math.floor(budget*.5),4);}
 const cssBudget=styles.length?Math.floor(budget/9):0,domBudget=budget-size(scriptSelected)-cssBudget;
 let domSelected=pick(domUnits,domBudget,2);
 const classes=new Set<string>();for(const r of domSelected)for(const m of text.slice(r.start,r.end).matchAll(/\bclass\s*=\s*["']([^"']*)["']/gi))for(const name of m[1].split(/\s+/))if(name)classes.add(name);
 const frequency=new Map<string,number>();for(const r of markup)for(const m of masked.slice(r.start,r.end).matchAll(/\bclass\s*=\s*["']([^"']*)["']/gi))for(const name of m[1].split(/\s+/))frequency.set(name,(frequency.get(name)??0)+1);
 const cssUnits:Unit[]=[];for(const region of styles){const inner=text.slice(region.start,region.end);for(const m of inner.matchAll(/[^{}]+\{[^{}]*\}/g)){const start=region.start+m.index!,end=start+m[0].length,selector=m[0].slice(0,m[0].indexOf('{'));let match=0;for(const name of classes)if(selector.includes('.'+name))match+=3+Math.max(0,5-(frequency.get(name)??5));cssUnits.push({start,end,anchor:start,score:score(m[0],relevance)+match+(/::?(?:before|after)\b/.test(selector)?2:0)+(/\b(?:color|content|font-size|font-weight)\s*:/.test(m[0])?1:0)});}}
 let cssSelected=pick(cssUnits,cssBudget,2,true);
 let selected=merge([...scriptSelected,...domSelected,...cssSelected]);
 // Fill only unused quota inside the same selected source regions. No transfer
 // from requests/PRD or increase of the original per-document/body budget.
 for(const regions of [markup,scripts,styles])for(const region of regions){for(let i=0;i<selected.length&&size(selected)<budget;i++){const r=selected[i];if(!intersects(r,region)||r.start<region.start||r.end>region.end)continue;let left=budget-size(selected),nextStart=selected[i+1]?.start??text.length;r.end=Math.min(region.end,nextStart,r.end+left);left=budget-size(selected);r.start=Math.max(region.start,selected[i-1]?.end??0,r.start-left);selected=merge(selected);}}
 if(size(selected)<budget){for(const region of [...markup,...scripts,...styles]){if(selected.length>=8||size(selected)>=budget)break;const left=budget-size(selected),candidate={start:region.start,end:Math.min(region.end,region.start+left)},next=merge([...selected,candidate]);if(size(next)<=budget&&next.length<=8)selected=next;}}
 return {ranges:selected,limitations:[...new Set(limitations)]};
}
