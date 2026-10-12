import {z} from 'zod';
import type {ToolDefinition} from '@earendil-works/pi-coding-agent';

// Host-only contract. Tool outputs and model arguments cannot change it.
export const toolExecutionPolicySchema=z.object({
 executionMode:z.enum(['parallel','sequential']),
 effect:z.enum(['read','draft','record','validation','connection','process','memory','runtime']),
}).strict();
export type ToolExecutionPolicy=z.infer<typeof toolExecutionPolicySchema>;
const groups:Record<ToolExecutionPolicy['effect'],readonly string[]>={
 read:['read_file','read_image','search_files','locate_spreadsheet','read_spreadsheet_field_evidence','read_draft','list_skills','load_skill','read_workspace_rules','list_artifact_versions','get_task_acceptance','read_web_page','get_prototype_acceptance','read_prototype_screenshot','check_business_rules','list_product_records','query_artifact_impact','list_connections','web_search','fetch_content','get_search_content','source_check','delegate_readonly','check_draft_code','memory_read'],
 draft:['write_draft','edit_draft','draft_test_cases','update_template_structure','template_register','template_link','template_migration_draft','draft_workspace_rules','check_flow','restore_artifact_version','upsert_knowledge','copy_for_processing','process_processing_copy'],
 record:['define_task_acceptance','define_prototype_acceptance','record_business_constraints','bind_business_implementation','record_requirement','update_requirement_evidence','transition_requirement','register_artifact','link_artifacts','create_artifact_review','add_review_issue','transition_review_issue','complete_artifact_review','create_design_package','update_design_package'],
 validation:['check_task_acceptance','run_prototype_acceptance'],
 connection:['discover_connections','inspect_connection','configure_connection','propose_external_action'],
 process:['run_process','powershell','install_skill'],
 memory:['memory_write','memory_forget','memory_restore'],
 runtime:['load_tool_group','template_migration_preview','review_plan'],
};
export const TOOL_EXECUTION_POLICIES:Readonly<Record<string,ToolExecutionPolicy>>=Object.freeze(Object.fromEntries(
 Object.entries(groups).flatMap(([effect,names])=>names.map(name=>[name,Object.freeze(toolExecutionPolicySchema.parse({effect,executionMode:effect==='read'?'parallel':'sequential'}))])),
));
// Preserve the actual tool object (notably the controlled PowerShell identity).
// Pi 0.86.1 serializes a whole batch when it contains a sequential tool; a
// read-only batch keeps its native parallel path. No second host scheduler.
export function applyToolExecutionPolicy<T extends ToolDefinition>(tool:T):T{
 const policy=TOOL_EXECUTION_POLICIES[tool.name];
 if(!policy)throw Error('TOOL_EXECUTION_POLICY_MISSING: '+tool.name);
 tool.executionMode=policy.executionMode;
 return tool;
}
