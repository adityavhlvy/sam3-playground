from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
import shutil
import os
import uuid
import numpy as np
import cv2
import base64
from services.model import model_service

router = APIRouter()

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)


@router.post("/predict/image")
async def predict_image_endpoint(
    image: UploadFile = File(...),
    prompt: str = Form(None),
    boxes: str = Form(None),
    points: str = Form(None),
    point_labels: str = Form(None),
    task_type: str = Form("auto"),  # auto, search, interactive, exemplar
):
    try:
        import json

        # Parse JSON fields
        boxes_data = json.loads(boxes) if boxes else None
        points_data = json.loads(points) if points else None
        point_labels_data = json.loads(point_labels) if point_labels else None

        # Read image
        contents = await image.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            print(
                f"WARN: cv2.imdecode returned None for {image.filename}. Trying tifffile..."
            )
            try:
                import tifffile
                import io

                with io.BytesIO(contents) as f:
                    img = tifffile.imread(f)

                print(
                    f"DEBUG: tifffile loaded image. Raw Shape: {img.shape}, Dtype: {img.dtype}"
                )

                # Handle Channel ordering: (C, H, W) -> (H, W, C)
                # Heuristic: if ndim=3 and dim[0] is small (channels) and dim[1], dim[2] are large
                if img.ndim == 3:
                    c, h, w = img.shape
                    if c < h and c < w and c <= 4:
                        print(
                            "DEBUG: Detected Channel-First image (C, H, W). Transposing to (H, W, C)."
                        )
                        img = np.transpose(img, (1, 2, 0))

                # Normalize to uint8 if needed
                if img.dtype != np.uint8:
                    print("DEBUG: Normalizing image to uint8...")
                    img_min = img.min()
                    img_max = img.max()
                    if img_max > img_min:
                        img = ((img - img_min) / (img_max - img_min) * 255.0).astype(
                            np.uint8
                        )
                    else:
                        img = np.zeros(img.shape, dtype=np.uint8)

                # Ensure BGR for OpenCV
                if img.ndim == 2:  # Grayscale
                    img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
                elif img.ndim == 3:
                    # Check channels
                    if img.shape[2] == 3:
                        # Tifffile usually reads RGB. OpenCV needs BGR.
                        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
                    elif img.shape[2] == 4:
                        img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)

            except Exception as e:
                print(f"ERROR: tifffile failed: {e}")
                import traceback

                traceback.print_exc()
                raise HTTPException(
                    status_code=400,
                    detail=f"Could not decode image. OpenCV and Tifffile failed. Error: {e}",
                )

        if img is None:
            raise HTTPException(status_code=400, detail="Image decoding failed.")

        print(
            f"DEBUG: Final Image passed to model. Shape: {img.shape}, Dtype: {img.dtype}, Max: {img.max()}"
        )

        # Run Inference
        # Model Service will handle loading the model if not loaded
        result = model_service.predict_image(
            img,
            prompt_text=prompt,
            boxes=boxes_data,
            points=points_data,
            point_labels=point_labels_data,
            task_type=task_type,
        )
        print(f"DEBUG: Inference Result Keys: {result.keys()}")
        if "masks" in result:
            print(f"DEBUG: Number of masks found: {len(result['masks'])}")
        else:
            print("DEBUG: No 'masks' key in result.")

        # Visualize results (Draw masks/boxes on image)

        # Prepare data for visualization utils
        if "masks" in result:
            # Format inputs for render_masklet_frame
            # Check dimensions and format of masks
            masks = np.array(result["masks"])
            boxes = np.array(result["boxes"]) if "boxes" in result else []
            scores = np.array(result["scores"]) if "scores" in result else []

            # Helper to normalize boxes to XYWH if needed, but render_masklet_frame expects keys
            # render_masklet_frame expects:
            # outputs = {
            #     "out_boxes_xywh": [list, ...],
            #     "out_probs": [float, ...],
            #     "out_obj_ids": [int, ...],
            #     "out_binary_masks": [np.array, ...]
            # }

            formatted_outputs = {
                "out_boxes_xywh": [],
                "out_probs": [],
                "out_obj_ids": [],
                "out_binary_masks": [],
            }

            H, W = img.shape[:2]

            for i in range(len(masks)):
                # Mask
                m = masks[i]
                # Squeeze if (1, H, W)
                if m.ndim == 3 and m.shape[0] == 1:
                    m = m.squeeze(0)

                # Handle logits if necessary (threshold > 0)
                if np.issubdtype(m.dtype, np.floating):
                    m = (m > 0).astype(np.uint8)
                elif m.dtype == bool:
                    m = m.astype(np.uint8)
                else:
                    m = (m > 0).astype(np.uint8)  # assume non-zero is mask

                formatted_outputs["out_binary_masks"].append(m)

                # Score
                score = scores[i] if i < len(scores) else 1.0
                formatted_outputs["out_probs"].append(score)

                # ID
                formatted_outputs["out_obj_ids"].append(i)

                # Box - SAM returns XYXY usually, utils might expect XYWH
                # Let's check boxes format. model.py returns boxes.tolist().
                # Assuming SAM3 returns XYXY. render_masklet_frame expects XYWH (relative or absolute?)
                # Looking at render_masklet_frame source:
                # x, y, w, h = box_xywh
                # x1 = int(x * width) ...
                # So it expects RELATIVE XYWH format (0-1).

                if i < len(boxes):
                    box = boxes[i]  # [x1, y1, x2, y2] absolute pixels
                    # Convert to relative XYWH
                    x1, y1, x2, y2 = box
                    w_box = x2 - x1
                    h_box = y2 - y1
                    rel_box = [x1 / W, y1 / H, w_box / W, h_box / H]
                    formatted_outputs["out_boxes_xywh"].append(rel_box)
                else:
                    formatted_outputs["out_boxes_xywh"].append([0, 0, 0, 0])

            # Define custom renderer for larger labels
            def render_enhanced_masklet(img, outputs, alpha=0.5):
                """
                Custom renderer based on sam3.visualization_utils but with larger fonts and clearer labels.
                """
                # Normalize image to uint8
                if img.dtype != np.uint8:
                    # If float or uint16, normalize to 0-255
                    img_min = img.min()
                    img_max = img.max()
                    if img_max > img_min:
                        img = ((img - img_min) / (img_max - img_min) * 255.0).astype(
                            np.uint8
                        )
                    else:
                        img = np.zeros_like(img, dtype=np.uint8)

                img = img[..., :3]  # drop alpha if present
                height, width = img.shape[:2]
                overlay = img.copy()

                # CMAP for colors (simple list)
                # mimic sam3.visualization_utils.COLORS or just use a fixed list
                COLORS = [
                    (255, 0, 0),
                    (0, 255, 0),
                    (0, 0, 255),
                    (255, 255, 0),
                    (0, 255, 255),
                    (255, 0, 255),
                    (128, 0, 0),
                    (0, 128, 0),
                    (0, 0, 128),
                    (128, 128, 0),
                    (0, 128, 128),
                    (128, 0, 128),
                ]

                # 1. Draw Masks
                for i in range(len(outputs["out_probs"])):
                    obj_id = outputs["out_obj_ids"][i]
                    color = COLORS[obj_id % len(COLORS)]
                    # color is RGB, cv2 uses BGR usually, but we are working in RGB here (converted before call)

                    mask = outputs["out_binary_masks"][i]
                    if mask.shape != img.shape[:2]:
                        mask = cv2.resize(
                            mask.astype(np.float32),
                            (width, height),
                            interpolation=cv2.INTER_NEAREST,
                        )

                    mask_bool = mask > 0
                    for c in range(3):
                        overlay[..., c][mask_bool] = (
                            alpha * color[c] + (1 - alpha) * overlay[..., c][mask_bool]
                        ).astype(np.uint8)

                # 2. Draw Boxes and Large Labels
                # REMOVED: Boxes and Labels are now handled by the frontend
                # for i in range(len(outputs["out_probs"])):
                #     ...

                return overlay

            # Render directly
            img_rgb_vis = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            overlay = render_enhanced_masklet(img_rgb_vis, formatted_outputs, alpha=0.5)

            # Convert back to BGR
            img = cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR)

        # Encode to Base64
        _, buffer = cv2.imencode(".jpg", img)
        img_base64 = base64.b64encode(buffer).decode("utf-8")

        # Extract Polygons for Interactivity
        polygons = []
        scores_list = []
        ids_list = []
        colors_list = []  # New: Return colors
        
        # Consistent Color Map (Same as in render_enhanced_masklet)
        COLORS = [
            (255, 0, 0),
            (0, 255, 0),
            (0, 0, 255),
            (255, 255, 0),
            (0, 255, 255),
            (255, 0, 255),
            (128, 0, 0),
            (0, 128, 0),
            (0, 0, 128),
            (128, 128, 0),
            (0, 128, 128),
            (128, 0, 128),
        ]

        height, width = img.shape[:2]

        if "masks" in result:
            H, W = height, width
            for i, mask in enumerate(result["masks"]):
                # Ensure numpy array
                mask = np.array(mask)

                # Handle shape (1, H, W) vs (H, W)
                if mask.ndim == 3:
                    mask = mask.squeeze()

                # Ensure binary uint8
                if mask.dtype != np.uint8:
                    mask = (mask > 0).astype(np.uint8)

                contours, _ = cv2.findContours(
                    mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
                )

                # Each mask might have multiple islands (contours)
                mask_polys = []
                for contour in contours:
                    # contour is (N, 1, 2) -> (x, y)
                    # Normalize and flatten to [[x,y], [x,y]]
                    norm_poly = []
                    for point in contour:
                        x, y = point[0]
                        # Clamp to 0-1
                        nx = min(max(x / W, 0), 1)
                        ny = min(max(y / H, 0), 1)
                        norm_poly.append([nx, ny])
                    # Simplify if too large?
                    # For now keep all points but maybe check length
                    if len(norm_poly) > 2:
                        mask_polys.append(norm_poly)

                polygons.append(mask_polys)

                # Score
                score = (
                    float(result["scores"][i])
                    if "scores" in result and i < len(result["scores"])
                    else 1.0
                )
                scores_list.append(score)
                ids_list.append(i)
                
                # Color (RGB)
                color = COLORS[i % len(COLORS)]
                colors_list.append(color)

        return {
            "status": "success",
            "image_base64": f"data:image/jpeg;base64,{img_base64}",
            "raw_count": len(result.get("masks", [])),
            "polygons": polygons,  # List of List of List of [x,y] (Mask -> Contours -> Points)
            "scores": scores_list,
            "ids": ids_list,
            "colors": colors_list, # New field
            "width": width,
            "height": height,
        }
    except Exception as e:
        import traceback

        traceback.print_exc()
        print(f"Inference Error: {str(e)}")

        raise HTTPException(status_code=500, detail=str(e))


@router.post("/utils/preview_image")
async def preview_image_endpoint(image: UploadFile = File(...)):
    """
    Convert an uploaded image (e.g. TIFF) to a browser-friendly format (JPEG/PNG) base64 string.
    Robust handling for multi-channel and 16-bit TIFFs.
    """
    try:
        contents = await image.read()
        
        # Method 1: Try OpenCV first (fastest)
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED) # Use UNCHANGED to keep depth/channels

        # If OpenCV fails or returns None
        if img is None:
             print("OpenCV decode failed, trying PIL...")
             from PIL import Image
             import io
             try:
                 pil_img = Image.open(io.BytesIO(contents))
                 img = np.array(pil_img)
                 # Handle RGBA to RGB if needed, or other modes
                 if len(img.shape) == 3 and img.shape[2] == 4:
                     img = cv2.cvtColor(img, cv2.COLOR_RGBA2RGB)
                 elif len(img.shape) == 2:
                     # Grayscale to RGB
                     img = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
                 # PIL is RGB, OpenCV expects BGR
                 img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

             except Exception as pilot_err:
                 print(f"PIL failed too: {pilot_err}")
                 raise HTTPException(status_code=400, detail="Could not decode image")

        # --- Normalization and Channel Handling ---
        
        # 1. Handle Dimensions (H, W, C)
        if len(img.shape) == 2:
            # (H, W) -> (H, W, 3)
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        elif len(img.shape) == 3:
            if img.shape[2] > 3:
                # Take first 3 channels if > 3 (e.g. multispectral)
                img = img[:, :, :3]
            elif img.shape[2] == 1:
                img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

        # 2. Handle Bit Depth (uint16 -> uint8)
        if img.dtype == np.uint16 or img.max() > 255:
            # Normalize to 0-255
            img = cv2.normalize(img, None, 0, 255, cv2.NORM_MINMAX)
            img = np.uint8(img)
        elif img.dtype == np.float32 or img.dtype == np.float64:
             img = cv2.normalize(img, None, 0, 255, cv2.NORM_MINMAX)
             img = np.uint8(img)

        # Encode as JPEG
        success, buffer = cv2.imencode(".jpg", img)
        if not success:
            raise ValueError("Failed to encode image to JPEG")
            
        img_str = base64.b64encode(buffer).decode("utf-8")
        image_base64 = f"data:image/jpeg;base64,{img_str}"
        
        return JSONResponse(content={"image_base64": image_base64, "width": img.shape[1], "height": img.shape[0]})

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in preview_image_endpoint: {str(e)}")
        return JSONResponse(status_code=500, content={"message": str(e)})
