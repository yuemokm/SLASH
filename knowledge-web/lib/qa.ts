import { ApiError, TOKENIZER_VERSION, validateVector, type Answer, type Hit, type ModelAnswer, type Providers, type Repository } from './contracts';

export function bindAnswer(raw: unknown, hits: Hit[]): ModelAnswer {
  if (!raw || typeof raw !== 'object') throw new ApiError(502, 'INVALID_ANSWER', '回答格式不正确，请重试。');
  const value = raw as ModelAnswer;
  if (!['supported', 'conflict', 'insufficient'].includes(value.status) || !Array.isArray(value.paragraphs) || value.paragraphs.length > 16) throw new ApiError(502, 'INVALID_ANSWER', '回答格式不正确，请重试。');
  if (value.status === 'insufficient') return { status: 'insufficient', paragraphs: [{ text: '当前资料没有足够依据回答这个问题。请补充相关资料，或缩小问题范围。', sourceIds: [] }] };
  const ids = new Set(hits.map(h => h.id));
  if (!value.paragraphs.length) throw new ApiError(502, 'INVALID_ANSWER', '回答缺少正文。');
  const paragraphs = value.paragraphs.map(p => {
    if (!p || typeof p.text !== 'string' || !p.text.trim() || p.text.length > 5000 || !Array.isArray(p.sourceIds) || !p.sourceIds.length || p.sourceIds.some(id => typeof id !== 'string' || !ids.has(id))) {
      throw new ApiError(502, 'INVALID_CITATION', '回答含未经本次检索确认的来源，已阻止显示。');
    }
    return { text: p.text.trim(), sourceIds: [...new Set(p.sourceIds)] };
  });
  if (value.status === 'conflict') {
    const cited = new Set(paragraphs.flatMap(p => p.sourceIds));
    if (cited.size < 2) throw new ApiError(502, 'INVALID_CONFLICT', '冲突回答必须并列至少两处来源。');
    paragraphs.unshift({ text: '资料存在不同说法，当前无法确认统一结论。请逐一核对以下来源的字段、角色、条件和版本。', sourceIds: [...cited] });
  }
  return { status: value.status, paragraphs };
}

export async function ask(repository: Repository, providers: Providers, kbId: string, question: string, signal?:AbortSignal): Promise<Answer> {
  const cancel=()=>{if(signal?.aborted)throw new ApiError(499,'REQUEST_CANCELLED','请求已取消。');};
  cancel();
  const started = Date.now();
  const base = await repository.getBase(kbId);
  if (!base || !base.sharing_enabled || !base.active_version) throw new ApiError(404, 'NOT_AVAILABLE', '知识库未开放，或你尚未获得访问权限。');
  const index = await repository.getIndex(base.active_version);
  if (!index || index.kb_id !== kbId || index.status !== 'published') throw new ApiError(409, 'NOT_PUBLISHED', '当前知识库尚未发布可用资料。');
  if (index.fingerprint !== providers.fingerprint || index.embedding_dimensions !== providers.dimensions || index.tokenizer_version !== TOKENIZER_VERSION) {
    throw new ApiError(503, 'INDEX_CONFIG_MISMATCH', '查询服务与资料索引配置不一致，请联系知识库维护者。');
  }
  cancel();
  const vector = await providers.embed(question,signal);
  validateVector(vector, providers.dimensions);
  const retrieved = await repository.search({ kbId, indexId: index.id, question, vector, fingerprint: providers.fingerprint, minSimilarity: providers.minSimilarity });
  const hits: Hit[] = [];
  let chars = 0;
  for (const hit of retrieved) {
    if (hit.kb_id !== kbId || hit.index_id !== index.id) throw new ApiError(502, 'INVALID_RETRIEVAL', '检索来源版本不正确，已阻止回答。');
    if (!hit.text || hit.text.length > 8000 || hits.some(h => h.id === hit.id) || chars + hit.text.length > 24000) continue;
    if (!(Number.isInteger(hit.keyword_rank) && Number(hit.keyword_rank)>0 || Number.isFinite(hit.similarity) && hit.similarity >= providers.minSimilarity)) continue;
    hits.push(hit); chars += hit.text.length;
    if (hits.length === 8) break;
  }
  cancel();
  const answer = hits.length ? bindAnswer(await providers.answer(question, hits,signal), hits) : bindAnswer({ status: 'insufficient', paragraphs: [] }, []);
  cancel();
  // Recheck membership, sharing state, active snapshot and each hit after the model finishes.
  if (!await repository.revalidate(kbId, index.id, hits)) throw new ApiError(409, 'ACCESS_CHANGED', '资料版本或访问权限已变化，请重新打开知识库。');
  const citedIds = new Set(answer.paragraphs.flatMap(p => p.sourceIds));
  const sources = hits.filter(h => citedIds.has(h.id)).map(h => ({
    id: h.id, documentId: h.document_id, title: h.display_name, sourceVersion: h.source_version,
    indexVersion: h.index_id, textHash: h.text_hash, locator: h.locator, excerpt: h.text,
    href: `/api/sources/${encodeURIComponent(h.id)}?version=${encodeURIComponent(h.index_id)}`
  }));
  const receiptId = await repository.saveReceipt({ kbId, indexId: index.id, status: answer.status, hitIds: sources.map(s => s.id), model: providers.model, durationMs: Date.now() - started });
  return { receiptId, indexVersion: index.id, ...answer, sources };
}
