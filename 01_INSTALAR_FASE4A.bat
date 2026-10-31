@echo off
title Monky's Store ERP - Fase 4A
cd /d "%~dp0"
call npm.cmd install
if errorlevel 1 (echo ERROR durante instalacion & pause & exit /b 1)
echo Dependencias instaladas. Ejecuta 02_INICIAR_MONKYS.bat
pause
