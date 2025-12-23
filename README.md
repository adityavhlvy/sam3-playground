# SAM3 Dashboard & Full System Setup Guide

This guide provides step-by-step instructions to set up the entire SAM3 environment, including the model, inference server, and client dashboard. This implementation aligns with the [SAM 3: Segment Anything with Concepts](../sam3/585895112_1502482260871702_2839727966936571770_n.pdf) paper specifications.

## Prerequisites

- **OS**: Windows (as configured in scripts)
- **Python**: 3.10+ (Recommended 3.12+)
- **Node.js**: 18+ (for client)
- **CUDA**: 12.6+ (for model inference on GPU)
- **GPU**: NVIDIA GPU with sufficient VRAM (Optional, defaults to CPU if unavailable)

## Project Structure

- `sam3/`: Core SAM 3 model implementation and training scripts.
- `sam3-dashboard/server/`: FastAPI backend that interfaces with the SAM 3 model.
- `sam3-dashboard/client/`: Next.js frontend for user interaction.

---

## Part 1: Model Environment Setup (`sam3`)

The server relies on a specific Python environment located in `sam3/.venv`. We need to create this env and install the SAM 3 dependencies.

1.  **Open a terminal** and navigate to the `sam3` directory:

    ```powershell
    cd ..\sam3
    ```

2.  **Create the Virtual Environment**:
    Since `sam3-dashboard/server/start_server.bat` expects the venv at `sam3/.venv`, create it there:

    ```powershell
    python -m venv .venv
    ```

    _Note: If you are using Conda, you can create a prefix env:_ `conda create -p ./.venv python=3.12`

3.  **Activate the Environment**:

    ```powershell
    .venv\Scripts\activate
    ```

4.  **Install PyTorch (CUDA or CPU)**:

    - **For CUDA (NVIDIA GPU)**:
      ```powershell
      pip install torch==2.7.0 torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126
      ```
    - **For CPU Only**:
      ```powershell
      pip install torch==2.7.0 torchvision torchaudio
      ```
      _Note: Inference on CPU will be significantly slower than on GPU._

5.  **Install SAM 3 & Dependencies**:
    ```powershell
    pip install -e .
    pip install -e ".[notebooks,train]"
    ```
    _This installs the package in editable mode as per the paper's repository instructions._

---

## Part 2: Server Setup (`sam3-dashboard/server`)

The server is a FastAPI application that loads the SAM 3 model and exposes endpoints for the dashboard.

1.  **Navigate to the server directory**:

    ```powershell
    cd ..\sam3-dashboard\server
    ```

2.  **Install Server Dependencies**:
    The server needs `fastapi`, `uvicorn`, etc. Ensure you are still in the `sam3` environment (or the script will handle it, but it's good to install deps manually first to be sure).

    ```powershell
    # Activate the sam3 venv if not already active
    ..\..\sam3\.venv\Scripts\activate

    # Install requirements
    pip install -r requirements.txt
    ```

3.  **Run the Server**:
    We have provided a convenience script `start_server.bat` that automatically uses the `sam3/.venv` Python interpreter.

    ```powershell
    ./start_server.bat
    ```

    _Expected Output:_

    ```
    Starting SAM3 Dashboard Server using VENV: ..\..\sam3\.venv\Scripts\python.exe
    INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
    ```

    The server API docs will be available at: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Part 3: Client Setup (`sam3-dashboard/client`)

The client is a modern Next.js 14+ application.

1.  **Open a new terminal** and navigate to the client directory:

    ```powershell
    cd sam3-dashboard\client
    ```

2.  **Install Dependencies**:

    ```powershell
    bun install
    ```

3.  **Run the Development Server**:

    ```powershell
    bun run dev
    ```

4.  **Access the Dashboard**:
    Open your browser and go to: [http://localhost:3000](http://localhost:3000)

---

## usage

### 1. Dashboard Interface

- **Inference Tab**: Upload images or videos to perform segmentation using SAM 3 concepts.
- **Training Tab**: Trigger fine-tuning jobs. The server handles the execution of `sam3/train.py` scripts.

### 2. Model Configuration

The system uses the configuration files located in `sam3/configs/`. Ensure your dataset paths in these configs are correct before triggering training tasks.

### 3. Monitoring

- **TensorBoard**: TensorBoard logs are saved to `sam3-inference/tensorboard` (or as configured).
- **Server Logs**: Check the server terminal for real-time inference logs.

## Troubleshooting

- **Server fails to find `sam3` module**: Ensure you ran `pip install -e .` inside the `sam3` directory using the `.venv` python.
- **CUDA errors**: Verify you installed the correct PyTorch version compatible with your GPU drivers (CUDA 12.6+).
- **Client API errors**: Ensure the server is running on port 8000 and CORS is enabled (default is enabled for `*`).
