"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { PolygonEditor } from "./PolygonEditor";

interface QueueItem {
    image_id: string;
    path: string;
    polygons: number[][][][];
    colors: number[][];
    proposal_ids: number[];
}

export function CorrectionQueue() {
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchQueue = async () => {
        setLoading(true);
        try {
            const res = await fetch("http://localhost:8000/api/data-engine/flagged_queue");
            const data = await res.json();
            console.log("[CorrectionQueue] Fetched:", data);
            setQueue(data.queue || []);
            setCurrentIndex(0);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
    }, []);

    const currentItem = queue[currentIndex];

    const getDisplayUrl = (path: string | null) => {
        if (!path) return "";
        return `http://localhost:8000/api/system/file/${encodeURIComponent(path)}`;
    };

    // Move to next item
    const handleNext = useCallback(() => {
        if (currentIndex < queue.length - 1) {
            setCurrentIndex(prev => prev + 1);
        }
    }, [currentIndex, queue.length]);

    // Skip without saving (just move to next)
    const handleSkip = useCallback(() => {
        handleNext();
    }, [handleNext]);

    // Handle save from PolygonEditor
    const handleSave = async (polygons: any[]) => {
        if (!currentItem) return;

        setSaving(true);
        try {
            // Group polygons by proposalId
            const proposalPolygonsMap: { [key: number]: number[][][] } = {};

            for (const poly of polygons) {
                if (poly.proposalId && poly.visible) {
                    if (!proposalPolygonsMap[poly.proposalId]) {
                        proposalPolygonsMap[poly.proposalId] = [];
                    }
                    proposalPolygonsMap[poly.proposalId].push(poly.points);
                }
            }

            // Save each proposal's polygons
            for (const [proposalId, polygonPoints] of Object.entries(proposalPolygonsMap)) {
                console.log(`[CorrectionQueue] Saving proposal ${proposalId} with ${polygonPoints.length} polygons`);

                await fetch("http://localhost:8000/api/data-engine/update_proposal_mask", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        proposal_id: parseInt(proposalId),
                        polygons: polygonPoints,
                    }),
                });
            }

            // Mark as corrected
            await fetch("http://localhost:8000/api/data-engine/bulk_verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    proposal_ids: currentItem.proposal_ids,
                    decision: "corrected",
                }),
            });

        } catch (e) {
            console.error("[CorrectionQueue] Save error:", e);
        } finally {
            setSaving(false);
        }
    };

    // Reject and skip
    const handleReject = async () => {
        if (!currentItem) return;

        setSaving(true);
        try {
            await fetch("http://localhost:8000/api/data-engine/bulk_verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    proposal_ids: currentItem.proposal_ids,
                    decision: "reject",
                }),
            });

            // Remove from local queue
            setQueue(prev => prev.filter((_, i) => i !== currentIndex));
            if (currentIndex >= queue.length - 1 && currentIndex > 0) {
                setCurrentIndex(currentIndex - 1);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    // Keyboard navigation for queue (arrow keys)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft" && currentIndex > 0) {
                setCurrentIndex(prev => prev - 1);
            }
            if (e.key === "ArrowRight" && currentIndex < queue.length - 1) {
                setCurrentIndex(prev => prev + 1);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentIndex, queue.length]);

    if (loading) {
        return (
            <div className="flex justify-center p-10">
                <Loader2 className="animate-spin" />
            </div>
        );
    }

    if (queue.length === 0) {
        return (
            <div className="text-center p-10 border border-dashed rounded-xl">
                <h3 className="font-bold text-lg">No Flagged Items</h3>
                <p className="text-base-content/70">No items have been flagged for correction.</p>
                <button className="btn btn-sm btn-primary mt-4" onClick={fetchQueue}>
                    Refresh
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex justify-between items-center bg-base-200 p-3 rounded-lg">
                <div>
                    <h2 className="text-lg font-bold">Correction Workspace</h2>
                    <p className="text-xs text-base-content/70">
                        {currentIndex + 1} / {queue.length} • Use ←→ to navigate, Space to save & next
                    </p>
                </div>

                {/* Navigation */}
                <div className="flex items-center gap-2">
                    <button
                        className="btn btn-sm"
                        onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                        disabled={currentIndex === 0}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="px-3 font-mono">{currentIndex + 1} / {queue.length}</span>
                    <button
                        className="btn btn-sm"
                        onClick={() => setCurrentIndex(Math.min(queue.length - 1, currentIndex + 1))}
                        disabled={currentIndex === queue.length - 1}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>

                {/* Reject */}
                <button
                    className="btn btn-sm btn-error"
                    onClick={handleReject}
                    disabled={saving}
                >
                    {saving ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                    Reject All
                </button>
            </div>

            {/* Path */}
            <div className="text-xs text-base-content/50 truncate">
                {currentItem?.path}
            </div>

            {/* Polygon Editor with callbacks */}
            {currentItem && (
                <PolygonEditor
                    key={currentItem.image_id}
                    imageUrl={getDisplayUrl(currentItem.path)}
                    initialPolygons={currentItem.polygons}
                    initialColors={currentItem.colors}
                    proposalIds={currentItem.proposal_ids}
                    onSave={handleSave}
                    onNext={handleNext}
                    onSkip={handleSkip}
                    autoSelectAll={true}
                />
            )}
        </div>
    );
}

