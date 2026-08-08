$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$buildContext = Join-Path $systemTemp ("uninet-docker-" + [guid]::NewGuid().ToString("N"))

New-Item -ItemType Directory -Path $buildContext | Out-Null

try {
  & robocopy $projectRoot $buildContext /E /XD node_modules dist .git /XF .env *.log | Out-Null
  if ($LASTEXITCODE -gt 7) {
    throw "Could not create a hydrated Docker build context (robocopy exit code $LASTEXITCODE)."
  }

  Push-Location $buildContext
  try {
    & docker compose build backend frontend
    if ($LASTEXITCODE -ne 0) {
      throw "Docker image build failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }
}
finally {
  $resolvedContext = [IO.Path]::GetFullPath($buildContext)
  $safePrefix = $systemTemp.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $safeLeaf = Split-Path $resolvedContext -Leaf
  if ($resolvedContext.StartsWith($safePrefix, [StringComparison]::OrdinalIgnoreCase) -and $safeLeaf.StartsWith("uninet-docker-")) {
    Remove-Item -LiteralPath $resolvedContext -Recurse -Force
  }
}
