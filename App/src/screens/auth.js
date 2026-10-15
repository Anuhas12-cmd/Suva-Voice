import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { api, getApiBase, markOnboarding, saveSession, serverHint, setApiBase, suggestedApiBase } from '../api';
import { Art, Back, Btn, Card, Field, Logo, Notice, Screen, Text, Title, colors } from '../ui';

const terms = [
  ['The service', 'Suva Voice is a family account for people in Sri Lanka who look after an elderly relative. You use this app to save their details, schedule wellness calls, receive alerts, and request care orders. Your relative uses an ordinary phone and does not need this app.'],
  ['Wellness calls', 'At the scheduled time, Suva Voice calls their phone, plays a short greeting, and waits for a keypad answer. They press 1 if they are okay, 2 if they need assistance, or 3 for an emergency.'],
  ['Missed calls', 'If nobody answers, Suva Voice tries again using the retry settings, then records a missed check-in. A missed call is not treated as an emergency.'],
  ['Emergencies', 'An assistance or emergency answer alerts you and the Suva Voice care team, and can message the emergency contacts you added. Suva Voice does not contact public emergency services. If someone is in immediate danger, call the local emergency number yourself.'],
  ['Your details', 'You agree to give your real name, email, and a working Sri Lankan mobile number, and to keep the relative’s phone number and emergency contacts up to date. A check-in can only reach them when those numbers are correct.'],
  ['Care orders and payments', 'Orders for groceries, essential items, a doctor visit, or transport are requests for the care team to review. Payments in this installation are demonstration records in Sri Lankan rupees. No bank account or card is charged. Plan prices shown in the app are illustrative examples, not a live commercial offer.'],
  ['Not medical care', 'Suva Voice is a check-in and family-alert service. It does not diagnose illness, provide treatment, or replace a doctor, a hospital, or an emergency service.'],
  ['Your account', 'Keep your password private. You are responsible for activity on your family account. You can ask support to close the account. These terms apply to the Suva Voice family app as of 29 September 2026.']
];

function TermsBody() {
  return (
    <>
      <Title sub="Please read these before you create a family account.">Terms and Conditions</Title>
      {terms.map(([heading, body]) => (
        <Card key={heading}>
          <Text style={{ fontWeight: '800', fontSize: 16 }}>{heading}</Text>
          <Text style={{ fontSize: 15, lineHeight: 22 }}>{body}</Text>
        </Card>
      ))}
    </>
  );
}

export function Terms({ go, back = 'more' }) {
  return (
    <Screen>
      <Back onPress={() => go(back)} />
      <TermsBody />
    </Screen>
  );
}

function normalizePhone(input) {
  const raw = String(input || '').replace(/[^\d+]/g, '');
  if (raw.startsWith('+94')) return `0${raw.slice(3)}`;
  if (raw.startsWith('94') && raw.length === 11) return `0${raw.slice(2)}`;
  return raw;
}

function fieldMap(details) {
  const next = {};
  for (const item of details || []) {
    if (item.path && !next[item.path]) next[item.path] = item.message;
  }
  return next;
}

function registrationErrors(form, accepted) {
  const errors = {};
  if (form.fullName.trim().length < 2) errors.fullName = 'Enter your full name';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address';
  if (!/^0\d{9}$/.test(normalizePhone(form.phone))) errors.phone = 'Enter a 10-digit Sri Lankan number, for example 0771234567';
  if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
    errors.password = 'Use at least 8 characters, with a letter and a number';
  }
  if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match';
  if (!accepted) errors.terms = 'Accept the Terms and Conditions to create an account';
  return errors;
}

const slides = [
  [require('../../assets/photos/family-garden.jpg'), 'Caring from anywhere', 'Keep a daily connection with parents and relatives, even when you live in another city.'],
  [require('../../assets/photos/call.jpg'), 'Automated wellness calls', 'Suva Voice calls their ordinary phone. They press 1 if they are okay, 2 for assistance, or 3 for an emergency.'],
  [require('../../assets/photos/family-indoor.jpg'), 'Emergency alerts', 'Assistance and emergency answers notify you and the care team. A missed call is not treated as an emergency.'],
  [require('../../assets/photos/family-kitchen.jpg'), 'Elderly support services', 'Request groceries, a doctor visit, or transport, and follow the order from your phone.']
];

export function Splash() {
  return (
    <Screen>
      <View style={{ flex: 1, minHeight: 520, justifyContent: 'center' }}>
        <Logo />
      </View>
    </Screen>
  );
}

export function Onboarding({ go }) {
  const [index, setIndex] = useState(0);
  const [art, title, body] = slides[index];
  return (
    <Screen>
      <View style={{ flexGrow: 1, justifyContent: 'center', gap: 12 }}>
        <Card>
          <Art source={art} />
          <Title>{title}</Title>
          <Text style={{ fontSize: 16, lineHeight: 24 }}>{body}</Text>
        </Card>
        <Text style={{ textAlign: 'center', fontWeight: '800' }}>{index + 1} of {slides.length}</Text>
        <Btn onPress={async () => {
          if (index < slides.length - 1) setIndex(index + 1);
          else {
            await markOnboarding();
            go('login', {}, true);
          }
        }}>{index < slides.length - 1 ? 'Next' : 'Get started'}</Btn>
        <Btn kind="ghost" onPress={async () => { await markOnboarding(); go('login', {}, true); }}>Skip</Btn>
      </View>
    </Screen>
  );
}

export function Login({ go }) {
  const [form, setForm] = useState({ identifier: 'nimal.fernando@suvavoice.lk', password: 'Customer@12345' });
  const [server, setServer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { getApiBase().then(setServer).catch(() => {}); }, []);
  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (server) await setApiBase(server);
      const data = await api('/api/auth/login', { method: 'POST', body: form, token: null });
      if (data.user.role !== 'customer') throw new Error('Use a family account in the mobile app. Staff sign in on the admin website.');
      await saveSession(data.token, data.user);
      go('home', { user: data.user }, true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Logo compact />
      <Image source={require('../../assets/photos/family-garden.jpg')} style={{ width: '100%', height: 132, borderRadius: 24 }} resizeMode="cover" />
      <Title sub={serverHint()}>Welcome back</Title>
      <Notice text={error} bad />
      <Field labelText="Suva Voice server" value={server} onChangeText={setServer} placeholder={suggestedApiBase()} />
      <Field labelText="Email or phone number" value={form.identifier} onChangeText={(identifier) => setForm({ ...form, identifier })} />
      <Field labelText="Password" secure value={form.password} onChangeText={(password) => setForm({ ...form, password })} />
      <Btn onPress={submit} disabled={busy}>{busy ? 'Signing in…' : 'Login'}</Btn>
      <Btn kind="ghost" onPress={() => go('forgot')}>Forgot Password</Btn>
      <Btn kind="secondary" onPress={() => go('register')}>Don’t have an account? Sign up</Btn>
    </Screen>
  );
}

export function Register({ go }) {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [accepted, setAccepted] = useState(false);
  const [readingTerms, setReadingTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: '' }));
  }
  async function submit() {
    setBusy(true);
    setError('');
    const local = registrationErrors(form, accepted);
    if (Object.keys(local).length) {
      setFieldErrors(local);
      setBusy(false);
      return;
    }
    try {
      const data = await api('/api/auth/register', { method: 'POST', body: form, token: null });
      go('otp', { email: data.email, demoOtp: data.demoOtp || '' });
    } catch (err) {
      const fields = fieldMap(err.details);
      setFieldErrors(fields);
      setError(Object.keys(fields).length ? '' : err.message);
    } finally {
      setBusy(false);
    }
  }
  if (readingTerms) {
    return (
      <Screen>
        <Back onPress={() => setReadingTerms(false)} />
        <TermsBody />
      </Screen>
    );
  }
  return (
    <Screen>
      <Back onPress={() => go('login', {}, true)} />
      <Title sub="Create your family account">Create Account</Title>
      <Notice text={error} bad />
      <Field labelText="Full Name" value={form.fullName} error={fieldErrors.fullName} onChangeText={(value) => set('fullName', value)} />
      <Field labelText="Email" keyboard="email-address" value={form.email} error={fieldErrors.email} onChangeText={(value) => set('email', value)} />
      <Field labelText="Phone Number" keyboard="phone-pad" placeholder="0771234567" value={form.phone} error={fieldErrors.phone} onChangeText={(value) => set('phone', value)} />
      <Field labelText="Password" secure value={form.password} error={fieldErrors.password} onChangeText={(value) => set('password', value)} />
      <Field labelText="Confirm Password" secure value={form.confirmPassword} error={fieldErrors.confirmPassword} onChangeText={(value) => set('confirmPassword', value)} />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => { setAccepted((current) => !current); setFieldErrors((current) => ({ ...current, terms: '' })); }} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Text style={{ fontSize: 18, color: fieldErrors.terms ? colors.bad : colors.tealDark }}>{accepted ? '☑' : '☐'}</Text>
        <Text style={{ flex: 1, fontSize: 15, lineHeight: 22, color: fieldErrors.terms ? colors.bad : colors.ink }}>I agree to the Terms and Conditions</Text>
      </Pressable>
      {fieldErrors.terms ? <Text style={{ color: colors.bad, fontWeight: '700' }}>{fieldErrors.terms}</Text> : null}
      <Btn kind="ghost" onPress={() => setReadingTerms(true)}>Read Terms and Conditions</Btn>
      <Btn onPress={submit} disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</Btn>
    </Screen>
  );
}

export function Otp({ go, params }) {
  const [otp, setOtp] = useState(params.demoOtp || '');
  const [error, setError] = useState('');
  async function submit() {
    setError('');
    try {
      const data = await api('/api/auth/verify-otp', { method: 'POST', body: { email: params.email, otp }, token: null });
      await saveSession(data.token, data.user);
      go('home', { user: data.user }, true);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <Screen>
      <Title sub={`Enter the 6-digit code sent to ${params.email}`}>Verify Your Number</Title>
      <Notice text={params.demoOtp ? `Demo code: ${params.demoOtp}. It is also stored in the notification log, not in the email body.` : ''} />
      <Notice text={error} bad />
      <Field labelText="Verification code" keyboard="number-pad" value={otp} onChangeText={setOtp} />
      <Btn onPress={submit}>Verify</Btn>
      <Btn kind="secondary" onPress={async () => {
        const data = await api('/api/auth/resend-otp', { method: 'POST', body: { identifier: params.email }, token: null });
        if (data.demoOtp) setOtp(data.demoOtp);
      }}>Resend code</Btn>
    </Screen>
  );
}

export function Forgot({ go }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function submit() {
    setError('');
    try {
      const data = await api('/api/auth/forgot-password', { method: 'POST', body: { identifier }, token: null });
      if (!data.demoResetToken) {
        setNotice(data.message);
        return;
      }
      const reset = await api('/api/auth/reset-password', { method: 'POST', body: { token: data.demoResetToken, password }, token: null });
      await saveSession(reset.token, reset.user);
      go('home', { user: reset.user }, true);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <Screen>
      <Back onPress={() => go('login', {}, true)} />
      <Title sub="Demo mode applies the new password immediately.">Forgot Password</Title>
      <Notice text={notice} />
      <Notice text={error} bad />
      <Field labelText="Email or phone number" value={identifier} onChangeText={setIdentifier} />
      <Field labelText="New password" secure value={password} onChangeText={setPassword} />
      <Btn onPress={submit}>Send Reset Link</Btn>
    </Screen>
  );
}
