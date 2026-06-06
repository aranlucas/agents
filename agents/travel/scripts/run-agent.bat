@echo off
REM Navigate to the agent directory
cd /d %~dp0\..\agent

REM Activate the virtual environment
call .venv\Scripts\activate.bat

REM Run the agent
if "%PORT%"=="" set PORT=8000
uv run uvicorn travel_agent.main:app --host 0.0.0.0 --port %PORT%
