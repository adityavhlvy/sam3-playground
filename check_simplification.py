
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

try:
    from services.postprocessing import polygon_processor
    print("Successfully imported polygon_processor")
except ImportError as e:
    print(f"Import failed: {e}")
    sys.exit(1)

def test_simplification():
    print("Testing Simplification...")
    
    # Create a circle-ish shape (jagged high res)
    mask = np.zeros((200, 200), dtype=np.uint8)
    cv2.circle(mask, (100, 100), 50, 1, -1)
    
    # Add some noise/jaggedness
    noise = np.random.randint(0, 2, (200, 200), dtype=np.uint8)
    # mask = cv2.bitwise_and(mask, noise) # Too messy
    
    # Just check circle vertex count vs simplified
    contours_orig, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    orig_pts = len(contours_orig[0])
    print(f"Original Circle Points (approx): {orig_pts}")
    
    # Simplify
    polys = polygon_processor.mask_to_polygons(mask, epsilon_factor=0.005) # 0.5%
    
    if not polys:
        print("FAILURE: No polygons returned")
        return

    simp_pts = len(polys[0])
    print(f"Simplified Circle Points: {simp_pts}")
    
    if simp_pts < orig_pts * 0.2:
        print(f"SUCCESS: Significant reduction ({100 - simp_pts/orig_pts*100:.1f}%)")
    else:
        print("WARNING: Reduction might be too low?")

if __name__ == "__main__":
    test_simplification()
