@echo off
REM Get the absolute path to the sam3 venv python
REM sam3-dashboard/server -> ../../sam3/.venv/Scripts/python.exe
set VENV_PYTHON=..\..\sam3\.venv\Scripts\python.exe

echo Starting SAM3 Dashboard Server using VENV: %VENV_PYTHON%
"%VENV_PYTHON%" main.py
pause
