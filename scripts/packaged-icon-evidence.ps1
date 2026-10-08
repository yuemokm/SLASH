param(
    [Parameter(Mandatory = $true)]
    [string[]]$ExecutablePaths,
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$ExpectedBrandPath
)

# Read executable resources through the Windows shell icon API. This never
# launches, edits or signs an executable. Pass the newly packaged paths only.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$resolvedProject = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not $ExpectedBrandPath) {
    $ExpectedBrandPath = Join-Path $resolvedProject 'public/brand/slash.png'
}
$resolvedBrand = (Resolve-Path -LiteralPath $ExpectedBrandPath).Path
$outputDir = Join-Path $resolvedProject ('.test-data/packaged-icons-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $outputDir | Out-Null
$results = @()
$index = 0
foreach ($executable in $ExecutablePaths) {
    $resolvedExe = (Resolve-Path -LiteralPath $executable).Path
    $metadata = Get-Item -LiteralPath $resolvedExe
    if ($metadata.Extension -ne '.exe') { throw "Expected an .exe: $resolvedExe" }
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($resolvedExe)
    if ($null -eq $icon) { throw "Windows returned no associated icon: $resolvedExe" }
    $bitmap = $icon.ToBitmap()
    $pngName = ('{0:D2}-{1}-associated-icon.png' -f $index, $metadata.BaseName)
    $pngPath = Join-Path $outputDir $pngName
    try {
        $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $results += [ordered]@{
            executable = $resolvedExe
            executableSha256 = (Get-FileHash -LiteralPath $resolvedExe -Algorithm SHA256).Hash
            executableLastWriteUtc = $metadata.LastWriteTimeUtc.ToString('o')
            iconPng = $pngPath
            width = $bitmap.Width
            height = $bitmap.Height
            verification = 'Actual Windows ExtractAssociatedIcon result; visual comparison is required'
        }
    } finally {
        $bitmap.Dispose()
        $icon.Dispose()
    }
    $index += 1
}
Copy-Item -LiteralPath $resolvedBrand -Destination (Join-Path $outputDir 'expected-brand.png')
$evidence = [ordered]@{
    method = 'System.Drawing.Icon.ExtractAssociatedIcon on actual executable files (read only)'
    capturedAtUtc = [DateTime]::UtcNow.ToString('o')
    output = $outputDir
    expectedBrand = $resolvedBrand
    expectedBrandSha256 = (Get-FileHash -LiteralPath $resolvedBrand -Algorithm SHA256).Hash
    icons = $results
}
$json = $evidence | ConvertTo-Json -Depth 8
Set-Content -LiteralPath (Join-Path $outputDir 'result.json') -Value $json -Encoding utf8
Write-Output $json
