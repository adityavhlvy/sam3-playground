"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, Cpu, HardDrive, Info, Server, X, Video, ToggleRight, ToggleLeft } from "lucide-react";

export default function SystemStatus() {
    const [status, setStatus] = useState<any>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [forcingCPU, setForcingCPU] = useState(false);
    const [mounted, setMounted] = useState(false);

    const fetchStatus = async () => {
        try {
            const res = await fetch("http://localhost:8000/api/system/info");
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
                setForcingCPU(data.force_cpu);
            }
        } catch (e) {
            console.error("Status fetch failed", e);
        }
    };

    useEffect(() => {
        setMounted(true);
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000); // Refresh every 5s
        return () => clearInterval(interval);
    }, []);

    const handleToggleCPU = async () => {
        const newVal = !forcingCPU;
        setForcingCPU(newVal); // Optimistic update

        try {
            const res = await fetch("http://localhost:8000/api/system/set-device", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ force_cpu: newVal })
            });
            if (res.ok) {
                // Fetch immediately to update UI details
                setTimeout(fetchStatus, 500);
            }
        } catch (e) {
            console.error("Failed to switch device", e);
        }
    };

    if (!status) return (
        <div className="animate-pulse">
            <p className="font-bold">System Status</p>
            <p className="text-xs opacity-70">Connecting...</p>
        </div>
    );

    return (
        <>
            <div
                onClick={() => setIsOpen(true)}
                className="cursor-pointer hover:bg-base-100/50 p-3 rounded-xl transition-all duration-200 group w-full border border-transparent hover:border-base-content/5"
            >
                <div className="flex items-center justify-between mb-2">
                    <p className="font-bold text-sm tracking-wide">SYSTEM STATUS</p>
                    <Info className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                </div>

                <div className={`font-semibold text-xs truncate ${status.device_type === 'cpu' ? 'text-warning' : 'text-success'}`}>
                    <div className="flex items-center gap-2">
                        {status.device_type === 'cuda' ? <Activity className="w-4 h-4" /> : <Cpu className="w-4 h-4" />}
                        <span className="truncate">{status.device_name}</span>
                    </div>
                </div>

                <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-[11px] opacity-70">
                        <span>RAM</span>
                        <span className="font-mono">{status.ram_usage}</span>
                    </div>
                    {status.device_type === 'cuda' && (
                        <div className="flex justify-between text-[11px] opacity-70">
                            <span>VRAM</span>
                            <span className="font-mono">{status.vram}</span>
                        </div>
                    )}
                </div>

                {/* If Force CPU is on but GPU detected */}
                {status.force_cpu && status.gpu_name_detected !== "Not Detected" && (
                    <div className="mt-2 text-[10px] bg-warning/10 text-warning px-2 py-1 rounded border border-warning/20 flex items-center justify-center">
                        GPU Disabled
                    </div>
                )}
            </div>

            {/* Modal - Rendered via Portal to escape sidebar clipping */}
            {isOpen && mounted && createPortal(
                <dialog className="modal modal-open z-[99999] backdrop-blur-sm">
                    <div className="modal-box relative border border-white/10 shadow-2xl bg-base-100 max-w-lg">
                        <button onClick={() => setIsOpen(false)} className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"><X className="w-4 h-4" /></button>
                        <h3 className="font-bold text-xl flex items-center gap-2 mb-6 text-base-content">
                            <Server className="w-6 h-6 text-primary" /> System Hardware
                        </h3>

                        <div className="space-y-6">
                            {/* DEVICE CARD */}
                            <div className="stats shadow w-full bg-base-200/50 border border-base-content/5">
                                <div className="stat">
                                    <div className="stat-figure text-primary">
                                        {status.device_type === 'cuda' ? <Activity className="w-8 h-8 opacity-80" /> : <Cpu className="w-8 h-8 opacity-80" />}
                                    </div>
                                    <div className="stat-title font-bold opacity-60 text-xs tracking-wider">ACTIVE DEVICE</div>
                                    <div className={`stat-value text-xl overflow-hidden text-ellipsis whitespace-nowrap ${status.device_type === 'cuda' ? 'text-success' : 'text-warning'}`}>
                                        {status.device_name}
                                    </div>
                                    <div className="stat-desc uppercase font-bold mt-1 tracking-widest text-[10px]">{status.device_type} MODE</div>
                                </div>
                            </div>

                            {/* GPU DETECTION INFO */}
                            <div className="bg-base-200 p-4 rounded-xl flex items-center justify-between border border-base-content/5">
                                <div>
                                    <div className="text-[10px] font-bold opacity-60 uppercase tracking-widest mb-1">Detected Hardware</div>
                                    <div className="font-mono text-sm font-semibold">{status.gpu_name_detected}</div>
                                </div>
                                <div className="tooltip tooltip-left" data-tip={status.gpu_name_detected === "Not Detected" ? "No compatible NVIDIA GPU found" : "Hardware Available"}>
                                    {status.gpu_name_detected !== "Not Detected" ? <CheckCircleIcon className="w-6 h-6 text-success" /> : <AlertIcon className="w-6 h-6 text-error" />}
                                </div>
                            </div>

                            {/* FORCE CPU TOGGLE */}
                            {status.gpu_name_detected !== "Not Detected" && (
                                <div className="form-control bg-base-200 p-4 rounded-xl border border-base-content/5 transition-all hover:border-warning/30">
                                    <label className="label cursor-pointer p-0">
                                        <div className="flex flex-col gap-1">
                                            <span className="label-text font-bold flex items-center gap-2 text-base">
                                                <Cpu className="w-4 h-4" /> Force CPU Mode
                                            </span>
                                            <span className="text-[11px] opacity-60">
                                                Enable to bypass GPU usage (saves VRAM)
                                            </span>
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="toggle toggle-warning"
                                            checked={forcingCPU}
                                            onChange={handleToggleCPU}
                                        />
                                    </label>
                                </div>
                            )}


                            <div className="grid grid-cols-2 gap-4">
                                <div className="stat bg-base-200/50 rounded-xl p-4 border border-base-content/5">
                                    <div className="stat-figure text-secondary">
                                        <HardDrive className="w-5 h-5" />
                                    </div>
                                    <div className="stat-title text-[10px] font-bold opacity-60 tracking-wider">SYSTEM RAM</div>
                                    <div className="stat-value text-lg mt-1">{status.ram_usage}</div>
                                </div>

                                {status.device_type === 'cuda' && (
                                    <div className="stat bg-base-200/50 rounded-xl p-4 border border-base-content/5">
                                        <div className="stat-figure text-accent">
                                            <Video className="w-5 h-5" />
                                        </div>
                                        <div className="stat-title text-[10px] font-bold opacity-60 tracking-wider">GPU VRAM</div>
                                        <div className="stat-value text-lg mt-1">{status.vram}</div>
                                    </div>
                                )}
                            </div>

                            <div className="text-[10px] opacity-40 font-mono text-center pt-2">
                                {status.platform} • CPU Load: {status.cpu_usage} • Host: localhost
                            </div>
                        </div>
                    </div>
                    <form method="dialog" className="modal-backdrop">
                        <button onClick={() => setIsOpen(false)}>close</button>
                    </form>
                </dialog>,
                document.body
            )}
        </>
    );
}

function CheckCircleIcon({ className }: { className?: string }) {
    return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
}

function AlertIcon({ className }: { className?: string }) {
    return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
}
