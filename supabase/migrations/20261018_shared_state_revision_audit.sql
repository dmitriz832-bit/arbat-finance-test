create or replace function public.audit_shared_state_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare changed_sections text[];
begin
 if new.payload is not distinct from old.payload then return new; end if;
 select coalesce(array_agg(key order by key),array[]::text[]) into changed_sections
 from (
  select coalesce(before.key,after.key) as key
  from jsonb_each(coalesce(old.payload,'{}'::jsonb)) before
  full join jsonb_each(coalesce(new.payload,'{}'::jsonb)) after using(key)
  where before.value is distinct from after.value
 ) diff;
 insert into public.staff_activity(user_id,email,event,details)
 values(new.updated_by,(select u.email from auth.users u where u.id=new.updated_by),
  'shared_state_updated',jsonb_build_object('store',tg_table_name,'record',new.id,
  'revision_before',old.revision,'revision_after',new.revision,'sections',to_jsonb(changed_sections),'at',now()));
 return new;
end $$;
revoke all on function public.audit_shared_state_write() from public,anon,authenticated;
drop trigger if exists finance_state_update_audit on public.finance_state;
create trigger finance_state_update_audit after update of payload on public.finance_state for each row execute function public.audit_shared_state_write();
drop trigger if exists warehouse_state_update_audit on public.warehouse_state;
create trigger warehouse_state_update_audit after update of payload on public.warehouse_state for each row execute function public.audit_shared_state_write();
