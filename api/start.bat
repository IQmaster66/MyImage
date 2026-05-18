@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PY="
if exist ".venv\Scripts\python.exe" (
    set "PY=.venv\Scripts\python.exe"
) else (
    set "PY=python"
)

"%PY%" -c "import uvicorn" 2>nul
if errorlevel 1 (
    echo [错误] 当前 Python 未安装 uvicorn（或未使用虚拟环境）。
    echo.
    echo 请在本目录双击运行 setup.bat，创建 .venv 并安装依赖后再启动。
    echo 若已有 .venv，可手动执行: .venv\Scripts\pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

echo Starting FastAPI: http://127.0.0.1:8787
"%PY%" -m uvicorn main:app --host 127.0.0.1 --port 8787 --reload

pause
