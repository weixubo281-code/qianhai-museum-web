$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) { npm ci --no-audit --no-fund }
npm run dev
