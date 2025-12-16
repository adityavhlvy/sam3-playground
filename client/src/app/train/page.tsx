"use client";

import { useEffect, useState, useRef } from "react";
import { Line } from "react-chartjs-2";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from "chart.js";
import { Terminal, Play, Square, Settings } from "lucide-react";

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

export default function TrainingPage() {
    const [configs, setConfigs] = useState<string[]>([]);
    const [selectedConfig, setSelectedConfig] = useState("");
    const [isTraining, setIsTraining] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [chartData, setChartData] = useState<any>({
        labels: [],
        datasets: [
            {
                label: "Loss",
                data: [],
                borderColor: "rgb(255, 99, 132)",
                backgroundColor: "rgba(255, 99, 132, 0.5)",
            },
        ],
    });

    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Fetch configs
        fetch("http://localhost:8000/api/train/configs")
            .then((res) => res.json())
            .then((data) => {
                setConfigs(data.configs);
                if (data.configs.length > 0) setSelectedConfig(data.configs[0]);
            })
            .catch((err) => console.error("Failed to fetch configs", err));

        // WS connection
        const ws = new WebSocket("ws://localhost:8000/api/train/ws/logs");

        ws.onmessage = (event) => {
            const line = event.data;
            setLogs((prev) => [...prev.slice(-1000), line]); // Keep last 1000 lines

            // Simple parsing logic for loss (mock example, assumes line like "Loss: 0.123")
            // Adapt based on actual SAM3 log format
            if (line.includes("Loss:")) {
                const parts = line.split("Loss:");
                const val = parseFloat(parts[1]);
                if (!isNaN(val)) {
                    setChartData((prev: any) => {
                        const newLabels = [...prev.labels, prev.labels.length + 1];
                        const newData = [...prev.datasets[0].data, val];
                        return {
                            ...prev,
                            labels: newLabels,
                            datasets: [{ ...prev.datasets[0], data: newData }]
                        };
                    });
                }
            }
        };

        return () => {
            ws.close();
        }
    }, []);

    useEffect(() => {
        // Auto scroll logs
        logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    const startTraining = async () => {
        try {
            const res = await fetch("http://localhost:8000/api/train/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ config_path: selectedConfig })
            });
            if (res.ok) {
                setIsTraining(true);
                setLogs((prev) => [...prev, "--- Training Started ---"]);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const stopTraining = async () => {
        try {
            await fetch("http://localhost:8000/api/train/stop", { method: "POST" });
            setIsTraining(false);
            setLogs((prev) => [...prev, "--- Training Stopped ---"]);
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold flex items-center gap-2"><Settings className="w-8 h-8" /> Training Control</h1>
                <div className="flex gap-2">
                    {!isTraining ? (
                        <button onClick={startTraining} className="btn btn-primary"><Play className="w-4 h-4" /> Start Training</button>
                    ) : (
                        <button onClick={stopTraining} className="btn btn-error"><Square className="w-4 h-4" /> Stop Training</button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Config Panel */}
                <div className="card bg-base-100 shadow-xl col-span-1">
                    <div className="card-body">
                        <h2 className="card-title">Configuration</h2>
                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text">Select Config</span>
                            </label>
                            <select
                                className="select select-bordered"
                                value={selectedConfig}
                                onChange={(e) => setSelectedConfig(e.target.value)}
                            >
                                {configs.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        <div className="divider">Stages</div>
                        <ul className="steps steps-vertical">
                            <li className="step step-primary">Perception Encoder</li>
                            <li className="step">Detector Pre-train</li>
                            <li className="step">Detector Fine-tune</li>
                            <li className="step">Tracker Training</li>
                        </ul>
                    </div>
                </div>

                {/* Metrics Chart */}
                <div className="card bg-base-100 shadow-xl col-span-1 lg:col-span-2">
                    <div className="card-body">
                        <h2 className="card-title">Live Metrics</h2>
                        <div className="h-64 w-full">
                            <Line options={{ responsive: true, maintainAspectRatio: false }} data={chartData} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Terminal */}
            <div className="card bg-black text-green-400 font-mono shadow-xl overflow-hidden border border-gray-800">
                <div className="card-header p-2 bg-gray-900 border-b border-gray-700 flex items-center gap-2">
                    <Terminal className="w-4 h-4" /> Output Log
                </div>
                <div className="card-body p-4 h-64 overflow-y-auto custom-scrollbar">
                    {logs.map((log, i) => (
                        <div key={i} className="whitespace-pre-wrap">{log}</div>
                    ))}
                    <div ref={logEndRef} />
                </div>
            </div>
        </div>
    );
}
