/* One kopeck-exact allocation cap per actual payment, shared by all settlement registers.
 * Calendar occurrences are aliases/plans. Retired payment requests are excluded by default.
 * Explicit legacy review remains available for historical register validation only.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArbatFinancialPaymentLinks=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const identity=row=>String(row?._id||row?.id||''),list=value=>Array.isArray(value)?value:[];
 function amount(value){if(typeof value!=='string'&&typeof value!=='number'||typeof value==='number'&&(!Number.isFinite(value)||!Number.isSafeInteger(Math.round(value*100))))throw Error('Некорректная сумма связи или платежа');const raw=String(value).trim().replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw Error('Некорректная сумма связи или платежа: нужны неотрицательные рубли с точностью до копейки');const [whole,fraction='']=raw.split('.');return BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2));}
 function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;const timestamp=Date.parse(value+'T00:00:00Z');return Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===value;}
 function cashFingerprint(cash,collection='paymentRequests'){const key=identity(cash),value=String(cash?.amount??'');if(collection==='fixedAssets')return JSON.stringify([key,cash?.org,cash?.type,cash?.date,value]);const fields=[key,cash?.org,cash?.date,cash?.type,value];if(collection==='paymentRequests')fields.push(cash?.customerId||'',cash?.counterpartyId||'',cash?.personId||'',cash?.counterparty||cash?.payee||'');return JSON.stringify(fields);}
 function review(data={},options={}){
  const cash=list(data.cash),groups=new Map(),crew=list(data.crewSettlements),crewByCash=new Map();
  for(const row of crew){const key=String(row?.cashId||'');if(!crewByCash.has(key))crewByCash.set(key,[]);crewByCash.get(key).push(row);}
  function group(key){key=String(key||'');if(!groups.has(key))groups.set(key,{cashId:key,total:0n,requestTotal:0n,documents:new Map([['cash:'+key,{collection:'cash',id:key}]]),reasons:new Set(),available:null,checked:false});return groups.get(key);}
  function claim(cashId,collection,document,value,org,link={},zeroAllowed=false){const key=String(cashId||''),g=group(key),id=collection==='cash'?key:identity(document);g.documents.set(collection+':'+id,{collection,id});if(!key)g.reasons.add('У связи не указан идентификатор платежа');if(collection!=='cash'&&!id)g.reasons.add('Не указан идентификатор документа со связью платежа');const matches=cash.filter(c=>identity(c)===key),payment=matches[0];
   if(!g.checked){g.checked=true;if(matches.length!==1)g.reasons.add(matches.length?'Идентификатор платежа повторяется: проверьте источник':'Связанный платёж не найден');else{if(payment.type!=='out')g.reasons.add('Связь должна указывать на исходящий платёж');if(!String(payment.org||'').trim())g.reasons.add('У платежа не указана организация');if(!validDate(payment.date))g.reasons.add('У платежа некорректная дата');try{g.available=amount(payment.amount);if(g.available<=0n)g.reasons.add('Сумма платежа должна быть положительной')}catch(e){g.reasons.add(e.message)}}}
   if(matches.length===1&&(!String(org||'').trim()||org!==payment.org))g.reasons.add('Организация документа и платежа не совпадает');
   if(matches.length===1&&Object.prototype.hasOwnProperty.call(link||{},'cashFingerprint')&&link.cashFingerprint!==cashFingerprint(payment,collection))g.reasons.add('Денежная операция изменена: проверьте ссылки на платёж');
   try{const n=amount(value);if(!zeroAllowed&&n===0n)g.reasons.add('Сумма связи должна быть положительной');if(collection==='paymentRequests')g.requestTotal+=n;else g.total+=n}catch(e){g.reasons.add(e.message)}return g;
  }
  function invalidArray(collection,document,field){const g=group('');g.documents.set(collection+':'+identity(document),{collection,id:identity(document)});g.reasons.add('Некорректный список '+field+' в документе');}
  for(const payment of cash){const cashId=identity(payment);if(payment?.supplierAllocations!=null&&!Array.isArray(payment.supplierAllocations))invalidArray('cash',payment,'связей с поставщиками');for(const link of list(payment?.supplierAllocations)){const g=claim(cashId,'cash',payment,link?.amount,payment?.org);const key=String(link?.documentKey||''),separator=key.indexOf(':'),collection=key.slice(0,separator),id=key.slice(separator+1),doc=list(data[collection]).find(d=>identity(d)===id);if(doc?.org&&doc.org!==payment.org)g.reasons.add('Организация документа поставщика и платежа не совпадает');}
   if(payment?.payrollPayment===false)continue;
   // Finance core gives explicit payroll allocations precedence over crew aliases.
   if(Array.isArray(payment?.payrollAllocations)){for(const part of payment.payrollAllocations)claim(cashId,'cash',payment,part?.amount,payment.org,{},true);}
   else {if(payment?.payrollAllocations!=null)invalidArray('cash',payment,'распределений зарплаты');const settlements=crewByCash.get(cashId);if(settlements?.length)for(const part of settlements)claim(cashId,'cash',payment,part?.amount,part?.org||payment.org);else if(payment?.personId)claim(cashId,'cash',payment,payment.amount,payment.org);}
  }
  for(const [cashId,settlements] of crewByCash)if(!cash.some(p=>identity(p)===cashId))for(const row of settlements)claim(cashId,'cash',row,row?.amount,row?.org);
  for(const collection of ['loanContracts','fixedAssets',...(options.includePaymentRequests?['paymentRequests']:[])])for(const document of list(data[collection])){const field=collection==='loanContracts'?'repayments':'paymentLinks';if(document?.[field]!=null&&!Array.isArray(document[field])){invalidArray(collection,document,field);continue}for(const link of list(document?.[field])){
   if(collection==='loanContracts'){let value;try{value=String((amount(link?.principal)+amount(link?.interest))/100n)+'.'+String((amount(link?.principal)+amount(link?.interest))%100n).padStart(2,'0')}catch(_){value=null}claim(link?.cashId,collection,document,value,document?.org,link);}
   else claim(link?.cashId,collection,document,link?.amount,document?.org,link);
  }}
  const issues=[];for(const g of groups.values()){if(g.available!==null&&g.total>g.available)g.reasons.add('Сумма ссылок на платёж превышает его сумму. Используйте одно назначение или разделите платёж');if(g.available!==null&&g.requestTotal>g.available)g.reasons.add('Сумма связей разных заявок превышает сумму платежа. Распределите платёж между заявками');if(g.reasons.size)issues.push({cashId:g.cashId,documents:[...g.documents.values()],message:[...g.reasons].join('. ')});}return issues;
 }
 function assertValid(data,changedCollections){let relevant=null;if(changedCollections!==undefined){relevant=new Set(typeof changedCollections==='string'?[changedCollections]:changedCollections);if(relevant.has('crewSettlements'))relevant.add('cash');}const issues=review(data).filter(issue=>!relevant||issue.documents.some(d=>relevant.has(d.collection)));if(issues.length){const error=Error(issues.map(i=>i.message).join('\n'));error.code='financial-payment-links';error.issues=issues;throw error;}return true;}
 return Object.freeze({review,assertValid,cashFingerprint});
});
