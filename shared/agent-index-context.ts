/** Metadata for the managed index packet only. The ordinary index receipt's
 * contentHash continues to identify the complete on-disk AGENTS document. */
export type AgentIndexContextReceipt={version:'managed-index-context-v1';mode:'full'|'summary';coverage:'full'|'partial';bodyRead:false;limit:number;sourceCharacters:number;includedCharacters:number;managedHash:string;contentHash:string;structureCount:number;includedStructures:number;entryCount:number;includedEntries:number};
