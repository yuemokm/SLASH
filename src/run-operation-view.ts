import type {RunCheckpoint} from '../shared/types';

type Operation=RunCheckpoint['completedOperations'][number];
export type RunOperationView={id:string;state:'done'|'failed'|'cancelled';text:string};
const successLabels:Record<string,string>={write_draft:'已生成修改草稿',read_file:'已读取文件',search_files:'已检索授权资料',apply_change:'已应用修改',check_quality:'已执行成果检查',quality_check:'已执行成果检查'};
const object=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;

function draftFailure(operation:Operation):string{
 const title=operation.tool==='edit_draft'?'修改草稿':'读取草稿',raw=operation.result??'';
 if(operation.state==='cancelled')return `${title}已取消`;
 // Only recognised codes and bounded integer metadata are used. Never render
 // error JSON, source text, target paths, Zod messages or unknown errors.
 try{
  const value=object(JSON.parse(raw));
  if(value?.code==='DRAFT_INPUT_INVALID'||value?.code==='TOOL_BUDGET_EXCEEDED'){
   if(value.code==='TOOL_BUDGET_EXCEEDED')return `${title}未执行：本轮工具调用次数已用尽`;
   const validation=object(value.validation),reason=validation?.reason;
   return `${title}参数被拒绝：${reason==='missing_replacement'?'缺少要替换的原文或新内容':reason==='mixed_replacement'?'单项修改与批量修改同时提供':'参数格式不正确'}`;
  }
 }catch{/* A native match failure is an error code followed by JSON. */}
 const match=/^(?:Error: )?(DRAFT_MATCH_NOT_FOUND|DRAFT_MATCH_AMBIGUOUS):\s*(\{.*\})$/s.exec(raw);
 if(match){
  let item='';try{const value=object(JSON.parse(match[2])),index=value?.failedEditIndex,total=value?.totalEdits;if(Number.isInteger(index)&&Number.isInteger(total)&&Number(index)>=0&&Number(total)>=1&&Number(total)<=30&&Number(index)<Number(total))item=`第 ${Number(index)+1} 项修改`; }catch{}
  return `${title}未完成：${item}${match[1]==='DRAFT_MATCH_NOT_FOUND'?'未找到匹配原文':'原文匹配多处'}；本次未改动草稿，请重新读取后缩小修改范围`;
 }
 return `${title}未完成：操作失败，请查看任务状态后重试`;
}

export function runOperationViews(operations:readonly Operation[]):RunOperationView[]{
 return operations.flatMap<RunOperationView>(operation=>{
  if(['succeeded','applied','completed'].includes(operation.state)&&operation.tool!=='read_workflow_sources')return[{id:operation.id,state:'done' as const,text:successLabels[operation.tool]||`已执行工具：${operation.tool}`}];
  if(['read_draft','edit_draft'].includes(operation.tool)&&['failed','cancelled'].includes(operation.state))return[{id:operation.id,state:operation.state as 'failed'|'cancelled',text:draftFailure(operation)}];
  return[];
 });
}
