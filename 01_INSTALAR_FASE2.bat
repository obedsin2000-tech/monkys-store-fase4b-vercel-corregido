@echo off
cd /d "%~dp0"
echo =============================================
echo   MONKY'S STORE ERP - INSTALACION FASE 2
echo =============================================
if not exist ".env.local" (
 echo.
 echo ERROR: falta .env.local
 echo Copia .env.local de tu carpeta Fase 1 a esta carpeta.
 pause
 exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
 echo Node.js no esta instalado. Visita https://nodejs.org/
 pause
 exit /b 1
)
call npm.cmd install --no-audit --no-fund
if errorlevel 1 (
 echo ERROR de instalacion. Envia una captura del mensaje.
 pause
 exit /b 1
)
echo.
echo Instalacion terminada. Ahora ejecuta 02_INICIAR_MONKYS.bat
pause
