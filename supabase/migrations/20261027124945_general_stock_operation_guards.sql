-- Replay physical lot fragments through the same dated movement order as the
-- client. Values remaining in a lot, rather than rounded unit prices, own cents.
create or replace function public.stock_operation_fifo_parts(p_warehouse jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare bins jsonb:='{}'; result jsonb:='{}'; m jsonb; s jsonb; src jsonb; dst jsonb; lot jsonb; fresh_lot jsonb; part jsonb; parts jsonb; source_key text; target_key text; idx integer;
 quantity numeric; remaining numeric; take_qty numeric; lot_qty numeric; gross numeric; expense numeric; taken_gross numeric; taken_expense numeric; price numeric; status text;
begin
 for m in select value from jsonb_array_elements(coalesce(p_warehouse->'moves','[]')) with ordinality as x(value,position) order by value->>'date',position loop
  if coalesce(m->>'qty','')!~'^[0-9]+([.][0-9]+)?$' or (m->>'qty')::numeric<=0 or coalesce(m->>'itemId','')='' then continue;end if;
  quantity:=(m->>'qty')::numeric;
  source_key:=jsonb_build_array(m->>'from',m->>'itemId')::text;target_key:=jsonb_build_array(m->>'to',m->>'itemId')::text;
  if coalesce(m->>'from','')='' and coalesce(m->>'to','')<>'' then
   price:=coalesce(nullif(m->>'price','')::numeric,0);
   if price<=0 and (m->>'kind'='opening' or m->>'kind'='receipt' and coalesce(m->>'note','') like '%Массовое оприходование%') then
    select value into s from jsonb_array_elements(coalesce(p_warehouse->'moves','[]')) with ordinality x(value,position) where value->>'kind' in ('receipt','opening') and value->>'org'=m->>'org' and value->>'itemId'=m->>'itemId' and coalesce(nullif(value->>'price','')::numeric,0)>0 and coalesce(nullif(value->>'qty','')::numeric,0)>0 order by position limit 1;
    price:=coalesce((s->>'price')::numeric,0);
   end if;
   gross:=round(coalesce(nullif(m->>'amountGross','')::numeric,quantity*price)*100);
   expense:=case when m->>'vatDeductible'='true' and nullif(m->>'vatRate','') is not null then round(gross*100/(100+(m->>'vatRate')::numeric)) else gross end;
   status:=case when nullif(m->>'vatRate','') is null then 'legacy-gross' else 'verified' end;
   lot:=jsonb_build_object('source',m->>'id','qty',quantity,'gross',gross,'expense',expense,'sourceGrossValueCents',gross::text,'sourceExpenseValueCents',expense::text,'expenseValuationStatus',status,'priced',price>0);
   bins:=jsonb_set(bins,array[target_key],coalesce(bins->target_key,'[]')||jsonb_build_array(lot),true);
   continue;
  end if;
  if coalesce(m->>'from','')='' then continue;end if;
  src:=coalesce(bins->source_key,'[]');remaining:=quantity;parts:='[]';
  if jsonb_array_length(src)>0 then
   for idx in 0..jsonb_array_length(src)-1 loop
    if remaining<0.00000001 then exit;end if;
    lot:=src->idx;lot_qty:=(lot->>'qty')::numeric;
    if lot_qty<=0 or m ? 'receiptConsumptionId' and lot->>'source' is distinct from m->>'receiptConsumptionId' then continue;end if;
    take_qty:=least(remaining,lot_qty);gross:=(lot->>'gross')::numeric;expense:=(lot->>'expense')::numeric;
    taken_gross:=case when take_qty>=lot_qty then gross else round(gross*take_qty/lot_qty) end;
    taken_expense:=case when take_qty>=lot_qty then expense else round(expense*take_qty/lot_qty) end;
    part:=jsonb_build_object('source',lot->>'source','qty',take_qty,'grossValueCents',taken_gross::text,'expenseValueCents',taken_expense::text,'sourceGrossValueCents',lot->>'sourceGrossValueCents','sourceExpenseValueCents',lot->>'sourceExpenseValueCents','expenseValuationStatus',lot->>'expenseValuationStatus','priced',lot->'priced');
    parts:=parts||jsonb_build_array(part);
    fresh_lot:=lot||jsonb_build_object('qty',lot_qty-take_qty,'gross',gross-taken_gross,'expense',expense-taken_expense);
    src:=jsonb_set(src,array[idx::text],fresh_lot);
    if coalesce(m->>'to','')<>'' then
     dst:=coalesce(bins->target_key,'[]');
     bins:=jsonb_set(bins,array[target_key],dst||jsonb_build_array(lot||jsonb_build_object('qty',take_qty,'gross',taken_gross,'expense',taken_expense)),true);
    end if;
    remaining:=remaining-take_qty;
   end loop;
  end if;
  bins:=jsonb_set(bins,array[source_key],src,true);
  result:=jsonb_set(result,array[coalesce(m->>'id','')],jsonb_build_object('parts',parts,'invalid',remaining>0.00000001 or exists(select 1 from jsonb_array_elements(parts) where value->'priced' is distinct from 'true'::jsonb)),true);
 end loop;
 return result;
end $$;
revoke all on function public.stock_operation_fifo_parts(jsonb) from public,anon,authenticated;

-- General stock operations keep their warehouse and accounting sources in one
-- graph. Legacy documents without these links are deliberately unaffected.
create or replace function public.validate_general_stock_operation_graph(
 p_before_finance jsonb,p_before_warehouse jsonb,p_finance jsonb,p_warehouse jsonb
) returns void language plpgsql security invoker set search_path='' as $$
declare
 bm jsonb:=coalesce(p_before_warehouse->'moves','[]'); am jsonb:=coalesce(p_warehouse->'moves','[]');
 be jsonb:=coalesce(p_before_finance->'expenses','[]'); ae jsonb:=coalesce(p_finance->'expenses','[]');
 br jsonb:=coalesce(p_before_finance->'realizations','[]'); ar jsonb:=coalesce(p_finance->'realizations','[]');
 ids text[]; realization_ids text[]; key text; m jsonb; old_m jsonb; e jsonb; r jsonb; old_r jsonb; d jsonb; s jsonb; part jsonb; source_old jsonb; calculated jsonb; before_calculated jsonb; expected_parts jsonb; expected_part jsonb; part_index integer;
 expected_project text; kind text; source_gross numeric; source_expense numeric; source_vat numeric; qty_total numeric; gross_total numeric; expense_total numeric; line_total numeric;
begin
 select coalesce(array_agg(distinct id),'{}'::text[]) into ids from (
  select value->>'id' id from jsonb_array_elements(bm||am) where value ? 'stockOperationKind' or value ? 'stockOperationId' or value ? 'saleRealizationId' or value ? 'receiptConsumptionId' or value->>'stockPurpose'='sale'
  union select value->>'warehouseMoveId' from jsonb_array_elements(be||ae) where value ? 'saleRealizationId' or value ? 'stockOperationId' or value ? 'stockOperationKind' or value->>'stockPurpose'='sale'
  union select x.value #>> '{}' from jsonb_array_elements(br||ar) r,lateral jsonb_array_elements(case when jsonb_typeof(r.value->'warehouseMoveIds')='array' then r.value->'warehouseMoveIds' else '[]'::jsonb end) x
 ) q where nullif(id,'') is not null;
 select coalesce(array_agg(distinct id),'{}'::text[]) into realization_ids from (
  select value->>'_id' id from jsonb_array_elements(br||ar) where value ? 'warehouseSale' or value ? 'warehouseDocumentId' or value ? 'warehouseMoveIds'
  union select value->>'saleRealizationId' from jsonb_array_elements(bm||am||be||ae) where value ? 'saleRealizationId'
 ) q where nullif(id,'') is not null;
 -- A claim with an empty identity must not disappear from the graph traversal.
 if exists(select 1 from jsonb_array_elements(am) where (value ? 'stockOperationKind' or value ? 'stockOperationId' or value ? 'saleRealizationId' or value ? 'receiptConsumptionId' or value->>'stockPurpose'='sale') and coalesce(value->>'id','')='')
 or exists(select 1 from jsonb_array_elements(ar) where (value ? 'warehouseSale' or value ? 'warehouseDocumentId' or value ? 'warehouseMoveIds') and coalesce(value->>'_id','')='')
 or exists(select 1 from jsonb_array_elements(ae) where (value ? 'saleRealizationId' or value ? 'stockOperationId' or value ? 'stockOperationKind' or value->>'stockPurpose'='sale') and coalesce(value->>'warehouseMoveId','')='') then raise exception 'Stock operation has an empty source identity';end if;
 if cardinality(ids)>0 then
  calculated:=public.stock_operation_fifo_parts(p_warehouse);before_calculated:=public.stock_operation_fifo_parts(p_before_warehouse);
  -- A new/backdated operation must not reprice an unchanged later movement,
  -- including a legacy movement outside the new document graph.
  for m in select value from jsonb_array_elements(am) where coalesce(value->>'from','')<>'' loop
   if calculated#>array[m->>'id','invalid']='true'::jsonb and before_calculated#>array[m->>'id','invalid'] is distinct from 'true'::jsonb then raise exception 'Stock document creates a dated physical stock deficit';end if;
   if exists(select 1 from jsonb_array_elements(bm) b where b.value=m) and calculated#>array[m->>'id','parts'] is distinct from before_calculated#>array[m->>'id','parts'] then raise exception 'Stock document would reprice an unchanged dependent movement';end if;
  end loop;
 end if;
 foreach key in array ids loop
  select value into m from jsonb_array_elements(am) where value->>'id'=key;
  select value into old_m from jsonb_array_elements(bm) where value->>'id'=key;
  if m is null then
   if old_m->>'kind'='receipt' and exists(select 1 from jsonb_array_elements(coalesce(p_before_finance->'cash','[]')||coalesce(p_finance->'cash','[]')) c,lateral jsonb_array_elements(case when jsonb_typeof(c.value->'supplierAllocations')='array' then c.value->'supplierAllocations' else '[]'::jsonb end) a where a.value->>'documentKey'='receipt:['||to_jsonb(coalesce(old_m->>'org',''))::text||','||to_jsonb(coalesce(old_m->>'documentId',old_m->>'importId',old_m->>'id',''))::text||']') then raise exception 'A paid stock receipt cannot be cancelled';end if;
   if exists(select 1 from jsonb_array_elements(ae) where value->>'warehouseMoveId'=key)
    or exists(select 1 from jsonb_array_elements(ar) where coalesce(value->'warehouseMoveIds','[]'::jsonb) ? key)
    or exists(select 1 from jsonb_array_elements(am) where value->>'receiptConsumptionId'=key)
    or exists(select 1 from jsonb_array_elements(ae) ex,lateral jsonb_array_elements(case when jsonb_typeof(ex.value->'warehouseValuationParts')='array' then ex.value->'warehouseValuationParts' else '[]'::jsonb end) p where p.value->>'source'=key) then raise exception 'Stock operation cannot delete one linked leg';end if;
   continue;
  end if;
  if (select count(*) from jsonb_array_elements(am) where value->>'id'=key)<>1 then raise exception 'Stock movement identity must be unique';end if;
  kind:=m->>'stockOperationKind';
  if kind is null or kind not in ('consume','sale','receipt-consume') or coalesce(m->>'stockOperationId','')='' or m->>'documentId' is distinct from 'STOCK-'||(m->>'stockOperationId') then raise exception 'Stock operation metadata cannot be stripped or changed independently';end if;
  if coalesce(m->>'org','')='' or coalesce(m->>'dealId','')='' or coalesce(m->>'itemId','')='' or left(coalesce(m->>'date',''),10)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(m->>'qty','')!~'^[0-9]+([.][0-9]+)?$' or (m->>'qty')::numeric<=0 then raise exception 'Stock operation requires organization, project, date, item and positive quantity';end if;
  perform left(m->>'date',10)::date;
  if (select count(*) from jsonb_array_elements(coalesce(p_finance->'deals','[]')) where value->>'_id'=m->>'dealId')<>1 then raise exception 'Stock operation project is missing or ambiguous';end if;
  select value into d from jsonb_array_elements(p_finance->'deals') where value->>'_id'=m->>'dealId';
  if d->>'org' is distinct from m->>'org' then raise exception 'Stock operation crosses organizations';end if;
  if (select count(*) from jsonb_array_elements(coalesce(p_warehouse->'places','[]')) where value->>'id'=case when m->>'kind'='receipt' then m->>'to' else m->>'from' end and value->>'org'=m->>'org')<>1 then raise exception 'Stock operation storage place is missing, ambiguous or foreign';end if;
  if (select count(*) from jsonb_array_elements(coalesce(p_warehouse->'items','[]')) where value->>'id'=m->>'itemId' and (coalesce(value->>'org','')='' or value->>'org'=m->>'org'))<>1 then raise exception 'Stock operation item is missing, ambiguous or foreign';end if;
  -- Read the stable project key from accounting links; validate it against the
  -- same deal key used by the app (encodeURIComponent is needed for 1C numbers).
  expected_project:=d->>'org'||'::'||case when btrim(coalesce(d->>'order1c',''))='' then coalesce(d->>'name','') else '1C#'||public.stock_operation_uri_component(btrim(d->>'order1c')) end;
  if exists(select 1 from jsonb_array_elements(am) x where x.value->>'stockOperationId'=m->>'stockOperationId' and (x.value->>'stockOperationKind' is distinct from kind or x.value->>'documentId' is distinct from m->>'documentId' or x.value->>'org' is distinct from m->>'org' or x.value->>'dealId' is distinct from m->>'dealId' or left(x.value->>'date',10) is distinct from left(m->>'date',10))) then raise exception 'Stock document has inconsistent source fields';end if;
  if m->>'kind'='receipt' and kind='receipt-consume' then
   if (select count(*) from jsonb_array_elements(am) where value->>'receiptConsumptionId'=key)<>1 then raise exception 'Immediate receipt requires exactly one matching consumption';end if;
   continue;
  end if;
  if m->>'kind' is distinct from 'consume' or coalesce(m->>'from','')='' or coalesce(m->>'to','')<>'' then raise exception 'Stock operation requires an outgoing consumption';end if;
  if kind='receipt-consume' then
   if (select count(*) from jsonb_array_elements(am) where value->>'id'=m->>'receiptConsumptionId')<>1 then raise exception 'Immediate consumption receipt is missing or ambiguous';end if;
   select value into s from jsonb_array_elements(am) where value->>'id'=m->>'receiptConsumptionId';
   if s->>'kind' is distinct from 'receipt' or s->>'stockOperationKind' is distinct from kind or s->>'documentId' is distinct from m->>'documentId' or s->>'stockOperationId' is distinct from m->>'stockOperationId' or s->>'org' is distinct from m->>'org' or s->>'dealId' is distinct from m->>'dealId' or s->>'itemId' is distinct from m->>'itemId' or s->>'to' is distinct from m->>'from' or left(s->>'date',10) is distinct from left(m->>'date',10) or (s->>'qty')::numeric is distinct from (m->>'qty')::numeric then raise exception 'Immediate consumption does not match its receipt';end if;
  elsif m ? 'receiptConsumptionId' then raise exception 'Unexpected immediate receipt link';end if;
  if (select count(*) from jsonb_array_elements(ae) where value->>'warehouseMoveId'=key)<>1 then raise exception 'Stock consumption requires exactly one source expense';end if;
  select value into e from jsonb_array_elements(ae) where value->>'warehouseMoveId'=key;
  if e->>'_id' is distinct from 'warehouse-consume-'||key or (select count(*) from jsonb_array_elements(ae) where value->>'_id'=e->>'_id')<>1 or e->>'org' is distinct from m->>'org' or e->>'projectKey' is distinct from expected_project or left(e->>'date',10) is distinct from left(m->>'date',10) then raise exception 'Stock expense has an invalid source, project, organization or date';end if;
  if e ? 'stockOperationId' and e->>'stockOperationId' is distinct from m->>'stockOperationId' or e ? 'stockOperationKind' and e->>'stockOperationKind' is distinct from kind then raise exception 'Stock expense operation metadata disagrees with its source';end if;
  if (e->>'vatRate')::numeric is distinct from 0 or (e->>'vatAmount')::numeric is distinct from 0 or e->'vatDeductible' is distinct from 'false'::jsonb or jsonb_typeof(e->'warehouseValuationParts') is distinct from 'array' or jsonb_array_length(e->'warehouseValuationParts')=0 then raise exception 'Stock expense must retain its source valuation and internal tax policy';end if;
  if kind='receipt-consume' and (jsonb_array_length(e->'warehouseValuationParts')<>1 or e#>>'{warehouseValuationParts,0,source}' is distinct from m->>'receiptConsumptionId') then raise exception 'Immediate consumption must value its exact receipt lot';end if;
  expected_parts:=calculated#>array[key,'parts'];
  if calculated#>array[key,'invalid'] is distinct from 'false'::jsonb or jsonb_array_length(expected_parts)<>jsonb_array_length(e->'warehouseValuationParts') then raise exception 'Stock consumption exceeds physical dated lot balances';end if;
  part_index:=0;qty_total:=0;gross_total:=0;expense_total:=0;
  for part in select value from jsonb_array_elements(e->'warehouseValuationParts') loop
   expected_part:=expected_parts->part_index;part_index:=part_index+1;
   if part->>'source' is distinct from expected_part->>'source' or abs((part->>'qty')::numeric-(expected_part->>'qty')::numeric)>0.00000001 or (part->>'grossValueCents')::numeric is distinct from (expected_part->>'grossValueCents')::numeric or (part->>'expenseValueCents')::numeric is distinct from (expected_part->>'expenseValueCents')::numeric then raise exception 'Stock expense does not match physical FIFO source and value';end if;
   if (select count(*) from jsonb_array_elements(am) where value->>'id'=part->>'source')<>1 then raise exception 'Stock expense source is missing or ambiguous';end if;
   select value into s from jsonb_array_elements(am) where value->>'id'=part->>'source';
   if coalesce(s->>'kind','') not in ('receipt','opening') or coalesce(s->>'qty','')!~'^[0-9]+([.][0-9]+)?$' or (s->>'qty')::numeric<=0 or s->>'org' is distinct from m->>'org' or s->>'itemId' is distinct from m->>'itemId' or left(s->>'date',10)>left(m->>'date',10) or coalesce(part->>'qty','')!~'^[0-9]+([.][0-9]+)?$' or (part->>'qty')::numeric<=0 or (part->>'qty')::numeric>(s->>'qty')::numeric then raise exception 'Stock expense references an invalid source lot';end if;
   select value into source_old from jsonb_array_elements(bm) where value->>'id'=part->>'source';
   if source_old is not null and (source_old->'qty',source_old->'price',source_old->'amountGross',source_old->'amountNet',source_old->'vatAmount',source_old->'vatRate',source_old->'vatDeductible',source_old->'org',source_old->'itemId',source_old->'from',source_old->'to',source_old->>'date') is distinct from (s->'qty',s->'price',s->'amountGross',s->'amountNet',s->'vatAmount',s->'vatRate',s->'vatDeductible',s->'org',s->'itemId',s->'from',s->'to',s->>'date') then raise exception 'A consumed stock source cannot change its economics or tax policy';end if;
   source_gross:=round(coalesce(nullif(s->>'amountGross','')::numeric,(s->>'qty')::numeric*(s->>'price')::numeric)*100);
   if source_gross is null or source_gross<0 then raise exception 'Stock source amount is invalid';end if;
   source_expense:=source_gross;
   if nullif(s->>'vatRate','') is not null then
    if (s->>'vatRate')::numeric not in (0,5,7,10,20,22) then raise exception 'Stock source VAT policy is invalid';end if;
    source_vat:=source_gross-round(source_gross*100/(100+(s->>'vatRate')::numeric));
    if nullif(s->>'amountNet','') is not null and round((s->>'amountNet')::numeric*100)<>source_gross-source_vat or nullif(s->>'vatAmount','') is not null and round((s->>'vatAmount')::numeric*100)<>source_vat then raise exception 'Stock source VAT amounts are invalid';end if;
    if (s->>'vatRate')::numeric<>0 and coalesce(s->>'vatDeductible','') not in ('true','false') then raise exception 'Stock source VAT deduction is unconfirmed';end if;
    if s->>'vatDeductible'='true' then source_expense:=source_gross-source_vat;end if;
   elsif s ? 'vatDeductible' or s ? 'amountNet' or s ? 'vatAmount' then raise exception 'Stock source VAT rate is missing';end if;
   if (part->>'sourceGrossValueCents')::numeric is distinct from source_gross or (part->>'sourceExpenseValueCents')::numeric is distinct from source_expense or coalesce(part->>'grossValueCents','')!~'^[0-9]+$' or coalesce(part->>'expenseValueCents','')!~'^[0-9]+$' or (part->>'grossValueCents')::numeric>source_gross or (part->>'expenseValueCents')::numeric>source_expense then raise exception 'Stock source economics were changed without coherent valuation';end if;
   if (select sum((p.value->>'qty')::numeric) from jsonb_array_elements(ae) ex,lateral jsonb_array_elements(case when jsonb_typeof(ex.value->'warehouseValuationParts')='array' then ex.value->'warehouseValuationParts' else '[]'::jsonb end) p where p.value->>'source'=s->>'id')>(s->>'qty')::numeric then raise exception 'Stock source quantity is consumed more than once';end if;
   qty_total:=qty_total+(part->>'qty')::numeric;gross_total:=gross_total+(part->>'grossValueCents')::numeric;expense_total:=expense_total+(part->>'expenseValueCents')::numeric;
  end loop;
  if abs(qty_total-(m->>'qty')::numeric)>0.00000001 or round((e->>'amount')::numeric*100) is distinct from expense_total or round((e->>'amountGross')::numeric*100) is distinct from expense_total or round((e->>'amountNet')::numeric*100) is distinct from expense_total or round((e->>'warehouseGrossAmount')::numeric*100) is distinct from gross_total then raise exception 'Stock expense amount does not match its source valuation';end if;
  if old_m is not distinct from m and exists(select 1 from jsonb_array_elements(be) x where x.value->>'warehouseMoveId'=key and (x.value-array['note','createdAt','createdBy','updatedAt','updatedBy','amount','amountGross','amountNet','warehouseGrossAmount','vatRate','vatAmount','valuationStatus','vatRateSource']) is distinct from (e-array['note','createdAt','createdBy','updatedAt','updatedBy','amount','amountGross','amountNet','warehouseGrossAmount','vatRate','vatAmount','valuationStatus','vatRateSource'])) then raise exception 'Stock expense must be edited through its warehouse document';end if;
  if kind='sale' then
   if m->>'stockPurpose' is distinct from 'sale' or e->>'stockPurpose' is distinct from 'sale' or coalesce(m->>'saleRealizationId','')='' or e->>'saleRealizationId' is distinct from m->>'saleRealizationId' then raise exception 'Stock sale links cannot be removed or changed independently';end if;
   if (select count(*) from jsonb_array_elements(ar) where value->>'_id'=m->>'saleRealizationId')<>1 then raise exception 'Stock sale realization is missing or ambiguous';end if;
   select value into r from jsonb_array_elements(ar) where value->>'_id'=m->>'saleRealizationId';
   if old_m is not null and (old_m-array['note','createdAt','createdBy','updatedAt','updatedBy']) is distinct from (m-array['note','createdAt','createdBy','updatedAt','updatedBy']) and exists(select 1 from jsonb_array_elements(br) x where x.value->>'_id'=m->>'saleRealizationId' and (x.value-array['note','createdAt','createdBy','updatedAt','updatedBy']) is not distinct from (r-array['note','createdAt','createdBy','updatedAt','updatedBy'])) then raise exception 'Stock sale must be edited as a complete warehouse document';end if;
   if r->'warehouseSale' is distinct from 'true'::jsonb or r->>'warehouseDocumentId' is distinct from m->>'documentId' or r->>'org' is distinct from m->>'org' or r->>'projectKey' is distinct from expected_project or left(r->>'date',10) is distinct from left(m->>'date',10) or not coalesce(r->'warehouseMoveIds','[]'::jsonb) ? key then raise exception 'Stock sale realization has invalid warehouse links';end if;
  elsif m ? 'saleRealizationId' or m->>'stockPurpose'='sale' or e ? 'saleRealizationId' or e->>'stockPurpose'='sale' then raise exception 'Unexpected stock sale link';end if;
 end loop;
 foreach key in array realization_ids loop
  select value into r from jsonb_array_elements(ar) where value->>'_id'=key;
  select value into old_r from jsonb_array_elements(br) where value->>'_id'=key;
  if r is null then
   if exists(select 1 from jsonb_array_elements(am||ae) where value->>'saleRealizationId'=key) then raise exception 'Stock sale cannot delete its realization alone';end if;
   continue;
  end if;
  if (select count(*) from jsonb_array_elements(ar) where value->>'_id'=key)<>1 or r->'warehouseSale' is distinct from 'true'::jsonb or coalesce(r->>'warehouseDocumentId','')='' or jsonb_typeof(r->'warehouseMoveIds') is distinct from 'array' or jsonb_array_length(r->'warehouseMoveIds')=0 then raise exception 'Stock sale realization metadata cannot be stripped';end if;
  if (select count(distinct value #>> '{}') from jsonb_array_elements(r->'warehouseMoveIds'))<>jsonb_array_length(r->'warehouseMoveIds') or exists(select 1 from jsonb_array_elements(r->'warehouseMoveIds') x where jsonb_typeof(x.value)<>'string' or x.value #>> '{}'='' or (select count(*) from jsonb_array_elements(am) m where m.value->>'id'=x.value #>> '{}' and m.value->>'saleRealizationId'=key and m.value->>'stockOperationKind'='sale')<>1) or (select count(*) from jsonb_array_elements(am) where value->>'saleRealizationId'=key)<>jsonb_array_length(r->'warehouseMoveIds') then raise exception 'Stock sale realization movement list is incomplete or ambiguous';end if;
  if coalesce(r->>'amountGross',r->>'amount','')!~'^[0-9]+([.][0-9]{1,2})?$' or coalesce(r->>'amountGross',r->>'amount')::numeric<=0 then raise exception 'Stock sale requires a positive exact revenue amount';end if;
  if r ? 'amount' and (r->>'amount')::numeric is distinct from coalesce(r->>'amountGross',r->>'amount')::numeric then raise exception 'Stock sale revenue amounts disagree';end if;
  if coalesce(r->>'vatRate','')!~'^[0-9]+$' or (r->>'vatRate')::numeric not in (0,5,7,10,20,22) or round((r->>'vatAmount')::numeric*100) is distinct from round(coalesce(r->>'amountGross',r->>'amount')::numeric*100)-round(coalesce(r->>'amountGross',r->>'amount')::numeric*100*100/(100+(r->>'vatRate')::numeric)) or round((r->>'amountNet')::numeric*100) is distinct from round(coalesce(r->>'amountGross',r->>'amount')::numeric*100)-round((r->>'vatAmount')::numeric*100) then raise exception 'Stock sale VAT amounts disagree';end if;
  if r ? 'lines' then
   if jsonb_typeof(r->'lines') is distinct from 'array' or jsonb_array_length(r->'lines')=0 then raise exception 'Stock sale lines are invalid';end if;
   select sum((value->>'amountGross')::numeric) into line_total from jsonb_array_elements(r->'lines');
   if exists(select 1 from (select value->>'itemId' item,sum((value->>'qty')::numeric) qty from jsonb_array_elements(r->'lines') group by 1) l full join (select value->>'itemId' item,sum((value->>'qty')::numeric) qty from jsonb_array_elements(am) where value->>'saleRealizationId'=key group by 1) m using(item) where l.item is null or m.item is null or l.qty is distinct from m.qty) then raise exception 'Stock sale lines do not match shipped quantities';end if;
   if line_total is distinct from coalesce(r->>'amountGross',r->>'amount')::numeric or exists(select 1 from jsonb_array_elements(r->'lines') where coalesce(value->>'amountGross','')!~'^[0-9]+([.][0-9]{1,2})?$' or coalesce(value->>'qty','')!~'^[0-9]+([.][0-9]+)?$' or (value->>'qty')::numeric<=0 or coalesce(value->>'price','')!~'^[0-9]+([.][0-9]+)?$' or round((value->>'qty')::numeric*(value->>'price')::numeric,2)<>(value->>'amountGross')::numeric) then raise exception 'Stock sale line amounts do not reconcile';end if;
  end if;
  if old_r is not null and (old_r-array['note','createdAt','createdBy','updatedAt','updatedBy']) is distinct from (r-array['note','createdAt','createdBy','updatedAt','updatedBy']) and not exists(select 1 from jsonb_array_elements(bm) b full join jsonb_array_elements(am) a on a.value->>'id'=b.value->>'id' where (a.value->>'saleRealizationId'=key or b.value->>'saleRealizationId'=key) and a.value is distinct from b.value) then raise exception 'Stock sale realization must be edited through its warehouse document';end if;
 end loop;
end $$;
revoke all on function public.validate_general_stock_operation_graph(jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;

-- Match JavaScript encodeURIComponent without depending on extensions.
create or replace function public.stock_operation_uri_component(p_value text)
returns text language plpgsql immutable strict security invoker set search_path='' as $$
declare bytes bytea:=convert_to(p_value,'UTF8'); result text:=''; n integer; byte integer;
begin
 for n in 0..length(bytes)-1 loop
  byte:=get_byte(bytes,n);
  if byte between 48 and 57 or byte between 65 and 90 or byte between 97 and 122 or byte in (45,95,46,33,126,42,39,40,41) then result:=result||chr(byte);else result:=result||'%'||upper(lpad(to_hex(byte),2,'0'));end if;
 end loop;
 return result;
end $$;
revoke all on function public.stock_operation_uri_component(text) from public,anon,authenticated;

-- Retain the deployed writer verbatim, including active-session, identity, role,
-- CAS, audit and period guards. Only the existing authenticated RPC can enter it.
do $$ declare definition text;begin
 if to_regprocedure('public._update_shared_state_stock_base(text,jsonb,bigint)') is null then
  select pg_get_functiondef('public.update_shared_state(text,jsonb,bigint)'::regprocedure) into definition;
  definition:=replace(definition,'FUNCTION public.update_shared_state(', 'FUNCTION public._update_shared_state_stock_base(');
  execute definition;
 end if;
end $$;
revoke all on function public._update_shared_state_stock_base(text,jsonb,bigint) from public,anon,authenticated;

create or replace function public.update_shared_state(p_store text,p_payload jsonb,p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare changes jsonb; change jsonb; before_finance jsonb; before_warehouse jsonb; after_finance jsonb; after_warehouse jsonb; result bigint; finance_revision bigint; warehouse_revision bigint;
begin
 if not public.has_active_finance_session() then raise exception 'Session revoked or expired';end if;
 if not exists(select 1 from public.staff_access a where a.user_id=auth.uid() and a.enabled and a.role in ('admin','accountant')) then raise exception 'Access denied';end if;
 if p_store='stock-batch' then changes:=p_payload;else changes:=jsonb_build_array(jsonb_build_object('store',p_store,'payload',p_payload,'expected_revision',p_expected_revision));end if;
 if jsonb_typeof(changes) is distinct from 'array' then raise exception 'Changes must be an array';end if;
 if jsonb_array_length(changes) not between 1 and 2 then raise exception 'One or two stores required';end if;
 for change in select value from jsonb_array_elements(changes) loop
  if jsonb_typeof(change) is distinct from 'object' or coalesce(change->>'store','') not in ('finance','warehouse') or jsonb_typeof(change->'payload') is distinct from 'object' or jsonb_typeof(change->'expected_revision') is distinct from 'number' or coalesce(change->>'expected_revision','')!~'^[0-9]+$' then raise exception 'Invalid store change';end if;
  perform (change->>'expected_revision')::bigint;
 end loop;
 if (select count(distinct value->>'store') from jsonb_array_elements(changes))<>jsonb_array_length(changes) then raise exception 'Duplicate store';end if;
 -- Every write acquires both locks in the same order, including generic editors.
 select payload,revision into before_finance,finance_revision from public.finance_state where id='main' for update;
 select payload,revision into before_warehouse,warehouse_revision from public.warehouse_state where id='main' for update;
 after_finance:=before_finance;after_warehouse:=before_warehouse;
 for change in select value from jsonb_array_elements(changes) loop
  if change->>'store'='finance' then
   if finance_revision is distinct from (change->>'expected_revision')::bigint then raise exception 'Version conflict';end if;
   after_finance:=change->'payload';
  else
   if warehouse_revision is distinct from (change->>'expected_revision')::bigint then raise exception 'Version conflict';end if;
   after_warehouse:=change->'payload';
  end if;
 end loop;
 perform public.validate_general_stock_operation_graph(before_finance,before_warehouse,after_finance,after_warehouse);
 for change in select value from jsonb_array_elements(changes) order by case value->>'store' when 'finance' then 0 else 1 end loop
  result:=public._update_shared_state_stock_base(change->>'store',change->'payload',(change->>'expected_revision')::bigint);
 end loop;
 return case when p_store='stock-batch' then 0 else result end;
end $$;
revoke all on function public.update_shared_state(text,jsonb,bigint) from public,anon;
grant execute on function public.update_shared_state(text,jsonb,bigint) to authenticated;

create or replace function public.update_shared_state_batch(p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 -- No caller-controlled bypass flag: the existing guarded writer validates the
 -- complete batch under its row locks before calling the preserved writer.
 perform public.update_shared_state('stock-batch',p_changes,0);
 select jsonb_object_agg(value->>'store',(value->>'expected_revision')::bigint+1) into result from jsonb_array_elements(p_changes);
 return result;
end $$;
revoke all on function public.update_shared_state_batch(jsonb) from public,anon;
grant execute on function public.update_shared_state_batch(jsonb) to authenticated;
