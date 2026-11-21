#Requires -Version 5.1
<#
.SYNOPSIS
  Creates the "V1-before" restore point. Prints one "##V1 {json}" result line for V1 Setup.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'V1.psm1') -Force
Initialize-V1 -Name 'restore-point'

try {
    if (-not (Test-V1Admin)) { throw 'needs administrator' }
    Enable-ComputerRestore -Drive ($env:SystemDrive + '\')
    # Windows allows one restore point per 24 hours by default; without this a recent one blocks ours.
    Set-V1Reg -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore' -Name 'SystemRestorePointCreationFrequency' -Type DWord -Value 0
    Checkpoint-Computer -Description 'V1-before' -RestorePointType 'MODIFY_SETTINGS'
    $rp = @(Get-ComputerRestorePoint | Where-Object { $_.Description -eq 'V1-before' })
    if ($rp.Count -eq 0) { throw 'Windows did not save the restore point' }
    Write-V1Log 'Restore point V1-before created'
    Send-V1 @{ t = 'check'; status = 'ok'; detail = 'V1-before' }
} catch {
    Write-V1Log ('Restore point failed: ' + $_.Exception.Message)
    Send-V1 @{ t = 'check'; status = 'warn'; detail = 'not available'
        hint = 'System Restore is unavailable on this PC. V1 still records every change, so Undo in V1 Settings works.' }
}
exit 0
