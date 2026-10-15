# Environment variables

Copy each `.env.example` to `.env`. Never commit `.env`.

`Backend/.env`

```
JWT_SECRET=
JWT_EXPIRES_IN=12h
API_PORT=4000
APP_URL=http://127.0.0.1:8081
WEB_URL=http://127.0.0.1:5173
LOCAL_SERVER_URL=http://127.0.0.1:4100
VOICE_WEBHOOK_SECRET=
DEMO_MODE=true
SCHEDULER_ENABLED=true
SCHEDULER_TICK_MS=10000
ASTERISK_ENABLED=false
ASTERISK_HOST=
ASTERISK_PORT=5038
ASTERISK_USERNAME=
ASTERISK_PASSWORD=
SMS_PROVIDER=demo
SMS_API_KEY=
SMS_API_URL=
EMAIL_PROVIDER=demo
EMAIL_API_KEY=
EMAIL_API_URL=
PAYMENT_PROVIDER=demo
```

`JWT_SECRET` must be at least 16 characters. `VOICE_WEBHOOK_SECRET` must match `LocalServer/.env`.

`LocalServer/.env` uses `PORT`, `BACKEND_URL`, `VOICE_WEBHOOK_SECRET`, `ASTERISK_ENABLED`, `ASTERISK_HOST`, `ASTERISK_PORT`, `ASTERISK_USERNAME`, `ASTERISK_PASSWORD`, `DEMO_FALLBACK`, and `TTS_ENABLED`.

`Web/.env` has `VITE_API_URL`. `App/.env` has `EXPO_PUBLIC_API_URL`.

If `PAYMENT_PROVIDER` is anything other than `demo`, payment requests return 501 until a gateway adapter is added. The charge function is the only place that needs to change.
