# SAM3 Dashboard

An interactive full-stack dashboard for **Segment Anything Model 3** (SAM3), providing a complete pipeline for image segmentation, model fine-tuning, data labeling, and performance evaluation on geospatial/satellite imagery.

---

## 🚀 Features

### 📊 Dashboard (Home)
- System status overview and model health check
- Quick access to all features

### 🧠 Inference
- **Single image segmentation** with SAM3
- Multiple prompt types support:
  - **Text Prompts** (PCS - Promptable Concept Segmentation)
  - **Box Prompts** (Exemplar boxes)
  - **Point Prompts** (Interactive mode)
- Supports **TIFF**, **PNG**, **JPG**, and other image formats
- Real-time mask visualization with overlays

### 🎯 Training
- Fine-tune SAM3 on custom datasets
- Real-time training logs and TensorBoard integration
- Training configuration management

### ⚙️ Data Engine
A complete 3-phase data labeling pipeline:
- **Phase 1: Batch Processing** – Run SAM3 on entire image folders with text prompts
- **Phase 2: Verification** – Human-in-the-loop verification with accept/reject/flag voting
- **Phase 3: Correction** – Polygon editor for manual mask correction (with vertex editing, simplification, zoom, keyboard shortcuts)
- **Export** – COCO-format dataset export with RLE encoding for SAM3 training

### 📁 Datasets
- Upload ZIP datasets (COCO format)
- Convert image+mask folders to COCO format
- Validate local paths
- Create training configuration files

### 📈 Evaluation
- IoU (Intersection over Union) metric computation
- Compare predictions against ground truth
- Store and list evaluation results

---

## 🛠️ Tech Stack

### Client (Frontend)
| Technology | Version |
|------------|---------|
| Next.js | 16.0.10 |
| React | 19.2.1 |
| TypeScript | 5.x |
| TailwindCSS | 4.x |
| DaisyUI | 5.x (beta) |
| Fabric.js | 7.1.0 |
| Chart.js | 4.5.1 |
| Lucide React | 0.561.0 |

### Server (Backend)
| Technology | Purpose |
|------------|---------|
| FastAPI | REST API Framework |
| Uvicorn | ASGI Server |
| SQLAlchemy | ORM & Database |
| SQLite | Database (sam3.db) |
| OpenCV | Image Processing |
| PyCocoTools | COCO Format Handling |
| TensorBoard | Training Metrics |

---

## 📁 Project Structure

```
sam3-dashboard/
├── client/                    # Frontend (Next.js)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx              # Dashboard home
│   │   │   ├── layout.tsx            # App layout with sidebar
│   │   │   ├── inference/page.tsx    # Inference UI
│   │   │   ├── train/page.tsx        # Training UI
│   │   │   ├── data-engine/page.tsx  # Data Engine UI
│   │   │   ├── dataset/page.tsx      # Dataset management
│   │   │   └── evaluate/page.tsx     # Evaluation UI
│   │   └── components/
│   │       ├── AnnotationCanvas.tsx  # Mask overlay visualization
│   │       ├── PolygonEditor.tsx     # Fabric.js polygon editor
│   │       ├── VerificationQueue.tsx # Phase 2 verification
│   │       ├── CorrectionQueue.tsx   # Phase 3 correction
│   │       └── SystemStatus.tsx      # System health display
│   └── package.json
│
├── server/                    # Backend (FastAPI)
│   ├── main.py                # App entrypoint
│   ├── requirements.txt
│   ├── start_server.bat       # Windows startup script
│   ├── api/                   # API Routers
│   │   ├── inference.py       # /api/inference
│   │   ├── train.py           # /api/train
│   │   ├── data_engine.py     # /api/data-engine
│   │   ├── dataset.py         # /api/dataset
│   │   ├── evaluate.py        # /api/evaluate
│   │   └── system.py          # /api/system
│   ├── services/              # Business Logic
│   │   ├── model.py           # SAM3 ModelService wrapper
│   │   ├── preprocessing.py   # Image preprocessing
│   │   ├── runner.py          # Training runner
│   │   └── verifier.py        # Auto-verification
│   └── data/                  # Database
│       ├── database.py        # SQLAlchemy setup
│       └── models.py          # ImageItem, MaskProposal
│
├── scripts/                   # Pipeline Automation
│   ├── data_engine_cli.py     # CLI for batch processing
│   ├── evaluate_iou.py        # IoU evaluation script
│   ├── run_pipeline.bat       # Windows pipeline runner
│   └── run_pipeline.sh        # Linux/Mac pipeline runner
│
└── docs/                      # Documentation
```

---

## 📋 Prerequisites

| Requirement | Version |
|-------------|---------|
| **OS** | Windows 10/11 (tested), Linux/Mac (partial) |
| **Python** | 3.10+ |
| **Node.js** | 18+ or **Bun** (recommended) |
| **CUDA** | 12.6+ (for GPU inference) |
| **GPU** | NVIDIA with 8GB+ VRAM (optional, CPU fallback available) |

---

## 📦 Required Repositories

The dashboard requires the following folder structure (sibling directories):

```
geospatial-deliniation/        # Parent folder
├── sam3/                      # SAM3 model core
├── sam3-inference/            # Model weights & checkpoints
└── sam3-dashboard/            # This repository
```

### Repository Sources

| Folder | Source | Description |
|--------|--------|-------------|
| `sam3` | [github.com/adityavhlvy/sam3](https://github.com/adityavhlvy/sam3) | Modified SAM3 model code |
| `sam3-inference` | [huggingface.co/facebook/sam3](https://huggingface.co/facebook/sam3) | Model weights (`sam3.pt`) |
| `sam3-dashboard` | This repo | Dashboard frontend & backend |

---

## 🚀 Installation & Setup

### 1. Setup SAM3 Model (`sam3/`)

```powershell
cd sam3

# Create virtual environment (MUST be named .venv)
python -m venv .venv

# Activate
.venv\Scripts\activate

# Install PyTorch (CUDA 12.6)
pip install torch==2.5.1 torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126

# Or for CPU only:
# pip install torch==2.5.1 torchvision torchaudio

# Install SAM3
pip install -e .
pip install -e ".[notebooks,train]"
```

### 2. Setup Dashboard Server (`sam3-dashboard/server/`)

```powershell
cd sam3-dashboard/server

# Activate sam3 venv (IMPORTANT: reuse the same venv)
..\..\sam3\.venv\Scripts\activate

# Install server dependencies
pip install -r requirements.txt
```

### 3. Setup Dashboard Client (`sam3-dashboard/client/`)

```powershell
cd sam3-dashboard/client

# Install with Bun (recommended)
bun install

# Or with npm
npm install
```

---

## ▶️ Running the Application

### Start the Backend Server

```powershell
cd sam3-dashboard/server

# Option 1: Use the startup script
./start_server.bat

# Option 2: Manual
..\..\sam3\.venv\Scripts\activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Server will run at: **http://localhost:8000**
API Docs: **http://localhost:8000/docs**

### Start the Frontend Client

```powershell
cd sam3-dashboard/client

# With Bun
bun run dev

# With npm
npm run dev
```

Client will run at: **http://localhost:3000**

---

## 🔌 API Reference

### Inference API (`/api/inference`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/predict` | POST | Run SAM3 inference on image |
| `/preview` | POST | Convert TIFF to preview JPEG |

### Data Engine API (`/api/data-engine`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/items` | GET | List images in dataset |
| `/batch-generate` | POST | Run batch SAM3 processing |
| `/verification-queue` | GET | Get items pending verification |
| `/flagged-queue` | GET | Get items flagged for correction |
| `/verify` | POST | Submit verification decision |
| `/bulk-verify` | POST | Bulk update proposals |
| `/export` | POST | Export COCO dataset |

### Dataset API (`/api/dataset`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/upload` | POST | Upload ZIP dataset |
| `/validate` | POST | Validate local path |
| `/convert` | POST | Convert images+masks to COCO |
| `/config` | POST | Create training config |

### Evaluation API (`/api/evaluate`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/run` | POST | Run IoU evaluation |
| `/results/{name}` | GET | Get evaluation results |
| `/list` | GET | List all evaluations |

### Training API (`/api/train`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/start` | POST | Start training |
| `/stop` | POST | Stop training |
| `/status` | GET | Get training status |

### System API (`/api/system`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | System health check |
| `/device` | POST | Toggle CPU/GPU mode |

---

## 📊 Database Schema

### `ImageItem`
| Column | Type | Description |
|--------|------|-------------|
| id | Integer (PK) | Auto-increment ID |
| file_path | String (Unique) | Path to image file |
| file_type | String | "image" or "video" |

### `MaskProposal`
| Column | Type | Description |
|--------|------|-------------|
| id | Integer (PK) | Auto-increment ID |
| image_id | Integer (FK) | Reference to ImageItem |
| prompt_text | String | Text prompt used |
| prompt_type | String | "txt", "click", "box" |
| mask_data | JSON | RLE or polygon mask data |
| score | Integer | Confidence score 0-100 |
| status | String | "pending", "generated", "accepted", "rejected", "flagged" |
| is_exhaustive | Boolean | Mask completeness flag |
| created_at | DateTime | Creation timestamp |

---

## 🔄 Data Engine Workflow

```
┌─────────────────────────────────────────────────────────┐
│                    PHASE 1: BATCH                       │
│  Run SAM3 on all images → Save as "generated"           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  PHASE 2: VERIFY                        │
│  Human review → Accept / Reject / Flag                  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 PHASE 3: CORRECT                        │
│  PolygonEditor for flagged items → Manual fix           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    EXPORT                               │
│  Generate COCO JSON with RLE masks → Ready for training │
└─────────────────────────────────────────────────────────┘
```

---

## 🖱️ Polygon Editor Shortcuts

| Key | Action |
|-----|--------|
| `Delete` / `Backspace` | Delete selected vertex |
| `Ctrl + A` | Select all polygons |
| `S` | Simplify selected polygon |
| `Ctrl + S` | Simplify all polygons |
| `D` | Delete selected polygon |
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| Mouse Scroll | Zoom in/out |

---

## 🧪 CLI Pipeline Usage

Run the complete pipeline from command line:

```powershell
cd sam3-dashboard/scripts

# Full pipeline
python data_engine_cli.py pipeline \
  --input ./images \
  --output ./dataset \
  --prompt "rice field" \
  --confidence 0.5

# Individual steps
python data_engine_cli.py batch --input ./images --prompt "rice field"
python data_engine_cli.py export --output ./dataset --prompt "rice field"
python data_engine_cli.py train --config custom_config.yaml
python data_engine_cli.py evaluate --gt ./ground_truth --pred ./predictions
```

---

## ❗ Troubleshooting

| Issue | Solution |
|-------|----------|
| `Module not found: sam3` | Run `pip install -e .` in `sam3/` with `.venv` active |
| CUDA errors | Verify GPU driver matches PyTorch CUDA version |
| Paths not found | Ensure `sam3`, `sam3-inference`, `sam3-dashboard` are siblings |
| Server won't start | Check if port 8000 is available |
| Empty masks | Increase confidence threshold or try different prompt |

---

## 📜 License

This project is part of the PIHC Geospatial Delineation initiative.

---

## 🔗 Related Repositories

- **SAM3 Model**: [github.com/adityavhlvy/sam3](https://github.com/adityavhlvy/sam3)
- **SAM3 Weights**: [huggingface.co/facebook/sam3](https://huggingface.co/facebook/sam3)
- **Organization**: [github.com/Data-Science-PIHC](https://github.com/Data-Science-PIHC)
