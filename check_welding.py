
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

from services.postprocessing import polygon_processor

def test_welding():
    print("Testing Topology Welding...")
    
    # Create two triangles that share an edge but are slightly off
    # Triangle A: (0,0), (100,0), (50,50)
    # Triangle B: (0,0), (100,0), (50, -50) -- Perfect fit
    
    # Let's make them slightly imperfect
    # Poly A: Middle point at (50, 50)
    # Poly B: Middle point at (52, 52) (Should weld)
    
    # Normalized coords (assuming 100x100 img)
    # Poly A vertices: (0.5, 0.5), (0.6, 0.6), (0.4, 0.6)
    # Poly B vertices: (0.505, 0.505), (0.6, 0.6), (0.4, 0.6) -> Point 1 is close
    
    # Using Pixel coordinates for clarity then normalizing
    W, H = 1000, 1000
    
    # ID: List of Polygons: List of Points
    proposals = {
        "A": [[
            [500/W, 500/H], # Shared-ish
            [600/W, 600/H],
            [400/W, 600/H]
        ]],
        "B": [[
            [504/W, 504/H], # 4 pixels away. Threshold is 5. Should weld.
            [600/W, 400/H],
            [400/W, 400/H]
        ]]
    }
    
    print("Running weld_polygons...")
    welded = polygon_processor.weld_polygons(proposals, weld_threshold_pixels=10.0, img_dims=(H, W))
    
    pt_A_0 = welded["A"][0][0]
    pt_B_0 = welded["B"][0][0]
    
    print(f"Poly A Point 0: {pt_A_0}")
    print(f"Poly B Point 0: {pt_B_0}")
    
    # Check if identical objects or values
    if pt_A_0 == pt_B_0:
        print("SUCCESS: Vertices are exactly identical.")
        print(f"Diff: {abs(pt_A_0[0] - pt_B_0[0])}")
    else:
        print("FAILURE: Vertices didn't weld (or not identical values).")
        print(f"Dist x: {abs(pt_A_0[0] - pt_B_0[0])*W} px")

if __name__ == "__main__":
    test_welding()
