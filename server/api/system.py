from fastapi import APIRouter
from fastapi.responses import FileResponse, Response
import torch
import psutil
import platform
import os
import io
from PIL import Image, ImageOps

import tkinter as tk
from tkinter import filedialog
from pydantic import BaseModel
from services.model import model_service

router = APIRouter()

class DeviceConfig(BaseModel):
    force_cpu: bool

@router.post("/set-device")
def set_device(config: DeviceConfig):
    """
    Sets the preferred device logic (Force CPU or Auto).
    """
    model_service.set_device(config.force_cpu)
    return {"status": "success", "force_cpu": model_service.force_cpu, "current_device": model_service.device}

@router.get("/open-file-dialog")
def open_file_dialog():
    """
    Opens a native folder selection dialog on the server (local machine).
    """
    try:
        root = tk.Tk()
        root.withdraw()  # Hide the main window
        root.attributes('-topmost', True)  # Make the dialog appear on top
        folder_path = filedialog.askdirectory()
        root.destroy()
        return {"path": folder_path}
    except Exception as e:
        return {"path": "", "error": str(e)}

@router.get("/info")
def get_system_info():
    """
    Returns system hardware info and current PyTorch device status.
    """
    has_cuda = torch.cuda.is_available()
    device_name = "CPU"
    vram_info = "N/A"
    
    # Try to get GPU name even if we are not using it (for display purposes)
    gpu_name_detected = "Not Detected"
    try:
        if torch.cuda.device_count() > 0:
             gpu_name_detected = torch.cuda.get_device_name(0)
    except:
        pass

    if model_service.device == "cuda" and has_cuda:
        try:
            device_name = torch.cuda.get_device_name(0)
            # Get memory in GB
            total_mem = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            allocated = torch.cuda.memory_allocated(0) / (1024**3)
            vram_info = f"{allocated:.1f}/{total_mem:.1f} GB"
        except Exception:
            device_name = "CUDA GPU (Unknown)"
    elif model_service.force_cpu and has_cuda:
         # CPU is forced, but GPU exists
         device_name = "CPU (Forced)"
         
    # CPU Info
    cpu_percent = psutil.cpu_percent(interval=None)
    ram = psutil.virtual_memory()
    ram_usage = f"{ram.used / (1024**3):.1f}/{ram.total / (1024**3):.1f} GB"

    return {
        "device_type": model_service.device,
        "device_name": device_name,
        "gpu_name_detected": gpu_name_detected,
        "force_cpu": model_service.force_cpu,
        "vram": vram_info,
        "cpu_usage": f"{cpu_percent}%",
        "ram_usage": ram_usage,
        "platform": platform.system()
    }

@router.get("/file/{file_path:path}")
def serve_file(file_path: str):
    """
    Serves a local file. Converts TIF to PNG on fly for browser preview.
    Handles EXIF orientation.
    """
    if not os.path.exists(file_path):
        return {"error": "File not found"}

    # Special handling for TIFF and JPG (to fix rotation)
    if file_path.lower().endswith(('.tif', '.tiff', '.jpg', '.jpeg')):
        try:
            # Use PIL to read and convert
            Image.MAX_IMAGE_PIXELS = None 
            
            with Image.open(file_path) as img:
                # Handle EXIF Orientation (Fix "tilted" or rotated images)
                img = ImageOps.exif_transpose(img)

                # Convert to RGB (handle CMYK or Grayscale TIFs)
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Resize if HUGE to prevent slow transfer (optional, but good for preview)
                max_dim = 2000
                if max(img.size) > max_dim:
                    img.thumbnail((max_dim, max_dim))

                # Save to buffer as PNG
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                buf.seek(0)
                
                return Response(content=buf.getvalue(), media_type="image/png")
        except Exception as e:
            # Fallback to serving raw file if conversion/transpose fails
            return FileResponse(file_path)

    # Default for other files
    return FileResponse(file_path)
