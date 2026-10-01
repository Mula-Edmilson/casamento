param(
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$ExpectedBranch = 'feature/admin-manager-builder-v2-foundation-2'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PatchScript = Join-Path $PSScriptRoot 'tools\apply-builder-v2-foundation2.js'

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Falhou: $Command $($Arguments -join ' ')"
  }
}

function Get-RepoRelativeChanges {
  $lines = @(& git -C $RepoRoot status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw 'git status falhou.' }
  return @($lines | Where-Object { $_ -and $_.Trim() })
}

Write-Host ''
Write-Host 'Lirandzo — Admin Manager Builder V2 / Foundation 2'
if ($Apply) {
  Write-Host 'MODO: APPLY — integra localmente, testa e envia apenas para a feature branch.'
} else {
  Write-Host 'MODO: CHECK — não altera ficheiros.'
}
Write-Host ''

$currentBranch = (& git -C $RepoRoot branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível identificar a branch actual.' }
if ($currentBranch -ne $ExpectedBranch) {
  throw "Branch incorrecta. Esperado '$ExpectedBranch'; actual '$currentBranch'."
}

$changes = Get-RepoRelativeChanges
if ($changes.Count -gt 0) {
  throw "A working tree não está limpa. Resolva antes de continuar:`n$($changes -join "`n")"
}

if (-not (Test-Path $PatchScript)) { throw "Patcher não encontrado: $PatchScript" }

Write-Host 'A validar baseline e marcadores...'
Invoke-Checked 'node' @($PatchScript, '--check')

if (-not $Apply) {
  Write-Host ''
  Write-Host 'CHECK CONCLUÍDO.'
  Write-Host 'Nenhuma alteração foi feita no MongoDB, GitHub main, Render ou convites publicados.'
  Write-Host 'Para aplicar na feature branch: .\RUN-BUILDER-V2-FOUNDATION2.ps1 -Apply'
  exit 0
}

Write-Host ''
Write-Host 'A aplicar integração Foundation 2 no server/package...'
Invoke-Checked 'node' @($PatchScript, '--apply')

if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules'))) {
  Write-Host 'Dependências Node não encontradas. A executar npm install sem package-lock...'
  Push-Location $PSScriptRoot
  try {
    Invoke-Checked 'npm' @('install', '--package-lock=false')
  } finally {
    Pop-Location
  }
}

Write-Host ''
Write-Host 'A validar sintaxe Foundation 2...'
Push-Location $PSScriptRoot
try {
  Invoke-Checked 'node' @('--check', 'builder-v2/content-api-v2.js')
  Invoke-Checked 'node' @('--check', 'builder-v2/mongo-models-v2.js')
  Invoke-Checked 'node' @('--check', 'tools/apply-builder-v2-foundation2.js')
  Invoke-Checked 'node' @('--check', 'server.js')

  Write-Host ''
  Write-Host 'A executar regressão global...'
  Invoke-Checked 'npm' @('run', 'verify')
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'A validar diff...'
Invoke-Checked 'git' @('-C', $RepoRoot, 'diff', '--check')

$changedFiles = @(& git -C $RepoRoot diff --name-only)
if ($LASTEXITCODE -ne 0) { throw 'git diff --name-only falhou.' }
$changedFiles = @($changedFiles | Where-Object { $_ -and $_.Trim() })
$expected = @('convite/package.json', 'convite/server.js')
$unexpected = @($changedFiles | Where-Object { $expected -notcontains $_ })
$missing = @($expected | Where-Object { $changedFiles -notcontains $_ })

if ($unexpected.Count -gt 0) {
  throw "Ficheiros inesperados alterados: $($unexpected -join ', ')"
}
if ($missing.Count -gt 0) {
  throw "Ficheiros esperados não foram alterados: $($missing -join ', ')"
}

Write-Host 'Diff limitado a server.js + package.json: PASS'

Invoke-Checked 'git' @('-C', $RepoRoot, 'add', '--', 'convite/server.js', 'convite/package.json')
Invoke-Checked 'git' @('-C', $RepoRoot, 'diff', '--cached', '--check')

$staged = @(& git -C $RepoRoot diff --cached --name-only)
if ($LASTEXITCODE -ne 0) { throw 'git diff --cached falhou.' }
$staged = @($staged | Where-Object { $_ -and $_.Trim() })
$badStaged = @($staged | Where-Object { $expected -notcontains $_ })
if ($badStaged.Count -gt 0 -or $staged.Count -ne 2) {
  throw "Staging inesperado. Actualmente: $($staged -join ', ')"
}

Invoke-Checked 'git' @('-C', $RepoRoot, 'commit', '-m', 'feat(builder-v2): wire content API into backend')
Invoke-Checked 'git' @('-C', $RepoRoot, 'push', 'origin', "HEAD:$ExpectedBranch")

Write-Host ''
Write-Host 'FOUNDATION 2 — ETAPA LOCAL CONCLUÍDA.'
Write-Host 'Branch: feature/admin-manager-builder-v2-foundation-2'
Write-Host 'Backend: Draft/Validate/Publish/Revisions/Rollback/Public Content integrado na branch.'
Write-Host 'main/Render: não foram alterados por este script.'
Write-Host 'MongoDB: nenhum convite foi activado ou migrado por este script.'
Write-Host 'Envie o output completo para revisão antes do PR/merge.'
