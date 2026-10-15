import { label, when } from './format.js';

export function filterPayments(rows, query = '', status = '') {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(payment => {
    if (status && payment.status !== status) return false;
    const searchable = [payment.transactionRef, payment.customerName, payment.serviceLabel].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every(term => searchable.includes(term));
  });
}

export function paymentSummary(rows, now = new Date()) {
  const successful = rows.filter(payment => payment.status === 'successful');
  const sum = payments => payments.reduce((total, payment) => total + Math.round(Number(payment.amount) * 100), 0) / 100;
  return {
    count: rows.length,
    successfulTotal: sum(successful),
    monthTotal: sum(successful.filter(payment => {
      const date = new Date(payment.paidAt || payment.createdAt);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    })),
    pendingTotal: sum(rows.filter(payment => payment.status === 'pending')),
  };
}

export const paymentMethod = provider => provider === 'demo' ? 'Online payment' : provider || 'Not recorded';

function csvCell(value) {
  let text = String(value ?? '');
  // Customer/service labels are untrusted spreadsheet content, even inside quotes.
  if (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function paymentCsv(rows) {
  const header = ['Reference', 'Customer', 'Service', 'Amount', 'Currency', 'Status', 'Created at', 'Paid at', 'Payment method', 'Order ID', 'Subscription ID'];
  const records = rows.map(payment => [payment.transactionRef, payment.customerName, payment.serviceLabel,
    Number(payment.amount).toFixed(2), payment.currency || 'LKR', label(payment.status), payment.createdAt,
    payment.paidAt, paymentMethod(payment.provider), payment.orderId, payment.subscriptionId]);
  return [header, ...records].map(record => record.map(csvCell).join(',')).join('\r\n');
}

export function paymentReceipt(payment) {
  if (payment.status !== 'successful') throw new Error('A receipt is available after payment is confirmed.');
  const amount = Number(payment.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return ['SUVA VOICE', 'PAYMENT RECEIPT', '', `Reference: ${payment.transactionRef}`,
    `Customer: ${payment.customerName || 'Not recorded'}`, `Service: ${payment.serviceLabel || 'Care payment'}`,
    `Date: ${when(payment.paidAt || payment.createdAt)}`, `Method: ${paymentMethod(payment.provider)}`,
    `Total paid: ${payment.currency || 'LKR'} ${amount}`, '', 'Thank you for choosing Suva Voice.'].join('\n');
}

export function downloadPaymentFile(content, filename, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Keep the object URL alive until the browser starts reading the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
