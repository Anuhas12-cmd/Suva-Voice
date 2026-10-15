# Local server

Path: `D:\CA\LocalServer`. It is the development stand-in for the telephone exchange and the outbound message gateway is the API's notification service, not this process.

Flow:

1. The scheduler or a person presses Start test call.
2. The API inserts a `dialing` call and POSTs to `http://127.0.0.1:4100/api/voice/originate` with the shared secret.
3. The local server answers 202 and then posts `ringing`, `connected`, `playing`, and `waiting_dtmf` to `/api/voice/events`.
4. During `playing` it speaks the prompt on Windows.
5. The app posts the digit, or a no-answer / failed / no-response simulation, to the API.
6. The API records the result, alerts, and notifications, then tells the local server to hang up.

`GET http://127.0.0.1:4100/health` returns `{ service, ok, mode, sessions }`. The admin Settings page shows that status.
