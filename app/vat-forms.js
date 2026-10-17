/* Explicit VAT metadata for newly entered contracts and realizations. Legacy rows unchanged. */
(()=>{
 const core=window.ArbatFinanceCore;
 if(!core?.documentVat)return;
 const rates=[0,5,7,10,20,22];
 const fmt=c=>core.rubles(c).replace('.',',');
 for(const id of ['dealForm','realizationForm','expenseForm']){
  const form=document.getElementById(id);if(!form)continue;
  const amountName=id==='dealForm'?'contractTotal':'amount';
  const anchor=form.elements.namedItem(amountName)?.closest('label');if(!anchor)continue;
  const label=document.createElement('label');label.textContent='Ставка НДС документа';
  const select=document.createElement('select');select.name='vatRate';select.required=true;
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Выберите ставку';select.append(placeholder);
  for(const rate of rates){const option=document.createElement('option');option.value=String(rate);option.textContent=rate+'%';select.append(option)}
  label.append(select);anchor.after(label);
  let deductible=null;
  if(id==='expenseForm'){
   const wrapper=document.createElement('label');wrapper.textContent='Входной НДС принимается к вычету';
   deductible=document.createElement('select');deductible.name='vatDeductible';deductible.required=true;
   for(const [value,title] of [['','Выберите'],['true','Да'],['false','Нет']]){const option=document.createElement('option');option.value=value;option.textContent=title;deductible.append(option)}
   wrapper.append(deductible);label.after(wrapper);
  }
  const note=document.createElement('label');note.className='deal-create-calc';note.textContent='Укажите сумму и ставку НДС';label.after(note);
  const hidden={};for(const name of ['amountGross','vatAmount','amountNet','vatRateSource']){const element=document.createElement('input');element.type='hidden';element.name=name;form.append(element);hidden[name]=element}
  function refresh(){
   try{
    const amount=form.elements.namedItem(amountName).value,rate=select.value;
    if(!amount||!rate){note.textContent='Укажите сумму и ставку НДС';return false}
    if(deductible&&!deductible.value){note.textContent='Укажите возможность вычета входного НДС';return false}
    const vat=core.documentVat(amount,rate,deductible?.value==='true');
    hidden.amountGross.value=core.rubles(vat.amountGross);
    hidden.vatAmount.value=core.rubles(vat.vatAmount);
    hidden.amountNet.value=core.rubles(vat.amountNet);
    hidden.vatRateSource.value='document-explicit';
    if(deductible){form.elements.namedItem('vatDeductible').value=deductible.value}
    note.textContent='НДС '+fmt(vat.vatAmount)+' ₽ · без НДС '+fmt(vat.amountNet)+' ₽';
    return true;
   }catch(error){note.textContent='Проверьте сумму и ставку НДС';return false}
  }
  form.addEventListener('input',refresh);form.addEventListener('change',refresh);
  form.addEventListener('submit',event=>{if(!refresh()){event.preventDefault();event.stopImmediatePropagation();select.reportValidity()}},true);

 }
})();
