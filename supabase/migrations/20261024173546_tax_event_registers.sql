-- New explicit tax registers inherit the shared-state RPC, RLS and CAS permissions.
create or replace function public.enforce_tax_event_register_periods()
returns trigger language plpgsql security definer set search_path='' as $$
declare section text; rec jsonb; locked text;
begin
 foreach section in array array['vatAdvanceEvents','taxObligationEvents'] loop
  if new.payload ? section and jsonb_typeof(new.payload->section) not in ('array','null') then raise exception 'Invalid tax event register %',section;end if;
  for rec in
   (select value from jsonb_array_elements(case when jsonb_typeof(old.payload->section)='array' then old.payload->section else '[]'::jsonb end)
    except all select value from jsonb_array_elements(case when jsonb_typeof(new.payload->section)='array' then new.payload->section else '[]'::jsonb end))
   union all
   (select value from jsonb_array_elements(case when jsonb_typeof(new.payload->section)='array' then new.payload->section else '[]'::jsonb end)
    except all select value from jsonb_array_elements(case when jsonb_typeof(old.payload->section)='array' then old.payload->section else '[]'::jsonb end))
  loop
   select p.period into locked from public.finance_periods p where p.status='closed' and
    (p.period=left(rec->>'date',7) or
     section='taxObligationEvents' and
      (p.period=rec->>'period' or left(p.period,4)=rec->>'period' or
       rec->>'period'=left(p.period,4)||'-Q'||(((right(p.period,2)::int-1)/3)+1)::text)) limit 1;
   if locked is not null then raise exception 'Financial period % is closed: % cannot be changed.',locked,section;end if;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function public.enforce_tax_event_register_periods() from public,anon,authenticated;
drop trigger if exists finance_tax_event_register_guard on public.finance_state;
create trigger finance_tax_event_register_guard before update of payload on public.finance_state for each row execute function public.enforce_tax_event_register_periods();

create or replace function public.audit_tax_event_registers()
returns trigger language plpgsql security definer set search_path='' as $$
declare section text; oldarr jsonb; newarr jsonb; item jsonb; prev jsonb; rid text; actor text;
begin
 select email into actor from auth.users where id=auth.uid();
 foreach section in array array['vatAdvanceEvents','taxObligationEvents'] loop
  oldarr:=case when jsonb_typeof(old.payload->section)='array' then old.payload->section else '[]'::jsonb end;
  newarr:=case when jsonb_typeof(new.payload->section)='array' then new.payload->section else '[]'::jsonb end;
  for item in select value from jsonb_array_elements(newarr) loop
   rid:=coalesce(item->>'_id',item->>'id');prev:=null;
   select value into prev from jsonb_array_elements(oldarr) where coalesce(value->>'_id',value->>'id')=rid limit 1;
   if item is distinct from prev then insert into public.staff_activity(user_id,email,event,details) values(auth.uid(),coalesce(actor,'system'),case when prev is null then 'document_created' else 'document_updated' end,jsonb_build_object('store','finance_state','collection',section,'document_id',rid,'revision',new.revision,'before',prev,'after',item));end if;
  end loop;
  for item in select value from jsonb_array_elements(oldarr) loop
   rid:=coalesce(item->>'_id',item->>'id');
   if not exists(select 1 from jsonb_array_elements(newarr) n where coalesce(n.value->>'_id',n.value->>'id')=rid) then insert into public.staff_activity(user_id,email,event,details) values(auth.uid(),coalesce(actor,'system'),'document_deleted',jsonb_build_object('store','finance_state','collection',section,'document_id',rid,'revision',new.revision,'before',item));end if;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function public.audit_tax_event_registers() from public,anon,authenticated;
drop trigger if exists finance_tax_event_register_audit on public.finance_state;
create trigger finance_tax_event_register_audit after update of payload on public.finance_state for each row execute function public.audit_tax_event_registers();
