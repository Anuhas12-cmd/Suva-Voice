import { access, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bundledGreeting } from './greetingLibrary.js';
import { speechLanguage, synthesizeToFile } from './neuralSpeech.js';

const folder = join(dirname(fileURLToPath(import.meta.url)), '../../data/greetings');
const pending = new Map();

export function greetingFile(callId) {
  return join(folder, `${callId}.mp3`);
}

export function ensureGreeting(callId, text) {
  const existing = pending.get(callId);
  if (existing) return existing;
  const job = writeGreeting(callId, text).finally(() => pending.delete(callId));
  pending.set(callId, job);
  return job;
}

async function writeGreeting(callId, text) {
  const saved = await bundledGreeting(text);
  if (saved) return saved;
  const file = greetingFile(callId);
  try {
    await access(file);
    return file;
  } catch {
    // The greeting has not been recorded yet.
  }
  await mkdir(folder, { recursive: true });
  const spoken = String(text || 'This is Suva Voice. Please press 1 if you are okay. Press 2 if you need assistance. Press 3 for emergency.');
  await synthesizeToFile(file, spoken, speechLanguage(spoken));
  return file;
}
