$appLines = Get-Content 'app.js' -Encoding UTF8

function WrapProto($header, $body) {
    return (@('/**', $header, ' */', '', 'Object.assign(BHSSoccerApp.prototype, {', '') + $body + @('', '});'))
}

# coaches.view.js: src lines 4623-4783 (rejectUserAccess ends at 4783)
$coachBody = $appLines[4622..4782]
$coachLines = WrapProto ' * BHS Soccer - Coaches View and Auth Modal Handlers' $coachBody
$coachLines | Set-Content 'js\views\coaches.view.js' -Encoding UTF8
Write-Host "coaches.view.js regenerated: $($coachLines.Length) lines (src 4623-4783)"

# admin.js: src lines 4785-6103 (renderPlayerAccountModalContent starts at 4785)
$adminBody = $appLines[4784..6102]
$adminLines = WrapProto ' * BHS Soccer - Admin Panel, Diagnostics and Import/Export' $adminBody
$adminLines | Set-Content 'js\admin.js' -Encoding UTF8
Write-Host "admin.js regenerated: $($adminLines.Length) lines (src 4785-6103)"

# Now re-run the comma patcher on just these two files
$files = @('js\views\coaches.view.js', 'js\admin.js')
foreach ($file in $files) {
    $lines = Get-Content $file -Encoding UTF8
    $out = @()
    $len = $lines.Length
    for ($i = 0; $i -lt $len; $i++) {
        $line = $lines[$i]
        if ($line -match '^\s{2}\}\s*$') {
            $nextContentLine = $null
            for ($j = $i + 1; $j -lt $len; $j++) {
                $ahead = $lines[$j]
                if ($ahead.Trim() -ne '') { $nextContentLine = $ahead; break }
            }
            if ($nextContentLine -and ($nextContentLine -match '^\s{2}(async\s+)?[a-zA-Z_\$][a-zA-Z0-9_\$]*\s*\(' -or
                                       $nextContentLine -match '^\s{2}(async\s+)?[a-zA-Z_\$][a-zA-Z0-9_\$]*\s*\{')) {
                $line = $line.TrimEnd() + ','
            }
        }
        $out += $line
    }
    $out | Set-Content $file -Encoding UTF8
    Write-Host "Commas patched: $file"
}

Write-Host "Done."
