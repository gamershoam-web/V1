#Requires -Version 5.1
<#
.SYNOPSIS
  Applies the choices made in V1 Setup. Run by V1App.exe; progress is streamed as "##V1 {json}" lines.
.PARAMETER Config
  JSON file written by V1 Setup: { profile, options{...}, look{...} }.
.PARAMETER Only
  "all" (setup, needs admin) or "appearance" (V1 Settings, runs as the signed-in user).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Config,
    [ValidateSet('all', 'appearance')][string]$Only = 'all'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'V1.psm1') -Force
$Root = Split-Path -Parent $PSScriptRoot
$Version = '1.0.0'

Initialize-V1 -Name $(if ($Only -eq 'all') { 'setup' } else { 'appearance' })
if ($Only -eq 'all' -and -not (Test-V1Admin)) {
    Send-V1Log 'Setup must run as administrator' -Warning
    exit 2
}

$cfg = Get-Content -LiteralPath $Config -Raw -Encoding UTF8 | ConvertFrom-Json

function Get-Cfg {
    param($Object, [string]$Name, $Default)
    if ($null -ne $Object -and $Object.PSObject.Properties[$Name]) { return $Object.$Name }
    return $Default
}
$opt = Get-Cfg $cfg 'options' $null
$look = Get-Cfg $cfg 'look' $null
$profileId = [string](Get-Cfg $cfg 'profile' 'balanced')
$O = @{
    telemetry       = [bool](Get-Cfg $opt 'telemetry' $true)
    ads             = [bool](Get-Cfg $opt 'ads' $true)
    ai              = [bool](Get-Cfg $opt 'ai' $true)
    keepStore       = [bool](Get-Cfg $opt 'keepStore' $true)
    keepXbox        = [bool](Get-Cfg $opt 'keepXbox' $true)
    keepOneDrive    = [bool](Get-Cfg $opt 'keepOneDrive' $true)
    browser         = [bool](Get-Cfg $opt 'browser' $false)
    browserName     = [string](Get-Cfg $opt 'browserName' 'firefox')
    memoryIntegrity = [bool](Get-Cfg $opt 'memoryIntegrity' $true)
    securityOnly    = [bool](Get-Cfg $opt 'securityOnly' $true)
    skipDrivers     = [bool](Get-Cfg $opt 'skipDrivers' $false)
}
$L = @{
    theme        = [string](Get-Cfg $look 'theme' 'dark')
    accent       = [string](Get-Cfg $look 'accent' '#27c6ff')
    taskbar      = [string](Get-Cfg $look 'taskbar' 'center')
    transparency = [bool](Get-Cfg $look 'transparency' $true)
    wallpaper    = [string](Get-Cfg $look 'wallpaper' 'chrome')
    live         = [bool](Get-Cfg $look 'live' $true)
}
if ($L.wallpaper -notin 'chrome', 'mono', 'void') { $L.wallpaper = 'chrome' }
if ($L.accent -notmatch '^#[0-9a-fA-F]{6}$') { $L.accent = '#27c6ff' }
if ($L.wallpaper -eq 'void') { $L.live = $false }
$hasBattery = @(Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue).Count -gt 0
Write-V1Log ('Profile {0}; options {1}; look {2}' -f $profileId, ($O | ConvertTo-Json -Compress), ($L | ConvertTo-Json -Compress))

# ---------------------------------------------------------------- plan

$steps = New-Object System.Collections.Generic.List[object]
function Add-Step {
    param([string]$Stage, [scriptblock]$Do, $Arg = $null)
    $steps.Add([pscustomobject]@{ Stage = $Stage; Do = $Do; Arg = $Arg })
}
function Add-Reg {
    # Shorthand: one registry value as one step.
    param([string]$Stage, [string]$Path, [string]$Name, [string]$Type, $Value, [string]$Say = '')
    Add-Step $Stage { param($a) Set-V1Reg -Path $a[0] -Name $a[1] -Type $a[2] -Value $a[3]; if ($a[4]) { Send-V1Log $a[4] } } @($Path, $Name, $Type, $Value, $Say)
}

$HKCU_ADV = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
$HKCU_CDM = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'
$EDGE = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'

if ($Only -eq 'all') {
    # ---------- Apps
    $apps = @(
        'Clipchamp.Clipchamp', 'Microsoft.BingNews', 'Microsoft.BingWeather', 'Microsoft.BingSearch',
        'Microsoft.GetHelp', 'Microsoft.Getstarted', 'Microsoft.MicrosoftSolitaireCollection', 'Microsoft.People',
        'Microsoft.PowerAutomateDesktop', 'Microsoft.Todos', 'Microsoft.WindowsFeedbackHub', 'Microsoft.WindowsMaps',
        'Microsoft.ZuneVideo', 'microsoft.windowscommunicationsapps', 'Microsoft.Windows.DevHome', 'MicrosoftTeams',
        'Microsoft.549981C3F5F10', 'MicrosoftCorporationII.MicrosoftFamily', 'Microsoft.Edge.GameAssist'
    )
    if ($profileId -ne 'work') { $apps += 'Microsoft.MicrosoftOfficeHub', 'Microsoft.OutlookForWindows', 'MSTeams' }
    if ($O.ai) { $apps += 'Microsoft.Copilot', 'Microsoft.Windows.Ai.Copilot.Provider' }
    if ($O.ads) { $apps += 'MicrosoftWindows.Client.WebExperience' }
    if (-not $O.keepXbox) { $apps += 'Microsoft.GamingApp', 'Microsoft.XboxGamingOverlay', 'Microsoft.XboxGameOverlay', 'Microsoft.XboxSpeechToTextOverlay' }
    if (-not $O.keepStore) { $apps += 'Microsoft.WindowsStore', 'Microsoft.StorePurchaseApp' }
    foreach ($a in $apps) { Add-Step 'Apps' { param($n) Remove-V1App -Name $n } $a }

    if (-not $O.keepOneDrive) {
        Add-Step 'Apps' {
            $ErrorActionPreference = 'Continue'   # reg.exe reports to stderr; success is judged by exit code below
            Get-Process -Name OneDrive -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
            $setup = @("$env:SystemRoot\System32\OneDriveSetup.exe", "$env:SystemRoot\SysWOW64\OneDriveSetup.exe") +
                @(Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\OneDrive\*\OneDriveSetup.exe" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }) |
                Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
            if (-not $setup) { Write-V1Log 'OneDrive is not installed'; return }
            $p = Start-Process -FilePath $setup -ArgumentList '/uninstall' -PassThru -WindowStyle Hidden
            $null = $p.Handle
            if (-not $p.WaitForExit(300000)) { Send-V1Log 'OneDrive uninstall timed out' -Warning; return }
            # Stop OneDrive installing itself for accounts created later.
            $hive = "$env:SystemDrive\Users\Default\NTUSER.DAT"
            if (Test-Path -LiteralPath $hive) {
                $null = & reg.exe load 'HKU\V1Default' $hive 2>&1
                if ($LASTEXITCODE -eq 0) {
                    try { $null = & reg.exe delete 'HKU\V1Default\Software\Microsoft\Windows\CurrentVersion\Run' /v OneDriveSetup /f 2>&1 }
                    finally { [GC]::Collect(); Start-Sleep -Milliseconds 500; $null = & reg.exe unload 'HKU\V1Default' 2>&1 }
                }
            }
            $cnt = Get-V1Counts
            $cnt.apps++
            Send-V1Log 'Removed OneDrive (your files stay in your user folder)'
        }
    }

    if ($O.browser) {
        Add-Step 'Apps' {
            param($name)
            $ids = @{ firefox = 'Mozilla.Firefox'; brave = 'Brave.Brave'; chrome = 'Google.Chrome' }
            if (-not $ids.ContainsKey($name)) { Send-V1Log ('Unknown browser {0}' -f $name) -Warning; return }
            $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
            if (-not $winget) {
                try { Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe -ErrorAction Stop } catch { Write-V1Log $_.Exception.Message }
                $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
            }
            if (-not $winget) { Send-V1Log 'winget is not ready yet, so no browser was installed. Get it from its website.' -Warning; return }
            $args2 = @('install', '--id', $ids[$name], '--exact', '--source', 'winget', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity')
            $p = Start-Process -FilePath $winget.Source -ArgumentList $args2 -PassThru -WindowStyle Hidden
            $null = $p.Handle
            if (-not $p.WaitForExit(900000)) { try { $p.Kill() } catch { $null = $_ }; Send-V1Log ('{0} install timed out' -f $name) -Warning; return }
            # 0 = installed; 0x8A150061 = already installed; 0x8A15002B = no newer version
            if ($p.ExitCode -in 0, -1978335135, -1978335189) {
                Send-V1Log ('Installed {0}. Choose it in Settings > Apps > Default apps' -f $ids[$name])
            } else {
                Send-V1Log ('{0} did not install (winget code {1}). Check your connection' -f $name, $p.ExitCode) -Warning
            }
        } $O.browserName
    }

    # ---------- Privacy
    if ($O.telemetry) {
        Add-Reg 'Privacy' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' 'AllowTelemetry' DWord 0 'Telemetry set to the lowest level'
        Add-Reg 'Privacy' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' 'DoNotShowFeedbackNotifications' DWord 1 'Feedback prompts off'
        Add-Reg 'Privacy' 'HKCU:\Software\Microsoft\Siuf\Rules' 'NumberOfSIUFInPeriod' DWord 0
        Add-Reg 'Privacy' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AdvertisingInfo' 'DisabledByGroupPolicy' DWord 1
        Add-Reg 'Privacy' 'HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo' 'Enabled' DWord 0 'Advertising ID off'
        Add-Reg 'Privacy' 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Privacy' 'TailoredExperiencesWithDiagnosticDataEnabled' DWord 0 'Tailored experiences off'
        Add-Reg 'Privacy' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'PublishUserActivities' DWord 0
        Add-Reg 'Privacy' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'UploadUserActivities' DWord 0 'Activity history off'
        Add-Reg 'Privacy' 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting' 'Disabled' DWord 1 'Error report uploads off'
        Add-Reg 'Privacy' 'HKCU:\Software\Microsoft\Input\TIPC' 'Enabled' DWord 0 'Typing data sharing off'
    }
    if ($O.ads) {
        foreach ($n in 'ContentDeliveryAllowed', 'FeatureManagementEnabled', 'OemPreInstalledAppsEnabled', 'PreInstalledAppsEnabled',
            'PreInstalledAppsEverEnabled', 'SilentInstalledAppsEnabled', 'SoftLandingEnabled', 'SubscribedContentEnabled',
            'SystemPaneSuggestionsEnabled', 'RotatingLockScreenOverlayEnabled', 'SubscribedContent-310093Enabled',
            'SubscribedContent-338387Enabled', 'SubscribedContent-338388Enabled', 'SubscribedContent-338389Enabled',
            'SubscribedContent-338393Enabled', 'SubscribedContent-353694Enabled', 'SubscribedContent-353696Enabled') {
            Add-Reg 'Privacy' $HKCU_CDM $n DWord 0
        }
        Add-Step 'Privacy' { Send-V1Log 'Suggested apps, tips and lock screen ads off' }
        Add-Reg 'Privacy' $HKCU_ADV 'ShowSyncProviderNotifications' DWord 0 'File Explorer ads off'
        Add-Reg 'Privacy' $HKCU_ADV 'Start_IrisRecommendations' DWord 0 'Start menu recommendations off'
        Add-Reg 'Privacy' $HKCU_ADV 'Start_AccountNotifications' DWord 0
        Add-Reg 'Privacy' 'HKCU:\Software\Microsoft\Windows\CurrentVersion\UserProfileEngagement' 'ScoobeSystemSettingEnabled' DWord 0 '"Finish setting up" prompts off'
        Add-Reg 'Privacy' 'HKCU:\Software\Policies\Microsoft\Windows\Explorer' 'DisableSearchBoxSuggestions' DWord 1 'Web results in Start search off'
        Add-Reg 'Privacy' 'HKCU:\Software\Microsoft\Windows\CurrentVersion\SearchSettings' 'IsDynamicSearchBoxEnabled' DWord 0 'Search highlights off'
        Add-Reg 'Privacy' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent' 'DisableWindowsConsumerFeatures' DWord 1
        Add-Reg 'Privacy' 'HKLM:\SOFTWARE\Policies\Microsoft\Dsh' 'AllowNewsAndInterests' DWord 0 'Widgets off'
        foreach ($e in @(
                @('StartupBoostEnabled', 0), @('BackgroundModeEnabled', 0), @('HideFirstRunExperience', 1),
                @('ShowRecommendationsEnabled', 0), @('EdgeShoppingAssistantEnabled', 0), @('PersonalizationReportingEnabled', 0),
                @('NewTabPageContentEnabled', 0), @('SpotlightExperiencesAndRecommendationsEnabled', 0))) {
            Add-Reg 'Privacy' $EDGE $e[0] DWord $e[1]
        }
        Add-Step 'Privacy' { Send-V1Log 'Edge: no background running, no shopping or news feed' }
    }
    if ($O.ai) {
        Add-Reg 'Privacy' 'HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot' 'TurnOffWindowsCopilot' DWord 1
        Add-Reg 'Privacy' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsCopilot' 'TurnOffWindowsCopilot' DWord 1 'Copilot off'
        Add-Reg 'Privacy' $HKCU_ADV 'ShowCopilotButton' DWord 0
        Add-Reg 'Privacy' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsAI' 'DisableAIDataAnalysis' DWord 1
        Add-Reg 'Privacy' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsAI' 'AllowRecallEnablement' DWord 0
        Add-Reg 'Privacy' 'HKCU:\Software\Policies\Microsoft\Windows\WindowsAI' 'DisableAIDataAnalysis' DWord 1 'Recall snapshots off'
        Add-Reg 'Privacy' $EDGE 'HubsSidebarEnabled' DWord 0 'Copilot sidebar in Edge off'
        Add-Step 'Privacy' {
            $f = Get-WindowsOptionalFeature -Online -FeatureName 'Recall' -ErrorAction SilentlyContinue
            if (-not $f -or $f.State -notmatch '^Enabled') { Write-V1Log 'Recall feature not enabled on this PC'; return }
            $null = Disable-WindowsOptionalFeature -Online -FeatureName 'Recall' -NoRestart -ErrorAction Stop
            $store = Get-V1Backup 'machine'
            $store['feature|Recall'] = @{ kind = 'feature'; name = 'Recall' }
            Save-V1Backup 'machine'
            Send-V1Log 'Recall removed'
        }
    }

    # ---------- Services & tasks
    if ($O.telemetry) {
        Add-Step 'Services & tasks' { Set-V1ServiceStart -Name 'DiagTrack' -Start 4 }
        Add-Step 'Services & tasks' { Set-V1ServiceStart -Name 'dmwappushservice' -Start 4 }
        foreach ($t in @(
                @('\Microsoft\Windows\Application Experience\', 'Microsoft Compatibility Appraiser'),
                @('\Microsoft\Windows\Application Experience\', 'ProgramDataUpdater'),
                @('\Microsoft\Windows\Application Experience\', 'MareBackup'),
                @('\Microsoft\Windows\Customer Experience Improvement Program\', 'Consolidator'),
                @('\Microsoft\Windows\Customer Experience Improvement Program\', 'UsbCeip'),
                @('\Microsoft\Windows\Autochk\', 'Proxy'),
                @('\Microsoft\Windows\Feedback\Siuf\', 'DmClient'),
                @('\Microsoft\Windows\Feedback\Siuf\', 'DmClientOnScenarioDownload'),
                @('\Microsoft\Windows\Windows Error Reporting\', 'QueueReporting'),
                @('\Microsoft\Windows\DiskDiagnostic\', 'Microsoft-Windows-DiskDiagnosticDataCollector'))) {
            Add-Step 'Services & tasks' { param($x) Disable-V1Task -TaskPath $x[0] -TaskName $x[1] } $t
        }
    }
    Add-Step 'Services & tasks' { Set-V1ServiceStart -Name 'MapsBroker' -Start 4 }
    Add-Step 'Services & tasks' { Set-V1ServiceStart -Name 'RetailDemo' -Start 4 }
    foreach ($t in @(@('\Microsoft\Windows\Maps\', 'MapsUpdateTask'), @('\Microsoft\Windows\Maps\', 'MapsToastTask'))) {
        Add-Step 'Services & tasks' { param($x) Disable-V1Task -TaskPath $x[0] -TaskName $x[1] } $t
    }

    # ---------- Performance
    Add-Reg 'Performance' 'HKCU:\Control Panel\Desktop' 'MenuShowDelay' String '100' 'Menus open faster'
    Add-Reg 'Performance' 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Serialize' 'StartupDelayInMSec' DWord 0 'Startup apps no longer held back after sign-in'
    Add-Reg 'Performance' 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR' 'HistoricalCaptureEnabled' DWord 0 'Background game recording off'
    Add-Reg 'Performance' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization' 'DODownloadMode' DWord 0 'Update sharing with other PCs off'
    if ($profileId -eq 'gaming') {
        if ($hasBattery) { Add-Step 'Performance' { Send-V1Log 'Laptop detected: power plan left on Balanced for battery life' } }
        else { Add-Step 'Performance' { Set-V1PowerPlan } }
        Add-Reg 'Performance' 'HKCU:\Software\Microsoft\GameBar' 'AutoGameModeEnabled' DWord 1 'Game Mode on'
        Add-Reg 'Performance' 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' 'HwSchMode' DWord 2 'Hardware-accelerated GPU scheduling on (where supported)'
        Add-Reg 'Performance' 'HKCU:\Control Panel\Mouse' 'MouseSpeed' String '0'
        Add-Reg 'Performance' 'HKCU:\Control Panel\Mouse' 'MouseThreshold1' String '0'
        Add-Reg 'Performance' 'HKCU:\Control Panel\Mouse' 'MouseThreshold2' String '0' 'Mouse acceleration off'
        $mm = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'
        Add-Reg 'Performance' $mm 'SystemResponsiveness' DWord 10
        Add-Reg 'Performance' $mm 'NetworkThrottlingIndex' DWord -1 'Multimedia scheduler tuned for games'
        Add-Reg 'Performance' "$mm\Tasks\Games" 'GPU Priority' DWord 8
        Add-Reg 'Performance' "$mm\Tasks\Games" 'Priority' DWord 6
        Add-Reg 'Performance' "$mm\Tasks\Games" 'Scheduling Category' String 'High'
        Add-Reg 'Performance' "$mm\Tasks\Games" 'SFIO Priority' String 'High' 'Games get CPU and GPU priority'
    }
    if ($profileId -eq 'minimal') {
        Add-Reg 'Performance' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy' 'LetAppsRunInBackground' DWord 2 'Store apps no longer run in the background'
    }
    if (-not $O.memoryIntegrity) {
        Add-Reg 'Performance' 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity' 'Enabled' DWord 0 'Memory integrity off after restart'
    }

    # ---------- Updates
    if ($O.securityOnly) {
        Add-Step 'Updates' {
            $cv = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
            if (-not $cv.PSObject.Properties['DisplayVersion']) { Send-V1Log 'Could not read the Windows version, feature upgrades not held' -Warning; return }
            $wu = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
            Set-V1Reg -Path $wu -Name 'ProductVersion' -Type String -Value 'Windows 11'
            Set-V1Reg -Path $wu -Name 'TargetReleaseVersion' -Type DWord -Value 1
            Set-V1Reg -Path $wu -Name 'TargetReleaseVersionInfo' -Type String -Value $cv.DisplayVersion
            Send-V1Log ('Feature upgrades held at {0}. Security updates continue' -f $cv.DisplayVersion)
        }
        Add-Reg 'Updates' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' 'NoAutoRebootWithLoggedOnUsers' DWord 1 'No surprise restarts while you are signed in'
    }
    if ($O.skipDrivers) {
        Add-Reg 'Updates' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' 'ExcludeWUDriversInQualityUpdate' DWord 1 'Driver updates from Windows Update off'
    }
}

# ---------- Appearance (setup and V1 Settings)
$light = [int]($L.theme -eq 'light')
Add-Reg 'Appearance' 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'AppsUseLightTheme' DWord $light
Add-Reg 'Appearance' 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'SystemUsesLightTheme' DWord $light ('{0} theme' -f $(if ($light) { 'Light' } else { 'Dark' }))
Add-Reg 'Appearance' 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'EnableTransparency' DWord ([int]$L.transparency) ('Transparency {0}' -f $(if ($L.transparency) { 'on' } else { 'off' }))
Add-Reg 'Appearance' 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'ColorPrevalence' DWord 0
Add-Step 'Appearance' { param($hex) Set-V1Accent -Hex $hex } $L.accent
Add-Reg 'Appearance' $HKCU_ADV 'TaskbarAl' DWord ([int]($L.taskbar -ne 'left')) ('Taskbar {0}' -f $(if ($L.taskbar -eq 'left') { 'on the left' } else { 'centred' }))
if ($Only -eq 'all') {
    Add-Reg 'Appearance' $HKCU_ADV 'ShowTaskViewButton' DWord 0 'Task View button hidden'
    Add-Reg 'Appearance' 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' 'SearchboxTaskbarMode' DWord 1 'Search shown as an icon'
    Add-Reg 'Appearance' $HKCU_ADV 'HideFileExt' DWord 0 'File extensions shown'
    Add-Reg 'Appearance' $HKCU_ADV 'LaunchTo' DWord 1 'File Explorer opens to This PC'
    Add-Reg 'Appearance' $HKCU_ADV 'UseCompactMode' DWord 1 'File Explorer compact view'
}
$image = Join-Path $Root ('wallpapers\{0}.jpg' -f $L.wallpaper)
Add-Step 'Appearance' { param($img) Set-V1Wallpaper -Image $img } $image
if ($Only -eq 'all') {
    $csp = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\PersonalizationCSP'
    Add-Reg 'Appearance' $csp 'LockScreenImagePath' String $image
    Add-Reg 'Appearance' $csp 'LockScreenImageUrl' String $image
    Add-Reg 'Appearance' $csp 'LockScreenImageStatus' DWord 1 'Lock screen matches the wallpaper'
}
Add-Step 'Appearance' {
    param($live)
    $run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    if ($live) {
        Set-V1Reg -Path $run -Name 'V1 Live Wallpaper' -Type String -Value ('"{0}" --wallpaper' -f (Join-Path $Root 'V1App.exe'))
        Send-V1Log 'Live wallpaper starts when you sign in'
    } else {
        if (Get-ItemProperty -LiteralPath $run -Name 'V1 Live Wallpaper' -ErrorAction SilentlyContinue) {
            Remove-ItemProperty -LiteralPath $run -Name 'V1 Live Wallpaper'
        }
        Send-V1Log 'Still wallpaper'
    }
} $L.live
Add-Step 'Appearance' {
    $look = @{ theme = $L.theme; accent = $L.accent; taskbar = $L.taskbar; transparency = $L.transparency; wallpaper = $L.wallpaper; live = $L.live }
    [IO.File]::WriteAllText((Join-Path (Get-V1UserDir) 'look.json'), (ConvertTo-Json $look), (New-Object Text.UTF8Encoding($false)))
    Send-V1SettingChange
}

# ---------- Finishing
if ($Only -eq 'all') {
    Add-Step 'Finishing' {
        $menu = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'
        New-V1Shortcut -Path (Join-Path $menu 'V1 Settings.lnk') -Target (Join-Path $Root 'V1App.exe') -Arguments '--settings' -Description 'Live wallpaper, appearance and undo for V1'
        Send-V1Log 'V1 Settings added to Start'
    }
    Add-Step 'Finishing' {
        $c = Get-V1Counts
        $state = [ordered]@{
            setupDone = $true; version = $Version; profile = $profileId
            appliedAt = (Get-Date).ToString('s'); config = $cfg
            summary   = @{ apps = $c.apps; tweaks = $c.tweaks; services = $c.services; tasks = $c.tasks; warnings = $c.warnings }
        }
        $path = Join-Path (Get-V1MachineDir) 'state.json'
        [IO.File]::WriteAllText($path, (ConvertTo-Json -InputObject $state -Depth 6), (New-Object Text.UTF8Encoding($false)))
        Send-V1Log ('Saved {0}' -f $path)
    }
}

# ---------------------------------------------------------------- run

$stageNames = @($steps | ForEach-Object { $_.Stage } | Select-Object -Unique)
Send-V1 @{ t = 'stages'; names = $stageNames }
$lastStage = -1
for ($i = 0; $i -lt $steps.Count; $i++) {
    $s = $steps[$i]
    $si = [array]::IndexOf($stageNames, $s.Stage)
    if ($si -ne $lastStage) { Send-V1 @{ t = 'stage'; i = $si }; $lastStage = $si }
    try {
        $null = & $s.Do $s.Arg
    } catch {
        Send-V1Log $_.Exception.Message -Warning
        Write-V1Log ('       at ' + $_.InvocationInfo.PositionMessage)
    }
    Send-V1 @{ t = 'pct'; v = [int][Math]::Floor(($i + 1) * 100 / $steps.Count) }
}

$c = Get-V1Counts
Write-V1Log ('Done: {0} apps, {1} settings, {2} services, {3} tasks, {4} skipped' -f $c.apps, $c.tweaks, $c.services, $c.tasks, $c.warnings)
Send-V1 @{ t = 'summary'; apps = $c.apps; tweaks = $c.tweaks; services = $c.services; tasks = $c.tasks; warnings = $c.warnings; reboot = ($Only -eq 'all') }
exit 0
