import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN = 'sv_customer_token';
const USER = 'sv_customer_user';
const SERVER_KEY = 'sv_api_base';
const EMULATOR_API = 'http://10.0.2.2:4000';
const PHONE_API = 'http://192.168.122.13:4000';

function isAndroidEmulator() {
  if (Platform.OS !== 'android') return false;
  const info = `${Platform.constants?.Model || ''} ${Platform.constants?.Fingerprint || ''}`;
  return /sdk_gphone|emulator|generic|google_sdk|Android SDK built for/i.test(info);
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function suggestedApiBase() {
  if (isAndroidEmulator()) return EMULATOR_API;
  if (Platform.OS === 'android') return PHONE_API;
  return process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:4000';
}

export function serverHint() {
  if (isAndroidEmulator()) return 'The emulator reaches this computer at http://10.0.2.2:4000.';
  if (Platform.OS === 'android') return 'The phone and this computer must be on the same Wi-Fi.';
  return undefined;
}

export async function getToken() {
  return AsyncStorage.getItem(TOKEN);
}

export async function getApiBase() {
  const suggested = suggestedApiBase();
  const saved = await AsyncStorage.getItem(SERVER_KEY);
  if (!saved) return suggested;
  const host = hostnameOf(saved);
  const retired = host === '10.200.82.13';
  const emulatorUsingLan = isAndroidEmulator() && host !== '10.0.2.2' && host !== '127.0.0.1' && host !== 'localhost';
  if (!host || retired || emulatorUsingLan) {
    await AsyncStorage.setItem(SERVER_KEY, suggested);
    return suggested;
  }
  return saved.replace(/\/$/, '');
}

export async function setApiBase(url) {
  const clean = String(url || '').trim().replace(/\/$/, '');
  if (!/^https?:\/\/.+/i.test(clean)) {
    throw new Error(`Enter the computer address as ${suggestedApiBase()}`);
  }
  await AsyncStorage.setItem(SERVER_KEY, clean);
  return clean;
}

/** @param {string} path @param {{method?: string, body?: unknown, token?: string | null}} [options] */
export async function api(path, { method = 'GET', body, token } = {}) {
  const auth = token === undefined ? await AsyncStorage.getItem(TOKEN) : token;
  const response = await fetch(`${await getApiBase()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json.error?.message || 'Request failed');
    error.details = json.error?.details;
    error.status = response.status;
    throw error;
  }
  return json.data;
}

export async function saveSession(token, user) {
  await AsyncStorage.setItem(TOKEN, token);
  await AsyncStorage.setItem(USER, JSON.stringify(user));
}

export async function loadSession() {
  const token = await AsyncStorage.getItem(TOKEN);
  const raw = await AsyncStorage.getItem(USER);
  if (!token || !raw) return null;
  return { token, user: JSON.parse(raw) };
}

export async function clearSession() {
  await AsyncStorage.multiRemove([TOKEN, USER]);
}

export async function seenOnboarding() {
  return (await AsyncStorage.getItem('sv_onboarded')) === '1';
}

export async function markOnboarding() {
  await AsyncStorage.setItem('sv_onboarded', '1');
}
