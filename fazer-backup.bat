@echo off
chcp 65001 >nul
title CRM Savannah - Backup do banco de dados

set "DB=%APPDATA%\CRM Savannah\dev.db"
set "PASTA_BACKUP=%~dp0backups-banco"

echo =============================================
echo   CRM Savannah - Backup do banco de dados
echo =============================================
echo.

if not exist "%DB%" (
    echo [ERRO] Banco de dados nao encontrado em:
    echo   %DB%
    echo.
    echo Abra o app instalado pelo menos uma vez antes.
    echo.
    pause
    exit /b 1
)

if not exist "%PASTA_BACKUP%" mkdir "%PASTA_BACKUP%"

REM Monta um nome de arquivo com data e hora, ex: dev-2026-07-24_15-30-00.db
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set "DT=%%I"
set "TIMESTAMP=%DT:~0,4%-%DT:~4,2%-%DT:~6,2%_%DT:~8,2%-%DT:~10,2%-%DT:~12,2%"
set "DESTINO=%PASTA_BACKUP%\dev-%TIMESTAMP%.db"

copy /y "%DB%" "%DESTINO%" >nul
if errorlevel 1 (
    echo [ERRO] Falha ao copiar o banco de dados.
    pause
    exit /b 1
)

echo Backup salvo em:
echo   %DESTINO%
echo.
echo Para restaurar esse backup se precisar algum dia:
echo   1. Feche o app ^(fechar-app.bat^)
echo   2. Copie esse arquivo por cima de:
echo      %DB%
echo   3. Abra o app normalmente
echo.
pause
