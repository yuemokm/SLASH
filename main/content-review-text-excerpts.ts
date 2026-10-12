// Exact UTF16 source ranges. Heading background never grants business authority.
type Range={start:number;end:number};
type Heading=Range&{level:number};
type Unit=Range&{paragraph:number};
export type TextExcerptSelection={ranges:Range[];limitations:Array<'HEADING_BACKGROUND_PARTIAL'|'BODY_EXCERPT_LIMIT'>};
const MAX_RANGES=8;
const size=(ranges:Range[])=>ranges.reduce((n,r)=>n+r.end-r.start,0);
function merge(text:string,ranges:Range[]){
 const result:Range[]=[];
 for(const range of [...ranges].sort((a,b)=>a.start-b.start||a.end-b.end)){
  const last=result.at(-1);
  // Blank separators remain source characters, charged to the same budget.
  if(last&&(range.start<=last.end||!text.slice(last.end,range.start).trim()))last.end=Math.max(last.end,range.end);
  else result.push({...range});
 }
 return result;
}
function headings(text:string){
 const result:Heading[]=[];let fence:{marker:string;length:number}|undefined,previous:Range|undefined;
 for(const match of text.matchAll(/[^\n]*(?:\n|$)/g)){
  if(!match[0])continue;
  const start=match.index!,line=match[0].replace(/\r?\n$/,''),end=start+line.length;
  const marker=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if(fence){if(marker&&marker[1][0]===fence.marker&&marker[1].length>=fence.length&&!marker[2].trim())fence=undefined;previous=undefined;continue;}
  if(marker){fence={marker:marker[1][0],length:marker[1].length};previous=undefined;continue;}
  const atx=/^ {0,3}(#{1,6})(?:[ \t]+|$)/.exec(line);
  if(atx){result.push({start,end,level:atx[1].length});previous=undefined;continue;}
  const setext=/^ {0,3}(=+|-+)[ \t]*$/.exec(line);
  if(setext&&previous){result.push({start:previous.start,end,level:setext[1][0]==='='?1:2});previous=undefined;continue;}
  previous=line.trim()&&!/^(?: {4}|\t)/.test(line)?{start,end}:undefined;
 }
 return result;
}
export function hasTextHeadings(text:string){return headings(text).length>0;}
function units(text:string,headers:Heading[]){
 const result:Unit[]=[];let paragraph=0,headerIndex=0;
 const add=(start:number,end:number)=>{while(start<end&&/[\r\n]/.test(text[start]))start++;while(end>start&&/[\r\n]/.test(text[end-1]))end--;if(text.slice(start,end).trim())result.push({start,end,paragraph});};
 for(const match of text.matchAll(/[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g)){
  const start=match.index!,end=start+match[0].length;let cursor=start;
  while(headerIndex<headers.length&&headers[headerIndex].end<=start)headerIndex++;
  for(let index=headerIndex;index<headers.length&&headers[index].start<end;index++){const h=headers[index];add(cursor,Math.min(end,h.start));cursor=Math.max(cursor,h.end);}
  add(cursor,end);paragraph++;
 }
 return result;
}
function headingBackground(headers:Heading[]){
 const parents=new Map<Heading,Heading|undefined>(),boundaries=new Map<Heading,Heading|undefined>(),stack:Heading[]=[],future:Array<Heading|undefined>=[];
 for(const h of headers){while(stack.length&&stack.at(-1)!.level>=h.level)stack.pop();parents.set(h,stack.at(-1));stack.push(h);}
 for(const h of [...headers].reverse()){let next:Heading|undefined;for(let level=1;level<=h.level;level++)if(future[level]&&(!next||future[level]!.start<next.start))next=future[level];boundaries.set(h,next);future[h.level]=h;}
 return(unit:Range)=>{
  let low=0,high=headers.length;while(low<high){const mid=(low+high)>>>1;if(headers[mid].start<unit.start)low=mid+1;else high=mid;}
  const nearest=headers[low-1],background:Heading[]=[];
  // Closest owner first when all ancestors cannot fit; missing ancestors are explicit.
  for(let h:Heading|undefined=nearest;h;h=parents.get(h))background.push(h);
  const boundary=nearest&&boundaries.get(nearest);if(boundary)background.push(boundary);return background;
 };
}
/** A scored long paragraph must not lose the literal match by always taking its
 * prefix. Keep preceding source context in the same budget; no summary is made. */
function windowStart(part:Range,length:number,anchor:number|undefined){
 if(anchor===undefined||anchor<part.start+length)return part.start;
 return Math.max(part.start,anchor-Math.min(128,Math.floor(length/4)));
}
function originalOffset(text:string,lowerOffset:number){
 let source=0,lower=0;
 for(const character of text){const length=character.toLowerCase().length;if(lower+length>lowerOffset)return source;source+=character.length;lower+=length;}
 return source;
}
/** Same document character budget and eight merged excerpts. Heading-free text
 * retains the old paragraph/neighbor selection. Reserve body before background. */
export function selectTextRanges(text:string,budget:number,relevance:Set<string>):TextExcerptSelection{
 if(!Number.isInteger(budget)||budget<1)throw Error('CONTENT_REVIEW_TEXT_BUDGET');
 if(text.length<=budget)return{ranges:text.length?[{start:0,end:text.length}]:[],limitations:[]};
 const headers=headings(text),body=units(text,headers),scored=body.map((part,index)=>{const original=text.slice(part.start,part.end),lower=original.toLowerCase();let score=0,anchor:number|undefined;for(const term of relevance){if(!term)continue;const offset=lower.indexOf(term);if(offset>=0){score++;anchor=Math.min(anchor??Infinity,offset);}}if(anchor!==undefined)anchor=part.start+(lower.length===original.length?anchor:originalOffset(original,anchor));return{part,index,score,anchor};}).sort((a,b)=>b.score-a.score||a.index-b.index);
 const anchors=new Map(scored.map(item=>[item.index,item.anchor]));
 let ranges:Range[]=[];const selected=new Set<number>(),limitations=new Set<TextExcerptSelection['limitations'][number]>(),neededHeaders=new Set<Heading>();
 if(!body.length){const h=[...headers].sort((a,b)=>{const score=(r:Range)=>[...relevance].filter(term=>text.slice(r.start,r.end).toLowerCase().includes(term)).length;return score(b)-score(a)||a.start-b.start;})[0];return{ranges:h?[{start:h.start,end:h.start+Math.min(h.end-h.start,budget)}]:[],limitations:['BODY_EXCERPT_LIMIT']};}
 if(!headers.length){
  let used=0;const legacy:Range[]=[];
  for(const item of scored){if(used>=budget||legacy.length>=MAX_RANGES)break;for(const index of [item.index,item.index-1,item.index+1]){const part=body[index];if(!part||selected.has(index))continue;if(legacy.length>=MAX_RANGES)break;const length=Math.min(budget-used,part.end-part.start);if(length<=0)break;const start=windowStart(part,length,anchors.get(index)),end=Math.min(part.end,start+length);legacy.push({start,end});if(start>part.start)limitations.add('BODY_EXCERPT_LIMIT');selected.add(index);used+=end-start;}}
  const merged=merge(text,legacy);return{ranges:size(merged)<=budget?merged:legacy.sort((a,b)=>a.start-b.start),limitations:[...limitations]};
 }
 const background=headingBackground(headers),neighbors=new Map<number,number[]>();body.forEach((part,index)=>neighbors.set(part.paragraph,[...(neighbors.get(part.paragraph)??[]),index]));
 const fits=(next:Range[])=>next.length<=MAX_RANGES&&size(next)<=budget;
 const pick=(index:number)=>{
  const part=body[index];if(!part||selected.has(index))return;
  const left=budget-size(ranges);if(left<=0)return;
  const reserveLength=Math.min(part.end-part.start,Math.max(1,Math.ceil(left/2))),start=windowStart(part,reserveLength,anchors.get(index)),reserveEnd=Math.min(part.end,start+reserveLength),reserve={start,end:reserveEnd};
  if(!fits(merge(text,[...ranges,reserve]))){limitations.add('BODY_EXCERPT_LIMIT');return;}
  let proposed=ranges;
  for(const h of background(part)){neededHeaders.add(h);const withHeading=merge(text,[...proposed,{start:h.start,end:h.end}]);if(fits(merge(text,[...withHeading,reserve])))proposed=withHeading;}
  let low=reserveEnd,high=part.end;
  while(low<high){const mid=Math.ceil((low+high)/2);if(fits(merge(text,[...proposed,{start,end:mid}])))low=mid;else high=mid-1;}
  ranges=merge(text,[...proposed,{start,end:low}]);selected.add(index);if(start>part.start||low<part.end)limitations.add('BODY_EXCERPT_LIMIT');
 };
 for(const item of scored){
  if(size(ranges)>=budget)break;pick(item.index);
  // Do not jump over a standalone heading into the next section as a neighbor.
  for(const paragraph of [item.part.paragraph-1,item.part.paragraph+1])for(const index of neighbors.get(paragraph)??[])pick(index);
 }
 if([...neededHeaders].some(h=>!ranges.some(r=>r.start<=h.start&&r.end>=h.end)))limitations.add('HEADING_BACKGROUND_PARTIAL');
 return{ranges,limitations:[...limitations]};
}
