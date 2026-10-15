@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Suva Voice

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js, then run this file again.
  goto finish
)
if not exist "%~dp0Backend\node_modules\" goto missingdeps
if not exist "%~dp0LocalServer\node_modules\" goto missingdeps
if not exist "%~dp0Web\node_modules\" goto missingdeps
if not exist "%~dp0Backend\.env" (
  echo Backend\.env is missing. Copy Backend\.env.example to Backend\.env, then run this file again.
  goto finish
)
if not exist "%~dp0LocalServer\.env" (
  echo LocalServer\.env is missing. Copy LocalServer\.env.example to LocalServer\.env, then run this file again.
  goto finish
)

set "SDK=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_HOME=%SDK%"
set "ANDROID_SDK_ROOT=%SDK%"
if exist "C:\Program Files\Android\openjdk\jdk-21.0.8" set "JAVA_HOME=C:\Program Files\Android\openjdk\jdk-21.0.8"
set "ADB=%SDK%\platform-tools\adb.exe"
set "EMULATOR=%SDK%\emulator\emulator.exe"
set "STUDIO="
if exist "D:\android studio\bin\studio64.exe" set "STUDIO=D:\android studio\bin\studio64.exe"
if not defined STUDIO if exist "%ProgramFiles%\Android\Android Studio\bin\studio64.exe" set "STUDIO=%ProgramFiles%\Android\Android Studio\bin\studio64.exe"
if not defined STUDIO if exist "%LOCALAPPDATA%\Programs\Android Studio\bin\studio64.exe" set "STUDIO=%LOCALAPPDATA%\Programs\Android Studio\bin\studio64.exe"

echo Starting Suva Voice.
echo The database is created by the API from Database\suva_voice.sql when it is not already there.

netstat -ano | findstr "LISTENING" | findstr ":4000 " >nul
if errorlevel 1 (
  echo Starting the API.
  start "Suva Voice API" /D "%~dp0Backend" cmd /k "set SCHEDULER_ENABLED=false&& node src/index.js"
) else (
  echo The API is already running.
)

netstat -ano | findstr "LISTENING" | findstr ":4100 " >nul
if errorlevel 1 (
  echo Starting the call server.
  start "Suva Voice calls" /D "%~dp0LocalServer" cmd /k "node src/index.js"
) else (
  echo The call server is already running.
)

netstat -ano | findstr "LISTENING" | findstr ":5173 " >nul
if errorlevel 1 (
  echo Starting the admin website.
  start "Suva Voice website" /D "%~dp0Web" cmd /k "npm run dev"
) else (
  echo The admin website is already running.
)

if exist "%EMULATOR%" (
  "%ADB%" devices | findstr /R "emulator-.*device" >nul
  if errorlevel 1 (
    echo Starting the Android phone.
    start "Suva Voice phone" "%EMULATOR%" -avd Pixel_8
  ) else (
    echo The Android phone is already running.
  )
) else (
  echo The Android emulator was not found. Open the phone from Android Studio.
)

if defined STUDIO (
  echo Opening Android Studio.
  for %%I in ("%STUDIO%") do start "Android Studio" /D "%%~dpI." %%~nxI "%~dp0App\android"
) else (
  echo Android Studio was not found. Open the folder App\android in Android Studio yourself.
)

call :waitlisten 4000 "API"
call :waitlisten 4100 "call server"
call :waitlisten 5173 "admin website"

echo Opening the admin website.
start "" "http://127.0.0.1:5173/"

if exist "%ADB%" (
  "%ADB%" devices | findstr /R "emulator-.*device" >nul
  if not errorlevel 1 (
    call :openapp
  ) else if exist "%EMULATOR%" (
    call :openapp
  )
)

echo.
echo Admin website:  http://127.0.0.1:5173/
echo API:            http://127.0.0.1:4000/
echo Call server:    http://127.0.0.1:4100/
echo Android Studio is opening App\android. The customer app opens on the phone when the phone is ready.
echo This launcher does not send overdue check-in calls, so the saved people stay as they are.
goto finish

:missingdeps
echo Dependencies are not installed.
echo From this folder, run npm install inside Backend, LocalServer, Web, and App. Do not run npm run setup.
goto finish

:waitlisten
set "PORT=%~1"
set "LABEL=%~2"
set /a TRIES=0
:waitloop
netstat -ano | findstr "LISTENING" | findstr ":%PORT% " >nul
if not errorlevel 1 exit /b 0
set /a TRIES+=1
if %TRIES% GEQ 45 (
  echo The %LABEL% did not start. Read the "%LABEL%" window for the error.
  exit /b 1
)
ping -n 2 127.0.0.1 >nul
goto waitloop

:openapp
echo Waiting for the Android phone.
set /a BOOTS=0
:bootloop
set "PHONE="
"%ADB%" devices > "%TEMP%\suva-phone.txt"
for /f "tokens=1" %%D in ('findstr "emulator-" "%TEMP%\suva-phone.txt"') do set "PHONE=%%D"
if not defined PHONE goto bootwait
"%ADB%" -s %PHONE% shell getprop sys.boot_completed > "%TEMP%\suva-boot.txt" 2>nul
findstr "1" "%TEMP%\suva-boot.txt" >nul
if not errorlevel 1 goto booted
:bootwait
set /a BOOTS+=1
if %BOOTS% GEQ 90 (
  echo The phone is still starting. When it is on, press Run in Android Studio.
  exit /b 1
)
ping -n 3 127.0.0.1 >nul
goto bootloop
:booted
"%ADB%" -s %PHONE% shell pm path lk.suvavoice.customer 2>nul | findstr "package:" >nul
if errorlevel 1 (
  if exist "%~dp0App\android\app\build\outputs\apk\debug\app-debug.apk" (
    echo Installing the customer app on the phone.
    "%ADB%" -s %PHONE% install -r "%~dp0App\android\app\build\outputs\apk\debug\app-debug.apk"
  ) else (
    echo The customer app is not on the phone yet. Press Run in Android Studio.
    exit /b 1
  )
)
echo Opening the customer app.
"%ADB%" -s %PHONE% shell am start -n lk.suvavoice.customer/.MainActivity >nul
exit /b 0

:finish
echo.
if /I not "%~1"=="nopause" pause
endlocal
