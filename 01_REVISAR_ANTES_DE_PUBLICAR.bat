@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ======================================================
echo MONKY'S STORE - COMPROBACION PARA VERCEL
 echo ======================================================
where node >nul 2>&1
if errorlevel 1 (echo ERROR: Instala Node.js desde nodejs.org & pause & exit /b 1)
node scripts\check-deployment.mjs
if errorlevel 1 (echo ERROR: Hay archivos faltantes o privados. & pause & exit /b 1)
if exist package-lock.json (call npm.cmd ci --no-audit) else (call npm.cmd install --no-audit)
if errorlevel 1 (echo ERROR: No se pudieron instalar las dependencias. & pause & exit /b 1)
call npm.cmd run build
if errorlevel 1 (echo ERROR: La compilacion de produccion fallo. NO publiques aun. & pause & exit /b 1)
echo.
echo COMPILACION TERMINADA: revisa las advertencias antes de publicar.
echo Si npm genero package-lock.json, conserva ese archivo en GitHub.
pause
