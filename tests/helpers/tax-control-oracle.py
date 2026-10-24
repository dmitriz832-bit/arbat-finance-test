from decimal import Decimal,ROUND_HALF_UP
import json,pathlib,sys
p=pathlib.Path(__file__).resolve().parents[1]/'fixtures'/'tax-independent-control.json'
D=Decimal
C=lambda n:int((D(str(n))*100).quantize(D('1'),rounding=ROUND_HALF_UP))
vat=lambda gross,rate:(D(str(gross))*D(str(rate))/(100+D(str(rate)))).quantize(D('.01'),rounding=ROUND_HALF_UP)
org='АРБАТ.ГК';air='АИР-КЛИМАТ'
d={'cash':[{'_id':'adv-old','org':org,'date':'2025-12-15','type':'in','amount':'120000'},{'_id':'adv-return','org':org,'date':'2026-05-15','type':'out','amount':'30000'}], 'realizations':[{'_id':'q1-sale','org':org,'date':'2026-03-15','amount':'61000','vatRate':22},{'_id':'q2-sale','org':org,'date':'2026-04-15','amount':'61000','vatRate':22}], 'vatAdvanceEvents':[{'_id':'a','kind':'received','org':org,'date':'2025-12-15','cashId':'adv-old','amount':'120000','vatRate':20,'document':'СФ 2025'},{'_id':'s1','kind':'offset','org':org,'date':'2026-03-15','advanceId':'a','realizationId':'q1-sale','amount':'60000','document':'Зачёт Q1'},{'_id':'s2','kind':'offset','org':org,'date':'2026-04-15','advanceId':'a','realizationId':'q2-sale','amount':'30000','document':'Зачёт Q2'},{'_id':'r','kind':'refund','org':org,'date':'2026-05-15','advanceId':'a','cashId':'adv-return','amount':'30000','document':'Расторжение'}], 'expenses':[], 'labor':[{'_id':'w','org':org,'date':'2026-02-01','amount':'10000','employerContributions':'3000','profitTaxDeductible':True,'profitTaxRecognitionDate':'2026-02-01','profitTaxDocument':'Начисление'}]}
for n,date,gross in [(1,'2026-03-01','24400'),(2,'2026-05-01','12200')]:d['expenses'].append({'_id':f'exp-{n}','org':org,'date':date,'amount':gross,'vatRate':22,'vatDeductible':True,'vatDeductionDate':date,'vatInvoice':f'УПД {n}','profitTaxDeductible':True,'profitTaxRecognitionDate':date,'profitTaxDocument':f'Расход {n}'})
for q,inc,cost in [(1,1000000,800000),(2,1000000,1200000),(3,500000,400000),(4,0,100000)]:
 date=f'2026-{(q-1)*3+1:02}-10'
 if inc:d['cash'].append({'_id':f'air-in-{q}','org':air,'date':date,'type':'in','amount':str(inc),'usnTaxable':True})
 d['cash'].append({'_id':f'air-out-{q}','org':air,'date':date,'type':'out','amount':str(cost),'usnDeductible':True,'usnRecognitionEvents':[{'id':f'e{q}','date':date,'amount':str(cost),'document':f'Основание {q}'}]})
expect=[]
for q,inc,cost,profitcost in [(1,1000000,800000,33000),(2,2000000,2000000,43000),(3,2500000,2400000,43000),(4,2500000,2500000,43000)]:
 output=vat(61000,22) if q<3 else D(0)
 deduction=D(10000)+(vat(24400,22) if q==1 else vat(12200,22)) if q<3 else D(0)
 base=max(D(inc-cost),D(0));regular=(base*D('.15')).quantize(D('.01'),rounding=ROUND_HALF_UP);minimum=(D(inc)*D('.01')).quantize(D('.01'))
 expect.append({'reference':f'2026-{q*3:02}-01','quarter':q,'airIncome':C(inc),'airExpenses':C(cost),'airRegular':C(regular),'airMinimum':C(minimum),'airAccrued':C(max(regular,minimum) if q==4 else regular),'outputVat':C(output),'inputVat':C(deduction),'vatBalance':C(output-deduction),'profitRevenue':C(50000 if q==1 else 100000),'profitExpenses':C(profitcost),'profitTax':C((D(50000 if q==1 else 100000)-D(profitcost))*D('.25'))})
cases=[{'gross':str(g),'rate':r,'vat':C(vat(g,r)),'net':C(g)-C(vat(g,r))} for r in [0,5,7,10,20,22] for g in ['0','0.01','0.03','0.61','1.05','1.07','1.10','1.20','1.22','100.01','100000.99','12345.67','-0.03','-1.22']]
result=json.dumps({'vatCases':cases,'oracle':'Python Decimal ROUND_HALF_UP; independent of application modules','data':d,'expected':expect},ensure_ascii=False,indent=2)+'\n'
if '--check' in sys.argv:
 assert p.read_text()==result,'Independent control fixture differs from Python Decimal oracle'
 print('Independent Decimal oracle: four quarters and 84 VAT cases match')
else:p.write_text(result)
