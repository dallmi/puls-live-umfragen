@echo off
rem ============================================================
rem  PULS - Live-Umfragen starten (Windows)
rem  Doppelklicken genuegt. Optional: start.bat 8080  (anderer Port)
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"

set PORT=3000
if not "%~1"=="" set PORT=%~1

rem Portables Node bevorzugen (Ordner "node" neben dieser Datei),
rem sonst systemweit installiertes Node verwenden.
set NODE=node
if exist "%~dp0node\node.exe" set NODE=%~dp0node\node.exe

"%NODE%" --version >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js wurde nicht gefunden.
  echo.
  echo Zwei Moeglichkeiten:
  echo   1. Node.js aus dem Software Center / von nodejs.org installieren
  echo   2. Ohne Admin-Rechte: das "Windows Binary (.zip)" von nodejs.org
  echo      herunterladen und entpackt als Ordner "node" neben diese Datei legen
  echo      (so dass "node\node.exe" existiert^)
  echo.
  pause
  exit /b 1
)

echo PULS startet auf Port %PORT% ...
start "" http://localhost:%PORT%
"%NODE%" server.js
pause
