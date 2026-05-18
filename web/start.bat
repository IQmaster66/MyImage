@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "node_modules\" (
    echo Installing npm dependencies...
    call npm install
    if errorlevel 1 pause & exit /b 1
)

echo Starting Next.js dev server (default http://localhost:3000)
call npm run dev

pause
