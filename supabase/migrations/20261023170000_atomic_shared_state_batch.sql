-- One RPC transaction for linked finance/warehouse saves. The existing writer
-- retains active-session, staff-role, compare-and-swap and period/audit guards.
create or replace function public.update_shared_state_batch(p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare change jsonb; store_name text; next_revision bigint; result jsonb:='{}'::jsonb;
begin
 if jsonb_typeof(p_changes) is distinct from 'array' then raise exception 'Changes must be an array';end if;
 if jsonb_array_length(p_changes) not between 1 and 2 then raise exception 'One or two stores required';end if;
 -- Validate the entire request before acquiring state-row locks or writing.
 for change in select value from jsonb_array_elements(p_changes) loop
   if jsonb_typeof(change) is distinct from 'object' then raise exception 'Invalid store change';end if;
   store_name:=change->>'store';
   if store_name is null or store_name not in ('finance','warehouse') then raise exception 'Unknown store';end if;
   if jsonb_typeof(change->'payload') is distinct from 'object' then raise exception 'Store payload must be an object';end if;
   if jsonb_typeof(change->'expected_revision') is distinct from 'number'
      or coalesce(change->>'expected_revision','') !~ '^[0-9]+$' then raise exception 'Invalid expected revision';end if;
   perform (change->>'expected_revision')::bigint;
 end loop;
 if (select count(distinct value->>'store') from jsonb_array_elements(p_changes))<>jsonb_array_length(p_changes) then raise exception 'Duplicate store';end if;
 -- Deterministic lock order. Any later exception aborts every earlier write,
 -- revision increment and audit event in this RPC transaction.
 for change in select value from jsonb_array_elements(p_changes)
   order by case value->>'store' when 'finance' then 0 else 1 end
 loop
   store_name:=change->>'store';
   next_revision:=public.update_shared_state(store_name,change->'payload',(change->>'expected_revision')::bigint);
   result:=result||jsonb_build_object(store_name,next_revision);
 end loop;
 return result;
end $$;
revoke all on function public.update_shared_state_batch(jsonb) from public,anon;
grant execute on function public.update_shared_state_batch(jsonb) to authenticated;
