
import sys
import os
import numpy as np

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

def test_cluster_snapping():
    print("Testing Cluster-Clipped Snapping...")
    
    # Create a layout with a GAP
    # Field 1: (50,50) to (100,150)
    # Field 2: (120,50) to (170,150) -> Gap of 20 px
    
    mask1 = np.zeros((200, 200), dtype=np.uint8)
    mask1[50:150, 50:100] = 1
    
    mask2 = np.zeros((200, 200), dtype=np.uint8)
    mask2[50:150, 120:170] = 1
    
    masks = [mask1, mask2]
    
    # Snap with Cluster Logic
    # We expect the gap (100-120) to be filled because they form a cluster.
    # But we expect the OUTER boundary (y < 50 or y > 150) to be relatively preserved (smoothed).
    
    print("Running snap_masks...")
    snapped = polygon_processor.snap_masks(masks, max_snap_dist_ratio=0.2) # High ratio to bridge 20px
    
    s1, s2 = snapped[0], snapped[1]
    
    # Verify Gap Filling
    # Check pixel (110, 100) - middle of gap
    val1 = s1[100, 110]
    val2 = s2[100, 110]
    print(f"Gap Pixel (110,100): mask1={val1}, mask2={val2}")
    
    if val1 > 0 or val2 > 0:
        print("SUCCESS: Gap filled.")
    else:
        print("FAILURE: Gap not filled.")
        
    # Verify Outer Boundary Preservation
    # Check pixel (20, 100) - far outside. Original was 0.
    # With pure Voronoi, this might be filled if background distance is high?
    # But Cluster logic CLIPS it to Smooth Hull.
    
    out_val1 = s1[100, 20] 
    out_val2 = s2[100, 20]
    
    if out_val1 == 0 and out_val2 == 0:
        print("SUCCESS: Outer boundary preserved (did not explode).")
    else:
        print(f"FAILURE: Exploded to infinity (val={out_val1 or out_val2}).")

if __name__ == "__main__":
    test_cluster_snapping()
