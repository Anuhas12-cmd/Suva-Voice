import { promptText } from '../services/audioLibrary.js';

const WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function colomboParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short'
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    isoWeekday: WEEKDAY[parts.weekday],
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function nextRunAt(timeOfDay, days, from = new Date()) {
  const [hour, minute] = String(timeOfDay).slice(0, 5).split(':').map(Number);
  const nowParts = colomboParts(from);
  const base = new Date(`${nowParts.dateKey}T00:00:00+05:30`);
  const allowed = (days || []).map(Number);
  for (let add = 0; add < 8; add += 1) {
    const probe = new Date(base.getTime() + add * 24 * 60 * 60 * 1000);
    const parts = colomboParts(probe);
    if (!allowed.includes(parts.isoWeekday)) continue;
    const stamp = new Date(`${parts.dateKey}T${pad(hour)}:${pad(minute)}:00+05:30`);
    if (stamp.getTime() <= from.getTime() + 500) continue;
    return stamp;
  }
  return new Date(from.getTime() + 24 * 60 * 60 * 1000);
}

const PROMPTS = {
  en: {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    body: 'This is Suva Voice. Please press 1 if you are okay. Press 2 if you need assistance. Press 3 for emergency.'
  },
  si: {
    morning: 'සුභ උදෑසනක්',
    afternoon: 'සුභ දහවලක්',
    evening: 'සුභ සන්ධ්‍යාවක්',
    body: 'මේ සුව වොයිස්. ඔබට සුවයි නම්, කරුණාකර එක ඔබන්න. උදව්වක් අවශ්‍ය නම්, දෙක ඔබන්න. මෙය හදිසි අවස්ථාවක් නම්, තුන ඔබන්න.'
  },
  ta: {
    morning: 'காலை வணக்கம்',
    afternoon: 'மதிய வணக்கம்',
    evening: 'மாலை வணக்கம்',
    body: 'இது சுவ வாய்ஸ். நீங்கள் நலமாக இருந்தால், ஒன்றை அழுத்தவும். உதவி வேண்டுமானால், இரண்டை அழுத்தவும். அவசரமாக இருந்தால், மூன்றை அழுத்தவும்.'
  }
};

export function greeting(date = new Date(), language = 'en') {
  const hour = Number(colomboParts(date).hour);
  const lines = PROMPTS[language] || PROMPTS.en;
  if (hour < 12) return lines.morning;
  if (hour < 17) return lines.afternoon;
  return lines.evening;
}

export function buildPrompt(_date = new Date(), language = 'en') {
  const text = promptText('wellness_options', language);
  if (!text) throw new Error('That language is not available');
  return text;
}

export function promptKey(text) {
  const value = String(text || '');
  for (const language of ['si', 'ta', 'en']) {
    for (const part of ['morning', 'afternoon', 'evening']) {
      if (value.startsWith(PROMPTS[language][part])) return { language, part };
    }
  }
  return null;
}

export function daysAgoAt(days, timeOfDay) {
  const [hour, minute] = String(timeOfDay).slice(0, 5).split(':').map(Number);
  const parts = colomboParts();
  const today = new Date(`${parts.dateKey}T${pad(hour)}:${pad(minute)}:00+05:30`);
  return new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
}
