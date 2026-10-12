import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { required, endpoint } from './config';
import { ApiError, type Repository, type Base, type IndexVersion, type Hit } from './contracts';
import { tokenize } from './tokenizer';

export async function authenticatedClient(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token) throw new ApiError(401, 'LOGIN_REQUIRED', '请先登录后查看知识库。');
  const client = createClient(endpoint(process.env, 'NEXT_PUBLIC_SUPABASE_URL'), required(process.env, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw new ApiError(401, 'LOGIN_REQUIRED', '登录已失效，请重新登录。');
  return { client, userId: data.user.id };
}
function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new ApiError(502, 'DATABASE_UNAVAILABLE', '资料服务暂时不可用，请稍后重试。');
  return result.data;
}
export class SupabaseRepository implements Repository {
  constructor(readonly client: SupabaseClient, readonly userId: string) {}
  async listBases(): Promise<Base[]> {
    return checked(await this.client.from('knowledge_bases').select('id,title,active_version,sharing_enabled').order('title')) as Base[];
  }
  async getBase(id: string): Promise<Base | null> {
    return checked(await this.client.from('knowledge_bases').select('id,title,active_version,sharing_enabled').eq('id', id).maybeSingle());
  }
  async getIndex(id: string): Promise<IndexVersion | null> {
    return checked(await this.client.from('knowledge_indexes').select('id,kb_id,status,fingerprint,embedding_dimensions,tokenizer_version').eq('id', id).maybeSingle());
  }
  async search(input: Parameters<Repository['search']>[0]): Promise<Hit[]> {
    return checked(await this.client.rpc('knowledge_search', { p_kb: input.kbId, p_index: input.indexId, p_query: tokenize(input.question), p_vector: input.vector, p_fingerprint: input.fingerprint, p_min_similarity: input.minSimilarity })) as Hit[];
  }
  async source(id: string, version: string): Promise<Hit | null> {
    // RLS rechecks membership, sharing and the active published version on every click.
    return checked(await this.client.from('knowledge_chunks').select('id,kb_id,index_id,document_id,text,text_hash,display_name,source_version,locator').eq('id', id).eq('index_id', version).maybeSingle());
  }
  async revalidate(kbId: string, indexId: string, hits: Hit[]): Promise<boolean> {
    const base = await this.getBase(kbId);
    if (!base?.sharing_enabled || base.active_version !== indexId) return false;
    if (!hits.length) return true;
    const rows = checked(await this.client.from('knowledge_chunks').select('id,text_hash').eq('kb_id', kbId).eq('index_id', indexId).in('id', hits.map(h => h.id)));
    return !!rows && rows.length === hits.length && hits.every(h => rows.some(r => r.id === h.id && r.text_hash === h.text_hash));
  }
  async saveReceipt(value: Parameters<Repository['saveReceipt']>[0]): Promise<string> {
    const row = checked(await this.client.from('knowledge_answers').insert({ user_id: this.userId, kb_id: value.kbId, index_id: value.indexId, status: value.status, hit_ids: value.hitIds, model: value.model, duration_ms: value.durationMs }).select('id').single());
    if(!row) throw new ApiError(409,'ACCESS_CHANGED','访问权限或资料版本已经变化。');
    return row.id;
  }
  async feedback(receiptId: string, helpful: boolean): Promise<void> {
    checked(await this.client.from('knowledge_feedback').upsert({ receipt_id: receiptId, user_id: this.userId, helpful }, { onConflict: 'receipt_id,user_id' }));
  }
}
