import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pgtap } from '@electric-sql/pglite-pgtap';
// @ts-expect-error JavaScript adapter deliberately shared with SQL tooling.
import { evidenceSql } from './database-evidence-sql.mjs';

// No socket, URL, credentials, files or running service: every run gets an empty
// in-memory PostgreSQL. Supabase Auth/PostgREST are separate integration checks.
const db = new PGlite({ extensions: { vector, pgtap } });
try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261008135740_knowledge_qa.sql', import.meta.url), 'utf8'));
  const version = (await db.query('select version() as postgres, extversion as vector from pg_extension where extname=\'vector\'')).rows[0];
  for (const test of ['knowledge_rls.sql', 'knowledge_publication.sql']) {
    const results = await db.exec(evidenceSql(await readFile(new URL(`../supabase/tests/${test}`, import.meta.url), 'utf8')));
    const tap = results.flatMap(result => result.rows.flatMap(row => Object.values(row).filter((value): value is string => typeof value === 'string'))).filter(line => /^(?:ok |not ok |1\.\.|#)/.test(line));
    console.log(test); tap.forEach(line => console.log(line));
    const evidence = results.flatMap(result => result.rows).find(row => row.evidence)?.evidence as { passed?: boolean; assertions?: number; tap?: string[] } | undefined;
    if (!evidence?.passed || evidence.tap?.filter(line => /^ok /.test(line)).length !== evidence.assertions) throw Error('Database assertions failed.');
    console.log(JSON.stringify(evidence));
  }
  console.log(JSON.stringify({ status: 'passed', engine: 'PGlite in-memory PostgreSQL', version, limitation: 'Supabase Auth, PostgREST, hosted extension versions and advisors still require target verification.' }));
} finally {
  await db.close();
}
