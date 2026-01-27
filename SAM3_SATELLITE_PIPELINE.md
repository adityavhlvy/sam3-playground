# 🛰️ Antigravity: SAM 3 Satellite Pipeline Specification

This document serves as the implementation blueprint for the **Agtech & Data Science (Agata)** team to reproduce and fine-tune **SAM 3 (Segment Anything with Concepts)** for satellite imagery, specifically focusing on paddy field (sawah) monitoring.

## 1. Data Preprocessing: The "1008" Constraint

Unlike traditional computer vision models that default to , SAM 3 utilizes a **ViT-L/14** backbone. To maintain patch alignment ( patches), all input must be processed at **1008x1008** pixels.

### A. Tiling Workflow (From Raw `.tif`)

Satellite imagery is high-resolution and multi-gigabyte. You cannot feed raw GeoTIFFs into the transformer without crashing the kernel.

1. **Resolution Scaling**: Resample your `.tif` so the Ground Sample Distance (GSD) matches the level of detail needed for paddy boundaries.
2. **Tiling Strategy**:

- **Tile Size**: .
- **Overlap (Stride)**: pixels (divisible by 14). This ensures that a paddy field split across two tiles is fully captured in at least one.

3. **Color Space**: Convert 16-bit data to 8-bit RGB. Use **CLAHE** to normalize atmospheric haze, which is common in tropical satellite data.

---

## 2. The Data Engine: Concepts & Hard Negatives

SAM 3’s strength lies in its **Presence Head**. It doesn't just segment; it decides if a concept _exists_.

### A. Hierarchical Ontology

Do not use generic labels. Define "Sawah" by its growth stages:

- `paddy_flooded`: High water reflectance.
- `paddy_vegetative`: Vibrant green.
- `paddy_ripening`: Golden/Yellow.

### B. The "Secret Sauce": Hard Negatives

To prevent the model from hallucinating sawah everywhere, you must provide tiles labeled as **Negative Samples**:

- **Visual Mimics**: Golf courses, football fields, and swamp forests.
- **Mechanism**: During training, prompt the model for "paddy" on a tile containing a "golf course." If the model predicts a mask, the `Presence Head` loss will penalize it heavily.

---

## 3. Training Architecture (Stage 3 Focus)

Since you are using the pre-trained weights, focus on **Stage 3: Detector Fine-tuning**.

| Component              | Status        | Reasoning                                                                |
| ---------------------- | ------------- | ------------------------------------------------------------------------ |
| **Perception Encoder** | **Frozen**    | Keep the 4M concept knowledge intact.                                    |
| **Presence Head**      | **Trainable** | Must learn to distinguish satellite "sawah" from "grass."                |
| **Mask Decoder**       | **Trainable** | Refines the specific rectangular/polygonal shapes of agricultural plots. |

### Hyperparameter Note:

- **Resolution**: Set `input_size: 1008` in your Hydra config.
- **Batch Size**: SAM 3 is memory-hungry. If using a standard A100/H100, keep the local batch size small and use gradient accumulation.

---

## 4. Evaluation Metrics ()

Standard mAP is insufficient because it doesn't punish "hallucinations" on empty tiles. Use the **Classification-Gated F1 ()** metric.

### Step-by-Step Calculation:

1. ** (Localization)**: Calculate the F1-score of the masks on tiles where the sawah actually exists. Average the IoU from to .
2. ** (Recognition)**: Calculate the Matthews Correlation Coefficient for the image-level presence.

3. **Final Score**:

> **Note:** If your is low, your model is "blindly" segmenting green shapes without understanding the concept of a paddy field. Go back to Step 2B (Hard Negatives).

---

## 5. Implementation in Antigravity Dashboard

The dashboard should bridge the gap between raw data and actionable Agtech insights.

- **Ambiguity Handling**: If a user prompts "paddy," the `Ambiguity Head` should offer subtypes (e.g., "flooded" vs "ready to harvest").
- **Video Tracker (PVS)**: For time-series satellite data (Sentinel/Planet), use the **Memory-based Tracker**.
- **Confirmation Delay ()**: Only display the mask after the model is "sure" across 15 temporal frames.
- **Temporal Consistency**: Use the tracker to ensure a specific plot is identified as the same ID from planting to harvest.
