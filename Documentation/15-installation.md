# Installation

Requirements: Node.js 24 and npm. The SQL database travels inside `Database\suva_voice.sql`. A separate database server is not required.

1. Install dependencies:

```powershell
cd D:\CA\Backend; npm install
cd D:\CA\LocalServer; npm install
cd D:\CA\Web; npm install
cd D:\CA\App; npm install
```

2. Copy the four `.env.example` files to `.env` and set `JWT_SECRET` and `VOICE_WEBHOOK_SECRET`. When moving an existing copy, keep the `.env` files that are already filled in.
3. Start the API. It creates the database from `Database\schema.sql` and `Database\suva_voice.sql` when `Database\data` is missing. Run `npm run setup` only when you want to wipe the saved rows and restore the original demo accounts.

Asterisk, a SIP trunk, and an SMS account are not part of installation for demo mode.
