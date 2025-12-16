from fastapi import APIRouter, WebSocket, HTTPException
from fastapi.responses import JSONResponse
import os
import glob
from pydantic import BaseModel
from services.runner import runner_instance
import asyncio

router = APIRouter()


class TrainRequest(BaseModel):
    config_path: str
    overrides: dict = {}


@router.get("/configs")
def list_configs():
    # List configs from sam3/sam3/train/configs
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # server/api -> server -> sam3-dashboard -> parent -> sam3
    sam3_root = os.path.abspath(os.path.join(current_dir, "..", "..", "..", "sam3"))
    configs_dir = os.path.join(sam3_root, "sam3", "train", "configs")

    configs = []
    if os.path.exists(configs_dir):
        # Recursive glob
        for file in glob.glob(
            os.path.join(configs_dir, "**", "*.yaml"), recursive=True
        ):
            rel_path = os.path.relpath(file, sam3_root)
            # We want path relative to sam3 root, so we can pass it to -c
            # sam3/train/configs/foo.yaml -> we typically pass configs/foo.yaml if running from sam3/train?
            # Or absolute path? Hydra usually takes relative to working dir or absolute.
            # Let's verify sam3/train.py usage. "python sam3/train/train.py -c configs/..."
            # It seems it expects path relative to cwd (sam3 root).
            configs.append(rel_path.replace("\\", "/"))

    return {"configs": configs}


@router.post("/start")
def start_training(req: TrainRequest):
    try:
        runner_instance.start_training(req.config_path, req.overrides)
        return {"status": "started"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/stop")
def stop_training():
    success = runner_instance.stop_training()
    if success:
        return {"status": "stopped"}
    return {"status": "not running"}


@router.websocket("/ws/logs")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            logs = runner_instance.get_logs()
            if logs:
                for line in logs:
                    await websocket.send_text(line)
            else:
                await asyncio.sleep(0.1)
    except Exception as e:
        print(f"WebSocket closed: {e}")
