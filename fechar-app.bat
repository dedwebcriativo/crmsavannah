@echo off
chcp 65001 >nul
title CRM Savannah - Fechando processos

echo =============================================
echo   Fechando processos do CRM Savannah
echo =============================================
echo.
echo Procurando processos electron.exe / node.exe
echo relacionados ao CRM Savannah (versao instalada
echo ou em desenvolvimento)...
echo.

powershell -NoProfile -Command ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'electron.exe' -or $_.Name -eq 'node.exe') -and $_.CommandLine -and ($_.CommandLine -match 'crmsavannah' -or $_.CommandLine -match 'CRM Savannah' -or $_.CommandLine -match 'backend\\src\\index\.js' -or $_.CommandLine -match 'frontend\\server\.js') }; " ^
  "if (-not $procs) { Write-Host 'Nenhum processo encontrado.' } else { $procs | ForEach-Object { Write-Host ('Finalizando PID ' + $_.ProcessId + ' (' + $_.Name + ')'); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }"

echo.
echo =============================================
echo   Concluido. Pode rodar o instalador ou o
echo   iniciar.bat novamente.
echo =============================================
echo.
pause
