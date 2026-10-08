import {randomUUID} from 'node:crypto';
import type {QualityGate,QualityHistoryView,QualityReport,QualityReportRecord} from '../shared/types.js';
import {Store} from './store.js';
import {businessPathKey} from '../shared/business-rules.js';

/**
 * Quality reports are snapshots of a particular content hash. They live in
 * the same SQLite-backed KV store as the workspace state so they survive an
 * application restart and do not depend on the current file contents.
 */
export function qualityReportStoreKey(workspaceId:string){return `quality-reports:v1:${workspaceId}`;}

function clone<T>(value:T):T{return structuredClone(value);}

function validRecord(value:unknown):value is QualityReportRecord{
 if(!value||typeof value!=='object')return false;
 const item=value as Record<string,unknown>;
 return typeof item.id==='string'&&typeof item.workspaceId==='string'&&typeof item.mountId==='string'&&typeof item.path==='string'&&typeof item.createdAt==='string'&&!!item.report&&typeof item.report==='object'&&!!item.gate&&typeof item.gate==='object';
}

export class QualityReportRepository {
 constructor(private readonly store:Store,private readonly workspaceId:string){}
 private read():QualityReportRecord[]{
  const raw=this.store.get<unknown>(qualityReportStoreKey(this.workspaceId),[]);
  if(!Array.isArray(raw))return [];
  return raw.filter(validRecord).map(clone);
 }
 save(input:{artifactId?:string;mountId:string;path:string;report:QualityReport;gate:QualityGate;createdAt?:string}):QualityReportRecord{
  const value:QualityReportRecord={id:randomUUID(),workspaceId:this.workspaceId,artifactId:input.artifactId,mountId:input.mountId,path:input.path,report:clone(input.report),gate:clone(input.gate),createdAt:input.createdAt??new Date().toISOString()};
  const records=this.read();
  records.unshift(value);
  // Keep enough history for an ordinary PM project while preventing a large
  // workspace from turning every check into an unbounded KV value.
  this.store.set(qualityReportStoreKey(this.workspaceId),records.slice(0,2000));
  return clone(value);
 }
 get(id:string){return this.read().find(row=>row.id===id);}
 list(filter:{artifactId?:string;mountId?:string;path?:string;limit?:number}):QualityHistoryView{
  const records=this.read().filter(item=>(filter.artifactId?item.artifactId===filter.artifactId:true)&&(filter.mountId?item.mountId===filter.mountId:true)&&(filter.path?businessPathKey(item.path)===businessPathKey(filter.path):true));
  const limit=Math.min(Math.max(filter.limit??30,1),200);
  return{workspaceId:this.workspaceId,artifactId:filter.artifactId,mountId:filter.mountId??records[0]?.mountId??'',path:filter.path??records[0]?.path??'',reports:records.slice(0,limit)};
 }
}
