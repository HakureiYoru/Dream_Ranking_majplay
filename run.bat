@echo off
chcp 936 >nul
title Majplay Challenge 打榜服务

set "ROOT=%~dp0"
set "WEB=%ROOT%web"
set "PORT=8080"

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

cd /d "%WEB%"
if errorlevel 1 (
    echo [错误] 找不到 web 目录: %WEB%
    pause
    exit /b 1
)

set "PY=python"
where python >nul 2>&1
if errorlevel 1 set "PY=py -3"
%PY% --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3
    pause
    exit /b 1
)

echo.
echo  Majplay Challenge 本地服务
echo  ---------------------------
echo  地址: http://localhost:%PORT%
echo  关闭此窗口即可停止服务
echo  重复启动会自动结束旧服务
echo.

start "" "http://localhost:%PORT%"
%PY% -m http.server %PORT%

pause