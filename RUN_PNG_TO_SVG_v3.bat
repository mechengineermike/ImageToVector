@echo off
cd /d "%~dp0"
where pyw >nul 2>nul
if %errorlevel%==0 (
    start "" pyw "%~dp0PNG_to_SVG_v3.py"
) else (
    py "%~dp0PNG_to_SVG_v3.py"
)
