"use client";
import { useState, useEffect } from "react";
import { Check, X, Flag, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { AnnotationCanvas } from "@/components/AnnotationCanvas";

export function VerificationQueue({ datasetPath }: { datasetPath: string }) {
  const [currentItem, setCurrentItem] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [voting, setVoting] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Fetch single item at current offset
  const fetchCurrentItem = async (offset: number = 0) => {
    if (!datasetPath) return;
    setLoading(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/data-engine/queue?dataset_path=${encodeURIComponent(datasetPath)}&limit=1&offset=${offset}`
      );
      const data = await res.json();
      console.log("[VerificationQueue] API response:", data);

      setTotal(data.total || 0);

      if (data.queue && data.queue.length > 0) {
        const item = data.queue[0];
        console.log("[VerificationQueue] Loaded item with", item.polygons?.length || 0, "polygons");
        setCurrentItem(item);
      } else {
        setCurrentItem(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentIndex(0);
    fetchCurrentItem(0);
  }, [datasetPath]);

  const handleVote = async (decision: string) => {
    if (!currentItem || voting) return;

    setVoting(true);

    try {
      const proposalIds = currentItem.proposal_ids || [];
      console.log(`[VerificationQueue] Voting '${decision}' for ${proposalIds.length} proposals`);

      await fetch("http://localhost:8000/api/data-engine/bulk_verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_ids: proposalIds,
          decision: decision,
        }),
      });

      // After voting, fetch next item (same offset since current was removed)
      await fetchCurrentItem(currentIndex);

    } catch (e) {
      console.error(e);
    } finally {
      setVoting(false);
    }
  };

  const handleSkip = async (direction: number) => {
    const newIndex = Math.max(0, Math.min(total - 1, currentIndex + direction));
    setCurrentIndex(newIndex);
    await fetchCurrentItem(newIndex);
  };

  // Helper to get display URL for local file
  const getDisplayUrl = (path: string | null) => {
    if (!path) return "";
    if (path.startsWith("/")) return path;
    return `http://localhost:8000/api/system/file/${encodeURIComponent(path)}`;
  };

  if (loading && !currentItem)
    return (
      <div className="flex flex-col justify-center items-center p-10 gap-4">
        <Loader2 className="animate-spin w-8 h-8" />
        <p className="text-sm opacity-70">Loading verification queue...</p>
      </div>
    );

  if (!currentItem || total === 0)
    return (
      <div className="text-center p-10 border border-dashed rounded-xl">
        <h3 className="font-bold text-lg">Queue Empty</h3>
        <p>No "generated" items pending review.</p>
        <button className="btn btn-sm btn-primary mt-4" onClick={() => fetchCurrentItem(0)}>
          Refresh Queue
        </button>
      </div>
    );

  return (
    <div className="card bg-base-100 shadow-xl border border-warning/20 max-w-4xl mx-auto">
      <div className="card-body">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="card-title text-2xl">Verification Queue</h2>
            <p className="text-base-content/70">
              Prompt:{" "}
              <span className="badge badge-outline font-bold">{currentItem.prompt}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                className="btn btn-xs btn-ghost"
                onClick={() => handleSkip(-1)}
                disabled={currentIndex === 0 || loading}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-mono">{currentIndex + 1} / {total}</span>
              <button
                className="btn btn-xs btn-ghost"
                onClick={() => handleSkip(1)}
                disabled={currentIndex >= total - 1 || loading}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="flex gap-2">
              <div className="badge badge-lg badge-success">{currentItem.polygons?.length || 0} masks</div>
              <button className="btn btn-xs btn-ghost" onClick={() => fetchCurrentItem(currentIndex)} disabled={voting}>
                ↻
              </button>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <progress
          className="progress progress-primary w-full h-2"
          value={total - (currentIndex + 1)}
          max={total}
        ></progress>
        <div className="text-xs text-center opacity-50">{total} images remaining</div>

        <div className="grid grid-cols-1 gap-4 mt-4">
          <div className="h-[400px] bg-base-200 rounded-xl relative flex items-center justify-center">
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <AnnotationCanvas
                imageUrl={getDisplayUrl(currentItem.path)}
                width={800}
                height={400}
                polygons={currentItem.polygons}
                colors={currentItem.colors}
                onPointsChange={() => { }}
              />
            )}
          </div>
        </div>

        <div className="card-actions justify-center mt-6 gap-4">
          <button
            className="btn btn-error btn-lg gap-2"
            onClick={() => handleVote("reject")}
            disabled={voting || loading}
          >
            {voting ? <Loader2 className="animate-spin" size={24} /> : <X size={24} />} Reject
          </button>
          <button
            className="btn btn-warning btn-lg gap-2"
            onClick={() => handleVote("flag")}
            disabled={voting || loading}
          >
            {voting ? <Loader2 className="animate-spin" size={24} /> : <Flag size={24} />} Flag
          </button>
          <button
            className="btn btn-success btn-lg gap-2"
            onClick={() => handleVote("accept")}
            disabled={voting || loading}
          >
            {voting ? <Loader2 className="animate-spin" size={24} /> : <Check size={24} />} Accept
          </button>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="text-center text-xs opacity-50 mt-2">
          Tip: Use ← → to navigate, or vote to proceed automatically
        </div>
      </div>
    </div>
  );
}
