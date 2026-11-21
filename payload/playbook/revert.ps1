#Requires -Version 5.1
<#
.SYNOPSIS
  Undoes everything V1 changed, using the records saved before each change.
  Removed apps are not reinstalled (Windows has no offline copy); the Microsoft Store has them.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'V1.psm1') -Force

Initialize-V1 -Name 'undo'
if (-not (Test-V1Admin)) { Send-V1Log 'Undo must run as administrator' -Warning; exit 2 }

$machine = Get-V1Backup 'machine'
$user = Get-V1Backup 'user'
$restored = 0; $services = 0; $tasks = 0

$steps = New-Object System.Collections.Generic.List[object]
function Add-Step { param([string]$Stage, [scriptblock]$Do, $Arg = $null) $steps.Add([pscustomobject]@{ Stage = $Stage; Do = $Do; Arg = $Arg }) }

foreach ($k in @($machine.Keys)) {
    $e = $machine[$k]
    switch ([string]$e.kind) {
        'reg' {
            if ([string]$e.path -like 'HKLM:\SYSTEM\CurrentControlSet\Services\*') { Add-Step 'Services' { param($x) Restore-V1RegEntry $x; $script:services++ } $e }
            else { Add-Step 'Registry' { param($x) Restore-V1RegEntry $x; $script:restored++ } $e }
        }
        'task' {
            Add-Step 'Scheduled tasks' {
                param($x)
                $t = Get-ScheduledTask -TaskPath $x.path -TaskName $x.name -ErrorAction SilentlyContinue
                if ($t) { $null = Enable-ScheduledTask -TaskPath $x.path -TaskName $x.name; $script:tasks++ }
            } $e
        }
        'power' {
            Add-Step 'Power & features' {
                param($x)
                $null = & powercfg.exe /setactive ([string]$x.guid)
                if ($LASTEXITCODE -eq 0) { Send-V1Log 'Previous power plan restored' } else { Send-V1Log 'Previous power plan no longer exists' -Warning }
                foreach ($line in (& powercfg.exe /list)) {
                    if ($line -match 'V1 Ultimate' -and $line -match '([0-9a-fA-F]{8}-[0-9a-fA-F-]{27})') { $null = & powercfg.exe /delete $Matches[1] }
                }
            } $e
        }
        'feature' {
            Add-Step 'Power & features' {
                param($x)
                $null = Enable-WindowsOptionalFeature -Online -FeatureName ([string]$x.name) -NoRestart -ErrorAction Stop
                Send-V1Log ('{0} turned back on' -f $x.name)
            } $e
        }
        default { }
    }
}
foreach ($k in @($user.Keys)) {
    $e = $user[$k]
    # The per-user record is writable by the user, so only per-user registry values are taken from it.
    if ([string]$e.kind -eq 'reg' -and [string]$e.path -like 'HKCU:\*') {
        Add-Step 'Registry' { param($x) Restore-V1RegEntry $x; $script:restored++ } $e
    }
}
Add-Step 'Registry' { Send-V1Log ('Restored {0} settings' -f $script:restored) }
Add-Step 'Services' { Send-V1Log ('Restored {0} services' -f $script:services) }
Add-Step 'Scheduled tasks' { Send-V1Log ('Re-enabled {0} scheduled tasks' -f $script:tasks) }

Add-Step 'Finishing' {
    # Stop the live wallpaper and keep it from starting again.
    Get-CimInstance -ClassName Win32_Process -Filter "Name = 'V1App.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*--wallpaper*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    $run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    if (Get-ItemProperty -LiteralPath $run -Name 'V1 Live Wallpaper' -ErrorAction SilentlyContinue) { Remove-ItemProperty -LiteralPath $run -Name 'V1 Live Wallpaper' }
    $wcfg = @{ enabled = $false; style = 'chrome'; fps = 30; pauseOnBattery = $true }
    [IO.File]::WriteAllText((Join-Path (Get-V1UserDir) 'wallpaper.json'), (ConvertTo-Json $wcfg), (New-Object Text.UTF8Encoding($false)))
    Send-V1Log 'Live wallpaper off'
}
Add-Step 'Finishing' {
    $pic = (Get-V1RegValue -Path 'HKCU:\Control Panel\Desktop' -Name 'WallPaper')
    $path = if ($pic.existed) { [string]$pic.data } else { '' }
    Initialize-V1Native
    $null = [V1.Native]::SystemParametersInfo(0x14, 0, $path, 3)
    Send-V1SettingChange
    Send-V1Log 'Previous wallpaper and colours restored'
}
Add-Step 'Finishing' {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    foreach ($f in @((Join-Path (Get-V1MachineDir) 'backup.json'), (Join-Path (Get-V1UserDir) 'backup.json'), (Join-Path (Get-V1MachineDir) 'state.json'), (Join-Path (Get-V1UserDir) 'look.json'))) {
        if (Test-Path -LiteralPath $f) { Move-Item -LiteralPath $f -Destination ($f -replace '\.json$', ('-undone-{0}.json' -f $stamp)) -Force }
    }
    Send-V1Log 'Records archived. Running V1 Setup again starts fresh'
}

$stageNames = @($steps | ForEach-Object { $_.Stage } | Select-Object -Unique)
Send-V1 @{ t = 'stages'; names = $stageNames }
$lastStage = -1
for ($i = 0; $i -lt $steps.Count; $i++) {
    $s = $steps[$i]
    $si = [array]::IndexOf($stageNames, $s.Stage)
    if ($si -ne $lastStage) { Send-V1 @{ t = 'stage'; i = $si }; $lastStage = $si }
    try { $null = & $s.Do $s.Arg }
    catch { Send-V1Log $_.Exception.Message -Warning; Write-V1Log ('       at ' + $_.InvocationInfo.PositionMessage) }
    Send-V1 @{ t = 'pct'; v = [int][Math]::Floor(($i + 1) * 100 / $steps.Count) }
}
$c = Get-V1Counts
Write-V1Log ('Undo done: {0} settings, {1} services, {2} tasks, {3} skipped' -f $restored, $services, $tasks, $c.warnings)
Send-V1 @{ t = 'summary'; restored = $restored; services = $services; tasks = $tasks; warnings = $c.warnings; reboot = $true }
exit 0
