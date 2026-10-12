import type {FileRef} from './types.js';
import {z} from 'zod';

export const evidenceSearchRequestSchema=z.object({query:z.string().max(500),mountId:z.string().min(1).max(200).optional(),directory:z.string().min(1).max(32767).optional(),shallow:z.boolean().optional(),limit:z.number().int().min(1).max(100).optional(),offset:z.number().int().min(0).max(3000).optional(),resultVersion:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().refine(value=>!value.offset||Boolean(value.resultVersion),'下一页必须携带上页resultVersion').refine(value=>!value.shallow||Boolean(value.directory),'浅层目录浏览必须指定directory');
export type EvidenceSearchRequest=z.infer<typeof evidenceSearchRequestSchema>;

/** Search receipts describe parsed text, never a byte-level source version. */
export type EvidenceSearchHit=FileRef&{
 score:number;
 matchKind:'path'|'body'|'path_and_body';
 matchedTerms:string[];
 snippet?:string;
 locator?:string;
 startLine?:number;
 endLine?:number;
 textContentHash?:string;
};
export type EvidenceSearchLimitation={mountId?:string;path?:string;code:string;message:string};
export type EvidenceSearchOptions={
 mountId?:string;
 directory?:string;
 /** List immediate files and directories; directory items are path metadata only. */
 shallow?:boolean;
 limit?:number;
 offset?:number;
 resultVersion?:string;
 /** Host-only whole JSON response budget, never a body scan budget. */
 maxResponseCharacters?:number;
 /** Legacy explicit page size alias; new callers use limit. */
 maxResults?:number;
 maxFiles?:number;
 maxTotalCharacters?:number;
 maxFileCharacters?:number;
 deadlineMs?:number;
};
export type EvidenceSearchResult={
 query:string;
 terms:string[];
 items:EvidenceSearchHit[];
 coverage:{
  listedFiles:number;
  listedDirectories?:number;
  scannedFiles:number;
  /** Successfully searched in full after parsing (not merely a returned prefix). */
  bodyReadFiles:number;
  partialBodyFiles:number;
  skippedFiles:number;
  limitationCount:number;
  matchedFiles:number;
  matchedDirectories?:number;
  listTruncated:boolean;
  resultTruncated:boolean;
  status:'complete'|'partial';
 };
 limitations:EvidenceSearchLimitation[];
 scope:{mountId?:string};
 resultVersion:string;
 pagination:{offset:number;limit:number;returned:number;nextOffset:number|null;totalMatches:number;responseCharacters:number;maxResponseCharacters:number;notice:string};
};
