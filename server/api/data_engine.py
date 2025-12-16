from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
import os
import json
import glob
from typing import List, Optional
from services.model import model_service

router = APIRouter()

# Simple storage for decisions (in a real app, use a DB)
DECISIONS_FILE = "data_engine_decisions.json"


class VerificationDecision(BaseModel):
    image_id: str
    phase: str  # 'mask_verification', 'exhaustivity'
    decision: str  # 'accept', 'reject', 'flag', 'exhaustive', 'missing'
    details: Optional[dict] = None


@router.get("/items")
def list_items(dataset_path: str):
    # List images/videos in the dataset path
    # Recursively find images
    if not os.path.exists(dataset_path):
        raise HTTPException(status_code=404, detail="Dataset path not found")

    extensions = ["*.jpg", "*.jpeg", "*.png", "*.mp4"]
    files = []
    for ext in extensions:
        files.extend(glob.glob(os.path.join(dataset_path, "**", ext), recursive=True))

    items = []
    for f in files:
        items.append(
            {
                "id": os.path.relpath(f, dataset_path),
                "path": f,
                "type": "video" if f.endswith(".mp4") else "image",
            }
        )
    return {"items": items}


@router.post("/verify")
def submit_verification(decision: VerificationDecision):
    # Load existing
    if os.path.exists(DECISIONS_FILE):
        with open(DECISIONS_FILE, "r") as f:
            data = json.load(f)
    else:
        data = []

    data.append(decision.dict())

    with open(DECISIONS_FILE, "w") as f:
        json.dump(data, f, indent=2)

    return {"status": "saved"}


@router.post("/generate_proposals")
def generate_proposals(item_path: str, prompt: str):
    # Use SAM3 to generate proposal masks for verification
    # This mimics the "Proposing Masks" step in Phase 1/2
    try:
        # Check if model loaded
        if not model_service.image_model:
            model_service.load_image_model()

        result = model_service.predict_image(item_path, prompt_text=prompt)
        return {"proposals": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
