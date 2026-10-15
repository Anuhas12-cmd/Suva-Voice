# Technology stack

This machine has Node.js 24. Python, Docker, and the Asterisk package are not installed, so the working telephony path is the local demo server, with an AMI client ready for when Asterisk is added. The database is SQL stored in the project folder. The API creates it on launch.

| Piece | Choice |
| --- | --- |
| Customer app | Expo, React Native, React Native Web |
| Admin website | React 19, Vite 6, React Router |
| API | Node.js, Express 4, ESM |
| Database | SQL file `Database/suva_voice.sql`, created into `Database/data` on launch |
| Auth | bcrypt passwords, JWT, role checks |
| Validation | Zod |
| Realtime | Socket.IO |
| Scheduler | `setInterval` inside the API process |
| Voice | Local HTTP server, Windows TTS, optional Asterisk AMI |
| Messages | Notification service with demo, SMS, and email providers |

Currency display is Sri Lankan rupees. Plan prices in the seed data are labelled illustrative demo prices.
