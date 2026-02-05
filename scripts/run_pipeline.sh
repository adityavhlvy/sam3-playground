#!/bin/bash
# ============================================
# Data Engine Full Pipeline - Linux/Mac
# ============================================
# Usage: ./run_pipeline.sh [dataset_path] [prompt] [output_path]
# Example: ./run_pipeline.sh ~/images "rice field" ~/exports

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAM3_ROOT="$SCRIPT_DIR/../../../sam3"
DASHBOARD_ROOT="$SCRIPT_DIR/.."

# Parse arguments
DATASET_PATH="${1:-}"
PROMPT="${2:-rice field}"
OUTPUT_PATH="${3:-$SCRIPT_DIR/../exports}"

if [ -z "$DATASET_PATH" ]; then
    echo "Usage: ./run_pipeline.sh [dataset_path] [prompt] [output_path]"
    echo "Example: ./run_pipeline.sh ~/images \"rice field\" ~/exports"
    exit 1
fi

echo "============================================"
echo "Data Engine Full Pipeline"
echo "============================================"
echo "Dataset:  $DATASET_PATH"
echo "Prompt:   $PROMPT"
echo "Output:   $OUTPUT_PATH"
echo "============================================"
echo

# Check if server is running
if ! curl -s http://localhost:8000/api/system/ > /dev/null 2>&1; then
    echo "ERROR: Dashboard server is not running!"
    echo
    echo "Start it first:"
    echo "  cd sam3-dashboard/server"
    echo "  python -m uvicorn main:app --reload"
    echo
    exit 1
fi

echo "[1/4] Server is running..."
echo

echo "[2/4] Running batch processing..."
python "$SCRIPT_DIR/data_engine_cli.py" batch --dataset_path "$DATASET_PATH" --prompt "$PROMPT"
echo

echo "[3/4] Exporting dataset..."
python "$SCRIPT_DIR/data_engine_cli.py" export --output_path "$OUTPUT_PATH" --train_split 0.8 --prompt_name "$PROMPT"
echo

echo "[4/4] Validating export..."
python -c "from pycocotools.coco import COCO; c=COCO('$OUTPUT_PATH/train/_annotations.coco.json'); print(f'Train: {len(c.anns)} annotations')"
python -c "from pycocotools.coco import COCO; c=COCO('$OUTPUT_PATH/val/_annotations.coco.json'); print(f'Val: {len(c.anns)} annotations')"
echo

echo "============================================"
echo "PIPELINE COMPLETE!"
echo "============================================"
echo
echo "Next steps:"
echo "  1. Review data in dashboard: http://localhost:3000/data-engine"
echo "  2. Update paths in: sam3/sam3/train/configs/custom/rice_field_finetune.yaml"
echo "  3. Run training:"
echo "     cd sam3"
echo "     python sam3/train/train.py -c configs/custom/rice_field_finetune.yaml --use-cluster 0 --num-gpus 1"
echo
