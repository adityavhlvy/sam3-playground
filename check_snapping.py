
import sys
import os
import numpy as np

# Add server directory to path
current_dir = os.path.dirname(os.path.abspath(__file__))
server_dir = os.path.join(current_dir, "server") # Adjust if run from root or server dir relative
if os.path.exists("server"):
    sys.path.append("server")
elif os.path.exists("../server"):
    sys.path.append("../server")
else:
    # Assume we are in server dir
    sys.path.append(".")

try:
    from services.postprocessing import polygon_processor
    print("Successfully imported polygon_processor")
except ImportError as e:
    print(f"Import failed: {e}")
    # Try direct file import for testing logic if module structure fails
    sys.exit(1)

def test_snapping():
    # Create two squares with a gap
    # 100x100 image
    mask1 = np.zeros((100, 100), dtype=np.uint8)
    mask1[20:80, 20:45] = 1 # Left rectangle
    
    mask2 = np.zeros((100, 100), dtype=np.uint8)
    mask2[20:80, 55:80] = 1 # Right rectangle
    
    # Gap is 10 pixels (45 to 55)
    
    print("Testing Snapping...")
    snapped = polygon_processor.snap_masks([mask1, mask2])
    
    # Check if gap is filled
    # Pixel at 50, 50 should now be filled (either 1 or 1 depending on assignment)
    
    # Combined result
    combined = np.zeros((100, 100), dtype=np.uint8)
    combined[snapped[0] > 0] = 1
    combined[snapped[1] > 0] = 2
    
    center_val = combined[50, 50]
    print(f"Value at center gap (50,50): {center_val}")
    
    if center_val > 0:
        print("SUCCESS: Gap filled!")
    else:
        print("FAILURE: Gap not filled.")

def test_cleaning():
    print("Testing Cleaning...")
    mask = np.zeros((100, 100), dtype=np.uint8)
    mask[10:20, 10:20] = 1 # Big square (100 pixels)
    mask[50:52, 50:52] = 1 # Small dot (4 pixels)
    
    cleaned = polygon_processor.clean_masks([mask], min_area_pixels=10)
    
    # Dot should be gone
    if cleaned[0][50, 50] == 0 and cleaned[0][15, 15] == 1:
        print("SUCCESS: Small artifact removed.")
    else:
        print("FAILURE: Cleaning failed.")

if __name__ == "__main__":
    test_cleaning()
    test_snapping()
