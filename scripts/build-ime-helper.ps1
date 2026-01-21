$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = Join-Path $root "..\\electron\\ime-helper\\ImeHelper.csproj"
$publishDir = Join-Path $root "..\\electron\\ime-helper\\bin\\Release\\net6.0\\win-x64\\publish"
$targetExe = Join-Path $root "..\\electron\\ime-helper\\ime-helper.exe"

dotnet publish $project -c Release

if (-not (Test-Path $publishDir)) {
  throw "Publish directory not found: $publishDir"
}

$exe = Get-ChildItem -Path $publishDir -Filter *.exe | Select-Object -First 1
if (-not $exe) {
  throw "Published exe not found in $publishDir"
}

Copy-Item $exe.FullName $targetExe -Force
Write-Host "IME helper built: $targetExe"
