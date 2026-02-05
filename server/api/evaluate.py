"""
Evaluation API - Run IoU evaluation and compare predictions with GT
"""
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
import os
import json
import tempfile
from typing import Optional, List, Dict, Any
import numpy as np

router = APIRouter()

# Store evaluation results in memory
_evaluation_results: Dict[str, Any] = {}


class EvaluateRequest(BaseModel):
    gt_path: str  # Path to ground truth COCO JSON
    pred_path: str  # Path to predictions JSON
    evaluation_name: Optional[str] = "default"


class EvaluateFromDataEngineRequest(BaseModel):
    dataset_path: str  # Path to exported dataset from Data Engine
    model_name: Optional[str] = "current"  # Model to use for inference
    prompt: str = "rice field"


def decode_rle(rle: Dict) -> np.ndarray:
    """Decode RLE to binary mask."""
    try:
        from pycocotools import mask as mask_util
        if isinstance(rle, dict) and 'counts' in rle:
            if isinstance(rle['counts'], str):
                rle_copy = {'counts': rle['counts'].encode('utf-8'), 'size': rle['size']}
                return mask_util.decode(rle_copy)
            return mask_util.decode(rle)
    except Exception as e:
        print(f"RLE decode error: {e}")
    return None


def compute_iou(mask1: np.ndarray, mask2: np.ndarray) -> float:
    """Compute IoU between two binary masks."""
    intersection = np.logical_and(mask1, mask2).sum()
    union = np.logical_or(mask1, mask2).sum()
    return float(intersection / union) if union > 0 else 0.0


@router.post("/run")
def run_evaluation(req: EvaluateRequest):
    """
    Run IoU evaluation comparing predictions against ground truth.
    """
    print(f"[EVAL] Starting evaluation: {req.evaluation_name}")
    print(f"[EVAL] GT: {req.gt_path}")
    print(f"[EVAL] Pred: {req.pred_path}")
    
    # Validate paths
    if not os.path.exists(req.gt_path):
        raise HTTPException(status_code=404, detail=f"Ground truth not found: {req.gt_path}")
    
    if not os.path.exists(req.pred_path):
        raise HTTPException(status_code=404, detail=f"Predictions not found: {req.pred_path}")
    
    try:
        # Load data
        with open(req.gt_path, 'r') as f:
            gt_data = json.load(f)
        
        with open(req.pred_path, 'r') as f:
            pred_data = json.load(f)
        
        # Handle different prediction formats
        if isinstance(pred_data, dict) and 'annotations' in pred_data:
            predictions = pred_data['annotations']
        elif isinstance(pred_data, list):
            predictions = pred_data
        else:
            raise HTTPException(status_code=400, detail="Invalid predictions format")
        
        # Group GT annotations by image
        gt_by_image = {}
        for ann in gt_data.get('annotations', []):
            img_id = ann['image_id']
            if img_id not in gt_by_image:
                gt_by_image[img_id] = []
            gt_by_image[img_id].append(ann)
        
        # Group predictions by image
        pred_by_image = {}
        for ann in predictions:
            img_id = ann.get('image_id')
            if img_id:
                if img_id not in pred_by_image:
                    pred_by_image[img_id] = []
                pred_by_image[img_id].append(ann)
        
        # Compute IoU per image
        image_results = []
        all_ious = []
        
        for img_id in gt_by_image:
            gt_anns = gt_by_image.get(img_id, [])
            pred_anns = pred_by_image.get(img_id, [])
            
            image_ious = []
            tp, fp, fn = 0, 0, 0
            
            # Match predictions to GT (simple greedy matching)
            used_gt = set()
            
            for pred_ann in pred_anns:
                pred_mask = decode_rle(pred_ann.get('segmentation'))
                if pred_mask is None:
                    continue
                
                best_iou = 0.0
                best_gt_idx = -1
                
                for gt_idx, gt_ann in enumerate(gt_anns):
                    if gt_idx in used_gt:
                        continue
                    
                    gt_mask = decode_rle(gt_ann.get('segmentation'))
                    if gt_mask is None:
                        continue
                    
                    iou = compute_iou(gt_mask, pred_mask)
                    if iou > best_iou:
                        best_iou = iou
                        best_gt_idx = gt_idx
                
                if best_iou >= 0.5:  # IoU threshold for match
                    tp += 1
                    used_gt.add(best_gt_idx)
                    image_ious.append(best_iou)
                    all_ious.append(best_iou)
                else:
                    fp += 1
            
            fn = len(gt_anns) - len(used_gt)
            
            # Find image filename
            img_info = next((img for img in gt_data.get('images', []) if img['id'] == img_id), None)
            img_name = img_info.get('file_name', str(img_id)) if img_info else str(img_id)
            
            image_results.append({
                'image_id': img_id,
                'image_name': os.path.basename(img_name),
                'num_gt': len(gt_anns),
                'num_pred': len(pred_anns),
                'true_positives': tp,
                'false_positives': fp,
                'false_negatives': fn,
                'mean_iou': float(np.mean(image_ious)) if image_ious else 0.0,
                'precision': tp / (tp + fp) if (tp + fp) > 0 else 0.0,
                'recall': tp / (tp + fn) if (tp + fn) > 0 else 0.0,
            })
        
        # Compute overall metrics
        total_tp = sum(r['true_positives'] for r in image_results)
        total_fp = sum(r['false_positives'] for r in image_results)
        total_fn = sum(r['false_negatives'] for r in image_results)
        
        precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0.0
        recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        
        results = {
            'evaluation_name': req.evaluation_name,
            'gt_path': req.gt_path,
            'pred_path': req.pred_path,
            'summary': {
                'mIoU': float(np.mean(all_ious)) if all_ious else 0.0,
                'median_iou': float(np.median(all_ious)) if all_ious else 0.0,
                'precision': precision,
                'recall': recall,
                'f1_score': f1,
                'total_gt': sum(r['num_gt'] for r in image_results),
                'total_pred': sum(r['num_pred'] for r in image_results),
                'total_tp': total_tp,
                'total_fp': total_fp,
                'total_fn': total_fn,
                'num_images': len(image_results),
            },
            'per_image': image_results[:50],  # First 50 for UI
        }
        
        # Store results
        _evaluation_results[req.evaluation_name] = results
        
        print(f"[EVAL] Complete: mIoU={results['summary']['mIoU']:.4f}, F1={f1:.4f}")
        
        return results
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/results/{name}")
def get_evaluation_results(name: str):
    """Get stored evaluation results by name."""
    if name in _evaluation_results:
        return _evaluation_results[name]
    raise HTTPException(status_code=404, detail=f"Evaluation '{name}' not found")


@router.get("/list")
def list_evaluations():
    """List all stored evaluation results."""
    return {
        "evaluations": [
            {
                "name": name,
                "mIoU": res['summary']['mIoU'],
                "f1_score": res['summary']['f1_score'],
                "num_images": res['summary']['num_images'],
            }
            for name, res in _evaluation_results.items()
        ]
    }


@router.post("/from_inference")
async def evaluate_from_inference(req: EvaluateFromDataEngineRequest):
    """
    Run inference on exported dataset and evaluate against GT.
    This uses the Data Engine exported data as ground truth.
    """
    from services.model import model_service
    
    # Find annotations file
    gt_path = os.path.join(req.dataset_path, "val", "_annotations.coco.json")
    if not os.path.exists(gt_path):
        gt_path = os.path.join(req.dataset_path, "_annotations.coco.json")
    
    if not os.path.exists(gt_path):
        raise HTTPException(status_code=404, detail=f"No annotations found in {req.dataset_path}")
    
    print(f"[EVAL] Running inference on {gt_path}")
    
    # Load GT data
    with open(gt_path, 'r') as f:
        gt_data = json.load(f)
    
    predictions = []
    
    # Run inference on each image
    for img_info in gt_data.get('images', []):
        img_path = img_info.get('file_name')
        if not os.path.exists(img_path):
            # Try relative path
            img_path = os.path.join(req.dataset_path, "val", os.path.basename(img_path))
        
        if not os.path.exists(img_path):
            print(f"[EVAL] Skip missing image: {img_path}")
            continue
        
        try:
            # Run SAM3 inference
            result = model_service.segment_with_text(img_path, req.prompt)
            
            if result and 'masks' in result:
                from pycocotools import mask as mask_util
                import cv2
                
                img = cv2.imread(img_path)
                h, w = img.shape[:2]
                
                for mask_data in result['masks']:
                    mask_array = np.array(mask_data, dtype=np.uint8)
                    if mask_array.ndim == 3:
                        mask_array = mask_array.max(axis=0) if mask_array.shape[0] <= 3 else mask_array[:,:,0]
                    mask_array = (mask_array > 0).astype(np.uint8)
                    
                    # Encode to RLE
                    rle = mask_util.encode(np.asfortranarray(mask_array))
                    rle['counts'] = rle['counts'].decode('utf-8')
                    
                    predictions.append({
                        'image_id': img_info['id'],
                        'segmentation': rle,
                        'score': 1.0,
                        'category_id': 1,
                    })
                    
        except Exception as e:
            print(f"[EVAL] Inference error on {img_path}: {e}")
            continue
    
    # Save predictions to temp file
    pred_path = os.path.join(tempfile.gettempdir(), f"predictions_{req.model_name}.json")
    with open(pred_path, 'w') as f:
        json.dump(predictions, f)
    
    print(f"[EVAL] Generated {len(predictions)} predictions")
    
    # Run evaluation
    eval_req = EvaluateRequest(
        gt_path=gt_path,
        pred_path=pred_path,
        evaluation_name=f"inference_{req.model_name}"
    )
    
    return run_evaluation(eval_req)
