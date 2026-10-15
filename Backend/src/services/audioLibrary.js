import { accessSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../Audio');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const LANGUAGES = ['en', 'si', 'ta'];
const PROMPT_ID = /^[a-z0-9_]+$/;
const REMINDER_PROMPTS = {
  medication: 'medication_reminder',
  meal: 'meal_reminder',
  rest: 'rest_reminder',
  other: 'general_reminder'
};

export function listPromptIds() {
  return Object.keys(manifest);
}

export function promptText(promptId, language) {
  const prompt = manifest[promptId];
  if (!prompt?.active || !LANGUAGES.includes(language) || !prompt.text?.[language]) return null;
  return prompt.text[language];
}

export function languageFromText(text) {
  const value = String(text || '');
  for (const language of ['si', 'ta', 'en']) {
    const sample = promptText('wellness_options', language);
    if (sample && value.includes(sample.slice(0, 18))) return language;
  }
  return null;
}

export function openingPrompts(attempt = 1) {
  const ids = ['welcome', 'wellness_options'];
  if (Number(attempt) > 1) ids.unshift('calling_again');
  return ids;
}

export function reminderPromptId(type) {
  return REMINDER_PROMPTS[type] || null;
}

export function wellnessDigit(digit, holdMs = 0) {
  if (digit === '9') {
    if (Number(holdMs) >= 2000) return { code: 'emergency', source: 'PATIENT_LONG_PRESS_9' };
    return { code: null, source: 'app' };
  }
  const code = { 1: 'okay', 2: 'assistance', 3: 'emergency' }[digit] || null;
  return { code, source: 'app' };
}

export function resolveAudio(promptId, language) {
  if (!LANGUAGES.includes(language)) {
    throw Object.assign(new Error('That language is not available'), { status: 404 });
  }
  if (!PROMPT_ID.test(String(promptId || '')) || !manifest[promptId]?.active) {
    throw Object.assign(new Error('That prompt is not available'), { status: 404 });
  }
  const text = manifest[promptId].text?.[language];
  if (!text) {
    throw Object.assign(new Error(`The ${language} ${promptId} prompt is not available`), { status: 404 });
  }
  const file = resolve(root, language, 'telephony', `${promptId}.mp3`);
  const inside = relative(root, file);
  if (inside.startsWith('..') || isAbsolute(inside)) {
    throw Object.assign(new Error('That prompt is not available'), { status: 404 });
  }
  try {
    accessSync(file);
  } catch {
    throw Object.assign(new Error(`The ${language} ${promptId} prompt is not available`), { status: 404 });
  }
  return { file, language, promptId, text, contentType: 'audio/mpeg' };
}
