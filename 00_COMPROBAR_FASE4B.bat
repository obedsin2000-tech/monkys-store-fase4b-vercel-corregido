@echo off
chcp 65001 >nul
title Monky's Store - Revisar equipo Fase 4B
cd /d "%~dp0"
echo ================================================
echo COMPROBACION PREVIA FASE 4B
 echo ================================================
where node >nul 2>&1
if errorlevel 1 (echo ERROR: Falta Node.js) else (node --version)
where npm.cmd >nul 2>&1
if errorlevel 1 (echo ERROR: Falta npm.cmd) else (npm.cmd --version)
if exist ".env.local" (echo OK: .env.local existe. NO lo compartas.) else (echo PENDIENTE: copiar .env.local desde Fase 4A.)
if exist "supabase\migrations\005_fase4b.sql" (echo OK: migracion 005 disponible.) else (echo ERROR: Falta migracion SQL.)
if exist "04_CREAR_RESPALDO.bat" (echo OK: herramienta de respaldo disponible.)
echo.
echo Esta comprobacion NO verifica la base Supabase, su copia de seguridad ni las credenciales.
pause
