# Suva Voice local voice server

Development telephony and message adapter. It listens on `127.0.0.1:4100`.

```powershell
cd D:\CA\LocalServer
npm install
copy .env.example .env
npm start
```

`VOICE_WEBHOOK_SECRET` must match the API.

## Demo calls

The API asks this server to originate a call. In demo mode the server moves the call through ringing, connected, playing, and waiting for a key. At the playing step it speaks the English prompt with Windows System.Speech when `TTS_ENABLED` is not `false`. The family or staff member then presses 1, 2, or 3 in the app. Those digits go to the API, which is the same code path a real telephone would use.

`GET /health` reports the mode and the number of active sessions.

## Asterisk

Asterisk is the intended telephone integration and is not required for demo mode. `ASTERISK_ENABLED=false` by default. When it is true, the server originates through AMI and falls back to the demo timer if AMI fails and `DEMO_FALLBACK` is not `false`.

Sample dialplan: `asterisk/extensions.conf`. Sample trunk: `asterisk/pjsip.conf.example`. The prompt text is `asterisk/prompts/greeting.txt`.

Set `ASTERISK_HOST`, `ASTERISK_PORT`, `ASTERISK_USERNAME`, and `ASTERISK_PASSWORD` in `.env`. Do not commit those values.
