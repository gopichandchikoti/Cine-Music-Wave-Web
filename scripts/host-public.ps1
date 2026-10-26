# Puts Cine Music Wave Web on the internet from this PC through a Cloudflare quick tunnel, then stops both when you press Ctrl+C.
#
#   powershell -ExecutionPolicy Bypass -File scripts\host-public.ps1
#
# A quick tunnel needs no Cloudflare account and gives a new random https://<words>.trycloudflare.com address every time, so the
# address is printed here and handed to the server as AUTH_PUBLIC_ORIGIN (sign-in checks it). For a fixed address use a named
# tunnel with your own domain (DEPLOYMENT_GUIDE.md in Study Library, steps 6 and 7).
#
# What it does and does not change:
#   - It starts the production build (`dist`, run `pnpm build` first) on 127.0.0.1 only, so nothing else on your network can reach it.
#   - It passes the production settings as process variables for this run. It never edits .env.
#   - New registrations stay closed unless you pass -AllowSignup, so only accounts that already exist can sign in.
#   - Your media on WATCH_MEDIA_DIR is served only to signed-in accounts. Serve only media you own or are licensed to share.
param(
  [int]$Port = 4046,
  [string]$Cloudflared = 'E:\New repos for portfolio\Study-entertain-library\.tools\cloudflared\cloudflared.exe',
  [switch]$AllowSignup
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $root 'dist\index.html'))) { throw 'There is no production build. Run pnpm build first.' }
if (-not (Test-Path -LiteralPath $Cloudflared)) { throw "cloudflared was not found at $Cloudflared" }
$node = (Get-Command node -ErrorAction Stop).Source

$logs = Join-Path $root 'validation\hosting'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$tunnelLog = Join-Path $logs 'tunnel.log'
$serverLog = Join-Path $logs 'server.log'
foreach ($file in @($tunnelLog, "$tunnelLog.out", $serverLog, "$serverLog.err")) { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force } }

$tunnel = $null
$server = $null
try {
  # 1. The tunnel first: its address is only known once it has connected.
  $tunnel = Start-Process -FilePath $Cloudflared -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$Port") -RedirectStandardError $tunnelLog -RedirectStandardOutput "$tunnelLog.out" -WindowStyle Hidden -PassThru
  $address = $null
  for ($waited = 0; $waited -lt 90 -and -not $address; $waited++) {
    Start-Sleep -Seconds 1
    if ($tunnel.HasExited) { throw "cloudflared stopped (exit $($tunnel.ExitCode)). See $tunnelLog" }
    $match = Select-String -LiteralPath $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($match) { $address = $match.Matches[0].Value }
  }
  if (-not $address) { throw "The tunnel did not report an address within 90 seconds. See $tunnelLog" }

  # 2. The production server, told its public address.
  $env:PORT = "$Port"
  $env:ENTERTAINMENT_SERVER_HOST = '127.0.0.1'
  $env:AUTH_PUBLIC_ORIGIN = $address
  $env:AUTH_ALLOW_PERSISTENT_SQLITE = 'true'
  $env:AUTH_TRUST_PROXY = 'loopback'
  $env:AUTH_SIGNUP_ENABLED = if ($AllowSignup) { 'true' } else { 'false' }
  $server = Start-Process -FilePath $node -ArgumentList @('scripts\serve.mjs') -WorkingDirectory $root -RedirectStandardOutput $serverLog -RedirectStandardError "$serverLog.err" -WindowStyle Hidden -PassThru

  # 3. Wait until the server answers locally and through the tunnel.
  $local = $false
  for ($waited = 0; $waited -lt 60 -and -not $local; $waited++) {
    Start-Sleep -Seconds 1
    if ($server.HasExited) { throw "The server stopped (exit $($server.ExitCode)). See $serverLog.err" }
    try { $local = (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -Headers @{ 'X-Forwarded-Proto' = 'https' } -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { $local = $false }
  }
  if (-not $local) { throw "The server did not answer on port $Port. See $serverLog.err" }
  $public = $false
  for ($waited = 0; $waited -lt 60 -and -not $public; $waited++) {
    try { $public = (Invoke-WebRequest -Uri "$address/api/health" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { Start-Sleep -Seconds 1 }
  }
  if (-not $public) { throw "$address did not answer. See $tunnelLog" }

  Write-Host ''
  Write-Host "Cine Music Wave is online at $address"
  Write-Host ("Registration is " + $(if ($AllowSignup) { 'OPEN: anyone with the address can create an account and play your media.' } else { 'closed: only existing accounts can sign in.' }))
  Write-Host 'Press Ctrl+C in this window to take it offline. The address stops working then.'
  Set-Content -LiteralPath (Join-Path $logs 'address.txt') -Value $address
  Wait-Process -Id $server.Id
} finally {
  foreach ($process in @($server, $tunnel)) { if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } }
  Remove-Item -LiteralPath (Join-Path $logs 'address.txt') -Force -ErrorAction SilentlyContinue
}
