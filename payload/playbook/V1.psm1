#Requires -Version 5.1
<#
  V1 playbook core. Every change goes through these functions, so every change is:
    - recorded before it is made (first original value only, so re-running never loses the real original)
    - reported to the setup window as one line
    - written to a log file
  Machine-wide records:  %ProgramData%\V1\backup.json   (admin only)
  Per-user records:      %LOCALAPPDATA%\V1\backup.json  (HKCU values only; revert ignores anything else in it)
#>

Set-StrictMode -Version 2.0

$script:MachineDir = Join-Path $env:ProgramData 'V1'
$script:UserDir = Join-Path $env:LOCALAPPDATA 'V1'
try {
    $script:IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch {
    $script:IsAdmin = $false
}
# Test hook used by tests\Playbook.Tests.ps1 (which fakes the registry). It grants nothing: real writes still need real rights.
if ($env:V1_TEST_ADMIN -eq '1') { $script:IsAdmin = $true }
$script:LogFile = $null
$script:Backup = @{ machine = $null; user = $null }
$script:Counts = @{ apps = 0; tweaks = 0; services = 0; tasks = 0; warnings = 0; restored = 0 }
$script:AppxCache = $null
$script:ProvCache = $null

function Get-V1Counts { return $script:Counts }
function Test-V1Admin { return $script:IsAdmin }
function Get-V1MachineDir { return $script:MachineDir }
function Get-V1UserDir { return $script:UserDir }

function Protect-V1Folder {
    # SYSTEM and Administrators: full control. Users: read only. Stops a standard user from
    # planting or editing files that an elevated V1 process later reads.
    param([Parameter(Mandatory)][string]$Path)
    $ErrorActionPreference = 'Continue'
    $null = & icacls.exe $Path /setowner '*S-1-5-32-544' /T /C 2>&1
    $null = & icacls.exe $Path /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' 2>&1
    $null = & icacls.exe (Join-Path $Path '*') /reset /T /C 2>&1
}

function Initialize-V1 {
    param([Parameter(Mandatory)][string]$Name)
    try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { $null = $_ }
    if ($script:IsAdmin) {
        if (-not (Test-Path -LiteralPath $script:MachineDir)) { $null = New-Item -ItemType Directory -Path $script:MachineDir -Force }
        Protect-V1Folder -Path $script:MachineDir
        $logDir = Join-Path $script:MachineDir 'logs'
    } else {
        $logDir = Join-Path $script:UserDir 'logs'
    }
    if (-not (Test-Path -LiteralPath $script:UserDir)) { $null = New-Item -ItemType Directory -Path $script:UserDir -Force }
    if (-not (Test-Path -LiteralPath $logDir)) { $null = New-Item -ItemType Directory -Path $logDir -Force }
    $script:LogFile = Join-Path $logDir ('{0}-{1:yyyyMMdd-HHmmss}.log' -f $Name, (Get-Date))
    Write-V1Log ('V1 {0} started as {1} (admin: {2}) on {3}' -f $Name, [Environment]::UserName, $script:IsAdmin, (Get-V1WindowsLabel))
}

function Get-V1WindowsLabel {
    $cv = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $dv = if ($cv.PSObject.Properties['DisplayVersion']) { $cv.DisplayVersion } else { $cv.ReleaseId }
    return ('{0} {1} build {2}.{3}' -f $cv.EditionID, $dv, $cv.CurrentBuildNumber, $cv.UBR)
}

function Write-V1Log {
    param([string]$Message)
    if ($script:LogFile) {
        try { Add-Content -LiteralPath $script:LogFile -Value ('{0:HH:mm:ss} {1}' -f (Get-Date), $Message) -Encoding UTF8 } catch { $null = $_ }
    }
}

function Send-V1 {
    # One JSON object per line, prefixed so V1App can tell progress from stray output.
    param([Parameter(Mandatory)][hashtable]$Data)
    $line = '##V1 ' + (ConvertTo-Json -InputObject $Data -Compress -Depth 4)
    [Console]::Out.WriteLine($line)
    [Console]::Out.Flush()
}

function Send-V1Log {
    param([string]$Message, [switch]$Warning)
    if ($Warning) { $script:Counts.warnings++ }
    Write-V1Log ((@('OK  ', 'SKIP')[[int][bool]$Warning]) + $Message)
    Send-V1 @{ t = 'log'; ok = (-not $Warning); msg = $Message }
}

# ---------------------------------------------------------------- backup store

function Get-V1BackupPath([string]$Scope) {
    if ($Scope -eq 'user') { return (Join-Path $script:UserDir 'backup.json') }
    return (Join-Path $script:MachineDir 'backup.json')
}

function Get-V1Backup {
    param([ValidateSet('machine', 'user')][string]$Scope)
    if ($null -eq $script:Backup[$Scope]) {
        $table = @{}
        $path = Get-V1BackupPath $Scope
        if (Test-Path -LiteralPath $path) {
            try {
                $obj = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
                foreach ($p in $obj.PSObject.Properties) { $table[$p.Name] = $p.Value }
            } catch {
                Write-V1Log ('Backup file {0} could not be read: {1}' -f $path, $_.Exception.Message)
            }
        }
        $script:Backup[$Scope] = $table
    }
    return $script:Backup[$Scope]
}

function Save-V1Backup {
    param([ValidateSet('machine', 'user')][string]$Scope)
    $table = $script:Backup[$Scope]
    if ($null -eq $table) { return }
    $path = Get-V1BackupPath $Scope
    $tmp = $path + '.tmp'
    $json = ConvertTo-Json -InputObject $table -Depth 5
    if ($table.Count -eq 0) { $json = '{}' }
    [IO.File]::WriteAllText($tmp, $json, (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $tmp -Destination $path -Force
}

function Get-V1Scope([string]$Path) {
    if ($Path -like 'HKCU:*') { return 'user' }
    return 'machine'
}

# ---------------------------------------------------------------- registry

function Get-V1RegValue {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Name)
    if (-not (Test-Path -LiteralPath $Path)) { return @{ existed = $false } }
    $key = Get-Item -LiteralPath $Path
    if (@($key.GetValueNames()) -notcontains $Name) { return @{ existed = $false } }
    $kind = $key.GetValueKind($Name).ToString()
    $data = $key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    if ($kind -eq 'Binary') { $data = [Convert]::ToBase64String([byte[]]$data) }
    return @{ existed = $true; type = $kind; data = $data }
}

function Set-V1Reg {
    <# Sets one registry value after recording the original. Type: DWord, QWord, String, ExpandString, Binary, MultiString #>
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][ValidateSet('DWord', 'QWord', 'String', 'ExpandString', 'Binary', 'MultiString')][string]$Type,
        [Parameter(Mandatory)][AllowEmptyString()]$Value,
        [switch]$Quiet
    )
    $scope = Get-V1Scope $Path
    if ($scope -eq 'machine' -and -not $script:IsAdmin) { throw 'This change needs administrator rights.' }
    $id = 'reg|' + $Path + '|' + $Name
    $store = Get-V1Backup $scope
    if (-not $store.ContainsKey($id)) {
        $orig = Get-V1RegValue -Path $Path -Name $Name
        $orig.kind = 'reg'; $orig.path = $Path; $orig.name = $Name
        $store[$id] = $orig
        Save-V1Backup $scope
    }
    if (-not (Test-Path -LiteralPath $Path)) { $null = New-Item -Path $Path -Force }
    $null = New-ItemProperty -LiteralPath $Path -Name $Name -PropertyType $Type -Value $Value -Force
    $script:Counts.tweaks++
    if (-not $Quiet) { Write-V1Log ('SET  {0}\{1} = {2}' -f $Path, $Name, $Value) }
}

function Restore-V1RegEntry {
    param([Parameter(Mandatory)]$Entry)
    $path = [string]$Entry.path; $name = [string]$Entry.name
    if ($Entry.existed) {
        $data = $Entry.data
        switch ([string]$Entry.type) {
            'Binary' { $data = [Convert]::FromBase64String([string]$data) }
            'DWord' { $data = [int]$data }
            'QWord' { $data = [long]$data }
            'MultiString' { $data = [string[]]@($data) }
            default { $data = [string]$data }
        }
        if (-not (Test-Path -LiteralPath $path)) { $null = New-Item -Path $path -Force }
        $null = New-ItemProperty -LiteralPath $path -Name $name -PropertyType ([string]$Entry.type) -Value $data -Force
    } elseif (Test-Path -LiteralPath $path) {
        Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
    }
}

# ---------------------------------------------------------------- services

function Set-V1ServiceStart {
    <# Start: 2 automatic, 3 manual, 4 disabled. Uses the service's registry value so it is recorded like any other change. #>
    param([Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][ValidateSet(2, 3, 4)][int]$Start)
    $key = 'HKLM:\SYSTEM\CurrentControlSet\Services\' + $Name
    if (-not (Test-Path -LiteralPath $key)) { Send-V1Log ('Service {0} is not on this PC' -f $Name); return }
    $now = (Get-V1RegValue -Path $key -Name 'Start')
    if ($now.existed -and [int]$now.data -eq $Start) { Send-V1Log ('Service {0} already set' -f $Name); return }
    Set-V1Reg -Path $key -Name 'Start' -Type DWord -Value $Start -Quiet
    $script:Counts.tweaks--
    $script:Counts.services++
    if ($Start -eq 4) { Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue }
    $word = @{ 2 = 'automatic'; 3 = 'manual'; 4 = 'disabled' }[$Start]
    Send-V1Log ('Service {0} set to {1}' -f $Name, $word)
}

# ---------------------------------------------------------------- scheduled tasks

function Disable-V1Task {
    param([Parameter(Mandatory)][string]$TaskPath, [Parameter(Mandatory)][string]$TaskName)
    $task = Get-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $task) { Write-V1Log ('Task {0}{1} not present' -f $TaskPath, $TaskName); return }
    if ($task.State -eq 'Disabled') { Write-V1Log ('Task {0}{1} already disabled' -f $TaskPath, $TaskName); return }
    $id = 'task|' + $TaskPath + '|' + $TaskName
    $store = Get-V1Backup 'machine'
    try {
        $null = Disable-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName -ErrorAction Stop
        if (-not $store.ContainsKey($id)) {
            $store[$id] = @{ kind = 'task'; path = $TaskPath; name = $TaskName; enabled = $true }
            Save-V1Backup 'machine'
        }
        $script:Counts.tasks++
        Send-V1Log ('Disabled task {0}' -f $TaskName)
    } catch {
        Send-V1Log ('Task {0} is protected by Windows, left as is' -f $TaskName) -Warning
    }
}

# ---------------------------------------------------------------- apps

function Remove-V1App {
    <# Removes an inbox app for every user and stops it coming back for new users. Name is the package name, wildcards allowed. #>
    param([Parameter(Mandatory)][string]$Name)
    if ($null -eq $script:AppxCache) { $script:AppxCache = @(Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue) }
    if ($null -eq $script:ProvCache) { $script:ProvCache = @(Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue) }
    $removed = $false; $failed = $false
    foreach ($p in @($script:AppxCache | Where-Object { $_.Name -like $Name })) {
        if ($p.NonRemovable) { continue }
        try { Remove-AppxPackage -Package $p.PackageFullName -AllUsers -ErrorAction Stop; $removed = $true }
        catch { $failed = $true; Write-V1Log ('Remove-AppxPackage {0}: {1}' -f $p.PackageFullName, $_.Exception.Message) }
    }
    $allUsersParam = (Get-Command Remove-AppxProvisionedPackage).Parameters.ContainsKey('AllUsers')
    foreach ($p in @($script:ProvCache | Where-Object { $_.DisplayName -like $Name })) {
        try {
            if ($allUsersParam) { $null = Remove-AppxProvisionedPackage -Online -PackageName $p.PackageName -AllUsers -ErrorAction Stop }
            else { $null = Remove-AppxProvisionedPackage -Online -PackageName $p.PackageName -ErrorAction Stop }
            $removed = $true
        } catch { $failed = $true; Write-V1Log ('Remove-AppxProvisionedPackage {0}: {1}' -f $p.PackageName, $_.Exception.Message) }
    }
    if ($removed) {
        $script:Counts.apps++
        $store = Get-V1Backup 'machine'
        $store['app|' + $Name] = @{ kind = 'app'; name = $Name }
        Save-V1Backup 'machine'
        Send-V1Log ('Removed {0}' -f $Name)
    } elseif ($failed) {
        Send-V1Log ('Could not remove {0}' -f $Name) -Warning
    } else {
        Write-V1Log ('App {0} not installed' -f $Name)
    }
}

# ---------------------------------------------------------------- power plan

function Set-V1PowerPlan {
    <# Gaming on desktops only: duplicates the built-in Ultimate Performance scheme and activates it. #>
    $ErrorActionPreference = 'Continue'
    $active = (& powercfg.exe /getactivescheme) -join ' '
    if ($active -notmatch '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') {
        Send-V1Log 'Could not read the current power plan' -Warning; return
    }
    $current = $Matches[1]
    $store = Get-V1Backup 'machine'
    if (-not $store.ContainsKey('power|active')) {
        $store['power|active'] = @{ kind = 'power'; guid = $current }
        Save-V1Backup 'machine'
    }
    $existing = (& powercfg.exe /list) | Where-Object { $_ -match 'V1 Ultimate' }
    if ($existing -and (($existing | Select-Object -First 1) -match '([0-9a-fA-F]{8}-[0-9a-fA-F-]{27})')) {
        $guid = $Matches[1]
    } else {
        $out = (& powercfg.exe /duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 2>&1) -join ' '
        if ($LASTEXITCODE -ne 0 -or $out -notmatch '([0-9a-fA-F]{8}-[0-9a-fA-F-]{27})') {
            Send-V1Log 'Ultimate Performance is not available on this PC, power plan unchanged' -Warning; return
        }
        $guid = $Matches[1]
        $null = & powercfg.exe /changename $guid 'V1 Ultimate Performance' 'Created by V1. Undo restores your previous plan.'
    }
    $null = & powercfg.exe /setactive $guid
    if ($LASTEXITCODE -eq 0) { $script:Counts.tweaks++; Send-V1Log 'Ultimate Performance power plan active' }
    else { Send-V1Log 'Could not switch power plan' -Warning }
}

# ---------------------------------------------------------------- desktop helpers

function Initialize-V1Native {
    if (-not ('V1.Native' -as [type])) {
        Add-Type -Namespace V1 -Name Native -MemberDefinition @'
[DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
public static extern bool SystemParametersInfo(uint action, uint param, string vparam, uint winIni);
[DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
public static extern System.IntPtr SendMessageTimeout(System.IntPtr hWnd, uint msg, System.UIntPtr wParam, string lParam, uint flags, uint timeout, out System.UIntPtr result);
'@
    }
}

function Set-V1Wallpaper {
    param([Parameter(Mandatory)][string]$Image)
    if (-not (Test-Path -LiteralPath $Image)) { Send-V1Log ('Wallpaper image missing: {0}' -f $Image) -Warning; return }
    Set-V1Reg -Path 'HKCU:\Control Panel\Desktop' -Name 'WallpaperStyle' -Type String -Value '10' -Quiet
    Set-V1Reg -Path 'HKCU:\Control Panel\Desktop' -Name 'TileWallpaper' -Type String -Value '0' -Quiet
    # Record the current picture so undo can put it back.
    $store = Get-V1Backup 'user'
    if (-not $store.ContainsKey('reg|HKCU:\Control Panel\Desktop|WallPaper')) {
        $orig = Get-V1RegValue -Path 'HKCU:\Control Panel\Desktop' -Name 'WallPaper'
        $orig.kind = 'reg'; $orig.path = 'HKCU:\Control Panel\Desktop'; $orig.name = 'WallPaper'
        $store['reg|HKCU:\Control Panel\Desktop|WallPaper'] = $orig
        Save-V1Backup 'user'
    }
    Initialize-V1Native
    # SPI_SETDESKWALLPAPER = 0x14, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE = 3
    if ([V1.Native]::SystemParametersInfo(0x14, 0, $Image, 3)) { $script:Counts.tweaks++; Send-V1Log 'Wallpaper set' }
    else { Send-V1Log 'Windows did not accept the wallpaper' -Warning }
}

function Send-V1SettingChange {
    Initialize-V1Native
    $r = [UIntPtr]::Zero
    foreach ($area in 'ImmersiveColorSet', 'TraySettings', 'WindowsThemeElement') {
        # HWND_BROADCAST = 0xffff, WM_SETTINGCHANGE = 0x1A, SMTO_ABORTIFHUNG = 2
        $null = [V1.Native]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, $area, 2, 3000, [ref]$r)
    }
}

function ConvertTo-V1Dword {
    # Registry DWORDs are signed in PowerShell; this keeps values above 0x7FFFFFFF intact.
    param([Parameter(Mandatory)][uint32]$Value)
    return [BitConverter]::ToInt32([BitConverter]::GetBytes($Value), 0)
}

function Set-V1Accent {
    param([Parameter(Mandatory)][ValidatePattern('^#[0-9a-fA-F]{6}$')][string]$Hex)
    $r = [Convert]::ToInt32($Hex.Substring(1, 2), 16)
    $g = [Convert]::ToInt32($Hex.Substring(3, 2), 16)
    $b = [Convert]::ToInt32($Hex.Substring(5, 2), 16)
    # Windows reads an 8-step palette: three lighter tints, the accent, three darker shades, one deep shade.
    $mix = @(0.6, 0.4, 0.2, 0.0, -0.25, -0.45, -0.65, -0.8)
    $bytes = New-Object byte[] 32
    for ($i = 0; $i -lt 8; $i++) {
        $f = $mix[$i]
        foreach ($c in 0..2) {
            $v = @($r, $g, $b)[$c]
            if ($f -ge 0) { $n = $v + (255 - $v) * $f } else { $n = $v * (1 + $f) }
            $bytes[$i * 4 + $c] = [byte][Math]::Round([Math]::Max(0, [Math]::Min(255, $n)))
        }
        $bytes[$i * 4 + 3] = 0
    }
    # Plain arithmetic on Int64: in PowerShell 5.1 hex literals above 0x7FFFFFFF are negative Int32s.
    $accentAbgr = ConvertTo-V1Dword ([uint32]([int64]4278190080 + [int64]$bytes[14] * 65536 + [int64]$bytes[13] * 256 + [int64]$bytes[12]))
    $startAbgr = ConvertTo-V1Dword ([uint32]([int64]4278190080 + [int64]$bytes[22] * 65536 + [int64]$bytes[21] * 256 + [int64]$bytes[20]))
    $argb = ConvertTo-V1Dword ([uint32]([int64]3288334336 + [int64]$r * 65536 + [int64]$g * 256 + [int64]$b))
    $k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Accent'
    Set-V1Reg -Path 'HKCU:\Control Panel\Desktop' -Name 'AutoColorization' -Type DWord -Value 0 -Quiet
    Set-V1Reg -Path $k -Name 'AccentPalette' -Type Binary -Value $bytes -Quiet
    Set-V1Reg -Path $k -Name 'AccentColorMenu' -Type DWord -Value $accentAbgr -Quiet
    Set-V1Reg -Path $k -Name 'StartColorMenu' -Type DWord -Value $startAbgr -Quiet
    Set-V1Reg -Path 'HKCU:\Software\Microsoft\Windows\DWM' -Name 'AccentColor' -Type DWord -Value $accentAbgr -Quiet
    Set-V1Reg -Path 'HKCU:\Software\Microsoft\Windows\DWM' -Name 'ColorizationColor' -Type DWord -Value $argb -Quiet
    Set-V1Reg -Path 'HKCU:\Software\Microsoft\Windows\DWM' -Name 'ColorizationAfterglow' -Type DWord -Value $argb -Quiet
    Send-V1Log ('Accent colour {0}' -f $Hex.ToUpperInvariant())
}

function New-V1Shortcut {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Target, [string]$Arguments = '', [string]$Description = '')
    $shell = New-Object -ComObject WScript.Shell
    $lnk = $shell.CreateShortcut($Path)
    $lnk.TargetPath = $Target
    $lnk.Arguments = $Arguments
    $lnk.WorkingDirectory = Split-Path -Parent $Target
    $lnk.IconLocation = $Target + ',0'
    $lnk.Description = $Description
    $lnk.Save()
}

Export-ModuleMember -Function *-V1*
