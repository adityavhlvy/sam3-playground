# 🚀 Antigravity: SAM 3 Training & Dashboard Framework

This document outlines the technical requirements and architecture for the **Antigravity** framework, a comprehensive ecosystem designed to reproduce the capabilities of the **Segment Anything Model (SAM) 3**. This framework focuses on integrating Promptable Concept Segmentation (PCS) and Promptable Visual Segmentation (PVS) into a unified training and inference dashboard.

## 1. Unified Model Architecture

The core of Antigravity is a dual-purpose transformer architecture that facilitates both image-level detection and video-level tracking using a shared vision backbone.

### Key Components

- **Perception Encoder (PE) Backbone**: A pre-trained encoder that aligns image and text representations.
- **Presence Head**: A critical module that decouples "recognition" from "localization." It predicts whether a concept exists in the frame, while proposal queries focus solely on spatial coordinates.
- **Memory-based Video Tracker**: Inherits the SAM 2 transformer architecture to enable temporal masklet propagation across video frames.
- **Ambiguity Head**: Employs a mixture-of-experts (MoE) approach to resolve semantic ambiguity (e.g., distinguishing between a "crane" as a bird vs. a construction machine).

## 2. Data Engine & Preprocessing Pipeline

To reproduce Meta’s results, the preprocessing module must handle large-scale data curation and automated labeling.

### Preprocessing Workflow:

1. **Ontology-based Curation**: Balancing data distribution using a visual ontology (e.g., Wikidata) to ensure broad concept coverage.
2. **Hard Negative Generation**: Identifying objects that are _not_ present but are semantically similar to the target to reduce false positives.
3. **Automated Verification**:

- **Mask Verification (MV)**: Validating that generated masks align with text labels.
- **Exhaustivity Verification (EV)**: Ensuring every instance of a concept within a frame is detected and labeled.

## 3. Training & Fine-tuning Stages

The training pipeline is divided into four progressive stages to build model capabilities incrementally:

| Stage       | Focus                 | Primary Objective                                                                      |
| ----------- | --------------------- | -------------------------------------------------------------------------------------- |
| **Stage 1** | PE Pre-training       | Aligning image and text embeddings across billions of pairs.                           |
| **Stage 2** | Detector Pre-training | Large-scale segmentation training to cover 4M+ unique concept labels.                  |
| **Stage 3** | Detector Fine-tuning  | High-quality human-annotated data to refine the Presence Head and interactive prompts. |
| **Stage 4** | Tracker Training      | Video-level training with a frozen backbone to focus on temporal consistency.          |

## 4. Antigravity Dashboard Features

The dashboard serves as the command center for training, testing, and real-time inference.

### Interactive Capabilities:

- **Multi-Modal Prompting**: Support for text prompts (noun phrases), image exemplars (bounding boxes), or a hybrid of both.
- **Video Disambiguation**:
- **Track Confirmation Delay**: A frame buffer to ensure track stability before outputting masks.
- **Periodic Re-prompting**: Automatic detector calls every frames to recover tracks lost during occlusion.

- **Resource Monitoring**: Real-time tracking of GPU utilization and inference FPS.

## 5. Performance Metrics

To validate the reproduction, the framework tracks the following metrics:

- **pmF1 (Positive Micro F1)**: Accuracy of localization on positive samples.
- **IL_MCC (Image-level Matthews Correlation Coefficient)**: Precision of the Presence Head in determining object existence.
- **cgF1 (Classification-gated F1)**: The primary benchmark metric ().

---

### Implementation Notes for Antigravity

- **Inference**: For real-time performance, ensure the dashboard utilizes multi-GPU parallelization for the video tracker.
- **Data Storage**: Use a vector database for storing the 4M concept embeddings to allow for fast retrieval during the PCS phase.
