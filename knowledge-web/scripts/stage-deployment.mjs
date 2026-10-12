import { cp, mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';

// Fresh OS temporary directory, fixed allowlist. Never copy environment files,
// node_modules, build outputs, journals, user materials or the desktop app.
const source = path.resolve(import.meta.dirname, '..');
const stage = path.join(os.tmpdir(), `slash-knowledge-deploy-${randomUUID()}`);
await mkdir(path.join(stage, 'knowledge-web'), { recursive: true });
const files = ['package.json', 'package-lock.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.ts', 'vercel.json'];
for (const name of files) await cp(path.join(source, name), path.join(stage, 'knowledge-web', name));
for (const name of ['app', 'lib']) await cp(path.join(source, name), path.join(stage, 'knowledge-web', name), { recursive: true, filter: async file => !(await lstat(file)).isSymbolicLink() });
await mkdir(path.join(stage, 'knowledge-web', 'scripts'));
await cp(path.join(source, 'scripts', 'deploy-preflight.ts'), path.join(stage, 'knowledge-web', 'scripts', 'deploy-preflight.ts'));
await mkdir(path.join(stage, 'shared'));
await cp(path.join(source, '..', 'shared', 'knowledge-base.ts'), path.join(stage, 'shared', 'knowledge-base.ts'));
await writeFile(path.join(stage, '.vercelignore'), '**/.env*\n**/node_modules/**\n**/.next/**\n**/.publication-receipts/**\n**/test-results/**\n');
const manifest = { stage, rootDirectory: 'knowledge-web', supabaseSchemaExcluded: true, environmentFilesExcluded: true, desktopAndMaterialsExcluded: true, lockHash: createHash('sha256').update(await readFile(path.join(stage, 'knowledge-web', 'package-lock.json'))).digest('hex') };
await writeFile(path.join(stage, 'stage-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
