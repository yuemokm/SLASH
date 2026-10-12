export interface Base { id: string; title: string; active_version: string | null; sharing_enabled: boolean }
export interface IndexVersion {
  id: string; kb_id: string; status: string; fingerprint: string;
  embedding_dimensions: number; tokenizer_version: string;
}
export interface Hit {
  id: string; kb_id: string; index_id: string; document_id: string;
  text: string; text_hash: string; display_name: string; source_version: string;
  locator: Record<string, unknown>; similarity: number; keyword_rank: number | null;
}
export interface Citation {
  id: string; documentId: string; title: string; sourceVersion: string;
  indexVersion: string; textHash: string; locator: Record<string, unknown>;
  excerpt: string; href: string;
}
export type AnswerStatus = 'supported' | 'conflict' | 'insufficient';
export interface ModelAnswer { status: AnswerStatus; paragraphs: { text: string; sourceIds: string[] }[] }
export interface Answer {
  receiptId: string; indexVersion: string; status: AnswerStatus;
  paragraphs: { text: string; sourceIds: string[] }[]; sources: Citation[];
}
export interface Repository {
  getBase(id: string): Promise<Base | null>;
  getIndex(id: string): Promise<IndexVersion | null>;
  search(input: { kbId: string; indexId: string; question: string; vector: number[]; fingerprint: string; minSimilarity: number }): Promise<Hit[]>;
  revalidate(kbId: string, indexId: string, hits: Hit[]): Promise<boolean>;
  saveReceipt(value: { kbId: string; indexId: string; status: AnswerStatus; hitIds: string[]; model: string; durationMs: number }): Promise<string>;
}
export interface Providers {
  fingerprint: string; dimensions: number; model: string; minSimilarity: number;
  embed(question: string, signal?:AbortSignal): Promise<number[]>;
  answer(question: string, hits: Hit[], signal?:AbortSignal): Promise<unknown>;
}
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public diagnostic?: { stage:'embedding'|'answer';reason:'http'|'timeout'|'network'|'invalid_json'|'response_too_large';upstreamStatus?:number }) { super(message); }
}
export const TOKENIZER_VERSION = 'zh-bigram-v1';
export const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(v);
export function parseQuestion(value: unknown): { kbId: string; question: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_REQUEST', '问题格式不正确。');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'kbId,question' || !validId(v.kbId) || typeof v.question !== 'string' || !v.question.trim() || v.question.length > 2000) {
    throw new ApiError(400, 'INVALID_REQUEST', '请选择知识库，并输入不超过 2000 字的问题。请求仅接受知识库与问题。');
  }
  return { kbId: v.kbId, question: v.question.trim() };
}
export function validateVector(value: unknown, dimensions: number): asserts value is number[] {
  if (!Array.isArray(value) || value.length !== dimensions || !value.every(n => typeof n === 'number' && Number.isFinite(n)) || !value.some(n => n !== 0)) {
    throw new ApiError(502, 'INVALID_EMBEDDING', '向量服务返回的维度或数值不正确。');
  }
}
