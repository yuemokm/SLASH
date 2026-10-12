import {taskCriterionSchema,type TaskAcceptanceCriterion} from '../shared/task-acceptance.js';
import {buildPrototypeUsabilityBaselineCases} from './prototype-usability.js';

/** Internal host standard, never a model-supplied execution switch. */
export function taskPrototypeHostCriterion(outputId:string,requestIds:string[],mobile:boolean):TaskAcceptanceCriterion{
 return taskCriterionSchema.parse({id:'host:render:'+outputId,text:'HTML页面实际加载、运行并留下截图',requestIds,outputIds:[outputId],origin:'model_proposal',required:true,checker:{kind:'prototype_cases',cases:[{id:'host:render',title:'页面加载与运行',viewport:{width:1440,height:900},steps:[{action:'assert',assertion:'visible',selector:'body',expected:true},{action:'assert',assertion:'no-horizontal-overflow',selector:'html'}]},...buildPrototypeUsabilityBaselineCases({mobile})]}});
}
