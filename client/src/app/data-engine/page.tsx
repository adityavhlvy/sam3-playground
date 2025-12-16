"use client";
import { useState } from "react";
import { Check, X, Flag, Eye, Database } from "lucide-react";

export default function DataEnginePage() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold flex items-center gap-2"><Database className="w-8 h-8" /> Data Engine</h1>

            <div className="tabs tabs-boxed">
                <a className="tab tab-active">Human Verification (Phase 1)</a>
                <a className="tab">Data Mining (Phase 2)</a>
                <a className="tab">Video Annotation (Phase 4)</a>
            </div>

            <div className="card bg-base-100 shadow-xl border border-warning/20">
                <div className="card-body">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="card-title text-2xl">Mask Verification Task</h2>
                            <p className="text-base-content/70">Is the highlighted mask valid for the prompt <span className="badge badge-outline font-bold">"Blue Car"</span>?</p>
                        </div>
                        <div className="badge badge-lg badge-neutral">ID: img_0012.jpg</div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-6">
                        <div className="relative rounded-xl overflow-hidden aspect-video bg-base-200">
                            {/* Placeholder for Image + Box */}
                            <div className="absolute inset-0 flex items-center justify-center text-base-content/30 font-bold">
                                Original Image + Box
                            </div>
                        </div>
                        <div className="relative rounded-xl overflow-hidden aspect-video bg-black">
                            {/* Placeholder for Zoomed Mask */}
                            <div className="absolute inset-0 flex items-center justify-center text-error font-bold">
                                Detail Mask View
                            </div>
                        </div>
                    </div>

                    <div className="card-actions justify-center mt-8 gap-4">
                        <button className="btn btn-error btn-lg gap-2">
                            <X size={24} /> Reject
                        </button>
                        <button className="btn btn-warning btn-lg gap-2">
                            <Flag size={24} /> Flag
                        </button>
                        <button className="btn btn-success btn-lg gap-2">
                            <Check size={24} /> Accept
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
