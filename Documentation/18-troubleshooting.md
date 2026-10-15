# Troubleshooting

**API exits immediately.** `JWT_SECRET` (16+ characters) and `VOICE_WEBHOOK_SECRET` must be set. If the SQL file is damaged, move `Database\data` aside and start again so it is rebuilt from `Database\suva_voice.sql`.

**Voice events return 401.** The secret header must match both `.env` files. Restart the API after changing it. The people routes must not require a user token for `/api/voice/events`.

**The call stays on Calling.** The local server is stopped, or it cannot reach the API. Check `http://127.0.0.1:4100/health` and the voice log for undelivered events.

**Keypad buttons never appear.** They appear only at `waiting_dtmf`, about two seconds after the call starts. A second live call for the same person is rejected until the first one finishes.

**Admin page is blank.** Reload. An earlier build error was a `.js` file that contained JSX; the auth module is `Web/src/api.jsx`.

**Customer web fails to start.** Install web support with `npx expo install react-dom react-native-web`.

**Port already in use.** Another `node` process is still the API or Vite. Stop it before starting again.

**psql waits forever.** It is waiting for a password. Set `PGPASSWORD` or use the connection string. Do not switch `pg_hba.conf` to trust.

**Demo SMS never leaves the building.** That is expected. Read Admin → Notifications → SMS log.
