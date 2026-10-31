# Compile RapidTunes et produit les deux installateurs dans release\ :
#   RapidTunes_<version>_x64-setup.exe    installateur RapidTunes (interface aux couleurs de l'application)
#   RapidTunes_<version>_x64-classic.exe  installateur NSIS classique (sans personnalisation)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host "Version $version"

# 1. Application + installateur NSIS classique
npm run tauri:build
if ($LASTEXITCODE -ne 0) { throw "Build de l'application échoué." }

New-Item -ItemType Directory -Force release | Out-Null
Copy-Item "src-tauri\target\release\rapidtunes.exe" "release\RapidTunes.exe" -Force
Copy-Item "src-tauri\target\release\bundle\nsis\RapidTunes_${version}_x64-setup.exe" "release\RapidTunes_${version}_x64-classic.exe" -Force

# 2. Contenu embarqué dans l'installateur personnalisé
$payload = "installer\src-tauri\payload"
Copy-Item "src-tauri\target\release\rapidtunes.exe" "$payload\RapidTunes.exe" -Force
Copy-Item "src-tauri\target\release\rapidtunes-cli.exe" "$payload\rapidtunes-cli.exe" -Force

# 3. Même version que l'application
$utf8 = New-Object System.Text.UTF8Encoding $false
$cargoPath = Join-Path $root "installer\src-tauri\Cargo.toml"
$confPath = Join-Path $root "installer\src-tauri\tauri.conf.json"
[IO.File]::WriteAllText($cargoPath, ([IO.File]::ReadAllText($cargoPath) -replace '(?m)^version = ".*"', "version = `"$version`""), $utf8)
[IO.File]::WriteAllText($confPath, ([IO.File]::ReadAllText($confPath) -replace '"version": ".*"', "`"version`": `"$version`""), $utf8)

# 4. Installateur personnalisé
Push-Location installer
& "..\node_modules\.bin\tauri.cmd" build --no-bundle
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { throw "Build de l'installateur échoué." }

Copy-Item "installer\src-tauri\target\release\rapidtunes-setup.exe" "release\RapidTunes_${version}_x64-setup.exe" -Force
Write-Host "Terminé : release\RapidTunes_${version}_x64-setup.exe et release\RapidTunes_${version}_x64-classic.exe"
