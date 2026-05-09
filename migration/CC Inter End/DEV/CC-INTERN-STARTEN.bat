@echo off
title CC INTERN — Server starten
color 0A
echo.
echo  ==========================================
echo   CC INTERN — Server wird gestartet...
echo  ==========================================
echo.
cd /d "%~dp0"
node server.js
echo.
echo  Server gestoppt.
pause
