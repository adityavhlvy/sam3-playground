"use client";
import { useState, useEffect } from "react";
import { Check, X, Flag, Loader2 } from "lucide-react";

export function VerificationQueue() {
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchNext = async () => {
    setLoading(true);
    try {
      // TODO: Backend endpoint for "get next pending"
      // For now, mock it or use list_items
      const res = await fetch(
        "http://localhost:8000/api/data-engine/items?dataset_path=."
      );
      const data = await res.json();
      // pick random for demo
      if (data.items && data.items.length > 0) setItem(data.items[0]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNext();
  }, []);

  const handleVote = async (decision: string) => {
    if (!item) return;
    try {
      await fetch("http://localhost:8000/api/data-engine/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_id: item.path,
          prompt: "auto-mined", // placeholder
          decision: decision,
          mask_data: {}, // placeholder
        }),
      });
      // fetch next
      setItem(null);
      fetchNext();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading && !item)
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (!item)
    return <div className="text-center p-10">No pending items to verify.</div>;

  return (
    <div className="card bg-base-100 shadow-xl border border-warning/20 max-w-4xl mx-auto">
      <div className="card-body">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="card-title text-2xl">Verification Queue</h2>
            <p className="text-base-content/70">
              Prompt:{" "}
              <span className="badge badge-outline font-bold">Field</span>
            </p>
          </div>
          <div className="badge badge-lg badge-neutral">ID: {item.id}</div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="relative rounded-xl overflow-hidden aspect-video bg-base-200">
            <img
              src={item.path}
              className="object-cover w-full h-full"
              alt="Original"
            />
            <div className="absolute top-2 left-2 badge badge-ghost">
              Original
            </div>
          </div>
          <div className="relative rounded-xl overflow-hidden aspect-video bg-black">
            {/* Placeholder for mask overlay - in real app, overlay mask on image */}
            <div className="absolute inset-0 flex items-center justify-center text-error font-bold">
              Mask Overlay Placeholder
            </div>
          </div>
        </div>

        <div className="card-actions justify-center mt-8 gap-4">
          <button
            className="btn btn-error btn-lg gap-2"
            onClick={() => handleVote("reject")}
          >
            <X size={24} /> Reject
          </button>
          <button
            className="btn btn-warning btn-lg gap-2"
            onClick={() => handleVote("flag")}
          >
            <Flag size={24} /> Flag
          </button>
          <button
            className="btn btn-success btn-lg gap-2"
            onClick={() => handleVote("accept")}
          >
            <Check size={24} /> Accept
          </button>
        </div>
      </div>
    </div>
  );
}
