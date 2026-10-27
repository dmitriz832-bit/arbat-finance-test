"""Independent Decimal controls. No application code is imported or executed."""
from decimal import Decimal, ROUND_HALF_UP
import json

D = Decimal
def cents(value):
    return str(int((D(str(value)) * 100).quantize(D('1'), rounding=ROUND_HALF_UP)))
def vat(gross, rate):
    return (D(gross) * D(rate) / (100 + D(rate))).quantize(D('.01'), rounding=ROUND_HALF_UP)

vat_cases = []
for rate in [0, 5, 7, 10, 20, 22]:
    for gross in ['0', '0.01', '0.03', '0.61', '1.05', '100.01', '1234567.89', '-0.03', '-100.01']:
        tax = vat(gross, rate)
        vat_cases.append(dict(gross=gross, rate=rate, vat=cents(tax), net=cents(D(gross)-tax)))

# A dated management policy, deliberately unrelated to statutory thresholds.
threshold = [
    dict(date='2025-12-01', amount='80'),
    dict(date='2026-01-10', amount='100'),
    dict(date='2026-02-28', amount='.01'),
    dict(date='2026-03-01', amount='-40'),
]
threshold_cases = []
for reference in ['2026-01-31', '2026-02-28', '2026-03-31']:
    observed = sum((D(e['amount']) for e in threshold if '2026-01-01' <= e['date'] <= reference), D(0))
    threshold_cases.append(dict(reference=reference, observed=cents(observed), previous=cents(80),
                                exceeded=None if reference<'2026-02-28' else '2026-02-28',
                                effective=None if reference<'2026-02-28' else '2026-03-01'))

print(json.dumps(dict(vatCases=vat_cases, thresholdEvents=[dict(e, amountCents=cents(e['amount'])) for e in threshold], thresholdCases=threshold_cases,
    oracle='Python Decimal ROUND_HALF_UP, standalone, no application imports'), ensure_ascii=False))
