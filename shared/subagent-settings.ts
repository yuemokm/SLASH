import {z} from 'zod';

// Settings may lower the existing ceiling; they never grant tools or permission.
export const SUBAGENT_CEILING={tasks:3,concurrency:2,toolsPerChild:24,durationMs:120000} as const;
export const SUBAGENT_INSTRUCTIONS_MAX=6000;
const legacySettingsSchema=z.object({
 enabled:z.boolean().default(true),
 instructions:z.string().max(SUBAGENT_INSTRUCTIONS_MAX).default(''),
 modelEntryId:z.string().trim().min(1).max(200).nullable().default(null),
 thinkingLevel:z.enum(['auto','off','minimal','low','medium','high','xhigh','max']).default('auto'),
 tasks:z.number().int().min(1).max(3).default(3),
 concurrency:z.number().int().min(1).max(2).default(2),
 toolsPerChild:z.number().int().min(1).max(24).default(24),
 durationMs:z.number().int().min(1000).max(120000).default(120000),
}).strict().refine(value=>value.concurrency<=value.tasks,'同时运行数不能超过子任务总数');
export const subagentProfileSchema=z.object({
 id:z.string().regex(/^[A-Za-z0-9_-]+$/).min(1).max(80),
 name:z.string().trim().min(1,'请填写名称').max(60),
 description:z.string().trim().max(400).default(''),
 modelEntryId:z.string().trim().min(1).max(200).nullable().default(null),
 thinkingLevel:z.enum(['auto','off','minimal','low','medium','high','xhigh','max']).default('auto'),
 instructions:z.string().max(SUBAGENT_INSTRUCTIONS_MAX).default(''),
}).strict();
export type SubagentProfile=z.infer<typeof subagentProfileSchema>;
export const DEFAULT_SUBAGENT_PROFILE:SubagentProfile=subagentProfileSchema.parse({id:'slash-default',name:'通用助手',description:'资料研究与成果检查'});
const settingsSchema=z.object({
 enabled:z.boolean().default(true),
 profiles:z.array(subagentProfileSchema).min(1).max(20).default(()=>[{...DEFAULT_SUBAGENT_PROFILE}]),
 defaultAgentId:z.string().min(1).max(80).default(DEFAULT_SUBAGENT_PROFILE.id),
 tasks:z.number().int().min(1).max(3).default(3),concurrency:z.number().int().min(1).max(2).default(2),
 toolsPerChild:z.number().int().min(1).max(24).default(24),durationMs:z.number().int().min(1000).max(120000).default(120000),
}).strict().superRefine((value,ctx)=>{
 if(value.concurrency>value.tasks)ctx.addIssue({code:'custom',message:'同时运行数不能超过子任务总数'});
 if(new Set(value.profiles.map(profile=>profile.id)).size!==value.profiles.length)ctx.addIssue({code:'custom',message:'Subagent ID不能重复'});
 if(new Set(value.profiles.map(profile=>profile.name.toLocaleLowerCase())).size!==value.profiles.length)ctx.addIssue({code:'custom',message:'Subagent 名称不能重复'});
 if(!value.profiles.some(profile=>profile.id===value.defaultAgentId))ctx.addIssue({code:'custom',message:'默认Subagent 不存在'});
});
// Legacy single-profile objects remain readable, including configurations saved
// before instructions existed. Persist the migrated value only during a save.
export const subagentSettingsSchema=z.preprocess(value=>{
 if(value&&typeof value==='object'&&!Array.isArray(value)&&!('profiles' in value)){
  const parsed=legacySettingsSchema.safeParse(value);
  if(parsed.success){const {modelEntryId,thinkingLevel,instructions,...global}=parsed.data;return {...global,profiles:[{...DEFAULT_SUBAGENT_PROFILE,modelEntryId,thinkingLevel,instructions}],defaultAgentId:DEFAULT_SUBAGENT_PROFILE.id};}
 }
 return value;
},settingsSchema);
export type SubagentSettings=z.infer<typeof subagentSettingsSchema>;
export const DEFAULT_SUBAGENT_SETTINGS:SubagentSettings=subagentSettingsSchema.parse({});
export const subagentRequestSchemas=[
 z.object({type:z.literal('subagentSettingsGet')}).strict(),
 z.object({type:z.literal('subagentSettingsSetEnabled'),enabled:z.boolean()}).strict(),
 z.object({type:z.literal('subagentSettingsSave'),config:subagentSettingsSchema}).strict(),
] as const;
