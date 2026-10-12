// Existing benchmark bindings and native assertion recipe, shared by script and compiled evaluator.
import {z} from 'zod';
import {prototypeStepSchema,prototypeAcceptanceDefinitionSchema} from './prototype-acceptance.ts';
const selector=z.string().min(1).max(200),action=prototypeStepSchema.refine(s=>s.action!=='assert','Bindings contain native actions, never fabricated observations.'),actions=z.array(action).max(8).default([]);
export const qualityPrototypeNativeActionsSchema=actions;
const message=z.object({selector,text:z.string().min(1).max(200)}).strict();
// v1 preserves explicitly reviewed historical UI-note expectations. Only a new
// v2 binding can move implementation notes out of the prototype; never migrate
// old/frozen specs or reinterpret their failures as passed.
const codeFields={selector,mode:z.enum(['readonly_input','disabled_input','display_text']),representation:z.enum(['unallocated_placeholder','allocated_demo']),generatedNote:message};
const bindingFields={artifactHash:z.string().regex(/^[a-f0-9]{64}$/),reviewed:z.literal(true),entrySteps:actions,
 name:z.object({selector,hint:message,boundary:z.enum(['native_maxlength','submit_reject']),errorSelector:selector.optional()}).strict(),
 submit:selector,fillSteps:actions,
 scenarios:z.object({success:actions,duplicate:actions,failure:actions}).strict(),
 feedback:z.object({success:message,duplicate:message,failure:message}).strict(),
 names:z.object({success:z.string().min(1).max(50),duplicate:z.string().min(1).max(50),failure:z.string().min(1).max(50)}).strict(),
 preservedFields:z.array(z.union([z.object({selector,value:z.string().max(2000)}).strict(),z.object({selector,checked:z.boolean()}).strict()])).max(6).default([]),
 followUps:z.object({retry:z.object({steps:actions,feedback:message}).strict().optional(),duplicateView:z.object({steps:actions,feedback:message}).strict().optional()}).strict().optional(),
};
export const qualityPrototypeBindingsSchema=z.discriminatedUnion('schemaVersion',[
 z.object({...bindingFields,schemaVersion:z.literal(1),code:z.object({...codeFields,allocationNote:message}).strict()}).strict(),
 z.object({...bindingFields,schemaVersion:z.literal(2),code:z.object({...codeFields,allocationNote:message.optional()}).strict()}).strict(),
]).superRefine((b,ctx)=>{
 if(b.name.boundary==='submit_reject'&&!b.name.errorSelector)ctx.addIssue({code:'custom',message:'51字符拒绝路径须定位实际校验反馈。'});
 if(!/50/.test(b.name.hint.text))ctx.addIssue({code:'custom',message:'名称长度期望固定为50，不能用绑定文件弱化。'});
 if(!/(系统.*生成|系统.*计算|自动.*生成|自动计算)/.test(b.code.generatedNote.text))ctx.addIssue({code:'custom',message:'编码须有独立的系统生成/计算说明期望。'});
 if(b.schemaVersion===1&&!/(模拟|演示|待|未|时机)/.test(b.code.allocationNote.text))ctx.addIssue({code:'custom',message:'旧明确UI说明期望须说明演示编码或未确认分配时机。'});
 for(const [kind,expression] of Object.entries({success:/成功|完成|已创建|已新增/,duplicate:/重复|疑似|已有/,failure:/失败|异常|错误|不可用/}))if(!expression.test(b.feedback[kind as keyof typeof b.feedback].text))ctx.addIssue({code:'custom',message:kind+'结果必须具有相应独立语义，不能用任意当前文案代替。'});
 for(const [kind,follow] of Object.entries(b.followUps??{})){if(!follow.steps.some(s=>s.action==='click'))ctx.addIssue({code:'custom',message:kind+'必须实际点击重试或查看控件。'});if(kind==='retry'&&!/成功|完成|已创建|已新增/.test(follow.feedback.text))ctx.addIssue({code:'custom',message:'重试必须实际达到成功反馈，不能以原失败文字冒充再次提交。'});}
});
const a=(assertion:string,selector?:string,expected?:unknown,match?:string):any=>({action:'assert',assertion,...(selector?{selector}:{}),...(expected===undefined?{}:{expected}),...(match?{match}:{})}),fill=(selector:string,value:string)=>({action:'fill',selector,value}),click=(selector:string)=>({action:'click',selector});
const text=(m:{selector:string;text:string})=>a('text',m.selector,m.text,'contains');
const visibleText=(m:{selector:string;text:string})=>[a('visible',m.selector,true),text(m)];
export function qualityPrototypeCases(input:unknown){
 const b=qualityPrototypeBindingsSchema.parse(input),entry=b.entrySteps;
 const code=[...entry,a('visible',b.code.selector,true),...(b.code.mode==='readonly_input'?[a('readonly',b.code.selector,true)]:b.code.mode==='disabled_input'?[a('enabled',b.code.selector,false)]:b.code.representation==='allocated_demo'?[a('text',b.code.selector,'JHWD','contains')]:[]),text(b.code.generatedNote)];
 if(b.schemaVersion===1)code.push(text(b.code.allocationNote));
 if(b.code.representation==='allocated_demo'&&b.code.mode!=='display_text')code.push(a('value',b.code.selector,'JHWD','contains'));
 const name=[...entry,...(b.name.boundary==='submit_reject'?b.fillSteps:[]),fill(b.name.selector,'甲'.repeat(50)),a('value',b.name.selector,'甲'.repeat(50)),fill(b.name.selector,'甲'.repeat(51))];
 if(b.name.boundary==='native_maxlength')name.push(a('value',b.name.selector,'甲'.repeat(50)));else name.push(a('value',b.name.selector,'甲'.repeat(51)),click(b.submit),a('visible',b.name.errorSelector,true));name.push(text(b.name.hint));
 const preserved=new Map<string,any>();for(const step of [...b.fillSteps,...b.scenarios.failure])if((step.action==='fill'||step.action==='select')&&step.selector!==b.name.selector)preserved.set(step.selector,{value:step.value});for(const field of b.preservedFields)if(field.selector!==b.name.selector)preserved.set(field.selector,field);
 const scenario=(kind:'success'|'duplicate'|'failure')=>[...entry,...b.fillSteps,...b.scenarios[kind],fill(b.name.selector,b.names[kind]),click(b.submit),...(kind==='success'&&b.code.mode!=='display_text'?[b.code.mode==='readonly_input'?a('readonly',b.code.selector,true):a('enabled',b.code.selector,false)]:[]),...visibleText(b.feedback[kind]),...(kind==='failure'?[a('value',b.name.selector,b.names.failure),...[...preserved].map(([selected,field])=>'checked'in field?a('checked',selected,field.checked):a('value',selected,field.value))]:[])];
 const cases=[{id:'benchmark:code-readonly',title:b.schemaVersion===1?'来源规则：编码展示且无法手填，分配/模拟状态明确':'来源规则：编码展示且无法手填',steps:code},{id:'benchmark:name-50-51',title:'来源50字符规则及测试50/51中文字符边界',steps:name},...(['success','duplicate','failure'] as const).map(kind=>({id:'benchmark:submit-'+kind,title:(b.schemaVersion===1?'测试模拟提交：':'测试提交反馈：')+kind,steps:scenario(kind)})),...[[390,844],[1280,800],[1440,900]].map(([width,height])=>({id:'benchmark:viewport-'+width,title:'测试CSS视口 '+width+'×'+height,viewport:{width,height},steps:[...entry,a('no-horizontal-overflow',undefined,undefined),a('visible',b.name.selector,true),fill(b.name.selector,'视口验收门店'),a('value',b.name.selector,'视口验收门店'),a('visible',b.submit,true),a('enabled',b.submit,true),click(b.submit),a('no-horizontal-overflow',undefined,undefined)]}))];
 for(const [kind,follow] of Object.entries(b.followUps??{})){const initial=kind==='retry'?'failure':'duplicate';cases.push({id:'benchmark:'+kind,title:kind==='retry'?'明确任务要求：失败后实际重试成功':'明确任务要求：实际查看重复结果',steps:[...entry,...b.fillSteps,...b.scenarios[initial],fill(b.name.selector,b.names[initial]),click(b.submit),...visibleText(b.feedback[initial]),...follow.steps,...visibleText(follow.feedback)]});}
 // Existing case/step/file/time limits remain in force.
 return prototypeAcceptanceDefinitionSchema.parse({mountId:'benchmark',path:'index.html',title:'真实资料独立浏览器基准',cases}).cases;
}

type CodeObservation={count:number;visible?:boolean;readonly?:boolean;disabled?:boolean;valueFormat?:string;contentEditable?:boolean;tag?:string};
export function qualityCodeProtectionStatus(mode:string,observation?:CodeObservation){if(!observation||observation.count!==1)return'unknown';if(mode==='display_text'){if(typeof observation.contentEditable!=='boolean')return'unknown';return observation.contentEditable||['input','textarea','select'].includes(observation.tag??'')?'failed':'passed';}return'not_applicable';}
export function qualitySuccessfulCodeStatus(mode:string,observation?:CodeObservation){if(!observation||observation.count!==1||!observation.visible)return'unknown';if(observation.valueFormat!=='JHWD_10_digits')return'failed';if(mode==='display_text')return qualityCodeProtectionStatus(mode,observation);return mode==='readonly_input'?(observation.readonly===true?'passed':'failed'):mode==='disabled_input'?(observation.disabled===true?'passed':'failed'):'unknown';}
