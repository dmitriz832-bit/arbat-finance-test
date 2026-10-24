-- Existing Supabase schema only. Test documents live in pg_temp, never in real finance_state.
-- Every temporary period and privilege change is rolled back.
begin;
do $$ begin if exists(select 1 from public.finance_periods where period='2099-05') then raise exception 'Isolated audit month is already in use';end if;end $$;
create temporary table finance_state(payload jsonb,revision bigint);
create trigger isolated_tax_register_guard before update of payload on pg_temp.finance_state for each row execute function public.enforce_tax_event_register_periods();
create trigger isolated_document_period_guard before update of payload on pg_temp.finance_state for each row execute function public.enforce_closed_finance_periods();
insert into pg_temp.finance_state values ('{"cash":[{"_id":"isolated-in","org":"АРБАТ.ГК","type":"in","date":"2099-05-01","amount":122},{"_id":"isolated-out","org":"АРБАТ.ГК","type":"out","date":"2099-05-02","amount":122}],"vatAdvanceEvents":[{"_id":"a","kind":"received","org":"АРБАТ.ГК","cashId":"isolated-in","date":"2099-05-01","amount":122,"vatRate":22},{"_id":"r","kind":"refund","org":"АРБАТ.ГК","cashId":"isolated-out","advanceId":"a","date":"2099-05-02","amount":122}]}',1);
grant select,update on pg_temp.finance_state to authenticated;
set local role authenticated;
do $$ begin
 begin
  update pg_temp.finance_state set payload=jsonb_set(payload,'{taxObligationEvents}','[{"_id":"t","org":"АРБАТ.ГК","kind":"payment","date":"2099-05-02","cashId":"isolated-out","amount":122,"tax":"vat","period":"2099-Q2","confirmed":true}]');
  raise exception 'Expected shared source budget rejection';
 exception when others then if sqlerrm not like 'Tax event payment reference%' then raise;end if;end;
end $$;
reset role;
insert into public.finance_periods(period,status) values('2099-05','closed');
set local role authenticated;
do $$ begin
 begin
  update pg_temp.finance_state set payload=jsonb_set(payload,'{cash,0,usnVatDocument}','"Changed evidence"');
  raise exception 'Expected closed document rejection';
 exception when others then if sqlerrm not like 'Financial period 2099-05 is closed:%' then raise;end if;end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.update_shared_state_batch(jsonb)','execute') then raise exception 'Anonymous write endpoint exposed';end if;
 if has_table_privilege('authenticated','public.finance_state','update') then raise exception 'Direct finance write bypass';end if;
 if (select jsonb_array_length(payload->'cash') from pg_temp.finance_state)<>2 then raise exception 'Fixture changed after rejected write';end if;
end $$;
rollback;
