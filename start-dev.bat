@echo off
chcp 65001 >nul
set "ROOT=%~dp0"

echo Opening API and Web in separate windows...
start "MyImage API" cmd /k cd /d "%ROOT%api" ^&^& call start.bat
timeout /t 2 /nobreak >nul
start "MyImage Web" cmd /k cd /d "%ROOT%web" ^&^& call start.bat

exit /b 0
