$files = @(
    'js\data.js',
    'js\diagrammer.js',
    'js\app.core.js',
    'js\views\home.view.js',
    'js\views\roster.view.js',
    'js\views\schedule.view.js',
    'js\views\matrix.view.js',
    'js\views\planner.view.js',
    'js\views\coaches.view.js',
    'js\admin.js',
    'js\utils.js'
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
