-- Template created with the pinned Supabase CLI; apply only to an explicitly authorized target.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
-- Fresh projects with explicit Data API grants must also resolve vector types.
grant usage on schema extensions to authenticated,service_role;

create table public.knowledge_bases (
 id text primary key, title text not null, active_version text, sharing_enabled boolean not null default false
);
create table public.knowledge_members (
 kb_id text not null references public.knowledge_bases(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key(kb_id,user_id)
);
create table public.knowledge_indexes (
 id text primary key, kb_id text not null references public.knowledge_bases(id),
 status text not null check(status in ('published','retired')),
 fingerprint text not null, embedding_dimensions int not null check(embedding_dimensions between 1 and 8192),
 tokenizer_version text not null, manifest_hash text not null, coverage jsonb not null, created_at timestamptz not null default now(),
 unique(kb_id,id)
);
alter table public.knowledge_bases add constraint knowledge_active_fk foreign key(id,active_version) references public.knowledge_indexes(kb_id,id) deferrable initially deferred;
create table public.knowledge_documents (
 id text not null, index_id text not null, kb_id text not null,
 display_name text not null, source_version text not null, original_hash text not null,
 extracted_hash text, text_hash text not null, parser_version text not null, coverage jsonb not null,
 primary key(index_id,id), foreign key(kb_id,index_id) references public.knowledge_indexes(kb_id,id)
);
create table public.knowledge_chunks (
 id text not null, index_id text not null, kb_id text not null, document_id text not null,
 text text not null check(length(text) between 1 and 8000), text_hash text not null,
 display_name text not null, source_version text not null, locator jsonb not null,
 embedding extensions.vector not null, keywords tsvector not null,
 primary key(index_id,id), foreign key(index_id,document_id) references public.knowledge_documents(index_id,id),
 foreign key(kb_id,index_id) references public.knowledge_indexes(kb_id,id)
);
create index knowledge_chunks_keywords on public.knowledge_chunks using gin(keywords);
create index knowledge_chunks_scope on public.knowledge_chunks(kb_id,index_id);
create table public.knowledge_answers (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 kb_id text not null, index_id text not null, status text not null check(status in ('supported','conflict','insufficient')),
 hit_ids text[] not null, model text not null, duration_ms int not null check(duration_ms>=0), created_at timestamptz not null default now(),
 foreign key(kb_id,index_id) references public.knowledge_indexes(kb_id,id)
);
create table public.knowledge_feedback (
 receipt_id uuid not null references public.knowledge_answers(id), user_id uuid not null references auth.users(id),
 helpful boolean not null, primary key(receipt_id,user_id)
);
create table public.knowledge_publications (
 operation_id uuid primary key, kb_id text not null, index_id text, manifest_hash text,
 expected_active text, member_ids uuid[] not null default '{}',
 action text not null check(action in ('publish','revoke')), created_at timestamptz not null default now()
);

-- No SECURITY DEFINER helpers or user-editable metadata claims. Membership rows are read-only.
alter table public.knowledge_bases enable row level security;
alter table public.knowledge_members enable row level security;
alter table public.knowledge_indexes enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_answers enable row level security;
alter table public.knowledge_feedback enable row level security;
alter table public.knowledge_publications enable row level security;
revoke all on public.knowledge_bases,public.knowledge_members,public.knowledge_indexes,public.knowledge_documents,public.knowledge_chunks,public.knowledge_answers,public.knowledge_feedback,public.knowledge_publications from anon,authenticated;
grant select on public.knowledge_bases,public.knowledge_members,public.knowledge_indexes,public.knowledge_documents,public.knowledge_chunks,public.knowledge_answers,public.knowledge_feedback to authenticated;
grant insert on public.knowledge_answers,public.knowledge_feedback to authenticated;
grant update(helpful) on public.knowledge_feedback to authenticated;
grant all on public.knowledge_bases,public.knowledge_members,public.knowledge_indexes,public.knowledge_documents,public.knowledge_chunks,public.knowledge_answers,public.knowledge_feedback,public.knowledge_publications to service_role;
create policy member_self on public.knowledge_members for select to authenticated using(user_id=(select auth.uid()));
create policy base_member on public.knowledge_bases for select to authenticated using(sharing_enabled and exists(select 1 from public.knowledge_members m where m.kb_id=id and m.user_id=(select auth.uid())));
create policy index_active on public.knowledge_indexes for select to authenticated using(status='published' and exists(select 1 from public.knowledge_bases b where b.id=kb_id and b.active_version=knowledge_indexes.id));
create policy document_active on public.knowledge_documents for select to authenticated using(exists(select 1 from public.knowledge_indexes i where i.id=index_id and i.kb_id=knowledge_documents.kb_id));
create policy chunk_active on public.knowledge_chunks for select to authenticated using(exists(select 1 from public.knowledge_indexes i where i.id=index_id and i.kb_id=knowledge_chunks.kb_id));
create policy answer_own on public.knowledge_answers for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.knowledge_indexes i where i.id=index_id and i.kb_id=knowledge_answers.kb_id));
create policy answer_insert on public.knowledge_answers for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.knowledge_indexes i where i.id=index_id and i.kb_id=knowledge_answers.kb_id));
create policy feedback_own on public.knowledge_feedback for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.knowledge_answers a where a.id=receipt_id and a.user_id=(select auth.uid())));
create policy feedback_insert on public.knowledge_feedback for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.knowledge_answers a where a.id=receipt_id and a.user_id=(select auth.uid())));
create policy feedback_update on public.knowledge_feedback for update to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.knowledge_answers a where a.id=receipt_id and a.user_id=(select auth.uid()))) with check(user_id=(select auth.uid()) and exists(select 1 from public.knowledge_answers a where a.id=receipt_id and a.user_id=(select auth.uid())));

-- Exact vector search for this bounded first version: variable dimensions are checked per snapshot.
-- Add dimension-specific ANN indexes only after measuring actual volume and recall.
create function public.knowledge_search(p_kb text,p_index text,p_query text,p_vector extensions.vector,p_fingerprint text,p_min_similarity double precision)
returns table(id text,kb_id text,index_id text,document_id text,text text,text_hash text,display_name text,source_version text,locator jsonb,similarity double precision,keyword_rank bigint)
language sql stable security invoker set search_path='' as $$
 with scope as materialized (
   select c.*, 1-(c.embedding OPERATOR(extensions.<=>) p_vector) as sim
   from public.knowledge_chunks c join public.knowledge_indexes i on i.id=c.index_id and i.kb_id=c.kb_id
   where c.kb_id=p_kb and c.index_id=p_index and i.fingerprint=p_fingerprint
     and i.embedding_dimensions=extensions.vector_dims(p_vector) and p_min_similarity between 0 and 1
 ), semantic as (
   select s.id,row_number() over(order by s.sim desc,s.id) as rank from scope s where s.sim>=p_min_similarity order by s.sim desc,s.id limit 30
 ), keyword as (
   select s.id,row_number() over(order by ts_rank_cd(s.keywords,websearch_to_tsquery('simple',p_query)) desc,s.id) as rank
   from scope s where s.keywords @@ websearch_to_tsquery('simple',p_query) order by 2 limit 30
 ) select s.id,s.kb_id,s.index_id,s.document_id,s.text,s.text_hash,s.display_name,s.source_version,s.locator,s.sim,k.rank
 from scope s left join semantic v on v.id=s.id left join keyword k on k.id=s.id
 where v.id is not null or k.id is not null
 order by coalesce(1.0/(60+v.rank),0)+coalesce(1.0/(60+k.rank),0) desc,s.id limit 16;
$$;
revoke all on function public.knowledge_search(text,text,text,extensions.vector,text,double precision) from public,anon;
grant execute on function public.knowledge_search(text,text,text,extensions.vector,text,double precision) to authenticated;

-- One transaction publishes an immutable version, replaces its explicitly supplied member set,
-- and records an operation receipt. A network timeout must be reconciled by reading this receipt.
create function public.knowledge_publish(p_operation uuid,p_expected_active text,p_bundle jsonb,p_members uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b jsonb:=p_bundle; d jsonb; c jsonb; previous text; existing public.knowledge_publications; kb text:=b->>'kb_id'; idx text:=b->>'index_id';
begin
 if kb is null or idx is null or jsonb_typeof(b->'documents')<>'array' or jsonb_typeof(b->'chunks')<>'array' or coalesce(cardinality(p_members),0)<1 then raise exception 'INVALID_BUNDLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(kb,0));
 select * into existing from public.knowledge_publications where operation_id=p_operation;
 if found then
   if existing.kb_id<>kb or existing.index_id<>idx or existing.manifest_hash<>b->>'manifest_hash' or existing.action<>'publish' or existing.expected_active is distinct from p_expected_active or existing.member_ids is distinct from (select array_agg(x order by x) from unnest(p_members) x) then raise exception 'OPERATION_CONFLICT'; end if;
   return to_jsonb(existing);
 end if;
 insert into public.knowledge_bases(id,title) values(kb,b->>'title') on conflict(id) do nothing;
 select active_version into previous from public.knowledge_bases where id=kb for update;
 if previous is distinct from p_expected_active then raise exception 'PUBLICATION_VERSION_CHANGED'; end if;
 if exists(select 1 from public.knowledge_indexes where id=idx) then raise exception 'INDEX_IMMUTABLE'; end if;
 insert into public.knowledge_indexes(id,kb_id,status,fingerprint,embedding_dimensions,tokenizer_version,manifest_hash,coverage)
 values(idx,kb,'published',b->>'fingerprint',(b->>'dimensions')::int,b->>'tokenizer_version',b->>'manifest_hash',b->'coverage');
 for d in select value from jsonb_array_elements(b->'documents') loop
   insert into public.knowledge_documents(id,index_id,kb_id,display_name,source_version,original_hash,extracted_hash,text_hash,parser_version,coverage)
   values(d->>'id',idx,kb,d->>'display_name',d->>'source_version',d->>'original_hash',d->>'extracted_hash',d->>'text_hash',d->>'parser_version',d->'coverage');
 end loop;
 for c in select value from jsonb_array_elements(b->'chunks') loop
   if extensions.vector_dims((c->>'embedding')::extensions.vector)<>(b->>'dimensions')::int then raise exception 'DIMENSION_MISMATCH'; end if;
   insert into public.knowledge_chunks(id,index_id,kb_id,document_id,text,text_hash,display_name,source_version,locator,embedding,keywords)
   values(c->>'id',idx,kb,c->>'document_id',c->>'text',c->>'text_hash',c->>'display_name',c->>'source_version',c->'locator',(c->>'embedding')::extensions.vector,to_tsvector('simple',c->>'keywords'));
 end loop;
 update public.knowledge_indexes set status='retired' where id=previous and kb_id=kb;
 delete from public.knowledge_members where kb_id=kb;
 insert into public.knowledge_members(kb_id,user_id) select kb,unnest(p_members);
 update public.knowledge_bases set title=b->>'title',active_version=idx,sharing_enabled=true where id=kb;
 insert into public.knowledge_publications(operation_id,kb_id,index_id,manifest_hash,action,expected_active,member_ids) values(p_operation,kb,idx,b->>'manifest_hash','publish',p_expected_active,(select array_agg(x order by x) from unnest(p_members) x)) returning * into existing;
 return to_jsonb(existing);
end; $$;
revoke all on function public.knowledge_publish(uuid,text,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.knowledge_publish(uuid,text,jsonb,uuid[]) to service_role;

create function public.knowledge_revoke(p_operation uuid,p_kb text,p_expected_active text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous text; existing public.knowledge_publications;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_kb,0));
 select * into existing from public.knowledge_publications where operation_id=p_operation;
 if found then
   if existing.kb_id<>p_kb or existing.action<>'revoke' or existing.expected_active is distinct from p_expected_active then raise exception 'OPERATION_CONFLICT'; end if;
   return to_jsonb(existing);
 end if;
 select active_version into previous from public.knowledge_bases where id=p_kb for update;
 if not found or previous is distinct from p_expected_active then raise exception 'PUBLICATION_VERSION_CHANGED'; end if;
 update public.knowledge_bases set sharing_enabled=false where id=p_kb;
 insert into public.knowledge_publications(operation_id,kb_id,index_id,action,expected_active) values(p_operation,p_kb,previous,'revoke',p_expected_active) returning * into existing;
 return to_jsonb(existing);
end; $$;
revoke all on function public.knowledge_revoke(uuid,text,text) from public,anon,authenticated;
grant execute on function public.knowledge_revoke(uuid,text,text) to service_role;
