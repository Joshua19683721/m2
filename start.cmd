@echo off
REM 啟動本機伺服器並開啟瀏覽器
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo 找不到 python，請先安裝 Python 3。
  pause
  exit /b 1
)
echo 正在啟動本機伺服器 http://127.0.0.1:8770 ...
start "" http://127.0.0.1:8770/index.html
python -m http.server 8770 --bind 127.0.0.1
