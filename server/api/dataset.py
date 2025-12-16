from fastapi import APIRouter, UploadFile, File, HTTPException, Body
from pydantic import BaseModel
import os
import shutil
import zipfile
import json
import cv2
import numpy as np
from typing import Optional, List
import sys
from datetime import datetime
from PIL import Image
Image.MAX_IMAGE_PIXELS = None  # Allow large images

# Define base paths
SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASETS_DIR = os.path.join(SERVER_DIR, "data", "datasets")
SAM3_ROOT = os.path.abspath(os.path.join(SERVER_DIR, "..", "..", "sam3"))
CONFIGS_DIR = os.path.join(SAM3_ROOT, "sam3", "train", "configs", "custom")

# Ensure directories exist
os.makedirs(DATASETS_DIR, exist_ok=True)
os.makedirs(CONFIGS_DIR, exist_ok=True)

router = APIRouter()

class ConfigRequest(BaseModel):
    dataset_name: str
    dataset_path: str
    description: Optional[str] = None

class PathValidationRequest(BaseModel):
    dataset_path: str

class ConvertRequest(BaseModel):
    source_image_dir: str
    source_mask_dir: str
    dataset_name: str
    category_name: str = "object"
    resize_to: Optional[int] = None

@router.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """
    Uploads a ZIP file containing the dataset (COCO format).
    Extracts it to server/data/datasets/<filename_without_ext>.
    """
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are allowed.")

    dataset_name = file.filename[:-4]  # remove .zip
    EXTRACT_PATH = os.path.join(DATASETS_DIR, dataset_name)
    
    # Save the uploaded zip temporarily
    temp_zip_path = os.path.join(DATASETS_DIR, file.filename)
    try:
        with open(temp_zip_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Extract files
        if os.path.exists(EXTRACT_PATH):
             shutil.rmtree(EXTRACT_PATH) # Overwrite if exists
             
        with zipfile.ZipFile(temp_zip_path, 'r') as zip_ref:
            zip_ref.extractall(EXTRACT_PATH)
            
    except Exception as e:
        shutil.rmtree(EXTRACT_PATH, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to process zip file: {str(e)}")
    finally:
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path) # Clean up zip

    return {
        "message": "Dataset uploaded and extracted successfully",
        "dataset_name": dataset_name,
        "dataset_path": EXTRACT_PATH,
        "files_count": sum(len(files) for _, _, files in os.walk(EXTRACT_PATH))
    }

@router.post("/validate-path")
def validate_local_path(request: PathValidationRequest):
    """
    Validates if a local folder exists and contains _annotations.coco.json.
    Searches recursively.
    """
    if not os.path.exists(request.dataset_path):
        return {"valid": False, "message": "Directory not found"}
        
    found_json = False
    json_path = ""
    
    for root, dirs, files in os.walk(request.dataset_path):
        if "_annotations.coco.json" in files:
            found_json = True
            json_path = os.path.join(root, "_annotations.coco.json")
            break
    
    if found_json:
        return {"valid": True, "message": "Valid COCO dataset found", "json_path": json_path, "root_path": request.dataset_path}
    else:
        return {"valid": False, "message": "No _annotations.coco.json found in directory or subdirectories"}

@router.post("/convert")
def convert_dataset(request: ConvertRequest):
    """
    Converts a folder of images and a folder of masks (images) into a SAM 3 COCO dataset.
    """
    if not os.path.exists(request.source_image_dir):
        raise HTTPException(status_code=404, detail="Source image directory not found")
    if not os.path.exists(request.source_mask_dir):
        raise HTTPException(status_code=404, detail="Source mask directory not found")

    output_dir = os.path.join(DATASETS_DIR, request.dataset_name)
    train_dir = os.path.join(output_dir, "train")
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(train_dir)

    images = []
    annotations = []
    categories = [{"id": 1, "name": request.category_name, "supercategory": "none"}]
    
    image_files = sorted([f for f in os.listdir(request.source_image_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.tif', '.tiff'))])
    
    ann_id_counter = 1
    
    for idx, filename in enumerate(image_files):
        img_id = idx + 1
        img_path = os.path.join(request.source_image_dir, filename)
        
        # Determine mask filename (assuming same name or slight variation)
        # Try exact match, then replace ext, then append _mask
        base_name = os.path.splitext(filename)[0]
        possible_mask_names = [
            filename,
            base_name + ".png",
            base_name + ".tif",
            base_name + ".tiff",
            base_name + "_mask.png",
            base_name + "_mask.tif"
        ]
        
        mask_path = None
        for m_name in possible_mask_names:
            p = os.path.join(request.source_mask_dir, m_name)
            if os.path.exists(p):
                mask_path = p
                break
        
        # Load Image to check dimensions and convert if needed
        # We use cv2 to load, if TIF it handles it, then save as JPG for standard SAM3 loader compat
        # (Though we modified loader to handle some, converting to JPG is safest for web/standard pipeline)
        try:
            img = cv2.imread(img_path)
            if img is None:
                continue
            
            height, width = img.shape[:2]
            
            # Save to destination (always convert to jpg for web compatibility/simplicity)
            dest_filename = f"{base_name}.jpg"
            dest_path = os.path.join(train_dir, dest_filename)
            cv2.imwrite(dest_path, img)
            
            images.append({
                "id": img_id,
                "file_name": dest_filename,
                "width": width,
                "height": height
            })
            
            # Process Mask
            if mask_path:
                mask = None
                # Try loading with OpenCV first (standard)
                # cv2.imread might fail on some TIFs (e.g. 1-bit or float)
                try:
                    # Check extension, if TIF try PIL first simply because we know cv2 struggles here
                    if mask_path.lower().endswith(('.tif', '.tiff')):
                         try:
                             pil_mask = Image.open(mask_path)
                             mask = np.array(pil_mask)
                         except Exception as e:
                             print(f"PIL load failed for {mask_path}, trying cv2: {e}")
                             mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
                    else:
                        mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
                except Exception:
                    print(f"Failed to load mask: {mask_path}")
                
                # Check if PIL loaded something (might be bool or weird shape)
                if mask is not None:
                    # Convert to standard uint8 grayscale if needed
                    if mask.dtype == bool:
                        mask = mask.astype(np.uint8) * 255
                    elif mask.dtype != np.uint8:
                         # Normalize or cast
                         # For masks, usually unique values matter.
                         # If float, maybe cast. Safe bet:
                         mask = mask.astype(np.uint8)

                    # Handle case where PIL reads as (H, W, C) or something
                    if len(mask.shape) == 3:
                        mask = cv2.cvtColor(mask, cv2.COLOR_RGB2GRAY) if mask.shape[2] == 3 else mask[:,:,0]

                    # Resize mask if image was resized
                    if mask.shape[:2] != (height, width):
                        mask = cv2.resize(mask, (width, height), interpolation=cv2.INTER_NEAREST)
                    
                    # Threshold to binary (0 or 255)
                    # Use a low threshold to catch any non-zero label
                    _, thresh = cv2.threshold(mask, 0, 255, cv2.THRESH_BINARY)
                    
                    # Find contours
                    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    
                    for cnt in contours:
                        if cv2.contourArea(cnt) < 10: # Filter tiny noise
                            continue
                            
                        # Bbox
                        x, y, w, h = cv2.boundingRect(cnt)
                        
                        # Segmentation
                        segmentation = [cnt.flatten().tolist()]
                        
                        annotations.append({
                            "id": ann_id_counter,
                            "image_id": img_id,
                            "category_id": 1,
                            "bbox": [x, y, w, h],
                            "segmentation": segmentation,
                            "area": float(w * h), # Approx area
                            "iscrowd": 0
                        })
                        ann_id_counter += 1
                        
        except Exception as e:
            print(f"Error processing {filename}: {e}")
            # If we failed before adding to images list, it's fine.
            # If we added to images list but failed mask, image exists without mask.
            continue

    # Create test/valid folders (copy train data slightly or just empty for now to satisfy config)
    # For now we just point test to train in config or replicate simplified structure
    # Let's simple create a test/valid folder with symlinks or just copies of first few images
    test_dir = os.path.join(output_dir, "test")
    os.makedirs(test_dir, exist_ok=True)
    # Copy first image to test just to have something
    if len(images) > 0:
         first_img_filename = images[0]["file_name"]
         shutil.copy(os.path.join(train_dir, first_img_filename), os.path.join(test_dir, first_img_filename))
         
         # Create dummy annotation for test
         test_coco = {
             "images": [images[0]],
             "annotations": [],
             "categories": categories
         }
         with open(os.path.join(test_dir, "_annotations.coco.json"), "w") as f:
             json.dump(test_coco, f)


    # Save Train Annotation
    coco_output = {
        "images": images,
        "annotations": annotations,
        "categories": categories
    }
    
    with open(os.path.join(train_dir, "_annotations.coco.json"), "w") as f:
        json.dump(coco_output, f)
        
    return {
        "message": "Conversion complete",
        "dataset_name": request.dataset_name,
        "dataset_path": output_dir,
        "images_processed": len(images),
        "annotations_created": len(annotations)
    }

@router.post("/create-config")
def create_config(request: ConfigRequest):
    """
    Creates a new SAM3 training config yaml file pointing to the uploaded dataset.
    Uses a standard template based on the Roboflow config.
    """
    
    # Basic validation of the dataset path
    if not os.path.exists(request.dataset_path):
        raise HTTPException(status_code=404, detail="Dataset path does not exist on server.")

    # Template content (Simplified version of roboflow_v100 config)
    # We verify if 'train' folder exists to guess structure, or assumed standard COCO
    
    config_filename = f"{request.dataset_name}.yaml"
    config_path = os.path.join(CONFIGS_DIR, config_filename)

    # We use forward slashes for paths in YAML to avoid escape char issues on Windows
    safe_dataset_path = request.dataset_path.replace("\\", "/")
    
    # Basic Template
    yaml_content = f"""# @package _global_
defaults:
  - _self_

# ============================================================================
# Custom Dataset Configuration: {request.dataset_name}
# ============================================================================
paths:
  roboflow_vl_100_root: "{safe_dataset_path}"
  experiment_log_dir: "../sam3-inference" # Default output dir
  bpe_path: "assets/bpe_simple_vocab_16e6.txt.gz"

# Dataset configuration
roboflow_train:
  num_images: null # Use all images
  supercategory: "train" # Assuming the folder inside is named 'train' or root contains 'train'
  
  # Standard SAM3 Training Transforms
  train_transforms:
    - _target_: sam3.train.transforms.basic_for_api.ComposeAPI
      transforms:
        - _target_: sam3.train.transforms.filter_query_transforms.FlexibleFilterFindGetQueries
          query_filter:
            _target_: sam3.train.transforms.filter_query_transforms.FilterCrowds
        - _target_: sam3.train.transforms.point_sampling.RandomizeInputBbox
          box_noise_std: 0.1
          box_noise_max: 20
        - _target_: sam3.train.transforms.segmentation.DecodeRle
        - _target_: sam3.train.transforms.basic_for_api.RandomResizeAPI
          sizes:
            _target_: sam3.train.transforms.basic.get_random_resize_scales
            size: ${{scratch.resolution}}
            min_size: 480
            rounded: false
          max_size:
            _target_: sam3.train.transforms.basic.get_random_resize_max_size
            size: ${{scratch.resolution}}
          square: true
          consistent_transform: ${{scratch.consistent_transform}}
        - _target_: sam3.train.transforms.basic_for_api.PadToSizeAPI
          size: ${{scratch.resolution}}
          consistent_transform: ${{scratch.consistent_transform}}
        - _target_: sam3.train.transforms.basic_for_api.ToTensorAPI
        - _target_: sam3.train.transforms.filter_query_transforms.FlexibleFilterFindGetQueries
          query_filter:
            _target_: sam3.train.transforms.filter_query_transforms.FilterEmptyTargets
        - _target_: sam3.train.transforms.basic_for_api.NormalizeAPI
          mean: ${{scratch.train_norm_mean}}
          std: ${{scratch.train_norm_std}}
        - _target_: sam3.train.transforms.filter_query_transforms.FlexibleFilterFindGetQueries
          query_filter:
            _target_: sam3.train.transforms.filter_query_transforms.FilterEmptyTargets
    - _target_: sam3.train.transforms.filter_query_transforms.FlexibleFilterFindGetQueries
      query_filter:
        _target_: sam3.train.transforms.filter_query_transforms.FilterFindQueriesWithTooManyOut
        max_num_objects: ${{scratch.max_ann_per_img}}

  val_transforms:
    - _target_: sam3.train.transforms.basic_for_api.ComposeAPI
      transforms:
        - _target_: sam3.train.transforms.basic_for_api.RandomResizeAPI
          sizes: ${{scratch.resolution}}
          max_size:
            _target_: sam3.train.transforms.basic.get_random_resize_max_size
            size: ${{scratch.resolution}}
          square: true
          consistent_transform: False
        - _target_: sam3.train.transforms.basic_for_api.ToTensorAPI
        - _target_: sam3.train.transforms.basic_for_api.NormalizeAPI
          mean: ${{scratch.train_norm_mean}}
          std: ${{scratch.train_norm_std}}

  loss:
    _target_: sam3.train.loss.sam3_loss.Sam3LossWrapper
    matcher: ${{scratch.matcher}}
    o2m_weight: 2.0
    o2m_matcher:
      _target_: sam3.train.matcher.BinaryOneToManyMatcher
      alpha: 0.3
      threshold: 0.4
      topk: 4
    use_o2m_matcher_on_o2m_aux: false
    loss_fns_find:
      - _target_: sam3.train.loss.loss_fns.Boxes
        weight_dict:
          loss_bbox: 5.0
          loss_giou: 2.0
      - _target_: sam3.train.loss.loss_fns.IABCEMdetr
        weak_loss: False
        weight_dict:
          loss_ce: 20.0
          presence_loss: 20.0
        pos_weight: 10.0
        alpha: 0.25
        gamma: 2
        use_presence: True
        pos_focal: false
        pad_n_queries: 200
        pad_scale_pos: 1.0
    loss_fn_semantic_seg: null
    scale_by_find_batch_size: ${{scratch.scale_by_find_batch_size}}

scratch:
  enable_segmentation: False
  d_model: 256
  pos_embed:
    _target_: sam3.model.position_encoding.PositionEmbeddingSine
    num_pos_feats: ${{scratch.d_model}}
    normalize: true
    scale: null
    temperature: 10000
  use_presence_eval: True
  original_box_postprocessor:
    _target_: sam3.eval.postprocessors.PostProcessImage
    max_dets_per_img: -1
    use_original_ids: true
    use_original_sizes_box: true
    use_presence: ${{scratch.use_presence_eval}}
  matcher:
    _target_: sam3.train.matcher.BinaryHungarianMatcherV2
    focal: true
    cost_class: 2.0
    cost_bbox: 5.0
    cost_giou: 2.0
    alpha: 0.25
    gamma: 2
    stable: False
  scale_by_find_batch_size: True
  resolution: 1008
  consistent_transform: False
  max_ann_per_img: 200
  train_norm_mean: [0.5, 0.5, 0.5]
  train_norm_std: [0.5, 0.5, 0.5]
  val_norm_mean: [0.5, 0.5, 0.5]
  val_norm_std: [0.5, 0.5, 0.5]
  num_train_workers: 4 # Reduced for typical environments
  num_val_workers: 0
  max_data_epochs: 20
  target_epoch_size: 1500
  hybrid_repeats: 1
  context_length: 2
  gather_pred_via_filesys: false
  lr_scale: 0.1
  lr_transformer: ${{times:8e-4,${{scratch.lr_scale}}}}
  lr_vision_backbone: ${{times:2.5e-4,${{scratch.lr_scale}}}}
  lr_language_backbone: ${{times:5e-5,${{scratch.lr_scale}}}}
  lrd_vision_backbone: 0.9
  wd: 0.1
  scheduler_timescale: 20
  scheduler_warmup: 20
  scheduler_cooldown: 20
  val_batch_size: 1
  collate_fn_val:
    _target_: sam3.train.data.collator.collate_fn_api
    _partial_: true
    repeats: ${{scratch.hybrid_repeats}}
    dict_key: roboflow100
    with_seg_masks: ${{scratch.enable_segmentation}}
  gradient_accumulation_steps: 1
  train_batch_size: 1
  collate_fn:
    _target_: sam3.train.data.collator.collate_fn_api
    _partial_: true
    repeats: ${{scratch.hybrid_repeats}}
    dict_key: all
    with_seg_masks: ${{scratch.enable_segmentation}}

trainer:
  _target_: sam3.train.trainer.Trainer
  skip_saving_ckpts: true
  empty_gpu_mem_cache_after_eval: True
  skip_first_val: True
  max_epochs: 20
  accelerator: auto # Changed from cuda to auto for compatibility
  seed_value: 123
  val_epoch_freq: 10
  mode: train
  gradient_accumulation_steps: ${{scratch.gradient_accumulation_steps}}
  distributed:
    backend: nccl
    find_unused_parameters: True
    gradient_as_bucket_view: True
  loss:
    all: ${{roboflow_train.loss}}
    default:
      _target_: sam3.train.loss.sam3_loss.DummyLoss
  data:
    train:
      _target_: sam3.train.data.torch_dataset.TorchDataset
      dataset:
        _target_: sam3.train.data.sam3_image_dataset.Sam3ImageDataset
        limit_ids: ${{roboflow_train.num_images}}
        transforms: ${{roboflow_train.train_transforms}}
        load_segmentation: ${{scratch.enable_segmentation}}
        max_ann_per_img: 500000
        multiplier: 1
        max_train_queries: 50000
        max_val_queries: 50000
        training: true
        use_caching: False
        # Updated to point to the extracted folder structure
        img_folder: ${{paths.roboflow_vl_100_root}}/${{roboflow_train.supercategory}}/
        ann_file: ${{paths.roboflow_vl_100_root}}/${{roboflow_train.supercategory}}/_annotations.coco.json
      shuffle: True
      batch_size: ${{scratch.train_batch_size}}
      num_workers: ${{scratch.num_train_workers}}
      pin_memory: True
      drop_last: True
      collate_fn: ${{scratch.collate_fn}}
    val:
      _target_: sam3.train.data.torch_dataset.TorchDataset
      dataset:
        _target_: sam3.train.data.sam3_image_dataset.Sam3ImageDataset
        load_segmentation: ${{scratch.enable_segmentation}}
        coco_json_loader:
          _target_: sam3.train.data.coco_json_loaders.COCO_FROM_JSON
          include_negatives: true
          category_chunk_size: 2
          _partial_: true
        # Updated path for validation (assuming test folder exists)
        img_folder: ${{paths.roboflow_vl_100_root}}/test/
        ann_file: ${{paths.roboflow_vl_100_root}}/test/_annotations.coco.json
        transforms: ${{roboflow_train.val_transforms}}
        max_ann_per_img: 100000
        multiplier: 1
        training: false
      shuffle: False
      batch_size: ${{scratch.val_batch_size}}
      num_workers: ${{scratch.num_val_workers}}
      pin_memory: True
      drop_last: False
      collate_fn: ${{scratch.collate_fn_val}}
  model:
    _target_: sam3.model_builder.build_sam3_image_model
    bpe_path: ${{paths.bpe_path}}
    device: "cuda" # Can be changed to "cpu"
    eval_mode: false
    enable_segmentation: ${{scratch.enable_segmentation}}
  meters:
    val:
      roboflow100:
        detection:
          _target_: sam3.eval.coco_writer.PredictionDumper
          iou_type: "bbox"
          dump_dir: ${{launcher.experiment_log_dir}}/dumps/custom/${{roboflow_train.supercategory}}
          merge_predictions: True
          postprocessor: ${{scratch.original_box_postprocessor}}
          gather_pred_via_filesys: ${{scratch.gather_pred_via_filesys}}
          maxdets: 100
          pred_file_evaluators:
            - _target_: sam3.eval.coco_eval_offline.CocoEvaluatorOfflineWithPredFileEvaluators
              gt_path: ${{paths.roboflow_vl_100_root}}/test/_annotations.coco.json
              tide: False
              iou_type: "bbox"
  optim:
    amp:
      enabled: True
      amp_dtype: bfloat16
    optimizer:
      _target_: torch.optim.AdamW
    gradient_clip:
      _target_: sam3.train.optim.optimizer.GradientClipper
      max_norm: 0.1
      norm_type: 2
    param_group_modifiers:
      - _target_: sam3.train.optim.optimizer.layer_decay_param_modifier
        _partial_: True
        layer_decay_value: ${{scratch.lrd_vision_backbone}}
        apply_to: 'backbone.vision_backbone.trunk'
        overrides:
          - pattern: '*pos_embed*'
            value: 1.0
    options:
      lr:
        - scheduler:
            _target_: sam3.train.optim.schedulers.InverseSquareRootParamScheduler
            base_lr: ${{scratch.lr_transformer}}
            timescale: ${{scratch.scheduler_timescale}}
            warmup_steps: ${{scratch.scheduler_warmup}}
            cooldown_steps: ${{scratch.scheduler_cooldown}}
        - scheduler:
            _target_: sam3.train.optim.schedulers.InverseSquareRootParamScheduler
            base_lr: ${{scratch.lr_vision_backbone}}
            timescale: ${{scratch.scheduler_timescale}}
            warmup_steps: ${{scratch.scheduler_warmup}}
            cooldown_steps: ${{scratch.scheduler_cooldown}}
          param_names:
            - 'backbone.vision_backbone.*'
        - scheduler:
            _target_: sam3.train.optim.schedulers.InverseSquareRootParamScheduler
            base_lr: ${{scratch.lr_language_backbone}}
            timescale: ${{scratch.scheduler_timescale}}
            warmup_steps: ${{scratch.scheduler_warmup}}
            cooldown_steps: ${{scratch.scheduler_cooldown}}
          param_names:
            - 'backbone.language_backbone.*'
      weight_decay:
        - scheduler:
            _target_: fvcore.common.param_scheduler.ConstantParamScheduler
            value: ${{scratch.wd}}
        - scheduler:
            _target_: fvcore.common.param_scheduler.ConstantParamScheduler
            value: 0.0
          param_names:
            - '*bias*'
          module_cls_names: ['torch.nn.LayerNorm']
  checkpoint:
    save_dir: ${{launcher.experiment_log_dir}}/checkpoints
    save_freq: 0
  logging:
    tensorboard_writer:
      _target_: sam3.train.utils.logger.make_tensorboard_logger
      log_dir: ${{launcher.experiment_log_dir}}/tensorboard
      flush_secs: 120
      should_log: True
    wandb_writer: null
    log_dir: ${{launcher.experiment_log_dir}}/logs/${{roboflow_train.supercategory}}
    log_freq: 10

launcher:
  num_nodes: 1
  gpus_per_node: 1 # Default 1
  experiment_log_dir: ${{paths.experiment_log_dir}}
  multiprocessing_context: spawn

submitit:
  account: null
  partition: null
  qos: null
  timeout_hour: 72
  use_cluster: False # Local training
  cpus_per_task: 4
  port_range: [10000, 65000]
  constraint: null
  job_array:
    num_tasks: 1
    task_index: 0

all_roboflow_supercategories:
  - train 
"""
    
    with open(config_path, "w") as f:
        f.write(yaml_content)
        
    return {
        "message": "Configuration created successfully",
        "config_path": config_path,
        "config_name": f"custom/{request.dataset_name}"
    }
