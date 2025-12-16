# SAM 3 Dataset Preparation Guide

This guide explains how to format your dataset for training (fine-tuning) SAM 3, complying with the paper's standards and the project's configuration.

## Required Structure

The system expects a **COCO Format** directory structure. When creating your `.zip` archive for upload, ensure it follows this layout:

```text
my_dataset/
├── train/
│   ├── _annotations.coco.json  <-- Key Requirement
│   ├── image_01.jpg
│   ├── image_02.jpg
│   └── ...
├── test/
│   ├── _annotations.coco.json
│   ├── image_03.jpg
│   └── ...
└── valid/ (Optional)
    ├── _annotations.coco.json
    └── ...
```

## Annotation Format (COCO JSON)

The `_annotations.coco.json` file must contain standard COCO fields:

1.  **images**: List of image metadata (id, file_name, height, width).
2.  **annotations**: List of object annotations (id, image_id, category_id, bbox, segmentation, area, iscrowd).
    *   **bbox**: `[x, y, width, height]`
    *   **segmentation**: Polygon coordinates `[[x1, y1, x2, y2, ...]]` or RLE.
3.  **categories**: List of classes (id, name, supercategory).

### Example JSON Snippet

```json
{
  "images": [
    {
      "id": 1,
      "file_name": "image_01.jpg",
      "width": 640,
      "height": 480
    }
  ],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 1,
      "bbox": [100, 100, 50, 80],
      "segmentation": [[100, 100, 150, 100, 150, 180, 100, 180]],
      "area": 4000,
      "iscrowd": 0
    }
  ],
  "categories": [
    {
      "id": 1,
      "name": "person",
      "supercategory": "none"
    }
  ]
}
```

## How to Create This Dataset?

You can use standard labeling tools that support COCO export:

1.  **Roboflow**: Upload images, label them, and export as "COCO JSON".
2.  **CVAT**: Open source annotation tool, export as "COCO".
3.  **LabelStudio**: Export as "COCO".

Once you have the exported folder, **ZIP it** (e.g., `my_dataset.zip`) and use the Dataset Upload feature in the dashboard.

## SAM 3 Data Engine Context

The SAM 3 paper describes a 4-phase Data Engine:
1.  **Model-assisted annotation**: Use SAM 3 to generate masks, correct them manually.
2.  **Verification**: Verify generated masks (supported by the "Data Engine" tab in the dashboard).
3.  **Exhaustivity**: Ensuring all instances are labeled.
4.  **Training**: The fine-tuning phase using the high-quality masks from steps 1-3.

For the **Training** feature in this dashboard, we assume you are at **Phase 4**: You already have your annotated images and want to fine-tune the model.
