#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Builds a V1 ISO from Microsoft's official Windows 11 ISO, on your own PC.

.DESCRIPTION
  1. Copies the official ISO and keeps the one edition you choose.
  2. Removes inbox apps nobody needs (the same list V1 Setup removes) from the image.
  3. Stops Windows from silently installing "suggested" apps for new accounts.
  4. Adds V1 (C:\V1) and an answer file: local account, no ad or consent pages, V1 Setup on first sign-in.
  5. Writes a new bootable ISO next to the original.
  Windows Setup still asks which disk to install to. Nothing here can wipe a disk on its own.

.PARAMETER IsoPath      The official Windows 11 ISO. If omitted, a file picker opens.
.PARAMETER Edition      Edition name as listed in the ISO, e.g. "Windows 11 Pro". If omitted, you are asked.
.PARAMETER UserName     The local account to create. Defaults to your current user name.
.PARAMETER Password     Optional password for that account. Empty means none (you can add one later).
.PARAMETER Language     Windows display language. Defaults to the ISO's own language.
.PARAMETER Locale       Region format, e.g. en-IN or en-GB. Defaults to -Language.
.PARAMETER TimeZone     Windows time zone id. Defaults to this PC's time zone.
.PARAMETER BypassRequirements  Lets Setup install on PCs without TPM 2.0 / Secure Boot / a supported CPU.
.PARAMETER OutputPath   Where to write the new ISO. Defaults to V1-<edition>.iso next to the original.
.PARAMETER WorkDir      Scratch folder (about 15 GB). Must not contain spaces.

.EXAMPLE
  .\build-iso.ps1 -IsoPath D:\Win11_25H2_English_x64.iso -Edition "Windows 11 Pro" -Locale en-IN
#>
[CmdletBinding()]
param(
    [string]$IsoPath,
    [string]$Edition,
    [string]$UserName,
    [string]$Password = '',
    [string]$Language,
    [string]$Locale,
    [string]$TimeZone,
    [switch]$BypassRequirements,
    [string]$OutputPath,
    [string]$WorkDir = (Join-Path $env:SystemDrive 'V1-build'),
    [switch]$KeepWorkDir
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Payload = Join-Path $RepoRoot 'payload'
$Dist = Join-Path $RepoRoot 'dist'
$Template = Join-Path $PSScriptRoot 'autounattend.template.xml'
$Marker = '.v1-build'

# Inbox apps removed from the image. Profile-dependent ones (Store, Xbox, OneDrive, Outlook, Teams) are left for V1 Setup.
$RemoveApps = @(
    'Clipchamp.Clipchamp', 'Microsoft.BingNews', 'Microsoft.BingWeather', 'Microsoft.BingSearch', 'Microsoft.GetHelp',
    'Microsoft.Getstarted', 'Microsoft.MicrosoftSolitaireCollection', 'Microsoft.People', 'Microsoft.PowerAutomateDesktop',
    'Microsoft.Todos', 'Microsoft.WindowsFeedbackHub', 'Microsoft.WindowsMaps', 'Microsoft.ZuneVideo',
    'microsoft.windowscommunicationsapps', 'Microsoft.Windows.DevHome', 'MicrosoftTeams', 'Microsoft.549981C3F5F10',
    'MicrosoftCorporationII.MicrosoftFamily', 'Microsoft.Edge.GameAssist'
)

# Microsoft's public generic setup keys. They select the edition during install and never activate Windows;
# your PC's own licence (digital or in firmware) does that once you're online.
$GenericKeys = @{
    'Core'                    = 'YTMG3-N6DKC-DKB77-7M9GH-8HVX7'
    'CoreN'                   = '4CPRK-NM3K3-X6XXQ-RXX86-WXCHW'
    'CoreSingleLanguage'      = 'BT79Q-G7N6G-PGBYW-4YWX6-6F4BT'
    'Professional'            = 'VK7JG-NPHTM-C97JM-9MPGT-3V66T'
    'ProfessionalN'           = '2B87N-8KFHP-DKV6R-Y2C8J-PKCKT'
    'ProfessionalWorkstation' = 'DXG7C-N36C4-C4HTG-X4T3X-2YV77'
    'Education'               = 'YNMGQ-8RYV3-4PGQ3-C8XTP-7CFBY'
}

$ReservedNames = @('administrator', 'admin', 'guest', 'defaultaccount', 'defaultuser0', 'wdagutilityaccount', 'user', 'users',
    'system', 'none', 'everyone', 'administrators', 'guests', 'local', 'network', 'service')

function Write-Step([string]$Message) { Write-Host ''; Write-Host ('==> ' + $Message) -ForegroundColor Cyan }
function Write-Info([string]$Message) { Write-Host ('    ' + $Message) -ForegroundColor Gray }
function Stop-Build([string]$Message) { throw $Message }

function Invoke-Native {
    # Runs a native tool and throws with its output if it fails.
    param([Parameter(Mandatory)][string]$File, [string[]]$Arguments, [int[]]$OkCodes = @(0))
    # Windows PowerShell 5.1 turns a native tool's stderr into terminating errors under 'Stop' when redirected
    # (oscdimg writes its progress there). Judge success by exit code instead.
    $ErrorActionPreference = 'Continue'
    $out = & $File @Arguments 2>&1
    if ($OkCodes -notcontains $LASTEXITCODE) {
        Stop-Build ('{0} failed with code {1}: {2}' -f (Split-Path -Leaf $File), $LASTEXITCODE, (($out | Out-String).Trim()))
    }
    return $out
}

function Get-Oscdimg {
    # oscdimg.exe writes bootable Windows ISOs. Use the Windows ADK copy if installed, else Microsoft's download.
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } elseif ([Environment]::Is64BitOperatingSystem) { 'amd64' } else { 'x86' }
    $adk = Join-Path ${env:ProgramFiles(x86)} ('Windows Kits\10\Assessment and Deployment Kit\Deployment Tools\{0}\Oscdimg\oscdimg.exe' -f $arch)
    if (Test-Path -LiteralPath $adk) { return $adk }
    $cacheDir = Join-Path $env:LOCALAPPDATA 'V1-build'
    $cached = Join-Path $cacheDir 'oscdimg.exe'
    if (-not (Test-Path -LiteralPath $cached)) {
        Write-Info 'Downloading oscdimg.exe from Microsoft...'
        $null = New-Item -ItemType Directory -Path $cacheDir -Force
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $tmp = $cached + '.download'
        try {
            Invoke-WebRequest -UseBasicParsing -Uri 'https://msdl.microsoft.com/download/symbols/oscdimg.exe/3D44737265000/oscdimg.exe' -OutFile $tmp
        } catch {
            Stop-Build ('Could not download oscdimg.exe ({0}). Install the "Deployment Tools" part of the Windows ADK from Microsoft, then run this again.' -f $_.Exception.Message)
        }
        Move-Item -LiteralPath $tmp -Destination $cached -Force
    }
    $sig = Get-AuthenticodeSignature -FilePath $cached
    if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
        Remove-Item -LiteralPath $cached -Force
        Stop-Build 'oscdimg.exe is not signed by Microsoft, so it was deleted. Install the Windows ADK Deployment Tools instead.'
    }
    return $cached
}

function Select-IsoFile {
    Add-Type -AssemblyName System.Windows.Forms
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Title = 'Choose the official Windows 11 ISO'
    $dlg.Filter = 'Disc images (*.iso)|*.iso'
    if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { Stop-Build 'No ISO chosen.' }
    return $dlg.FileName
}

function Get-ImageArch($Info) {
    $a = [string]$Info.Architecture
    if ($a -in '9', 'x64', 'amd64', 'AMD64') { return 'amd64' }
    if ($a -in '12', 'arm64', 'ARM64') { return 'arm64' }
    Stop-Build ('This image is for "{0}". V1 supports 64-bit Intel/AMD and ARM64 Windows 11.' -f $a)
}

function Set-OfflineValue {
    param([string]$Key, [string]$Name, [ValidateSet('REG_DWORD', 'REG_SZ')][string]$Type, [string]$Data)
    $null = Invoke-Native -File 'reg.exe' -Arguments @('add', $Key, '/v', $Name, '/t', $Type, '/d', $Data, '/f')
}

function Mount-Hive([string]$Name, [string]$File) {
    $null = Invoke-Native -File 'reg.exe' -Arguments @('load', ('HKLM\' + $Name), $File)
    $script:LoadedHives += $Name
}

function Dismount-Hives {
    $ErrorActionPreference = 'Continue'
    foreach ($h in @($script:LoadedHives)) {
        [GC]::Collect(); [GC]::WaitForPendingFinalizers()
        $ok = $false
        for ($i = 0; $i -lt 5 -and -not $ok; $i++) {
            $null = & reg.exe unload ('HKLM\' + $h) 2>&1
            $ok = ($LASTEXITCODE -eq 0)
            if (-not $ok) { Start-Sleep -Seconds 2 }
        }
        if (-not $ok) { Write-Warning ('Could not unload registry hive {0}.' -f $h) }
    }
    $script:LoadedHives = @()
}

# ------------------------------------------------------------------------------ preflight

if ($PSVersionTable.PSEdition -ne 'Desktop') { Stop-Build 'Run this in Windows PowerShell (powershell.exe), not PowerShell 7. Build-ISO.cmd does this for you.' }
if (-not $IsoPath) { $IsoPath = Select-IsoFile }
if (-not (Test-Path -LiteralPath $IsoPath -PathType Leaf)) { Stop-Build ('ISO not found: {0}' -f $IsoPath) }
$IsoPath = (Resolve-Path -LiteralPath $IsoPath).Path
foreach ($f in 'V1App.exe', 'V1App.exe.config', 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'runtimes') {
    if (-not (Test-Path -LiteralPath (Join-Path $Dist $f))) { Stop-Build ('dist\{0} is missing. Download the full V1 folder again.' -f $f) }
}
foreach ($d in 'web', 'playbook', 'wallpapers') {
    if (-not (Test-Path -LiteralPath (Join-Path $Payload $d))) { Stop-Build ('payload\{0} is missing. Download the full V1 folder again.' -f $d) }
}
if ($WorkDir -match '\s') { Stop-Build 'WorkDir must not contain spaces (oscdimg cannot handle them).' }
$WorkDir = [IO.Path]::GetFullPath($WorkDir)
if (Test-Path -LiteralPath $WorkDir) {
    $items = @(Get-ChildItem -LiteralPath $WorkDir -Force)
    if ($items.Count -gt 0 -and -not (Test-Path -LiteralPath (Join-Path $WorkDir $Marker))) {
        Stop-Build ('{0} already exists and was not made by V1. Choose another -WorkDir.' -f $WorkDir)
    }
}
$free = (New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($WorkDir))).AvailableFreeSpace / 1GB
if ($free -lt 20) { Stop-Build ('{0} needs about 20 GB free; it has {1:N0} GB.' -f [IO.Path]::GetPathRoot($WorkDir), $free) }

if (-not $UserName) {
    $suggest = if ($env:USERNAME -and $ReservedNames -notcontains $env:USERNAME.ToLowerInvariant() -and $env:USERNAME -match '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$') { $env:USERNAME } else { '' }
    $answer = Read-Host ('Name for your Windows account' + $(if ($suggest) { (' [{0}]' -f $suggest) } else { '' }))
    $UserName = if ($answer) { $answer.Trim() } else { $suggest }
}
if ($UserName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$') { Stop-Build 'Account name: 1 to 20 letters, numbers, dots, dashes or underscores, starting with a letter or number.' }
if ($ReservedNames -contains $UserName.ToLowerInvariant()) { Stop-Build ('"{0}" is reserved by Windows. Pick another account name.' -f $UserName) }
if (-not $TimeZone) { $TimeZone = (Get-TimeZone).Id }
if (-not (Get-TimeZone -ListAvailable | Where-Object { $_.Id -eq $TimeZone })) { Stop-Build ('Unknown time zone "{0}". See Get-TimeZone -ListAvailable.' -f $TimeZone) }

$script:LoadedHives = @()
$Mount = Join-Path $WorkDir 'mount'
$IsoDir = Join-Path $WorkDir 'iso'
$Wim = Join-Path $WorkDir 'install.wim'
$mounted = $false
$isoMounted = $false
$started = Get-Date

try {
    Write-Step 'Preparing'
    $oscdimg = Get-Oscdimg
    Write-Info ('oscdimg: {0}' -f $oscdimg)
    if (Test-Path -LiteralPath $WorkDir) {
        # A previous run that was interrupted may have left the image open.
        if (Test-Path -LiteralPath $Mount) { $null = Dismount-WindowsImage -Path $Mount -Discard -ErrorAction SilentlyContinue }
        $null = Clear-WindowsCorruptMountPoint -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $WorkDir -Recurse -Force
    }
    $null = New-Item -ItemType Directory -Path $WorkDir, $Mount, $IsoDir -Force
    Set-Content -LiteralPath (Join-Path $WorkDir $Marker) -Value 'Scratch folder for V1 build-iso.ps1. Safe to delete.'

    Write-Step 'Copying the Windows ISO'
    $img = Mount-DiskImage -ImagePath $IsoPath -PassThru
    $isoMounted = $true
    $letter = $null
    for ($i = 0; $i -lt 20 -and -not $letter; $i++) { $letter = ($img | Get-Volume).DriveLetter; if (-not $letter) { Start-Sleep -Milliseconds 500 } }
    if (-not $letter) { Stop-Build 'Windows did not give the ISO a drive letter.' }
    $null = Invoke-Native -File 'robocopy.exe' -Arguments @(($letter + ':\'), $IsoDir, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP') -OkCodes @(0, 1, 2, 3)
    Dismount-DiskImage -ImagePath $IsoPath | Out-Null
    $isoMounted = $false
    Get-ChildItem -LiteralPath $IsoDir -Recurse -File | ForEach-Object { $_.IsReadOnly = $false }

    $src = @('install.wim', 'install.esd') | ForEach-Object { Join-Path $IsoDir ('sources\' + $_) } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $src) { Stop-Build 'This ISO has no sources\install.wim or install.esd (split images are not supported). Use the ISO from microsoft.com/software-download/windows11.' }

    Write-Step 'Choosing the edition'
    $images = @(Get-WindowsImage -ImagePath $src)
    $chosen = $null
    if ($Edition) {
        $chosen = $images | Where-Object { $_.ImageName -eq $Edition } | Select-Object -First 1
        if (-not $chosen) { Stop-Build ('"{0}" is not in this ISO. It has: {1}' -f $Edition, (($images | ForEach-Object { $_.ImageName }) -join ', ')) }
    } elseif ($images.Count -eq 1) {
        $chosen = $images[0]
    } else {
        $default = ($images | Where-Object { $_.ImageName -eq 'Windows 11 Pro' } | Select-Object -First 1)
        if (-not $default) { $default = $images[0] }
        foreach ($im in $images) { Write-Host ('    {0,2}. {1}' -f $im.ImageIndex, $im.ImageName) }
        Write-Host '    Pick the edition your PC is licensed for (Home laptops usually need Home).' -ForegroundColor Yellow
        $answer = Read-Host ('Edition number [{0}]' -f $default.ImageIndex)
        $n = 0
        if (-not $answer) { $chosen = $default }
        elseif ([int]::TryParse($answer, [ref]$n)) { $chosen = $images | Where-Object { $_.ImageIndex -eq $n } | Select-Object -First 1 }
        if (-not $chosen) { Stop-Build ('No edition number {0}.' -f $answer) }
    }
    Write-Info ('Edition: {0}' -f $chosen.ImageName)

    Write-Step 'Extracting the edition (a few minutes)'
    Export-WindowsImage -SourceImagePath $src -SourceIndex $chosen.ImageIndex -DestinationImagePath $Wim -CompressionType max | Out-Null
    $info = Get-WindowsImage -ImagePath $Wim -Index 1
    $arch = Get-ImageArch $info
    $build = ([version]$info.Version).Build
    if ($build -lt 22000) { Stop-Build ('This is Windows build {0}. V1 needs a Windows 11 ISO.' -f $build) }
    if (-not $Language) {
        $langs = @($info.Languages)
        $idx = 0
        if ($info.PSObject.Properties['DefaultLanguageIndex'] -and $info.DefaultLanguageIndex -lt $langs.Count) { $idx = [int]$info.DefaultLanguageIndex }
        $Language = ([string]$langs[$idx]) -replace '\s*\(Default\)\s*$', ''
    }
    if ($Language -notmatch '^[a-z]{2,3}-[A-Za-z0-9-]+$') { Stop-Build ('Could not read the ISO language ("{0}"). Pass it with -Language, e.g. -Language en-US.' -f $Language) }
    if (-not $Locale) { $Locale = $Language }
    if ($Locale -notmatch '^[a-z]{2,3}-[A-Za-z0-9-]+$') { Stop-Build ('"{0}" is not a locale name like en-US or en-IN.' -f $Locale) }
    Write-Info ('Windows {0} build {1}, {2}, language {3}, region {4}' -f $info.Version, $build, $arch, $Language, $Locale)

    Write-Step 'Opening the image'
    Mount-WindowsImage -ImagePath $Wim -Index 1 -Path $Mount | Out-Null
    $mounted = $true

    Write-Step 'Removing inbox apps'
    $prov = @(Get-AppxProvisionedPackage -Path $Mount)
    foreach ($p in $prov) {
        if ($RemoveApps -contains $p.DisplayName) {
            try { Remove-AppxProvisionedPackage -Path $Mount -PackageName $p.PackageName | Out-Null; Write-Info ('Removed {0}' -f $p.DisplayName) }
            catch { Write-Warning ('Could not remove {0}: {1}' -f $p.DisplayName, $_.Exception.Message) }
        }
    }

    Write-Step 'Adding V1'
    $dest = Join-Path $Mount 'V1'
    $null = Invoke-Native -File 'robocopy.exe' -Arguments @($Payload, $dest, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP') -OkCodes @(0, 1, 2, 3)
    $null = Invoke-Native -File 'robocopy.exe' -Arguments @($Dist, $dest, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP') -OkCodes @(0, 1, 2, 3)
    if (-not (Test-Path -LiteralPath (Join-Path $dest 'V1App.exe'))) { Stop-Build 'V1 files were not copied into the image.' }

    Write-Step 'Default settings for new accounts'
    Mount-Hive 'V1_SOFTWARE' (Join-Path $Mount 'Windows\System32\config\SOFTWARE')
    Mount-Hive 'V1_SYSTEM' (Join-Path $Mount 'Windows\System32\config\SYSTEM')
    Mount-Hive 'V1_DEFAULT' (Join-Path $Mount 'Users\Default\NTUSER.DAT')
    $cdm = 'HKLM\V1_DEFAULT\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'
    foreach ($n in 'ContentDeliveryAllowed', 'FeatureManagementEnabled', 'OemPreInstalledAppsEnabled', 'PreInstalledAppsEnabled',
        'PreInstalledAppsEverEnabled', 'SilentInstalledAppsEnabled', 'SoftLandingEnabled', 'SubscribedContentEnabled', 'SystemPaneSuggestionsEnabled') {
        Set-OfflineValue $cdm $n 'REG_DWORD' '0'
    }
    Write-Info 'Suggested apps will not install themselves at first sign-in'
    Set-OfflineValue 'HKLM\V1_SOFTWARE\Policies\Microsoft\Windows\CloudContent' 'DisableWindowsConsumerFeatures' 'REG_DWORD' '1'
    Set-OfflineValue 'HKLM\V1_SOFTWARE\Microsoft\Windows\CurrentVersion\OOBE' 'BypassNRO' 'REG_DWORD' '1'
    foreach ($k in 'DevHomeUpdate', 'OutlookUpdate') {
        # Absent on some builds; exit code 1 just means there was nothing to delete.
        $null = Invoke-Native -File 'reg.exe' -Arguments @('delete', ('HKLM\V1_SOFTWARE\Microsoft\WindowsUpdate\Orchestrator\UScheduler_Oobe\' + $k), '/f') -OkCodes @(0, 1)
    }
    Write-Info 'Dev Home and new Outlook will not be pushed during setup'
    if ($BypassRequirements) {
        foreach ($n in 'BypassTPMCheck', 'BypassSecureBootCheck', 'BypassRAMCheck', 'BypassCPUCheck', 'BypassStorageCheck') {
            Set-OfflineValue 'HKLM\V1_SYSTEM\Setup\LabConfig' $n 'REG_DWORD' '1'
        }
        Set-OfflineValue 'HKLM\V1_SYSTEM\Setup\MoSetup' 'AllowUpgradesWithUnsupportedTPMOrCPU' 'REG_DWORD' '1'
        Set-OfflineValue 'HKLM\V1_DEFAULT\Control Panel\UnsupportedHardwareNotificationCache' 'SV1' 'REG_DWORD' '0'
        Set-OfflineValue 'HKLM\V1_DEFAULT\Control Panel\UnsupportedHardwareNotificationCache' 'SV2' 'REG_DWORD' '0'
        Write-Info 'Hardware requirement checks bypassed'
    }
    Dismount-Hives

    Write-Step 'Saving the image (a few minutes)'
    Dismount-WindowsImage -Path $Mount -Save | Out-Null
    $mounted = $false
    Get-ChildItem -LiteralPath (Join-Path $IsoDir 'sources') -Filter 'install.*' | Remove-Item -Force
    # Exporting again drops the space the removed apps still took up inside the image.
    Export-WindowsImage -SourceImagePath $Wim -SourceIndex 1 -DestinationImagePath (Join-Path $IsoDir 'sources\install.wim') -CompressionType max | Out-Null
    $size = (Get-Item -LiteralPath (Join-Path $IsoDir 'sources\install.wim')).Length / 1GB
    Write-Info ('install.wim is {0:N2} GB' -f $size)

    if ($BypassRequirements) {
        Write-Step 'Bypassing hardware checks in Windows Setup'
        Mount-WindowsImage -ImagePath (Join-Path $IsoDir 'sources\boot.wim') -Index 2 -Path $Mount | Out-Null
        $mounted = $true
        Mount-Hive 'V1_SYSTEM' (Join-Path $Mount 'Windows\System32\config\SYSTEM')
        foreach ($n in 'BypassTPMCheck', 'BypassSecureBootCheck', 'BypassRAMCheck', 'BypassCPUCheck', 'BypassStorageCheck') {
            Set-OfflineValue 'HKLM\V1_SYSTEM\Setup\LabConfig' $n 'REG_DWORD' '1'
        }
        Dismount-Hives
        Dismount-WindowsImage -Path $Mount -Save | Out-Null
        $mounted = $false
    }

    Write-Step 'Writing the answer file'
    $esc = { param($s) [Security.SecurityElement]::Escape([string]$s) }
    $key = $null
    if ($info.PSObject.Properties['EditionId'] -and $GenericKeys.ContainsKey([string]$info.EditionId)) { $key = $GenericKeys[[string]$info.EditionId] }
    $keyXml = if ($key) {
        "        <ProductKey>`r`n          <Key>$key</Key>`r`n          <WillShowUI>OnError</WillShowUI>`r`n        </ProductKey>"
    } else { '' }
    if (-not $key) { Write-Info 'Setup will ask for a product key; choose "I don''t have a product key" to continue.' }
    $xml = (Get-Content -LiteralPath $Template -Raw -Encoding UTF8)
    $fill = [ordered]@{
        '{{ARCH}}' = $arch; '{{LANG}}' = (& $esc $Language); '{{INPUT}}' = (& $esc $Language); '{{USERLOCALE}}' = (& $esc $Locale)
        '{{TIMEZONE}}' = (& $esc $TimeZone); '{{USERNAME}}' = (& $esc $UserName); '{{PASSWORD}}' = (& $esc $Password); '{{PRODUCTKEY}}' = $keyXml
    }
    foreach ($k in $fill.Keys) { $xml = $xml.Replace($k, [string]$fill[$k]) }
    if ($xml -match '\{\{[A-Z]+\}\}') { Stop-Build 'The answer file template has an unfilled value.' }
    $null = [xml]$xml   # throws if the result is not well-formed XML
    [IO.File]::WriteAllText((Join-Path $IsoDir 'autounattend.xml'), $xml, (New-Object Text.UTF8Encoding($false)))

    Write-Step 'Building the ISO'
    if (-not $OutputPath) {
        $name = 'V1-' + (($chosen.ImageName -replace '^Windows 11\s*', 'Windows11-') -replace '[^A-Za-z0-9]+', '-').Trim('-') + '.iso'
        $OutputPath = Join-Path (Split-Path -Parent $IsoPath) $name
    }
    $OutputPath = [IO.Path]::GetFullPath($OutputPath)
    if ($OutputPath -eq $IsoPath) { Stop-Build 'The output would overwrite the original ISO. Choose another -OutputPath.' }
    if (Test-Path -LiteralPath $OutputPath) { $OutputPath = $OutputPath -replace '\.iso$', ('-{0:yyyyMMdd-HHmm}.iso' -f (Get-Date)) }
    $etfs = Join-Path $IsoDir 'boot\etfsboot.com'
    $efi = Join-Path $IsoDir 'efi\microsoft\boot\efisys.bin'
    if (-not (Test-Path -LiteralPath $efi)) { Stop-Build 'efi\microsoft\boot\efisys.bin is missing from the ISO.' }
    $bootdata = if (Test-Path -LiteralPath $etfs) { '-bootdata:2#p0,e,b{0}#pEF,e,b{1}' -f $etfs, $efi } else { '-bootdata:1#pEF,e,b{0}' -f $efi }
    $null = Invoke-Native -File $oscdimg -Arguments @('-m', '-o', '-u2', '-udfver102', '-lV1', $bootdata, $IsoDir, $OutputPath)
    if (-not (Test-Path -LiteralPath $OutputPath)) { Stop-Build 'oscdimg finished but the ISO is not there.' }
} finally {
    if ($script:LoadedHives.Count -gt 0) { Dismount-Hives }
    if ($mounted) { Write-Warning 'Discarding the open image.'; $null = Dismount-WindowsImage -Path $Mount -Discard -ErrorAction SilentlyContinue }
    if ($isoMounted) { $null = Dismount-DiskImage -ImagePath $IsoPath -ErrorAction SilentlyContinue }
}

if (-not $KeepWorkDir) { Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue }
$mins = ((Get-Date) - $started).TotalMinutes
Write-Host ''
Write-Host ('Done in {0:N0} minutes: {1}' -f $mins, $OutputPath) -ForegroundColor Green
Write-Host ''
Write-Host 'Next:' -ForegroundColor White
Write-Host '  1. Open Rufus (rufus.ie), pick your USB stick and this ISO, press Start.'
Write-Host '     If Rufus offers to change the Windows experience, leave every box unticked: V1 already did it.'
Write-Host '  2. Back up your files. Boot the PC from the USB stick.'
Write-Host '  3. Windows Setup asks which disk to use. Everything after that is automatic.'
Write-Host ('  4. You sign in as "{0}"{1}, and V1 Setup opens.' -f $UserName, $(if ($Password) { '' } else { ' (no password; add one in Settings)' }))
