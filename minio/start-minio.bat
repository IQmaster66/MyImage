@echo off
setlocal

REM Always run from this script directory
cd /d "%~dp0"

title MinIO Startup

REM Ensure data directory exists
if not exist "minio-data" (
    mkdir "minio-data"
)

REM Set MinIO root credentials (change for production)
set "MINIO_ROOT_USER=minioadmin"
set "MINIO_ROOT_PASSWORD=minioadmin"

REM MinIO requirement:
REM MINIO_ROOT_USER >= 3 chars, MINIO_ROOT_PASSWORD >= 8 chars

REM Validate executable exists
if not exist "%~dp0minio.exe" (
    echo [ERROR] minio.exe not found in:
    echo         %~dp0
    echo.
    echo Please place minio.exe in this folder, then run again.
    pause
    exit /b 1
)

echo Starting MinIO...
echo API: http://127.0.0.1:9000
echo Console: http://127.0.0.1:9001
echo.

REM Start MinIO server in current window
"%~dp0minio.exe" server "%~dp0minio-data"

if errorlevel 1 (
    echo.
    echo [ERROR] MinIO exited with error code %errorlevel%.
    pause
    exit /b %errorlevel%
)

endlocal
