"use client";
import { useState, useCallback } from "react";
import { Check, X, Flag, Database, Loader2 } from "lucide-react";
import { AnnotationCanvas } from "@/components/AnnotationCanvas";
import { VerificationQueue } from "@/components/VerificationQueue";

// Mock image for demo - in real app, fetch from /api/data-engine/items
const DEMO_IMAGE = "/demo_field.jpg";

export default function DataEnginePage() {
  const [activeTab, setActiveTab] = useState("correction");
  const [loading, setLoading] = useState(false);
  const [points, setPoints] = useState<any[]>([]);
  const [maskResult, setMaskResult] = useState<any>(null);
  const [currentImage, setCurrentImage] = useState(DEMO_IMAGE);

  const handlePointsChange = useCallback(async (newPoints: any[]) => {
    setPoints(newPoints);

    // If we have points, call SAM 3 to update suggestions
    if (newPoints.length > 0) {
      setLoading(true);
      try {
        // Prepare API payload
        // Need actual image path on server. For demo, we might need a fixed path or ID.
        // Assuming the server knows "demo_field.jpg" mapping or we pass absolute path if local.
        const backendPath =
          "C:\\Users\\aksar\\OneDrive\\Pictures\\Saved Pictures\\demo_field.jpg"; // Replace with real path logic

        const response = await fetch(
          "http://localhost:8000/api/data-engine/generate_proposals?item_path=" +
          encodeURIComponent(backendPath) +
          "&prompt=field",
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
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Database className="w-8 h-8" /> Data Engine
      </h1>

      <div className="tabs tabs-boxed">
        <a
          className={`tab ${activeTab === "correction" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("correction")}
        >
          Correction Mode (Phase 3)
        </a>
        <a
          className={`tab ${activeTab === "verification" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("verification")}
        >
          Verification (Phase 2)
        </a>
        <a
          className={`tab ${activeTab === "mining" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("mining")}
        >
          Mining (Phase 1)
        </a>
      </div>

      {activeTab === "verification" && <VerificationQueue />}

      {activeTab === "mining" && (
        <div className="p-10 text-center bg-base-100 rounded-xl shadow border border-base-200">
          <h2 className="text-xl font-bold mb-4">Mining Mode</h2>
          <p className="mb-4">
            Upload raw images here to start the auto-labeling pipeline.
          </p>
          <button className="btn btn-primary">
            Select Images (Placeholder)
          </button>
        </div>
      )}

      {activeTab === "correction" && (
        <div className="card bg-base-100 shadow-xl border border-primary/20">
          <div className="card-body">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="card-title text-2xl">Interactive Correction</h2>
                <p className="text-base-content/70">
                  Click on the image to add positive points (Left Click) or
                  negative points (Shift + Click).
                </p>
              </div>
              <div className="flex gap-2">
                {loading && (
                  <div className="badge badge-accent animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin mr-1" /> Processing
                    SAM 3...
                  </div>
                )}
                <div className="badge badge-lg badge-neutral">
                  ID: demo_field.jpg
                </div>
              </div>
            </div>

            <div className="flex justify-center bg-base-200 p-4 rounded-xl">
              <AnnotationCanvas
                imageUrl={currentImage}
                onPointsChange={handlePointsChange}
                width={800}
                height={600}
                masks={maskResult?.masks}
              />
            </div>

            <div className="card-actions justify-center mt-8 gap-4">
              <button className="btn btn-error btn-lg gap-2">Discard</button>
              <button className="btn btn-success btn-lg gap-2">
                <Check size={24} /> Save Correction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
