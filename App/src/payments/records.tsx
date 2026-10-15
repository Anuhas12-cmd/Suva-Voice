import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../api';
import { useApp } from '../session';
import { dateLabel, filterPayments, money, receiptText, statusLabel, type Payment, type Target } from './domain';
import { exportReceipt } from './exportReceipt';
import { Button, Card, Copy, Divider, Icon, IconTile, Info, Line, Loading, Notice, Page, Pill, TextLink, palette } from './ui';

function Tone({ status }: { status: string }) {
  return <Pill tone={status === 'successful' ? 'lime' : status === 'pending' ? 'amber' : 'red'}>{statusLabel(status)}</Pill>;
}
function usePayment(id?: string) {
  const { payments, tick } = useApp();
  const [payment, setPayment] = useState<Payment | null>(id ? payments[id] || null : null);
  const [loading, setLoading] = useState(Boolean(id && !payments[id]));
  const [error, setError] = useState('');
  const refresh = useCallback(() => {
    if (!id) return;
    return api('/api/payments').then((rows: Payment[]) => {
      const found = rows.find(row => row.id === id);
      if (!found) throw new Error('This payment is not in your recent history.');
      setPayment(found); setError('');
    }).catch(error => setError(error.message)).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { void refresh(); }, [refresh, tick]);
  return { payment, loading, error, refresh };
}
export function HistoryScreen() {
  const { tick } = useApp();
  const [rows, setRows] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  function refresh() {
    return api('/api/payments').then(rows => { setRows(rows); setError(''); })
      .catch(error => setError(error.message)).finally(() => setLoading(false));
  }
  useEffect(() => { void refresh(); }, [tick]);
  const visible = filterPayments(rows, filter);
  return <Page title="Your payments." subtitle="Every payment, in one place." footer={<Button onPress={() => router.replace('/more')}>Back to your account</Button>}>
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{[['all', 'All'], ['successful', 'Paid'], ['pending', 'Pending'], ['failed', 'Failed']].map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: filter === key }} onPress={() => setFilter(key)} style={{ backgroundColor: filter === key ? palette.ink : '#fff', borderRadius: 24, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' }}><Copy kind="caption" color={filter === key ? '#fff' : palette.muted}>{label}</Copy></Pressable>)}</View>
    {loading || error ? <Loading error={error} retry={refresh} /> : visible.length ? visible.map((payment, index) => {
      const month = new Date(payment.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const previousMonth = index ? new Date(visible[index - 1].createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';
      return <View key={payment.id} style={{ gap: 18 }}>
        {month !== previousMonth ? <Copy kind="caption" color={palette.muted}>{month.toUpperCase()}</Copy> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={payment.serviceLabel + ', ' + money(payment.amount) + ', ' + statusLabel(payment.status)} onPress={() => router.push({ pathname: payment.status === 'successful' ? '/payments/receipt' : '/payments/result', params: { id: payment.id, ...(payment.orderId ? { kind: 'order', targetId: payment.orderId } : {}) } })}>
          <Card><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><IconTile name={payment.status === 'pending' ? 'clock' : payment.status === 'failed' ? 'alert' : payment.subscriptionId ? 'heart' : 'package'} /><View style={{ flex: 1, gap: 4 }}><Copy kind="label">{payment.serviceLabel || 'Care payment'}</Copy><Copy kind="caption" color={palette.muted}>{dateLabel(payment.createdAt)}</Copy></View></View><View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}><Copy kind="heading">{money(payment.amount)}</Copy><Tone status={payment.status} /></View></Card>
        </Pressable>
      </View>;
    }) : <Card><IconTile name="receipt" size={64} /><Copy kind="heading">{filter === 'all' ? 'Your story starts here' : 'No ' + statusLabel(filter).toLowerCase() + ' payments'}</Copy><Copy color={palette.muted}>Payments will appear here when you complete a care order or choose a plan.</Copy><TextLink onPress={() => router.push('/payments/plans')}>Explore care plans</TextLink></Card>}
    {!loading && rows.length ? <Copy kind="caption" center color={palette.muted}>Your most recent {rows.length} payments · Demo records</Copy> : null}
    <TextLink onPress={refresh}>Refresh payments</TextLink>
  </Page>;
}

export function ResultScreen() {
  const params = useLocalSearchParams<{ id?: string; kind?: string; targetId?: string }>();
  const { controller, record } = useApp();
  const { payment, loading, error, refresh } = usePayment(params.id);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const unknown = !params.id;
  const status = unknown ? 'unknown' : payment?.status;
  const isPlan = Boolean(payment?.subscriptionId) || params.kind === 'plan';
  const target: Target | null = params.targetId ? { kind: params.kind === 'plan' ? 'plan' : 'order', id: params.targetId } : payment?.orderId ? { kind: 'order', id: payment.orderId } : null;
  async function checkStatus() {
    setChecking(true); setNotice('');
    try {
      if (unknown && target) {
        const result = await controller.resolve(target);
        if (result.state === 'recorded') {
          record(result.payment);
          router.replace({ pathname: '/payments/result', params: { id: result.payment.id, kind: target.kind, targetId: target.id } });
        } else setNotice('Confirmation is still unavailable. Check again later or contact your care team before trying another payment.');
      } else await refresh();
    } catch (error) { setNotice((error as Error).message); }
    finally { setChecking(false); }
  }
  const success = status === 'successful';
  const failed = status === 'failed';
  const title = success ? (isPlan ? 'Your family,\nin good hands.' : 'Payment\ncomplete.') : failed ? 'Let’s try\nthat again.' : 'Just a moment.';
  const subtitle = success ? 'Your demo payment is complete.' : failed ? 'Your payment couldn’t be completed.' : 'We’re waiting for your payment confirmation.';
  const footer = <>
    {payment || unknown ? success ? <Button onPress={() => router.replace({ pathname: '/payments/receipt', params: { id: payment!.id } })}>View receipt</Button> : failed ? <Button onPress={() => router.replace(target ? { pathname: '/payments/checkout', params: { kind: target.kind, id: target.id } } : '/payments/plans')}>Try again</Button> : <Button busy={checking} onPress={checkStatus}>Check payment status</Button> : null}
    <TextLink onPress={() => router.replace('/payments')}>Go to payment history</TextLink>
  </>;
  return <Page title={title} subtitle={subtitle} back={() => router.replace('/payments')} footer={footer}>
    {loading ? <Loading /> : !unknown && !payment ? <Loading error={error} retry={refresh} /> : <>
      <IconTile name={success ? (isPlan ? 'heart' : 'check') : failed ? 'alert' : 'clock'} size={112} tone={success ? 'lime' : failed ? 'red' : 'amber'} />
      <Notice text={error} error /><Notice text={notice} />
      <Card>
        <Pill tone={success ? 'lime' : failed ? 'red' : 'amber'}>{success ? 'PAID' : failed ? 'NOT COMPLETED' : 'AWAITING CONFIRMATION'}</Pill>
        {payment ? <><Copy kind="display">{money(payment.amount)}</Copy><Divider /><Line label="Reference" value={payment.transactionRef} /><Line label="Service" value={payment.serviceLabel || 'Care payment'} />
          {success ? <><Line label="Paid with" value={payment.provider === 'demo' ? 'Demo payment' : payment.provider || 'Not recorded'} /><Line label="Date" value={dateLabel(payment.paidAt || payment.createdAt)} /></> : null}
        </> : null}
        <Copy color={palette.muted}>{success ? 'You can find this record any time in Payment history.' : failed ? 'Your order is saved. Review your details before trying again.' : 'Your payment is still being checked. Please do not pay again until the result is confirmed.'}</Copy>
        {!success && !failed ? <Copy color={palette.muted}>You can leave this screen and check your payment history later.</Copy> : null}
      </Card>
      {success ? <Info name={isPlan ? 'heart' : 'truck'} title={isPlan ? 'Care, now closer' : 'Stay close to your order'} detail={isPlan ? 'Review your active plan in Subscriptions.' : 'Follow your order’s progress from My orders.'} /> : failed ? <Info name="shield" title="Need a hand?" detail="Contact support with your payment reference." /> : null}
    </>}
  </Page>;
}

export function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { payment, loading, error, refresh } = usePayment(id);
  const [exportError, setExportError] = useState('');
  const [busy, setBusy] = useState(false);
  async function download() {
    if (!payment || busy) return;
    setBusy(true); setExportError('');
    try { await exportReceipt(receiptText(payment), payment.transactionRef); }
    catch (error) { setExportError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <Page title="Your receipt." subtitle="A little record of care." back={() => router.replace('/payments')} footer={<>
    {payment?.status === 'successful' ? <Button busy={busy} onPress={download}>{Platform.OS === 'web' ? 'Download receipt' : 'Share receipt'}</Button> : null}
    <TextLink onPress={() => router.replace('/payments')}>Back to payment history</TextLink>
  </>}>
    {loading || !payment ? <Loading error={error || (!id ? 'Choose a payment from your history.' : '')} retry={refresh} /> : payment.status !== 'successful' ? <><Notice text="A receipt is available after payment is confirmed." /><Button onPress={() => router.replace({ pathname: '/payments/result', params: { id: payment.id } })}>View payment status</Button></> : <>
      <Notice text={error} error /><Notice text={exportError} error />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Copy kind="heading" color={palette.forest}>suva voice</Copy><Icon name="receipt" size={28} /></View>
        <Pill tone="lime">PAYMENT SUCCESSFUL</Pill><Copy kind="display">{money(payment.amount)}</Copy><Divider />
        <Line label="Reference" value={payment.transactionRef} /><Line label="Date" value={dateLabel(payment.paidAt || payment.createdAt)} /><Line label="Payment method" value={payment.provider === 'demo' ? 'Demo payment' : payment.provider || 'Not recorded'} />
        <Divider /><Copy kind="heading">{payment.serviceLabel || 'Care payment'}</Copy><Line label="Total paid" value={money(payment.amount)} strong /><Divider />
        <Copy kind="caption" color={palette.muted}>Thank you for choosing Suva Voice.</Copy><Copy kind="caption" color={palette.muted}>Demo record · No real card was charged</Copy>
      </Card>
    </>}
  </Page>;
}
