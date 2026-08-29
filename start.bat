@echo off
setlocal
cd /d "%~dp0"

rem Se o .exe ja foi gerado, abre ele direto
if exist "dist\win-unpacked\MultiAccountIdle.exe" (
  start "" "dist\win-unpacked\MultiAccountIdle.exe"
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Instalando dependencias, aguarde...
  call npm install --no-audit --no-fund
)

call npm start
if errorlevel 1 (
  echo.
  echo O app terminou com erro. Veja as mensagens acima.
  pause
)
