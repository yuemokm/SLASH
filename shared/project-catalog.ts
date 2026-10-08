import {z} from 'zod';
import type {DocumentContent,FileRef,Mount,ProjectTreeNode,ProjectTreeRole} from './types.js';

export type CatalogProject={id:string;name:string;root:string;current:boolean;mounts:Mount[];nodes:ProjectTreeNode[];mountRoles:Record<string,ProjectTreeRole>};
export type ProjectCatalogView={projects:CatalogProject[];currentProjectId:string|null};
export type ProjectDirectoryEntry={name:string;path:string;kind:'directory'|'file';size:number;referenceProtected?:boolean};
export type ProjectDirectoryView={projectId:string;mountId:string;path:string;entries:ProjectDirectoryEntry[];truncated:boolean;warnings:string[]};
export type ProjectFileRef=FileRef&{projectId:string;projectName:string};
export type ProjectDocumentView=DocumentContent&{projectId:string;projectName:string;path:string};
const id=z.string().min(1).max(200);
const relative=z.string().max(32767).refine(value=>!value.includes('\0'),'INVALID_PATH');
export const projectCatalogRequestSchemas=[
 z.object({type:z.literal('projectCatalog')}).strict(),
 z.object({type:z.literal('projectBrowse'),projectId:id,mountId:id,path:relative.default('')}).strict(),
 z.object({type:z.literal('projectReadDocument'),projectId:id,mountId:id,path:relative.min(1)}).strict(),
 z.object({type:z.literal('projectRevealFile'),projectId:id,mountId:id,path:relative}).strict(),
] as const;
