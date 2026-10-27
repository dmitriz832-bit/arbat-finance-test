-- Preserve accounting and settlement sources when removing a mistaken asset card.
-- No additional privileges: this trigger reads only the old/new row payloads.
create or replace function public.enforce_asset_removal_integrity()
returns trigger language plpgsql security invoker set search_path='' as $$
declare rec jsonb; row_key text; assets jsonb; before_costs jsonb; after_costs jsonb; before_cash jsonb; after_cash jsonb;
begin
 if (old.payload->'fixedAssets') is not distinct from (new.payload->'fixedAssets') then return new;end if;
 assets:=case when jsonb_typeof(new.payload->'fixedAssets')='array' then new.payload->'fixedAssets' else '[]'::jsonb end;
 before_costs:=case when jsonb_typeof(old.payload->'costs')='array' then old.payload->'costs' else '[]'::jsonb end;
 after_costs:=case when jsonb_typeof(new.payload->'costs')='array' then new.payload->'costs' else '[]'::jsonb end;
 before_cash:=case when jsonb_typeof(old.payload->'cash')='array' then old.payload->'cash' else '[]'::jsonb end;
 after_cash:=case when jsonb_typeof(new.payload->'cash')='array' then new.payload->'cash' else '[]'::jsonb end;
 for rec in select value from jsonb_array_elements(case when jsonb_typeof(old.payload->'fixedAssets')='array' then old.payload->'fixedAssets' else '[]'::jsonb end) loop
  row_key:=coalesce(rec->>'_id',rec->>'id');
  if row_key is null or exists(select 1 from jsonb_array_elements(assets) a where coalesce(a.value->>'_id',a.value->>'id')=row_key) then continue;end if;
  if (jsonb_typeof(rec->'depreciationPostings')='array' and jsonb_array_length(rec->'depreciationPostings')>0)
   or exists(select 1 from jsonb_array_elements(before_costs||after_costs) c where c.value->>'sourceAssetId'=row_key) then
   raise exception 'Asset has posted accruals: retain its card and use disposal or a subsequent-period correction';
  end if;
  if (jsonb_typeof(rec->'paymentLinks')='array' and jsonb_array_length(rec->'paymentLinks')>0)
   or exists(select 1 from jsonb_array_elements(before_cash||after_cash) c,
    lateral jsonb_array_elements(case when jsonb_typeof(c.value->'supplierAllocations')='array' then c.value->'supplierAllocations' else '[]'::jsonb end) a
    where a.value->>'documentKey'='fixedAssets:'||row_key) then
   raise exception 'Asset has linked payments: correct or unlink settlement references before removing its card';
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.enforce_asset_removal_integrity() from public,anon,authenticated;
drop trigger if exists finance_asset_removal_guard on public.finance_state;
create trigger finance_asset_removal_guard before update of payload on public.finance_state for each row execute function public.enforce_asset_removal_integrity();
