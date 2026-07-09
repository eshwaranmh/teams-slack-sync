# setup.ps1 — one-command installer for teams-slack-sync (Windows)
#
# What it does:
#   1. Checks Node.js >= 22
#   2. Asks for your Slack user token (input hidden, validated live)
#   3. Saves it to %USERPROFILE%\.teams-slack-sync.env (owner-only ACL)
#   4. Asks where you use Teams (desktop app / browser / both) and which
#      browser(s), then tailors the remaining steps to your answers
#   5. Registers a logon Scheduled Task so the server starts on every login
#      and restarts automatically if it crashes
#   6. Verifies the server is up
#
# Usage (from the repo root):
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1

$ErrorActionPreference = 'Stop'

$RepoDir  = $PSScriptRoot
$ServerJs = Join-Path $RepoDir 'server\server.js'
$EnvFile  = Join-Path $env:USERPROFILE '.teams-slack-sync.env'
$TaskName = 'TeamsSlackSync'
$Port     = if ($env:PORT) { $env:PORT } else { '3838' }
$LogDir   = Join-Path $env:LOCALAPPDATA 'teams-slack-sync'

function Ok($msg)   { Write-Host "[OK] $msg"  -ForegroundColor Green }
function Warn($msg) { Write-Host "[!]  $msg"  -ForegroundColor Yellow }
function Fail($msg) { Write-Host "[X]  $msg"  -ForegroundColor Red; exit 1 }

Write-Host "`n=== Teams -> Slack Status Sync — Setup (Windows) ===`n" -ForegroundColor Cyan

# --- 1. Node check -----------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail 'Node.js not found. Install it first: https://nodejs.org (v22 or newer)'
}
$nodeMajor = [int](node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 22) {
    Fail "Node.js >= 22 required (you have $(node -v)). Upgrade at https://nodejs.org"
}
Ok "Node $(node -v) found"

if (-not (Test-Path $ServerJs)) {
    Fail 'server\server.js not found next to this script. Run setup.ps1 from the repo root.'
}

# --- 2. Slack token ----------------------------------------------------------
$needToken = $true
if ((Test-Path $EnvFile) -and (Select-String -Path $EnvFile -Pattern 'xoxp-' -Quiet)) {
    Warn "Existing token found at $EnvFile"
    $reuse = Read-Host 'Keep the existing token? [Y/n]'
    if ($reuse -notmatch '^[nN]') { $needToken = $false }
}

if ($needToken) {
    Write-Host ''
    Write-Host 'You need a Slack USER token (starts with xoxp-).'
    Write-Host 'How to get one (~3 minutes):'
    Write-Host '  1. https://api.slack.com/apps -> Create New App -> From scratch'
    Write-Host '  2. OAuth & Permissions -> User Token Scopes -> add: users.profile:write'
    Write-Host '  3. Install to Workspace -> Allow -> copy the xoxp- token'
    Write-Host ''
    $secure = Read-Host 'Paste your xoxp- token (input hidden)' -AsSecureString
    $token  = [System.Net.NetworkCredential]::new('', $secure).Password
    if ($token -notlike 'xoxp-*') {
        Fail "That doesn't look like a user token (must start with xoxp-)."
    }

    Write-Host 'Validating with Slack... ' -NoNewline
    try {
        $auth = Invoke-RestMethod -Method Post -Uri 'https://slack.com/api/auth.test' `
                    -Headers @{ Authorization = "Bearer $token" }
    } catch {
        Fail 'Could not reach Slack. Check your network and try again.'
    }
    if (-not $auth.ok) {
        Fail 'Slack rejected the token (auth.test failed). Re-copy it and try again.'
    }
    Ok 'Token valid'

    Set-Content -Path $EnvFile -Value "SLACK_USER_TOKEN=$token" -Encoding ASCII
    # Owner-only ACL (equivalent of chmod 600)
    icacls $EnvFile /inheritance:r /grant:r "${env:USERNAME}:F" | Out-Null
    Ok "Token saved to $EnvFile (owner-only)"
}

# --- 3. Where do you use Teams? ------------------------------------------------
Write-Host ''
Write-Host 'Where do you use Microsoft Teams?' -ForegroundColor Cyan
Write-Host '  1) Both - desktop app AND in a browser (recommended)'
Write-Host '  2) Browser (web) only'
Write-Host '  3) Desktop app only'
$modeChoice = Read-Host 'Choose [1-3, default 1]'
$Mode = switch ($modeChoice) {
    '2' { 'web' }
    '3' { 'desktop' }
    default { 'both' }
}

# Persist the choice, preserving the token and any other customizations.
$desktopEnabled = if ($Mode -eq 'web') { 'false' } else { 'true' }
$envLines = @(Get-Content $EnvFile) | Where-Object { $_ -notmatch '^(export\s+)?TEAMS_DESKTOP_ENABLED=' }
$envLines += "TEAMS_DESKTOP_ENABLED=$desktopEnabled"
Set-Content -Path $EnvFile -Value $envLines -Encoding ASCII
Ok "Mode: $Mode (saved to $EnvFile)"

# --- 4. Which browser(s)? --------------------------------------------------------
$Browsers = @()
if ($Mode -ne 'desktop') {
    Write-Host ''
    Write-Host 'Which browser(s) do you use Teams in?' -ForegroundColor Cyan
    Write-Host '  1) Chrome   2) Edge   3) Brave   4) Firefox'
    $brChoice = Read-Host 'Select one or more, comma-separated [default 1]'
    if (-not $brChoice) { $brChoice = '1' }
    foreach ($n in $brChoice -split ',') {
        switch ($n.Trim()) {
            '1' { $Browsers += 'chrome' }
            '2' { $Browsers += 'edge' }
            '3' { $Browsers += 'brave' }
            '4' { $Browsers += 'firefox' }
            default { Warn "Ignoring unknown choice: $n" }
        }
    }
    if ($Browsers.Count -eq 0) { $Browsers = @('chrome') }
    Ok "Browser(s): $($Browsers -join ', ')"
}

# --- 5. Scheduled Task (auto-start on login, keepalive) -----------------------
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$startScript = Join-Path $RepoDir 'start-server.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`""
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Description 'Syncs Slack status from Microsoft Teams call state' | Out-Null
Ok 'Scheduled Task installed — server now starts on every login'

# Kill any old instance, then start fresh
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like '*teams-slack-sync*server.js*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-ScheduledTask -TaskName $TaskName

# --- 6. Verify ----------------------------------------------------------------
Write-Host 'Waiting for server' -NoNewline
$up = $false
foreach ($i in 1..10) {
    Start-Sleep -Seconds 1
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 2
        if ($health.ok) { $up = $true; break }
    } catch { }
    Write-Host '.' -NoNewline
}
Write-Host ''
if ($up) {
    Ok "Server is up: http://localhost:$Port  (logs: $LogDir\server.log)"
} else {
    Fail "Server didn't come up. Check $LogDir\server.log and $LogDir\server.err"
}

# --- 7. Next steps (tailored to your answers) -------------------------------------
if ($Mode -ne 'web') {
    Write-Host "`n=== Teams DESKTOP app — one-time pairing ===`n" -ForegroundColor Cyan
    Write-Host '  1. Teams -> Settings -> Privacy -> Third-party app API -> Manage API -> enable'
    Write-Host '  2. Join any meeting (Calendar -> Meet now is fine)'
    Write-Host "  3. Approve the 'TeamsSlackSync wants to connect' prompt in Teams (one time)"
    Write-Host ''
}

$chromium = $Browsers | Where-Object { $_ -in 'chrome', 'edge', 'brave' }
if ($chromium) {
    Write-Host "`n=== Load the extension (Chromium browsers) ===`n" -ForegroundColor Cyan
    if ('chrome' -in $Browsers) { Write-Host '  Chrome:  open chrome://extensions' }
    if ('edge'   -in $Browsers) { Write-Host '  Edge:    open edge://extensions' }
    if ('brave'  -in $Browsers) { Write-Host '  Brave:   open brave://extensions' }
    Write-Host '  Then: enable Developer mode'
    Write-Host "        Load unpacked -> select:  $RepoDir\extension"
    Write-Host '        Reload your Teams tab (https://teams.cloud.microsoft/)'
    Write-Host ''
}

if ('firefox' -in $Browsers) {
    Write-Host "`n=== Firefox — build + sign (free, ~5 min) ===`n" -ForegroundColor Cyan
    $distDir = Join-Path $RepoDir 'dist'
    $zipPath = Join-Path $distDir 'teams-slack-sync-firefox.zip'
    try {
        New-Item -ItemType Directory -Force -Path $distDir | Out-Null
        # AMO wants manifest.json at the zip ROOT, so zip the folder contents.
        Compress-Archive -Path (Join-Path $RepoDir 'extension\*') -DestinationPath $zipPath -Force
        Ok "Built $zipPath"
    } catch {
        Warn "Couldn't build the zip automatically: $($_.Exception.Message)"
    }
    Write-Host '  1. https://addons.mozilla.org/developers/ -> Submit a New Add-on'
    Write-Host "     -> 'On your own' (unlisted) -> upload dist\teams-slack-sync-firefox.zip"
    Write-Host '  2. Download the signed .xpi (~1-5 min) -> drag it into Firefox -> Add'
    Write-Host '  3. about:addons -> the extension -> Permissions -> allow localhost access'
    Write-Host '  4. Reload your Teams tab'
    Write-Host '  (Quick test without signing: about:debugging -> Load Temporary Add-on)'
    Write-Host ''
}

Write-Host "Test: join a 'Meet now' meeting — your Slack status should flip to"
Write-Host "'In a Teams call' within ~20s, and clear when you leave."
Write-Host ''
Write-Host 'Manage the background service:'
Write-Host "  Stop-ScheduledTask  -TaskName $TaskName   # stop"
Write-Host "  Start-ScheduledTask -TaskName $TaskName   # start"
Write-Host "  Get-Content -Wait $LogDir\server.log      # watch logs"
Write-Host ''
Write-Host 'Change these choices anytime by re-running .\setup.ps1'
Write-Host ''
