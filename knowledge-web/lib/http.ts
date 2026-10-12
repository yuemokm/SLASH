import 'server-only';
import { ApiError } from './contracts';
import { authenticatedClient, SupabaseRepository } from './supabase';
import { fixtureEnabled, fixtureAdapters } from './fixture';
export const json = (value: unknown, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'private, no-store','Vary':'Authorization'}});
export function failure(error: unknown) {
  const e = error instanceof ApiError ? error : new ApiError(500,'INTERNAL_ERROR','服务暂时不可用，请稍后重试。');
  return json({error:{code:e.code,message:e.message,...(e.diagnostic?{diagnostic:e.diagnostic}:{})}}, e.status);
}
export async function repositoryFor(request: Request) {
  if (fixtureEnabled()) return fixtureAdapters(request).repository;
  const {client,userId} = await authenticatedClient(request);
  return new SupabaseRepository(client,userId);
}
export async function bodyOf(request: Request, max = 12000): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415,'INVALID_CONTENT_TYPE','请求须使用JSON格式。');
  const reader = request.body?.getReader(); if (!reader) throw new ApiError(400,'INVALID_REQUEST','请求为空。');
  const parts:Uint8Array[]=[]; let size=0;
  try { for (;;) { const {value,done}=await reader.read(); if(done) break; size+=value.byteLength; if(size>max) {await reader.cancel(); throw new ApiError(413,'REQUEST_TOO_LARGE','问题过长。');} parts.push(value); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch {throw new ApiError(400,'INVALID_JSON','请求格式不正确。');}
}
