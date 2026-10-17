import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPayments, paymentSummary, paymentCsv, paymentReceipt } from '../src/payments.js';

const paid = { id: 'p1', transactionRef: 'SV123', customerName: 'Nimal Fernando', serviceLabel: 'Family Care subscription', amount: '1500.50', currency: 'LKR', status: 'successful', createdAt: '2026-10-16T08:00:00Z', paidAt: '2026-10-16T08:01:00Z', provider: 'demo', subscriptionId: 's1' };
const pending = { ...paid, id: 'p2', transactionRef: 'SV456', customerName: 'Amali Silva', serviceLabel: 'Care essentials', status: 'pending', amount: '200.25', paidAt: null, subscriptionId: null, orderId: 'o1' };
const failed = { ...pending, id: 'p3', transactionRef: 'SV789', status: 'failed' };
const rows = [paid, pending, failed];
test('free plan exports describe activation and contribute no collected amount', () => {
  const free = { ...paid, amount: 0, provider: 'free' };
  assert.match(paymentReceipt(free), /SUBSCRIPTION CONFIRMATION/);
  assert.match(paymentReceipt(free), /No payment required/);
  assert.doesNotMatch(paymentReceipt(free), /Total paid/);
  assert.match(paymentCsv([free]), /No payment required/);
  assert.equal(paymentSummary([paid, free]).successfulTotal, 1500.5);
});

test('search matches customer, reference and service without case or spacing sensitivity', () => {
  assert.deepEqual(filterPayments(rows, '  NIMAL sv123 '), [paid]);
  assert.deepEqual(filterPayments(rows, 'ESSENTIALS'), [pending, failed]);
  assert.deepEqual(filterPayments(rows, 'missing'), []);
  assert.deepEqual(filterPayments(rows, ''), rows);
});
test('status and search work together, including records with absent optional labels', () => {
  assert.deepEqual(filterPayments(rows, 'amali', 'pending'), [pending]);
  assert.deepEqual(filterPayments(rows, '', 'successful'), [paid]);
  assert.deepEqual(filterPayments([{ id: 'empty', status: 'failed' }], 'anything'), []);
});
test('summary excludes pending and failed amounts from collected totals and uses paid date', () => {
  const summary = paymentSummary([...rows, { ...paid, id: 'old', amount: '10.25', paidAt: '2026-09-30T08:00:00Z' }], new Date(2026, 9, 16));
  assert.deepEqual(summary, { count: 4, successfulTotal: 1510.75, monthTotal: 1500.5, pendingTotal: 200.25 });
  assert.equal(paymentSummary([{ ...paid, amount: '0.10' }, { ...paid, amount: '0.20' }]).successfulTotal, 0.3);
});
test('CSV exports exactly the selected records and only ledger fields', () => {
  const csv = paymentCsv(filterPayments(rows, '', 'pending'));
  assert.match(csv, /SV456/);
  assert.doesNotMatch(csv, /SV123|SV789/);
  assert.match(csv, /"200.25","LKR","Pending"/);
  const extras = paymentCsv([{ ...paid, cardNumber: '1234567890123456', cvv: '987', email: 'private@example.com' }]);
  assert.doesNotMatch(extras, /1234567890123456|987|private@example/);
});
test('CSV quotes commas, quotes and newlines and neutralizes spreadsheet formulas', () => {
  const csv = paymentCsv([{ ...paid, customerName: '  =HYPERLINK("bad")', serviceLabel: 'Care, "family"\nMonthly' }]);
  assert.match(csv, /"'  =HYPERLINK\(""bad""\)"/);
  assert.match(csv, /"Care, ""family""\nMonthly"/);
  for (const customerName of ['+cmd', '-cmd', '@SUM(1)', '\t=1+1', '\r=1+1']) {
    assert.ok(paymentCsv([{ ...paid, customerName }]).includes('"\'' + customerName + '"'));
  }
});
test('a paid receipt uses stored reference, amount and date, with no invented card details', () => {
  const receipt = paymentReceipt(paid);
  assert.match(receipt, /PAYMENT RECEIPT/);
  assert.match(receipt, /Nimal Fernando/);
  assert.match(receipt, /SV123/);
  assert.match(receipt, /LKR 1,500.50/);
  assert.match(receipt, /Online payment/);
  assert.doesNotMatch(receipt, /demo|Visa|CVV|card number/i);
});
test('pending and failed records cannot produce a paid receipt', () => {
  assert.throws(() => paymentReceipt(pending), /confirmed/i);
  assert.throws(() => paymentReceipt(failed), /confirmed/i);
});
