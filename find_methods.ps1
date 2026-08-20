$lines = Get-Content 'app.js' -Encoding UTF8
$methods = @()
$total = $lines.Length
for ($idx = 1153; $idx -lt 6317; $idx++) {
    $line = $lines[$idx]
    if ($line -match '^\s{2}(async\s+)?[a-zA-Z_][a-zA-Z0-9_]*\s*\(') {
        $lineNum = $idx + 1
        $name = $line.Trim()
        $methods += "$lineNum : $name"
    }
}
# Show lines in range 4610-4800
$methods | Where-Object { [int]($_ -split ':')[0] -ge 4610 -and [int]($_ -split ':')[0] -le 4800 }
