-- New dated workspaces share closed-period and approval protection.
create or replace function public.enforce_financial_workspaces()
returns trigger language plpgsql security definer set search_path='' as $$
declare section text; rec jsonb; before_rows jsonb; after_rows jsonb; period_key text; row_key text; fresh jsonb; actor_admin boolean;
begin
 if old.payload is not distinct from new.payload then return new;end if;
 actor_admin:=auth.uid() is null or exists(select 1 from public.staff_access where user_id=auth.uid() and enabled and role='admin');
 foreach section in array array['loanContracts','fixedAssets','budgetVersions','paymentRequests','deals'] loop
  if (old.payload->section) is not distinct from (new.payload->section) then continue;end if;
  if new.payload ? section and jsonb_typeof(new.payload->section)<>'array' then raise exception 'Financial workspace % must be an array',section;end if;
  before_rows:=case when jsonb_typeof(old.payload->section)='array' then old.payload->section else '[]'::jsonb end;
  after_rows:=case when jsonb_typeof(new.payload->section)='array' then new.payload->section else '[]'::jsonb end;
  if section='budgetVersions' then
   for rec in select value from jsonb_array_elements(before_rows) where value->>'status'='approved' loop
    row_key:=coalesce(rec->>'_id',rec->>'id');
    select value into fresh from jsonb_array_elements(after_rows) where coalesce(value->>'_id',value->>'id')=row_key;
    if (rec - array['createdBy','createdAt','updatedBy','updatedAt']) is distinct from (fresh - array['createdBy','createdAt','updatedBy','updatedAt']) then raise exception 'Approved budget is immutable: create a new version';end if;
   end loop;
  end if;
  for rec in
   (select value from jsonb_array_elements(before_rows) except all select value from jsonb_array_elements(after_rows))
   union all
   (select value from jsonb_array_elements(after_rows) except all select value from jsonb_array_elements(before_rows))
  loop
   if section in ('budgetVersions','paymentRequests') and rec->>'status'='approved' and not actor_admin then raise exception 'Admin approval required';end if;
   for period_key in
    select distinct left(value #>> '{}',7)
    from jsonb_path_query(rec,'$.** ? (@.type() == "string")') q(value)
    where value #>> '{}' ~ '^[0-9]{4}-(0[1-9]|1[0-2])(-[0-9]{2})?$'
   loop
    if exists(select 1 from public.finance_periods where period=period_key and status='closed') then raise exception 'Financial period % is closed: % cannot be changed.',period_key,section;end if;
   end loop;
   -- Links change the settlement in the original payment month.
   for row_key in select value #>> '{}' from jsonb_path_query(rec,'$.**.cashId') q(value) loop
    for period_key in select distinct left(c.value->>'date',7)
    from jsonb_array_elements(coalesce(old.payload->'cash','[]'::jsonb)||coalesce(new.payload->'cash','[]'::jsonb)) c(value)
    where coalesce(c.value->>'_id',c.value->>'id')=row_key
    loop
     if exists(select 1 from public.finance_periods where period=period_key and status='closed') then raise exception 'Financial period % is closed: linked payment cannot be changed.',period_key;end if;
    end loop;
   end loop;
  end loop;
 end loop;
 -- Once posted, accrual history cannot be changed by generic cost editors.
 for rec in select value from jsonb_array_elements(coalesce(old.payload->'costs','[]'::jsonb)) where value->>'managementAccrual'='true' loop
  row_key:=coalesce(rec->>'_id',rec->>'id');
  select value into fresh from jsonb_array_elements(coalesce(new.payload->'costs','[]'::jsonb)) where coalesce(value->>'_id',value->>'id')=row_key;
  if (rec-array['createdBy','createdAt','updatedBy','updatedAt']) is distinct from (fresh-array['createdBy','createdAt','updatedBy','updatedAt']) then raise exception 'Posted management accrual is immutable: use a subsequent-period correction';end if;
 end loop;
 -- A request owns its calendar alias. Cash settlement or explicit repair updates both.
 for rec in select value from jsonb_array_elements(coalesce(old.payload->'calendar','[]'::jsonb)) where nullif(value->>'requestId','') is not null loop
  row_key:=coalesce(rec->>'_id',rec->>'id');
  select value into fresh from jsonb_array_elements(coalesce(new.payload->'calendar','[]'::jsonb)) where coalesce(value->>'_id',value->>'id')=row_key;
  if (rec-array['createdBy','createdAt','updatedBy','updatedAt']) is distinct from (fresh-array['createdBy','createdAt','updatedBy','updatedAt']) then
   select value into before_rows from jsonb_array_elements(coalesce(old.payload->'paymentRequests','[]'::jsonb)) where coalesce(value->>'_id',value->>'id')=rec->>'requestId';
   select value into after_rows from jsonb_array_elements(coalesce(new.payload->'paymentRequests','[]'::jsonb)) where coalesce(value->>'_id',value->>'id')=rec->>'requestId';
   if (before_rows-array['createdBy','createdAt','updatedBy','updatedAt']) is not distinct from (after_rows-array['createdBy','createdAt','updatedBy','updatedAt']) then raise exception 'Payment request owns its calendar plan';end if;
  end if;
 end loop;

 return new;
end $$;
revoke all on function public.enforce_financial_workspaces() from public,anon,authenticated;
drop trigger if exists finance_workspace_guard on public.finance_state;
create trigger finance_workspace_guard before update of payload on public.finance_state for each row execute function public.enforce_financial_workspaces();
