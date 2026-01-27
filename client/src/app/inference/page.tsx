"use client";
import { useState, useEffect, useRef } from "react";
import { Upload, Camera, Zap, MousePointer, Square, Trash2, Eye, EyeOff, Undo, Redo } from "lucide-react";
import { AnnotationCanvas, Point, Box } from "../../components/AnnotationCanvas";

export default function InferencePage() {
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null); // For legacy result display if needed, or overlay
  const [inferenceData, setInferenceData] = useState<{
    polygons: number[][][][];
    scores: number[];
    ids: number[];
    colors?: number[][];
    width: number;
    height: number;
  } | null>(null);

  const [hoveredMask, setHoveredMask] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Interaction State
  const [taskType, setTaskType] = useState<"auto" | "interactive" | "exemplar">("auto");
  const [interactionMode, setInteractionMode] = useState<"point" | "box">("point");
  const [points, setPoints] = useState<Point[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);

  // Image Dimensions
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);

  // Mask Management
  const [hiddenMaskIds, setHiddenMaskIds] = useState<number[]>([]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);

      // Reset State
      setResult(null);
      setInferenceData(null);
      setPoints([]);
      setBoxes([]);
      setHiddenMaskIds([]);

      // Check for TIFF
      if (file.type === "image/tiff" || file.name.endsWith(".tif") || file.name.endsWith(".tiff")) {
        // Call Preview Endpoint
        const formData = new FormData();
        formData.append("image", file);
        try {
          const res = await fetch("http://localhost:8000/api/inference/utils/preview_image", {
            method: "POST",
            body: formData
          });
          const data = await res.json();
          if (data.image_base64) {
            setImage(data.image_base64);
            setImageDims({ width: data.width, height: data.height });
          } else {
            alert("Failed to preview TIFF");
          }
        } catch (err) {
          console.error(err);
          alert("Error previewing TIFF");
        }
      } else {
        // Standard Image
        const reader = new FileReader();
        reader.onload = (ev) => {
          const src = ev.target?.result as string;
          setImage(src);
          const img = new Image();
          img.src = src;
          img.onload = () => setImageDims({ width: img.width, height: img.height });
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const runInference = async (promptText?: string) => {
    if (!selectedFile) return;
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      if (promptText) {
        formData.append("prompt", promptText);
      }

      formData.append("task_type", taskType);

      // Scale inputs for API (API expects absolute pixels)
      // AnnotationCanvas renders at fixed width (e.g. 800px in this new layout?).
      // We need to know the *current display size* vs *original size*.
      // Let's assume we pass normalized coords or handle scaling here.
      // Easiest is to send normalized coords, OR scale back to original.
      // Since AnnotationCanvas draws on the scaled image, points are relative to the <canvas>.
      // We need to map Canvas Coords -> Original Image Coords.

      // We'll calculate scale factor based on valid imageDims and display width.
      // Let's make the canvas width dynamic or fixed.
      const displayWidth = 800; // Updated larger width
      const scaleX = imageDims ? imageDims.width / displayWidth : 1;
      const scaleY = imageDims ? imageDims.width / displayWidth : 1; // Uniform scaling usually for aspect ratio preservation
      // Note: scaleY needs to account for height if image aspect ratio is preserved.
      // AnnotationCanvas: height = (img.h / img.w) * width.
      // So scale factor is same for X and Y: original_width / display_width
      const scale = imageDims ? imageDims.width / displayWidth : 1;

      if (points.length > 0) {
        const scaledPoints = points.map(p => [p.x * scale, p.y * scale]);
        const scaledLabels = points.map(p => p.label);
        formData.append("points", JSON.stringify(scaledPoints));
        formData.append("point_labels", JSON.stringify(scaledLabels));
      }

      if (boxes.length > 0) {
        const scaledBoxes = boxes.map(b => [
          b.x * scale,
          b.y * scale,
          (b.x + b.w) * scale,
          (b.y + b.h) * scale
        ]);
        formData.append("boxes", JSON.stringify(scaledBoxes));
      }

      const response = await fetch(
        "http://localhost:8000/api/inference/predict/image",
        {
          method: "POST",
          body: formData,
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.status === "success" && data.polygons) {
          setInferenceData({
            polygons: data.polygons,
            scores: data.scores,
            ids: data.ids,
            colors: data.colors,
            width: data.width,
            height: data.height,
          });
        } else {
          console.warn("Inference returned no polygons or failed", data);
          if (data.message) alert("Inference: " + data.message);
        }
      }
    } catch (error) {
      console.error(error);
      alert("Inference Error");
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleMaskVisibility = (id: number) => {
    setHiddenMaskIds(prev =>
      prev.includes(id) ? prev.filter(hid => hid !== id) : [...prev, id]
    );
  };

  const deleteMask = (index: number) => {
    if (!inferenceData) return;
    const newIds = [...inferenceData.ids];
    const newScores = [...inferenceData.scores];
    const newPolygons = [...inferenceData.polygons];
    const newColors = inferenceData.colors ? [...inferenceData.colors] : [];

    newIds.splice(index, 1);
    newScores.splice(index, 1);
    newPolygons.splice(index, 1);
    if (newColors.length > index) newColors.splice(index, 1);

    setInferenceData({
      ...inferenceData,
      ids: newIds,
      scores: newScores,
      polygons: newPolygons,
      colors: newColors
    });
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex gap-4 p-4">
      {/* LEFT: Main Canvas Area (70%) */}
      <div className="flex-grow flex flex-col gap-4 h-full">
        <div className="card bg-base-100 shadow-xl border border-base-300 h-full flex flex-col overflow-hidden relative">
          <div className="absolute top-4 left-4 z-10 flex gap-2">
            <div className="tooltip" data-tip="Point Mode (Click)">
              <button
                className={`btn btn-square btn-sm ${interactionMode === 'point' ? 'btn-primary' : 'btn-ghost bg-base-100/50 backdrop-blur'}`}
                onClick={() => setInteractionMode('point')}
              >
                <MousePointer size={18} />
              </button>
            </div>
            <div className="tooltip" data-tip="Box Mode (Drag)">
              <button
                className={`btn btn-square btn-sm ${interactionMode === 'box' ? 'btn-primary' : 'btn-ghost bg-base-100/50 backdrop-blur'}`}
                onClick={() => setInteractionMode('box')}
              >
                <Square size={18} />
              </button>
            </div>
            <div className="divider divider-horizontal mx-0"></div>
            <button className="btn btn-sm btn-ghost bg-base-100/50 backdrop-blur text-error" onClick={() => { setPoints([]); setBoxes([]); }}>
              <Trash2 size={18} /> Prompts
            </button>
          </div>

          <div className="flex-grow flex items-center justify-center bg-base-200/50 overflow-auto p-4">
            {image ? (
              <AnnotationCanvas
                imageUrl={image}
                width={800}
                height={imageDims ? (imageDims.height / imageDims.width) * 800 : 600}
                interactionMode={interactionMode}
                points={points}
                boxes={boxes}
                onPointsChange={setPoints}
                onBoxesChange={setBoxes}
                polygons={
                  inferenceData
                    ? inferenceData.polygons.filter((_, idx) => !hiddenMaskIds.includes(inferenceData.ids[idx]))
                    : undefined
                }
                colors={
                  inferenceData && inferenceData.colors
                    ? inferenceData.colors.filter((_, idx) => !hiddenMaskIds.includes(inferenceData.ids[idx]))
                    : undefined
                }
              />
            ) : (
              <div className="text-center opacity-50">
                <Upload size={48} className="mx-auto mb-2" />
                <p>Upload an image to start</p>
              </div>
            )}
          </div>

          {/* Bottom Input Bar for Text */}
          <div className="p-4 bg-base-100 border-t border-base-300 flex gap-2">
            <input
              type="text"
              placeholder="Enter text prompt..."
              className="input input-bordered flex-grow"
              onKeyDown={(e) => {
                if (e.key === 'Enter') runInference(e.currentTarget.value);
              }}
            />
            <button className="btn btn-primary" onClick={() => runInference()} disabled={!image || isProcessing}>
              {isProcessing ? <span className="loading loading-spinner" /> : <Zap size={20} />}
              Run
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Sidebar (30%) */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4 h-full overflow-y-auto pr-1">
        {/* Config Panel */}
        <div className="card bg-base-100 shadow-md border border-base-200">
          <div className="card-body p-4 gap-2">
            <h3 className="font-bold text-sm uppercase opacity-70 mb-2">Configuration</h3>

            {/* Upload */}
            <div className="form-control">
              <input type="file" className="file-input file-input-bordered file-input-sm w-full" onChange={handleUpload} accept="image/*,.tif,.tiff" />
            </div>

            {/* Task Type */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Task Mode</span>
              </label>
              <select className="select select-bordered select-sm" value={taskType} onChange={(e) => setTaskType(e.target.value as any)}>
                <option value="auto">Auto (Text/Hybrid)</option>
                <option value="interactive">Interactive (Click)</option>
                <option value="exemplar">Exemplar (One-Shot)</option>
              </select>
            </div>

            <div className="divider my-1"></div>
            <div className="text-xs opacity-60">
              <p><strong>Interactive:</strong> Click object or draw box to segment.</p>
              <p><strong>Exemplar:</strong> Draw box to find all similar objects.</p>
            </div>
          </div>
        </div>

        {/* Results List */}
        <div className="card bg-base-100 shadow-md border border-base-200 flex-grow overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-base-200 font-bold flex justify-between items-center">
            <span>Detections</span>
            <span className="badge badge-neutral">{inferenceData ? inferenceData.ids.length : 0}</span>
          </div>
          <div className="flex-grow overflow-y-auto p-2 space-y-1">
            {inferenceData && inferenceData.ids.map((id, idx) => (
              <div key={idx}
                className={`flex items-center justify-between p-2 rounded hover:bg-base-200 border border-transparent hover:border-base-300 ${hiddenMaskIds.includes(id) ? 'opacity-50' : ''}`}
                onMouseEnter={() => setHoveredMask(idx)}
                onMouseLeave={() => setHoveredMask(null)}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: inferenceData.colors ? `rgb(${inferenceData.colors[idx].join(',')})` : '#000' }} />
                  <span className="text-sm truncate">ID: {id}</span>
                  <span className="text-xs opacity-50">{(inferenceData.scores[idx] * 100).toFixed(0)}%</span>
                </div>
                <div className="flex gap-1">
                  <button className="btn btn-ghost btn-xs btn-square" onClick={() => toggleMaskVisibility(id)}>
                    {hiddenMaskIds.includes(id) ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button className="btn btn-ghost btn-xs btn-square text-error" onClick={() => deleteMask(idx)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {!inferenceData && (
              <div className="text-center p-8 opacity-40 text-sm">
                No detections yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
