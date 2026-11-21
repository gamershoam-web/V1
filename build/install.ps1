#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Installs V1 into C:\V1 on the Windows 11 PC you are using, then opens V1 Setup.
  Nothing changes until you press Apply in V1 Setup, and V1 Settings can undo all of it.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Payload = Join-Path $RepoRoot 'payload'
$Dist = Join-Path $RepoRoot 'dist'
$Dest = Join-Path $env:SystemDrive 'V1'

function Stop-Install([string]$Message) { Write-Host $Message -ForegroundColor Red; exit 1 }

$build = [int](Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuildNumber
if ($build -lt 22000) { Stop-Install 'V1 is made for Windows 11.' }
if (-not (Test-Path -LiteralPath (Join-Path $Dist 'V1App.exe'))) { Stop-Install 'dist\V1App.exe is missing. Download the full V1 folder again.' }
if (-not (Test-Path -LiteralPath (Join-Path $Payload 'playbook\apply.ps1'))) { Stop-Install 'payload is missing. Download the full V1 folder again.' }
if ((Test-Path -LiteralPath $Dest) -and @(Get-ChildItem -LiteralPath $Dest -Force).Count -gt 0 -and -not (Test-Path -LiteralPath (Join-Path $Dest 'V1App.exe'))) {
    Stop-Install ('{0} exists and is not a V1 folder. Move it, then run this again.' -f $Dest)
}

# An update: stop the running live wallpaper so its files can be replaced.
Get-CimInstance -ClassName Win32_Process -Filter "Name = 'V1App.exe'" -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500

Write-Host 'Copying V1 to' $Dest
foreach ($src in $Payload, $Dist) {
    $ErrorActionPreference = 'Continue'
    $null = & robocopy.exe $src $Dest /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -ge 8) { Stop-Install ('Copying failed (robocopy code {0}).' -f $code) }
}
Get-ChildItem -LiteralPath $Dest -Recurse -File | Unblock-File

# Only administrators may change V1's files, because V1 Setup runs them with administrator rights.
$ErrorActionPreference = 'Continue'
$null = & icacls.exe $Dest /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' 2>&1
$null = & icacls.exe (Join-Path $Dest '*') /reset /T /C 2>&1
$ErrorActionPreference = 'Stop'

$menu = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $menu 'V1 Settings.lnk'))
$lnk.TargetPath = Join-Path $Dest 'V1App.exe'
$lnk.Arguments = '--settings'
$lnk.WorkingDirectory = $Dest
$lnk.IconLocation = (Join-Path $Dest 'V1App.exe') + ',0'
$lnk.Description = 'Live wallpaper, appearance and undo for V1'
$lnk.Save()

Write-Host 'Opening V1 Setup...' -ForegroundColor Cyan
Start-Process -FilePath (Join-Path $Dest 'V1App.exe') -ArgumentList '--setup', '--force'
exit 0
