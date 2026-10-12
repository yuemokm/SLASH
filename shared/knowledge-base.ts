import {z} from 'zod';

const safeText=z.string().trim().min(1).max(200);
export const knowledgeSourceRefSchema=z.object({
 mountId:safeText,
 path:z.string().min(1).max(4096).refine(value=>!value.includes('\0')&&!/^(?:[a-z]:|[\\/])/i.test(value)&&!value.split(/[\\/]/).includes('..'),'资料必须使用授权目录内相对路径'),
 displayName:safeText.optional(),
}).strict();
export const createKnowledgeBaseSchema=z.object({title:safeText,sources:z.array(knowledgeSourceRefSchema).max(100)}).strict();
export const updateKnowledgeSourcesSchema=z.array(knowledgeSourceRefSchema).max(100);
export type KnowledgeSourceRef=z.infer<typeof knowledgeSourceRefSchema>;
export type EmbeddingFingerprint={provider:string;model:string;revision:string;dimensions:number};
export type KnowledgeCoverage={status:'complete'|'partial';limitations:string[]};
/** Host-supplied trusted parse result; partial/scanned/omitted content must be reported. */
export type KnowledgeSourceRead={
 text:string;originalHash:string;versionId:string;parserVersion:string;coverage:KnowledgeCoverage;
 extractedHash?:string;originalSource?:KnowledgeSourceRef;
};
export type KnowledgeDocument={
 id:string;source:KnowledgeSourceRef;originalSource?:KnowledgeSourceRef;originalHash:string;
 extractedHash?:string;textHash:string;versionId:string;parserVersion:string;coverage:KnowledgeCoverage;
};
export type KnowledgeChunk={
 id:string;documentId:string;source:KnowledgeSourceRef;indexId:string;text:string;textHash:string;
 locator:{kind:'lines'|'table_row';startLine:number;endLine:number;startCharacter:number;endCharacter:number;heading?:string;row?:number;headerLine?:number};
 embedding?:number[];
};
export type KnowledgeBuildStatus='staging'|'ready'|'failed'|'unknown';
export type KnowledgeIndexBuild={
 id:string;status:KnowledgeBuildStatus;sourceRevision:number;fingerprint:EmbeddingFingerprint;
 completedChunks:number;totalChunks:number;completedSources:number;totalSources:number;
 coverage:KnowledgeCoverage;createdAt:string;updatedAt:string;errorCode?:string;error?:string;
};
export type KnowledgeBase={
 id:string;projectId:string;title:string;sources:KnowledgeSourceRef[];revision:number;
 status:'draft'|'local_ready'|'blocked'|'deleted';currentIndexId?:string;lastBuild?:KnowledgeIndexBuild;
 createdAt:string;updatedAt:string;
};
/** A local immutable snapshot. It is not evidence of a Vercel/Supabase publication. */
export type KnowledgeIndexSnapshot={
 knowledgeBaseId:string;projectId:string;indexId:string;fingerprint:EmbeddingFingerprint;
 documents:KnowledgeDocument[];chunks:KnowledgeChunk[];coverage:KnowledgeCoverage;createdAt:string;
};
export type KnowledgeExportBundle={schemaVersion:1;title:string;manifestHash:string;snapshot:KnowledgeIndexSnapshot};
/** Retrieval evidence only: no generated answer or cloud publication claim. */
export type KnowledgeSearchResult={knowledgeBaseId:string;indexId:string;question:string;status:'evidence'|'no_evidence';coverage:KnowledgeCoverage;hits:Array<{chunkId:string;document:KnowledgeDocument;text:string;locator:KnowledgeChunk['locator'];score:number}>};
export type KnowledgeBaseDetails=KnowledgeBase&{index?:{indexId:string;fingerprint:EmbeddingFingerprint;coverage:KnowledgeCoverage;documents:KnowledgeDocument[];chunkCount:number;previews:Array<Pick<KnowledgeChunk,'id'|'documentId'|'text'|'locator'>>}};
export const KNOWLEDGE_LIMITS={maxSources:100,maxSourceCharacters:1_000_000,maxTotalCharacters:4_000_000,maxChunks:10_000,maxVectorValues:4_000_000,maxChunkCharacters:1600,embeddingBatchSize:32} as const;
