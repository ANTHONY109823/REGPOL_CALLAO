@echo off
title REGPOL Callao - Servidor Local
color 0A
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   REGPOL Callao - UNITIC 2026        ║
echo  ║   Iniciando servidor local...        ║
echo  ╚══════════════════════════════════════╝
echo.
cd /d "%~dp0"
start "" "http://localhost:3000/index.html"
node server.js
pause
