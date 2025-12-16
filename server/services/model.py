import torch
from PIL import Image
import numpy as np
import os
import sys

# Ensure sam3 is in path (it is added in main.py, but good to be safe if run standalone)
# We remove the try-except to see the actual error if it fails
from sam3.model_builder import build_sam3_image_model, build_sam3_video_predictor
from sam3.model.sam3_image_processor import Sam3Processor
    
# Define default checkpoint path
# server/services/model.py -> ../../sam3-inference/sam3.pt
CURRENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR) # geospatial-deliniation
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
            
        print(f"ModelService: Device switched from {prev_device} to {self.device} (Force CPU: {force_cpu})")
        
        # Invalidate models if device changed
        if prev_device != self.device:
            self.image_model = None
            self.image_processor = None
            self.video_predictor = None
            # Clear CUDA cache if moving to CPU to free memory
            if prev_device == "cuda" and torch.cuda.is_available():
                torch.cuda.empty_cache()

    def load_image_model(self, checkpoint_path=None):
        if self.image_model is None or checkpoint_path:
            print(f"Loading SAM3 Image Model... (Checkpoint: {checkpoint_path}) on {self.device}")
            
            kwargs = {}
            if checkpoint_path:
                kwargs["checkpoint"] = checkpoint_path
            
            # Use the specific build function but ensure we move to self.device
            kwargs["device"] = self.device
            
            self.image_model = build_sam3_image_model(**kwargs)
            # The builder usually handles .to(device) if passed, but being explicit is safe
            # if the builder doesn't accept device arg, we do .to(self.device) manually
            # Looking at previous file views, build_sam3_image_model likely accepts device or defaults.
            # We will assume it returns a model we can move.
            
            # Since I can't verify the builder signature right now without viewing it again, 
            # safe bet is to move it if it's an nn.Module. 
            # However, checking `build_sam3_image_model` source previously:
            # def build_sam3_image_model(checkpoint=None, device='cuda', ...):
            # So passing device kwarg is correct.
            
            self.image_processor = Sam3Processor(self.image_model)
            print("SAM3 Image Model Loaded.")

    def load_video_model(self, checkpoint_path=None):
        if self.video_predictor is None or checkpoint_path:
            print(f"Loading SAM3 Video Predictor... (Checkpoint: {checkpoint_path}) on {self.device}")
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
        boxes=None,
        checkpoint_path: str = None,
    ):
        if checkpoint_path:
            self.load_image_model(checkpoint_path)
        else:
            self.load_image_model()

        image = Image.open(image_path).convert("RGB")
        inference_state = self.image_processor.set_image(image)

        output = None
        if prompt_text:
            output = self.image_processor.set_text_prompt(
                state=inference_state, prompt=prompt_text
            )

        if output:
            # masks: [N, H, W], boxes: [N, 4], scores: [N]
            masks = output["masks"]
            boxes = output["boxes"]
            scores = output["scores"]
            return {
                "masks": masks.tolist(),
                "boxes": boxes.tolist(),
                "scores": scores.tolist(),
            }
        return {}


model_service = ModelService()
