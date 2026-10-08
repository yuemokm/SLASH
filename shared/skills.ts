export type SkillDirectory={mountId:string;path:string;scope?:'project'|'global'};
export type SkillDescriptor=SkillDirectory&{name:string;description:string;contentHash:string;disableModelInvocation:boolean};
export type SkillDiagnostic={code:string;message:string;mountId?:string;path?:string};
export type SkillDiscoveryReceipt={discoveredAt:string;skills:SkillDescriptor[];diagnostics:SkillDiagnostic[]};
export type SkillLoadReceipt=SkillDirectory&{name:string;contentHash:string;readAt:string;characters:number;invocation:'tool'|'command'};
