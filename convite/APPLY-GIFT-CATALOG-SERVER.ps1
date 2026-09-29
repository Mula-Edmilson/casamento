$ErrorActionPreference = 'Stop'

$ExpectedBranch = 'feature/gift-catalog-mongo'
$OriginalSha256 = '6b5f705ed0e3aa357109e8331e5af44de5d5b6b2fe123cbd468583fbce3894e1'
$PatchedSha256  = '53d01fe184ffba91670263f89c7564c9acfe15f6ea3cced0ac68b09f5c517d75'

Write-Host 'Lirandzo - aplicar backend do catalogo MongoDB' -ForegroundColor Cyan
Write-Host 'Este script recusa executar no main e so pode fazer push para a branch de feature.' -ForegroundColor DarkGray

$repoRoot = (git rev-parse --show-toplevel 2>$null).Trim()
if (-not $repoRoot) { throw 'Execute este script dentro de um clone Git do repositorio Mula-Edmilson/casamento.' }

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne $ExpectedBranch) {
  throw "Branch incorrecta: $branch. Mude primeiro para $ExpectedBranch. O main nao sera alterado por este script."
}

Set-Location (Join-Path $repoRoot 'convite')
$serverPath = Join-Path (Get-Location) 'server.js'
$patchPath = Join-Path (Get-Location) 'tools\server-gift-catalog.patch'

if (-not (Test-Path $serverPath)) { throw 'server.js nao encontrado.' }
if (-not (Test-Path $patchPath)) { throw 'Patch auditado nao encontrado em tools\server-gift-catalog.patch.' }

$currentHash = (Get-FileHash $serverPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "SHA256 actual de server.js: $currentHash"

if ($currentHash -eq $PatchedSha256) {
  Write-Host 'server.js ja corresponde exactamente a versao validada na Fase 4.' -ForegroundColor Green
} elseif ($currentHash -eq $OriginalSha256) {
  Write-Host 'Baseline de producao confirmado. A validar o patch...' -ForegroundColor Yellow
  git apply --check --ignore-space-change --whitespace=nowarn 'tools/server-gift-catalog.patch'
  if ($LASTEXITCODE -ne 0) { throw 'git apply --check falhou. Nenhuma alteracao foi aplicada.' }

  git apply --ignore-space-change --whitespace=nowarn 'tools/server-gift-catalog.patch'
  if ($LASTEXITCODE -ne 0) { throw 'git apply falhou.' }

  $afterHash = (Get-FileHash $serverPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "SHA256 depois do patch: $afterHash"
  if ($afterHash -ne $PatchedSha256) {
    git checkout -- server.js
    throw "Hash inesperado depois do patch. server.js foi revertido. Esperado: $PatchedSha256"
  }
} else {
  throw "server.js nao corresponde nem ao baseline original nem a versao validada. Nenhuma alteracao sera feita."
}

Write-Host 'A executar verificacoes da branch...' -ForegroundColor Cyan
npm run verify
if ($LASTEXITCODE -ne 0) { throw 'npm run verify falhou. O ficheiro nao sera enviado.' }

$finalHash = (Get-FileHash $serverPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($finalHash -ne $PatchedSha256) { throw 'O hash de server.js mudou durante os testes. Push cancelado.' }

$dirtyServer = git status --porcelain -- server.js
if ($dirtyServer) {
  git add server.js
  git commit -m 'feat(gifts): integrate MongoDB gift catalog backend'
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar commit.' }
} else {
  Write-Host 'Nao ha alteracao pendente em server.js para commit.' -ForegroundColor DarkGray
}

git push origin "HEAD:$ExpectedBranch"
if ($LASTEXITCODE -ne 0) { throw 'Falha no push da branch de feature.' }

Write-Host ''
Write-Host 'BACKEND APLICADO COM SUCESSO NA BRANCH DE FEATURE.' -ForegroundColor Green
Write-Host 'O branch main nao foi alterado.' -ForegroundColor Green
