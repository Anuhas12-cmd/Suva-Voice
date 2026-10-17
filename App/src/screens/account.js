import { useEffect, useState } from 'react';
import { Image, Pressable, Switch, View } from 'react-native';
import { api, getApiBase, saveSession, setApiBase } from '../api';
import { errorsFrom, label, when } from '../format';
import { Back, Badge, Btn, Card, Chips, Field, Notice, Screen, Text, Title, colors } from '../ui';

export function More({ go, user, onLogout }) {
  const items = [
    ['notifications', 'Notifications'],
    ['reminders', 'Reminders'],
    ['payments', 'Payments'],
    ['plans', 'Subscriptions'],
    ['profile', 'Profile'],
    ['settings', 'Settings'],
    ['help', 'Help & Support'],
    ['terms', 'Terms and Conditions'],
    ['calls', 'Call history'],
    ['live', 'Live check-in']
  ];
  return (
    <Screen tabs tab="more" go={go}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 56, height: 56, borderRadius: 18 }} />
        <View style={{ flex: 1 }}>
          <Title sub={user?.email}>{user?.fullName}</Title>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {items.map(([route, name]) => (
          <Pressable key={route} accessibilityRole="button" onPress={() => go(route)} style={{ width: '47%', backgroundColor: colors.white, borderRadius: 18, minHeight: 72, padding: 14, justifyContent: 'flex-end' }}>
            <Text style={{ fontWeight: '800' }}>{name}</Text>
          </Pressable>
        ))}
      </View>
      <Btn kind="danger" onPress={onLogout}>Logout</Btn>
    </Screen>
  );
}

export function Notifications({ go, tick }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/api/notifications').then(setRows).catch(() => {}); }, [tick]);
  return (
    <Screen>
      <Back onPress={() => go('more')} />
      <Title>Notifications</Title>
      <Btn kind="secondary" onPress={async () => { await api('/api/notifications/read-all', { method: 'POST' }); setRows(await api('/api/notifications')); }}>Mark all read</Btn>
      {rows.map((item) => (
        <Card key={item.id}>
          <Text style={{ fontWeight: '800' }}>{item.title}</Text>
          <Text>{item.body}</Text>
          <Text>{label(item.channel)} · {when(item.createdAt)}</Text>
          <Badge value={item.type} />
          {item.channel === 'in_app' && item.status !== 'read' ? <Btn kind="secondary" onPress={async () => { await api(`/api/notifications/${item.id}/read`, { method: 'POST' }); setRows(await api('/api/notifications')); }}>Mark read</Btn> : <Badge value={item.status} />}
        </Card>
      ))}
    </Screen>
  );
}

export function Profile({ go, user, setUser }) {
  const [form, setForm] = useState({ fullName: user.fullName, phone: user.phone, address: user.address || '', city: user.city || '', preferredLanguage: user.preferredLanguage || 'en' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: '' }));
  }
  async function save() {
    setError('');
    try {
      const next = await api('/api/auth/profile', { method: 'PATCH', body: form });
      setUser(next);
      setNotice('Profile saved.');
    } catch (err) {
      const fields = errorsFrom(err);
      setFieldErrors(fields);
      setError(Object.keys(fields).length ? '' : err.message);
    }
  }
  return (
    <Screen>
      <Back onPress={() => go('more')} />
      <Title>Profile</Title>
      <Notice text={notice} />
      <Notice text={error} bad />
      <Field labelText="Full name" value={form.fullName} error={fieldErrors.fullName} onChangeText={(fullName) => set('fullName', fullName)} />
      <Field labelText="Phone" keyboard="phone-pad" placeholder="0771234567" value={form.phone} error={fieldErrors.phone} onChangeText={(phone) => set('phone', phone)} />
      <Field labelText="Address" value={form.address} error={fieldErrors.address} onChangeText={(address) => set('address', address)} />
      <Field labelText="City" value={form.city} error={fieldErrors.city} onChangeText={(city) => set('city', city)} />
      <Text style={{ fontWeight: '800' }}>Language</Text>
      <Chips options={[['en', 'English'], ['si', 'Sinhala'], ['ta', 'Tamil']]} value={form.preferredLanguage} onChange={(preferredLanguage) => set('preferredLanguage', preferredLanguage)} />
      <Text>Email {user.email}</Text>
      <Btn onPress={save}>Save profile</Btn>
    </Screen>
  );
}

export function Settings({ go, user, setUser, onLogout }) {
  const [flags, setFlags] = useState({
    notifyMissed: user.notifyMissed !== false,
    notifyCheckins: user.notifyCheckins !== false,
    notifyOrders: user.notifyOrders !== false,
    notifyPayments: user.notifyPayments !== false,
    notifyReminders: user.notifyReminders !== false,
    preferredLanguage: user.preferredLanguage || 'en'
  });
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [server, setServer] = useState('');
  useEffect(() => { getApiBase().then(setServer).catch(() => {}); }, []);
  async function save() {
    setError('');
    try {
      await api('/api/settings/me', { method: 'PATCH', body: flags });
      setUser({ ...user, ...flags });
      setNotice('Settings saved. Emergency alerts always notify you.');
    } catch (err) { setError(err.message); }
  }
  async function changePassword() {
    setError('');
    try {
      const next = await api('/api/auth/password', { method: 'PATCH', body: password });
      await saveSession(next.token, next.user);
      setUser(next.user);
      setNotice('Password changed.');
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) { setError(err.message); }
  }
  const rows = [
    ['notifyCheckins', 'Check-in notifications'],
    ['notifyMissed', 'Missed check-in alerts'],
    ['notifyOrders', 'Order updates'],
    ['notifyPayments', 'Payment notifications'],
    ['notifyReminders', 'Reminder notifications']
  ];
  return (
    <Screen>
      <Back onPress={() => go('more')} />
      <Title>Settings</Title>
      <Notice text={notice} />
      <Notice text={error} bad />
      <Card>
        <Text style={{ fontWeight: '800' }}>Suva Voice server</Text>
        <Text>Use the computer address when this app is installed on a phone. The admin website stays in the browser.</Text>
        <Field labelText="Server address" value={server} onChangeText={setServer} />
        <Btn kind="secondary" onPress={async () => {
          setError('');
          try {
            await setApiBase(server);
            setNotice('Server address saved. Sign in again if the phone cannot reach the previous address.');
          } catch (err) { setError(err.message); }
        }}>Save server</Btn>
      </Card>
      <Card>
        <Text style={{ fontWeight: '800' }}>Notification settings</Text>
        {rows.map(([key, name]) => (
          <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 }}>
            <Text>{name}</Text>
            <Switch accessibilityLabel={name} value={flags[key]} onValueChange={(value) => setFlags({ ...flags, [key]: value })} />
          </View>
        ))}
        <Text>Emergency notifications stay on. Each check-in is spoken in that loved one’s language: English, Sinhala, or Tamil.</Text>
        <Text style={{ fontWeight: '800' }}>App language</Text>
        <Chips options={[['en', 'English'], ['si', 'Sinhala'], ['ta', 'Tamil']]} value={flags.preferredLanguage} onChange={(preferredLanguage) => setFlags({ ...flags, preferredLanguage })} />
        <Btn onPress={save}>Save settings</Btn>
      </Card>
      <Card>
        <Text style={{ fontWeight: '800' }}>Security</Text>
        <Field labelText="Current password" secure value={password.currentPassword} onChangeText={(currentPassword) => setPassword({ ...password, currentPassword })} />
        <Field labelText="New password" secure value={password.newPassword} onChangeText={(newPassword) => setPassword({ ...password, newPassword })} />
        <Field labelText="Confirm password" secure value={password.confirmPassword} onChangeText={(confirmPassword) => setPassword({ ...password, confirmPassword })} />
        <Btn kind="secondary" onPress={changePassword}>Change password</Btn>
      </Card>
      <Btn kind="danger" onPress={onLogout}>Logout</Btn>
    </Screen>
  );
}

export function Help({ go }) {
  const [q, setQ] = useState('');
  const [faq, setFaq] = useState([]);
  const [form, setForm] = useState({ subject: '', message: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [mine, setMine] = useState([]);
  useEffect(() => { api(`/api/support/faq?q=${encodeURIComponent(q)}`).then(setFaq).catch(() => {}); }, [q]);
  useEffect(() => { api('/api/support').then(setMine).catch(() => {}); }, [notice]);
  async function send() {
    setError('');
    try {
      await api('/api/support', { method: 'POST', body: form });
      setForm({ subject: '', message: '' });
      setNotice('Support request sent.');
    } catch (err) { setError(err.message); }
  }
  return (
    <Screen>
      <Back onPress={() => go('more')} />
      <Title>Help & Support</Title>
      <Notice text={notice} />
      <Notice text={error} bad />
      <Field labelText="Search help" value={q} onChangeText={setQ} />
      {faq.map((item) => <Card key={item.id}><Text style={{ fontWeight: '800' }}>{item.question}</Text><Text>{item.answer}</Text></Card>)}
      <Card>
        <Text style={{ fontWeight: '800' }}>Contact support</Text>
        <Field labelText="Subject" value={form.subject} onChangeText={(subject) => setForm({ ...form, subject })} />
        <Field labelText="Message" value={form.message} onChangeText={(message) => setForm({ ...form, message })} />
        <Btn onPress={send}>Send support request</Btn>
      </Card>
      {mine.map((item) => <Card key={item.id}><Text style={{ fontWeight: '800' }}>{item.subject}</Text><Badge value={item.status} /><Text>{item.staffResponse || item.message}</Text></Card>)}
    </Screen>
  );
}
