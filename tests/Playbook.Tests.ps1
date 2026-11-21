<#
  Round-trip tests for the V1 playbook: apply -> check -> apply again -> undo -> the registry, tasks,
  power plan and features must be exactly as they were. Runs against tests\FakeWindows.ps1, so it
  never changes the machine it runs on (Windows or not).
    Invoke-Pester -Path tests
#>

BeforeAll {
    $script:Playbook = Join-Path (Split-Path -Parent $PSScriptRoot) 'payload\playbook'
    $script:Playbook = $script:Playbook -replace '\\', [IO.Path]::DirectorySeparatorChar
    $script:Apply = Join-Path $script:Playbook 'apply.ps1'
    $script:Revert = Join-Path $script:Playbook 'revert.ps1'
    $script:Base = Join-Path ([IO.Path]::GetTempPath()) ('v1-tests-' + [guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $script:Base -Force
    . (Join-Path $PSScriptRoot 'FakeWindows.ps1')
    # Records and logs go to a temp folder instead of the real ProgramData / LocalAppData.
    $script:SavedEnv = @{ ProgramData = $env:ProgramData; LOCALAPPDATA = $env:LOCALAPPDATA }
    $env:ProgramData = Join-Path $script:Base 'ProgramData'
    $env:LOCALAPPDATA = Join-Path $script:Base 'LocalAppData'
    $env:V1_TEST_ADMIN = '1'

    # A plausible Windows 11 24H2 starting point.
    $cv = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    Set-FakeValue $cv 'EditionID' 'String' 'Professional'
    Set-FakeValue $cv 'DisplayVersion' 'String' '24H2'
    Set-FakeValue $cv 'CurrentBuildNumber' 'String' '26100'
    Set-FakeValue $cv 'UBR' 'DWord' 2894
    Set-FakeValue 'HKLM:\SYSTEM\CurrentControlSet\Services\DiagTrack' 'Start' 'DWord' 2
    Set-FakeValue 'HKLM:\SYSTEM\CurrentControlSet\Services\dmwappushservice' 'Start' 'DWord' 3
    Set-FakeValue 'HKLM:\SYSTEM\CurrentControlSet\Services\MapsBroker' 'Start' 'DWord' 2
    Set-FakeValue 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' 'HwSchMode' 'DWord' 1
    $pz = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'
    Set-FakeValue $pz 'AppsUseLightTheme' 'DWord' 1
    Set-FakeValue $pz 'SystemUsesLightTheme' 'DWord' 1
    Set-FakeValue $pz 'EnableTransparency' 'DWord' 1
    $adv = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
    Set-FakeValue $adv 'TaskbarAl' 'DWord' 1
    Set-FakeValue $adv 'HideFileExt' 'DWord' 1
    Set-FakeValue 'HKCU:\Control Panel\Desktop' 'WallPaper' 'String' 'C:\Windows\Web\Wallpaper\Windows\img0.jpg'
    Set-FakeValue 'HKCU:\Control Panel\Desktop' 'MenuShowDelay' 'String' '400'
    Set-FakeValue 'HKCU:\Control Panel\Mouse' 'MouseSpeed' 'String' '1'
    Set-FakeValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Accent' 'AccentPalette' 'Binary' ([byte[]](1..32))
    foreach ($a in 'Clipchamp.Clipchamp', 'Microsoft.BingNews', 'Microsoft.Copilot', 'Microsoft.WindowsStore', 'Microsoft.GamingApp', 'MicrosoftWindows.Client.WebExperience', 'Microsoft.WindowsCalculator') { Add-FakeApp $a }
    $global:FakeTasks['\Microsoft\Windows\Customer Experience Improvement Program\|Consolidator'] = 'Ready'
    $global:FakeTasks['\Microsoft\Windows\Windows Error Reporting\|QueueReporting'] = 'Ready'
    $global:FakeTasks['\Microsoft\Windows\Maps\|MapsUpdateTask'] = 'Ready'
    $global:FakeTasks['\Microsoft\Windows\Autochk\|Proxy'] = 'Disabled'

    $script:Before = Get-FakeSnapshot
    $script:Config = Join-Path $script:Base 'choices.json'
    @{
        profile = 'gaming'
        options = @{ telemetry = $true; ads = $true; ai = $true; keepStore = $true; keepXbox = $true; keepOneDrive = $true
            browser = $false; browserName = 'firefox'; memoryIntegrity = $false; securityOnly = $true; skipDrivers = $false }
        look    = @{ wallpaper = 'chrome'; live = $true; accent = '#27c6ff'; theme = 'dark'; taskbar = 'center'; transparency = $true }
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $script:Config -Encoding UTF8

    # Every step must succeed. The one exception: off Windows, the backslash path to the wallpaper image does not resolve.
    $onWindows = ($PSVersionTable.PSEdition -eq 'Desktop') -or $IsWindows
    $script:ExpectedOffWindows = if ($onWindows) { '^\b$' } else { '^Wallpaper image missing' }
    function script:Get-Reg([string]$Path, [string]$Name) {
        $id = Get-FakeKeyId $Path
        if (-not $global:FakeReg.ContainsKey($id)) { return $null }
        $v = $global:FakeReg[$id].values[$Name.ToLowerInvariant()]
        if ($v) { return $v.Data }
        return $null
    }
    function script:Get-Warnings($run) { @($run.events | Where-Object { $_.t -eq 'log' -and -not $_.ok } | ForEach-Object { $_.msg }) }
}

AfterAll {
    Remove-Item -LiteralPath $script:Base -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item Env:\V1_TEST_ADMIN -ErrorAction SilentlyContinue
    $env:ProgramData = $script:SavedEnv.ProgramData
    $env:LOCALAPPDATA = $script:SavedEnv.LOCALAPPDATA
}

Describe 'apply.ps1 (gaming profile)' {
    BeforeAll { $script:Run = Invoke-FakeScript -Script $script:Apply -Arguments @{ Config = $script:Config } }

    It 'exits 0' { $script:Run.code | Should -Be 0 }

    It 'reports stages first, progress to 100 and a summary' {
        $script:Run.events[0].t | Should -Be 'stages'
        @($script:Run.events[0].names) | Should -Be @('Apps', 'Privacy', 'Services & tasks', 'Performance', 'Updates', 'Appearance', 'Finishing')
        $pcts = @($script:Run.events | Where-Object { $_.t -eq 'pct' } | ForEach-Object { [int]$_.v })
        $pcts[-1] | Should -Be 100
        for ($i = 1; $i -lt $pcts.Count; $i++) { $pcts[$i] | Should -BeGreaterOrEqual $pcts[$i - 1] }
        ($script:Run.events | Where-Object { $_.t -eq 'summary' }).apps | Should -BeGreaterThan 0
    }

    It 'has no unexpected skipped steps' {
        $unexpected = @(Get-Warnings $script:Run | Where-Object { $_ -notmatch $script:ExpectedOffWindows })
        $unexpected | Should -BeNullOrEmpty
    }

    It 'turns telemetry, ads and Copilot off' {
        Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' 'AllowTelemetry' | Should -Be 0
        Get-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' 'SilentInstalledAppsEnabled' | Should -Be 0
        Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsCopilot' 'TurnOffWindowsCopilot' | Should -Be 1
        $global:FakeFeatures['Recall'] | Should -Be 'Disabled'
    }

    It 'disables telemetry services and tasks' {
        Get-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\DiagTrack' 'Start' | Should -Be 4
        Get-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\MapsBroker' 'Start' | Should -Be 4
        $global:FakeTasks['\Microsoft\Windows\Customer Experience Improvement Program\|Consolidator'] | Should -Be 'Disabled'
    }

    It 'removes the right apps and keeps the kept ones' {
        $names = @($global:FakeApps | ForEach-Object { $_.Name })
        $names | Should -Not -Contain 'Clipchamp.Clipchamp'
        $names | Should -Not -Contain 'Microsoft.Copilot'
        $names | Should -Not -Contain 'MicrosoftWindows.Client.WebExperience'
        $names | Should -Contain 'Microsoft.WindowsStore'
        $names | Should -Contain 'Microsoft.GamingApp'
        $names | Should -Contain 'Microsoft.WindowsCalculator'
    }

    It 'applies gaming performance settings' {
        $global:FakePower.active | Should -Be '11111111-2222-3333-4444-555555555555'
        Get-Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile' 'NetworkThrottlingIndex' | Should -Be -1
        Get-Reg 'HKCU:\Control Panel\Mouse' 'MouseSpeed' | Should -Be '0'
        Get-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity' 'Enabled' | Should -Be 0
    }

    It 'holds feature upgrades at the current version' {
        Get-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' 'TargetReleaseVersionInfo' | Should -Be '24H2'
    }

    It 'sets theme, accent and live wallpaper' {
        Get-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'AppsUseLightTheme' | Should -Be 0
        # #27C6FF as ABGR with full alpha is 0xFFFFC627, stored as a signed DWORD
        Get-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Accent' 'AccentColorMenu' | Should -Be ([BitConverter]::ToInt32([BitConverter]::GetBytes([uint32]4294952487), 0))
        $palette = Get-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Accent' 'AccentPalette'
        $palette.Length | Should -Be 32
        @($palette[12], $palette[13], $palette[14]) | Should -Be @(0x27, 0xC6, 0xFF)
        Get-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' 'V1 Live Wallpaper' | Should -Match '--wallpaper$'
    }

    It 'tells Windows about the new colours and adds V1 Settings to Start' {
        [V1.Native]::BroadcastCalls | Should -BeGreaterThan 0
        @($global:FakeCalls | Where-Object { $_ -like 'shortcut *V1 Settings.lnk*--settings' }).Count | Should -Be 1
    }

    It 'writes state.json' {
        $state = Get-Content -Raw (Join-Path $env:ProgramData 'V1/state.json') | ConvertFrom-Json
        $state.setupDone | Should -BeTrue
        $state.profile | Should -Be 'gaming'
    }
}

Describe 'apply twice, then undo' {
    It 'second apply still exits 0' {
        (Invoke-FakeScript -Script $script:Apply -Arguments @{ Config = $script:Config }).code | Should -Be 0
    }

    It 'appearance-only run as a standard user touches nothing machine-wide' {
        $env:V1_TEST_ADMIN = '0'
        try {
            $look = Join-Path $script:Base 'look.json'
            @{ look = @{ wallpaper = 'mono'; live = $false; accent = '#ff6a5c'; theme = 'light'; taskbar = 'left'; transparency = $false } } |
                ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $look -Encoding UTF8
            $hklmBefore = @((Get-FakeSnapshot).Keys | Where-Object { $_ -like 'hklm*' }).Count
            $r = Invoke-FakeScript -Script $script:Apply -Arguments @{ Config = $look; Only = 'appearance' }
            $r.code | Should -Be 0
            @(Get-Warnings $r | Where-Object { $_ -notmatch $script:ExpectedOffWindows }) | Should -BeNullOrEmpty
            @((Get-FakeSnapshot).Keys | Where-Object { $_ -like 'hklm*' }).Count | Should -Be $hklmBefore
            Get-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'TaskbarAl' | Should -Be 0
            Get-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' 'V1 Live Wallpaper' | Should -BeNullOrEmpty
        } finally { $env:V1_TEST_ADMIN = '1' }
    }

    It 'undo exits 0 with no unexpected skipped steps' {
        $script:Undo = Invoke-FakeScript -Script $script:Revert
        $script:Undo.code | Should -Be 0
        @(Get-Warnings $script:Undo | Where-Object { $_ -notmatch $script:ExpectedOffWindows }) | Should -BeNullOrEmpty
    }

    It 'restores every registry value exactly' {
        $after = Get-FakeSnapshot
        $missing = @($script:Before.Keys | Where-Object { $after[$_] -ne $script:Before[$_] } | ForEach-Object { '{0}: {1} -> {2}' -f $_, $script:Before[$_], $after[$_] })
        $extra = @($after.Keys | Where-Object { -not $script:Before.ContainsKey($_) })
        $missing | Should -BeNullOrEmpty
        $extra | Should -BeNullOrEmpty
    }

    It 'restores tasks, power plan and Recall' {
        $global:FakeTasks['\Microsoft\Windows\Customer Experience Improvement Program\|Consolidator'] | Should -Be 'Ready'
        $global:FakeTasks['\Microsoft\Windows\Autochk\|Proxy'] | Should -Be 'Disabled'   # was already off before V1
        $global:FakePower.active | Should -Be '381b4222-f694-41f0-9685-ff5bb260df2e'
        $global:FakePower.schemes.Contains('11111111-2222-3333-4444-555555555555') | Should -BeFalse
        $global:FakeFeatures['Recall'] | Should -Be 'Enabled'
    }

    It 'archives the records so a new setup starts fresh' {
        Test-Path (Join-Path $env:ProgramData 'V1/backup.json') | Should -BeFalse
        Test-Path (Join-Path $env:ProgramData 'V1/state.json') | Should -BeFalse
        @(Get-ChildItem (Join-Path $env:ProgramData 'V1') -Filter 'backup-undone-*.json').Count | Should -Be 1
    }
}
