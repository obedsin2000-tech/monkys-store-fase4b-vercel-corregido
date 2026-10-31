@echo off
title Monky's Store ERP - Fase 4A
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-db.ps1"
