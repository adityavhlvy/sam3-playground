#!/usr/bin/env python3
"""
Data Engine CLI - Complete Pipeline Script

This script provides a command-line interface for the entire Data Engine workflow:
1. Batch process images with SAM3
2. Export dataset in COCO format with RLE encoding
3. Run training/fine-tuning
4. Evaluate model with IoU metrics

Usage:
    python data_engine_cli.py batch --dataset_path ./images --prompt "rice field"
    python data_engine_cli.py export --output_path ./exports --train_split 0.8
    python data_engine_cli.py train --config rice_field_finetune.yaml
    python data_engine_cli.py evaluate --gt_path ./val.json --pred_path ./predictions.json
    python data_engine_cli.py full_pipeline --dataset_path ./images --prompt "rice field"
"""

import argparse
import json
import os
import sys
import time
import requests
from pathlib import Path

# Configuration
API_BASE = "http://localhost:8000/api/data-engine"
SAM3_ROOT = Path(__file__).parent.parent / "sam3"


def check_server():
    """Check if the dashboard server is running."""
    try:
        response = requests.get(f"{API_BASE.replace('/data-engine', '/system')}/", timeout=5)
        return response.status_code == 200
    except:
        return False


def batch_process(args):
    """Step 1: Batch process images with SAM3."""
    print("=" * 60)
    print("STEP 1: Batch Processing Images with SAM3")
    print("=" * 60)
    
    if not check_server():
        print("ERROR: Dashboard server is not running!")
        print("Start it with: cd sam3-dashboard/server && python -m uvicorn main:app --reload")
        return False
    
    payload = {
        "dataset_path": os.path.abspath(args.dataset_path),
        "prompt": args.prompt,
        "confidence": getattr(args, 'confidence', 0.25)
    }
    
    print(f"Processing: {payload['dataset_path']}")
    print(f"Prompt: {payload['prompt']}")
    print(f"Confidence threshold: {payload['confidence']}")
    
    try:
        response = requests.post(f"{API_BASE}/batch", json=payload, timeout=300)
        result = response.json()
        
        if result.get("status") == "success":
            print(f"✅ {result.get('message', 'Batch processing complete')}")
            return True
        else:
            print(f"❌ Error: {result.get('message', 'Unknown error')}")
            return False
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return False


def auto_verify(args):
    """Step 2: Auto-verify proposals (optional)."""
    print("=" * 60)
    print("STEP 2: Auto-Verifying Proposals")
    print("=" * 60)
    
    try:
        # Get pending proposals
        response = requests.get(f"{API_BASE}/verification_queue")
        data = response.json()
        
        total = data.get("total", 0)
        if total == 0:
            print("No pending proposals to verify.")
            return True
        
        print(f"Found {total} proposals pending verification.")
        
        if not getattr(args, 'auto_accept', False):
            print("Skipping auto-verify. Use --auto-accept to automatically accept all.")
            return True
        
        # Bulk accept all (for automated pipeline)
        queue = data.get("queue", [])
        all_ids = []
        for item in queue:
            all_ids.extend(item.get("proposal_ids", []))
        
        if all_ids:
            response = requests.post(f"{API_BASE}/bulk_verify", json={
                "proposal_ids": all_ids,
                "decision": "accept"
            })
            print(f"✅ Auto-accepted {len(all_ids)} proposals")
        
        return True
    except Exception as e:
        print(f"⚠️ Auto-verify warning: {e}")
        return True  # Non-fatal


def export_dataset(args):
    """Step 3: Export dataset in COCO format."""
    print("=" * 60)
    print("STEP 3: Exporting Dataset (COCO Format with RLE)")
    print("=" * 60)
    
    output_path = os.path.abspath(args.output_path)
    
    payload = {
        "output_path": os.path.join(output_path, "_annotations.coco.json"),
        "include_rejected": getattr(args, 'include_rejected', False),
        "train_split": getattr(args, 'train_split', 0.8),
        "prompt_name": getattr(args, 'prompt_name', 'rice field')
    }
    
    print(f"Output: {output_path}")
    print(f"Train/Val Split: {payload['train_split']:.0%} / {1-payload['train_split']:.0%}")
    print(f"Category: {payload['prompt_name']}")
    
    try:
        response = requests.post(f"{API_BASE}/export", json=payload, timeout=120)
        result = response.json()
        
        if result.get("status") == "success":
            print(f"✅ {result.get('message', 'Export complete')}")
            if "train_path" in result:
                print(f"   Train: {result['train_path']} ({result.get('train_count', '?')} annotations)")
                print(f"   Val:   {result['val_path']} ({result.get('val_count', '?')} annotations)")
            return True
        else:
            print(f"❌ Error: {result.get('message', 'Unknown error')}")
            return False
    except Exception as e:
        print(f"❌ Export failed: {e}")
        return False


def validate_export(args):
    """Validate exported COCO JSON can be loaded."""
    print("=" * 60)
    print("STEP 3.5: Validating Export Format")
    print("=" * 60)
    
    try:
        from pycocotools.coco import COCO
        
        train_path = os.path.join(args.output_path, "train", "_annotations.coco.json")
        val_path = os.path.join(args.output_path, "val", "_annotations.coco.json")
        
        for path in [train_path, val_path]:
            if os.path.exists(path):
                coco = COCO(path)
                print(f"✅ {path}")
                print(f"   Images: {len(coco.imgs)}, Annotations: {len(coco.anns)}")
        
        return True
    except ImportError:
        print("⚠️ pycocotools not installed, skipping validation")
        return True
    except Exception as e:
        print(f"❌ Validation failed: {e}")
        return False


def run_training(args):
    """Step 4: Run SAM3 fine-tuning."""
    print("=" * 60)
    print("STEP 4: Running Fine-tuning Training")
    print("=" * 60)
    
    config_path = args.config
    if not os.path.isabs(config_path):
        # Look in SAM3 configs directory
        config_path = SAM3_ROOT / "sam3" / "train" / "configs" / "custom" / config_path
    
    if not os.path.exists(config_path):
        print(f"❌ Config not found: {config_path}")
        return False
    
    print(f"Config: {config_path}")
    print(f"GPUs: {getattr(args, 'num_gpus', 1)}")
    
    # Build training command
    train_script = SAM3_ROOT / "sam3" / "train" / "train.py"
    
    if not os.path.exists(train_script):
        print(f"❌ Training script not found: {train_script}")
        print("Make sure SAM3 is properly installed.")
        return False
    
    import subprocess
    
    cmd = [
        sys.executable, str(train_script),
        "-c", str(config_path),
        "--use-cluster", "0",
        "--num-gpus", str(getattr(args, 'num_gpus', 1))
    ]
    
    print(f"Command: {' '.join(cmd)}")
    print()
    
    if getattr(args, 'dry_run', False):
        print("DRY RUN - Training command would be executed above.")
        return True
    
    try:
        result = subprocess.run(cmd, cwd=str(SAM3_ROOT))
        return result.returncode == 0
    except Exception as e:
        print(f"❌ Training failed: {e}")
        return False


def run_evaluation(args):
    """Step 5: Evaluate model predictions."""
    print("=" * 60)
    print("STEP 5: Evaluating Model Performance")
    print("=" * 60)
    
    eval_script = Path(__file__).parent / "evaluate_iou.py"
    
    if not os.path.exists(args.gt_path):
        print(f"❌ Ground truth not found: {args.gt_path}")
        return False
    
    if not os.path.exists(args.pred_path):
        print(f"❌ Predictions not found: {args.pred_path}")
        return False
    
    import subprocess
    
    output_path = getattr(args, 'eval_output', 'evaluation_results.json')
    
    cmd = [
        sys.executable, str(eval_script),
        "--gt_path", args.gt_path,
        "--pred_path", args.pred_path,
        "--output_path", output_path
    ]
    
    try:
        result = subprocess.run(cmd)
        return result.returncode == 0
    except Exception as e:
        print(f"❌ Evaluation failed: {e}")
        return False


def full_pipeline(args):
    """Run the complete pipeline from start to finish."""
    print("=" * 60)
    print("FULL PIPELINE: Data Engine → Training → Evaluation")
    print("=" * 60)
    print()
    
    start_time = time.time()
    
    # Step 1: Batch process
    if not batch_process(args):
        print("Pipeline stopped at batch processing.")
        return False
    print()
    
    # Step 2: Auto-verify (if enabled)
    if getattr(args, 'auto_accept', False):
        auto_verify(args)
    else:
        print("⚠️ Skipping auto-verify. Verify manually in dashboard or use --auto-accept")
    print()
    
    # Step 3: Export
    if not export_dataset(args):
        print("Pipeline stopped at export.")
        return False
    print()
    
    # Step 3.5: Validate
    validate_export(args)
    print()
    
    # Step 4: Training (if config provided)
    if hasattr(args, 'config') and args.config:
        if not run_training(args):
            print("Pipeline stopped at training.")
            return False
        print()
    else:
        print("⚠️ Skipping training. Provide --config to enable.")
    print()
    
    elapsed = time.time() - start_time
    print("=" * 60)
    print(f"✅ PIPELINE COMPLETE in {elapsed/60:.1f} minutes")
    print("=" * 60)
    
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Data Engine CLI - Complete SAM3 Training Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Batch process images
  python data_engine_cli.py batch --dataset_path ./images --prompt "rice field"
  
  # Export dataset with train/val split
  python data_engine_cli.py export --output_path ./exports --train_split 0.8
  
  # Run training
  python data_engine_cli.py train --config rice_field_finetune.yaml
  
  # Evaluate predictions
  python data_engine_cli.py evaluate --gt_path ./val.json --pred_path ./predictions.json
  
  # Full pipeline
  python data_engine_cli.py full_pipeline --dataset_path ./images --prompt "rice field" \\
      --output_path ./exports --config rice_field_finetune.yaml --auto-accept
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Batch command
    batch_parser = subparsers.add_parser("batch", help="Batch process images with SAM3")
    batch_parser.add_argument("--dataset_path", required=True, help="Path to images folder")
    batch_parser.add_argument("--prompt", required=True, help="Text prompt (e.g., 'rice field')")
    batch_parser.add_argument("--confidence", type=float, default=0.25, help="Confidence threshold")
    
    # Export command
    export_parser = subparsers.add_parser("export", help="Export dataset in COCO format")
    export_parser.add_argument("--output_path", required=True, help="Output directory")
    export_parser.add_argument("--train_split", type=float, default=0.8, help="Train split ratio")
    export_parser.add_argument("--prompt_name", default="rice field", help="Category name")
    export_parser.add_argument("--include_rejected", action="store_true", help="Include rejected")
    
    # Train command
    train_parser = subparsers.add_parser("train", help="Run SAM3 fine-tuning")
    train_parser.add_argument("--config", required=True, help="YAML config file")
    train_parser.add_argument("--num_gpus", type=int, default=1, help="Number of GPUs")
    train_parser.add_argument("--dry_run", action="store_true", help="Print command only")
    
    # Evaluate command
    eval_parser = subparsers.add_parser("evaluate", help="Evaluate model predictions")
    eval_parser.add_argument("--gt_path", required=True, help="Ground truth COCO JSON")
    eval_parser.add_argument("--pred_path", required=True, help="Predictions JSON")
    eval_parser.add_argument("--eval_output", default="evaluation_results.json", help="Output file")
    
    # Full pipeline command
    full_parser = subparsers.add_parser("full_pipeline", help="Run complete pipeline")
    full_parser.add_argument("--dataset_path", required=True, help="Path to images folder")
    full_parser.add_argument("--prompt", required=True, help="Text prompt")
    full_parser.add_argument("--output_path", required=True, help="Export output directory")
    full_parser.add_argument("--train_split", type=float, default=0.8, help="Train split ratio")
    full_parser.add_argument("--prompt_name", default="rice field", help="Category name")
    full_parser.add_argument("--config", help="Training config (optional)")
    full_parser.add_argument("--num_gpus", type=int, default=1, help="Number of GPUs")
    full_parser.add_argument("--auto-accept", dest="auto_accept", action="store_true", 
                            help="Auto-accept all proposals")
    full_parser.add_argument("--dry_run", action="store_true", help="Print training command only")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    commands = {
        "batch": batch_process,
        "export": export_dataset,
        "train": run_training,
        "evaluate": run_evaluation,
        "full_pipeline": full_pipeline,
    }
    
    success = commands[args.command](args)
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
