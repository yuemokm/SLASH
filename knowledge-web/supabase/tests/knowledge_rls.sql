-- Disposable PostgreSQL/Supabase only. Transaction always rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(11);
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000001','knowledge-fixture-a@example.invalid'),
 ('10000000-0000-0000-0000-000000000002','knowledge-fixture-b@example.invalid');
insert into public.knowledge_bases(id,title) values('rls-kb-a','fixture A'),('rls-kb-b','fixture B');
insert into public.knowledge_indexes(id,kb_id,status,fingerprint,embedding_dimensions,tokenizer_version,manifest_hash,coverage)
values ('rls-v-a','rls-kb-a','published','fixture',2,'zh-bigram-v1','fixture','{"status":"complete","limitations":[]}'),
 ('rls-v-b','rls-kb-b','published','fixture',2,'zh-bigram-v1','fixture','{"status":"complete","limitations":[]}');
update public.knowledge_bases set active_version=case id when 'rls-kb-a' then 'rls-v-a' else 'rls-v-b' end,sharing_enabled=true where id in ('rls-kb-a','rls-kb-b');
insert into public.knowledge_members(kb_id,user_id) values('rls-kb-a','10000000-0000-0000-0000-000000000001'),('rls-kb-b','10000000-0000-0000-0000-000000000002');
insert into public.knowledge_documents(id,index_id,kb_id,display_name,source_version,original_hash,text_hash,parser_version,coverage)
values('rls-doc-a','rls-v-a','rls-kb-a','fixture A','1','fixture','fixture','1','{}'),('rls-doc-b','rls-v-b','rls-kb-b','fixture B','1','fixture','fixture','1','{}');
insert into public.knowledge_chunks(id,index_id,kb_id,document_id,text,text_hash,display_name,source_version,locator,embedding,keywords)
values('rls-c-a','rls-v-a','rls-kb-a','rls-doc-a','地址只读','fixture','fixture A','1','{}','[1,0]'::extensions.vector,to_tsvector('simple','地址 只读')),
 ('rls-c-b','rls-v-b','rls-kb-b','rls-doc-b','地址只读','fixture','fixture B','1','{}','[1,0]'::extensions.vector,to_tsvector('simple','地址 只读'));
select ok(not has_table_privilege('anon','public.knowledge_chunks','select'),'anonymous cannot read chunks');
select ok(not has_table_privilege('authenticated','public.knowledge_members','insert'),'authenticated cannot grant itself membership');
select ok(not has_function_privilege('authenticated','public.knowledge_publish(uuid,text,jsonb,uuid[])','execute'),'runtime users cannot publish');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.knowledge_bases),1::bigint,'member sees only own shared base');
select is((select count(*) from public.knowledge_chunks where kb_id='rls-kb-b'),0::bigint,'cannot read cross-base chunks');
select is((select count(*) from public.knowledge_search('rls-kb-a','rls-v-a','地址','[1,0]'::extensions.vector,'fixture',0.7)),1::bigint,'hybrid query sees authorized active snapshot');
select is((select count(*) from public.knowledge_search('rls-kb-b','rls-v-b','地址','[1,0]'::extensions.vector,'fixture',0.7)),0::bigint,'hybrid query cannot bypass membership');
reset role;
update public.knowledge_indexes set status='retired' where id='rls-v-a';
set local role authenticated;
select is((select count(*) from public.knowledge_chunks where index_id='rls-v-a'),0::bigint,'retired version cannot be read directly');
reset role;
update public.knowledge_indexes set status='published' where id='rls-v-a';
update public.knowledge_bases set sharing_enabled=false where id='rls-kb-a';
set local role authenticated;
select is((select count(*) from public.knowledge_bases),0::bigint,'sharing stop immediately hides base');
select is((select count(*) from public.knowledge_search('rls-kb-a','rls-v-a','地址','[1,0]'::extensions.vector,'fixture',0.7)),0::bigint,'sharing stop immediately hides query sources');
reset role;
update public.knowledge_bases set sharing_enabled=true where id='rls-kb-a';
delete from public.knowledge_members where kb_id='rls-kb-a';
set local role authenticated;
select is((select count(*) from public.knowledge_chunks where kb_id='rls-kb-a'),0::bigint,'membership revoke hides source even with existing JWT');
reset role;
select * from finish();
rollback;
