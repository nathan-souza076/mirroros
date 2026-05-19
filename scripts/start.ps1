param(
  [string]$HostName = "",
  [string]$Port = "",
  [string]$MediaDir = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Resolve-Path (Join-Path $scriptDir "..")

Set-Location $appDir

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js nao foi encontrado. Instale o Node.js 18 ou superior no servidor."
}

if (-not $HostName) {
  $HostName = if ($env:HOST) { $env:HOST } else { "0.0.0.0" }
}

if (-not $Port) {
  $Port = if ($env:PORT) { $env:PORT } else { "8080" }
}

if (-not $MediaDir) {
  $MediaDir = if ($env:MEDIA_DIR) { $env:MEDIA_DIR } else { Join-Path $appDir "media" }
}

$env:HOST = $HostName
$env:PORT = $Port
$env:MEDIA_DIR = $MediaDir

node server.js
