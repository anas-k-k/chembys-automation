@echo off
cd /d c:\Projects\Playwright\chembys-automation

:: Create logs folder if it doesn't exist
if not exist logs mkdir logs

:: Delete log files older than 3 days
forfiles /p logs /m *.log /d -3 /c "cmd /c del @path"

:: Generate log file name with date and time stamp
set "timestamp=%date:~-4%%date:~4,2%%date:~7,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "logfile=logs\run_%timestamp%.log"

:: Run Playwright tests and redirect output to log file
npx playwright test --headed > "%logfile%" 2>&1
