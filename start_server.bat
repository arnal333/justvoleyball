@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js no esta instalado.
  echo Instala Node.js y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)
if not exist node_modules\ws (
  echo Instalando dependencias de Alpha...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install fallo.
    pause
    exit /b 1
  )
)
npm start
pause
