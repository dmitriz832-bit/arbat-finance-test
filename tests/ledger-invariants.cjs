'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../app/finance-core.js');

test('cash receipt is not automatically P&L revenue', () => {
  const result = core.pnl({ revenue: [], direct: [], production: [], commercial: [], administrative: [] });
  assert.equal(result.revenue, 0n);
  assert.equal(result.result, 0n);
});

test('money conversion retains kopecks and handles decimal comma', () => {
  assert.equal(core.cents('1 234,56'), 123456n);
  assert.equal(core.rubles(123456n), '1234.56');
  assert.equal(core.cents('-0.005'), -1n);
});

test('allocation conserves original amount including negative adjustments', () => {
  for (const amount of ['100.00', '0.01', '-0.01', '-100.00']) {
    const parts = core.allocate(amount, [1, 1, 1]);
    assert.equal(parts.reduce((a, b) => a + b, 0n), core.cents(amount));
  }
});

test('P&L components reconcile to financial result', () => {
  const p = core.pnl({
    revenue: ['1000000'],
    direct: ['250000'],
    production: ['150000'],
    commercial: ['30000'],
    administrative: ['20000'],
    belowIncome: ['1000'],
    belowExpenses: ['5000']
  });
  assert.equal(p.gross, 75000000n);
  assert.equal(p.ebitda, 55000000n);
  assert.equal(p.result, 54600000n);
});

test('invalid money is rejected instead of silently coercing', () => {
  assert.throws(() => core.cents('12abc'), TypeError);
  assert.throws(() => core.cents('Infinity'), TypeError);
});
