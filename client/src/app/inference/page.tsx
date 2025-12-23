"use client";
import { useState } from "react";
import { Upload, Camera, Zap } from "lucide-react";

export default function InferencePage() {
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [inferenceData, setInferenceData] = useState<{
    polygons: number[][][][];
    scores: number[];
    ids: number[];
    width: number;
    height: number;
  } | null>(null);
  const [hoveredMask, setHoveredMask] = useState<number | null>(null);
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
      setInferenceData(null);
      setHoveredMask(null);
    }
  };

  const runInference = async () => {
    if (!selectedFile) return;
    if (!selectedFile) return;
    setIsProcessing(true);
    setResult(null);
    setInferenceData(null);
    setHoveredMask(null);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      if (promptText) {
        formData.append("prompt", promptText);
      }

      const response = await fetch(
        "http://localhost:8000/api/inference/predict/image",
        {
          method: "POST",
          body: formData,
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.status === "success") {
          setResult(data.image_base64);
          if (data.polygons) {
            setInferenceData({
              polygons: data.polygons,
              scores: data.scores,
              ids: data.ids,
              width: data.width,
              height: data.height,
            });
          }
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
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Zap className="w-8 h-8 text-primary" /> Inference
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full max-w-7xl">
        {/* Left Column: Controls (Smaller) */}
        <div className="card bg-base-100 shadow-xl border border-base-content/10 h-fit lg:col-span-1">
          <div className="card-body p-6">
            <h2 className="card-title text-xl font-semibold mb-6 flex items-center gap-2">
              <span className="w-1 h-6 bg-primary rounded-full"></span>
              Configuration
            </h2>

            <div className="space-y-6">
              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium opacity-70 mb-2">
                  Input Image
                </label>
                <div
                  className={`relative group border-2 border-dashed rounded-xl p-8 transition-all duration-300 ease-in-out
                    ${
                      image
                        ? "border-primary/50 bg-primary/5"
                        : "border-base-content/20 hover:border-primary hover:bg-base-200"
                    }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />

                  {image ? (
                    <div className="relative aspect-video rounded-lg overflow-hidden shadow-sm flex items-center justify-center bg-base-200">
                      {selectedFile &&
                      (selectedFile.type === "image/tiff" ||
                        selectedFile.name.toLowerCase().endsWith(".tif") ||
                        selectedFile.name.toLowerCase().endsWith(".tiff")) ? (
                        <div className="text-center p-4">
                          <div className="mx-auto w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mb-2">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-6 w-6 text-primary"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                          </div>
                          <p className="font-semibold text-base-content/70">
                            {selectedFile.name}
                          </p>
                          <p className="text-xs text-base-content/50">
                            TIFF preview not supported
                          </p>
                        </div>
                      ) : (
                        <img
                          src={image}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      )}

                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 bg-base-100/90 px-3 py-1 rounded-full text-xs font-medium shadow-sm transition-opacity text-base-content">
                          Change Image
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-3">
                      <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto transition-transform group-hover:scale-110">
                        <svg
                          className="w-6 h-6"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <div>
                        <span className="text-primary font-medium">
                          Upload a file
                        </span>
                        <span className="opacity-60"> or drag and drop</span>
                      </div>
                      <p className="text-xs opacity-40">
                        PNG, JPG, GIF up to 10MB
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Prompt Input */}
              <div>
                <label className="block text-sm font-medium opacity-70 mb-2">
                  Text Prompt
                  <span className="ml-2 text-xs opacity-40 font-normal">
                    (What do you want to segment?)
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    placeholder="e.g., 'rice field', 'building', 'road'"
                    className="input input-bordered w-full focus:input-primary transition-all"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Run Button */}
              <button
                onClick={runInference}
                disabled={isProcessing || !selectedFile || !promptText}
                className="btn btn-primary w-full shadow-lg shadow-primary/30"
              >
                {isProcessing ? (
                  <>
                    <span className="loading loading-spinner"></span>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>Run Inference</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Output (Larger, 2/3 width) */}
        <div className="card bg-base-100 shadow-xl border border-base-content/10 lg:col-span-2 flex flex-col h-full min-h-[600px]">
          <div className="card-body p-6 flex flex-col h-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="card-title text-xl font-semibold flex items-center gap-2">
                <span className="w-1 h-6 bg-secondary rounded-full"></span>
                Results
              </h2>
              {result && (
                <div className="badge badge-success badge-outline gap-2 p-3">
                  <span className="w-2 h-2 rounded-full bg-success"></span>
                  Completed
                </div>
              )}
            </div>

            <div className="flex-1 rounded-xl bg-base-200 border-2 border-dashed border-base-content/10 flex items-center justify-center relative overflow-hidden group">
              {result ? (
                <div className="relative w-full h-full flex items-center justify-center p-4">
                  {/* Aspect Ratio Container */}
                  <div
                    className="relative max-w-full max-h-full"
                    style={{
                      aspectRatio: inferenceData
                        ? `${inferenceData.width}/${inferenceData.height}`
                        : "auto",
                      width: "fit-content", // Ensure it doesn't stretch beyond image width if image is small? Actually let's just constrain by parent
                    }}
                  >
                    <img
                      src={result}
                      alt="Segmentation Output"
                      className="block max-w-full max-h-full w-auto h-auto object-contain"
                    />

                    {/* Interactive Overlay */}
                    {inferenceData && (
                      <svg
                        viewBox="0 0 1 1"
                        className="absolute inset-0 w-full h-full pointer-events-auto z-10"
                        preserveAspectRatio="none"
                        style={{ mixBlendMode: "plus-lighter" }}
                      >
                        {inferenceData.polygons.map((contours, maskIdx) => (
                          <g
                            key={maskIdx}
                            onMouseEnter={() => setHoveredMask(maskIdx)}
                            onMouseLeave={() => setHoveredMask(null)}
                            className="cursor-pointer"
                          >
                            {contours.map((points, contourIdx) => (
                              <polygon
                                key={contourIdx}
                                points={points
                                  .map((p) => p.join(","))
                                  .join(" ")}
                                fill={
                                  hoveredMask === maskIdx
                                    ? "rgba(255, 255, 255, 0.4)"
                                    : "transparent"
                                }
                                stroke={
                                  hoveredMask === maskIdx
                                    ? "#fff"
                                    : "transparent"
                                }
                                strokeWidth="0.002"
                                vectorEffect="non-scaling-stroke"
                              />
                            ))}
                          </g>
                        ))}
                      </svg>
                    )}

                    {/* Tooltip */}
                    {hoveredMask !== null && inferenceData && (
                      <div className="absolute top-2 left-2 z-20 bg-black/80 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow-xl pointer-events-none transition-all duration-200 border border-white/20">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-primary"></span>
                          ID: {inferenceData.ids[hoveredMask]}
                          <span className="opacity-50">|</span>
                          Score:{" "}
                          {(inferenceData.scores[hoveredMask] * 100).toFixed(1)}
                          %
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center opacity-50 p-8">
                  <div className="w-20 h-20 bg-base-300 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-10 h-10"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <p className="font-medium">
                    Output visualization will appear here
                  </p>
                  <p className="text-sm mt-2">
                    Upload an image and run inference to start
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
