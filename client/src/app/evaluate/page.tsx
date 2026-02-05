"use client";
import { useState, useEffect } from "react";
import {
    BarChart3, Play, Loader2, FileJson, FolderOpen,
    CheckCircle2, XCircle, ArrowRight
} from "lucide-react";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
);

interface EvaluationResult {
    evaluation_name: string;
    gt_path: string;
    pred_path: string;
    summary: {
        mIoU: number;
        median_iou: number;
        precision: number;
        recall: number;
        f1_score: number;
        total_gt: number;
        total_pred: number;
        total_tp: number;
        total_fp: number;
        total_fn: number;
        num_images: number;
    };
    per_image: {
        image_id: number;
        image_name: string;
        num_gt: number;
        num_pred: number;
        true_positives: number;
        false_positives: number;
        false_negatives: number;
        mean_iou: number;
        precision: number;
        recall: number;
    }[];
}

export default function EvaluatePage() {
    const [gtPath, setGtPath] = useState("");
    const [predPath, setPredPath] = useState("");
    const [evalName, setEvalName] = useState("eval_" + Date.now());
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<EvaluationResult | null>(null);
    const [mode, setMode] = useState<"manual" | "auto">("manual");
    const [datasetPath, setDatasetPath] = useState("");
    const [prompt, setPrompt] = useState("rice field");

    // Run manual evaluation with GT and prediction files
    const runManualEval = async () => {
        if (!gtPath || !predPath) {
            alert("Please provide both GT and Predictions paths");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("http://localhost:8000/api/evaluate/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    gt_path: gtPath,
                    pred_path: predPath,
                    evaluation_name: evalName,
                }),
            });

            const data = await res.json();
            if (data.summary) {
                setResults(data);
            } else {
                alert("Evaluation failed: " + (data.detail || "Unknown error"));
            }
        } catch (e) {
            console.error(e);
            alert("Evaluation failed: " + e);
        } finally {
            setLoading(false);
        }
    };

    // Run auto evaluation: inference + compare with Data Engine export
    const runAutoEval = async () => {
        if (!datasetPath) {
            alert("Please provide dataset path (exported from Data Engine)");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("http://localhost:8000/api/evaluate/from_inference", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    dataset_path: datasetPath,
                    prompt: prompt,
                }),
            });

            const data = await res.json();
            if (data.summary) {
                setResults(data);
            } else {
                alert("Evaluation failed: " + (data.detail || "Unknown error"));
            }
        } catch (e) {
            console.error(e);
            alert("Evaluation failed: " + e);
        } finally {
            setLoading(false);
        }
    };

    // Generate chart data for per-image IoU
    const getIoUChartData = () => {
        if (!results) return null;

        return {
            labels: results.per_image.slice(0, 20).map((r) => r.image_name.slice(0, 15)),
            datasets: [
                {
                    label: "IoU",
                    data: results.per_image.slice(0, 20).map((r) => r.mean_iou),
                    backgroundColor: results.per_image.slice(0, 20).map((r) =>
                        r.mean_iou >= 0.7 ? "rgba(34, 197, 94, 0.7)" :
                            r.mean_iou >= 0.5 ? "rgba(234, 179, 8, 0.7)" :
                                "rgba(239, 68, 68, 0.7)"
                    ),
                },
            ],
        };
    };

    // Generate confusion matrix chart
    const getConfusionChartData = () => {
        if (!results) return null;

        return {
            labels: ["True Positive", "False Positive", "False Negative"],
            datasets: [
                {
                    data: [
                        results.summary.total_tp,
                        results.summary.total_fp,
                        results.summary.total_fn,
                    ],
                    backgroundColor: [
                        "rgba(34, 197, 94, 0.8)",
                        "rgba(239, 68, 68, 0.8)",
                        "rgba(234, 179, 8, 0.8)",
                    ],
                },
            ],
        };
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <BarChart3 className="w-8 h-8" /> Model Evaluation
                </h1>
            </div>

            {/* Mode Toggle */}
            <div className="tabs tabs-boxed w-fit">
                <a
                    className={`tab ${mode === "manual" ? "tab-active" : ""}`}
                    onClick={() => setMode("manual")}
                >
                    Manual (Upload Files)
                </a>
                <a
                    className={`tab ${mode === "auto" ? "tab-active" : ""}`}
                    onClick={() => setMode("auto")}
                >
                    Auto (Data Engine Export)
                </a>
            </div>

            {/* Input Section */}
            <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                    <h2 className="card-title">
                        {mode === "manual" ? "Compare GT vs Predictions" : "Evaluate with Data Engine Export"}
                    </h2>

                    {mode === "manual" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text flex items-center gap-2">
                                        <FileJson size={16} /> Ground Truth (COCO JSON)
                                    </span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered"
                                    placeholder="C:/path/to/_annotations.coco.json"
                                    value={gtPath}
                                    onChange={(e) => setGtPath(e.target.value)}
                                />
                            </div>

                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text flex items-center gap-2">
                                        <FileJson size={16} /> Predictions (JSON)
                                    </span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered"
                                    placeholder="C:/path/to/predictions.json"
                                    value={predPath}
                                    onChange={(e) => setPredPath(e.target.value)}
                                />
                            </div>

                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text">Evaluation Name</span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered"
                                    value={evalName}
                                    onChange={(e) => setEvalName(e.target.value)}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text flex items-center gap-2">
                                        <FolderOpen size={16} /> Dataset Path (Data Engine Export)
                                    </span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered"
                                    placeholder="C:/path/to/exported/dataset"
                                    value={datasetPath}
                                    onChange={(e) => setDatasetPath(e.target.value)}
                                />
                            </div>

                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text">Prompt</span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    <div className="card-actions justify-end mt-4">
                        <button
                            className="btn btn-primary gap-2"
                            onClick={mode === "manual" ? runManualEval : runAutoEval}
                            disabled={loading}
                        >
                            {loading ? (
                                <Loader2 className="animate-spin" size={18} />
                            ) : (
                                <Play size={18} />
                            )}
                            Run Evaluation
                        </button>
                    </div>
                </div>
            </div>

            {/* Results Section */}
            {results && (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="stat bg-base-100 rounded-box shadow">
                            <div className="stat-title">mIoU</div>
                            <div className={`stat-value text-2xl ${results.summary.mIoU >= 0.7 ? "text-success" :
                                    results.summary.mIoU >= 0.5 ? "text-warning" : "text-error"
                                }`}>
                                {(results.summary.mIoU * 100).toFixed(1)}%
                            </div>
                        </div>

                        <div className="stat bg-base-100 rounded-box shadow">
                            <div className="stat-title">Precision</div>
                            <div className="stat-value text-2xl">
                                {(results.summary.precision * 100).toFixed(1)}%
                            </div>
                        </div>

                        <div className="stat bg-base-100 rounded-box shadow">
                            <div className="stat-title">Recall</div>
                            <div className="stat-value text-2xl">
                                {(results.summary.recall * 100).toFixed(1)}%
                            </div>
                        </div>

                        <div className="stat bg-base-100 rounded-box shadow">
                            <div className="stat-title">F1 Score</div>
                            <div className={`stat-value text-2xl ${results.summary.f1_score >= 0.7 ? "text-success" :
                                    results.summary.f1_score >= 0.5 ? "text-warning" : "text-error"
                                }`}>
                                {(results.summary.f1_score * 100).toFixed(1)}%
                            </div>
                        </div>

                        <div className="stat bg-base-100 rounded-box shadow">
                            <div className="stat-title">Images</div>
                            <div className="stat-value text-2xl">
                                {results.summary.num_images}
                            </div>
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Per-Image IoU Chart */}
                        <div className="card bg-base-100 shadow-xl col-span-2">
                            <div className="card-body">
                                <h2 className="card-title">Per-Image IoU (Top 20)</h2>
                                <div className="h-64">
                                    {getIoUChartData() && (
                                        <Bar
                                            data={getIoUChartData()!}
                                            options={{
                                                responsive: true,
                                                maintainAspectRatio: false,
                                                scales: {
                                                    y: {
                                                        beginAtZero: true,
                                                        max: 1,
                                                    },
                                                },
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Confusion Matrix */}
                        <div className="card bg-base-100 shadow-xl">
                            <div className="card-body">
                                <h2 className="card-title">Detection Stats</h2>
                                <div className="h-48">
                                    {getConfusionChartData() && (
                                        <Doughnut
                                            data={getConfusionChartData()!}
                                            options={{
                                                responsive: true,
                                                maintainAspectRatio: false,
                                            }}
                                        />
                                    )}
                                </div>
                                <div className="flex flex-col gap-1 mt-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="flex items-center gap-1">
                                            <CheckCircle2 className="text-success" size={14} /> TP
                                        </span>
                                        <span>{results.summary.total_tp}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="flex items-center gap-1">
                                            <XCircle className="text-error" size={14} /> FP
                                        </span>
                                        <span>{results.summary.total_fp}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="flex items-center gap-1">
                                            <XCircle className="text-warning" size={14} /> FN
                                        </span>
                                        <span>{results.summary.total_fn}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Per-Image Table */}
                    <div className="card bg-base-100 shadow-xl">
                        <div className="card-body">
                            <h2 className="card-title">Per-Image Results</h2>
                            <div className="overflow-x-auto">
                                <table className="table table-zebra table-sm">
                                    <thead>
                                        <tr>
                                            <th>Image</th>
                                            <th>GT</th>
                                            <th>Pred</th>
                                            <th>TP</th>
                                            <th>FP</th>
                                            <th>FN</th>
                                            <th>IoU</th>
                                            <th>Precision</th>
                                            <th>Recall</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.per_image.map((row, i) => (
                                            <tr key={i}>
                                                <td className="font-mono text-xs max-w-[200px] truncate">
                                                    {row.image_name}
                                                </td>
                                                <td>{row.num_gt}</td>
                                                <td>{row.num_pred}</td>
                                                <td className="text-success">{row.true_positives}</td>
                                                <td className="text-error">{row.false_positives}</td>
                                                <td className="text-warning">{row.false_negatives}</td>
                                                <td className={`font-bold ${row.mean_iou >= 0.7 ? "text-success" :
                                                        row.mean_iou >= 0.5 ? "text-warning" : "text-error"
                                                    }`}>
                                                    {(row.mean_iou * 100).toFixed(1)}%
                                                </td>
                                                <td>{(row.precision * 100).toFixed(1)}%</td>
                                                <td>{(row.recall * 100).toFixed(1)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
