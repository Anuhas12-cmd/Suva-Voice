import { access } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promptKey } from '../util/time.js';

const folder = join(dirname(fileURLToPath(import.meta.url)), '../../assets/greetings');

export function bundledGreetingPath(text) {
  const key = promptKey(text);
  if (!key) return null;
  return join(folder, `${key.language}-${key.part}.mp3`);
}

export async function bundledGreeting(text) {
  const file = bundledGreetingPath(text);
  if (!file) return null;
  try {
    await access(file);
    return file;
  } catch {
    return null;
  }
}
