/* Explicit VAT metadata for newly entered contracts and realizations. Legacy rows unchanged. */
(()=>{
 const core=window.ArbatFinanceCore;
 if(!core?.documentVat)return;
 const rates=[0,5,7,10,20,22];
 const fmt=c=>core.rubles(c).replace('.',',');
 for(const id of ['dealForm','realizationForm']){
  const form=document.getElementById(id);if(!form)continue;
  const amountName=id==='dealForm'?'contractTotal':'amount';
  const anchor=form.elements.namedItem(amountName)?.closest('label');if(!anchor)continue;
  const label=document.createElement('label');label.textContent='Ставка НДС документа';
  const select=document.createElement('select');select.name='vatRate';select.required=true;
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Выберите ставку';select.append(placeholder);
  for(const rate of rates){const option=document.createElement('option');option.value=String(rate);option.textContent=rate+'%';select.append(option)}
  label.append(select);anchor.after(label);
  const note=document.createElement('label');note.className='deal-create-calc';note.textContent='Укажите сумму и ставку НДС';label.after(note);
  const hidden={};for(const name of ['amountGross','vatAmount','amountNet','vatRateSource']){const element=document.createElement('input');element.type='hidden';element.name=name;form.append(element);hidden[name]=element}
  function refresh(){
   try{
    const amount=form.elements.namedItem(amountName).value,rate=select.value;
    if(!amount||!rate){note.textContent='Укажите сумму и ставку НДС';return false}
    const vat=core.documentVat(amount,rate);
    hidden.amountGross.value=core.rubles(vat.amountGross);
    hidden.vatAmount.value=core.rubles(vat.vatAmount);
    hidden.amountNet.value=core.rubles(vat.amountNet);
    hidden.vatRateSource.value='document-explicit';
    note.textContent='НДС '+fmt(vat.vatAmount)+' ₽ · без НДС '+fmt(vat.amountNet)+' ₽';
    return true;
   }catch(error){note.textContent='Проверьте сумму и ставку НДС';return false}
  }
  form.addEventListener('input',refresh);form.addEventListener('change',refresh);
  form.addEventListener('submit',event=>{if(!refresh()){event.preventDefault();event.stopImmediatePropagation();select.reportValidity()}},true);
  if(id==='realizationForm')select.addEventListener('change',()=>{});
 }
})();
