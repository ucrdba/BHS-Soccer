# Syntax gate for the classic scripts under public/js.
#
# tsc only sees src/, so nothing else parses these files before a browser does.
#
# Discovered by glob rather than listed: the hardcoded list this replaced named
# 11 of the 22 files, and silently skipped views/matrix-session.view.js while
# that file was being edited during the Vue migration's Phase 0.

$files = Get-ChildItem -Path 'public\js' -Recurse -Filter '*.js' |
         Sort-Object FullName |
         ForEach-Object { $_.FullName }

if (-not $files) {
    Write-Host "No .js files found under public\js - is the working directory right?" -ForegroundColor Red
    exit 1
}

$allOk = $true
foreach ($f in $files) {
    $shown = Resolve-Path -Relative $f
    $result = node --check $f 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAIL: $shown" -ForegroundColor Red
        Write-Host $result
        $allOk = $false
    } else {
        Write-Host "OK:   $shown" -ForegroundColor Green
    }
}

if ($allOk) {
    Write-Host "`nAll $($files.Count) modules passed syntax check!" -ForegroundColor Green
    exit 0
} else {
    # Exits non-zero so this can gate a script or a CI step. The version this
    # replaced always exited 0, so a failure printed in red and passed anyway.
    Write-Host "`nSome modules have syntax errors - see above." -ForegroundColor Red
    exit 1
}
