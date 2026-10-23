-- LocalLens single-restaurant pilot. Apply in Supabase SQL Editor.
-- Browser clients have no data access. Only the server service role may read/write.
begin;
create table public.restaurants (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create table public.search_queries (
  id text primary key,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create table public.scan_runs (
  id uuid primary key,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  status text not null check (status in ('running','completed','partial','failed')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create unique index one_running_scan_per_restaurant on public.scan_runs(restaurant_id) where status = 'running';
create index scan_runs_restaurant_created on public.scan_runs(restaurant_id, created_at desc);
create table public.query_results (
  id uuid primary key,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  scan_id uuid not null references public.scan_runs(id) on delete cascade,
  query_id text not null references public.search_queries(id),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(scan_id, query_id)
);
create index query_results_scan on public.query_results(scan_id);
create index query_results_restaurant_created on public.query_results(restaurant_id, created_at desc);
create table public.website_audits (
  id uuid primary key,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create table public.recommendations (
  id text primary key,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create table public.content_drafts (
  id uuid primary key,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index search_queries_restaurant on public.search_queries(restaurant_id);
create index website_audits_restaurant_created on public.website_audits(restaurant_id, created_at desc);
create index recommendations_restaurant_created on public.recommendations(restaurant_id, created_at desc);
create index content_drafts_restaurant_created on public.content_drafts(restaurant_id, created_at desc);

insert into public.restaurants(id, payload) values ('cafe-athena', '{"id":"cafe-athena","name":"Café Athena","website":"https://cafeathena.com","address":"1846 Garnet Ave, San Diego, CA 92109","neighborhood":"Pacific Beach","cuisine":"Greek & Mediterranean","opened":1990,"highlights":["Daily happy hour, 3–6 PM","Tapas-style small plates","Vegan, vegetarian & gluten-free options","Full bar & mythology-themed cocktails","Catering, group dining & private events"],"provenance":"user-supplied"}');
insert into public.search_queries(id, restaurant_id, payload) values
('greek-pb','cafe-athena','{"id":"greek-pb","restaurantId":"cafe-athena","text":"What are the best Greek restaurants in Pacific Beach, San Diego?","intent":"Cuisine discovery","enabled":true}'),
('happy-hour','cafe-athena','{"id":"happy-hour","restaurantId":"cafe-athena","text":"Where should I go for Mediterranean food and happy hour in Pacific Beach, San Diego?","intent":"Occasion discovery","enabled":true}'),
('vegetarian','cafe-athena','{"id":"vegetarian","restaurantId":"cafe-athena","text":"Recommend restaurants with Greek or Mediterranean vegetarian options in Pacific Beach, San Diego.","intent":"Dietary preference","enabled":true}');

-- Transactionally claim a scan. Expired claims are marked failed before retrying.
create function public.start_scan(scan_payload jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(scan_payload->>'restaurantId'));
  update public.scan_runs set status = 'failed', payload = payload || '{"status":"failed","error":"Scan expired before completion."}'::jsonb
  where restaurant_id = scan_payload->>'restaurantId' and status = 'running' and created_at < now() - interval '5 minutes';
  insert into public.scan_runs(id,restaurant_id,status,payload) values ((scan_payload->>'id')::uuid,scan_payload->>'restaurantId','running',scan_payload);
end;
$$;
-- One transaction persists all results, preserving user-completed action statuses.
create function public.finish_scan(scan_payload jsonb, result_payloads jsonb, recommendation_payloads jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare item jsonb;
begin
  update public.scan_runs set status = scan_payload->>'status', payload = scan_payload where id = (scan_payload->>'id')::uuid and status = 'running';
  if not found then raise exception 'No running scan found'; end if;
  for item in select value from jsonb_array_elements(result_payloads) loop
    insert into public.query_results(id,restaurant_id,scan_id,query_id,payload)
    values ((item->>'id')::uuid,item->>'restaurantId',(item->>'scanId')::uuid,item->>'queryId',item);
  end loop;
  for item in select value from jsonb_array_elements(recommendation_payloads) loop
    insert into public.recommendations(id,restaurant_id,payload) values(item->>'id',item->>'restaurantId',item)
    on conflict(id) do update set payload = excluded.payload || jsonb_build_object('status',recommendations.payload->>'status');
  end loop;
end;
$$;
create function public.save_audit(audit_payload jsonb, recommendation_payloads jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare item jsonb;
begin
  insert into public.website_audits(id,restaurant_id,payload) values((audit_payload->>'id')::uuid,audit_payload->>'restaurantId',audit_payload);
  for item in select value from jsonb_array_elements(recommendation_payloads) loop
    insert into public.recommendations(id,restaurant_id,payload) values(item->>'id',item->>'restaurantId',item)
    on conflict(id) do update set payload = excluded.payload || jsonb_build_object('status',recommendations.payload->>'status');
  end loop;
end;
$$;

alter table public.restaurants enable row level security;
alter table public.search_queries enable row level security;
alter table public.scan_runs enable row level security;
alter table public.query_results enable row level security;
alter table public.website_audits enable row level security;
alter table public.recommendations enable row level security;
alter table public.content_drafts enable row level security;
revoke all on public.restaurants, public.search_queries, public.scan_runs, public.query_results, public.website_audits, public.recommendations, public.content_drafts from anon, authenticated;
grant all on public.restaurants, public.search_queries, public.scan_runs, public.query_results, public.website_audits, public.recommendations, public.content_drafts to service_role;
revoke all on function public.start_scan(jsonb), public.finish_scan(jsonb,jsonb,jsonb), public.save_audit(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.start_scan(jsonb), public.finish_scan(jsonb,jsonb,jsonb), public.save_audit(jsonb,jsonb) to service_role;
commit;
