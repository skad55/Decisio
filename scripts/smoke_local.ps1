$ErrorActionPreference = 'Stop'

function Assert-Ok($condition, $message) {
  if (-not $condition) {
    throw $message
  }
}

Write-Host '[1/4] Health check'
$health = Invoke-RestMethod -Uri 'http://localhost:8000/health' -Method Get
Assert-Ok ($health.ok -eq $true) 'Health endpoint did not return ok=true'

Write-Host '[2/4] Login'
$body = @{ email = 'admin@local'; password = 'Admin123!' } | ConvertTo-Json
$tokenResp = Invoke-RestMethod -Uri 'http://localhost:8000/api/auth/login' -Method Post -ContentType 'application/json' -Body $body
Assert-Ok (-not [string]::IsNullOrWhiteSpace($tokenResp.access_token)) 'Login did not return an access token'
$token = $tokenResp.access_token
$headers = @{ Authorization = "Bearer $token" }

Write-Host '[3/4] Create smoke site'
$siteName = "Smoke Site $(Get-Date -Format 'yyyyMMddHHmmss')"
$createBody = @{ name = $siteName; address = '1 Rue de Test'; surface_m2 = 123; category = 'retail'; hours_json = '{"mon":"09:00-18:00"}' } | ConvertTo-Json
$site = Invoke-RestMethod -Uri 'http://localhost:8000/api/sites' -Method Post -Headers $headers -ContentType 'application/json' -Body $createBody
Assert-Ok ($site.name -eq $siteName) 'Created site name mismatch'

Write-Host '[4/4] List sites and validate'
$sites = Invoke-RestMethod -Uri 'http://localhost:8000/api/sites' -Method Get -Headers $headers
$found = $sites | Where-Object { $_.name -eq $siteName }
Assert-Ok ($null -ne $found) 'Created site not found in /api/sites list'

Write-Host 'SMOKE TEST OK'
