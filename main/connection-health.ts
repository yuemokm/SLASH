import {createHash} from 'node:crypto';
import type {ConnectionHealthSnapshot} from '../shared/types.js';
import {McpSafeError,safeMcpMessage} from './mcp-errors.js';

export type ConnectionInspection = Readonly<{
  kind:'cli'|'mcp';
  version?:string;
  tools?:ReadonlyArray<{name:string;description?:string}>;
  notice?:string;
}>;

/** Converts a capability inspection into a durable, user-facing health
 * snapshot. A successful binary/version check is deliberately described as
 * healthy for the connection layer only; providers still need a separate
 * business-operation receipt before delivery is considered successful. */
export function summarizeConnectionHealth(connectionId:string, inspection:ConnectionInspection, checkedAt=new Date().toISOString()):ConnectionHealthSnapshot {
  const capabilities=(inspection.kind==='mcp'?(inspection.tools??[]).map(tool=>tool.name):[]).filter(Boolean).sort();
  const status=inspection.kind==='mcp'&&capabilities.length===0?'degraded':'healthy';
  const summary=inspection.kind==='mcp'?`${capabilities.length} 个 MCP 工具可用；业务发布仍需单独核对回执`:`可执行文件与版本检查通过；登录状态和业务发布仍需单独验证`;
  const version=inspection.version?.trim()||undefined;
  return{connectionId,checkedAt,status,summary,version,capabilities};
}

export function summarizeConnectionFailure(connectionId:string,error:unknown,checkedAt=new Date().toISOString()):ConnectionHealthSnapshot {
  const raw=error instanceof Error?error.message:String(error);
  const diagnostic=error instanceof McpSafeError||/oauth|token|bearer|code=|https?:\/\//i.test(raw)?safeMcpMessage(error):raw;
  return{connectionId,checkedAt,status:'failed',summary:'连接能力检查失败，请修复配置或认证后重试',capabilities:[],diagnostic:diagnostic.slice(0,2000)};
}

export function capabilityHash(snapshot:Pick<ConnectionHealthSnapshot,'capabilities'|'version'>):string {
  return createHash('sha256').update(JSON.stringify({capabilities:[...snapshot.capabilities].sort(),version:snapshot.version??''})).digest('hex');
}
