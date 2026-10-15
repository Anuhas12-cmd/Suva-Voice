# Folder structure

```
D:\CA
  App\            Customer Expo application
  Web\            Admin React application
  Backend\        REST API, scheduler, seed, tests
    src\routes    HTTP routes
    src\services  Calls, alerts, orders, billing, notifications
    scripts       setup, seed, unit, acceptance
  Database\       schema.sql
  LocalServer\    Demo voice server and Asterisk samples
    asterisk\     extensions.conf, pjsip example, prompt text
  Documentation\  These notes
  scripts\        npm start launcher
```

Each application has its own `package.json` and `.env`. Secrets stay in the ignored `.env` files.
