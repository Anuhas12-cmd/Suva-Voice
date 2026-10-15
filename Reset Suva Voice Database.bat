@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Reset Suva Voice database

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js, then run this file again.
  goto finish
)
if not exist "%~dp0Backend\node_modules\" (
  echo Dependencies are not installed. From the Backend folder, run npm install.
  goto finish
)
if not exist "%~dp0Backend\.env" (
  echo Backend\.env is missing. Copy Backend\.env.example to Backend\.env, then run this file again.
  goto finish
)

echo.
echo This removes accounts, loved ones, calls, orders, and alerts that were added later.
echo It puts back the original demo records:
echo   Dulshan, admin@suvavoice.lk, Admin@12345
echo   Ruwan Silva, staff@suvavoice.lk, Staff@12345
echo   Nimal Fernando, nimal.fernando@suvavoice.lk, Customer@12345
echo   Dilani Fernando, dilani.fernando@suvavoice.lk, Customer@12345
echo   Loved ones: Sunil Jayasekara, Kamala Silva, Robert Perera
echo.
set /p CONFIRM=Type YES to reset the database: 
if /I not "%CONFIRM%"=="YES" (
  echo Reset cancelled. The saved records were not changed.
  goto finish
)

set "STOPPED=0"
set /a KILLS=0
:killapi
netstat -ano | findstr "LISTENING" | findstr ":4000 " >nul
if errorlevel 1 goto apistopped
set /a KILLS+=1
if %KILLS% GEQ 10 (
  echo The API is still using the database. Close the Suva Voice API window, then run this file again.
  goto finish
)
echo Stopping the API so the database can be replaced.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":4000 "') do taskkill /PID %%P /F >nul 2>&1
set "STOPPED=1"
ping -n 3 127.0.0.1 >nul
goto killapi

:apistopped
echo Replacing the database with the original demo records.
pushd "%~dp0Backend"
node scripts/setup.js
set "RESETCODE=%ERRORLEVEL%"
popd
if not "%RESETCODE%"=="0" (
  echo The database was not reset.
  goto restart
)

echo.
echo The database now has only the original demo accounts.
echo Sign in again. Accounts that were created later no longer exist.

:restart
if "%STOPPED%"=="1" (
  echo Starting the API again.
  start "Suva Voice API" /D "%~dp0Backend" cmd /k "set SCHEDULER_ENABLED=false&& node src/index.js"
)

:finish
echo.
pause
endlocal
