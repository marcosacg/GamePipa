@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Rabiola - enviar para o GitHub
set REPO=https://github.com/marcosacg/GamePipa.git

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O Git nao esta instalado. Baixe em https://git-scm.com/download/win
  echo  instale com as opcoes padrao e rode este arquivo de novo.
  pause & exit /b 1
)

if not exist ".git" (
  git init -b main || (git init && git checkout -b main)
)
git config user.name >nul 2>nul || git config user.name "marcosacg"
git config user.email >nul 2>nul || (
  set /p EMAIL=Digite o e-mail da sua conta do GitHub: 
  call git config user.email "%%EMAIL%%"
)

git remote get-url origin >nul 2>nul && git remote set-url origin %REPO% || git remote add origin %REPO%

git add -A
git commit -m "Rabiola: jogo de pipa 3D (Three.js + Ammo.js)" || echo (nada novo para salvar)

echo.
echo  Enviando para %REPO% ...
echo  (na primeira vez abre uma janela para entrar na sua conta do GitHub)
git push -u origin main
if errorlevel 1 (
  echo.
  echo  O repositorio ja tinha arquivos no GitHub. Juntando com os daqui...
  git pull origin main --allow-unrelated-histories --no-edit -X ours
  git push -u origin main
)
if errorlevel 1 (
  echo.
  echo  Nao deu certo. Copie a mensagem acima e me mande.
) else (
  echo.
  echo  Pronto! Veja em https://github.com/marcosacg/GamePipa
)
pause
