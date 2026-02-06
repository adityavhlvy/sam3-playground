
import sys
import os
import numpy as np
import cv2

# Add server directory to path
current_dir = os.path.dirname(os.path.abspath(__file__))
if os.path.exists("server"):
    sys.path.append("server")
elif os.path.exists("../server"):
    sys.path.append("../server")
else:
    sys.path.append(".")

from services.postprocessing import polygon_processor

def create_jagged_square(size=200):
    mask = np.zeros((size, size), dtype=np.uint8)
    # Create a base square 50:150
    mask[50:150, 50:150] = 1
    
    # Add noise/jaggies
    np.random.seed(42)
    noise = np.random.randint(0, 2, (size, size))
    # Add noise only near edges
    edge_mask = np.zeros_like(mask)
    cv2.rectangle(edge_mask, (48, 48), (152, 152), 1, 5)
    
    noisy_mask = mask.copy()
    noisy_mask[edge_mask == 1] = noise[edge_mask == 1]
    
    return noisy_mask

def test_smoothing():
    print("Creating jagged square mask...")
    mask = create_jagged_square()
    
    # 1. Test Cleaning
    print("\n[Step 1] Testing clean_masks (Gaussian Smoothing)...")
    cleaned = polygon_processor.clean_masks([mask], smooth_sigma=1.5)[0]
    
    # Check if noise reduced
    # Simple metric: Ratio of perimeter to area? Or just visual check via count.
    orig_contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    clean_contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    print(f"Original Contours Count: {len(orig_contours)}")
    print(f"Cleaned Contours Count: {len(clean_contours)}")
    
    if len(clean_contours) < len(orig_contours):
        print("SUCCESS: Cleaning reduced artifacts.")
    else:
        print("INFO: Contour count same (might be single blob).")

    # 2. Test Polygonization
    print("\n[Step 2] Testing mask_to_polygons with High Detail + Optional Smoothing...")
    
    # Run, expecting high detail but smooth curves from raster
    polys = polygon_processor.mask_to_polygons(cleaned, epsilon_factor=0.001, smooth_iterations=0)
    
    if not polys:
        print("FAILURE: No polygons generated.")
        return

    pts = len(polys[0])
    print(f"Vertices (Smooth Raster + Low Epsilon): {pts}")
    
    # With gaussian smoothing, we expect a reasonable number of vertices 
    # that follow the curve, not just a square box.
    if pts > 4: 
        print("SUCCESS: Polygon has sufficient detail (curved corner).")
    else:
        print("WARNING: Polygon might be too simple (just a box?).")

if __name__ == "__main__":
    test_smoothing()
