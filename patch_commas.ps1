# BHS Soccer - Post-Process View Module Files
# Adds missing commas between method definitions inside Object.assign({...}) blocks
# In a class, methods are separated by nothing. In an object literal they need commas.

$viewFiles = @(
    'js\views\home.view.js',
    'js\views\roster.view.js',
    'js\views\schedule.view.js',
    'js\views\matrix.view.js',
    'js\views\planner.view.js',
    'js\views\coaches.view.js',
    'js\admin.js',
    'js\utils.js'
)

foreach ($file in $viewFiles) {
    $lines = Get-Content $file -Encoding UTF8
    $out = @()
    $len = $lines.Length

    for ($i = 0; $i -lt $len; $i++) {
        $line = $lines[$i]

        # Detect a method-closing brace: a line that is exactly "  }" (2-space indent)
        # followed (after optional blank lines) by another method definition line
        # A method opening looks like: "  methodName(" or "  async methodName("
        # We add a comma after the closing } if the next non-blank line is a method start

        if ($line -match '^\s{2}\}\s*$') {
            # Look ahead for the next non-blank line
            $nextContentLine = $null
            for ($j = $i + 1; $j -lt $len; $j++) {
                $ahead = $lines[$j]
                if ($ahead.Trim() -ne '') {
                    $nextContentLine = $ahead
                    break
                }
            }

            # If next non-blank line looks like a method start (2-space indent + identifier + ()
            # or async keyword), add a comma to the closing brace
            if ($nextContentLine -and ($nextContentLine -match '^\s{2}(async\s+)?[a-zA-Z_\$][a-zA-Z0-9_\$]*\s*\(' -or
                                       $nextContentLine -match '^\s{2}(async\s+)?[a-zA-Z_\$][a-zA-Z0-9_\$]*\s*\{')) {
                $line = $line.TrimEnd() + ','
            }
        }

        $out += $line
    }

    $out | Set-Content $file -Encoding UTF8
    Write-Host "Patched $file ($($out.Length) lines)"
}

Write-Host ''
Write-Host 'Comma patching complete.'
