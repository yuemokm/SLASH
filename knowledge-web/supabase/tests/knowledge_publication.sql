-- Disposable PostgreSQL/Supabase only. All fixtures and writes roll back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(16);
insert into auth.users(id,email) values ('20000000-0000-0000-0000-000000000001','publication-fixture@example.invalid');
create function pg_temp.bundle(idx text) returns jsonb language sql as $$
 select jsonb_build_object('kb_id','publication-kb','index_id',idx,'title','Publication fixture','manifest_hash','fixture-'||idx,'fingerprint','fixture','dimensions',2,'tokenizer_version','zh-bigram-v1','coverage','{}'::jsonb,
  'documents',jsonb_build_array(jsonb_build_object('id','doc','display_name','fixture','source_version','1','original_hash','hash','text_hash','hash','parser_version','1','coverage','{}'::jsonb)),
  'chunks',jsonb_build_array(jsonb_build_object('id','chunk','document_id','doc','text','fixture','text_hash','hash','display_name','fixture','source_version','1','locator','{}'::jsonb,'embedding',jsonb_build_array(1,0),'keywords','fixture')));
$$;
set local role service_role;
select lives_ok($$select public.knowledge_publish('20000000-0000-0000-0000-000000000010',null,pg_temp.bundle('publication-v1'),array['20000000-0000-0000-0000-000000000001']::uuid[])$$,'management role publishes complete transaction');
select is((select active_version from public.knowledge_bases where id='publication-kb'),'publication-v1','publish sets active snapshot');
select is((select extensions.vector_dims(embedding) from public.knowledge_chunks where kb_id='publication-kb'),2,'publish stores real pgvector');
select is(public.knowledge_publish('20000000-0000-0000-0000-000000000010',null,pg_temp.bundle('publication-v1'),array['20000000-0000-0000-0000-000000000001']::uuid[])->>'operation_id','20000000-0000-0000-0000-000000000010','identical operation returns original receipt');
select throws_ok($$select public.knowledge_publish('20000000-0000-0000-0000-000000000010','changed',pg_temp.bundle('publication-v1'),array['20000000-0000-0000-0000-000000000001']::uuid[])$$,'P0001','OPERATION_CONFLICT','operation cannot be rebound');
select throws_ok($$select public.knowledge_publish('20000000-0000-0000-0000-000000000011',null,pg_temp.bundle('publication-v2'),array['20000000-0000-0000-0000-000000000001']::uuid[])$$,'P0001','PUBLICATION_VERSION_CHANGED','stale expected version is refused');
select throws_ok($$select public.knowledge_publish('20000000-0000-0000-0000-000000000012','publication-v1',pg_temp.bundle('publication-v1'),array['20000000-0000-0000-0000-000000000001']::uuid[])$$,'P0001','INDEX_IMMUTABLE','published index is immutable');
select throws_ok($$select public.knowledge_publish('20000000-0000-0000-0000-000000000013','publication-v1',jsonb_set(pg_temp.bundle('publication-invalid'),'{chunks,0,embedding}','[1]'::jsonb),array['20000000-0000-0000-0000-000000000001']::uuid[])$$,'P0001','DIMENSION_MISMATCH','invalid vectors abort publication');
select is((select count(*) from public.knowledge_indexes where id='publication-invalid'),0::bigint,'failed transaction leaves no partial snapshot');
select is((select count(*) from public.knowledge_publications where operation_id='20000000-0000-0000-0000-000000000013'),0::bigint,'failed transaction leaves no success receipt');
select lives_ok($$select public.knowledge_publish('20000000-0000-0000-0000-000000000014','publication-v1',pg_temp.bundle('publication-v2'),array['20000000-0000-0000-0000-000000000001']::uuid[])$$,'matching expected version publishes next snapshot');
select is((select status from public.knowledge_indexes where id='publication-v1'),'retired','previous snapshot retires atomically');
select lives_ok($$select public.knowledge_revoke('20000000-0000-0000-0000-000000000015','publication-kb','publication-v2')$$,'management role can stop sharing');
select is((select sharing_enabled from public.knowledge_bases where id='publication-kb'),false,'stop sharing is effective');
select is(public.knowledge_revoke('20000000-0000-0000-0000-000000000015','publication-kb','publication-v2')->>'action','revoke','revoke can reconcile original receipt');
select throws_ok($$select public.knowledge_revoke('20000000-0000-0000-0000-000000000015','publication-kb','publication-v1')$$,'P0001','OPERATION_CONFLICT','revoke operation cannot be rebound');
reset role;
select * from finish();
rollback;
