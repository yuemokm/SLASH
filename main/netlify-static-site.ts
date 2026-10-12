import {z} from 'zod';
import {createAuthorizedOAuthFetch} from './network-target-policy.js';
import {McpCredentialVault, mcpBinding, type McpConnection} from './mcp-credentials.js';

/** Explicit user management-plane read only. No CLI cache or automatic login. */
export async function verifyPrivateNetlifySite(
  connection: McpConnection,
  vault: McpCredentialVault,
  current: () => McpConnection | undefined,
  fetcher: typeof fetch = createAuthorizedOAuthFetch({connectionId: connection.id, binding: mcpBinding(connection)})
) {
  const site = connection.mcpPublisher?.siteId;
  if (!site || !connection.enabled) throw Error('PUBLISHER_TARGET_MISSING');
  const binding = mcpBinding(connection);
  const generation = vault.generation(connection.id);
  const token = vault.publisherToken(connection);
  const guard = () => {
    const live = current();
    if (!live?.enabled || mcpBinding(live) !== binding || vault.generation(connection.id) !== generation) {
      throw Error('PUBLISHER_AUTHORIZATION_CHANGED');
    }
  };
  guard();
  const response = await fetcher('https://api.netlify.com/api/v1/sites/' + encodeURIComponent(site), {
    method: 'GET',
    signal: AbortSignal.timeout(15_000),
    headers: {Authorization: 'Bearer ' + token, Accept: 'application/json'}
  });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (!response.ok || !response.body) throw Error('PUBLISHER_SITE_UNVERIFIED');
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > 100_000) {
        await reader.cancel();
        throw Error('PUBLISHER_SITE_UNVERIFIED');
      }
      chunks.push(next.value);
    }
    const result = z.object({id: z.string()}).strip().parse(JSON.parse(Buffer.concat(chunks, total).toString('utf8')));
    if (result.id !== site) throw Error('PUBLISHER_SITE_IDENTITY');
    guard();
    vault.confirmPublisherSite(connection, generation);
    return {connectionId: connection.id, siteId: site, verified: true, verifiedAt: new Date().toISOString()};
  } finally {
    reader?.releaseLock();
    await response.body?.cancel().catch(() => {});
  }
}

