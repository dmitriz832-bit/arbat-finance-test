-- Disposable pure-function controls: no finance_state/staff_access reads or writes.
-- Included by the empty-database access harness inside its rollback transaction.
-- The caller must own transaction boundaries; this fixture never commits or rolls back.
DO $control$
DECLARE
  payload jsonb:=$json${
    "workActs":[{"id":"act","org":"АИР-КЛИМАТ","date":"2026-10-04","status":"approved","projectKey":"A::PAY-1","qty":"0.3333","rate":"300.06","memberIds":["c","a","b"]}],
    "labor":[
      {"_id":"admin","org":"АИР-КЛИМАТ","date":"2026-10-04","personId":"admin","amount":"1000.01","ndfl":"130.00","otherDeductions":"20.01","employerContributions":"300.03"},
      {"_id":"linked","org":"АИР-КЛИМАТ","date":"2026-10-04","personId":"a","workActId":"act","projectKey":"A::PAY-1","amount":"33.33","ndfl":"4.33","otherDeductions":"1.00","employerContributions":"10.00"},
      {"_id":"shared","org":"АИР-КЛИМАТ","date":"2026-10-04","personId":"b","amount":"200.03","ndfl":"26.00","otherDeductions":"4.03","employerContributions":"60.01"},
      {"_id":"foreign-accrual","org":"АРБАТ.ГК","date":"2026-10-04","personId":"admin","amount":"100.00"}
    ],
    "cash":[
      {"_id":"prior","org":"АИР-КЛИМАТ","date":"2026-09-30","type":"out","personId":"admin","amount":"500.00","payrollPayment":true},
      {"_id":"bulk","org":"АИР-КЛИМАТ","date":"2026-10-04","type":"out","personId":"b","amount":"161.35","payrollPayment":true,"payrollAllocations":[{"personId":"a","amount":"28.00"},{"personId":"b","amount":"100.00"},{"personId":"c","amount":"33.35"}]},
      {"_id":"partial","org":"АИР-КЛИМАТ","date":"2026-10-04","type":"out","personId":"b","amount":"50.00","payrollPayment":true},
      {"_id":"other","org":"АИР-КЛИМАТ","date":"2026-10-04","type":"out","personId":"admin","amount":"200.01","payrollPayment":false},
      {"_id":"foreign-overpay","org":"АРБАТ.ГК","date":"2026-10-04","type":"out","personId":"admin","amount":"150.00","payrollPayment":true}
    ],
    "crewSettlements":[{"id":"ignored-legacy","cashId":"bulk","personId":"a","amount":"100.00"}]
  }$json$::jsonb;
  result jsonb; entry jsonb; variant jsonb; who text;
BEGIN
  FOR entry IN SELECT value FROM jsonb_array_elements($expect$[
    {"person":"admin","earned":1100.01,"withheld":150.01,"paid":650.00,"balance":300.00,"payable":350.00,"overpaid":50.00},
    {"person":"a","earned":33.33,"withheld":5.33,"paid":28.00,"balance":0,"payable":0,"overpaid":0},
    {"person":"b","earned":233.36,"withheld":30.03,"paid":150.00,"balance":53.33,"payable":53.33,"overpaid":0},
    {"person":"c","earned":33.35,"withheld":0,"paid":33.35,"balance":0,"payable":0,"overpaid":0}
  ]$expect$::jsonb) LOOP
    result:=public.payroll_employee_snapshot(payload,entry->>'person');
    IF result->'earned'<>entry->'earned' OR result->'withheld'<>entry->'withheld' OR result->'paid'<>entry->'paid' OR result->'balance'<>entry->'balance' OR result->'payable'<>entry->'payable' OR result->'overpaid'<>entry->'overpaid' THEN
      RAISE EXCEPTION 'RPC control failed for %: actual %, expected %',entry->>'person',result,entry;
    END IF;
    IF jsonb_array_length(result->'issues')<>0 THEN RAISE EXCEPTION 'Valid control has unexpected issues: %',result;END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'rows')r WHERE r ? 'personId' OR r ? 'employerContributions') THEN RAISE EXCEPTION 'Private management fields leaked into employee response';END IF;
  END LOOP;
  result:=public.payroll_employee_snapshot(payload,'admin');
  IF jsonb_array_length(result->'organizations')<>2 OR (result->>'ndfl')::numeric<>130 OR (result->>'otherDeductions')::numeric<>20.01 THEN RAISE EXCEPTION 'Organization/deduction detail lost: %',result;END IF;
  -- A salary purpose is authoritative; names of DDS articles do not settle a
  -- non-salary payment. Bulk allocation wins over legacy link and direct party.
  variant:=payload||jsonb_build_object('cash',jsonb_build_array(jsonb_build_object('_id','non-salary','org','АИР-КЛИМАТ','type','out','personId','a','amount',28,'payrollPayment',false,'note','зарплата')));
  result:=public.payroll_employee_snapshot(variant,'a');IF (result->>'paid')::numeric<>0 THEN RAISE EXCEPTION 'Non-salary settled employee';END IF;
  -- Exact line-rounding agrees with the JS control: 0.005 × 1 => one kopeck.
  result:=public.payroll_employee_snapshot('{"workActs":[{"id":"tiny","org":"A","status":"approved","memberIds":["a"],"qty":"0.005","rate":"1.00"}]}','a');
  IF (result->>'earned')::numeric<>0.01 THEN RAISE EXCEPTION 'Line precision failed: %',result;END IF;
  -- Malformed/negative imported accruals remain explicit review items and do
  -- not become signed corrections that only one downstream ledger recognizes.
  FOR who IN SELECT unnest(ARRAY['-10','invalid']) LOOP
    result:=public.payroll_employee_snapshot(jsonb_build_object('labor',jsonb_build_array(jsonb_build_object('_id','bad','org','A','personId','a','amount',who))),'a');
    IF (result->>'earned')::numeric<>0 OR result->>'status'<>'requires-review' OR NOT (result->'issues' @> '[{"code":"payroll-invalid-deductions"}]') THEN RAISE EXCEPTION 'Invalid accrual was not quarantined: %',result;END IF;
  END LOOP;
  FOR variant IN SELECT value FROM jsonb_array_elements('[{},{"amount":null},{"amount":""},{"amount":"100"},{"amount":"invalid"},{"amount":"100","personId":"a","payrollAllocations":{"personId":"a","amount":100}},{"amount":"100","personId":"a","payrollAllocations":[{"personId":"a","amount":101}]},{"amount":"100","personId":"a","payrollAllocations":[null]}]'::jsonb) LOOP
    result:=public.payroll_employee_snapshot(jsonb_build_object('labor','[{"org":"A","personId":"a","amount":100}]'::jsonb,'cash',jsonb_build_array(variant||'{"_id":"bad","org":"A","type":"out","payrollPayment":true}'::jsonb)),'a');
    IF (result->>'paid')::numeric<>0 OR result->>'status'<>'requires-review' THEN RAISE EXCEPTION 'Uncertain prior payment was silently credited/hidden: %',result;END IF;
  END LOOP;
  FOR variant IN SELECT value FROM jsonb_array_elements('[{"rate":100},{"qty":1},{"qty":-1,"rate":100},{"qty":"Infinity","rate":100}]'::jsonb) LOOP
    result:=public.payroll_employee_snapshot(jsonb_build_object('workActs',jsonb_build_array(variant||'{"id":"bad-act","org":"A","status":"approved","memberIds":["a"]}'::jsonb)),'a');
    IF (result->>'earned')::numeric<>0 OR result->>'status'<>'requires-review' OR NOT (result->'issues' @> '[{"code":"crew-payroll-invalid-work-act"}]') THEN RAISE EXCEPTION 'Missing/negative/malformed approved work certified as zero: %',result;END IF;
  END LOOP;
  -- Hidden salary remains hidden; an unlinked approved work record remains a
  -- personal accrual independently of later crew/directory changes.
  result:=public.payroll_employee_snapshot('{"labor":[{"personId":"a","amount":100,"employeeVisible":false},{"personId":"q","amount":900}],"workActs":[{"id":"snapshot","org":"A","status":"approved","memberIds":["a"],"qty":1,"rate":10}]}','a');
  IF (result->>'earned')::numeric<>10 OR jsonb_array_length(result->'rows')<>1 THEN RAISE EXCEPTION 'Visibility/own employee isolation failed: %',result;END IF;
  IF has_function_privilege('authenticated','public.payroll_employee_snapshot(jsonb,text)','EXECUTE') OR has_function_privilege('anon','public.payroll_employee_snapshot(jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'Pure helper must not be an authenticated public RPC';END IF;
END $control$;
