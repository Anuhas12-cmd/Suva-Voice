import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useAuth } from '../api';
import { money, when } from '../format';
import { Badge, ErrorText } from '../components/ui';
import { downloadPaymentFile, filterPayments, paymentCsv, paymentMethod, paymentReceipt, paymentSummary } from '../payments';

function PaymentDetails({ payment, onClose, onReceipt, disabled }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  return <dialog ref={dialog} className="payment-dialog" aria-labelledby="payment-detail-title" onCancel={onClose}>
    <div className="stack">
      <div className="row-between"><div><p className="tiny">SUVA VOICE</p><h2 id="payment-detail-title">Payment details</h2></div><button type="button" className="btn secondary" onClick={onClose} autoFocus>Close</button></div>
      <div className="payment-detail-total"><Badge value={payment.status} /><strong>{money(payment.amount)}</strong><span className="tiny">{payment.currency || 'LKR'}</span></div>
      <dl className="payment-detail-list">
        <div><dt>Reference</dt><dd>{payment.transactionRef}</dd></div>
        <div><dt>Customer</dt><dd>{payment.customerName || 'Not recorded'}</dd></div>
        <div><dt>Service</dt><dd>{payment.serviceLabel || 'Care payment'}</dd></div>
        <div><dt>Payment method</dt><dd>{paymentMethod(payment.provider)}</dd></div>
        <div><dt>Created</dt><dd>{when(payment.createdAt)}</dd></div>
        {payment.status === 'successful' ? <div><dt>Paid</dt><dd>{when(payment.paidAt || payment.createdAt)}</dd></div> : null}
        <div><dt>Payment ID</dt><dd>{payment.id}</dd></div>
        {payment.orderId ? <div><dt>Order ID</dt><dd>{payment.orderId}</dd></div> : null}
        {payment.subscriptionId ? <div><dt>Subscription ID</dt><dd>{payment.subscriptionId}</dd></div> : null}
      </dl>
      {payment.status !== 'successful' ? <p className="notice">A receipt is available after payment is confirmed.</p> : null}
      <div className="actions">
        {payment.status === 'successful' ? <button type="button" className="btn" disabled={disabled} onClick={() => onReceipt(payment)}>Download receipt</button> : null}
        {payment.orderId ? <Link className="btn secondary" to={'/orders/' + payment.orderId}>View order</Link> : null}
        {payment.customerId ? <Link className="btn secondary" to={'/customers/' + payment.customerId}>View customer</Link> : null}
      </div>
    </div>
  </dialog>;
}

export default function Payments() {
  const { liveTick } = useAuth();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    api('/api/payments').then(rows => {
      if (!current) return;
      setData(Array.isArray(rows) ? rows : []);
      setError('');
    }).catch(error => { if (current) setError(error.message || 'Payments could not be loaded.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [liveTick, refresh]);

  const rows = data || [];
  const visible = filterPayments(rows, search, status);
  const summary = paymentSummary(rows);
  const selected = rows.find(payment => payment.id === selectedId);
  const unavailable = loading || Boolean(error);
  function receipt(payment) {
    setExportError('');
    try { downloadPaymentFile(paymentReceipt(payment), `Suva-Voice-receipt-${payment.transactionRef}.txt`); }
    catch (error) { setExportError(error.message); }
  }
  function exportCsv() {
    setExportError('');
    try { downloadPaymentFile('\uFEFF' + paymentCsv(visible), `Suva-Voice-payments-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8'); }
    catch (error) { setExportError(error.message); }
  }

  return <>
    <div className="page-head payment-page-head">
      <div><h1>Payments</h1><p>Follow care orders and subscriptions, from payment to receipt.</p></div>
      <div className="actions"><button className="btn secondary" type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? 'Refreshing…' : 'Refresh'}</button><button className="btn" type="button" disabled={unavailable || !visible.length} onClick={exportCsv}>Export CSV</button></div>
    </div>
    <ErrorText error={error} /><ErrorText error={exportError} />
    {error && data !== null ? <p className="muted">Showing previously loaded records. Refresh to get the latest payment status.</p> : null}
    {data !== null ? <>
      <section className="stats payment-stats" aria-label="Recent payment totals">
        <article className="stat"><span>Successful total</span><strong>{money(summary.successfulTotal)}</strong></article>
        <article className="stat"><span>Recent records</span><strong>{summary.count}</strong></article>
        <article className="stat"><span>Paid this month</span><strong>{money(summary.monthTotal)}</strong></article>
        <article className="stat"><span>Pending amount</span><strong>{money(summary.pendingTotal)}</strong></article>
      </section>
      <p className="tiny payment-scope">Totals, search, and export cover the latest 200 payment records. New mobile payments appear automatically.</p>
    </> : null}
    <section className="panel payment-ledger" aria-label="Payment records">
      <div className="filters payment-filters">
        <label className="payment-search">Search payments<input type="search" placeholder="Customer, reference, or service" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>Status<select aria-label="Status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="successful">Successful</option><option value="pending">Pending</option><option value="failed">Failed</option></select></label>
        {search || status ? <button className="btn ghost" type="button" onClick={() => { setSearch(''); setStatus(''); }}>Clear filters</button> : null}
      </div>
      <p className="tiny" role="status">{data === null ? (loading ? 'Loading payments…' : 'Payment records are unavailable. Use Refresh to try again.') : `Showing ${visible.length} of ${rows.length} recent payments`}</p>
      {data !== null && visible.length ? <div className="table-wrap"><table className="payment-table">
        <caption className="sr-only">Recent payments matching the current search and status</caption>
        <thead><tr><th scope="col">Reference / date</th><th scope="col">Customer</th><th scope="col">Service</th><th scope="col">Amount (LKR)</th><th scope="col">Status</th><th scope="col">Details</th></tr></thead>
        <tbody>{visible.map(payment => <tr key={payment.id}>
          <td><strong>{payment.transactionRef}</strong><div className="tiny">{when(payment.createdAt)}</div></td>
          <td>{payment.customerName || 'Not recorded'}</td><td>{payment.serviceLabel || 'Care payment'}</td>
          <td className="payment-amount">{money(payment.amount)}</td><td><Badge value={payment.status} /></td>
          <td><button className="btn secondary" type="button" aria-label={'View details for ' + payment.transactionRef} onClick={() => setSelectedId(payment.id)}>View details</button></td>
        </tr>)}</tbody>
      </table></div> : data !== null ? <div className="payment-empty"><h2>{rows.length ? 'No matching payments' : 'No payments yet'}</h2><p className="muted">{rows.length ? 'Try a different customer, reference, service, or status.' : 'Payments made in the mobile app will appear here.'}</p></div> : null}
    </section>
    {selected ? <PaymentDetails payment={selected} onClose={() => setSelectedId(null)} onReceipt={receipt} disabled={unavailable} /> : null}
  </>;
}
