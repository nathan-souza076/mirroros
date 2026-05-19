param(
  [string]$TaskName = "MirrorOS Loop Player",
  [string]$Port = "8080",
  [string]$MediaDir = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Resolve-Path (Join-Path $scriptDir "..")
$startScript = Join-Path $appDir "scripts\start.ps1"

if (-not $MediaDir) {
  $MediaDir = Join-Path $appDir "media"
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -Port `"$Port`" -MediaDir `"$MediaDir`"" `
  -WorkingDirectory $appDir

$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Force

Write-Host "Tarefa instalada: $TaskName"
Write-Host "URL esperada: http://<IP-DO-SERVIDOR>:$Port"
Write-Host "Pasta de midias: $MediaDir"
