import { createHash } from 'node:crypto';
import { ApiError } from './contracts.ts';
export function fingerprintOf(value: { provider: string; model: string; revision: string; dimensions: number }): string {
  return createHash('sha256').update(JSON.stringify({ provider: value.provider, model: value.model, revision: value.revision, dimensions: value.dimensions })).digest('hex');
}
export function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]?.trim();
  if (!v) throw new ApiError(503, 'CONFIG_MISSING', `服务尚未配置 ${name}，请联系维护者。`);
  return v;
}
export function endpoint(env: NodeJS.ProcessEnv, name: string, preservePath = false): string {
  const value = required(env, name); const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new ApiError(503, 'CONFIG_INVALID', `${name} 必须是无凭据的 HTTPS 基础地址。`);
  return preservePath ? url.origin + url.pathname : value.replace(/\/$/, '');
}
export function modelConfig(env: NodeJS.ProcessEnv) {
  const dimensions = Number(required(env, 'EMBEDDING_DIMENSIONS'));
  const minSimilarity = Number(required(env, 'RETRIEVAL_MIN_SIMILARITY'));
  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 8192 || !Number.isFinite(minSimilarity) || minSimilarity < 0 || minSimilarity > 1) throw new ApiError(503, 'CONFIG_INVALID', '向量维度或检索阈值配置不正确。');
  const embeddingEndpoint = endpoint(env, 'EMBEDDING_ENDPOINT', true);
  const provider = `openai-compatible:${embeddingEndpoint}`, model = required(env, 'EMBEDDING_MODEL'), revision = required(env, 'EMBEDDING_REVISION');
  return {
    embeddingUrl: embeddingEndpoint, embeddingKey: required(env, 'EMBEDDING_API_KEY'),
    embeddingModel: model, dimensions, sendDimensions: env.EMBEDDING_SEND_DIMENSIONS === 'true',
    fingerprint: fingerprintOf({ provider, model, revision, dimensions }), minSimilarity,
    answerUrl: endpoint(env, 'ANSWER_BASE_URL'), answerKey: required(env, 'ANSWER_API_KEY'), model: required(env, 'ANSWER_MODEL')
  };
}
