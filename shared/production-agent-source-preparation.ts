import {z} from 'zod';
const text=z.string().min(1),hash=z.string().regex(/^[a-f0-9]{64}$/),evidence=z.object({path:text,sha256:hash}).strict();
export const productionSourcePreparationPlanSchema=z.object({strategy:z.literal('official_registered_xlsx_v1'),helperSha256:hash}).strict();
export const productionPreparedSourceSchema=z.object({id:text,name:text,mountId:text,path:text,contentHash:hash,sourceHash:hash,preparationRef:text.optional()}).strict();
export const productionSourcePreparationBindingSchema=z.object({schemaVersion:z.literal(1),caseId:z.string().regex(/^QE(?:0[1-9]|1[0-6])$/),outputMountId:text,manifestSha256:hash,plan:productionSourcePreparationPlanSchema,preparationEvidence:evidence,frozenAt:z.string().datetime(),sources:z.array(productionPreparedSourceSchema).min(1).max(100),preparationChanges:z.array(z.object({id:text,runId:z.literal('user-processing'),mountId:text,path:text,createdAt:z.string().datetime(),status:z.literal('applied'),contentHash:hash}).strict()).max(100)}).strict();
export type ProductionSourcePreparationBinding=z.infer<typeof productionSourcePreparationBindingSchema>;
/** Only this exact host-generated paragraph may normalize case-local paths. */
export function productionPreparedSourcePromptBlock(binding:ProductionSourcePreparationBinding,selectedIds:string[],outputMountId:string,outputScope:string,canonical=false){
 const sources=selectedIds.map(id=>{const value=binding.sources.find(source=>source.id===id);if(!value)throw Error('PREPARED_PROMPT_SOURCE_MISSING');return{sourceId:value.id,name:value.name,mountId:canonical?'<SOURCE_MOUNT:'+value.id+'>':value.mountId,path:canonical?'<PREPARED_PATH:'+value.id+'>':value.path,contentHash:value.contentHash,originalSha256:value.sourceHash};});
 return'\n宿主已核对的资料位置如下；请实际读取，保留工作表与具体坐标。宿主准备不是模型已读证据：\n'+JSON.stringify(sources)+'\n成果保存范围mountId='+(canonical?'<OUTPUT_MOUNT>':outputMountId)+'，仅允许'+outputScope+'。按该轮任务需要保存成果，评审分析明确要求不修改时仅回复。';
}
