@echo off
cd /d "%~dp0"
title MONKYS STORE - INSTALAR FASE 3
echo =====================================================
echo  MONKYS STORE ERP - INSTALACION DE FASE 3
 echo =====================================================
if not exist ".env.local" (
 echo ERROR: No se encontro el archivo .env.local.
 echo Copialo desde la carpeta Fase 2. Nunca compartas sus claves.
 pause
 exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
 echo ERROR: Node.js no esta instalado. Visita https://nodejs.org/
 pause
 exit /b 1
)
node --version
echo.
echo Instalando dependencias. Necesitas conexion a Internet.
call npm.cmd install --no-audit --no-fund
if errorlevel 1 (
 echo.
 echo ERROR de instalacion. Toma una captura del texto, sin mostrar claves.
 pause
 exit /b 1
)
echo.
echo Instalacion terminada.
echo Abre 02_INICIAR_MONKYS.bat para iniciar el programa.
pause
