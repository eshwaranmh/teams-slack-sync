# start-server.ps1 — launched by the TeamsSlackSync Scheduled Task at logon.
# Loads the env file, then runs the Node server in a keepalive loop
# (the Windows equivalent of launchd's KeepAlive on macOS).

$RepoDir  = $PSScriptRoot
$ServerJs = Join-Path $RepoDir 'server\server.js'
$EnvFile  = Join-Path $env:USERPROFILE '.teams-slack-sync.env'
$LogDir   = Join-Path $env:LOCALAPPDATA 'teams-slack-sync'
$LogFile  = Join-Path $LogDir 'server.log'
$ErrFile  = Join-Path $LogDir 'server.err'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Parse KEY=VALUE lines; tolerates the macOS format (export KEY="value") too,
# so a synced/home-dir-shared env file works on both platforms.
if (Test-Path $EnvFile) {
    foreach ($line in Get-Content $EnvFile) {
        if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            $name  = $Matches[1]
            $value = $Matches[2].Trim().Trim('"')
            Set-Item -Path "Env:$name" -Value $value
        }
    }
}

while ($true) {
    "$(Get-Date -Format o) starting node server" | Add-Content $LogFile
    & node $ServerJs >> $LogFile 2>> $ErrFile
    "$(Get-Date -Format o) server exited (code $LASTEXITCODE); restarting in 5s" | Add-Content $ErrFile
    Start-Sleep -Seconds 5
}
