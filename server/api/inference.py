from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
import shutil
import os
import uuid
from services.model import model_service

router = APIRouter()

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)


@router.post("/predict/image")
async def predict_image_endpoint(
    image: UploadFile = File(...), prompt: str = Form(None)
):
    try:
        # Save temp file
        file_ext = image.filename.split(".")[-1]
        filename = f"{uuid.uuid4()}.{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)

        # Run inference
        result = model_service.predict_image(file_path, prompt_text=prompt)

        # Visualize results (Draw masks/boxes on image)
        import cv2
        import numpy as np
        import base64

        # Load original image
        img = cv2.imread(file_path)
        if img is None:
             raise HTTPException(status_code=400, detail="Could not read uploaded image")
        
        # Combine all masks
        if "masks" in result and len(result["masks"]) > 0:
            masks = np.array(result["masks"])
            # masks shape is (N, H, W)
            
            # Create a colored overlay
            overlay = img.copy()
            
            # Simple visualization: iterate masks and add color
            # Just collapsing to single mask for simple view if multiple
            combined_mask = np.zeros(img.shape[:2], dtype=np.uint8)
            
            for i, m in enumerate(masks):
                # m might be boolean or float
                m = m.astype(np.uint8)
                if m.max() <= 1: 
                    m = m * 255
                
                # Resize m to img shape if needed (though SAM3 should return correct size)
                if m.shape != img.shape[:2]:
                     m = cv2.resize(m, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
                
                combined_mask = cv2.bitwise_or(combined_mask, m)

            # Apply Green overlay where mask is present
            # BGR format
            img[combined_mask > 0] = img[combined_mask > 0] * 0.5 + np.array([0, 255, 0]) * 0.5
            
            # Draw boxes if available
            if "boxes" in result:
                 for box in result["boxes"]:
                      x, y, w, h = map(int, box)
                      cv2.rectangle(img, (x, y), (x + w, y + h), (0, 0, 255), 2)

        # Encode to Base64
        _, buffer = cv2.imencode('.jpg', img)
        img_base64 = base64.b64encode(buffer).decode('utf-8')

        # Cleanup temp file
        if os.path.exists(file_path):
             os.remove(file_path)

        return {"status": "success", "image_base64": f"data:image/jpeg;base64,{img_base64}", "raw_count": len(result.get("masks", []))}
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Inference Error: {str(e)}")
        # Cleanup temp file
        if 'file_path' in locals() and os.path.exists(file_path): # Changed temp_file_path to file_path to ensure correctness
             os.remove(file_path)
        raise HTTPException(status_code=500, detail=str(e))

