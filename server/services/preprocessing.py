import os
import cv2
import numpy as np
import tifffile
import uuid
import json
from pathlib import Path

class SatelliteTiler:
    """
    Handles preprocessing of satellite imagery (TIF/GeoTIFF) for SAM 3.
    Implements the "1008 Constraint" from SAM3_SATELLITE_PIPELINE.md.
    """

    def __init__(self, tile_size=1008, overlap=224):
        self.tile_size = tile_size
        self.overlap = overlap
        # Valid overlap check (must be divisible by 14 for patch alignment)
        if self.overlap % 14 != 0:
            raise ValueError(f"Overlap {overlap} is not divisible by 14 (patch size).")

    def process_file(self, input_path: str, output_dir: str) -> dict:
        """
        Reads a file, converts to 8-bit RGB, applies CLAHE, and tiles it.
        Returns metadata about the generated tiles.
        """
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        # 1. Read Image
        try:
            # Try utilizing tifffile for robust TIF support
            img = tifffile.imread(input_path)
        except Exception as e:
            # Fallback to cv2
            print(f"WARN: tifffile failed ({e}), trying cv2...")
            img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)

        if img is None:
            raise ValueError(f"Could not read image at {input_path}")

        # 2. Channel & Type Normalization
        # Ensure (H, W, C)
        if img.ndim == 3:
            # Check for Channel-First (C, H, W) -> commonly found in remote sensing
            c, h, w = img.shape
            if c <= 4 and h > c and w > c:
                img = np.transpose(img, (1, 2, 0))
        
        # Normalize 16-bit to 8-bit if needed
        if img.dtype == np.uint16 or img.max() > 255:
            img = self._normalize_to_8bit(img)
        
        # Ensure RGB (drop alpha if exists, or just take first 3 bands)
        if img.ndim == 3 and img.shape[2] >= 3:
            img = img[:, :, :3]
            # If loaded via cv2, it might be BGR. If tifffile, typically RGB.
            # We standardize to RGB for processing.
            # simple heuristic: usually satellite TIF is RGB.
            pass
        elif img.ndim == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)

        # 3. Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
        # Convert to LAB color space
        lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        cl = clahe.apply(l)
        limg = cv2.merge((cl, a, b))
        img_enhanced = cv2.cvtColor(limg, cv2.COLOR_LAB2RGB)

        # 4. Tiling
        tiles_metadata = self._generate_tiles(img_enhanced, output_dir, os.path.basename(input_path))

        return {
            "original_file": input_path,
            "processed_dir": output_dir,
            "tile_count": len(tiles_metadata),
            "tiles": tiles_metadata
        }

    def _normalize_to_8bit(self, img):
        """Linearly normalize to 0-255."""
        min_val = np.min(img)
        max_val = np.max(img)
        if max_val == min_val:
            return np.zeros_like(img, dtype=np.uint8)
        
        img_norm = (img - min_val) / (max_val - min_val) * 255.0
        return img_norm.astype(np.uint8)

    def _generate_tiles(self, img, output_dir, base_filename):
        h, w = img.shape[:2]
        step = self.tile_size - self.overlap
        tiles = []

        # Calculate grid
        y_steps = range(0, h, step)
        x_steps = range(0, w, step)

        for y in y_steps:
            for x in x_steps:
                # Adjust for edge cases - crop if we go over, or pad?
                # Spec says "Resolution Scaling" and "Tiling".
                # For strict input_size: 1008, we should probably pad if the last tile is smaller
                # OR just clip the last tile to be 1008 taking from the left/top (more overlap).
                
                y_start = y
                y_end = y + self.tile_size
                x_start = x
                x_end = x + self.tile_size

                # If end goes beyond boundaries, shift start back to fit 1008
                if y_end > h:
                    y_end = h
                    y_start = max(0, h - self.tile_size)
                
                if x_end > w:
                    x_end = w
                    x_start = max(0, w - self.tile_size)

                # Extract tile
                tile = img[y_start:y_end, x_start:x_end]
                
                # Check if tile is smaller than expected (e.g. image structure is smaller than 1008)
                # Pad with black if needed
                if tile.shape[0] < self.tile_size or tile.shape[1] < self.tile_size:
                    pad_h = self.tile_size - tile.shape[0]
                    pad_w = self.tile_size - tile.shape[1]
                    tile = cv2.copyMakeBorder(tile, 0, pad_h, 0, pad_w, cv2.BORDER_CONSTANT, value=[0,0,0])

                # Save tile
                tile_filename = f"{Path(base_filename).stem}_tile_{y_start}_{x_start}.jpg"
                tile_path = os.path.join(output_dir, tile_filename)
                
                # Save as RGB (cv2 expects BGR by default)
                cv2.imwrite(tile_path, cv2.cvtColor(tile, cv2.COLOR_RGB2BGR))

                tiles.append({
                    "filename": tile_filename,
                    "path": tile_path,
                    "x": x_start,
                    "y": y_start,
                    "width": self.tile_size,
                    "height": self.tile_size
                })
        
        return tiles

preprocessing_service = SatelliteTiler()
