"use client";

import { useState } from "react";
import { Upload, FileCode, CheckCircle, AlertCircle, Loader2, Folder, RefreshCw, FileImage } from "lucide-react";

export default function DatasetPage() {
    const [activeTab, setActiveTab] = useState<"zip" | "local" | "convert">("zip");

    // State for ZIP Upload
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<any>(null);

    // State for Local Path
    const [localPath, setLocalPath] = useState("");
    const [validating, setValidating] = useState(false);
    const [localPathResult, setLocalPathResult] = useState<any>(null);

    // State for Converter
    const [convImageDir, setConvImageDir] = useState("");
    const [convMaskDir, setConvMaskDir] = useState("");
    const [convDatasetName, setConvDatasetName] = useState("");
    const [converting, setConverting] = useState(false);
    const [convertResult, setConvertResult] = useState<any>(null);

    // Common State
    const [configResult, setConfigResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // --- ZIP HANDLERS ---
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);
        setError(null);
        setUploadResult(null);
        setConfigResult(null);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("http://localhost:8000/api/dataset/upload", {
                method: "POST",
                body: formData,
            });
            if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
            const data = await res.json();
            setUploadResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setUploading(false);
        }
    };

    // --- LOCAL PATH HANDLERS ---
    const handleValidatePath = async () => {
        if (!localPath) return;
        setValidating(true);
        setError(null);
        setLocalPathResult(null);
        setConfigResult(null);

        try {
            const res = await fetch("http://localhost:8000/api/dataset/validate-path", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dataset_path: localPath }),
            });
            const data = await res.json();
            if (!data.valid) throw new Error(data.message);
            setLocalPathResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setValidating(false);
        }
    };

    // --- CONVERTER HANDLERS ---
    const handleConvert = async () => {
        if (!convImageDir || !convMaskDir || !convDatasetName) return;
        setConverting(true);
        setError(null);
        setConvertResult(null);
        setConfigResult(null);

        try {
            const res = await fetch("http://localhost:8000/api/dataset/convert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source_image_dir: convImageDir,
                    source_mask_dir: convMaskDir,
                    dataset_name: convDatasetName
                }),
            });
            if (!res.ok) throw new Error(`Conversion failed`);
            const data = await res.json();
            setConvertResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setConverting(false);
        }
    };

    // --- BROWSE HANDLER ---
    const handleBrowse = async (target: "local" | "convImage" | "convMask") => {
        try {
            const res = await fetch("http://localhost:8000/api/system/open-file-dialog");
            const data = await res.json();
            if (data.path) {
                if (target === "local") setLocalPath(data.path);
                if (target === "convImage") setConvImageDir(data.path);
                if (target === "convMask") setConvMaskDir(data.path);
            }
        } catch (e) {
            console.error("Browse failed", e);
        }
    };

    // --- CONFIG HANDLER ---
    const handleCreateConfig = async (source: "zip" | "local" | "convert") => {
        let name, path;
        if (source === "zip" && uploadResult) {
            name = uploadResult.dataset_name;
            path = uploadResult.dataset_path;
        } else if (source === "local" && localPathResult) {
            // Extract name from path base
            path = localPathResult.root_path;
            name = path.split(/[\\/]/).pop() || "custom_dataset";
        } else if (source === "convert" && convertResult) {
            name = convertResult.dataset_name;
            path = convertResult.dataset_path;
        }

        if (!name || !path) return;

        try {
            const res = await fetch("http://localhost:8000/api/dataset/create-config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dataset_name: name, dataset_path: path }),
            });
            if (!res.ok) throw new Error("Failed to create config");
            const data = await res.json();
            setConfigResult(data);
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto">
            <div className="flex flex-col gap-4">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
                    Dataset Management
                </h1>
                <p className="text-lg opacity-80">
                    Upload datasets, use local folders, or convert raw data for SAM 3 training.
                </p>
            </div>

            {/* Tabs */}
            <div className="tabs tabs-boxed bg-base-200 p-1 rounded-xl">
                <a
                    className={`tab tab-lg ${activeTab === "zip" ? "tab-active bg-primary text-primary-content rounded-lg transition-all" : ""} flex gap-2`}
                    onClick={() => { setActiveTab("zip"); setError(null); }}
                >
                    <Upload className="w-4 h-4" /> Upload ZIP
                </a>
                <a
                    className={`tab tab-lg ${activeTab === "local" ? "tab-active bg-secondary text-secondary-content rounded-lg transition-all" : ""} flex gap-2`}
                    onClick={() => { setActiveTab("local"); setError(null); }}
                >
                    <Folder className="w-4 h-4" /> Local Path
                </a>
                <a
                    className={`tab tab-lg ${activeTab === "convert" ? "tab-active bg-accent text-accent-content rounded-lg transition-all" : ""} flex gap-2`}
                    onClick={() => { setActiveTab("convert"); setError(null); }}
                >
                    <RefreshCw className="w-4 h-4" /> Data Converter
                </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* INPUT CARD */}
                <div className="card bg-base-100 shadow-xl border border-base-content/5">
                    <div className="card-body">

                        {/* TAB 1: ZIP UPLOAD */}
                        {activeTab === "zip" && (
                            <>
                                <h2 className="card-title flex items-center gap-2 mb-4">
                                    <Upload className="w-6 h-6 text-primary" /> Upload Dataset (.zip)
                                </h2>
                                <div className="form-control w-full">
                                    <input
                                        type="file"
                                        accept=".zip"
                                        className="file-input file-input-bordered file-input-primary w-full"
                                        onChange={handleFileChange}
                                        disabled={uploading}
                                    />
                                    <span className="label-text-alt mt-2 opacity-70">Must contain COCO format (train/_annotations.coco.json)</span>
                                </div>
                                <div className="card-actions justify-end mt-4">
                                    <button className="btn btn-primary" onClick={handleUpload} disabled={!file || uploading}>
                                        {uploading ? <><Loader2 className="animate-spin" /> Uploading...</> : "Upload Dataset"}
                                    </button>
                                </div>
                            </>
                        )}

                        {/* TAB 2: LOCAL PATH */}
                        {activeTab === "local" && (
                            <>
                                <h2 className="card-title flex items-center gap-2 mb-4">
                                    <Folder className="w-6 h-6 text-secondary" /> Use Local Folder
                                </h2>
                                <div className="form-control w-full">
                                    <label className="label"><span className="label-text">Absolute Dataset Path</span></label>
                                    <div className="join w-full">
                                        <input
                                            type="text"
                                            placeholder="e.g. C:\Datasets\my-coco-data"
                                            className="input input-bordered input-secondary w-full join-item"
                                            value={localPath}
                                            onChange={(e) => setLocalPath(e.target.value)}
                                        />
                                        <button className="btn btn-secondary join-item" onClick={() => handleBrowse("local")}>Browse</button>
                                    </div>
                                </div>
                                <div className="card-actions justify-end mt-4">
                                    <button className="btn btn-secondary" onClick={handleValidatePath} disabled={!localPath || validating}>
                                        {validating ? <Loader2 className="animate-spin" /> : "Validate Path"}
                                    </button>
                                </div>
                            </>
                        )}

                        {/* TAB 3: CONVERTER */}
                        {activeTab === "convert" && (
                            <>
                                <h2 className="card-title flex items-center gap-2 mb-4">
                                    <RefreshCw className="w-6 h-6 text-accent" /> Raw Data Converter
                                </h2>
                                <div className="space-y-3">
                                    <div className="form-control w-full">
                                        <label className="label"><span className="label-text">Dataset Name (Output)</span></label>
                                        <input
                                            type="text"
                                            placeholder="my_new_dataset"
                                            className="input input-bordered w-full"
                                            value={convDatasetName}
                                            onChange={(e) => setConvDatasetName(e.target.value)}
                                        />
                                    </div>
                                    <div className="form-control w-full">
                                        <label className="label"><span className="label-text">Images Folder Path</span></label>
                                        <div className="join w-full">
                                            <input
                                                type="text"
                                                placeholder="C:\Data\Raw_Images"
                                                className="input input-bordered w-full join-item"
                                                value={convImageDir}
                                                onChange={(e) => setConvImageDir(e.target.value)}
                                            />
                                            <button className="btn btn-neutral join-item" onClick={() => handleBrowse("convImage")}>Browse</button>
                                        </div>
                                    </div>
                                    <div className="form-control w-full">
                                        <label className="label"><span className="label-text">Masks Folder Path</span></label>
                                        <div className="join w-full">
                                            <input
                                                type="text"
                                                placeholder="C:\Data\Raw_Masks"
                                                className="input input-bordered w-full join-item"
                                                value={convMaskDir}
                                                onChange={(e) => setConvMaskDir(e.target.value)}
                                            />
                                            <button className="btn btn-neutral join-item" onClick={() => handleBrowse("convMask")}>Browse</button>
                                        </div>
                                        <span className="label-text-alt opacity-70">Masks should match image filenames</span>
                                    </div>
                                </div>
                                <div className="card-actions justify-end mt-4">
                                    <button className="btn btn-accent" onClick={handleConvert} disabled={!convImageDir || !convMaskDir || !convDatasetName || converting}>
                                        {converting ? <><Loader2 className="animate-spin" /> Converting (Please Wait)...</> : "Convert & Create"}
                                    </button>
                                </div>
                                {converting && (
                                    <div className="text-xs text-center opacity-70 mt-2 animate-pulse">
                                        Processing images and masks... This may take a minute for large datasets.
                                    </div>
                                )}
                            </>
                        )}

                        {/* STATUS MESSAGES */}
                        {error && (
                            <div className="alert alert-error mt-4 text-sm">
                                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {activeTab === "zip" && uploadResult && (
                            <div className="alert alert-success mt-4">
                                <CheckCircle className="w-5 h-5" /> <div>Upload Complete! <div className="text-xs opacity-75">{uploadResult.dataset_name}</div></div>
                            </div>
                        )}
                        {activeTab === "local" && localPathResult && (
                            <div className="alert alert-success mt-4">
                                <CheckCircle className="w-5 h-5" /> <div>Path Valid! <div className="text-xs opacity-75">{localPathResult.root_path}</div></div>
                            </div>
                        )}
                        {activeTab === "convert" && convertResult && (
                            <div className="alert alert-success mt-4">
                                <CheckCircle className="w-5 h-5" /> <div>Converted! <div className="text-xs opacity-75">{convertResult.images_processed} images processed</div></div>
                            </div>
                        )}
                    </div>
                </div>

                {/* CONFIGURATION CARD */}
                <div className={`card bg-base-100 shadow-xl border border-base-content/5 ${(!uploadResult && !localPathResult && !convertResult) ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="card-body">
                        <h2 className="card-title flex items-center gap-2">
                            <FileCode className="w-6 h-6 text-warning" /> Generate Config
                        </h2>
                        <p className="text-sm opacity-70 mb-4">
                            Create a SAM 3 training configuration file automatically linked to your data.
                        </p>

                        <div className="card-actions justify-end mt-4">
                            <button
                                className="btn btn-warning"
                                onClick={() => handleCreateConfig(activeTab)}
                                disabled={(!uploadResult && activeTab === 'zip') || (!localPathResult && activeTab === 'local') || (!convertResult && activeTab === 'convert')}
                            >
                                Generate SAM3 Config
                            </button>
                        </div>

                        {configResult && (
                            <div className="alert alert-info mt-4">
                                <CheckCircle className="w-5 h-5" />
                                <div>
                                    <h3 className="font-bold">Config Created!</h3>
                                    <div className="text-xs mt-1 break-all">
                                        <p>File: {configResult.config_name}</p>
                                        <p className="mt-2 text-xs opacity-70">Go to <strong>Training</strong> page to start.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
