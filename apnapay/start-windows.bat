@echo off
REM ApnaPay - double click to start (needs Node.js 22.13+ from https://nodejs.org)
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nahi mila. Pehle https://nodejs.org se Node.js 22 LTS install karein. & pause & exit /b)
if not exist node_modules (echo Pehli baar setup ho raha hai... & call npm install --omit=dev)
start "" http://localhost:3000/admin
call npm start
pause
