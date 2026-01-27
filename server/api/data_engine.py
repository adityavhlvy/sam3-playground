from fastapi import APIRouter, HTTPException, Body, Depends, UploadFile, File
from pydantic import BaseModel
import os
import json
import glob
import shutil
from typing import List, Optional
from sqlalchemy.orm import Session
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
    decision: str  # 'accept', 'reject', 'flag'
    mask_data: Optional[dict] = None  # The mask being verified


class AutoVerifyRequest(BaseModel):
    image_path: str
    prompt: str
    mask_data: dict

class HardNegativeRequest(BaseModel):
    items_path: str # Path to folder containing negative images
    target_prompt: str # The concept these images do NOT contain (e.g. "rice field")
    output_path: str # Where to save the COCO json

@router.get("/items")
def list_items(dataset_path: str, db: Session = Depends(get_db)):
    # List images/videos in the dataset path
    if not os.path.exists(dataset_path):
        raise HTTPException(status_code=404, detail="Dataset path not found")

    extensions = ["*.jpg", "*.jpeg", "*.png", "*.mp4", "*.tif", "*.tiff"]
    files = []
    for ext in extensions:
        files.extend(glob.glob(os.path.join(dataset_path, "**", ext), recursive=True))

    items = []
    for f in files:
        rel_path = os.path.relpath(f, dataset_path)
        # Check DB for status? (Optimization for later)
        items.append(
            {
                "id": rel_path,
                "path": f,
                "type": "video" if f.endswith(".mp4") else "image",
            }
        )
    return {"items": items}


@router.post("/verify")
def submit_verification(decision: VerificationDecision, db: Session = Depends(get_db)):
    # Save human decision to DB
    # Find or create ImageItem
    # For now, we assume image_id is file_path or we need to look it up
    # Simplified: Save Proposal directly

    # Check if image exists in DB, if not create
    img = db.query(ImageItem).filter(ImageItem.file_path == decision.image_id).first()
    if not img:
        img = ImageItem(
            file_path=decision.image_id, file_type="image"
        )  # Detect type properly in future
        db.add(img)
        db.commit()
        db.refresh(img)

    proposal = MaskProposal(
        image_id=img.id,
        prompt_text=decision.prompt,
        status=decision.decision,
        mask_data=decision.mask_data,
        prompt_type="manual",  # or from verification
    )
    db.add(proposal)
    db.commit()

    return {"status": "saved", "id": proposal.id}


@router.post("/auto-verify")
def auto_verify(req: AutoVerifyRequest):
    # Call the verifier service
    verifier = get_verifier()
    result = verifier.verify_mask(req.image_path, req.prompt, req.mask_data)
    return result


@router.post("/generate_proposals")
def generate_proposals(
    item_path: str,
    prompt: str,
    points: Optional[List[List[float]]] = None,
    point_labels: Optional[List[int]] = None,
):
    # Use SAM3 to generate proposals
    # Updated to support points!
    try:
        if not model_service.image_model:
            model_service.load_image_model()

        result = model_service.predict_image(
            item_path, prompt_text=prompt, points=points, point_labels=point_labels
        )
        return {"proposals": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/process/upload-satellite")
async def upload_satellite_image(file: UploadFile = File(...)):
    """
    Uploads a TIF file and runs the SatelliteTiler to generate 1008x1008 tiles.
    """
    try:
        # Save uploaded file
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Determine output dir for tiles
        output_dir = os.path.join(TILES_DIR, os.path.splitext(file.filename)[0])
        
        # Run Tiler
        result = preprocessing_service.process_file(file_path, output_dir)
        
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/process/hard-negatives")
def generate_hard_negatives(req: HardNegativeRequest):
    """
    Generates a COCO-style JSON for a folder of negative images.
    It assigns the 'target_prompt' to each image but provides NO annotations (empty lists).
    This trains the Presence Head to output 0.0 for this prompt on these images.
    """
    if not os.path.exists(req.items_path):
         raise HTTPException(status_code=404, detail=f"Items path not found: {req.items_path}")

    extensions = ["*.jpg", "*.jpeg", "*.png", "*.tif", "*.tiff"]
    files = []
    for ext in extensions:
        files.extend(glob.glob(os.path.join(req.items_path, "**", ext), recursive=True))
    
    if not files:
         raise HTTPException(status_code=400, detail="No images found in the specified path.")

    # Construct COCO JSON standard
    # SAM 3 Custom Dataset loader expects:
    # images: [{id, file_name, width, height, ...}]
    # annotations: [] -> EMPTY for negatives
    # queries: [{id, image_id, query_text, input_box: null, points: null, object_ids_output: []}]
    # We must provide 'queries' to tell the dataloader what text to prompt with.
    
    images = []
    queries = []
    
    for i, file_path in enumerate(files):
        # We need width/height. 
        # For speed, we might skip opening if we trust the user, but better to check.
        # Use cv2 or PIL
        try:
             import cv2
             img = cv2.imread(file_path)
             if img is None: continue
             h, w = img.shape[:2]
        except:
             continue # Skip bad files

        image_id = i + 1
        abs_path = os.path.abspath(file_path)
        
        images.append({
            "id": image_id,
            "file_name": abs_path,
            "width": w,
            "height": h,
            "original_img_id": image_id
        })
        
        # Negative Query
        queries.append({
            "id": i + 1,
            "image_id": image_id,
            "query_text": req.target_prompt,
            "input_box": None,
            "input_points": None,
            "object_ids_output": [], # Empty means NO objects match this query -> Negative Sample
            "is_exhaustive": True, # We are sure there are none
            "query_processing_order": 0
        })

    dataset = {
        "images": images,
        "annotations": [], # Empty annotations
        "queries": queries,
        "categories": [{"id": 1, "name": req.target_prompt}] # Dummy category
    }
    
    # Save JSON
    try:
        with open(req.output_path, "w") as f:
            json.dump(dataset, f, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save JSON: {e}")

    return {
        "status": "success",
        "message": f"Generated hard negative dataset with {len(images)} images.",
        "json_path": req.output_path
    }
