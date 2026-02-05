"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { Check, X, Flag, Database, Loader2, Play, Download, Search, Edit3, Layers, Square } from "lucide-react";
import { AnnotationCanvas } from "@/components/AnnotationCanvas";
import { VerificationQueue } from "@/components/VerificationQueue";
import { CorrectionQueue } from "@/components/CorrectionQueue";

export default function DataEnginePage() {
  const [activeTab, setActiveTab] = useState("mining"); // Start with Mining (Phase 1)
  const [loading, setLoading] = useState(false);
  const [points, setPoints] = useState<any[]>([]);
  const [maskResult, setMaskResult] = useState<any>(null);

  // Dataset State
  // Default path or load from localStorage
  const [datasetPath, setDatasetPath] = useState("C:\\Users\\aksar\\OneDrive\\Pictures\\Saved Pictures");
  const [items, setItems] = useState<any[]>([]);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [promptText, setPromptText] = useState("field");

  // Batch State
  const [isBatching, setIsBatching] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const stopBatchRef = useRef(false);

  // Load persistence
  useEffect(() => {
    const saved = localStorage.getItem("sam3_dataset_path");
    if (saved) setDatasetPath(saved);
  }, []);

  // Save persistence when changed
  useEffect(() => {
    if (datasetPath) localStorage.setItem("sam3_dataset_path", datasetPath);
  }, [datasetPath]);


  // CORRECTION MODE LOGIC: Fetch existing mask when switching images in Phase 3
  useEffect(() => {
    if (activeTab === "correction" && currentImage) {
      // Fetch existing proposal
      setLoading(true);
      fetch(`http://localhost:8000/api/data-engine/proposal?file_path=${encodeURIComponent(currentImage)}`)
        .then(res => res.json())
        .then(data => {
          if (data.proposal) {
            setMaskResult(data.proposal);
            setPoints([]);
          } else {
            setMaskResult(null);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [currentImage, activeTab]);


  // Fetch items from backend
  const fetchItems = async () => {
    if (!datasetPath) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/data-engine/items?dataset_path=${encodeURIComponent(datasetPath)}`);
      if (!res.ok) throw new Error("Path not found");
      const data = await res.json();
      if (data.items) {
        setItems(data.items);
        if (data.items.length > 0) {
          setCurrentImage(data.items[0].path);
        }
      }
    } catch (e) {
      alert("Failed to load images. Check the path.");
      console.error("Failed to fetch items", e);
    } finally {
      setLoading(false);
    }
  };

  // Export Dataset
  const handleExport = async () => {
    const defaultPath = `${datasetPath}\\output\\_annotations.coco.json`;
    const path = prompt("Enter path to save _annotations.coco.json:", defaultPath);
    if (!path) return;

    try {
      const res = await fetch("http://localhost:8000/api/data-engine/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ output_path: path })
      });
      const data = await res.json();
      alert(data.message);
    } catch (e) {
      alert("Export failed: " + e);
    }
  }

  // Client-Side Batch Loop
  const handleBatchProcess = async () => {
    if (!datasetPath) return;

    // Fetch already-processed images before starting
    let processedImages: Set<string> = new Set();
    try {
      const processedRes = await fetch("http://localhost:8000/api/data-engine/processed_images");
      const processedData = await processedRes.json();
      processedImages = new Set(processedData.processed || []);
      console.log(`[BATCH] Found ${processedImages.size} already processed images`);
    } catch (e) {
      console.warn("[BATCH] Could not fetch processed images, will process all");
    }

    // Filter out already processed
    const itemsToProcess = items.filter(item => !processedImages.has(item.path));
    const skipped = items.length - itemsToProcess.length;

    if (!confirm(`Start batch processing? ${itemsToProcess.length} images to process (${skipped} already processed, will skip).`)) return;

    setIsBatching(true);
    stopBatchRef.current = false;
    setBatchProgress({ current: 0, total: itemsToProcess.length });

    let errors = 0;

    for (let i = 0; i < itemsToProcess.length; i++) {
      if (stopBatchRef.current) break;

      const item = itemsToProcess[i];
      setBatchProgress({ current: i + 1, total: itemsToProcess.length });
      setCurrentImage(item.path);

      try {
        // 1. Generate Proposal
        const genRes = await fetch(
          "http://localhost:8000/api/data-engine/generate_proposals?item_path=" +
          encodeURIComponent(item.path) +
          "&prompt=" + encodeURIComponent(promptText),
          { method: "POST" }
        );
        const genData = await genRes.json();

        if (genData.proposals && genData.proposals.masks && genData.proposals.masks.length > 0) {
          // VISUALIZE: Show the masks to the user!
          setMaskResult(genData.proposals);

          // 2. Submit ALL masks as 'generated' (Pending Verification Phase 2)
          // Each mask becomes a separate proposal in the database
          for (let maskIdx = 0; maskIdx < genData.proposals.masks.length; maskIdx++) {
            const decision = {
              image_id: item.path,
              prompt: promptText,
              decision: "generated",
              mask_data: genData.proposals.masks[maskIdx],
              score: genData.proposals.scores?.[maskIdx] || null
            };

            await fetch("http://localhost:8000/api/data-engine/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(decision)
            });
          }
          console.log(`[BATCH] Saved ${genData.proposals.masks.length} masks for ${item.path}`);
        }

      } catch (e) {
        console.error(`Batch error on ${item.path}`, e);
        errors++;
      }

      // Small delay to allow UI to breathe
      await new Promise(r => setTimeout(r, 100));
    }

    setIsBatching(false);
    alert(stopBatchRef.current
      ? "Batch STOPPED by user."
      : `Batch Finished! Errors: ${errors}. Check Correction tab.`);
  }

  const handleStopBatch = () => {
    stopBatchRef.current = true;
  };

  const handlePointsChange = useCallback(async (newPoints: any[]) => {
    setPoints(newPoints);
    if (!currentImage) return;

    // If we have points, call SAM 3 to update suggestions
    if (newPoints.length > 0) {
      setLoading(true);
      try {
        const response = await fetch(
          "http://localhost:8000/api/data-engine/generate_proposals?item_path=" +
          encodeURIComponent(currentImage) +
          "&prompt=" + encodeURIComponent(promptText),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              points: newPoints.map((p) => [p.x, p.y]),
              point_labels: newPoints.map((p) => p.label),
            }),
          }
        );

        const data = await response.json();
        if (data.proposals) {
          setMaskResult(data.proposals);
        }
      } catch (e) {
        console.error("Failed to update mask", e);
      } finally {
        setLoading(false);
      }
    }
  }, [currentImage, promptText]);

  // Auto Generate on Image Switch if we want? No, let user click.
  const handleAutoGenerate = async () => {
    if (!currentImage) return;
    setLoading(true);
    try {
      const response = await fetch(
        "http://localhost:8000/api/data-engine/generate_proposals?item_path=" +
        encodeURIComponent(currentImage) +
        "&prompt=" + encodeURIComponent(promptText),
        { method: "POST" }
      );
      const data = await response.json();
      if (data.proposals) {
        setMaskResult(data.proposals);
      }
    } catch (e) {
      alert("Generation failed: " + e);
    } finally {
      setLoading(false);
    }
  }

  const handleApprove = async () => {
    if (!currentImage || !maskResult) return;
    // Save as accepted
    try {
      // We just save the first mask for now as verification
      const decision = {
        image_id: currentImage,
        prompt: promptText,
        decision: "accept",
        mask_data: maskResult.masks && maskResult.masks.length > 0 ? maskResult.masks[0] : null
      };
      await fetch("http://localhost:8000/api/data-engine/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decision)
      });
      alert("Approved and Saved!");
    } catch (e) {
      alert("Save failed");
    }
  }

  // Helper to get display URL for local file
  const getDisplayUrl = (path: string | null) => {
    if (!path) return "";
    if (path.startsWith("/")) return path; // relative public
    // Use system API to serve local file
    return `http://localhost:8000/api/system/file/${encodeURIComponent(path)}`;
  }

  // Common Workspace UI component
  const Workspace = ({ title, extraActions }: any) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Sidebar: Image List */}
      <div className="col-span-1 bg-base-100 p-4 rounded-xl border border-base-300 h-[600px] overflow-y-auto">
        <h3 className="font-bold mb-4">Available Images</h3>
        {items.length === 0 && <p className="text-sm opacity-50">No images loaded. Enter a path above.</p>}
        <ul className="menu bg-base-100 w-full p-0">
          {items.map((item) => (
            <li key={item.path}>
              <a
                className={currentImage === item.path ? "active" : ""}
                onClick={() => {
                  setCurrentImage(item.path);
                  // Only clear mask if NOT in correction mode (in correction we fetch it)
                  if (activeTab !== "correction") {
                    setMaskResult(null);
                    setPoints([]);
                  }
                }}
              >
                <span className="truncate text-xs">{item.id}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Main: Workspace */}
      <div className="col-span-2 bg-base-100 p-4 rounded-xl border border-base-300">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold">{title}</h3>
          <div className="flex gap-2 items-center">
            <span className="text-sm">Prompt:</span>
            <input
              type="text"
              className="input input-sm input-bordered"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
            />
            <button
              className="btn btn-sm btn-accent"
              onClick={handleAutoGenerate}
              disabled={loading || !currentImage}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play size={14} />} Auto-Generate
            </button>
          </div>
        </div>

        <div className="bg-base-200 rounded-lg p-2 min-h-[400px] flex items-center justify-center">
          {currentImage ? (
            <AnnotationCanvas
              imageUrl={getDisplayUrl(currentImage)}
              onPointsChange={handlePointsChange}
              width={600}
              height={400}
              masks={maskResult?.masks}
            />
          ) : (
            <div className="text-opacity-50">Select an image to start</div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {extraActions}
          <button
            className="btn btn-success gap-2"
            onClick={handleApprove}
            disabled={!maskResult}
          >
            <Check size={16} /> Approve & Save
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Database className="w-8 h-8" /> Data Engine
        </h1>
        <button className="btn btn-outline gap-2" onClick={handleExport}>
          <Download size={18} /> Export Dataset (SA-Co)
        </button>
      </div>

      <div className="tabs tabs-boxed">
        <a
          className={`tab ${activeTab === "mining" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("mining")}
        >
          1. Mining (Generation)
        </a>
        <a
          className={`tab ${activeTab === "verification" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("verification")}
        >
          2. Verification (Review)
        </a>
        <a
          className={`tab ${activeTab === "correction" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("correction")}
        >
          3. Correction (Edit)
        </a>
      </div>

      {/* DATASET CONFIG BAR */}
      <div className="bg-base-200 p-4 rounded-xl flex gap-4 items-center">
        <span className="font-bold whitespace-nowrap">Dataset Folder:</span>
        <input
          type="text"
          className="input input-bordered flex-1"
          value={datasetPath}
          onChange={(e) => setDatasetPath(e.target.value)}
          placeholder="C:/path/to/images"
        />
        <button className="btn btn-primary" onClick={fetchItems} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Search size={16} />} Load
        </button>
        <div className="badge badge-neutral whitespace-nowrap">{items.length} Files</div>
      </div>

      {/* Batch Processing Bar (Only in Mining) */}
      {activeTab === "mining" && (
        <div className="alert alert-info shadow-sm flex-col items-start gap-2">
          <div className="flex w-full justify-between items-center">
            <div className="flex gap-2">
              <Layers size={20} />
              <div>
                <h3 className="font-bold">Batch Processing</h3>
                <div className="text-xs">Process all {items.length} images ONE-BY-ONE securely.</div>
              </div>
            </div>
            <div className="flex gap-2">
              {!isBatching ? (
                <button className="btn btn-sm btn-ghost border-current" onClick={handleBatchProcess} disabled={loading || items.length === 0}>
                  <Play size={16} /> Start Batch Loop
                </button>
              ) : (
                <button className="btn btn-sm btn-error" onClick={handleStopBatch}>
                  <Square size={16} fill="white" /> STOP
                </button>
              )}
            </div>
          </div>

          {isBatching && (
            <div className="w-full space-y-1">
              <progress className="progress progress-success w-full" value={batchProgress.current} max={batchProgress.total}></progress>
              <div className="text-xs font-mono text-right">{batchProgress.current} / {batchProgress.total} processed</div>
            </div>
          )}
        </div>
      )}

      {activeTab === "mining" && <Workspace title="Generation Workspace" />}

      {activeTab === "verification" && <VerificationQueue datasetPath={datasetPath} />}

      {activeTab === "correction" && <CorrectionQueue />}
    </div>
  );
}
