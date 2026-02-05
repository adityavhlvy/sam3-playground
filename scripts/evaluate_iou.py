#!/usr/bin/env python3
"""
IoU Evaluation Script for Rice Field Segmentation

Evaluates segmentation predictions against ground truth using COCO metrics
and computes mean IoU (mIoU) for the rice field class.

Usage:
    python evaluate_iou.py \
        --gt_path /path/to/_annotations.coco.json \
        --pred_path /path/to/predictions.json \
        --output_path /path/to/results.json

Example:
    python scripts/evaluate_iou.py \
        --gt_path exports/rice_field/val/_annotations.coco.json \
        --pred_path outputs/predictions.json
"""

import argparse
import json
import os
import numpy as np
from typing import Dict, List, Any

try:
    from pycocotools import mask as mask_util
    from pycocotools.coco import COCO
    from pycocotools.cocoeval import COCOeval
except ImportError:
    print("ERROR: pycocotools not found. Install with: pip install pycocotools")
    exit(1)


def decode_rle(rle: Dict) -> np.ndarray:
    """Decode RLE to binary mask."""
    if isinstance(rle, dict) and 'counts' in rle:
        if isinstance(rle['counts'], str):
            # String counts - need to encode to bytes
            rle_copy = {'counts': rle['counts'].encode('utf-8'), 'size': rle['size']}
            return mask_util.decode(rle_copy)
        return mask_util.decode(rle)
    return None


def compute_iou(mask1: np.ndarray, mask2: np.ndarray) -> float:
    """Compute IoU between two binary masks."""
    intersection = np.logical_and(mask1, mask2).sum()
    union = np.logical_or(mask1, mask2).sum()
    return float(intersection / union) if union > 0 else 0.0


def compute_dice(mask1: np.ndarray, mask2: np.ndarray) -> float:
    """Compute Dice coefficient between two binary masks."""
    intersection = np.logical_and(mask1, mask2).sum()
    total = mask1.sum() + mask2.sum()
    return float(2 * intersection / total) if total > 0 else 0.0


def match_predictions_to_gt(gt_masks: List[np.ndarray], pred_masks: List[np.ndarray], 
                            iou_threshold: float = 0.5) -> List[Dict]:
    """
    Match predictions to ground truth using Hungarian matching.
    Returns list of matches with IoU scores.
    """
    matches = []
    used_gt = set()
    
    # For each prediction, find best matching GT
    for pred_idx, pred_mask in enumerate(pred_masks):
        best_iou = 0.0
        best_gt_idx = -1
        
        for gt_idx, gt_mask in enumerate(gt_masks):
            if gt_idx in used_gt:
                continue
            
            iou = compute_iou(gt_mask, pred_mask)
            if iou > best_iou:
                best_iou = iou
                best_gt_idx = gt_idx
        
        if best_iou >= iou_threshold and best_gt_idx >= 0:
            matches.append({
                'pred_idx': pred_idx,
                'gt_idx': best_gt_idx,
                'iou': best_iou
            })
            used_gt.add(best_gt_idx)
        else:
            # False positive
            matches.append({
                'pred_idx': pred_idx,
                'gt_idx': -1,
                'iou': 0.0
            })
    
    # Unmatched GT = false negatives
    for gt_idx in range(len(gt_masks)):
        if gt_idx not in used_gt:
            matches.append({
                'pred_idx': -1,
                'gt_idx': gt_idx,
                'iou': 0.0
            })
    
    return matches


def evaluate_coco_style(gt_path: str, pred_path: str) -> Dict[str, float]:
    """
    Run COCO-style evaluation using pycocotools.
    Returns AP, AR metrics.
    """
    try:
        coco_gt = COCO(gt_path)
        coco_pred = coco_gt.loadRes(pred_path)
        
        coco_eval = COCOeval(coco_gt, coco_pred, 'segm')
        coco_eval.evaluate()
        coco_eval.accumulate()
        coco_eval.summarize()
        
        return {
            "AP": float(coco_eval.stats[0]),
            "AP50": float(coco_eval.stats[1]),
            "AP75": float(coco_eval.stats[2]),
            "AP_small": float(coco_eval.stats[3]),
            "AP_medium": float(coco_eval.stats[4]),
            "AP_large": float(coco_eval.stats[5]),
            "AR_maxDet1": float(coco_eval.stats[6]),
            "AR_maxDet10": float(coco_eval.stats[7]),
            "AR_maxDet100": float(coco_eval.stats[8]),
        }
    except Exception as e:
        print(f"Warning: COCO evaluation failed: {e}")
        return {}


def evaluate_per_image_iou(gt_path: str, pred_path: str) -> Dict[str, Any]:
    """
    Compute per-image and per-instance IoU metrics.
    """
    with open(gt_path, 'r') as f:
        gt_data = json.load(f)
    
    with open(pred_path, 'r') as f:
        pred_data = json.load(f)
    
    # Group annotations by image
    gt_by_image = {}
    for ann in gt_data.get('annotations', []):
        img_id = ann['image_id']
        if img_id not in gt_by_image:
            gt_by_image[img_id] = []
        gt_by_image[img_id].append(ann)
    
    pred_by_image = {}
    for ann in pred_data:
        img_id = ann['image_id']
        if img_id not in pred_by_image:
            pred_by_image[img_id] = []
        pred_by_image[img_id].append(ann)
    
    # Compute metrics per image
    all_ious = []
    per_image_results = []
    
    for img_id in gt_by_image:
        gt_anns = gt_by_image.get(img_id, [])
        pred_anns = pred_by_image.get(img_id, [])
        
        # Decode masks
        gt_masks = []
        for ann in gt_anns:
            mask = decode_rle(ann.get('segmentation'))
            if mask is not None:
                gt_masks.append(mask)
        
        pred_masks = []
        for ann in pred_anns:
            mask = decode_rle(ann.get('segmentation'))
            if mask is not None:
                pred_masks.append(mask)
        
        if not gt_masks:
            continue
        
        # Match and compute IoU
        matches = match_predictions_to_gt(gt_masks, pred_masks)
        
        image_ious = [m['iou'] for m in matches if m['iou'] > 0]
        if image_ious:
            all_ious.extend(image_ious)
            
            per_image_results.append({
                'image_id': img_id,
                'num_gt': len(gt_masks),
                'num_pred': len(pred_masks),
                'num_matched': len([m for m in matches if m['iou'] > 0]),
                'mean_iou': float(np.mean(image_ious)),
            })
    
    return {
        'mIoU': float(np.mean(all_ious)) if all_ious else 0.0,
        'median_iou': float(np.median(all_ious)) if all_ious else 0.0,
        'std_iou': float(np.std(all_ious)) if all_ious else 0.0,
        'min_iou': float(np.min(all_ious)) if all_ious else 0.0,
        'max_iou': float(np.max(all_ious)) if all_ious else 0.0,
        'num_instances': len(all_ious),
        'per_image_results': per_image_results[:10],  # First 10 for brevity
    }


def main():
    parser = argparse.ArgumentParser(description="Evaluate segmentation predictions")
    parser.add_argument("--gt_path", required=True, help="Path to ground truth COCO JSON")
    parser.add_argument("--pred_path", required=True, help="Path to predictions JSON")
    parser.add_argument("--output_path", default="evaluation_results.json", 
                        help="Path to save results")
    parser.add_argument("--verbose", action="store_true", help="Print detailed results")
    args = parser.parse_args()
    
    # Validate paths
    if not os.path.exists(args.gt_path):
        print(f"ERROR: Ground truth file not found: {args.gt_path}")
        return 1
    
    if not os.path.exists(args.pred_path):
        print(f"ERROR: Predictions file not found: {args.pred_path}")
        return 1
    
    print(f"Evaluating predictions...")
    print(f"  Ground truth: {args.gt_path}")
    print(f"  Predictions:  {args.pred_path}")
    print()
    
    # Run COCO-style evaluation
    print("=" * 60)
    print("COCO-style Evaluation (AP/AR)")
    print("=" * 60)
    coco_results = evaluate_coco_style(args.gt_path, args.pred_path)
    
    # Run per-image IoU evaluation
    print()
    print("=" * 60)
    print("Per-Instance IoU Evaluation")
    print("=" * 60)
    iou_results = evaluate_per_image_iou(args.gt_path, args.pred_path)
    
    print(f"\n  Mean IoU (mIoU): {iou_results['mIoU']:.4f}")
    print(f"  Median IoU:      {iou_results['median_iou']:.4f}")
    print(f"  IoU Std Dev:     {iou_results['std_iou']:.4f}")
    print(f"  IoU Range:       [{iou_results['min_iou']:.4f}, {iou_results['max_iou']:.4f}]")
    print(f"  Total Instances: {iou_results['num_instances']}")
    
    # Combine results
    results = {
        "coco_metrics": coco_results,
        "iou_metrics": iou_results,
        "summary": {
            "mAP": coco_results.get("AP", 0.0),
            "mAP50": coco_results.get("AP50", 0.0),
            "mAP75": coco_results.get("AP75", 0.0),
            "mIoU": iou_results["mIoU"],
        }
    }
    
    # Save results
    with open(args.output_path, "w") as f:
        json.dump(results, f, indent=2)
    
    print()
    print(f"Results saved to: {args.output_path}")
    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  mAP:   {results['summary']['mAP']:.4f}")
    print(f"  mAP50: {results['summary']['mAP50']:.4f}")
    print(f"  mAP75: {results['summary']['mAP75']:.4f}")
    print(f"  mIoU:  {results['summary']['mIoU']:.4f}")
    
    return 0


if __name__ == "__main__":
    exit(main())
