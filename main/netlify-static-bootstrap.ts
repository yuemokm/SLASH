import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {privateNetlifyBootstrapSchema} from '../shared/netlify-static-private.js';

export const PRIVATE_BOOTSTRAP_BYTES = 24_000_000;

export async function readPrivateNetlifyBootstrap(
  file: string,
  hash: string,
  io: Pick<typeof fs, 'lstat' | 'readFile'> = fs
) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw Error('PRIVATE_BOOTSTRAP_INVALID');
  const stat = await io.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > PRIVATE_BOOTSTRAP_BYTES) {
    throw Error('PRIVATE_BOOTSTRAP_INVALID');
  }
  const bytes = await io.readFile(file);
  if (bytes.length > PRIVATE_BOOTSTRAP_BYTES) throw Error('PRIVATE_BOOTSTRAP_INVALID');
  if (createHash('sha256').update(bytes).digest('hex') !== hash) {
    throw Error('PRIVATE_BOOTSTRAP_CHANGED');
  }
  return privateNetlifyBootstrapSchema.parse(JSON.parse(bytes.toString('utf8')));
}

