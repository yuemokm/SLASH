import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Adapt the same pgTAP source for SQL connectors returning only the final result
// set. Assertions still execute inside PostgreSQL; no JS assertion emulation.
export function evidenceSql(source) {
  const planned = Number(source.match(/select plan\((\d+)\);/)?.[1]);
  if (!planned) throw Error('Missing explicit pgTAP plan.');
  return source.replace('begin;', `begin;\ncreate temporary table knowledge_test_results(tap text);\ngrant insert,select on knowledge_test_results to authenticated,service_role;`)
    .replace(/^select (plan|ok|is|throws_ok|lives_ok)\(/gm, 'insert into knowledge_test_results select $1(')
    .replace('select * from finish();', 'insert into knowledge_test_results select * from finish();')
    .replace('rollback;', () => `do $$ begin\n if (select count(*) from knowledge_test_results where tap ~ '^ok [0-9]+') <> ${planned}\n or exists(select 1 from knowledge_test_results where tap ~ '^not ok |^# (Looks like|Bad plan)')\n then raise exception 'KNOWLEDGE_DATABASE_TEST_FAILED'; end if;\nend $$;\nselect jsonb_build_object('passed',true,'assertions',${planned},'tap',jsonb_agg(tap)) as evidence from knowledge_test_results;\nrollback;`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  if (!['knowledge_rls.sql', 'knowledge_publication.sql'].includes(name)) throw Error('Specify knowledge_rls.sql or knowledge_publication.sql.');
  console.log(evidenceSql(await readFile(new URL(`../supabase/tests/${name}`, import.meta.url), 'utf8')));
}
