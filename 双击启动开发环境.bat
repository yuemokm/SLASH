@echo off
setlocal

cd /d "%~dp0"
if errorlevel 1 (
    echo Failed to open the project directory: "%~dp0"
    pause
    exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo npm was not found. Install Node.js and make sure npm is in PATH.
    pause
    exit /b 1
)

echo Starting slash from "%CD%"...
call npm run dev
set "devExitCode=%errorlevel%"
if not "%devExitCode%"=="0" (
    echo.
    echo npm run dev exited with code %devExitCode%.
    pause
)
exit /b %devExitCode%
