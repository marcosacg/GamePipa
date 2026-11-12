@echo off
title Rabiola - gerar versao portal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode de novo.
  pause
  exit /b
)
echo.
echo  ==== RABIOLA - versao para portais ====
echo.
echo  Para qual lugar e esta versao?
echo    1) CrazyGames   (anuncios pelo SDK do CrazyGames)
echo    2) Poki         (anuncios pelo SDK do Poki)
echo    3) Meu site     (Google AdSense H5 - precisa do codigo ca-pub)
echo    4) itch.io / sem anuncios
echo    5) Teste        (anuncios simulados, para ver o fluxo)
echo.
set /p OP= Escolha (1-5):
set ADS=nenhum
if "%OP%"=="1" set ADS=crazygames
if "%OP%"=="2" set ADS=poki
if "%OP%"=="3" set ADS=adsense
if "%OP%"=="5" set ADS=teste
set ADSENSE=
if "%ADS%"=="adsense" set /p ADSENSE= Seu codigo do AdSense (ca-pub-...):
echo.
echo  Endereco do servidor online hospedado (ex.: wss://rabiola.onrender.com/ws)
set /p SRV= Deixe vazio para gerar sem modo online:
echo.
node server\build-portal.js --ads=%ADS% --server=%SRV% --adsense=%ADSENSE%
echo.
echo  O arquivo para enviar ao portal esta em: dist\rabiola-portal.zip
if exist dist start "" dist
pause
