begin;
set local statement_timeout='15s';
create temporary table arbat_role_probe(label text,active boolean,finance_rows int,warehouse_rows int,write_ok boolean,rejection text) on commit drop;
do $probe$
declare r record; claims jsonb; active boolean; fc int; wc int; payload jsonb; revision bigint; accepted boolean; rejection text;
begin
 for r in select distinct on(a.role) a.role,a.user_id,s.id session_id from public.staff_access a join auth.sessions s on s.user_id=a.user_id where a.enabled and a.role in ('admin','accountant') and(s.not_after is null or s.not_after>now()) order by a.role,s.created_at desc loop
  claims:=jsonb_build_object('sub',r.user_id,'role','authenticated','session_id',r.session_id);
  perform set_config('request.jwt.claims',claims::text,true);
  execute 'set local role authenticated';
  select public.has_active_finance_session() into active;
  select count(*) into fc from public.finance_state;
  select count(*) into wc from public.warehouse_state;
  select f.payload,f.revision into payload,revision from public.finance_state f where id='main';
  accepted:=false;rejection:=null;
  begin perform public.update_shared_state('finance',payload,revision);accepted:=true;exception when others then rejection:=sqlerrm;end;
  execute 'reset role';
  insert into arbat_role_probe values(r.role||':active',active,fc,wc,accepted,rejection);
  perform set_config('request.jwt.claims',claims::text,true);execute 'set local role authenticated';
  accepted:=false;rejection:=null;begin perform public.update_shared_state('finance',payload,revision);accepted:=true;exception when others then rejection:=sqlerrm;end;execute 'reset role';
  insert into arbat_role_probe values(r.role||':stale-revision',active,fc,wc,accepted,rejection);
  perform set_config('request.jwt.claims',jsonb_set(claims,'{session_id}',to_jsonb('00000000-0000-0000-0000-000000000000'::text))::text,true);
  execute 'set local role authenticated';
  select public.has_active_finance_session() into active;
  select count(*) into fc from public.finance_state;
  select count(*) into wc from public.warehouse_state;
  accepted:=false;rejection:=null;
  begin perform public.update_shared_state('finance',payload,revision);accepted:=true;exception when others then rejection:=sqlerrm;end;
  execute 'reset role';
  insert into arbat_role_probe values(r.role||':absent-session',active,fc,wc,accepted,rejection);
 end loop;
end $probe$;
select * from arbat_role_probe order by label;
rollback;
