import { useEffect, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { api } from '../api';
import { errorsFrom, label, when } from '../format';
import { Action, Back, Badge, Btn, Card, Chips, Empty, Field, Notice, PersonCard, Row, Screen, Section, Stat, Text, Title } from '../ui';

export function Home({ go, user, tick }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/api/dashboard').then(setData).catch((err) => setError(err.message));
  }, [tick]);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const people = data?.lovedOnes || [];
  const preview = [
    ...(data?.reminders || []).slice(0, 1).map((item) => ({ id: `reminder-${item.id}`, title: item.title, meta: `${item.elderlyName} · ${String(item.timeOfDay).slice(0, 5)}`, go: () => go('reminders') })),
    ...(data?.recentAlerts || []).slice(0, 1).map((item) => ({ id: `alert-${item.id}`, title: item.title, meta: label(item.type), alert: item.type === 'emergency', go: () => go('alert', { id: item.id }) })),
    ...(data?.recentOrders || []).slice(0, 1).map((item) => ({ id: `order-${item.id}`, title: item.orderNumber, meta: label(item.status), go: () => go('order', { id: item.id }) }))
  ];
  return (
    <Screen tabs tab="home" go={go}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 52, height: 52, borderRadius: 16 }} />
        <View style={{ flex: 1 }}>
          <Title>{hello}, {user?.fullName?.split(' ')[0]}</Title>
          <Text>Let's care for your loved ones today.</Text>
        </View>
      </View>
      <Image source={require('../../assets/photos/family-garden.jpg')} style={{ width: '100%', height: 104, borderRadius: 22 }} resizeMode="cover" />
      <Notice text={error} bad />
      {data ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="Today's check-in" value={`${data.today.completed} / ${data.today.expected}`} hint={data.today.label} />
            <Stat label="Emergency" value={data.emergency.label} hint={data.emergency.openCount ? 'Needs attention' : 'All clear'} alert={Boolean(data.emergency.openCount)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Action source={require('../../assets/photos/call.jpg')} label="Check-in" onPress={() => go('live', { elderlyId: people[0]?.id })} />
            <Action source={require('../../assets/photos/basket.jpg')} label="Care order" onPress={() => go('order-form')} />
            <Action source={require('../../assets/photos/family-indoor.jpg')} label="Alerts" onPress={() => go('alerts')} />
          </View>
          <Section title="Loved ones" action="View all" onPress={() => go('loved')} />
          {people.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {people.map((person) => (
                <PersonCard
                  key={person.id}
                  name={person.fullName}
                  meta={`Age ${person.age}`}
                  value={person.status}
                  onPress={() => go('loved-profile', { id: person.id })}
                />
              ))}
            </ScrollView>
          ) : <Empty text="Add a loved one so Suva Voice knows who to call." />}
          <Section title="Coming up" action="Reminders" onPress={() => go('reminders')} />
          {preview.length ? preview.map((item) => (
            <Row key={item.id} title={item.title} meta={item.meta} alert={item.alert} onPress={item.go} />
          )) : <Empty text="Nothing is waiting. A missed call is not an emergency." />}
        </>
      ) : <Text>Loading your dashboard…</Text>}
    </Screen>
  );
}

export function Loved({ go, tick }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/api/elderly').then(setRows).catch(() => {}); }, [tick]);
  return (
    <Screen tabs tab="loved" go={go}>
      <Section title="Loved ones" action="Add" onPress={() => go('loved-form')} />
      <Text>People Suva Voice calls for you.</Text>
      {rows.length ? rows.map((person) => (
        <Row
          key={person.id}
          title={person.fullName}
          meta={`Age ${person.age} · ${person.phoneDisplay || person.phone}`}
          value={person.status}
          onPress={() => go('loved-profile', { id: person.id })}
        />
      )) : <Empty text="No loved ones yet. Add the person Suva Voice should call." />}
    </Screen>
  );
}

const blank = { fullName: '', age: '70', phone: '', address: '', preferredLanguage: 'si', preferredCheckInTime: '08:30', healthNotes: '' };

export function LovedForm({ go, params }) {
  const [form, setForm] = useState(blank);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!params.id) return;
    api(`/api/elderly/${params.id}`).then((data) => setForm({
      fullName: data.fullName,
      age: String(data.age),
      phone: data.phone,
      address: data.address || '',
      preferredLanguage: data.preferredLanguage,
      preferredCheckInTime: data.preferredCheckinTime ? String(data.preferredCheckinTime).slice(0, 5) : '08:30',
      healthNotes: data.healthNotes || ''
    })).catch((err) => setError(err.message));
  }, [params.id]);
  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: '' }));
  }
  async function save() {
    setError('');
    const body = { ...form, age: Number(form.age) };
    try {
      if (params.id) await api(`/api/elderly/${params.id}`, { method: 'PATCH', body });
      else await api('/api/elderly', { method: 'POST', body });
      go(params.id ? 'loved-profile' : 'loved', params.id ? { id: params.id } : {}, true);
    } catch (err) {
      const fields = errorsFrom(err);
      setFieldErrors(fields);
      setError(Object.keys(fields).length ? '' : err.message);
    }
  }
  return (
    <Screen>
      <Back onPress={() => go('loved')} />
      <Title>{params.id ? 'Edit loved one' : 'Add loved one'}</Title>
      <Notice text={error} bad />
      <Field labelText="Name" value={form.fullName} error={fieldErrors.fullName} onChangeText={(value) => set('fullName', value)} />
      <Field labelText="Age" keyboard="number-pad" value={form.age} error={fieldErrors.age} onChangeText={(value) => set('age', value)} />
      <Field labelText="Phone number" keyboard="phone-pad" placeholder="0771234567" value={form.phone} error={fieldErrors.phone} onChangeText={(value) => set('phone', value)} />
      <Field labelText="Address" value={form.address} error={fieldErrors.address} onChangeText={(value) => set('address', value)} />
      <Text style={{ fontWeight: '800' }}>Preferred language</Text>
      <Chips options={[['en', 'English'], ['si', 'Sinhala'], ['ta', 'Tamil']]} value={form.preferredLanguage} onChange={(preferredLanguage) => set('preferredLanguage', preferredLanguage)} />
      <Field labelText="Preferred check-in time (HH:MM)" value={form.preferredCheckInTime} error={fieldErrors.preferredCheckInTime} onChangeText={(value) => set('preferredCheckInTime', value)} />
      <Field labelText="Health notes" value={form.healthNotes} error={fieldErrors.healthNotes} onChangeText={(value) => set('healthNotes', value)} />
      <Btn onPress={save}>Save</Btn>
    </Screen>
  );
}

export function LovedProfile({ go, params, tick }) {
  const [data, setData] = useState(null);
  const [contact, setContact] = useState({ fullName: '', phone: '', relationship: 'Daughter', priority: '1' });
  const [error, setError] = useState('');
  function load() { api(`/api/elderly/${params.id}`).then(setData).catch((err) => setError(err.message)); }
  useEffect(() => { load(); }, [params.id, tick]);
  if (!data) return <Screen><Text>{error || 'Loading profile…'}</Text></Screen>;
  const schedule = data.schedules?.[0];
  return (
    <Screen>
      <Back onPress={() => go('loved')} />
      <Title sub={`${data.phone} · ${label(data.preferredLanguage)}`}>{data.fullName}</Title>
      <Badge value={data.status} />
      <Notice text={error} bad />
      <Card>
        <Text style={{ fontWeight: '800' }}>Personal information</Text>
        <Text>Age {data.age}</Text>
        <Text>{data.address || 'No address saved'}</Text>
        <Text>Check-in {String(data.preferredCheckinTime).slice(0, 5)}</Text>
        <Text>Health notes: {data.healthNotes || 'None'}</Text>
        <Btn kind="secondary" onPress={() => go('loved-form', { id: data.id })}>Edit</Btn>
      </Card>
      <Card>
        <Text style={{ fontWeight: '800' }}>Call schedule</Text>
        {schedule ? <Text>{schedule.enabled ? 'Active' : 'Paused'} at {String(schedule.timeOfDay).slice(0, 5)}. Next {when(schedule.nextRunAt)}. Retries {schedule.retryAttempts}.</Text> : <Text>No schedule.</Text>}
      </Card>
      <Card>
        <Text style={{ fontWeight: '800' }}>Emergency contacts</Text>
        {data.contacts.map((item) => <Text key={item.id}>{item.priority}. {item.fullName} · {item.relationship || 'Contact'} · {item.phone}</Text>)}
        <Field labelText="Contact name" value={contact.fullName} onChangeText={(fullName) => setContact({ ...contact, fullName })} />
        <Field labelText="Contact phone" value={contact.phone} onChangeText={(phone) => setContact({ ...contact, phone })} />
        <Field labelText="Relationship" value={contact.relationship} onChangeText={(relationship) => setContact({ ...contact, relationship })} />
        <Btn kind="secondary" onPress={async () => {
          try {
            await api(`/api/elderly/${data.id}/emergency-contacts`, { method: 'POST', body: { ...contact, priority: Number(contact.priority) } });
            setContact({ ...contact, fullName: '', phone: '' });
            load();
          } catch (err) { setError(err.message); }
        }}>Add emergency contact</Btn>
      </Card>
      <Btn onPress={() => go('live', { elderlyId: data.id })}>Start check-in call</Btn>
      <Btn kind="secondary" onPress={() => go('calls', { elderlyId: data.id })}>Call history</Btn>
      <Btn kind="secondary" onPress={() => go('reminders', { elderlyId: data.id })}>Reminders</Btn>
    </Screen>
  );
}

export function Calls({ go, params, tick }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const query = params.elderlyId ? `?elderlyId=${params.elderlyId}` : '';
    api(`/api/calls${query}`).then(setRows).catch(() => {});
  }, [params.elderlyId, tick]);
  return (
    <Screen>
      <Back onPress={() => (params.elderlyId ? go('loved-profile', { id: params.elderlyId }) : go('more'))} />
      <Title>Call history</Title>
      {rows.length ? rows.map((item) => (
        <Row
          key={item.id}
          title={item.calleeName}
          meta={`${when(item.startedAt)} · attempt ${item.attemptNumber}${item.alertType ? ` · ${label(item.alertType)}` : ''}`}
          value={item.resultCode || item.status}
        />
      )) : <Empty text="No calls yet." />}
    </Screen>
  );
}

export function LiveCall({ go, params, tick }) {
  const [elders, setElders] = useState([]);
  const [elderlyId, setElderlyId] = useState(params.elderlyId || '');
  const [call, setCall] = useState(null);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    api('/api/elderly').then((rows) => {
      setElders(rows);
      setElderlyId((current) => current || params.elderlyId || rows[0]?.id || '');
    }).catch((err) => setError(err.message));
  }, [params.elderlyId]);
  useEffect(() => {
    if (!call?.id || ['completed', 'missed', 'failed', 'no_answer'].includes(call.status)) return undefined;
    const timer = setInterval(() => api(`/api/calls/${call.id}`).then(setCall).catch(() => {}), 700);
    return () => clearInterval(timer);
  }, [call?.id, call?.status, tick]);

  async function start() {
    setError('');
    setOpened(false);
    try {
      const created = await api('/api/calls/test', { method: 'POST', body: { elderlyId } });
      setCall(created);
      setOpened(Boolean(created.openedOnComputer));
    } catch (err) { setError(err.message); }
  }
  async function press(digit) {
    const result = await api(`/api/calls/${call.id}/dtmf`, { method: 'POST', body: { digit } });
    setCall({ ...result.call, alert: result.alert });
  }
  async function simulate(outcome) {
    const result = await api(`/api/calls/${call.id}/simulate`, { method: 'POST', body: { outcome } });
    setCall(result.call);
  }
  const waiting = call?.status === 'waiting_dtmf';
  const person = elders.find((item) => item.id === elderlyId);
  return (
    <Screen>
      <Back onPress={() => go('home')} />
      <Title sub="Opens the phone-style call screen in Chrome on this computer.">Live check-in</Title>
      <Notice text={error} bad />
      <Card>
        <Text style={{ fontWeight: '800' }}>Who should we call?</Text>
        <Chips options={elders.map((item) => [item.id, item.fullName])} value={elderlyId} onChange={setElderlyId} />
        <Btn onPress={start}>Start test call</Btn>
      </Card>
      {call ? (
        <Card toneName={call.resultCode === 'emergency' ? 'alert' : undefined}>
          <Text style={{ fontSize: 22, fontWeight: '800' }}>{label(call.status)}</Text>
          <Text>{call.calleeName || person?.fullName}</Text>
          <Text>{call.phone}</Text>
          <Text>Press 1 if you are okay. Press 2 if you need assistance. Press 3 for emergency.</Text>
          <Text>{call.promptText}</Text>
          {opened && waiting ? <Text>The call screen opened in Chrome on this computer. Answer there, listen to Suva Voice, then press 1, 2, or 3.</Text> : waiting ? (
            <>
              <Btn onPress={() => press('1')}>Press 1 — I am okay</Btn>
              <Btn kind="secondary" onPress={() => press('2')}>Press 2 — I need assistance</Btn>
              <Btn kind="danger" onPress={() => press('3')}>Press 3 — Emergency</Btn>
              <Btn kind="secondary" onPress={() => simulate('no_answer')}>Simulate no answer</Btn>
              <Btn kind="secondary" onPress={() => simulate('failed')}>Simulate failed call</Btn>
              <Btn kind="secondary" onPress={() => simulate('no_response')}>Simulate no response</Btn>
            </>
          ) : <Text>Result: {label(call.resultCode || call.status)}</Text>}
          {call.alert ? <Btn onPress={() => go('alert', { id: call.alert.id })}>Open alert</Btn> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

export function Alerts({ go, tick }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/api/alerts').then(setRows).catch(() => {}); }, [tick]);
  return (
    <Screen tabs tab="alerts" go={go}>
      <Title sub="Missed check-ins, assistance, and emergencies. A missed call is not an emergency.">Alerts</Title>
      {rows.map((item) => (
        <Row
          key={item.id}
          title={item.elderlyName}
          meta={`${when(item.createdAt)} · ${label(item.status)}`}
          value={item.type}
          alert={item.type === 'emergency'}
          onPress={() => go('alert', { id: item.id })}
        />
      ))}
      {!rows.length ? <Empty text="No alerts. A missed call is recorded here, and it is not treated as an emergency." /> : null}
    </Screen>
  );
}

export function AlertDetail({ go, params, tick }) {
  const [data, setData] = useState(null);
  useEffect(() => { api(`/api/alerts/${params.id}`).then(setData).catch(() => {}); }, [params.id, tick]);
  if (!data) return <Screen><Text>Loading alert…</Text></Screen>;
  return (
    <Screen>
      <Back onPress={() => go('alerts')} />
      <Card toneName={data.type === 'emergency' ? 'alert' : undefined}>
        <Text style={{ fontSize: 14, fontWeight: '800' }}>{label(data.type).toUpperCase()}</Text>
        <Title>{data.elderlyName}</Title>
        <Text>{data.elderlyPhone}</Text>
        <Text>{when(data.createdAt)}</Text>
        <Badge value={data.type} />
        <Badge value={data.status} />
        <Text style={{ fontSize: 16, lineHeight: 24 }}>{data.message}</Text>
      </Card>
      <Card>
        <Text style={{ fontWeight: '800' }}>Alert recipients</Text>
        {(data.escalations || []).map((item) => (
          <Text key={item.id}>{item.recipientName || 'Care team'} · {label(item.channel)} · {item.recipientAddress}</Text>
        ))}
        {!data.escalations?.length ? <Text>No escalation steps recorded yet.</Text> : null}
      </Card>
    </Screen>
  );
}
