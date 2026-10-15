import { get } from 'https';
import { writeFile } from 'fs/promises';

const CODES = { en: 'en', si: 'si', ta: 'ta' };

export function speechLanguage(text) {
  const value = String(text || '');
  if (/[\u0D80-\u0DFF]/.test(value)) return 'si';
  if (/[\u0B80-\u0BFF]/.test(value)) return 'ta';
  return 'en';
}

function fetchAudio(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000
    }, (response) => {
      const location = response.headers.location;
      if (response.statusCode >= 300 && response.statusCode < 400 && location && redirects < 3) {
        response.resume();
        const next = new URL(location, url).toString();
        fetchAudio(next, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`The greeting voice was refused (${response.statusCode})`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('The greeting voice did not respond'));
    });
    request.on('error', (error) => reject(new Error(error.message || 'The greeting voice could not be reached')));
  });
}

export async function synthesize(text, language = 'en') {
  const code = CODES[language] || CODES.en;
  const sentences = String(text).split(/(?<=[.!?।])\s+/).map((part) => part.trim()).filter(Boolean);
  const pieces = [];
  for (const sentence of (sentences.length ? sentences : [String(text)])) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${code}&q=${encodeURIComponent(sentence)}`;
    const audio = await fetchAudio(url);
    if (audio.length < 500) throw new Error('The greeting voice did not return audio');
    pieces.push(audio);
  }
  return Buffer.concat(pieces);
}

export async function synthesizeToFile(file, text, language) {
  const audio = await synthesize(text, language || speechLanguage(text));
  await writeFile(file, audio);
  return file;
}
