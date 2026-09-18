@echo off
title PNG to SVG v3 - Setup
echo Installing Python dependencies...
echo.
py -m pip install --upgrade pillow numpy potracer
if errorlevel 1 (
    echo.
    echo Setup failed.
    echo Make sure Python 3 is installed and that the "py" launcher works.
    echo.
    echo This app needs:
    echo   - pillow
    echo   - numpy
    echo   - potracer
    pause
    exit /b 1
)
echo.
echo Setup complete.
echo You can now double-click RUN_PNG_TO_SVG_v3.bat
pause
