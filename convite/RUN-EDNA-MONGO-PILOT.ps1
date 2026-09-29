param(
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$ExpectedBranch = 'feature/edna-mauro-mongo-pilot'

Write-Host 'Lirandzo — Piloto MongoDB Edna & Mauro' -ForegroundColor Cyan
if ($Apply) {
  Write-Host 'MODO: APPLY — altera apenas o convite edna-mauro no MongoDB.' -ForegroundColor Yellow
} else {
  Write-Host 'MODO: DRY-RUN — não altera MongoDB nem frontend.' -ForegroundColor Yellow
}

# Usa o caminho fornecido pelo próprio PowerShell para evitar problemas de encoding
# em pastas com caracteres acentuados no Windows PowerShell 5.1.
$conviteRoot = $PSScriptRoot
Set-Location $conviteRoot

$repoRoot = Split-Path $conviteRoot -Parent
$branch = (git -C $repoRoot rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne $ExpectedBranch) {
  throw "Branch incorrecta: $branch. Use $ExpectedBranch. O main não será usado por este script."
}

$status = git -C $repoRoot status --porcelain
if ($status) {
  throw "A working tree não está limpa. Faça git status e resolva as alterações antes de continuar.`n$status"
}

if (-not (Test-Path (Join-Path $conviteRoot 'node_modules'))) {
  Write-Host 'Dependências Node não encontradas. A executar npm install apenas em /convite...' -ForegroundColor DarkGray
  npm install
  if ($LASTEXITCODE -ne 0) { throw 'npm install falhou.' }
}

Write-Host ''
Write-Host 'A validar scripts...' -ForegroundColor Cyan
node --check .\edna-mauro\migrate-gifts-to-mongo.js
if ($LASTEXITCODE -ne 0) { throw 'Sintaxe inválida em migrate-gifts-to-mongo.js.' }
node --check .\edna-mauro\import-edna-mauro-to-mongodb.js
if ($LASTEXITCODE -ne 0) { throw 'Sintaxe inválida em import-edna-mauro-to-mongodb.js.' }
node --check .\edna-mauro\apply-remote-gift-frontend.js
if ($LASTEXITCODE -ne 0) { throw 'Sintaxe inválida em apply-remote-gift-frontend.js.' }

Write-Host ''
Write-Host 'A executar migração...' -ForegroundColor Cyan
if ($Apply) {
  node .\edna-mauro\migrate-gifts-to-mongo.js --apply
} else {
  node .\edna-mauro\migrate-gifts-to-mongo.js
}
if ($LASTEXITCODE -ne 0) { throw 'Migração interrompida. Ver output acima. Nenhum passo seguinte será executado.' }

if (-not $Apply) {
  Write-Host ''
  Write-Host 'DRY-RUN TERMINADO.' -ForegroundColor Green
  Write-Host 'Nenhuma alteração foi feita no MongoDB, GitHub, Render ou frontend.' -ForegroundColor Green
  Write-Host 'Se o plano estiver correcto, execute novamente: .\RUN-EDNA-MONGO-PILOT.ps1 -Apply' -ForegroundColor Cyan
  exit 0
}

Write-Host ''
Write-Host 'MongoDB migrado. A retirar a lista local do frontend Edna & Mauro...' -ForegroundColor Cyan
node .\edna-mauro\apply-remote-gift-frontend.js
if ($LASTEXITCODE -ne 0) {
  throw 'A migração MongoDB passou, mas o patch do frontend falhou. NÃO houve deploy: o frontend actual continua publicado e funcional com a lista oficial local.'
}

$frontPath = Join-Path $conviteRoot 'edna-mauro\convite.html'
$front = Get-Content -LiteralPath $frontPath -Raw -Encoding UTF8
if ($front -notmatch 'EDNA_MAURO_REMOTE_GIFT_CATALOG_V1') { throw 'Marcador do frontend remoto não encontrado.' }
if ($front -match 'OFFICIAL_GIFT_OPTIONS|mergeOfficialGiftsWithRemote|const DEMO_GIFTS =') { throw 'Ainda existe uma dependência local de presentes no convite.' }
if ($front -notmatch "LirandzoAPI\.get\('gifts'\)") { throw 'O frontend não contém o carregamento remoto esperado.' }

Write-Host ''
Write-Host 'A executar regressão global do backend...' -ForegroundColor Cyan
npm run verify
if ($LASTEXITCODE -ne 0) {
  throw 'npm run verify falhou. O frontend não será enviado. O MongoDB Edna já está em modo mongo, mas o frontend publicado anterior continua compatível com os mesmos 20 presentes.'
}

git -C $repoRoot diff --check
if ($LASTEXITCODE -ne 0) { throw 'git diff --check falhou.' }

Write-Host ''
Write-Host 'A preparar commit apenas do frontend Edna & Mauro...' -ForegroundColor Cyan
git -C $repoRoot add -- 'convite/edna-mauro/convite.html'
$staged = @(git -C $repoRoot diff --cached --name-only)
if (-not $staged -or $staged.Count -eq 0) { throw 'Nenhuma alteração de frontend ficou preparada para commit.' }
$unexpected = @($staged | Where-Object { $_ -ne 'convite/edna-mauro/convite.html' })
if ($unexpected.Count -gt 0) {
  throw "Foram detectados ficheiros inesperados no stage:`n$($unexpected -join "`n")"
}

git -C $repoRoot commit -m 'feat(edna): use MongoDB as gift catalog source'
if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar commit do frontend.' }

git -C $repoRoot push origin "HEAD:$ExpectedBranch"
if ($LASTEXITCODE -ne 0) { throw 'Falha no push da branch piloto.' }

Write-Host ''
Write-Host 'PILOTO EDNA & MAURO: ETAPA LOCAL CONCLUÍDA.' -ForegroundColor Green
Write-Host 'MongoDB: giftCatalogMode=mongo, catálogo oficial validado.' -ForegroundColor Green
Write-Host 'Frontend: dependência local removida e enviada apenas para a branch piloto.' -ForegroundColor Green
Write-Host 'main/Render: ainda não foram alterados por este script.' -ForegroundColor Green
Write-Host 'Envie o output completo para revisão antes do merge.' -ForegroundColor Cyan
