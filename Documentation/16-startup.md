# Startup

From `D:\CA`:

```powershell
npm start
```

Or start the pieces yourself:

```powershell
cd D:\CA\Backend
node src/index.js

cd D:\CA\LocalServer
node src/index.js

cd D:\CA\Web
npm run dev

cd D:\CA\App
npm run web
```

| Service | URL |
| --- | --- |
| API | http://127.0.0.1:4000/api/health |
| Voice | http://127.0.0.1:4100/health |
| Admin | http://127.0.0.1:5173 |
| Customer app | http://127.0.0.1:8081 |

The API log should say it is listening on port 4000 and that the scheduler is checking. The voice log should say it is listening on 127.0.0.1:4100.

If a port is already taken, stop that process before `npm start`. Closing the start window stops the child processes.
