-- Pure payload calculator is deliberately separate so disposable controls never
-- read or modify finance_state. It is callable only by the own-identity wrapper.
CREATE OR REPLACE FUNCTION public.payroll_employee_snapshot(p_source jsonb,p_employee text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $function$
DECLARE
  act jsonb; entry jsonb; payment jsonb; part jsonb; link jsonb;
  source_labor jsonb:=CASE WHEN jsonb_typeof(p_source->'labor')='array' THEN p_source->'labor' ELSE '[]'::jsonb END;
  source_acts jsonb:=CASE WHEN jsonb_typeof(p_source->'workActs')='array' THEN p_source->'workActs' ELSE '[]'::jsonb END;
  source_cash jsonb:=CASE WHEN jsonb_typeof(p_source->'cash')='array' THEN p_source->'cash' ELSE '[]'::jsonb END;
  source_links jsonb:=CASE WHEN jsonb_typeof(p_source->'crewSettlements')='array' THEN p_source->'crewSettlements' ELSE '[]'::jsonb END;
  rows jsonb:='[]'::jsonb; issues jsonb:='[]'::jsonb; organizations jsonb:='[]'::jsonb;
  members text[]; position_in_crew integer; member_count integer; idx integer;
  raw text; values_text text[]; values_cents numeric[]; valid boolean; own_part boolean; same_owner boolean;
  owner text; act_id text; payment_id text; quantity numeric; total_cents numeric;
  share_cents numeric; linked_cents numeric; linked_count integer; linked_invalid boolean;
  allocated numeric; own_paid numeric; allocations jsonb; has_allocations boolean;
  earned numeric:=0; tax numeric:=0; other numeric:=0; paid numeric:=0;
  payable numeric:=0; overpaid numeric:=0; balance numeric:=0;
BEGIN
  IF nullif(p_employee,'') IS NULL THEN RAISE EXCEPTION 'Access denied'; END IF;
  -- Frozen approved work snapshots, deterministic distinct member order, final-cent remainder.
  FOR act IN SELECT value FROM jsonb_array_elements(source_acts) LOOP
    IF act->>'status' IS DISTINCT FROM 'approved' OR jsonb_typeof(act->'memberIds') IS DISTINCT FROM 'array' THEN CONTINUE; END IF;
    SELECT array_agg(DISTINCT value COLLATE "C" ORDER BY value COLLATE "C") INTO members
      FROM jsonb_array_elements_text(act->'memberIds') WHERE nullif(value,'') IS NOT NULL;
    member_count:=coalesce(cardinality(members),0);position_in_crew:=array_position(members,p_employee);
    IF member_count=0 OR position_in_crew IS NULL THEN CONTINUE; END IF;
    owner:=coalesce(act->>'org','');act_id:=coalesce(nullif(act->>'id',''),act->>'_id','');
    raw:=replace(btrim(coalesce(act->>'qty','')),',','.');
    IF raw !~ '^-?[0-9]+([.][0-9]+)?$' THEN
      issues:=issues||jsonb_build_array(jsonb_build_object('code','crew-payroll-invalid-work-act','id',act_id,'org',owner));CONTINUE;
    END IF;
    quantity:=raw::numeric;
    raw:=regexp_replace(replace(btrim(coalesce(act->>'rate','')),',','.'),'[[:space:]  ]','','g');
    IF raw !~ '^-?[0-9]+([.][0-9]+)?$' THEN
      issues:=issues||jsonb_build_array(jsonb_build_object('code','crew-payroll-invalid-work-act','id',act_id,'org',owner));CONTINUE;
    END IF;
    total_cents:=round(round(raw::numeric*100)*quantity);
    IF total_cents<0 THEN
      issues:=issues||jsonb_build_array(jsonb_build_object('code','crew-payroll-invalid-work-act','id',act_id,'org',owner));CONTINUE;
    END IF;
    share_cents:=CASE WHEN position_in_crew=member_count THEN total_cents-trunc(total_cents/member_count)*(member_count-1) ELSE trunc(total_cents/member_count) END;
    linked_count:=0;linked_cents:=0;linked_invalid:=false;
    FOR entry IN SELECT value FROM jsonb_array_elements(source_labor) LOOP
      IF entry->>'personId' IS DISTINCT FROM p_employee THEN CONTINUE; END IF;
      IF coalesce(entry->>'org','')<>'' AND owner<>'' AND entry->>'org'<>owner THEN CONTINUE; END IF;
      IF coalesce(entry->>'projectKey','')<>'' AND coalesce(act->>'projectKey','')<>'' AND entry->>'projectKey'<>act->>'projectKey' THEN CONTINUE; END IF;
      IF NOT ((coalesce(nullif(entry->>'workActId',''),entry->>'actId','')<>'' AND coalesce(nullif(entry->>'workActId',''),entry->>'actId')=act_id)
        OR (coalesce(entry->>'batchId','')<>'' AND entry->>'batchId'=act->>'batchId')) THEN CONTINUE; END IF;
      linked_count:=linked_count+1;
      IF (SELECT count(*) FROM jsonb_array_elements(source_acts)w
        WHERE w->>'status'='approved'
          AND (coalesce(entry->>'org','')='' OR coalesce(w->>'org','')='' OR entry->>'org'=w->>'org')
          AND ((coalesce(nullif(entry->>'workActId',''),entry->>'actId','')<>'' AND coalesce(nullif(entry->>'workActId',''),entry->>'actId')=coalesce(nullif(w->>'id',''),w->>'_id',''))
            OR (coalesce(entry->>'batchId','')<>'' AND entry->>'batchId'=w->>'batchId')))<>1 THEN linked_invalid:=true;END IF;
      raw:=regexp_replace(replace(btrim(coalesce(entry->>'gross',entry->>'amount','0')),',','.'),'[[:space:]  ]','','g');
      IF raw ~ '^-?[0-9]+([.][0-9]+)?$' THEN linked_cents:=linked_cents+round(raw::numeric*100);ELSE linked_invalid:=true;END IF;
    END LOOP;
    IF linked_count>0 THEN
      IF linked_invalid OR linked_cents<>share_cents THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','crew-payroll-linked-amount-mismatch','id',act_id,'org',owner));END IF;
      CONTINUE;
    END IF;
    rows:=rows||jsonb_build_array(jsonb_build_object('kind','accrual','date',act->>'date','description',coalesce(act->>'priceName','Выполненные работы'),'project',act->>'projectKey','org',owner,'amount',share_cents/100,'ndfl',0,'otherDeductions',0,'id',act_id));
  END LOOP;
  -- Signed corrections are unsupported by native payroll entry. Quarantine them
  -- with a review reason rather than making employee and company totals diverge.
  FOR entry IN SELECT value FROM jsonb_array_elements(source_labor) LOOP
    IF entry->>'personId' IS DISTINCT FROM p_employee OR coalesce(entry->>'employeeVisible','true')='false' THEN CONTINUE;END IF;
    owner:=coalesce(entry->>'org','');values_text:=ARRAY[coalesce(entry->>'gross',entry->>'amount','0'),coalesce(entry->>'ndfl','0'),coalesce(entry->>'otherDeductions',entry->>'other','0'),coalesce(entry->>'employerContributions',entry->>'contributions','0')];values_cents:=ARRAY[]::numeric[];valid:=true;
    FOR idx IN 1..4 LOOP
      raw:=regexp_replace(replace(btrim(values_text[idx]),',','.'),'[[:space:]  ]','','g');
      IF raw !~ '^-?[0-9]+([.][0-9]+)?$' THEN valid:=false;EXIT;END IF;
      values_cents:=array_append(values_cents,round(raw::numeric*100));
    END LOOP;
    IF NOT valid OR EXISTS(SELECT 1 FROM unnest(values_cents)v WHERE v<0) OR values_cents[2]+values_cents[3]>values_cents[1] THEN
      issues:=issues||jsonb_build_array(jsonb_build_object('code','payroll-invalid-deductions','id',coalesce(entry->>'_id',entry->>'id'),'org',owner));CONTINUE;
    END IF;
    rows:=rows||jsonb_build_array(jsonb_build_object('kind','accrual','date',coalesce(entry->>'date',entry->>'dt'),'description',CASE entry->>'accrualType' WHEN 'salary' THEN 'Заработная плата' WHEN 'bonus' THEN 'Премия' WHEN 'vacation' THEN 'Отпускные' WHEN 'sick' THEN 'Больничный' WHEN 'compensation' THEN 'Компенсация' WHEN 'alimony' THEN 'Удержание' ELSE coalesce(entry->>'article','Начисление') END,'project',coalesce(entry->>'projectKey',entry->>'deal',''),'org',owner,'amount',values_cents[1]/100,'ndfl',values_cents[2]/100,'otherDeductions',values_cents[3]/100,'id',coalesce(entry->>'_id',entry->>'id')));
  END LOOP;
  -- Exactly the reconciliation precedence: explicit payroll parts > legacy
  -- settlement links > single employee. Article names never override purpose.
  FOR payment IN SELECT value FROM jsonb_array_elements(source_cash) LOOP
    IF payment->>'type' IS DISTINCT FROM 'out' OR payment->>'payrollPayment'='false' THEN CONTINUE;END IF;
    payment_id:=coalesce(nullif(payment->>'_id',''),payment->>'id','');owner:=coalesce(payment->>'org','');
    same_owner:=EXISTS(SELECT 1 FROM jsonb_array_elements(rows)r WHERE coalesce(r->>'org','')=owner);
    has_allocations:=jsonb_typeof(payment->'payrollAllocations')='array';
    allocations:='[]'::jsonb;
    FOR link IN SELECT value FROM jsonb_array_elements(source_links) LOOP
      IF coalesce(link->>'cashId','')<>payment_id OR payment_id='' THEN CONTINUE;END IF;
      raw:=regexp_replace(replace(btrim(coalesce(nullif(link->>'amount',''),'0')),',','.'),'[[:space:]  ]','','g');
      IF nullif(link->>'personId','') IS NULL OR raw !~ '^-?[0-9]+([.][0-9]+)?$' THEN
        IF link->>'personId'=p_employee THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','payroll-invalid-settlement','id',link->>'id','org',owner));END IF;CONTINUE;
      END IF;
      IF round(raw::numeric*100)<=0 THEN
        IF link->>'personId'=p_employee THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','payroll-invalid-settlement','id',link->>'id','org',owner));END IF;CONTINUE;
      END IF;
      allocations:=allocations||jsonb_build_array(jsonb_build_object('personId',link->>'personId','amount',raw));
    END LOOP;
    IF NOT (payment->>'payrollPayment'='true' OR nullif(payment->>'personId','') IS NOT NULL OR has_allocations OR jsonb_array_length(allocations)>0) THEN CONTINUE;END IF;
    own_part:=payment->>'personId'=p_employee OR EXISTS(SELECT 1 FROM jsonb_array_elements(allocations)a WHERE a->>'personId'=p_employee);
    IF has_allocations THEN own_part:=own_part OR EXISTS(SELECT 1 FROM jsonb_array_elements(payment->'payrollAllocations')a WHERE a->>'personId'=p_employee);END IF;
    -- Unassigned salary could belong to this employee; issue contains no other
    -- employee names, amounts or private source payloads.
    own_part:=coalesce(own_part,false) OR (payment->>'payrollPayment'='true' AND nullif(payment->>'personId','') IS NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(rows)r WHERE coalesce(r->>'org','')=owner));
    raw:=regexp_replace(replace(btrim(coalesce(payment->>'amount','')),',','.'),'[[:space:]  ]','','g');
    IF raw !~ '^-?[0-9]+([.][0-9]+)?$' THEN
      IF own_part THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','payroll-invalid-payment','id',payment_id,'org',owner));END IF;CONTINUE;
    END IF;
    total_cents:=round(raw::numeric*100);
    IF total_cents<0 THEN
      IF own_part THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','payroll-invalid-payment','id',payment_id,'org',owner));END IF;CONTINUE;
    END IF;
    IF payment ? 'payrollAllocations' AND payment->'payrollAllocations'<>'null'::jsonb AND NOT has_allocations THEN
      IF own_part OR same_owner THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','payroll-invalid-allocation','id',payment_id,'org',owner));END IF;CONTINUE;
    END IF;
    IF has_allocations THEN allocations:=payment->'payrollAllocations';END IF;
    allocated:=0;own_paid:=0;valid:=true;
    IF has_allocations OR jsonb_array_length(allocations)>0 THEN
      FOR part IN SELECT value FROM jsonb_array_elements(allocations) LOOP
        raw:=regexp_replace(replace(btrim(coalesce(nullif(part->>'amount',''),'0')),',','.'),'[[:space:]  ]','','g');
        IF nullif(part->>'personId','') IS NULL OR raw !~ '^-?[0-9]+([.][0-9]+)?$' THEN valid:=false;EXIT;END IF;
        share_cents:=round(raw::numeric*100);IF share_cents<0 THEN valid:=false;EXIT;END IF;
        allocated:=allocated+share_cents;IF part->>'personId'=p_employee THEN own_paid:=own_paid+share_cents;END IF;
      END LOOP;
      IF NOT valid OR allocated>total_cents THEN
        IF own_part OR same_owner THEN issues:=issues||jsonb_build_array(jsonb_build_object('code',CASE WHEN valid THEN 'payroll-overallocated-payment' ELSE 'payroll-invalid-allocation' END,'id',payment_id,'org',owner));END IF;CONTINUE;
      END IF;
    ELSIF nullif(payment->>'personId','') IS NOT NULL THEN
      allocated:=total_cents;IF payment->>'personId'=p_employee THEN own_paid:=total_cents;END IF;
    END IF;
    IF total_cents<>allocated AND (own_part OR same_owner) THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','payroll-unallocated-payment','id',payment_id,'org',owner));END IF;
    IF own_paid>0 THEN rows:=rows||jsonb_build_array(jsonb_build_object('kind','payment','date',payment->>'date','description',coalesce(payment->>'note','Выплата зарплаты'),'org',owner,'amount',own_paid/100,'ndfl',0,'otherDeductions',0,'id',payment_id));END IF;
  END LOOP;
  WITH grouped AS (
    SELECT coalesce(r->>'org','') org,
      coalesce(sum((r->>'amount')::numeric) FILTER(WHERE r->>'kind'='accrual'),0) earned,
      coalesce(sum((r->>'ndfl')::numeric) FILTER(WHERE r->>'kind'='accrual'),0) ndfl,
      coalesce(sum((r->>'otherDeductions')::numeric) FILTER(WHERE r->>'kind'='accrual'),0) other_deductions,
      coalesce(sum((r->>'amount')::numeric) FILTER(WHERE r->>'kind'='payment'),0) paid
    FROM jsonb_array_elements(rows)r GROUP BY coalesce(r->>'org','')
  ), balances AS (SELECT g.*,g.earned-g.ndfl-g.other_deductions-g.paid balance FROM grouped g)
  SELECT coalesce(sum(b.earned),0),coalesce(sum(b.ndfl),0),coalesce(sum(b.other_deductions),0),coalesce(sum(b.paid),0),coalesce(sum(b.balance),0),coalesce(sum(greatest(b.balance,0)),0),coalesce(sum(greatest(-b.balance,0)),0),
    coalesce(jsonb_agg(jsonb_build_object('org',b.org,'earned',b.earned,'ndfl',b.ndfl,'otherDeductions',b.other_deductions,'withheld',b.ndfl+b.other_deductions,'paid',b.paid,'balance',b.balance,'payable',greatest(b.balance,0),'overpaid',greatest(-b.balance,0)) ORDER BY b.org),'[]'::jsonb)
    INTO earned,tax,other,paid,balance,payable,overpaid,organizations FROM balances b;
  RETURN jsonb_build_object('earned',earned,'ndfl',tax,'otherDeductions',other,'withheld',tax+other,'paid',paid,'balance',balance,'payable',payable,'overpaid',overpaid,'organizations',organizations,'rows',rows,'issues',issues,'status',CASE WHEN jsonb_array_length(issues)=0 THEN 'calculated' ELSE 'requires-review' END);
END $function$;
REVOKE ALL ON FUNCTION public.payroll_employee_snapshot(jsonb,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.my_payroll()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE employee text;src jsonb;
BEGIN
  PERFORM public.require_active_finance_session();
  SELECT s.employee_id INTO employee FROM public.staff_access s WHERE s.user_id=auth.uid() AND s.enabled;
  IF nullif(employee,'') IS NULL THEN RAISE EXCEPTION 'Access denied';END IF;
  SELECT f.payload INTO src FROM public.finance_state f WHERE f.id='main';
  RETURN public.payroll_employee_snapshot(coalesce(src,'{}'::jsonb),employee);
END $function$;

REVOKE ALL ON FUNCTION public.my_payroll() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_payroll() TO authenticated;
