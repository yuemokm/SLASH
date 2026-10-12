import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentPreflight } from '../lib/deploy-preflight.js';
const env = {
  NODE_ENV: 'production' as const,
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  EMBEDDING_ENDPOINT: 'https://model.example/embeddings', EMBEDDING_API_KEY: 'secret-embedding', EMBEDDING_MODEL: 'embed', EMBEDDING_REVISION: '1', EMBEDDING_DIMENSIONS: '2',
  ANSWER_BASE_URL: 'https://model.example/v1', ANSWER_API_KEY: 'secret-answer', ANSWER_MODEL: 'answer', RETRIEVAL_MIN_SIMILARITY: '0.7'
};
test('部署预检阻止演示、管理密钥和公开高权限密钥，结果不泄露凭据', () => {
  for (const change of [ { KNOWLEDGE_LOCAL_FIXTURE: 'true' }, { SUPABASE_DEPLOYER_SECRET_KEY: 'secret-admin' }, { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_admin' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co/rest/v1' }, { EMBEDDING_SEND_DIMENSIONS: 'yes' } ]) assert.throws(() => deploymentPreflight({ ...env, ...change }, '24.0.0'));
  const output = JSON.stringify(deploymentPreflight(env, '24.0.0'));
  assert.doesNotMatch(output, /secret-|sb_publishable_fixture/);
  assert.throws(() => deploymentPreflight(env, '26.0.0'));
  assert.throws(() => deploymentPreflight({ ...env, EMBEDDING_REVISION: '' }, '24.0.0'));
});
