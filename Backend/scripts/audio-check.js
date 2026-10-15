import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import {
  languageFromText,
  openingPrompts,
  promptText,
  reminderPromptId,
  resolveAudio,
  wellnessDigit
} from '../src/services/audioLibrary.js';
import { buildPrompt } from '../src/util/time.js';

const bytes = {};
for (const language of ['en', 'si', 'ta']) {
  const text = buildPrompt(new Date(), language);
  assert.equal(languageFromText(text), language);
  const welcome = resolveAudio('welcome', language);
  const options = resolveAudio('wellness_options', language);
  assert.ok(welcome.file.includes(`${language}\\telephony\\`) || welcome.file.includes(`${language}/telephony/`));
  bytes[language] = readFileSync(welcome.file);
  assert.ok(bytes[language].length > 500);
  assert.notEqual(bytes[language].length, readFileSync(options.file).length);
  assert.equal(resolveAudio('medication_reminder', language).language, language);
  assert.equal(resolveAudio('emergency_received', language).text.includes('ambulance'), false);
}
assert.notDeepEqual(bytes.en, bytes.si);
assert.notDeepEqual(bytes.en, bytes.ta);
assert.notDeepEqual(bytes.si, bytes.ta);
assert.throws(() => resolveAudio('welcome', 'fr'));
assert.throws(() => resolveAudio('../welcome', 'en'));
assert.throws(() => resolveAudio('not_a_prompt', 'si'));
assert.equal(wellnessDigit('1').code, 'okay');
assert.equal(wellnessDigit('2').code, 'assistance');
assert.equal(wellnessDigit('3').code, 'emergency');
assert.equal(wellnessDigit('9', 500).code, null);
assert.equal(wellnessDigit('9', 2000).source, 'PATIENT_LONG_PRESS_9');
assert.equal(reminderPromptId('medication'), 'medication_reminder');
assert.equal(reminderPromptId('meal'), 'meal_reminder');
assert.equal(reminderPromptId('rest'), 'rest_reminder');
assert.equal(reminderPromptId('other'), 'general_reminder');
assert.deepEqual(openingPrompts(1), ['welcome', 'wellness_options']);
assert.equal(openingPrompts(2)[0], 'calling_again');
assert.equal(promptText('okay_received', 'si').includes('press 1'), false);
console.log('audio checks passed');
