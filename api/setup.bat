@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Creating venv in .venv ...
python -m venv .venv
if errorlevel 1 (
    echo [错误] 无法创建虚拟环境，请确认已安装 Python 并已加入 PATH。
    pause
    exit /b 1
)

echo Installing dependencies (this may take a few minutes) ...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\pip.exe" install -r requirements.txt
if errorlevel 1 (
    echo [错误] pip install 失败。
    pause
    exit /b 1
)

echo.
echo 完成。请运行 start.bat 启动服务。
pause
