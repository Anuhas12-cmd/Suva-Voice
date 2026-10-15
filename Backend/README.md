# Suva Voice API

Node.js and Express. It is the only place that writes wellness results, alerts, notifications, orders, and payments.

## Run

```powershell
cd D:\CA\Backend
npm install
copy .env.example .env
npm run setup
npm start
```

The first start creates the database from `Database\schema.sql` and `Database\suva_voice.sql`. `npm run setup` replaces the saved rows with the original demo data. `npm run dev` restarts the API when source files change.

The scheduler runs inside this process. It reads due call schedules, starts retries, escalates open emergencies, and sends due reminders. Manual run, while `DEMO_MODE=true`:

```http
POST /api/system/scheduler/tick
```

## Checks

```powershell
node scripts/unit.js
node scripts/acceptance.js
```

Acceptance signs in, registers a throwaway family, and walks a demo call through okay, assistance, emergency, no answer, retry, and missed check-in. It restores the system retry settings when it finishes. It also reseeds demo data at the start, then leaves the extra "Acceptance Test Elder" profile in place. Run `node scripts/seed.js` to return to the original three loved ones.

## Security notes

Passwords are bcrypt hashes. Sessions are JWTs and are revoked by raising `token_version` on logout or password change. OTP and reset tokens are stored as SHA-256 hashes. In demo mode the plaintext code is returned by the API and is not written into the email body. Customer and staff routes are separated. The voice webhook uses `x-voice-secret`, not a user token.
