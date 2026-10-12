import {z} from 'zod';

export const designReferenceSchema=z.object({id:z.string().regex(/^(style|template):[a-z0-9-]+$/).max(150),contentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const designReferencesSchema=z.array(designReferenceSchema).max(2).refine(refs=>new Set(refs.map(ref=>ref.id.split(':')[0])).size===refs.length,'每类最多选择一个设计参考');
export type DesignReference=z.infer<typeof designReferenceSchema>;
export const isDesignPreviewColor=(value:string)=>/^#[\da-f]{3,8}$/i.test(value)||/^(?:rgba?|oklch)\([\d.,% /]+\)$/i.test(value);
export const designPreviewSchema=z.object({src:z.string().regex(/^design-previews\/open-design\/[a-f0-9]{40}\/(?:style|template)-[a-z0-9-]+\.jpg$/),kind:z.enum(['source-components','official-poster','source-template']),sourceUrl:z.url().refine(value=>{const url=new URL(value);return url.protocol==='https:'&&['github.com','repo-assets.open-design.ai'].includes(url.hostname)&&!url.username&&!url.password;}),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),imageHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type DesignPreview=z.infer<typeof designPreviewSchema>;
export type DesignCatalogItem={id:string;kind:'style'|'template';name:string;category:string;summary:string;tags:string[];contentHash:string;colors:string[];previewColors:{background:string;surface:string;accent:string;text:string;border:string};layout:'dashboard'|'landing'|'mobile'|'document'|'wireframe';sourcePath:string;sourceUrl?:string;preview?:DesignPreview};
export type DesignCatalogView={items:DesignCatalogItem[];source:{repository:string;commit:string;license:string;retrievedAt:string}};
export type DesignCatalogEntry=DesignCatalogItem&{documents:Array<{path:string;content:string;contentHash:string}>};
export type DesignCatalogData=Omit<DesignCatalogView,'items'>&{schemaVersion:1;items:DesignCatalogEntry[];excludedTemplates:string[]};
export type DesignReferenceReceipt=DesignReference&{name:string;kind:'style'|'template';sourcePath:string;sourceCommit:string;totalCharacters:number;includedCharacters:number;truncated:boolean;documents:Array<{path:string;contentHash:string;totalCharacters:number;includedCharacters:number;truncated:boolean}>};
export const designCatalogRequestSchema=z.object({type:z.literal('designCatalog')}).strict();
export const designSourceOpenRequestSchema=z.object({type:z.literal('designSourceOpen'),id:designReferenceSchema.shape.id,target:z.enum(['reference','image']).default('reference')}).strict();
