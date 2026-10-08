import type {PrototypeDraftTarget} from './prototype-acceptance.js';
export type ImageReadReceipt={source:'workspace'|'prototype_screenshot';mimeType:string;contentHash:string;bytes:number;width:number;height:number;readAt:string;mountId:string;path:string;reportId?:string;screenshotId?:string;executionId?:string;caseId?:string;stepIndex?:number;entryHash?:string;draft?:PrototypeDraftTarget;viewport?:{width:number;height:number};versionState?:'current'|'stale'};
export type PrototypeImageReadInput={reportId:string;screenshotId:string;entryHash:string;caseId:string};
