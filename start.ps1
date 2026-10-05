<#
  啟動本機伺服器並開啟瀏覽器。
  用法： .\start.ps1
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host '找不到 python，請先安裝 Python 3。' -ForegroundColor Red
    exit 1
}

$url = 'http://127.0.0.1:8770/index.html'
Write-Host "正在啟動本機伺服器 $url ..." -ForegroundColor Cyan
Start-Sleep -Milliseconds 800
Start-Process $url

python -m http.server 8770 --bind 127.0.0.1
