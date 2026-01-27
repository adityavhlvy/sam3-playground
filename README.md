# SAM3 Dashboard & Full System Setup Guide

This guide provides step-by-step instructions to set up the complete SAM3 environment, which consists of three main components: the dashboard (client & server), the SAM3 model, and the inference resources.

## Prerequisites

- **OS**: Windows
- **Python**: 3.14+
- **Node.js**: 18+ (for client) or **Bun** (recommended)
- **CUDA**: 12.6+ (for model inference on GPU)
- **GPU**: NVIDIA GPU with sufficient VRAM (Optional, defaults to CPU if unavailable)

---

## 1. Project Structure & Preparation

To ensure all scripts work correctly, you must organize your project folder as follows. Create a main directory (e.g., `geospatial-deliniation`) and place the three required folders inside it:

```text
geospatial-deliniation/
├── sam3/               # The modified SAM3 model code
├── sam3-inference/     # Model weights and inference resources
└── sam3-dashboard/     # This dashboard project (server & client)
```

### Component Details:

1.  **sam3-dashboard**: This repository. Contains the UI and the API server.
2.  **sam3**: The core model code.
    - **Source**: [https://github.com/adityavhlvy/sam3](https://github.com/adityavhlvy/sam3)
    - _Note: This is a modified version of the original SAM3 repo._
3.  **sam3-inference**: Contains the model weights and checkpoints.
    - **Source**: [https://huggingface.co/facebook/sam3](https://huggingface.co/facebook/sam3)
    - _Action_: Download the files from Hugging Face and place them in this folder.

---

## 2. Setting up the SAM3 Model (`sam3`)

The dashboard server relies on the Python environment created in this folder.

1.  **Open a terminal** and navigate to your `sam3` folder:

    ```powershell
    cd ..\sam3
    ```

2.  **Create a Virtual Environment**:
    It is critical to create the venv named `.venv` so the dashboard scripts can find it.

    ```powershell
    python -m venv .venv
    ```

3.  **Activate the Environment**:

    ```powershell
    .venv\Scripts\activate
    ```

4.  **Install PyTorch**:

    - **For CUDA (NVIDIA GPU)**:
      ```powershell
      pip install torch==2.5.1 torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126
      ```
    - **For CPU Only**:
      ```powershell
      pip install torch==2.5.1 torchvision torchaudio
      ```

5.  **Install SAM 3 & Dependencies**:
    ```powershell
    pip install -e .
    pip install -e ".[notebooks,train]"
    ```

---

## 3. Setting up the Dashboard Server (`sam3-dashboard/server`)

The server connects the UI to the SAM3 model.

1.  **Navigate to the server directory**:

    ```powershell
    cd ..\sam3-dashboard\server
    ```

2.  **Install Server Dependencies**:
    Ensure you are using the **same** virtual environment from the `sam3` folder.

    ```powershell
    # Activate the sam3 venv
    ..\..\sam3\.venv\Scripts\activate

    # Install requirements
    pip install -r requirements.txt
    ```

3.  **Start the Server**:
    Use the provided script which automatically uses the correct python interpreter from `sam3/.venv`.
    ```powershell
    ./start_server.bat
    ```
    - The server will run at `http://localhost:8000`.
    - API Docs: `http://localhost:8000/docs`

---

## 4. Setting up the Client (`sam3-dashboard/client`)

1.  **Open a new terminal** and navigate to the client directory:

    ```powershell
    cd sam3-dashboard\client
    ```

2.  **Install Dependencies**:

    ```powershell
    bun install
    ```

    _(If you don't have Bun, you can use `npm install`, but Bun is recommended)._

3.  **Run the Development Server**:

    ```powershell
    bun run dev
    ```

4.  **Access the Dashboard**:
    Open your browser and navigate to: [http://localhost:3000](http://localhost:3000)

---

## Usage Guide

### Dashboard

- **Inference**: Upload images/videos. The system checks `sam3-inference` for model weights.
- **Training**: Trigger fine-tuning. The server executes scripts located in `sam3/train.py`.

### Troubleshooting

- **"Module not found: sam3"**: Make sure you ran `pip install -e .` inside the `sam3` folder while the `.venv` was active.
- **CUDA Errors**: Verify your GPU driver version matches the installed PyTorch CUDA version.
- **Paths**: Ensure `sam3`, `sam3-inference`, and `sam3-dashboard` are all side-by-side in the same parent directory.
