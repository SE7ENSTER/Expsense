@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 goto foldererror
if not exist "%~dp0firebase.json" goto incomplete
if not exist "%~dp0docs\index.html" goto incomplete
findstr /l /c:"2026.11.12-email-reset" "%~dp0docs\index.html" >nul
if errorlevel 1 goto incomplete
title EXPENSiO - Web and Rules deployment
where npx >nul 2>&1
if errorlevel 1 goto missingnode
echo EXPENSiO - Email password reset release
echo Deploying Web and Firestore Rules to https://slg-expense.web.app
echo Project: expsense-cf0a5    Hosting site: slg-expense
echo No Server Functions or billing upgrade are required by this package.
echo.
call npx --yes firebase-tools@15.35.0 deploy --only firestore:rules --project expsense-cf0a5
if errorlevel 1 goto failed
call npx --yes firebase-tools@15.35.0 deploy --only hosting --project expsense-cf0a5
if errorlevel 1 goto failed
echo.
echo EXPENSiO WEB DEPLOYMENT COMPLETE
start "" "https://slg-expense.web.app/?release=20261112-email-reset"
echo Press Ctrl+F5 in the app to refresh the previous version.
pause
exit /b 0
:incomplete
echo Required files are missing. No deployment has started.
echo Right-click the complete downloaded ZIP and choose Extract All.
echo Keep this CMD, firebase.json and the docs folder together.
pause
exit /b 1
:foldererror
echo Cannot open the extracted deployment folder. Extract the complete ZIP to a new folder.
pause
exit /b 1
:missingnode
echo Node.js / npx was not found. Use the computer where Firebase login succeeded.
pause
exit /b 1
:failed
echo Deployment stopped. Later stages were not run.
echo Keep this window open and read the first error above.
echo If login is required, run LOGIN-FIREBASE.cmd then retry this file.
pause
exit /b 1
