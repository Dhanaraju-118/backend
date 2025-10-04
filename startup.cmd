@echo off
npm install
npm run build
cd ..
npm install
npm run build
if exist server\public rmdir /s /q server\public
xcopy /E /I /Y dist server\public
cd server
npm install
npm run build
node combined.js