@echo off
chcp 65001 >nul
title Majplay Arena local server

set "ROOT=%~dp0"
set "WEB=%ROOT%web"
set "PORT=8081"

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

cd /d "%WEB%"
if errorlevel 1 (
    echo [ERROR] Cannot find web directory: %WEB%
    pause
    exit /b 1
)

set "PY=python"
where python >nul 2>&1
if errorlevel 1 set "PY=py -3"
%PY% --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python 3 was not found.
    pause
    exit /b 1
)

echo.
echo  Majplay Arena local server
echo  --------------------------
echo  URL: http://localhost:%PORT%/arena.html
echo  Close this window to stop the server.
echo  Re-running this script restarts the port.
echo.

start "" "http://localhost:%PORT%/arena.html"
%PY% -m http.server %PORT%

pause
