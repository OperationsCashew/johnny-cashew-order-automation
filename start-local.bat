@echo off
title Johnny Cashew — Lokale Test Omgeving
echo.
echo  ==========================================
echo   Johnny Cashew Order Automation
echo   Lokale Test Server starten...
echo  ==========================================
echo.

cd /d "%~dp0"
node server-local.cjs

pause
