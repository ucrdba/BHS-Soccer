@echo off
setlocal
rem ===========================================================================
rem  BHS Soccer - developer commands
rem
rem  Usage:  dev <command>       e.g.  dev gates
rem          dev                 (no argument shows the menu)
rem
rem  Every npm line uses CALL. npm on Windows is itself a batch file, so
rem  without CALL control never comes back and the script stops after the
rem  first npm command.
rem ===========================================================================

cd /d "%~dp0"

if "%~1"=="" goto :menu
if /i "%~1"=="dev"       goto :dev
if /i "%~1"=="start"     goto :dev
if /i "%~1"=="test"      goto :test
if /i "%~1"=="watch"     goto :watch
if /i "%~1"=="types"     goto :types
if /i "%~1"=="build"     goto :build
if /i "%~1"=="gates"     goto :gates
if /i "%~1"=="preview"   goto :preview
if /i "%~1"=="deployed"  goto :deployed
if /i "%~1"=="status"    goto :status
if /i "%~1"=="port"      goto :port
if /i "%~1"=="install"   goto :install
if /i "%~1"=="help"      goto :menu
if /i "%~1"=="/?"        goto :menu

echo Unknown command "%~1".
echo.
goto :menu


rem --- the app -------------------------------------------------------------

:dev
rem Vite is configured for port 3000 and opens the browser itself.
echo Starting the dev server on http://localhost:3000 ...
echo Press Ctrl+C to stop it.
call npm run dev
goto :end

:preview
rem Serves the built dist/, not the source. Build first.
echo Serving the last build. Run "dev build" first if dist/ is stale.
call npm run preview
goto :end


rem --- verification --------------------------------------------------------

:test
call npm test
echo.
echo Exit code: %ERRORLEVEL%    ^<-- this is the answer, not the summary line
goto :end

:watch
call npm run test:watch
goto :end

:types
call npm run typecheck
echo.
echo Exit code: %ERRORLEVEL%
goto :end

:build
call npm run build
echo.
echo Exit code: %ERRORLEVEL%
goto :end

:gates
rem The three checks that must all pass before anything is called done. They
rem cover different slices: tests do not exercise module resolution, and a
rem typecheck does not run anything.
rem
rem Read the EXIT CODES below, not the output above them. Vitest can print
rem "all passed" and still exit 1 - an unhandled promise rejection in a
rem component does exactly that, and it is a real bug.
echo.
echo === 1/3  tests ============================================
call npm test
set "RC_TEST=%ERRORLEVEL%"

echo.
echo === 2/3  typecheck ========================================
call npm run typecheck
set "RC_TYPE=%ERRORLEVEL%"

echo.
echo === 3/3  build ============================================
call npm run build
set "RC_BUILD=%ERRORLEVEL%"

echo.
echo ===========================================================
echo   tests      exit %RC_TEST%
echo   typecheck  exit %RC_TYPE%
echo   build      exit %RC_BUILD%
echo ===========================================================
if not "%RC_TEST%"=="0"  goto :gatesfail
if not "%RC_TYPE%"=="0"  goto :gatesfail
if not "%RC_BUILD%"=="0" goto :gatesfail
echo   ALL THREE PASSED
goto :end
:gatesfail
echo   NOT CLEAN - a non-zero code above is a real failure
goto :end


rem --- the world outside ---------------------------------------------------

:deployed
rem Asks the live site what commit it is running, via /version.json.
call npm run deployed
goto :end

:status
echo.
echo --- branch ------------------------------------------------
git rev-parse --abbrev-ref HEAD
echo.
echo --- last commit -------------------------------------------
git log --oneline -1
echo.
echo --- ahead / behind origin ---------------------------------
git status -sb -uno
echo.
echo --- uncommitted -------------------------------------------
git status --short
goto :end

:port
rem The dev server has a habit of being stopped out from under you. This says
rem whether anything is actually listening before you go hunting.
echo.
echo Anything listening on port 3000:
netstat -ano | findstr ":3000"
echo.
echo Nothing listed means the server is not running - "dev start" starts it.
echo To stop a stuck one, take the PID from the last column and run:
echo     taskkill /PID ^<pid^> /F
goto :end


rem --- housekeeping --------------------------------------------------------

:install
rem ci, not install: it installs exactly the lockfile and fails if package.json
rem and the lockfile disagree, which is what you want before a verification run.
call npm ci
goto :end


:menu
echo.
echo   BHS Soccer - dev ^<command^>
echo.
echo   Running it
echo     dev          start the dev server (http://localhost:3000)
echo     preview      serve the last build from dist/
echo.
echo   Checking it
echo     gates        tests + typecheck + build, with the exit codes
echo     test         the test suite once
echo     watch        the test suite, re-running on change
echo     types        vue-tsc over src/ and the templates
echo     build        typecheck then bundle to dist/
echo.
echo   Everything else
echo     status       branch, last commit, ahead/behind, uncommitted
echo     port         what is holding port 3000
echo     deployed     what commit the live site is running
echo     install      npm ci, from the lockfile
echo.
echo   Before calling anything done, run:  dev gates
echo   and read the exit codes rather than the summary lines.
echo.
goto :end

:end
endlocal
