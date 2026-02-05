@echo off
REM ============================================
REM Data Engine Full Pipeline - Windows Batch
REM ============================================
REM Usage: run_pipeline.bat [dataset_path] [prompt] [output_path]
REM Example: run_pipeline.bat C:\images "rice field" C:\exports

setlocal enabledelayedexpansion

REM Configuration
set SCRIPT_DIR=%~dp0
set SAM3_ROOT=%SCRIPT_DIR%..\..\..\sam3
set DASHBOARD_ROOT=%SCRIPT_DIR%..

REM Parse arguments
set DATASET_PATH=%~1
set PROMPT=%~2
set OUTPUT_PATH=%~3

if "%DATASET_PATH%"=="" (
    echo Usage: run_pipeline.bat [dataset_path] [prompt] [output_path]
    echo Example: run_pipeline.bat C:\images "rice field" C:\exports
    exit /b 1
)

if "%PROMPT%"=="" set PROMPT=rice field
if "%OUTPUT_PATH%"=="" set OUTPUT_PATH=%SCRIPT_DIR%..\exports

echo ============================================
echo Data Engine Full Pipeline
echo ============================================
echo Dataset:  %DATASET_PATH%
echo Prompt:   %PROMPT%
echo Output:   %OUTPUT_PATH%
echo ============================================
echo.

REM Check if server is running
curl -s http://localhost:8000/api/system/ >nul 2>&1
if errorlevel 1 (
    echo ERROR: Dashboard server is not running!
    echo.
    echo Start it first:
    echo   cd sam3-dashboard\server
    echo   python -m uvicorn main:app --reload
    echo.
    exit /b 1
)

echo [1/4] Server is running...
echo.

REM Run CLI script
echo [2/4] Running batch processing...
python "%SCRIPT_DIR%data_engine_cli.py" batch --dataset_path "%DATASET_PATH%" --prompt "%PROMPT%"
if errorlevel 1 (
    echo ERROR: Batch processing failed!
    exit /b 1
)
echo.

echo [3/4] Exporting dataset...
python "%SCRIPT_DIR%data_engine_cli.py" export --output_path "%OUTPUT_PATH%" --train_split 0.8 --prompt_name "%PROMPT%"
if errorlevel 1 (
    echo ERROR: Export failed!
    exit /b 1
)
echo.

echo [4/4] Validating export...
python -c "from pycocotools.coco import COCO; c=COCO('%OUTPUT_PATH%\\train\\_annotations.coco.json'); print(f'Train: {len(c.anns)} annotations')"
python -c "from pycocotools.coco import COCO; c=COCO('%OUTPUT_PATH%\\val\\_annotations.coco.json'); print(f'Val: {len(c.anns)} annotations')"
echo.

echo ============================================
echo PIPELINE COMPLETE!
echo ============================================
echo.
echo Next steps:
echo   1. Review data in dashboard: http://localhost:3000/data-engine
echo   2. Update paths in: sam3\sam3\train\configs\custom\rice_field_finetune.yaml
echo   3. Run training:
echo      cd sam3
echo      python sam3\train\train.py -c configs\custom\rice_field_finetune.yaml --use-cluster 0 --num-gpus 1
echo.
