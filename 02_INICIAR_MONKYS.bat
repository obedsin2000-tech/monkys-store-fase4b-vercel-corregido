@echo off
title Monky's Store ERP - Fase 4B
cd /d "%~dp0"
if not exist ".env.local" (echo FALTA .env.local: copialo de Fase 4A & pause & exit /b 1)
call npm.cmd run dev
pause
