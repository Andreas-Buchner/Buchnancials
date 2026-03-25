$ErrorActionPreference = "Stop"

function Assert-LastExitCode {
    param(
        [string]$Step
    )

    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE."
    }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$uv = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uv) {
    throw "uv.exe was not found on the Windows PATH. Install uv on Windows or run this script from a Windows shell where uv is available."
}

$buildVenv = Join-Path $repoRoot ".venv-build-windows"
uv venv $buildVenv --allow-existing
Assert-LastExitCode "Creating Windows build environment"

$env:VIRTUAL_ENV = $buildVenv
$env:PATH = (Join-Path $buildVenv "Scripts") + [IO.Path]::PathSeparator + $env:PATH

uv sync --active --extra build
Assert-LastExitCode "Syncing Windows build environment"

$stagingRoot = Join-Path $repoRoot ".build\windows-pyinstaller"
$stagingDistRoot = Join-Path $stagingRoot "dist"
$stagingWorkRoot = Join-Path $stagingRoot "work"

if (Test-Path $stagingRoot) {
    Remove-Item -Recurse -Force $stagingRoot
}

pyinstaller packaging/Buchnancials.spec --noconfirm --clean --distpath $stagingDistRoot --workpath $stagingWorkRoot
Assert-LastExitCode "Building Windows bundle with PyInstaller"

$distRoot = Join-Path $repoRoot "dist"
$bundleDir = Join-Path $stagingDistRoot "Buchnancials"
$portableDir = Join-Path $distRoot "Buchnancials"
$zipPath = Join-Path $distRoot "Buchnancials-windows-portable.zip"

if (-not (Test-Path $distRoot)) {
    New-Item -ItemType Directory -Path $distRoot | Out-Null
}

if (-not (Test-Path $bundleDir)) {
    throw "PyInstaller did not produce the expected bundle directory: $bundleDir"
}

if (Test-Path $zipPath) {
    Remove-Item $zipPath
}

Compress-Archive -Path $bundleDir -DestinationPath $zipPath

$portableDirUpdated = $false
try {
    if (Test-Path $portableDir) {
        Remove-Item -Recurse -Force $portableDir
    }
    Copy-Item -Recurse $bundleDir $portableDir
    $portableDirUpdated = $true
}
catch {
    Write-Warning "The portable folder '$portableDir' could not be refreshed, likely because the old app is still running. The zip artifact was still created successfully."
}

Write-Host ""
Write-Host "Portable bundle created:"
Write-Host "  $zipPath"
if ($portableDirUpdated) {
    Write-Host "  $portableDir"
}
Write-Host ""
Write-Host "Share the zip file, unzip it on the target Windows machine, and start Buchnancials.exe."
