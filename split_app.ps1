# BHS Soccer - app.js Refactor Split Script (v3 - CORRECT)
# Uses Object.assign(BHSSoccerApp.prototype, {...}) for view modules.
# The class MUST be fully defined in app.core.js before views are loaded.

$src = Get-Content -Path 'app.js' -Encoding UTF8
Write-Host "Loaded app.js: $($src.Length) lines"

function ExtractLines($startLine, $endLine) {
    return $src[($startLine - 1)..($endLine - 1)]
}

function WriteFile($path, $lines) {
    $dir = Split-Path $path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $lines | Set-Content -Path $path -Encoding UTF8
    Write-Host "  Wrote $path ($($lines.Length) lines)"
}

# ─── 1. js/data.js (lines 1-216) ─────────────────────────────────────────────
$dataLines = @(
    '/**',
    ' * BHS Soccer - Default Seed Data',
    ' * Extracted from app.js during fix/refactor branch.',
    ' */',
    ''
) + (ExtractLines 1 216)
WriteFile 'js\data.js' $dataLines

# ─── 2. js/diagrammer.js (lines 218-1153) ────────────────────────────────────
$diagrammerLines = @(
    '/**',
    ' * BHS Soccer - Tactical Pitch Diagrammer (SoccerTacticalBoard class)',
    ' * Extracted from app.js during fix/refactor branch.',
    ' */',
    ''
) + (ExtractLines 218 1153)
WriteFile 'js\diagrammer.js' $diagrammerLines

# ─── 3. js/app.core.js (lines 1154-1560 + closing brace) ────────────────────
# We include the FULL BHSSoccerApp class definition but only with the CORE methods.
# The class is closed here. View methods are added via Object.assign() below.
# We trim the last method of renderCurrentView so the class closes cleanly.
# Line 1559 ends renderCurrentView, then we add the class closing brace.
$coreBody = ExtractLines 1154 1559
$coreLines = @(
    '/**',
    ' * BHS Soccer - Core App Engine (BHSSoccerApp class)',
    ' * Contains: constructor, init, data sync, auth, routing, category dropdowns.',
    ' * Extracted from app.js during fix/refactor branch.',
    ' */',
    ''
) + $coreBody + @(
    '}',
    '',
    '// BHSSoccerApp class defined above. View modules below extend it via Object.assign.'
)
WriteFile 'js\app.core.js' $coreLines

# Helper: wrap extracted method lines in Object.assign(BHSSoccerApp.prototype, { ... })
function WrapPrototype($header, $methodLines) {
    $wrapped = @($header, '') + @('Object.assign(BHSSoccerApp.prototype, {', '')
    $wrapped += $methodLines
    $wrapped += @('', '});')
    return $wrapped
}

# ─── 4. js/views/home.view.js (lines 1561-1695) ──────────────────────────────
$methods = ExtractLines 1561 1695
$homeLines = WrapPrototype @(
    '/**',
    ' * BHS Soccer - Home View',
    ' * Adds renderHomeView() to BHSSoccerApp.prototype.',
    ' * Must be loaded AFTER js/app.core.js.',
    ' */'
) $methods
WriteFile 'js\views\home.view.js' $homeLines

# ─── 5. js/views/roster.view.js (lines 1697-1921) ────────────────────────────
$methods = ExtractLines 1697 1921
$rosterLines = WrapPrototype @(
    '/**',
    ' * BHS Soccer - Roster View & Player CRUD',
    ' * Adds renderRosterView(), filterRoster(), addPlayer(), etc. to BHSSoccerApp.prototype.',
    ' * Must be loaded AFTER js/app.core.js.',
    ' */'
) $methods
WriteFile 'js\views\roster.view.js' $rosterLines

# ─── 6. js/views/schedule.view.js (lines 1922-2166) ──────────────────────────
$methods = ExtractLines 1922 2166
$scheduleLines = WrapPrototype @(
    '/**',
    ' * BHS Soccer - Schedule View & Match CRUD',
    ' * Adds renderScheduleView(), addMatch(), deleteMatch(), etc. to BHSSoccerApp.prototype.',
    ' * Must be loaded AFTER js/app.core.js.',
    ' */'
) $methods
WriteFile 'js\views\schedule.view.js' $scheduleLines

# ─── 7. js/views/matrix.view.js (lines 2167-2252) ────────────────────────────
$methods = ExtractLines 2167 2252
$matrixLines = WrapPrototype @(
    '/**',
    ' * BHS Soccer - Competitive Matrix View',
    ' * Adds renderMatrixView() to BHSSoccerApp.prototype.',
    ' * Must be loaded AFTER js/app.core.js.',
    ' */'
) $methods
WriteFile 'js\views\matrix.view.js' $matrixLines

# ─── 8. js/views/planner.view.js (lines 2253-4622) ───────────────────────────
$methods = ExtractLines 2253 4622
$plannerLines = WrapPrototype @(
    '/**',
    ' * BHS Soccer - Coach Planner View (drills, quiz, daily thoughts, saved plans)',
    ' * Adds renderPlannerView() and all planner-related methods to BHSSoccerApp.prototype.',
    ' * Must be loaded AFTER js/app.core.js.',
    ' */'
) $methods
WriteFile 'js\views\planner.view.js' $plannerLines

# ─── 9. js/views/coaches.view.js (lines 4623-4786) ───────────────────────────
$methods = ExtractLines 4623 4786
$coachesLines = WrapPrototype @(
    '/**',
    ' * BHS Soccer - Coaches View & Auth Modal Helpers',
    ' * Adds renderCoachesView(), openAuthModal(), login/register handlers to BHSSoccerApp.prototype.',
    ' * Must be loaded AFTER js/app.core.js.',
    ' */'
) $methods
WriteFile 'js\views\coaches.view.js' $coachesLines

# ─── 10. js/admin.js (lines 4787-6103) ───────────────────────────────────────
$methods = ExtractLines 4787 6103
$adminLines = WrapPrototype @(
    '/**',
    ' * BHS Soccer - Admin Panel, Diagnostics & Import/Export',
    ' * Adds admin, diagnostic, and import/export methods to BHSSoccerApp.prototype.',
    ' * Must be loaded AFTER js/app.core.js.',
    ' */'
) $methods
WriteFile 'js\admin.js' $adminLines

# ─── 11. js/utils.js (lines 6104-6318 + initApp boot) ────────────────────────
# Lines 6104-6317 = utils methods inside class
# Line 6318 = closing } of class
# Lines 6320-6330 = initApp + DOMContentLoaded
# We wrap 6104-6317 in Object.assign, then add initApp standalone.
$utilsMethods = ExtractLines 6104 6317
$initApp = ExtractLines 6319 6330
$utilsLines = @(
    '/**',
    ' * BHS Soccer - Utilities (modals, prompt/confirm dialogs, countdown timer)',
    ' * Adds modal helpers and countdown methods to BHSSoccerApp.prototype.',
    ' * Must be loaded AFTER js/app.core.js.',
    ' * Also contains the initApp() boot function.',
    ' */',
    '',
    'Object.assign(BHSSoccerApp.prototype, {',
    ''
) + $utilsMethods + @(
    '',
    '});',
    ''
) + $initApp
WriteFile 'js\utils.js' $utilsLines

# ─── Summary ──────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host 'Module extraction complete!'
$modules = @('js\data.js','js\diagrammer.js','js\app.core.js','js\views\home.view.js',
             'js\views\roster.view.js','js\views\schedule.view.js','js\views\matrix.view.js',
             'js\views\planner.view.js','js\views\coaches.view.js','js\admin.js','js\utils.js')
$total = 0
foreach ($m in $modules) {
    $c = (Get-Content $m -Encoding UTF8).Length
    $total += $c
    Write-Host "    $m -> $c lines"
}
Write-Host ''
Write-Host "Original app.js:           $($src.Length) lines"
Write-Host "Total across all modules:  $total lines (delta = header comments added)"
