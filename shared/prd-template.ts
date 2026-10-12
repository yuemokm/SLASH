import type {WorkflowSourceReceipt} from './types.js';

/** Host-owned structural expectations. Sample values never become requirements. */
export type PrdTemplateSection={id:string;parentId?:string;title:string;ordinal?:string;level:number;slot:boolean;ambiguous?:boolean;locator:string};
export type PrdTemplateTable={id:string;sectionId?:string;columns:string[];known:boolean;locator:string};
export type TaskPrdTemplate={schemaVersion:1;source:WorkflowSourceReceipt;copy?:WorkflowSourceReceipt;copyId?:string;parserVersion:string;structureVersion:string;snapshotHash:string;state:'ready'|'unverified';sections:PrdTemplateSection[];tables:PrdTemplateTable[];limitations:string[];outputId?:string};
