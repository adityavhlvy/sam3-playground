"use client";
import { useState } from "react";
import { Upload, Camera, Zap } from "lucide-react";

export default function InferencePage() {
    const [image, setImage] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [promptText, setPromptText] = useState("");

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => {
                setImage(ev.target?.result as string);
            };
            reader.readAsDataURL(file);
            // Clear result when new image uploaded
            setResult(null);
        }
    };

    const runInference = async () => {
        if (!selectedFile) return;
        setIsProcessing(true);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append("image", selectedFile);
            if (promptText) {
                formData.append("prompt", promptText);
            }

            const response = await fetch("http://localhost:8000/api/inference/predict/image", {
                method: "POST",
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                if (data.status === "success") {
                    setResult(data.image_base64);
                } else {
                    alert("Inference failed: " + JSON.stringify(data));
                }
            } else {
                const err = await response.text();
                alert("Server Error: " + err);
            }
        } catch (error) {
            console.error("Inference Error:", error);
            alert("Network Error");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold flex items-center gap-2"><Zap className="w-8 h-8" /> Inference</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        <h2 className="card-title">Input</h2>
                        <div className="border-2 border-dashed border-base-content/20 rounded-xl h-64 flex items-center justify-center relative overflow-hidden bg-base-200">
                            {image ? (
                                <img src={image} alt="Input" className="w-full h-full object-contain" />
                            ) : (
                                <div className="text-center">
                                    <Upload className="mx-auto h-12 w-12 text-base-content/50" />
                                    <p className="mt-2 text-sm text-base-content/70">Upload Image or Video</p>
                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleUpload} />
                                </div>
                            )}
                        </div>
                        <div className="form-control mt-4">
                            <label className="label"><span className="label-text">Text Prompt</span></label>
                            <input
                                type="text"
                                placeholder="e.g., 'car', 'person', 'field'"
                                className="input input-bordered"
                                value={promptText}
                                onChange={(e) => setPromptText(e.target.value)}
                            />
                        </div>
                        <div className="card-actions justify-end mt-4">
                            <button className="btn btn-primary" onClick={runInference} disabled={!selectedFile || isProcessing}>
                                {isProcessing ? (
                                    <>
                                        <span className="loading loading-spinner"></span> Processing...
                                    </>
                                ) : "Run Segment Anything"}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        <h2 className="card-title">Output</h2>
                        <div className="border-2 border-base-content/10 rounded-xl h-96 bg-black flex items-center justify-center text-white/50 relative overflow-hidden">
                            {result ? (
                                <img src={result} alt="Result Overlay" className="w-full h-full object-contain" />
                            ) : (
                                <span className="opacity-50 text-sm">Results will appear here</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
