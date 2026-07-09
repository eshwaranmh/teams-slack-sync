# uninstall.ps1 — removes the background service and stored token (Windows).
# (Remember to also remove the extension from your browser and revoke the
#  token at https://api.slack.com/apps if you're done with it.)

$TaskName = 'TeamsSlackSync'
$EnvFile  = Join-Path $env:USERPROFILE '.teams-slack-sync.env'
$StateFile = Join-Path $env:USERPROFILE '.teams-slack-sync.state.json'
$LogDir   = Join-Path $env:LOCALAPPDATA 'teams-slack-sync'

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host '[OK] Scheduled Task removed'

# Stop the running server (the keepalive loop dies with the task; node may linger)
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like '*teams-slack-sync*server.js*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Remove-Item -Force -ErrorAction SilentlyContinue $EnvFile, $StateFile
Write-Host '[OK] Token and state files removed'
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $LogDir
Write-Host 'Done. Also remove the extension from your browser.'
