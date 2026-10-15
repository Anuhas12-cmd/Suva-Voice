# Suva Voice customer app

Mobile app for family members. It is an Expo React Native project and runs in the browser for development. The same project can be opened in Expo Go on a phone.

## Android Studio

The customer app is a native Android project. The admin website is still the browser app in `D:\CA\Web`.

1. Install Android Studio and open the folder `D:\CA\App\android`.
2. Wait for Gradle to finish.
3. Connect a phone with USB debugging, or start an emulator.
4. Press Run. The package name is `lk.suvavoice.customer`.
5. On the emulator, the server address is `http://10.0.2.2:4000`. On a phone, use this computer’s Wi-Fi address, currently `http://192.168.122.13:4000`, with both devices on the same Wi-Fi. The API must be running.

A debug APK is produced by `gradlew assembleDebug` at `android\app\build\outputs\apk\debug\app-debug.apk`. Copy that file to a phone and install it. Android may ask you to allow installs from that source.

Regenerate the Android project after Expo config changes:

```powershell
cd D:\CA\App
npx expo prebuild --platform android
```

## Run in the browser

```powershell
cd D:\CA\App
npm install
npm run web
```

Open http://127.0.0.1:8081. The API address is `EXPO_PUBLIC_API_URL` in `.env` and defaults to `http://127.0.0.1:4000`.

On a physical phone, set `EXPO_PUBLIC_API_URL` to the computer's LAN address and run `npx expo start`.

Sign in with `nimal.fernando@suvavoice.lk` / `Customer@12345`.

## What the family can do

- Register, confirm the demo OTP, reset a password, and sign out
- See today's check-ins, emergency status, loved ones, reminders, alerts, and orders
- Add and edit a loved one, emergency contacts, and the check-in time
- Start a demo wellness call and press 1, 2, or 3
- Simulate no answer, a failed call, or no keypad response
- Create, edit, enable, disable, and delete medication, meal, rest, and other reminders
- Request groceries, essentials, a doctor appointment, or transport, then follow delivery stages
- Pay an order in the demo ledger and review past payments in rupees
- View plans and change the subscription
- Read notifications, update profile and notification settings, and send a support request

Emergency notifications cannot be switched off. Spoken demo prompts are English. Each loved one still stores a preferred language of English, Sinhala, or Tamil.
