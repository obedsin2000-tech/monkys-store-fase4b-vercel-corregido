@echo off
chcp 65001 >nul
title Monky's Store - Revision local Fase 4B
cd /d "%~dp0"
echo Comprobando estructuras y calculo de digitos de control del codigo de barras...
call npm.cmd run check:fase4b
if errorlevel 1 (echo ERROR: copia el texto mostrado. & pause & exit /b 1)
echo Esta prueba no reemplaza la lectura de etiquetas reales ni pruebas con Supabase.
pause
