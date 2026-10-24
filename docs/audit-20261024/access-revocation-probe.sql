begin;
set local statement_timeout='15s';
create temporary table arbat_revoke_probe(label text,finance_rows int,warehouse_rows int,write_ok boolean,login_ok boolean) on commit drop;
do $probe$
declare a record; b record; claims_a text; claims_b text; fc int; wc int; payload jsonb; revision bigint; accepted boolean; login_ok boolean;
begin
 select s.user_id,s.id session_id into strict a from public.staff_access t join auth.sessions s on s.user_id=t.user_id where t.enabled and t.role='admin' and(s.not_after is null or s.not_after>now()) order by s.created_at desc limit 1;
 select t.email,s.user_id,s.id session_id into strict b from public.staff_access t join auth.sessions s on s.user_id=t.user_id where t.enabled and t.role='accountant' and(s.not_after is null or s.not_after>now()) order by s.created_at desc limit 1;
 claims_a:=jsonb_build_object('sub',a.user_id,'role','authenticated','session_id',a.session_id)::text;claims_b:=jsonb_build_object('sub',b.user_id,'role','authenticated','session_id',b.session_id)::text;
 select f.payload,f.revision into payload,revision from public.finance_state f where id='main';
 perform set_config('request.jwt.claims',claims_a,true);execute 'set local role authenticated';perform public.admin_set_staff(b.email,false,null);execute 'reset role';
 perform set_config('request.jwt.claims',claims_b,true);execute 'set local role authenticated';select count(*) into fc from public.finance_state;select count(*) into wc from public.warehouse_state;
 accepted:=false;begin perform public.update_shared_state('finance',payload,revision);accepted:=true;exception when others then null;end;
 login_ok:=false;begin perform public.claim_staff_access();login_ok:=true;exception when others then null;end;
 execute 'reset role';insert into arbat_revoke_probe values('accountant disabled',fc,wc,accepted,login_ok);
 perform set_config('request.jwt.claims',claims_a,true);execute 'set local role authenticated';perform public.admin_set_staff(b.email,true,null);execute 'reset role';
 perform set_config('request.jwt.claims',claims_b,true);execute 'set local role authenticated';select count(*) into fc from public.finance_state;select count(*) into wc from public.warehouse_state;
 accepted:=false;begin perform public.update_shared_state('finance',payload,revision);accepted:=true;exception when others then null;end;
 execute 'reset role';insert into arbat_revoke_probe values('accountant re-enabled',fc,wc,accepted,null);
end $probe$;
select * from arbat_revoke_probe;
rollback;
