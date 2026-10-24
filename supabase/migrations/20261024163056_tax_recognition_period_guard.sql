-- Supplement document-date guards: old and new tax recognition months are immutable when closed.
create or replace function public.enforce_tax_recognition_periods()
returns trigger language plpgsql security definer set search_path='' as $$
declare section text; rec jsonb; field text; period_key text; sections text[];
begin
 if old.payload is not distinct from new.payload then return new;end if;
 sections:=case when tg_table_name='warehouse_state' then array['moves'] else array['cash','expenses','costs','realizations','labor'] end;
 foreach section in array sections loop
  for rec in
   (select value from jsonb_array_elements(case when jsonb_typeof(old.payload->section)='array' then old.payload->section else '[]'::jsonb end) o(value)
    except all
    select value from jsonb_array_elements(case when jsonb_typeof(new.payload->section)='array' then new.payload->section else '[]'::jsonb end) n(value))
   union all
   (select value from jsonb_array_elements(case when jsonb_typeof(new.payload->section)='array' then new.payload->section else '[]'::jsonb end) n(value)
    except all
    select value from jsonb_array_elements(case when jsonb_typeof(old.payload->section)='array' then old.payload->section else '[]'::jsonb end) o(value))
  loop
   foreach field in array array['usnRecognitionDate','profitTaxRecognitionDate','vatDeductionDate'] loop
    period_key:=left(rec->>field,7);
    if exists(select 1 from public.finance_periods p where p.period=period_key and p.status='closed') then
     raise exception 'Financial period % is closed: tax recognition in % cannot be changed.',period_key,section;
    end if;
   end loop;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function public.enforce_tax_recognition_periods() from public,anon,authenticated;
drop trigger if exists finance_tax_period_guard on public.finance_state;
create trigger finance_tax_period_guard before update of payload on public.finance_state for each row execute function public.enforce_tax_recognition_periods();
drop trigger if exists warehouse_tax_period_guard on public.warehouse_state;
create trigger warehouse_tax_period_guard before update of payload on public.warehouse_state for each row execute function public.enforce_tax_recognition_periods();
