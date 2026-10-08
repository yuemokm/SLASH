import {z} from 'zod';

export const CORE_TOOL_NAMES=[
 'read_file','read_image','search_files','locate_spreadsheet','read_spreadsheet_field_evidence',
 'read_draft','edit_draft','write_draft','list_skills','load_skill','read_workspace_rules',
 'list_artifact_versions','get_task_acceptance','check_task_acceptance','copy_for_processing',
 'process_processing_copy','read_web_page',
] as const;
export const TOOL_GROUPS={
 task_acceptance:['define_task_acceptance'],
 prototype:['define_prototype_acceptance','get_prototype_acceptance','run_prototype_acceptance','read_prototype_screenshot'],
 business_rules:['record_business_constraints','bind_business_implementation','check_business_rules'],
 product_records:['list_product_records','record_requirement','update_requirement_evidence','transition_requirement','register_artifact','link_artifacts','query_artifact_impact','create_artifact_review','add_review_issue','transition_review_issue','complete_artifact_review','create_design_package','update_design_package','upsert_knowledge'],
 templates:['update_template_structure','template_register','template_link','template_migration_preview','template_migration_draft','check_flow'],
 workspace_maintenance:['draft_workspace_rules','restore_artifact_version'],
 connections:['list_connections','discover_connections','inspect_connection','configure_connection','propose_external_action'],
 execution:['run_process','powershell'],
 skill_install:['install_skill'],
} as const;
export type ToolGroup=keyof typeof TOOL_GROUPS;
export const TOOL_GROUP_NAMES=Object.keys(TOOL_GROUPS) as ToolGroup[];
export const loadToolGroupSchema=z.object({group:z.enum(TOOL_GROUP_NAMES as [ToolGroup,...ToolGroup[]])}).strict();
const purposes:Record<ToolGroup,string>={task_acceptance:'起草任务验收',prototype:'原型用例/执行/截图',business_rules:'业务约束/落实/检查',product_records:'需求/成果/评审/知识记录',templates:'模板/迁移/流程检查',workspace_maintenance:'规则草稿/历史恢复',connections:'连接/外部操作提案',execution:'进程/命令',skill_install:'安装全局技能'};
export const TOOL_CATALOG_PROMPT='# 按需工具\n常用读写、技能、搜索与任务摘要已启用。其余能力先调用 load_tool_group({group})；等回执后的下一轮再调用该组工具，同一次响应提前调用会失败。加载只改变本Run工具可见性，不提升权限，不执行组内操作。\n'+TOOL_GROUP_NAMES.map(group=>`${group}（${purposes[group]}）：${TOOL_GROUPS[group].join(',')}`).join('\n');

/** Runtime-local visibility only. No persisted loadout or arbitrary tool names. */
export function createToolLoadout(registeredNames:()=>string[],activate:(names:string[])=>void){
 const mapped=[...CORE_TOOL_NAMES,...Object.values(TOOL_GROUPS).flat()];
 const verify=()=>{const list=registeredNames(),names=new Set(list);if(mapped.length!==55||new Set(mapped).size!==55||list.length!==names.size||names.size!==56||!names.has('load_tool_group')||mapped.some(name=>!names.has(name)))throw Error('TOOL_CATALOG_REGISTRY_MISMATCH');};
 verify();
 const loaded=new Set<ToolGroup>();
 const selected=(groups:Set<ToolGroup>)=>[...CORE_TOOL_NAMES,'load_tool_group',...TOOL_GROUP_NAMES.filter(group=>groups.has(group)).flatMap(group=>[...TOOL_GROUPS[group]])];
 const activeNames=()=>selected(loaded);
 const apply=()=>{verify();activate(activeNames());};
 return{apply,activeNames,load(input:unknown){const {group}=loadToolGroupSchema.parse(input),already=loaded.has(group);verify();const next=new Set(loaded);next.add(group);try{activate(selected(next));}catch(error){activate(activeNames());throw error;}loaded.add(group);return{group,status:already?'already_loaded':'loaded',tools:[...TOOL_GROUPS[group]],effective:'next_turn',notice:'等本调用回执后的下一轮再调用新工具；权限、预算和宿主检查仍按原规则执行。'};}};
}
