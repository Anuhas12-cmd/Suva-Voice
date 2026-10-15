# Asterisk configuration

Asterisk is optional. Demo mode is the supported path on a machine without Asterisk installed.

When you install Asterisk:

1. Copy `LocalServer/asterisk/extensions.conf` into the Asterisk dialplan and reload.
2. Use `LocalServer/asterisk/pjsip.conf.example` as a starting trunk. The endpoint and the address-of-record are separate sections. Replace `CHANGE_ME` and the example SIP host.
3. Add an AMI user as commented in that file. Permit `127.0.0.1` only.
4. In `LocalServer/.env` and `Backend/.env` set `ASTERISK_ENABLED=true` and the host, port, username, and password.
5. Leave `DEMO_FALLBACK` on until the trunk places a real call. If AMI fails, the demo timers still run.
6. Point the dialplan's curl at `POST /api/voice/events` with header `x-voice-secret`.

The spoken sentence is in `LocalServer/asterisk/prompts/greeting.txt`. Digits 1, 2, and 3 map to okay, assistance, and emergency. Other digits are stored as invalid and the call stays open. No digit is `no_response`. The API does not call public emergency services.
