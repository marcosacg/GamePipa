@echo off
title Rabiola - servidor
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode de novo.
  echo.
  pause
  exit /b
)
start "" http://localhost:8080
node server\server.js
pause
