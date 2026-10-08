import { z } from 'zod';
import type { ImageContent, Model, Api } from '@earendil-works/pi-ai';

/** An immutable image snapshot owned by the host process. */
export type ImageAttachmentRef = Readonly<{
  id: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: string;
}>;

export type LoadedImageAttachment = Readonly<{ ref: ImageAttachmentRef; data: Uint8Array }>;

export type VisionModelLike = Readonly<{
  id?: string;
  modelId?: string;
  provider?: string;
  name?: string;
  baseUrl?: string;
  protocol?: string;
  /** Whether the host has a usable credential for this model entry. */
  hasKey?: boolean;
  supportsVision?: boolean;
  input?: readonly string[];
}>;

export const visionEvidenceSchema = z.object({
  summary: z.string().max(20_000),
  ocr: z.object({
    fullText: z.string().max(200_000),
    items: z.array(z.object({
      text: z.string().max(20_000),
      confidence: z.number().min(0).max(1).optional(),
      box: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    }).strict()).max(10_000),
  }).strict(),
  layout: z.object({
    regions: z.array(z.object({
      type: z.string().max(200),
      label: z.string().max(2_000).optional(),
      box: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    }).strict()).max(10_000),
  }).strict(),
  semantics: z.object({
    scene: z.string().max(4_000).optional(),
    objects: z.array(z.string().max(2_000)).max(10_000),
    interactions: z.array(z.string().max(4_000)).max(10_000),
  }).strict(),
  visual: z.object({ notes: z.array(z.string().max(4_000)).max(10_000) }).strict(),
  uncertainty: z.array(z.string().max(4_000)).max(10_000),
}).strict();
export type VisionEvidence = z.infer<typeof visionEvidenceSchema>;

export type VisionPrepareInput = Readonly<{
  attachments: readonly ImageAttachmentRef[];
  selectedModel: VisionModelLike;
  models?: readonly VisionModelLike[];
  preferences?: Readonly<{ visionModelId?: string; visionAutoFallback?: boolean }>;
  prompt?: string;
  signal?: AbortSignal;
  credential?: unknown;
}>;

export type VisionPrepareResult = Readonly<{
  images?: readonly ImageContent[];
  evidence?: VisionEvidence;
  /** Kept when a visual request returned text that was not valid evidence. */
  raw?: string;
  uncertainty?: readonly string[];
  attachments: readonly ImageAttachmentRef[];
  model?: Readonly<{ id?: string; name?: string; modelId?: string; provider?: string }>;
  cached?: boolean;
  cacheKey?: string;
}>;

export type VisionRequest = (input: Readonly<{
  model: VisionModelLike;
  prompt: string;
  images: readonly ImageContent[];
  signal: AbortSignal;
  credential?: unknown;
}>) => Promise<unknown>;

export type VisionBridgeOptions = Readonly<{
  load: (ref: ImageAttachmentRef, signal?: AbortSignal) => Promise<LoadedImageAttachment>;
  requestVision?: VisionRequest;
  /** A Pi ModelRuntime-compatible object. This avoids provider-specific HTTP code. */
  runtime?: {
    getModel?: (provider: string, modelId: string) => Model<Api> | undefined;
    complete?: (model: Model<Api>, context: unknown, options?: { signal?: AbortSignal; maxTokens?: number; maxRetries?: number }) => Promise<unknown>;
  };
  piModel?: Model<Api>;
  cache?: VisionCache;
  now?: () => number;
  schemaVersion?: string;
  timeoutMs?: number;
}>;

export type VisionCacheEntry = Readonly<{
  key: string;
  createdAt: number;
  expiresAt: number;
  model: Readonly<{ id?: string; name?: string; modelId?: string; provider?: string }>;
  imageHashes: readonly string[];
  endpoint: string;
  protocol: string;
  promptHash: string;
  schemaVersion: string;
  evidence: VisionEvidence;
}>;

export interface VisionCache {
  get(key: string, now?: number): VisionCacheEntry | undefined;
  set(key: string, value: VisionCacheEntry): void;
  clear?(): void;
}

export class MemoryVisionCache implements VisionCache {
  private readonly entries = new Map<string, VisionCacheEntry>();
  constructor(private readonly maxEntries = 100, private readonly ttlMs = 10 * 60_000) {}
  get(key: string, now = Date.now()): VisionCacheEntry | undefined {
    const item = this.entries.get(key);
    if (!item || item.expiresAt <= now) { if (item) this.entries.delete(key); return undefined; }
    this.entries.delete(key); this.entries.set(key, item); return item;
  }
  set(key: string, value: VisionCacheEntry): void {
    this.entries.delete(key); this.entries.set(key, value);
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
  }
  clear(): void { this.entries.clear(); }
  get ttl(): number { return this.ttlMs; }
}

function abortError(signal: AbortSignal): never {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted', 'AbortError');
  throw new Error('VISION_REQUEST_ABORTED');
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const forward = () => controller.abort(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
  if (signal) {
    if (signal.aborted) forward(); else signal.addEventListener('abort', forward, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error('VISION_REQUEST_TIMEOUT')), timeoutMs);
  return { signal: controller.signal, dispose: () => { clearTimeout(timer); signal?.removeEventListener('abort', forward); } };
}

function hashText(value: string): string {
  // A deterministic, dependency-free hash is enough for cache partitioning. Image identity
  // itself is supplied by AttachmentRepository's cryptographic SHA-256.
  let h1 = 0x811c9dc5; for (let i = 0; i < value.length; i++) { h1 ^= value.charCodeAt(i); h1 = Math.imul(h1, 0x01000193); }
  return (h1 >>> 0).toString(16).padStart(8, '0');
}

function modelKey(model: VisionModelLike): string {
  return `${model.provider ?? ''}|${model.modelId ?? model.id ?? ''}`;
}

function extractText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.output_text === 'string') return item.output_text;
  if (typeof item.text === 'string') return item.text;
  const content = item.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => typeof part === 'string' ? part : (part && typeof part === 'object' && typeof (part as any).text === 'string' ? (part as any).text : '')).join('');
  const choices = item.choices;
  if (Array.isArray(choices)) return extractText((choices[0] as any)?.message ?? (choices[0] as any)?.text);
  const output = item.output;
  if (Array.isArray(output)) return output.map(part => extractText(part)).filter(Boolean).join('') || undefined;
  return undefined;
}

function parseEvidence(raw: string): { evidence?: VisionEvidence; uncertainty?: string[] } {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let candidate: unknown;
  try {
    const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}');
    candidate = start >= 0 && end > start ? JSON.parse(cleaned.slice(start, end + 1)) : undefined;
  } catch { candidate = undefined; }
  const parsed = visionEvidenceSchema.safeParse(candidate);
  if (parsed.success) return { evidence: parsed.data };
  return { uncertainty: ['VISION_EVIDENCE_MALFORMED: 视觉模型输出未通过证据 schema 校验'] };
}

export class VisionBridge {
  private readonly load: VisionBridgeOptions['load'];
  private readonly requestVision?: VisionRequest;
  private readonly runtime?: VisionBridgeOptions['runtime'];
  private readonly piModel?: Model<Api>;
  private readonly cache: VisionCache;
  private readonly now: () => number;
  private readonly schemaVersion: string;
  private readonly timeoutMs: number;

  constructor(options: VisionBridgeOptions) {
    this.load = options.load; this.requestVision = options.requestVision; this.runtime = options.runtime; this.piModel = options.piModel;
    this.cache = options.cache ?? new MemoryVisionCache(); this.now = options.now ?? Date.now; this.schemaVersion = options.schemaVersion ?? '1'; this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async prepare(input: VisionPrepareInput): Promise<VisionPrepareResult> {
    const refs = [...input.attachments];
    const loaded = await Promise.all(refs.map(ref => this.load(ref, input.signal)));
    const images = loaded.map(({ ref, data }) => ({ type: 'image' as const, data: Buffer.from(data).toString('base64'), mimeType: ref.mimeType }));
    const metadata = refs.map(ref => ({ ...ref }));
    if (!refs.length) return { attachments: metadata };

    const native = input.selectedModel.supportsVision === true || input.selectedModel.input?.includes('image');
    if (native) return { images, attachments: metadata, model: input.selectedModel };

    if (input.preferences?.visionAutoFallback === false) throw new Error('VISION_MODEL_NOT_CAPABLE');
    const candidates = input.models ?? [];
    // A model entry can be marked as visual before its credential is configured.
    // Prefer only candidates that are known to have a key; keep undefined
    // compatible with injected/test models that predate the credential field.
    const usableVisual = (model: VisionModelLike) => model.supportsVision === true && model.hasKey !== false;
    const preferred = input.preferences?.visionModelId ? candidates.find(model => model.id === input.preferences?.visionModelId && usableVisual(model)) : undefined;
    const visualModel = preferred ?? candidates.find(usableVisual);
    if (!visualModel) throw new Error('VISION_MODEL_MISSING');

    const prompt = input.prompt?.trim() || '请分析图片中可见的文字、版面、对象和交互线索。只输出约定的 JSON 证据结构。';
    const imageHashes = refs.map(ref => ref.sha256);
    const endpoint = visualModel.baseUrl ?? '';
    const protocol = visualModel.protocol ?? '';
    const promptHash = hashText(prompt);
    const key = [imageHashes.join(','), endpoint, protocol, modelKey(visualModel), promptHash, this.schemaVersion].join('|');
    const cached = this.cache.get(key, this.now());
    if (cached) return { attachments: metadata, evidence: cached.evidence, model: cached.model, cached: true, cacheKey: key };

    const timeout = withTimeout(input.signal, this.timeoutMs);
    try {
      let response: unknown;
      if (this.requestVision) response = await this.requestVision({ model: visualModel, prompt, images, signal: timeout.signal, credential: input.credential });
      else {
        const model = this.piModel ?? (visualModel.provider && visualModel.modelId ? this.runtime?.getModel?.(visualModel.provider, visualModel.modelId) : undefined);
        if (!model || !this.runtime?.complete) throw new Error('VISION_RUNTIME_UNAVAILABLE');
        response = await this.runtime.complete(model, { messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...images], timestamp: this.now() }] }, { signal: timeout.signal, maxTokens: 3000, maxRetries: 0 });
      }
      if (timeout.signal.aborted) abortError(timeout.signal);
      const raw = extractText(response);
      if (!raw?.trim()) throw new Error('VISION_EMPTY_RESULT');
      const parsed = parseEvidence(raw);
      if (!parsed.evidence) return { attachments: metadata, raw, uncertainty: parsed.uncertainty, model: visualModel, cacheKey: key };
      const createdAt = this.now();
      this.cache.set(key, { key, createdAt, expiresAt: createdAt + (this.cache instanceof MemoryVisionCache ? this.cache.ttl : 10 * 60_000), model: { id: visualModel.id, name: visualModel.name, modelId: visualModel.modelId, provider: visualModel.provider }, imageHashes, endpoint, protocol, promptHash, schemaVersion: this.schemaVersion, evidence: parsed.evidence });
      return { attachments: metadata, evidence: parsed.evidence, model: visualModel, cached: false, cacheKey: key };
    } finally { timeout.dispose(); }
  }
}

export { ImageContent };
