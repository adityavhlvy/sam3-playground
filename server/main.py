from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys
import os

# Create the app
app = FastAPI(title="SAM3 Dashboard", version="1.0.0")

# Enable CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add sam3 to python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sam3_root = os.path.abspath(os.path.join(current_dir, "..", "..", "sam3"))
if sam3_root not in sys.path:
    sys.path.append(sam3_root)

# Import Routers
# logic to handle imports if run from inside server/
try:
    from api.train import router as train_router
    from api.inference import router as inference_router
    from api.data_engine import router as data_engine_router
    from api.dataset import router as dataset_router
    from api.system import router as system_router
except ImportError:
    # Try adding server dir to path
    if current_dir not in sys.path:
        sys.path.append(current_dir)
    from api.train import router as train_router
    from api.inference import router as inference_router
    from api.data_engine import router as data_engine_router
    from api.dataset import router as dataset_router
    from api.system import router as system_router

# Include Routers
app.include_router(train_router, prefix="/api/train", tags=["Training"])
app.include_router(inference_router, prefix="/api/inference", tags=["Inference"])
app.include_router(data_engine_router, prefix="/api/data-engine", tags=["Data Engine"])
app.include_router(dataset_router, prefix="/api/dataset", tags=["Dataset"])
app.include_router(system_router, prefix="/api/system", tags=["System"])


@app.get("/")
def read_root():
    return {"status": "ok", "message": "SAM3 Dashboard Server Running"}


@app.get("/health")
def health_check():
    from services.runner import runner_instance

    return {"status": "healthy", "training_running": runner_instance.is_running}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
