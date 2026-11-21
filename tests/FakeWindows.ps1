<#
  A small fake of the Windows pieces the playbook touches: registry, Appx packages, scheduled tasks,
  services, optional features and powercfg. Dot-source it, then run the real apply.ps1 / revert.ps1.
  Global functions shadow cmdlets of the same name everywhere, including inside V1.psm1, so the
  playbook runs unmodified while nothing on the machine changes. Registry paths (HK*:) go to an
  in-memory store; every other path goes to the real cmdlets.
#>

# V1.psm1 only compiles its user32 helpers if V1.Native does not exist yet, so defining it first
# keeps the wallpaper and setting-change broadcasts from touching the real desktop.
if (-not ('V1.Native' -as [type])) {
    Add-Type -TypeDefinition @'
namespace V1 {
    public static class Native {
        public static int SpiCalls;
        public static int BroadcastCalls;
        public static bool SystemParametersInfo(uint action, uint param, string vparam, uint winIni) { SpiCalls++; return true; }
        public static System.IntPtr SendMessageTimeout(System.IntPtr h, uint msg, System.UIntPtr w, string l, uint flags, uint timeout, out System.UIntPtr result) {
            BroadcastCalls++; result = System.UIntPtr.Zero; return new System.IntPtr(1);
        }
    }
}
'@
}

$global:FakeReg = @{}           # 'hkcu:\software\x' -> @{ path = 'HKCU:\Software\X'; values = @{ 'name' = @{ Name; Kind; Data } } }
$global:FakeTasks = @{}         # '\path\|name' -> 'Ready' | 'Disabled'
$global:FakeApps = New-Object System.Collections.ArrayList
$global:FakeProvisioned = New-Object System.Collections.ArrayList
$global:FakePower = @{ active = '381b4222-f694-41f0-9685-ff5bb260df2e'; schemes = [ordered]@{ '381b4222-f694-41f0-9685-ff5bb260df2e' = 'Balanced' } }
$global:FakeFeatures = @{ Recall = 'Enabled' }
$global:FakeCalls = New-Object System.Collections.ArrayList

function global:Get-FakeKeyId([string]$p) { return $p.TrimEnd('\').ToLowerInvariant() }
function global:Test-FakeRegPath([string]$p) { return $p -match '^HK(CU|LM|U|CR):' }

function global:Set-FakeValue([string]$Path, [string]$Name, [string]$Kind, $Data) {
    $id = Get-FakeKeyId $Path
    if (-not $global:FakeReg.ContainsKey($id)) { $global:FakeReg[$id] = @{ path = $Path.TrimEnd('\'); values = @{} } }
    $global:FakeReg[$id].values[$Name.ToLowerInvariant()] = @{ Name = $Name; Kind = $Kind; Data = $Data }
}

function global:Get-FakeSnapshot {
    $out = @{}
    foreach ($k in $global:FakeReg.Keys) {
        foreach ($v in $global:FakeReg[$k].values.Values) {
            $d = $v.Data
            if ($d -is [byte[]]) { $d = [Convert]::ToBase64String($d) }
            $out[$k + '|' + $v.Name.ToLowerInvariant()] = '{0}:{1}' -f $v.Kind, ($d -join ',')
        }
    }
    return $out
}

function global:New-FakeKeyObject($entry) {
    $o = [pscustomobject]@{ Entry = $entry }
    $o | Add-Member ScriptMethod GetValueNames { return [string[]]@($this.Entry.values.Values | ForEach-Object { $_.Name }) }
    $o | Add-Member ScriptMethod GetValueKind { param($n) return $this.Entry.values[$n.ToLowerInvariant()].Kind }
    $o | Add-Member ScriptMethod GetValue { param($n, $def, $opt) $v = $this.Entry.values[$n.ToLowerInvariant()]; if ($v) { return $v.Data } return $def }
    return $o
}

function global:Test-Path {
    param([Parameter(Position = 0)][string[]]$Path, [string[]]$LiteralPath, $PathType, [switch]$IsValid)
    $p = if ($LiteralPath) { $LiteralPath[0] } else { $Path[0] }
    if (Test-FakeRegPath $p) { return $global:FakeReg.ContainsKey((Get-FakeKeyId $p)) }
    return Microsoft.PowerShell.Management\Test-Path @PSBoundParameters
}

function global:Get-Item {
    param([Parameter(Position = 0)][string[]]$Path, [string[]]$LiteralPath, [switch]$Force)
    $p = if ($LiteralPath) { $LiteralPath[0] } else { $Path[0] }
    if (Test-FakeRegPath $p) {
        $id = Get-FakeKeyId $p
        if (-not $global:FakeReg.ContainsKey($id)) { throw "Cannot find path '$p' because it does not exist." }
        return New-FakeKeyObject $global:FakeReg[$id]
    }
    return Microsoft.PowerShell.Management\Get-Item @PSBoundParameters
}

function global:New-Item {
    param([Parameter(Position = 0)][string[]]$Path, [string]$ItemType, [switch]$Force, $Value, [string]$Name)
    $p = $Path[0]
    if (Test-FakeRegPath $p) {
        $id = Get-FakeKeyId $p
        if ($global:FakeReg.ContainsKey($id) -and -not $Force) { throw "key exists: $p" }
        if (-not $global:FakeReg.ContainsKey($id)) { $global:FakeReg[$id] = @{ path = $p.TrimEnd('\'); values = @{} } }
        return New-FakeKeyObject $global:FakeReg[$id]
    }
    return Microsoft.PowerShell.Management\New-Item @PSBoundParameters
}

function global:New-ItemProperty {
    param([string]$LiteralPath, [string]$Path, [string]$Name, [string]$PropertyType, $Value, [switch]$Force)
    $p = if ($LiteralPath) { $LiteralPath } else { $Path }
    if (-not (Test-FakeRegPath $p)) { throw "New-ItemProperty only faked for the registry: $p" }
    if (-not $global:FakeReg.ContainsKey((Get-FakeKeyId $p))) { throw "Cannot find path '$p' because it does not exist." }
    switch ($PropertyType) {
        'DWord' { $data = [int]$Value }            # like the real provider: must fit a signed 32-bit int
        'QWord' { $data = [long]$Value }
        'String' { $data = [string]$Value }
        'ExpandString' { $data = [string]$Value }
        'Binary' { if ($Value -isnot [byte[]]) { throw 'Binary needs byte[]' }; $data = [byte[]]$Value }
        'MultiString' { $data = [string[]]$Value }
        default { throw "Bad PropertyType $PropertyType" }
    }
    Set-FakeValue $p $Name $PropertyType $data
}

function global:Remove-ItemProperty {
    [CmdletBinding()]
    param([string]$LiteralPath, [string]$Path, [string]$Name)
    $p = if ($LiteralPath) { $LiteralPath } else { $Path }
    $id = Get-FakeKeyId $p
    if ($global:FakeReg.ContainsKey($id) -and $global:FakeReg[$id].values.ContainsKey($Name.ToLowerInvariant())) {
        $global:FakeReg[$id].values.Remove($Name.ToLowerInvariant())
    } elseif ($ErrorActionPreference -ne 'SilentlyContinue') {
        throw "Property $Name does not exist at path $p."
    }
}

function global:Get-ItemProperty {
    [CmdletBinding()]
    param([Parameter(Position = 0)][string[]]$Path, [string[]]$LiteralPath, [string[]]$Name)
    $p = if ($LiteralPath) { $LiteralPath[0] } else { $Path[0] }
    if (-not (Test-FakeRegPath $p)) { return Microsoft.PowerShell.Management\Get-ItemProperty @PSBoundParameters }
    $id = Get-FakeKeyId $p
    if (-not $global:FakeReg.ContainsKey($id)) { if ($ErrorActionPreference -eq 'SilentlyContinue') { return $null }; throw "Cannot find path '$p'" }
    $h = [ordered]@{}
    foreach ($v in $global:FakeReg[$id].values.Values) { if (-not $Name -or $Name -contains $v.Name) { $h[$v.Name] = $v.Data } }
    if ($Name -and $h.Count -eq 0) { if ($ErrorActionPreference -eq 'SilentlyContinue') { return $null }; throw "Property $Name does not exist" }
    return [pscustomobject]$h
}

# ---- apps
function global:Get-AppxPackage { param([switch]$AllUsers, $Name, $ErrorAction) return @($global:FakeApps) }
function global:Remove-AppxPackage {
    param([string]$Package, [switch]$AllUsers, $ErrorAction)
    $hit = @($global:FakeApps | Where-Object { $_.PackageFullName -eq $Package })
    foreach ($h in $hit) { $global:FakeApps.Remove($h) }
    [void]$global:FakeCalls.Add("Remove-AppxPackage $Package")
}
function global:Get-AppxProvisionedPackage { param([switch]$Online, $ErrorAction) return @($global:FakeProvisioned) }
function global:Remove-AppxProvisionedPackage {
    param([switch]$Online, [string]$PackageName, [switch]$AllUsers, $ErrorAction)
    $hit = @($global:FakeProvisioned | Where-Object { $_.PackageName -eq $PackageName })
    foreach ($h in $hit) { $global:FakeProvisioned.Remove($h) }
    [void]$global:FakeCalls.Add("Remove-AppxProvisionedPackage $PackageName")
}
function global:Add-FakeApp([string]$Name) {
    [void]$global:FakeApps.Add([pscustomobject]@{ Name = $Name; PackageFullName = "$Name`_1.0.0.0_x64__8wekyb3d8bbwe"; NonRemovable = $false })
    [void]$global:FakeProvisioned.Add([pscustomobject]@{ DisplayName = $Name; PackageName = "$Name`_1.0.0.0_neutral_~_8wekyb3d8bbwe" })
}

# ---- scheduled tasks
function global:Get-ScheduledTask {
    param([string]$TaskPath, [string]$TaskName, $ErrorAction)
    $k = "$TaskPath|$TaskName"
    if (-not $global:FakeTasks.ContainsKey($k)) { return $null }
    return [pscustomobject]@{ TaskPath = $TaskPath; TaskName = $TaskName; State = $global:FakeTasks[$k] }
}
function global:Disable-ScheduledTask { param([string]$TaskPath, [string]$TaskName, $ErrorAction) $global:FakeTasks["$TaskPath|$TaskName"] = 'Disabled' }
function global:Enable-ScheduledTask { param([string]$TaskPath, [string]$TaskName, $ErrorAction) $global:FakeTasks["$TaskPath|$TaskName"] = 'Ready' }

# ---- shortcuts (WScript.Shell COM); every other New-Object goes to the real cmdlet
function global:New-Object {
    [CmdletBinding()]
    param([Parameter(Position = 0)][string]$TypeName, [Parameter(Position = 1)][object[]]$ArgumentList, [string]$ComObject, [hashtable]$Property)
    if ($ComObject -eq 'WScript.Shell') {
        $sh = [pscustomobject]@{}
        $sh | Add-Member ScriptMethod CreateShortcut {
            param($p)
            $l = [pscustomobject]@{ Path = $p; TargetPath = ''; Arguments = ''; WorkingDirectory = ''; IconLocation = ''; Description = '' }
            $l | Add-Member ScriptMethod Save { [void]$global:FakeCalls.Add('shortcut ' + $this.Path + ' -> ' + $this.TargetPath + ' ' + $this.Arguments) }
            return $l
        }
        return $sh
    }
    return Microsoft.PowerShell.Utility\New-Object @PSBoundParameters
}

# ---- system
function global:Get-CimInstance { param([string]$ClassName, [string]$Filter, $ErrorAction) return @() }
function global:Stop-Service { param([string]$Name, [switch]$Force, $ErrorAction) [void]$global:FakeCalls.Add("Stop-Service $Name") }
function global:Get-WindowsOptionalFeature {
    param([switch]$Online, [string]$FeatureName, $ErrorAction)
    if ($global:FakeFeatures.ContainsKey($FeatureName)) { return [pscustomobject]@{ FeatureName = $FeatureName; State = $global:FakeFeatures[$FeatureName] } }
    return $null
}
function global:Disable-WindowsOptionalFeature { param([switch]$Online, [string]$FeatureName, [switch]$NoRestart, $ErrorAction) $global:FakeFeatures[$FeatureName] = 'Disabled' }
function global:Enable-WindowsOptionalFeature { param([switch]$Online, [string]$FeatureName, [switch]$NoRestart, $ErrorAction) $global:FakeFeatures[$FeatureName] = 'Enabled' }
function global:icacls.exe { $global:LASTEXITCODE = 0 }
function global:reg.exe { $global:LASTEXITCODE = 0 }
function global:powercfg.exe {
    $global:LASTEXITCODE = 0
    switch -Regex ($args[0]) {
        'getactivescheme' { 'Power Scheme GUID: {0}  ({1})' -f $global:FakePower.active, $global:FakePower.schemes[$global:FakePower.active] }
        'list' { foreach ($g in @($global:FakePower.schemes.Keys)) { 'Power Scheme GUID: {0}  ({1})' -f $g, $global:FakePower.schemes[$g] } }
        'duplicatescheme' { $g = '11111111-2222-3333-4444-555555555555'; $global:FakePower.schemes[$g] = 'Ultimate Performance'; 'Power Scheme GUID: {0}  (Ultimate Performance)' -f $g }
        'changename' { $global:FakePower.schemes[$args[1]] = $args[2] }
        'setactive' { if ($global:FakePower.schemes.Contains($args[1])) { $global:FakePower.active = $args[1] } else { $global:LASTEXITCODE = 1 } }
        'delete' { if ($global:FakePower.active -ne $args[1]) { $global:FakePower.schemes.Remove($args[1]) } else { $global:LASTEXITCODE = 1 } }
    }
}

function global:Invoke-FakeScript {
    <# Runs a playbook script, returns @{ code; events } with every "##V1" line parsed. #>
    param([string]$Script, [hashtable]$Arguments = @{})
    $sw = New-Object IO.StringWriter
    $old = [Console]::Out
    [Console]::SetOut($sw)
    try { & $Script @Arguments; $code = $LASTEXITCODE }
    finally { [Console]::SetOut($old) }
    $events = @($sw.ToString() -split "`r?`n" | Where-Object { $_ -like '##V1 *' } | ForEach-Object { $_.Substring(5) | ConvertFrom-Json })
    return @{ code = $code; events = $events; raw = $sw.ToString() }
}
