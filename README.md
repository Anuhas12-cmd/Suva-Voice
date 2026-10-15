# Suva Voice

Care. Connect. Protect.

Suva Voice checks on elderly relatives in Sri Lanka by calling their ordinary phone. The person answers and presses a key. The family uses the mobile app. Suva Voice staff use the admin website. Neither the call nor the alerts require the elderly person to use a smartphone.

## Parts

| Part | Path | Address |
| --- | --- | --- |
| Customer app | `App` | http://127.0.0.1:8081 |
| Admin website | `Web` | http://127.0.0.1:5173 |
| REST API | `Backend` | http://127.0.0.1:4000 |
| Database | `Database` | PostgreSQL `suva_voice` on port 5432 |
| Voice and message server | `LocalServer` | http://127.0.0.1:4100 |
| Documentation | `Documentation` | |

## Start the system

The database is the SQL file `Database\suva_voice.sql`. The first time the API starts, it creates `Database\data` from that file. Copy the whole `D:\CA` folder, including `Backend\.env` and `Database\suva_voice.sql`, and the same accounts and loved ones come with it. A separate PostgreSQL install is not required.

From `D:\CA`, after dependencies are installed:

```powershell
npm start
```

That starts the API, the local voice server, the admin site, and the customer app in the browser.

First-time setup, from `D:\CA`:

```powershell
cd Backend
npm install
copy .env.example .env
cd ..\LocalServer
npm install
copy .env.example .env
cd ..\Web
npm install
cd ..\App
npm install
cd ..
npm run setup
npm start
```

Fill `Backend\.env` and `LocalServer\.env` before starting. The examples list every variable. Do not commit those files.

`npm run setup` wipes the saved records and loads the original fictional demo data. Leave it unused when you want to keep the data already in `Database\suva_voice.sql`.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Administrator | admin@suvavoice.lk | Admin@12345 |
| Staff | staff@suvavoice.lk | Staff@12345 |
| Family | nimal.fernando@suvavoice.lk | Customer@12345 |
| Family | dilani.fernando@suvavoice.lk | Customer@12345 |

The admin site accepts administrator and staff accounts. The mobile app accepts family accounts.

## Try a wellness call

1. Sign in to the admin site or the family app.
2. Open Call History or Live check-in.
3. Choose a loved one and press **Start test call**.
4. Wait until the prompt is playing and the keypad buttons appear.
5. Press 1 for okay, 2 for assistance, or 3 for emergency.

Press 1 completes the check-in. Press 2 opens an assistance alert and stores a demo SMS. Press 3 opens an emergency, notifies the first contact and the care team, and updates both screens through the live connection. A missed call is a missed check-in, not an emergency.

No telephone line or SMS gateway is required. Details are in `Documentation`.
