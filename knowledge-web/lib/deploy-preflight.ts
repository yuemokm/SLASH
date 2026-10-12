import { ApiError } from './contracts.ts';
import { endpoint, modelConfig, required } from './config.ts';

export function publicSupabaseKey(value: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try { return JSON.parse(Buffer.from(value.split('.')[1] ?? '', 'base64url').toString()).role === 'anon'; } catch { return false; }
}

// Read configuration only. Never authenticates, deploys, invokes a model or prints keys.
export function deploymentPreflight(env: NodeJS.ProcessEnv, nodeVersion = process.versions.node) {
  const reject = (message: string): never => { throw new ApiError(503, 'DEPLOYMENT_NOT_READY', message); };
  if (Number(nodeVersion.split('.')[0]) !== 24) reject('问答部署需要 Node 24。');
  if (env.KNOWLEDGE_LOCAL_FIXTURE === 'true') reject('部署环境必须关闭本地演示数据。');
  if (env.SUPABASE_DEPLOYER_SECRET_KEY?.trim()) reject('问答部署环境不得包含离线发布管理密钥；请从该环境移除。');
  const publicUrl = new URL(endpoint(env, 'NEXT_PUBLIC_SUPABASE_URL'));
  if (publicUrl.pathname !== '/' || publicUrl.port) reject('Supabase 必须使用已核对的项目 HTTPS 基础地址。');
  if (!publicSupabaseKey(required(env, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'))) reject('浏览器只可配置 publishable/anon key。');
  const configuration = modelConfig(env);
  if (env.EMBEDDING_SEND_DIMENSIONS && !['true', 'false'].includes(env.EMBEDDING_SEND_DIMENSIONS)) reject('EMBEDDING_SEND_DIMENSIONS 必须为 true 或 false。');
  return {
    status: 'configuration-valid', supabaseOrigin: publicUrl.origin, nodeMajor: 24,
    embedding: { endpoint: configuration.embeddingUrl, model: configuration.embeddingModel, dimensions: configuration.dimensions, fingerprint: configuration.fingerprint },
    answer: { baseUrl: configuration.answerUrl, model: configuration.model },
    stillRequired: ['Verify intended Supabase/Vercel project and environment.', 'Run migrations, RLS and advisors on the authorized target.', 'Verify Auth, published fingerprint and real Chinese retrieval.']
  };
}
