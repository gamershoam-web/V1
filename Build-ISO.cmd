@echo off
rem Builds a V1 ISO from the official Windows 11 ISO. Double-click this file.
fltmc >nul 2>&1 || (
  powershell.exe -NoProfile -Command "Start-Process -FilePath \"%~f0\" -Verb RunAs"
  exit /b
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build\build-iso.ps1"
echo.
pause
