@echo off
rem Installs V1 on this PC and opens V1 Setup. No reinstall needed. Double-click this file.
fltmc >nul 2>&1 || (
  powershell.exe -NoProfile -Command "Start-Process -FilePath \"%~f0\" -Verb RunAs"
  exit /b
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build\install.ps1"
if errorlevel 1 pause
