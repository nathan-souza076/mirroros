param(
  [string]$Destination = "\\192.168.11.10\arquivos\TI\Nathan\MirrorOS"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Resolve-Path (Join-Path $scriptDir "..")

New-Item -ItemType Directory -Force -Path $Destination | Out-Null

$items = @(
  "package.json",
  "server.js",
  "public",
  "scripts",
  "media",
  "README.md"
)

foreach ($item in $items) {
  $source = Join-Path $appDir $item
  if (Test-Path $source) {
    Copy-Item -Path $source -Destination $Destination -Recurse -Force
  }
}

Write-Host "Arquivos copiados para $Destination"
Write-Host "No servidor, rode scripts\start.ps1 ou instale scripts\install-startup-task.ps1"
