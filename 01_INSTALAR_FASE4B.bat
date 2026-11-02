@echo off
chcp 65001 >nul
title Monky's Store ERP - Instalar Fase 4B
cd /d "%~dp0"
echo ================================================
echo MONKY'S STORE - INSTALAR FASE 4B
 echo ================================================
where node >nul 2>&1
if errorlevel 1 (echo ERROR: Node.js no esta instalado o no esta disponible. & pause & exit /b 1)
if not exist ".env.local" (echo AVISO: Falta .env.local. Copialo desde Fase 4A ANTES de iniciar la web.)
if exist package-lock.json (call npm.cmd ci) else (call npm.cmd install)
if errorlevel 1 (echo ERROR: fallo npm install. Toma una captura del error. & pause & exit /b 1)
echo.
echo Dependencias instaladas.
echo SIGUIENTE: Ejecuta 02_INICIAR_MONKYS.bat
pause
