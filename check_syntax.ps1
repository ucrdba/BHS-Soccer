$files = @(
    'public\js\data.js',
    'public\js\diagrammer.js',
    'public\js\app.core.js',
    'public\js\views\home.view.js',
    'public\js\views\roster.view.js',
    'public\js\views\schedule.view.js',
    'public\js\views\matrix.view.js',
    'public\js\views\planner.view.js',
    'public\js\views\coaches.view.js',
    'public\js\admin.js',
    'public\js\utils.js'
)

$allOk = $true
foreach ($f in $files) {
    $result = node --check $f 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAIL: $f" -ForegroundColor Red
        Write-Host $result
        $allOk = $false
    } else {
        Write-Host "OK:   $f" -ForegroundColor Green
    }
}
if ($allOk) {
    Write-Host "`nAll modules passed syntax check!" -ForegroundColor Green
} else {
    Write-Host "`nSome modules have syntax errors - see above." -ForegroundColor Red
}
