param(
  [string]$Port = "8080",
  [string]$RuleName = "MirrorOS Loop Player"
)

$ErrorActionPreference = "Stop"

if (-not (Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule `
    -DisplayName $RuleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port | Out-Null
}

Write-Host "Firewall liberado para TCP $Port"
