import torch
from PIL import Image
import numpy as np
import os
import sys
import cv2

# Ensure sam3 is in path (it is added in main.py, but good to be safe if run standalone)
# We remove the try-except to see the actual error if it fails
from sam3.model_builder import build_sam3_image_model, build_sam3_video_predictor
from sam3.model.sam3_image_processor import Sam3Processor

# Define default checkpoint path
# server/services/model.py -> ../../sam3-inference/sam3.pt
CURRENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(os.path.dirname(CURRENT_DIR))  # geospatial-deliniation
DEFAULT_CHECKPOINT = os.path.join(PROJECT_ROOT, "sam3-inference", "sam3.pt")


class ModelService:
    def __init__(self):
        self.image_model = None
        self.image_processor = None
        self.video_predictor = None
        self.force_cpu = False
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

    def set_device(self, force_cpu: bool):
        """
        Updates the device setting and invalidates loaded models to force reload on next use.
        """
        self.force_cpu = force_cpu
        prev_device = self.device

        if self.force_cpu:
            self.device = "cpu"
        else:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"

        print(
            f"ModelService: Device switched from {prev_device} to {self.device} (Force CPU: {force_cpu})"
        )

        # Invalidate models if device changed
        if prev_device != self.device:
            self.image_model = None
            self.image_processor = None
            self.video_predictor = None
            # Clear CUDA cache if moving to CPU to free memory
            if prev_device == "cuda" and torch.cuda.is_available():
                torch.cuda.empty_cache()

    def load_image_model(self, checkpoint_path=None):
        target_checkpoint = checkpoint_path if checkpoint_path else DEFAULT_CHECKPOINT

        if self.image_model is None or checkpoint_path:
            print(
                f"Loading SAM3 Image Model... (Checkpoint: {target_checkpoint}) on {self.device}"
            )

            kwargs = {}
            if target_checkpoint:
                kwargs["checkpoint_path"] = target_checkpoint

            kwargs["device"] = self.device
            # Enable instance interactivity to support point/box prompts via the Tracker module
            kwargs["enable_inst_interactivity"] = True

            self.image_model = build_sam3_image_model(**kwargs)
            self.image_processor = Sam3Processor(self.image_model)
            print("SAM3 Image Model Loaded.")

    def load_video_model(self, checkpoint_path=None):
        if self.video_predictor is None or checkpoint_path:
            print(
                f"Loading SAM3 Video Predictor... (Checkpoint: {checkpoint_path}) on {self.device}"
            )
            kwargs = {}
            if checkpoint_path:
                kwargs["checkpoint"] = checkpoint_path

            kwargs["device"] = self.device

            self.video_predictor = build_sam3_video_predictor(**kwargs)
            print("SAM3 Video Predictor Loaded.")

    def predict_image(
        self,
        image_path: str,
        prompt_text: str = None,
        points=None,
        point_labels=None,
        boxes=None,
        task_type: str = "auto",
        checkpoint_path: str = None,
    ):
        if checkpoint_path:
            self.load_image_model(checkpoint_path)
        else:
            self.load_image_model()

        import numpy as np

        if isinstance(image_path, np.ndarray):
            # Assume input is BGR from OpenCV
            image_rgb = cv2.cvtColor(image_path, cv2.COLOR_BGR2RGB)
            image = Image.fromarray(image_rgb)
        else:
            image = Image.open(image_path).convert("RGB")

        # 1. Set Image to initialize inference state
        inference_state = self.image_processor.set_image(image)

        masks = []
        boxes_out = []
        scores = []

        masks = []
        boxes_out = []
        scores = []

        # Logic for Task Type
        # auto:
        #   - if text is present -> PCS (Search/Exemplar).
        #   - if no text and (points or boxes) -> PVS (Interactive).
        if task_type == "auto":
            if prompt_text:
                task_type = "search"  # Supports text + box (refinement)
            elif points is not None or boxes is not None:
                task_type = "interactive"
            else:
                task_type = "search" # Default fallback (e.g. maybe just image provided? likely no-op or auto-segment)

        print(f"DEBUG: ModelService task_type resolved to: {task_type}")

        # --- MODE 1: PCS (Promptable Concept Segmentation) - Search / Exemplar ---
        if task_type in ["search", "exemplar"]:
             # This mode primarily uses Sam3Processor set_text_prompt and add_geometric_prompt
             # Note: add_geometric_prompt in PCS adds *exemplars* (find objects LIKE this box)
             # or *negative constraints*.

             # 1. Text Prompt
             if prompt_text:
                 output = self.image_processor.set_text_prompt(
                     state=inference_state, prompt=prompt_text
                 )
                 # Output is updated in state, but also returned
             
             # 2. Geometric (Exemplar) Prompts
             # PCS expects boxes in [cx, cy, w, h] normalized [0,1] format.
             if boxes is not None:
                 H = inference_state["original_height"]
                 W = inference_state["original_width"]
                 
                 for box in boxes:
                     # box is [x1, y1, x2, y2] absolute
                     x1, y1, x2, y2 = box
                     w_px = x2 - x1
                     h_px = y2 - y1
                     cx_px = x1 + w_px / 2
                     cy_px = y1 + h_px / 2
                     
                     # Normalize
                     norm_box = [cx_px / W, cy_px / H, w_px / W, h_px / H]
                     
                     # Assume Positive label by default for now unless specified
                     # Todo: support negative labels input
                     label = True 
                     
                     print(f"DEBUG: Adding Exemplar Box: {norm_box}")
                     output = self.image_processor.add_geometric_prompt(
                         box=norm_box, label=label, state=inference_state
                     )

             if output: # Check if output is not None (it receives the last output)
                 if "masks" in output:
                     masks = output["masks"]
                 if "boxes" in output:
                     boxes_out = output["boxes"]
                 if "scores" in output:
                     scores = output["scores"]
                 
                 # tensor to list
                 if isinstance(masks, torch.Tensor):
                     masks = masks.tolist()
                 if isinstance(boxes_out, torch.Tensor):
                     boxes_out = boxes_out.tolist()
                 if isinstance(scores, torch.Tensor):
                     scores = scores.tolist()

        # --- MODE 2: PVS (Promptable Visual Segmentation) - Interactive (Tracker) ---
        elif task_type == "interactive":
            # This uses predict_inst (model.predict_inst -> SAM3InteractiveImagePredictor)
            # Expects boxes in XYXY absolute pixels, points in XY absolute pixels.
            
            if points is not None or boxes is not None:
                point_coords = None
                p_labels = None
                box_tensor = None

                if points is not None:
                    if point_labels is None:
                        point_labels = [1] * len(points)
                    # format for predictor: Nx2
                    point_coords = np.array(points, dtype=np.float32)
                    p_labels = np.array(point_labels, dtype=np.int32)
                
                if boxes is not None:
                    # Tracker often takes one box or list of boxes?
                    # predict_inst takes 'box': Optional[np.ndarray] (length 4 array) or batched?
                    # The wrapper predict_inst signature in model.py calls self.image_model.predict_inst
                    # which calls inst_interactive_predictor.predict.
                    # Helper wrapper accepts single box usually?
                    # Let's handle singular box for now as standard interactive usage, or multi-box?
                    # If multiple boxes passed, we might need to batch or loop. 
                    # But predict_inst expects "box: np.ndarray (4,)" usually or Bx4?
                    # Using local predict_inst in model.py which calls model.predict_inst.
                    
                    # If multiple boxes, let's take the first one or merge? 
                    # Ideally we want to segment multiple objects if multiple boxes.
                    # But PVS usually segments ONE instance per prompt group.
                    # If we have multiple independent boxes, we should probably call predict_inst multiple times or use batch?
                    # For simplicity: Use first box if multiple, OR pass all if supported.
                    # Looking at sam1_task_predictor.py: predict() takes box (4,). predict_batch takes list.
                    # We are in single image mode. 
                    # If we want to support multiple boxes, we should probably iterate.
                    
                    # For current iteration, let's support ALL boxes by iterating if needed, 
                    # OR just pass the first one if the API implies single object interaction.
                    # But "Exemplar" uses all boxes. 
                    # Interactive usually implies "I clicked here, segment this".
                    # Let's try to pass coordinates.
                    
                    # Flattening assumption: user wants to segment objects defined by these prompts.
                    # We will support multiple independent predictions if we have multiple boxes?
                    # Or just one prediction using all props?
                    # SAM usually treats multiple inputs as One Object constraints unless specified otherwise.
                    
                    box_tensor = np.array(boxes[0], dtype=np.float32) if len(boxes) > 0 else None

                # Call interactive predictor
                masks_np, scores_np, _ = self.image_model.predict_inst(
                    inference_state=inference_state,
                    point_coords=point_coords,
                    point_labels=p_labels,
                    box=box_tensor,
                    multimask_output=True 
                )
                
                # Conversion
                def get_bbox_from_mask(mask):
                    y_indices, x_indices = np.where(mask > 0)
                    if len(y_indices) > 0:
                        x_min, x_max = np.min(x_indices), np.max(x_indices)
                        y_min, y_max = np.min(y_indices), np.max(y_indices)
                        return [x_min, y_min, x_max, y_max]
                    return [0, 0, 0, 0]

                masks = masks_np.tolist()
                scores = scores_np.tolist()
                boxes_out = [get_bbox_from_mask(m) for m in masks_np]

        return {
            "masks": masks,
            "boxes": boxes_out,
            "scores": scores,
        }


model_service = ModelService()
