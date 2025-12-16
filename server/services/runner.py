import subprocess
import threading
import queue
import time
import os
import signal
import sys
import datetime


class TrainingRunner:
    def __init__(self):
        self.process = None
        self.log_queue = queue.Queue()
        self.is_running = False
        self.stop_event = threading.Event()
        # Hardcoded venv path data from user request
        self.venv_python = r"c:\Users\aksar\OneDrive\Documents\PIHC\geospatial-deliniation\sam3\.venv\Scripts\python.exe"
        self.output_root = r"c:\Users\aksar\OneDrive\Documents\PIHC\geospatial-deliniation\sam3-inference"

    def start_training(self, config_path: str, overrides: dict = None):
        if self.is_running:
            raise Exception("Training is already running")

        self.stop_event.clear()

        # Get sam3 root
        current_dir = os.path.dirname(os.path.abspath(__file__))
        # server/services -> server -> sam3-dashboard -> parent (geospatial-deliniation) -> sam3
        sam3_root = os.path.abspath(os.path.join(current_dir, "..", "..", "..", "sam3"))

        # Determine output directory for this run
        # Structure: sam3-inference/config_name/timestamp
        config_name = os.path.splitext(os.path.basename(config_path))[0]
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        experiment_dir = os.path.join(self.output_root, config_name, timestamp)

        # Prepare command
        # python sam3/train/train.py -c config_path launcher.experiment_log_dir=...
        cmd = [
            self.venv_python,
            "sam3/train/train.py",
            "-c",
            config_path,
            f"launcher.experiment_log_dir={experiment_dir}",
        ]

        if overrides:
            for key, value in overrides.items():
                cmd.append(f"{key}={value}")

        env = os.environ.copy()
        env["PYTHONPATH"] = sam3_root + os.pathsep + env.get("PYTHONPATH", "")

        try:
            self.process = subprocess.Popen(
                cmd,
                cwd=sam3_root,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                env=env,
                universal_newlines=True,
            )
            self.is_running = True

            # Start thread to read output
            self.thread = threading.Thread(target=self._stream_output)
            self.thread.daemon = True
            self.thread.start()

            return True
        except Exception as e:
            self.is_running = False
            raise e

    def _stream_output(self):
        try:
            for line in iter(self.process.stdout.readline, ""):
                if self.stop_event.is_set():
                    break
                self.log_queue.put(line)
        except Exception as e:
            self.log_queue.put(f"[ERROR] Stream reading failed: {e}\n")
        finally:
            if self.process:
                self.process.stdout.close()
            self.is_running = False
            self.process = None

    def stop_training(self):
        if self.process and self.is_running:
            self.stop_event.set()
            # Try terminating
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.is_running = False
            return True
        return False

    def get_logs(self):
        logs = []
        try:
            while True:
                line = self.log_queue.get_nowait()
                logs.append(line)
        except queue.Empty:
            pass
        return logs


runner_instance = TrainingRunner()
