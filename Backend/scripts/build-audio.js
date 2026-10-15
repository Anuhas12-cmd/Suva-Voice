import { access, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { listPromptIds, promptText } from '../src/services/audioLibrary.js';
import { synthesizeToFile } from '../src/services/neuralSpeech.js';

const root = fileURLToPath(new URL('../../Audio/', import.meta.url));
const languages = ['en', 'si', 'ta'];

for (const promptId of listPromptIds()) {
  for (const language of languages) {
    const file = join(root, language, 'telephony', `${promptId}.mp3`);
    try {
      await access(file);
      console.log(`keep ${language} ${promptId}`);
      continue;
    } catch {
      // This recording has not been created yet.
    }
    await mkdir(dirname(file), { recursive: true });
    await synthesizeToFile(file, promptText(promptId, language), language);
    console.log(`wrote ${language} ${promptId}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

console.log('audio files ready');
