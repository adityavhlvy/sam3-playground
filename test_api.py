import requests
import json
import cv2
import numpy as np

# Configuration
API_URL = "http://localhost:8000/predict/image"
IMAGE_PATH = "test_image.jpg" # Place a test image here or change path

def create_dummy_image():
    # Create a simple image with a white square in the middle
    img = np.zeros((500, 500, 3), dtype=np.uint8)
    cv2.rectangle(img, (100, 100), (400, 400), (255, 255, 255), -1)
    cv2.imwrite("test_image.jpg", img)
    print("Created dummy test_image.jpg")

def test_text_prompt():
    print("\n--- Testing Text Prompt (PCS) ---")
    files = {'image': open(IMAGE_PATH, 'rb')}
    data = {'prompt': 'square', 'task_type': 'search'}
    try:
        response = requests.post(API_URL, files=files, data=data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json().keys()}")
        print(f"Masks found: {len(response.json().get('masks', []))}")
    except Exception as e:
        print(f"Error: {e}")

def test_box_prompt_exemplar():
    print("\n--- Testing Box Prompt (Exemplar PCS) ---")
    files = {'image': open(IMAGE_PATH, 'rb')}
    # Box covering the white square [100, 100, 400, 400]
    boxes = [[100, 100, 400, 400]]
    data = {
        'boxes': json.dumps(boxes),
        'task_type': 'exemplar'
    }
    try:
        response = requests.post(API_URL, files=files, data=data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json().keys()}")
        print(f"Masks found: {len(response.json().get('masks', []))}")
    except Exception as e:
        print(f"Error: {e}")

def test_point_prompt_interactive():
    print("\n--- Testing Point Prompt (Interactive PVS) ---")
    files = {'image': open(IMAGE_PATH, 'rb')}
    # Point in the middle of the square
    points = [[250, 250]]
    point_labels = [1]
    data = {
        'points': json.dumps(points),
        'point_labels': json.dumps(point_labels),
        'task_type': 'interactive'
    }
    try:
        response = requests.post(API_URL, files=files, data=data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json().keys()}")
        print(f"Masks found: {len(response.json().get('masks', []))}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    create_dummy_image()
    test_text_prompt()
    test_box_prompt_exemplar()
    test_point_prompt_interactive()
