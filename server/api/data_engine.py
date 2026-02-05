from fastapi import APIRouter, HTTPException, Body, Depends, UploadFile, File
from pydantic import BaseModel
import os
import json
import glob
import shutil
import random
import cv2
import numpy as np
from typing import List, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from pycocotools import mask as mask_util
from data.database import get_db
from data.models import MaskProposal, ImageItem
from services.model import model_service
from services.verifier import get_verifier
from services.preprocessing import preprocessing_service

router = APIRouter()

UPLOAD_DIR = "uploads"
TILES_DIR = os.path.join(UPLOAD_DIR, "tiles")
NEGATIVES_DIR = os.path.join(UPLOAD_DIR, "negatives")

if not os.path.exists(TILES_DIR):
    os.makedirs(TILES_DIR)
if not os.path.exists(NEGATIVES_DIR):
    os.makedirs(NEGATIVES_DIR)

class VerificationDecision(BaseModel):
    image_id: str  # relative path or ID
    prompt: str
    decision: str  # 'accept', 'reject', 'flag', 'generated'
    mask_data: Optional[Any] = None  # The mask being verified (dict or list)
    score: Optional[float] = None  # Confidence score from model

class AutoVerifyRequest(BaseModel):
    image_path: str
    prompt: str
    mask_data: dict

class HardNegativeRequest(BaseModel):
    items_path: str 
    target_prompt: str 
    output_path: str 

class BatchRequest(BaseModel):
    dataset_path: str
    prompt: str
    confidence: float = 0.25

class ExportRequest(BaseModel):
    output_path: str
    include_rejected: bool = False
    train_split: float = 0.8  # 80% train, 20% val
    prompt_name: str = "rice field"  # Category name for annotations

class PolygonUpdateRequest(BaseModel):
    """Request model for updating proposal mask from PolygonEditor."""
    proposal_id: int
    polygons: List[List[List[float]]]  # [[[x, y], [x, y], ...], ...] normalized 0-1


@router.get("/items")
def list_items(dataset_path: str, db: Session = Depends(get_db)):
    if not os.path.exists(dataset_path):
        raise HTTPException(status_code=404, detail="Dataset path not found")

    extensions = ["*.jpg", "*.jpeg", "*.png", "*.mp4", "*.tif", "*.tiff"]
    files = []
    for ext in extensions:
        files.extend(glob.glob(os.path.join(dataset_path, "**", ext), recursive=True))

    items = []
    for f in files:
        rel_path = os.path.relpath(f, dataset_path)
        items.append(
            {
                "id": rel_path,
                "path": f,
                "type": "video" if f.endswith(".mp4") else "image",
            }
        )
    return {"items": items}


@router.get("/processed_images")
def get_processed_images(db: Session = Depends(get_db)):
    """
    Returns set of image paths that already have proposals.
    Used by batch processing to skip already-processed images.
    """
    # Get all images that have at least one proposal
    images_with_proposals = db.query(ImageItem.file_path).join(
        MaskProposal, ImageItem.id == MaskProposal.image_id
    ).distinct().all()
    
    processed = set(img[0] for img in images_with_proposals)
    print(f"[PROCESSED_IMAGES] Found {len(processed)} images with proposals")
    return {"processed": list(processed)}

@router.get("/queue")
def get_verification_queue(dataset_path: str, limit: int = 1, offset: int = 0, db: Session = Depends(get_db)):
    """
    Fetches items that have 'generated' proposals but are not yet verified.
    Uses pagination for better performance with large datasets.
    
    Args:
        limit: Number of items to return (default 1 for one-at-a-time verification)
        offset: Number of items to skip (for pagination)
    """
    import cv2
    import numpy as np
    from collections import defaultdict
    
    # Color palette for visualization
    COLORS = [
        (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0),
        (0, 255, 255), (255, 0, 255), (128, 0, 0), (0, 128, 0),
        (128, 128, 0), (0, 128, 128), (128, 0, 128), (64, 0, 0),
    ]
    
    # First, get unique image IDs with generated proposals (fast query)
    from sqlalchemy import func
    
    # Get count of pending images for progress display
    image_count_query = (
        db.query(ImageItem.id)
        .join(MaskProposal)
        .filter(MaskProposal.status == "generated")
        .distinct()
    )
    total_images = image_count_query.count()
    
    print(f"[QUEUE] Total pending images: {total_images}")
    
    if total_images == 0:
        return {"queue": [], "total": 0, "offset": offset}
    
    # Get limited set of image IDs (with offset for pagination)
    image_ids = (
        db.query(ImageItem.id)
        .join(MaskProposal)
        .filter(MaskProposal.status == "generated")
        .distinct()
        .offset(offset)
        .limit(limit)
        .all()
    )
    image_ids = [id[0] for id in image_ids]
    
    if not image_ids:
        return {"queue": [], "total": total_images, "offset": offset}
    
    # Now fetch proposals only for these specific images
    proposals = (
        db.query(MaskProposal)
        .filter(MaskProposal.status == "generated")
        .filter(MaskProposal.image_id.in_(image_ids))
        .all()
    )
    
    print(f"[QUEUE] Loading {len(proposals)} proposals for {len(image_ids)} images")
    
    # Group proposals by image
    image_proposals = defaultdict(list)
    for p in proposals:
        image_proposals[p.image.file_path].append(p)
    
    queue_items = []
    for image_path, props in image_proposals.items():
        all_polygons = []
        all_colors = []
        all_scores = []
        all_proposal_ids = []
        prompt = props[0].prompt_text if props else ""
        
        for idx, p in enumerate(props):
            mask_data = p.mask_data
            polygons_for_mask = []
            
            if mask_data:
                try:
                    # Handle both RLE compressed (new) and raw array (legacy) formats
                    if isinstance(mask_data, dict) and 'rle' in mask_data:
                        # New RLE format
                        rle = mask_data['rle']
                        if isinstance(rle['counts'], str):
                            rle = {'counts': rle['counts'].encode('utf-8'), 'size': rle['size']}
                        mask = mask_util.decode(rle)
                    else:
                        # Legacy raw array format
                        mask = np.array(mask_data)
                    
                    # Handle 3D mask (1, H, W) -> (H, W)
                    if mask.ndim == 3:
                        mask = mask.squeeze()
                    
                    # Ensure binary uint8
                    if mask.dtype != np.uint8:
                        mask = (mask > 0).astype(np.uint8)
                    
                    H, W = mask.shape[:2]
                    
                    # Find contours and convert to normalized polygons
                    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    
                    for contour in contours:
                        norm_poly = []
                        for point in contour:
                            x, y = point[0]
                            nx = min(max(x / W, 0), 1)
                            ny = min(max(y / H, 0), 1)
                            norm_poly.append([nx, ny])
                        if len(norm_poly) > 2:
                            polygons_for_mask.append(norm_poly)
                
                except Exception as e:
                    print(f"[QUEUE] Proposal {p.id}: polygon conversion failed: {e}")
            
            # Each mask might produce multiple contours (islands)
            if polygons_for_mask:
                all_polygons.append(polygons_for_mask)
                all_colors.append(list(COLORS[idx % len(COLORS)]))
                all_scores.append(p.score)
                all_proposal_ids.append(p.id)
        
        queue_items.append({
            "image_id": image_path,
            "path": image_path,
            "prompt": prompt,
            "polygons": all_polygons,
            "colors": all_colors,
            "scores": all_scores,
            "proposal_ids": all_proposal_ids,
        })
        
    return {
        "queue": queue_items, 
        "total": total_images,
        "offset": offset
    }


@router.get("/flagged_queue")
def get_flagged_queue(db: Session = Depends(get_db)):
    """
    Fetches items that have been flagged for manual correction.
    Used by Phase 3 Correction tab with PolygonEditor.
    """
    import cv2
    import numpy as np
    from collections import defaultdict
    
    COLORS = [
        (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0),
        (0, 255, 255), (255, 0, 255), (128, 0, 0), (0, 128, 0),
    ]
    
    # Fetch flagged proposals
    proposals = db.query(MaskProposal).filter(MaskProposal.status == "flag").all()
    print(f"[FLAGGED_QUEUE] Found {len(proposals)} flagged proposals")
    
    # Group by image
    image_proposals = defaultdict(list)
    for p in proposals:
        image_proposals[p.image.file_path].append(p)
    
    queue_items = []
    for image_path, props in image_proposals.items():
        all_polygons = []
        all_colors = []
        all_proposal_ids = []
        
        for idx, p in enumerate(props):
            mask_data = p.mask_data
            polygons_for_mask = []
            
            if mask_data:
                try:
                    mask = np.array(mask_data)
                    if mask.ndim == 3:
                        mask = mask.squeeze()
                    if mask.dtype != np.uint8:
                        mask = (mask > 0).astype(np.uint8)
                    
                    H, W = mask.shape[:2]
                    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    
                    for contour in contours:
                        norm_poly = []
                        for point in contour:
                            x, y = point[0]
                            nx = min(max(x / W, 0), 1)
                            ny = min(max(y / H, 0), 1)
                            norm_poly.append([nx, ny])
                        if len(norm_poly) > 2:
                            polygons_for_mask.append(norm_poly)
                except Exception as e:
                    print(f"[FLAGGED_QUEUE] Proposal {p.id}: polygon conversion failed: {e}")
            
            if polygons_for_mask:
                all_polygons.append(polygons_for_mask)
                all_colors.append(list(COLORS[idx % len(COLORS)]))
                all_proposal_ids.append(p.id)
        
        queue_items.append({
            "image_id": image_path,
            "path": image_path,
            "polygons": all_polygons,
            "colors": all_colors,
            "proposal_ids": all_proposal_ids,
        })
    
    return {"queue": queue_items}

@router.post("/verify")
def submit_verification(decision: VerificationDecision, db: Session = Depends(get_db)):
    """
    Submits a human decision. 
    - For 'generated': Always CREATE a new proposal (batch processing)
    - For 'accept'/'reject'/'flag': UPDATE existing proposal (Phase 2 voting)
    """
    print(f"[VERIFY] Processing decision '{decision.decision}' for image: {decision.image_id}")
    
    # Normalize Path Check
    img = db.query(ImageItem).filter(ImageItem.file_path == decision.image_id).first()
    if not img:
        # Try swap slash
        alt_path = decision.image_id.replace("\\", "/") if "\\" in decision.image_id else decision.image_id.replace("/", "\\")
        img = db.query(ImageItem).filter(ImageItem.file_path == alt_path).first()

    # For Phase 2 voting (accept/reject/flag), try to update existing proposal
    # For 'generated', always create new proposal (batch processing saves multiple masks)
    if decision.decision != "generated" and img:
        # Look for pending proposal to update
        prop = db.query(MaskProposal).filter(
            MaskProposal.image_id == img.id,
            MaskProposal.status == "generated" 
        ).first()
        
        if prop:
            print(f"[VERIFY] Updating existing proposal {prop.id} to {decision.decision}")
            prop.status = decision.decision
            db.commit()
            return {"status": "updated", "id": prop.id}

    # If no existing pending proposal, create new one (Manual Mining or re-verify)
    if not img:
        img = ImageItem(file_path=decision.image_id, file_type="image")
        db.add(img)
        db.commit()
        db.refresh(img)

    print(f"[VERIFY] Creating NEW proposal for {decision.decision}")
    proposal = MaskProposal(
        image_id=img.id,
        prompt_text=decision.prompt,
        status=decision.decision,
        mask_data=decision.mask_data,
        score=decision.score,  # Include confidence score from model
        prompt_type="manual",  
    )
    db.add(proposal)
    db.commit()
    return {"status": "saved", "id": proposal.id}


class ProposalUpdate(BaseModel):
    proposal_id: int
    decision: str  # 'accept', 'reject', 'flag'


class BulkProposalUpdate(BaseModel):
    proposal_ids: List[int]
    decision: str  # 'accept', 'reject', 'flag'


@router.post("/verify_proposal")
def verify_proposal_by_id(update: ProposalUpdate, db: Session = Depends(get_db)):
    """
    Update a specific proposal by ID.
    Used for bulk voting operations on grouped proposals.
    """
    prop = db.query(MaskProposal).filter(MaskProposal.id == update.proposal_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail=f"Proposal {update.proposal_id} not found")
    
    print(f"[VERIFY_PROPOSAL] Updating proposal {prop.id} to {update.decision}")
    prop.status = update.decision
    db.commit()
    return {"status": "updated", "id": prop.id}


@router.post("/bulk_verify")
def bulk_verify_proposals(update: BulkProposalUpdate, db: Session = Depends(get_db)):
    """
    Update multiple proposals in a single transaction.
    Much faster than calling verify_proposal multiple times.
    """
    updated = 0
    for pid in update.proposal_ids:
        prop = db.query(MaskProposal).filter(MaskProposal.id == pid).first()
        if prop:
            prop.status = update.decision
            updated += 1
    
    db.commit()
    print(f"[BULK_VERIFY] Updated {updated} proposals to '{update.decision}'")
    return {"status": "updated", "count": updated}


@router.post("/generate_proposals")
def generate_proposals(
    item_path: str,
    prompt: str,
    points: Optional[List[List[float]]] = None,
    point_labels: Optional[List[int]] = None,
):
    try:
        print(f"[GENERATE] Running SAM3 on: {item_path} with prompt: {prompt}")
        if not model_service.image_model:
            model_service.load_image_model()

        result = model_service.predict_image(
            item_path, prompt_text=prompt, points=points, point_labels=point_labels
        )
        return {"proposals": result}
    except Exception as e:
        print(f"[ERROR] Generate failed on {item_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch-generate")
def batch_generate(req: BatchRequest, db: Session = Depends(get_db)):
    """
    Runs SAM3 on all images.
    Saves results as 'generated' (Pending Phase 2).
    """
    if not os.path.exists(req.dataset_path):
        raise HTTPException(status_code=404, detail="Dataset path not found")

    if not model_service.image_model:
        model_service.load_image_model()
    
    extensions = ["*.jpg", "*.jpeg", "*.png", "*.tif", "*.tiff"]
    files = []
    for ext in extensions:
        files.extend(glob.glob(os.path.join(req.dataset_path, "**", ext), recursive=True))

    count = 0
    errors = 0

    for file_path in files:
        try:
            # Check if already exists (skip if so, to avoid duplicates)
            # Normalize path check?
            # For speed, we skip check here or we can check DB. 
            # Let's just process.
            
            result = model_service.predict_image(file_path, prompt_text=req.prompt)
            
            # Enhanced validation: check for masks and ensure they're not empty
            if not result or not result.get("masks") or len(result["masks"]) == 0:
                print(f"[BATCH] Skipping {file_path}: No masks detected")
                continue

            # Image Item
            img = db.query(ImageItem).filter(ImageItem.file_path == file_path).first()
            if not img:
                img = ImageItem(file_path=file_path, file_type="image")
                db.add(img)
                db.commit()
                db.refresh(img)
            
            # Save as GENERATED (Pending Review)
            best_mask = result["masks"][0]
            
            # Ensure we save 2D mask (H, W) not (1, H, W)
            # Check shape by inspection
            print(f"DEBUG: Processing {file_path}")
            print(f"DEBUG: Original Mask Type: {type(best_mask)}")
            if isinstance(best_mask, list):
                 print(f"DEBUG: Mask Dims: Len={len(best_mask)}, Inner={len(best_mask[0]) if len(best_mask)>0 else 'E'}")
            
            if isinstance(best_mask, list) and len(best_mask) > 0 and isinstance(best_mask[0], list) and isinstance(best_mask[0][0], list):
                 print(f"[BATCH] Detected 3D mask for {file_path}. Flattening.")
                 best_mask = best_mask[0]
            
            # Validate mask has positive values (actual detections)
            def mask_has_positive_values(mask):
                if isinstance(mask, list):
                    if len(mask) == 0:
                        return False
                    if isinstance(mask[0], list):
                        return any(mask_has_positive_values(m) for m in mask)
                    return any(v > 0 if isinstance(v, (int, float)) else v for v in mask)
                return mask > 0 if isinstance(mask, (int, float)) else mask
            
            if not mask_has_positive_values(best_mask):
                print(f"[BATCH] Skipping {file_path}: Mask is empty (no positive values)")
                continue
            
            # Convert mask to numpy array
            mask_array = np.array(best_mask, dtype=np.uint8)
            if mask_array.ndim == 3:
                mask_array = mask_array[0] if mask_array.shape[0] <= 3 else mask_array[:,:,0]
            mask_array = (mask_array > 0).astype(np.uint8)
            
            # Compress mask to RLE for efficient storage
            rle = mask_util.encode(np.asfortranarray(mask_array))
            rle['counts'] = rle['counts'].decode('utf-8')  # Make JSON serializable
            compressed_mask = {'rle': rle}  # Store as RLE dict
            
            original_size = len(json.dumps(best_mask if isinstance(best_mask, list) else best_mask.tolist()))
            compressed_size = len(json.dumps(compressed_mask))
            print(f"[BATCH] Mask compression: {original_size:,} bytes -> {compressed_size:,} bytes ({100-compressed_size/original_size*100:.1f}% reduction)")
            
            # Save debug image for verification
            try:
                debug_dir = os.path.join(UPLOAD_DIR, "debug")
                if not os.path.exists(debug_dir):
                    os.makedirs(debug_dir)
                
                debug_mask = mask_array * 255
                
                debug_filename = f"mask_{os.path.basename(file_path).rsplit('.', 1)[0]}.png"
                debug_path = os.path.join(debug_dir, debug_filename)
                cv2.imwrite(debug_path, debug_mask)
                print(f"[DEBUG] Saved mask to: {debug_path}")
            except Exception as de:
                print(f"[DEBUG] Failed to save debug image: {de}")
            
            # Extract Score
            best_score = 0
            if "scores" in result and len(result["scores"]) > 0:
                # scores might be list of lists if derived from multimask_output=True
                # model.py suggests it returns scores_np.tolist() which is usually list of floats
                score_val = result["scores"][0]
                if isinstance(score_val, list):
                    score_val = score_val[0]
                best_score = int(float(score_val) * 100) # Store as 0-100 integer
            
            print(f"[BATCH] Score for {os.path.basename(file_path)}: {best_score}")

            proposal = MaskProposal(
                image_id=img.id,
                prompt_text=req.prompt,
                status="generated", # ENABLES PHASE 2
                mask_data=compressed_mask,  # Store compressed RLE instead of raw array
                score=best_score,
                prompt_type="batch_auto", 
            )
            db.add(proposal)
            count += 1
            print(f"[BATCH] Generated proposal for: {file_path}")
            
        except Exception as e:
            print(f"Batch error on {file_path}: {e}")
            import traceback
            traceback.print_exc()
            errors += 1
            continue

    db.commit()

    return {
        "status": "success",
        "message": f"Batch processed {len(files)} files. Generated {count} for review.",
        "processed_count": count
    }


@router.post("/export")
def export_dataset(req: ExportRequest, db: Session = Depends(get_db)):
    """
    Exports verified (accepted) proposals in SAM3-compatible COCO format.
    
    Features:
    - RLE-encoded segmentation masks (required by SAM3)
    - Normalized bbox [x, y, w, h] in 0-1 range
    - Actual area computed from mask
    - Optional train/val split with separate folders
    """
    query = db.query(MaskProposal)
    if not req.include_rejected:
        query = query.filter(MaskProposal.status == "accept")

    proposals = query.all()

    if not proposals:
        return {"status": "warning", "message": "No accepted proposals found to export. Make sure you VERIFIED them in Phase 2!"}

    def mask_to_rle_and_stats(mask_data, img_height, img_width):
        """
        Convert mask data to RLE encoding and compute bbox/area.
        Returns: (rle_dict, normalized_bbox, area)
        """
        # Convert to numpy array
        mask_array = np.array(mask_data, dtype=np.uint8)
        
        # Handle various mask formats
        if mask_array.ndim == 3:
            # If 3D (H, W, C) or (N, H, W), squeeze or take max
            if mask_array.shape[0] == 1:
                mask_array = mask_array[0]
            elif mask_array.shape[-1] in [1, 3, 4]:
                mask_array = mask_array[:, :, 0] if mask_array.shape[-1] > 0 else mask_array.max(axis=-1)
            else:
                mask_array = mask_array.max(axis=0)
        
        # Ensure binary mask
        mask_array = (mask_array > 0).astype(np.uint8)
        
        # Ensure correct dimensions
        if mask_array.shape != (img_height, img_width):
            # Resize if dimensions don't match
            mask_array = cv2.resize(mask_array, (img_width, img_height), interpolation=cv2.INTER_NEAREST)
        
        # Encode to RLE (pycocotools expects Fortran-ordered array)
        rle = mask_util.encode(np.asfortranarray(mask_array))
        rle['counts'] = rle['counts'].decode('utf-8')  # Convert bytes to string
        
        # Compute bbox [x, y, w, h] in pixel coordinates
        bbox_pixels = mask_util.toBbox(rle).tolist()  # [x, y, w, h]
        
        # Normalize bbox to 0-1 range
        if bbox_pixels[2] > 0 and bbox_pixels[3] > 0:
            norm_bbox = [
                bbox_pixels[0] / img_width,
                bbox_pixels[1] / img_height,
                bbox_pixels[2] / img_width,
                bbox_pixels[3] / img_height
            ]
        else:
            norm_bbox = [0.0, 0.0, 0.0, 0.0]
        
        # Compute area
        area = float(mask_util.area(rle))
        
        return rle, norm_bbox, area

    def build_dataset(proposals_list, category_name):
        """Build COCO-style dataset from proposals."""
        images_map = {}
        annotations = []
        
        for prop in proposals_list:
            img_item = prop.image
            image_id = img_item.id
            
            # Get image dimensions
            if image_id not in images_map:
                w, h = 1024, 1024
                if os.path.exists(img_item.file_path):
                    try:
                        tmp = cv2.imread(img_item.file_path)
                        if tmp is not None:
                            h, w = tmp.shape[:2]
                    except Exception as e:
                        print(f"[EXPORT] Warning: Could not read image {img_item.file_path}: {e}")
                
                images_map[image_id] = {
                    "id": image_id,
                    "file_name": os.path.abspath(img_item.file_path),
                    "text_input": category_name,
                    "width": w,
                    "height": h,
                    "queried_category": 1,
                    "is_instance_exhaustive": 1,
                    "is_pixel_exhaustive": 1,
                }
            else:
                w = images_map[image_id]["width"]
                h = images_map[image_id]["height"]
            
            # Process mask data
            if prop.mask_data:
                try:
                    rle, norm_bbox, area = mask_to_rle_and_stats(prop.mask_data, h, w)
                    
                    annotations.append({
                        "id": prop.id,
                        "image_id": image_id,
                        "segmentation": rle,
                        "bbox": norm_bbox,
                        "area": area,
                        "category_id": 1,
                        "iscrowd": 0,
                        "source": "manual" if prop.status == "corrected" else "auto"
                    })
                except Exception as e:
                    print(f"[EXPORT] Warning: Failed to process mask for proposal {prop.id}: {e}")
                    continue
        
        return {
            "images": list(images_map.values()),
            "annotations": annotations,
            "categories": [{"id": 1, "name": category_name}]
        }

    def save_dataset(dataset, path):
        """Save dataset to JSON file."""
        out_dir = os.path.dirname(path)
        if out_dir and not os.path.exists(out_dir):
            os.makedirs(out_dir)
        with open(path, "w") as f:
            json.dump(dataset, f, indent=2)

    # Check if train/val split is requested
    if req.train_split > 0 and req.train_split < 1:
        # Shuffle proposals for random split
        all_proposals = list(proposals)
        random.shuffle(all_proposals)
        
        split_idx = int(len(all_proposals) * req.train_split)
        train_proposals = all_proposals[:split_idx]
        val_proposals = all_proposals[split_idx:]
        
        # Build separate datasets
        train_dataset = build_dataset(train_proposals, req.prompt_name)
        val_dataset = build_dataset(val_proposals, req.prompt_name)
        
        # Determine output paths
        base_dir = os.path.dirname(req.output_path)
        train_dir = os.path.join(base_dir, "train")
        val_dir = os.path.join(base_dir, "val")
        
        train_path = os.path.join(train_dir, "_annotations.coco.json")
        val_path = os.path.join(val_dir, "_annotations.coco.json")
        
        try:
            save_dataset(train_dataset, train_path)
            save_dataset(val_dataset, val_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save export: {e}")
        
        return {
            "status": "success",
            "message": f"Exported with train/val split ({req.train_split:.0%}/{1-req.train_split:.0%})",
            "train_count": len(train_dataset["annotations"]),
            "val_count": len(val_dataset["annotations"]),
            "train_path": train_path,
            "val_path": val_path
        }
    else:
        # Single file export (full dataset)
        dataset = build_dataset(proposals, req.prompt_name)
        
        try:
            save_dataset(dataset, req.output_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save export: {e}")
        
        return {
            "status": "success",
            "message": f"Exported {len(dataset['images'])} images and {len(dataset['annotations'])} annotations.",
            "path": req.output_path
        }

@router.get("/proposal")
def get_proposal_by_image(file_path: str, db: Session = Depends(get_db)):
    """
    Fetches the existing 'accepted' proposal for Phase 3.
    ROBUST PATH MATCHING INCLUDED.
    """
    print(f"[PROPOSAL] Request for: {file_path}")
    
    # Try exact match
    img = db.query(ImageItem).filter(ImageItem.file_path == file_path).first()
    
    # Try swap slash match
    if not img:
        alt_path = file_path.replace("\\", "/") if "\\" in file_path else file_path.replace("/", "\\")
        print(f"[PROPOSAL] Try alt: {alt_path}")
        img = db.query(ImageItem).filter(ImageItem.file_path == alt_path).first()
        
    if not img:
         return {"proposal": None}
         
    # Find active proposal (Accepted ones for Phase 3)
    # Note: Phase 3 is meant for "Accepted" ones. 
    prop = db.query(MaskProposal).filter(
        MaskProposal.image_id == img.id,
        MaskProposal.status == "accept"
    ).order_by(MaskProposal.id.desc()).first()
    
    if prop:
        print(f"[PROPOSAL] Found accepted mask for {file_path}")
        return {"proposal": {"masks": [prop.mask_data]}} 
        
    return {"proposal": None}


@router.post("/update_proposal_mask")
def update_proposal_mask(req: PolygonUpdateRequest, db: Session = Depends(get_db)):
    """
    Updates a proposal's mask data from edited polygons.
    
    Converts normalized polygon points back to a binary mask and saves to database.
    Used by PolygonEditor after manual corrections in Phase 3.
    
    Args:
        proposal_id: ID of the proposal to update
        polygons: List of polygons, each polygon is [[x, y], ...] normalized 0-1
    """
    print(f"[UPDATE_MASK] Request to update proposal {req.proposal_id}")
    
    # Find the proposal
    prop = db.query(MaskProposal).filter(MaskProposal.id == req.proposal_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail=f"Proposal {req.proposal_id} not found")
    
    # Get image dimensions
    img_item = prop.image
    if not img_item:
        raise HTTPException(status_code=404, detail="Associated image not found")
    
    # Read image to get dimensions
    w, h = 1024, 1024  # Default
    if os.path.exists(img_item.file_path):
        try:
            tmp = cv2.imread(img_item.file_path)
            if tmp is not None:
                h, w = tmp.shape[:2]
        except Exception as e:
            print(f"[UPDATE_MASK] Warning: Could not read image dimensions: {e}")
    
    # Convert normalized polygons to binary mask
    mask = np.zeros((h, w), dtype=np.uint8)
    
    for polygon in req.polygons:
        if len(polygon) < 3:
            # Skip invalid polygons (need at least 3 points)
            continue
            
        # Convert normalized coordinates to pixel coordinates
        pts = np.array([
            [int(p[0] * w), int(p[1] * h)] 
            for p in polygon
        ], dtype=np.int32)
        
        # Fill polygon on mask
        cv2.fillPoly(mask, [pts], 1)
    
    # Convert mask to list for JSON storage
    mask_list = mask.tolist()
    
    # Update proposal
    prop.mask_data = mask_list
    prop.status = "corrected"  # Mark as human-corrected
    
    try:
        db.commit()
        print(f"[UPDATE_MASK] Successfully updated proposal {req.proposal_id}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save: {e}")
    
    # Compute stats for response
    pixel_count = int(mask.sum())
    total_pixels = h * w
    coverage_pct = (pixel_count / total_pixels) * 100 if total_pixels > 0 else 0
    
    return {
        "status": "updated",
        "proposal_id": prop.id,
        "polygon_count": len(req.polygons),
        "mask_pixels": pixel_count,
        "coverage_percent": round(coverage_pct, 2)
    }
