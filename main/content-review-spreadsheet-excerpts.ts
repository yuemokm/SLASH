// Selection only: retain exact UTF16 source ranges, never reconstruct a table
// or infer a rule from worksheet names, cell addresses or missing values.
import {conditionalHtmlFieldLabels} from './content-review-html-excerpts.js';
type Range={start:number;end:number};
type Cell=Range&{address:string;row:number;column:number;value?:string};
type Row=Range&{row:number;cells:Cell[]};
type Merge=Range&{firstRow:number;lastRow:number;firstColumn:number;lastColumn:number;master:string};
type Sheet=Range&{name:string;titleEnd:number;rows:Row[];merges:Merge[];malformedMerge:boolean};
type Candidate={sheet:string;fieldAddress:string;ranges:Range[];merged:boolean};
export type SpreadsheetFieldCandidatePlan={candidates:Candidate[];limitations:string[]};
const columnNumber=(letters:string)=>[...letters].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
const normalize=(text:string)=>text.toLowerCase().replace(/\s+/g,'');
const size=(ranges:Range[])=>ranges.reduce((n,r)=>n+r.end-r.start,0);
function merge(ranges:Range[]){const result:Range[]=[];for(const range of [...ranges].sort((a,b)=>a.start-b.start)){const last=result.at(-1);if(last&&last.end>=range.start)last.end=Math.max(last.end,range.end);else result.push({...range});}return result;}
function score(text:string,relevance:Set<string>){let value=0;const lower=text.toLowerCase();for(const term of relevance)if(lower.includes(term))value++;return value;}
export function isSpreadsheetExtract(text:string){return /^\uFEFF?\[XLSX 单元格值提取[^\n]*\]/.test(text)&&/^工作表:/m.test(text);}
function sheets(text:string){
 // Every worksheet marker is a boundary, including hidden or malformed ones.
 // Untrusted malformed JSON cannot annex its cells to the preceding sheet.
 const found=[...text.matchAll(/^工作表:[^\r\n]*/gm)],result:Sheet[]=[],limitations:string[]=[];
 for(const [index,match] of found.entries()){const start=match.index!,end=found[index+1]?.index??text.length,rows:Row[]=[],merges:Merge[]=[];let malformedMerge=false;
  const title=/^工作表: ("(?:\\.|[^"\\])*")(?: \[(?:隐藏工作表|深度隐藏工作表)\])?$/.exec(match[0]);let name:string;
  try{if(!title)throw Error();name=JSON.parse(title[1]) as string;if(!name.trim())throw Error();}catch{limitations.push('MALFORMED_SHEET_HEADER');continue;}
  for(const cell of text.slice(start,end).matchAll(/^([A-Z]{1,3})([1-9][0-9]{0,6})(?: \[(?:隐藏行|隐藏列)(?:、(?:隐藏行|隐藏列))*\])?:[^\n]*(?:\n|$)/gm)){const position=start+cell.index!,record:Cell={address:cell[1]+cell[2],row:Number(cell[2]),column:columnNumber(cell[1]),start:position,end:position+cell[0].length},previous=rows.at(-1),literal=/: ("(?:\\.|[^"\\])*")/.exec(cell[0]);try{if(literal)record.value=(JSON.parse(literal[1]) as string).replace(/^文本: /,'');}catch{/* An untrusted cell stays an opaque original range. */}if(previous&&previous.row===record.row){previous.end=record.end;previous.cells.push(record);}else rows.push({row:record.row,start:record.start,end:record.end,cells:[record]});}
  for(const line of text.slice(start,end).matchAll(/^合并区域:[^\r\n]*(?:\r?\n|$)/gm)){const span=/^合并区域: ([A-Z]{1,3})([1-9][0-9]{0,6}):([A-Z]{1,3})([1-9][0-9]{0,6})\s*$/.exec(line[0]);if(!span){malformedMerge=true;continue;}const firstColumn=columnNumber(span[1]),lastColumn=columnNumber(span[3]),firstRow=Number(span[2]),lastRow=Number(span[4]);if(firstColumn>lastColumn||firstRow>lastRow||lastColumn>16384||lastRow>1048576){malformedMerge=true;continue;}merges.push({start:start+line.index!,end:start+line.index!+line[0].length,firstRow,lastRow,firstColumn,lastColumn,master:span[1]+span[2]});}
  result.push({start,end,name,titleEnd:start+match[0].length,rows,merges,malformedMerge});
 }
 return{sheets:result,limitations};
}
const headerRange=(sheet:Sheet):Range=>({start:sheet.start,end:sheet.rows[0]?.row===1?sheet.rows[0].end:sheet.rows[0]?.start??sheet.titleEnd});
function candidateQueues(parsed:ReturnType<typeof sheets>,labels:string[],limitations:Set<string>){
 const queues:Candidate[][]=[];
 for(const sheet of parsed.sheets){
  const header=sheet.rows.find(row=>row.row<=10&&row.cells.some(cell=>cell.value==='字段名称'));
  if(!header){limitations.add('CANDIDATE_HEADERS_UNSUPPORTED');continue;}
  const fieldColumn=header.cells.find(cell=>cell.value==='字段名称')!.column,conditionColumns=header.cells.filter(cell=>cell.value==='必填'||cell.value==='字段规则').map(cell=>cell.column);
  if(!conditionColumns.length){limitations.add('CANDIDATE_HEADERS_UNSUPPORTED');continue;}
  const queue:Candidate[]=[],byAddress=new Map(sheet.rows.flatMap(row=>row.cells).map(cell=>[cell.address,cell]));
  for(const row of sheet.rows){const field=row.cells.find(cell=>cell.column===fieldColumn);if(row.row<=header.row||!field?.value||!labels.some(label=>field.value!.includes(label)))continue;
   if(sheet.malformedMerge){limitations.add('CANDIDATE_MERGE_UNSUPPORTED');continue;}
   let firstRow=row.row,lastRow=row.row;const affected=new Set<Merge>();let changed=true;
   while(changed){changed=false;for(const span of sheet.merges)if(span.firstRow<=lastRow&&span.lastRow>=firstRow&&[fieldColumn,...conditionColumns].some(column=>column>=span.firstColumn&&column<=span.lastColumn)){
    affected.add(span);const first=Math.min(firstRow,span.firstRow),last=Math.max(lastRow,span.lastRow);if(first!==firstRow||last!==lastRow){firstRow=first;lastRow=last;changed=true;}
   }if(lastRow-firstRow>=64)break;}
   if(lastRow-firstRow>=64||[...affected].some(span=>!byAddress.has(span.master))){limitations.add('CANDIDATE_MERGE_CONTEXT_INCOMPLETE');continue;}
   // A whole affected row region and header/merge declarations travel together.
   // This is quoted context, never a per-field assignment of a shared rule.
   const rows=sheet.rows.filter(item=>item.row>=firstRow&&item.row<=lastRow),columns=[fieldColumn,...conditionColumns];
   if(!rows.length||!conditionColumns.every(column=>row.cells.some(cell=>cell.column===column)||[...affected].some(span=>row.row>=span.firstRow&&row.row<=span.lastRow&&column>=span.firstColumn&&column<=span.lastColumn))){limitations.add('CANDIDATE_CONDITION_UNAVAILABLE');continue;}
   const head={start:sheet.start,end:Math.max(header.end,headerRange(sheet).end)},ranges=merge([head,{start:rows[0].start,end:rows.at(-1)!.end},...[...affected].map(span=>({start:span.start,end:span.end}))]);
   // All involved field/condition columns must have original header cells.
   if(!columns.every(column=>header.cells.some(cell=>cell.column===column))){limitations.add('CANDIDATE_HEADERS_UNSUPPORTED');continue;}
   if(queue.length<16)queue.push({sheet:sheet.name,fieldAddress:field.address,ranges,merged:affected.size>0});else limitations.add('CANDIDATE_SELECTION_LIMIT');
  }
  if(queue.length)queues.push(queue);
 }
 return queues;
}

/** One snapshot-wide plan, shared by every source and selection expansion. */
export function planSpreadsheetFieldCandidates(sources:Array<{id:string;text:string}>,artifacts:Array<{text:string;path?:string;locator?:string}>){
 const labelQueues=artifacts.filter(doc=>/\.html?$/i.test(doc.path??doc.locator??'')).map(doc=>conditionalHtmlFieldLabels(doc.text)),labels:string[]=[],globalLimits=new Set(labelQueues.flatMap(item=>item.limitations));
 for(let index=0;labelQueues.some(item=>item.labels.length>index);index++)for(const item of labelQueues){const label=item.labels[index];if(!label||labels.includes(label))continue;if(labels.length<8)labels.push(label);else globalLimits.add('CANDIDATE_LABEL_LIMIT');}
 const plans=new Map<string,SpreadsheetFieldCandidatePlan>();if(!labels.length&&!globalLimits.size)return plans;
 const entries=sources.filter(doc=>isSpreadsheetExtract(doc.text)).map(doc=>{const parsed=sheets(doc.text),limitations=new Set([...parsed.limitations,...globalLimits]),queues=labels.length?candidateQueues(parsed,labels,limitations):[];const plan:SpreadsheetFieldCandidatePlan={candidates:[],limitations:[]};plans.set(doc.id,plan);return{plan,queues,limitations,turn:0};});
 let count=0,progress=true;while(progress&&count<16){progress=false;for(const entry of entries){if(count>=16)break;const available=entry.queues.filter(queue=>queue.length);if(!available.length)continue;const candidate=available[entry.turn++%available.length].shift()!;entry.plan.candidates.push(candidate);count++;progress=true;}}
 for(const entry of entries){if(entry.queues.some(queue=>queue.length))entry.limitations.add('CANDIDATE_SELECTION_LIMIT');entry.plan.limitations=[...entry.limitations];}
 return plans;
}
function requestedCells(request:string){const result=new Set<string>();for(const match of request.matchAll(/\b([A-Z]{1,3})([1-9][0-9]{0,6})(?::([A-Z]{1,3})([1-9][0-9]{0,6}))?\b/g)){
 // A project folder such as ABC12/PRD.md is not a requested cell. Slash
 // notation like F1/F5:F8 still denotes individual cell/range candidates.
 if(/^[\\/](?![A-Z]{1,3}[1-9][0-9]{0,6}\b)/.test(request.slice(match.index!+match[0].length)))continue;
 const first=Number(match[2]),last=match[4]?Number(match[4]):first;if(last<first||last-first>200||match[3]&&match[3]!==match[1])continue;for(let row=first;row<=last&&result.size<1024;row++)result.add(match[1]+row);
 }return result;}
function selectPrimaryRanges(text:string,budget:number,relevance:Set<string>,requestText:string,artifactText:string,requestRelevance:Set<string>){
 const parsed=sheets(text),all=parsed.sheets,request=normalize(requestText),artifact=normalize(artifactText),cells=requestedCells(requestText),limitations=new Set(parsed.limitations);
 const named=(body:string)=>all.filter(sheet=>{const name=normalize(sheet.name);let start=body.indexOf(name);while(start>=0){const before=body[start-1]??'',after=body[start+name.length]??'';if(!(/[a-z0-9]/.test(name[0])&&/[a-z0-9]/.test(before))&&!(/[a-z0-9]/.test(name.at(-1)!)&&/[a-z0-9]/.test(after)))return true;start=body.indexOf(name,start+1);}return false;});
 const requested=named(request),mentioned=named(artifact),candidates=requested.length?[...requested,...mentioned.filter(sheet=>!requested.includes(sheet))]:all;
 // Explicit worksheet names outrank repeated field words in another worksheet.
 // A report is the object being reviewed, not authority to exclude other sheets.
 // Prioritize the independent request's title/body relevance before report words;
 // ambiguous scopes keep bounded same-source candidates and coverage limitations.
 const ordered=candidates.map(sheet=>({sheet,titleScore:score(normalize(sheet.name),requestRelevance),requestScore:score(text.slice(sheet.start,sheet.end),requestRelevance),score:score(text.slice(sheet.start,sheet.end),relevance)})).sort((a,b)=>Number(requested.includes(b.sheet))-Number(requested.includes(a.sheet))||b.titleScore-a.titleScore||b.requestScore-a.requestScore||b.score-a.score||a.sheet.start-b.sheet.start).map(item=>item.sheet);
 if(ordered.length>8)limitations.add('SHEET_SELECTION_LIMIT');
 const selectedSheets=ordered.slice(0,8);let remaining=budget;const ranges:Range[]=[];
 for(let index=0;index<selectedSheets.length;index++){
  const sheet=selectedSheets[index],quota=Math.floor(remaining/(selectedSheets.length-index)),slots=Math.max(1,Math.floor((8-ranges.length)/(selectedSheets.length-index)));let selected:Range[]=[];
  const add=(range:Range)=>{const next=merge([...selected,range]);if(size(next)>quota||next.length>slots)return false;selected=next;return true;};
  const headerEnd=sheet.rows[0]?.row===1?sheet.rows[0].end:sheet.rows[0]?.start??sheet.titleEnd;
  if(!add({start:sheet.start,end:headerEnd})){
   if(!add({start:sheet.start,end:sheet.titleEnd})){limitations.add('SHEET_HEADER_NOT_INCLUDED');continue;}
   limitations.add('SHEET_HEADER_PARTIAL');
  }
  const targetRows=new Set([...cells].map(address=>Number(address.match(/[0-9]+$/)![0])));
  const ranked=sheet.rows.map(row=>({row,score:score(text.slice(row.start,row.end),relevance)})).sort((a,b)=>Number(targetRows.has(b.row.row))-Number(targetRows.has(a.row.row))||b.score-a.score||a.row.start-b.row.start).map(item=>item.row);
  for(const row of ranked){if(add(row))continue;
   // A very long cell must not hide later requested cells in the same row.
   const wanted=row.cells.filter(cell=>cells.has(cell.address)).sort((a,b)=>(a.end-a.start)-(b.end-b.start)||a.start-b.start);
   for(const cell of wanted)if(!add(cell)){const left=quota-size(selected);if(left>0&&add({start:cell.start,end:cell.start+Math.min(left,cell.end-cell.start)}))limitations.add('CELL_TEXT_TRUNCATED');}
  }
  // Revisit gaps after neighbouring rows have joined existing ranges. This
  // spends unused quota within this worksheet rather than growing only the
  // first excerpt or leaking into the next worksheet.
  for(let pass=0;pass<8;pass++){const before=size(selected);for(const row of ranked)add(row);if(size(selected)===before)break;}
  const actualCells=sheet.rows.flatMap(row=>row.cells),expected=actualCells.filter(cell=>cells.has(cell.address));
  if(!actualCells.some(cell=>selected.some(range=>range.start<=cell.start&&range.end>=cell.end)))limitations.add('SHEET_CELLS_NOT_INCLUDED');
  if(expected.some(cell=>!selected.some(range=>range.start<=cell.start&&range.end>=cell.end)))limitations.add('TARGET_CELLS_NOT_INCLUDED');
  ranges.push(...selected);remaining-=size(selected);
 }
 return{ranges:merge(ranges),limitations:[...limitations]};
}

export function selectSpreadsheetRanges(text:string,budget:number,relevance:Set<string>,requestText:string,artifactText:string,plan?:SpreadsheetFieldCandidatePlan,requestRelevance=relevance){
 const baseline=selectPrimaryRanges(text,budget,relevance,requestText,artifactText,requestRelevance),limitations=new Set([...baseline.limitations,...plan?.limitations??[]]);
 if(!plan?.candidates.length)return{...baseline,limitations:[...limitations]};
 const parsed=sheets(text),cells=requestedCells(requestText),maximum=Math.min(budget,size(baseline.ranges)),candidateMaximum=Math.min(4096,Math.floor(maximum/4));
 const covered=(range:Range)=>baseline.ranges.some(part=>part.start<=range.start&&part.end>=range.end);
 let selected:Range[]=[];
 // Preserve explicit cells and the strongest already-selected request rows.
 // Business wording without coordinates still protects its principal rule.
 for(const sheet of parsed.sheets){if(!baseline.ranges.some(part=>part.start<sheet.end&&part.end>sheet.start))continue;
  const header=headerRange(sheet);if(covered(header))selected.push(header);
  for(const row of sheet.rows){if(row.cells.some(cell=>cells.has(cell.address))&&covered(row)){selected.push({start:row.start,end:row.end});continue;}for(const cell of row.cells)if(cells.has(cell.address))for(const part of baseline.ranges){const start=Math.max(part.start,cell.start),end=Math.min(part.end,cell.end);if(end>start)selected.push({start,end});}}
  const ranked=sheet.rows.filter(row=>row.row>1&&covered(row)).map(row=>({row,score:score(text.slice(row.start,row.end),requestRelevance)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.row.start-b.row.start);
  selected.push(...ranked.slice(0,2).map(item=>({start:item.row.start,end:item.row.end})));
 }
 selected=merge(selected);
 if(size(selected)>maximum||selected.length>8){limitations.add('CANDIDATE_CONTEXT_NOT_INCLUDED');return{...baseline,limitations:[...limitations]};}
 let candidateRanges:Range[]=[];const accepted:Candidate[]=[];
 for(const candidate of plan.candidates){const proposed=merge([...selected,...candidate.ranges]),candidateProposed=merge([...candidateRanges,...candidate.ranges]);
  if(size(candidateProposed)>candidateMaximum||size(proposed)>maximum||proposed.length>8){limitations.add('CANDIDATE_CONTEXT_NOT_INCLUDED');continue;}
  selected=proposed;candidateRanges=candidateProposed;accepted.push(candidate);
  if(candidate.merged)limitations.add('CANDIDATE_MERGED_CONDITION_AMBIGUOUS');
 }
 if(!accepted.length)return{...baseline,limitations:[...limitations]};
 limitations.add('CANDIDATE_CONTEXT_ONLY_NOT_FIELD_EVIDENCE');
 const add=(range:Range)=>{const proposed=merge([...selected,range]);if(size(proposed)>maximum||proposed.length>8)return false;selected=proposed;return true;};
 // Fill original primary context only with whole original blocks/cells. Never
 // truncate a supplemental candidate or grow into an unrelated worksheet.
 for(const range of baseline.ranges)add(range);
 const rows=parsed.sheets.flatMap(sheet=>sheet.rows).filter(covered).sort((a,b)=>score(text.slice(b.start,b.end),relevance)-score(text.slice(a.start,a.end),relevance)||a.start-b.start);
 for(let pass=0;pass<8;pass++){const before=size(selected);for(const row of rows)add(row);if(size(selected)===before)break;}
 return{ranges:merge(selected),limitations:[...limitations]};
}
