$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$backend = Join-Path (Split-Path -Parent $root) 'Backend'
$start = Join-Path $backend 'local/Start.ps1'
$scenarios = Join-Path $backend 'local/Run-Scenarios.ps1'
if (!(Test-Path $start) -or !(Test-Path $scenarios)) {
  throw 'Configure the dedicated runner with a compatible Backend checkout beside Frontend.'
}
# Only use a dedicated isolated local stack, never a developer or production database.
& $start
& $scenarios
New-Item -ItemType Directory -Force -Path test-results | Out-Null
$server = Start-Process node -ArgumentList 'scripts/dev-api.mjs' -WorkingDirectory $root -PassThru -RedirectStandardOutput 'test-results/dev-server.log' -RedirectStandardError 'test-results/dev-server-error.log'
try {
  $ready = $false
  for ($i = 0; $i -lt 90; $i++) {
    if ($server.HasExited) { throw 'Frontend development server exited.' }
    try {
      $response = Invoke-WebRequest -Uri 'https://localhost:4200/login' -SkipCertificateCheck -TimeoutSec 3
      if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Seconds 2 }
  }
  if (!$ready) { throw 'Frontend development server did not become ready.' }
  npm run test:theme
  if ($LASTEXITCODE -ne 0) { throw 'Theme E2E failed.' }
  npm run test:e2e
  if ($LASTEXITCODE -ne 0) { throw 'Live E2E failed.' }
} finally {
  # The dev server launches a child Angular process. Terminate the whole process tree.
  if (!$server.HasExited) { taskkill /PID $server.Id /T /F | Out-Null }
}
