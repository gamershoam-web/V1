# Lyric HUD media bridge (Windows only).
# Reads "Now Playing" info from Windows media controls (the same info shown in the
# volume pop-up) and prints one JSON line per update. Works with Spotify, and with
# YouTube / YouTube Music playing in Chrome, Edge, Firefox, Opera, Brave, etc.
# Commands read from stdin: toggle | next | prev
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding  = New-Object System.Text.UTF8Encoding $false

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) {
    $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    $task.Wait(-1) | Out-Null
    $task.Result
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$mgrType   = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$mgr = Await ($mgrType::RequestAsync()) $mgrType

$stdin = [Console]::In
$pending = $stdin.ReadLineAsync()
$chosenId = $null
$last = ''

while ($true) {
    $session = $null
    try {
        $sessions = @($mgr.GetSessions())
        $playing = @($sessions | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq 'Playing' })
        # Stick with the app we were already following while it is still playing.
        $session = $playing | Where-Object { $_.SourceAppUserModelId -eq $chosenId } | Select-Object -First 1
        if (-not $session) { $session = $playing | Select-Object -First 1 }
        if (-not $session) { $session = $sessions | Where-Object { $_.SourceAppUserModelId -eq $chosenId } | Select-Object -First 1 }
        if (-not $session) { $session = $mgr.GetCurrentSession() }
    } catch { $session = $null }

    if ($pending.IsCompleted) {
        $cmd = $pending.Result
        if ($null -eq $cmd) { exit 0 }
        if ($session) {
            try {
                switch ($cmd.Trim()) {
                    'toggle' { $null = $session.TryTogglePlayPauseAsync() }
                    'next'   { $null = $session.TrySkipNextAsync() }
                    'prev'   { $null = $session.TrySkipPreviousAsync() }
                }
            } catch {}
        }
        $pending = $stdin.ReadLineAsync()
    }

    $out = $null
    if ($session) {
        try {
            $chosenId = $session.SourceAppUserModelId
            $props = Await ($session.TryGetMediaPropertiesAsync()) $propsType
            $tl = $session.GetTimelineProperties()
            $pb = $session.GetPlaybackInfo()
            $out = [ordered]@{
                active   = $true
                app      = [string]$session.SourceAppUserModelId
                title    = [string]$props.Title
                artist   = [string]$props.Artist
                album    = [string]$props.AlbumTitle
                status   = [string]$pb.PlaybackStatus
                pos      = [long]$tl.Position.TotalMilliseconds
                end      = [long]$tl.EndTime.TotalMilliseconds
                updated  = [long]$tl.LastUpdatedTime.ToUnixTimeMilliseconds()
                now      = [long][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            }
        } catch { $out = $null }
    }
    if (-not $out) { $out = [ordered]@{ active = $false; now = [long][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } }

    $json = $out | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
    Start-Sleep -Milliseconds 250
}
