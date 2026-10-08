import {z} from 'zod';
import type {Mount} from './types.js';
import type {SkillDirectory} from './skills.js';

const id=z.string().uuid(),sha=z.string().regex(/^[a-f0-9]{64}$/);
export const globalSkillRelativePathSchema=z.string().min(1).max(2048).refine(value=>!value.startsWith('/')&&!value.includes('\\')&&!value.includes(':')&&!/[\0-\x1f]/.test(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[. ]$/.test(part)&&!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),'技能路径须位于安装包内，不能包含越界或系统保留名称');
export const globalSkillSourceSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('local'),path:z.string().min(1)}).strict(),
 z.object({kind:z.literal('github'),url:z.string().url(),owner:z.string().min(1),repository:z.string().min(1),ref:z.string().min(1),subPath:z.string(),commit:z.string().regex(/^[a-f0-9]{40}$/)}).strict(),
]);
// Git commits use 40 hex characters; package/file byte hashes use SHA-256.
export type GlobalSkillSource=z.infer<typeof globalSkillSourceSchema>;
export const installedGlobalSkillSchema=z.object({id,packageId:id,name:z.string().min(1).max(64),description:z.string().max(1024),enabled:z.boolean(),relativePath:globalSkillRelativePathSchema,contentHash:sha,disableModelInvocation:z.boolean(),scope:z.literal('global')}).strict();
export type InstalledGlobalSkill=z.infer<typeof installedGlobalSkillSchema>;
export const globalSkillPackageSchema=z.object({id,source:globalSkillSourceSchema,installedAt:z.string().min(1),updatedAt:z.string().min(1),skills:z.array(installedGlobalSkillSchema).min(1),files:z.array(z.object({path:globalSkillRelativePathSchema,sha256:sha,bytes:z.number().int().nonnegative()}).strict()).min(1),diagnostics:z.array(z.string()),}).strict();
export type GlobalSkillPackage=z.infer<typeof globalSkillPackageSchema>;
export const globalSkillRegistrySchema=z.object({schemaVersion:z.literal(1),revision:z.number().int().nonnegative(),packages:z.array(globalSkillPackageSchema)}).strict();
export type GlobalSkillRegistryState=z.infer<typeof globalSkillRegistrySchema>;
export type GlobalSkillsView={root:string;revision:number;packages:Array<Omit<GlobalSkillPackage,'files'> & {canUpdate:boolean;integrity?:'valid'|'invalid';integrityMessage?:string}>;skills:InstalledGlobalSkill[];diagnostics:string[];notice:string};
export type GlobalSkillMutationReceipt={revision:number;packageId?:string;skillIds:string[];view:GlobalSkillsView;unchanged?:boolean;notice:string};
export type GlobalSkillsRuntimeSnapshot={runtimeMounts:Mount[];runtimeDirectories:Array<SkillDirectory&{scope:'global'}>;revisionToken:string;diagnostics?:string[]};
export type GlobalSkillsMutationOptions={expectedRevision?:number;signal?:AbortSignal};
const expectedRevision=z.number().int().nonnegative().optional();
export const globalSkillsRequestSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('list')}).strict(),
 z.object({action:z.literal('importFolder'),path:z.string().min(1).max(32767),expectedRevision}).strict(),
 z.object({action:z.literal('installGithub'),url:z.string().url().max(4096),expectedRevision}).strict(),
 z.object({action:z.literal('toggle'),skillId:id,enabled:z.boolean(),expectedRevision}).strict(),
 z.object({action:z.literal('uninstall'),packageId:id,expectedRevision}).strict(),
 z.object({action:z.literal('update'),packageId:id,expectedRevision}).strict(),
]);
export type GlobalSkillsRequest=z.infer<typeof globalSkillsRequestSchema>;
