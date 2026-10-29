@echo off
rem Opens a folder in Kite: "kite ." or "kite C:\path\to\project"
setlocal
set "target=%~1"
if "%target%"=="" set "target=."
for %%I in ("%target%") do set "dir=%%~fI"
if not exist "%dir%\" (
  echo kite: folder not found: %target% 1>&2
  exit /b 1
)
start "" "%LOCALAPPDATA%\Kite\Kite.exe" "%dir%"
