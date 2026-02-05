"use client";
import React, { useRef, useState, useEffect } from "react";

export interface Point {
  x: number;
  y: number;
  label: number; // 1 for positive (click), 0 for negative (right click/shift click)
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  label: number; // 1 for positive, 0 for negative
}

interface AnnotationCanvasProps {
  imageUrl: string;
  polygons?: number[][][][]; // [Object][Contour][Point][x,y] normalized
  colors?: number[][]; // [Object][r,g,b]
  onPointsChange?: (points: Point[]) => void;
  onBoxesChange?: (boxes: Box[]) => void;
  interactionMode?: "point" | "box";
  width?: number; // Treated as MAX width
  height?: number; // Treated as MAX height
  masks?: any[]; // RLE or raw mask objects
  points?: Point[]; // Point annotations
  boxes?: Box[]; // Box annotations
}

export function AnnotationCanvas({
  imageUrl,
  polygons,
  colors,
  masks,
  onPointsChange,
  onBoxesChange,
  interactionMode = "point",
  width = 640,
  height = 480,
  points = [],
  boxes = [],
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<Box | null>(null);

  // Dynamic canvas dimensions based on image aspect ratio
  const [canvasDim, setCanvasDim] = useState({ w: width, h: height });

  // Load image
  useEffect(() => {
    const image = new Image();
    image.src = imageUrl;
    image.crossOrigin = "anonymous";
    image.onload = () => {
      // Calculate aspect-correct dims that fit within width/height props
      if (image.naturalWidth === 0 || image.naturalHeight === 0) return;

      const ratio = image.naturalWidth / image.naturalHeight;

      // Try fitting to width first
      let newW = width;
      let newH = width / ratio;

      // If height is too big, fit to height
      if (newH > height) {
        newH = height;
        newW = height * ratio;
      }

      setCanvasDim({ w: newW, h: newH });
      setImg(image);
    };
  }, [imageUrl, width, height]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvasDim.w, canvasDim.h);

    // Draw Image
    // Use calculated dimensions to preserve aspect ratio
    ctx.drawImage(img, 0, 0, canvasDim.w, canvasDim.h);

    // Draw Bitmasks/RLE (New Support for Phase 2 Visualization)
    if (masks && masks.length > 0) {
      console.log("[AnnotationCanvas] Rendering masks, count:", masks.length);
      console.log("[AnnotationCanvas] First mask type:", typeof masks[0], Array.isArray(masks[0]) ? "isArray" : "notArray");

      masks.forEach((maskObj) => {
        // 1. If it's a raw RLE object (counts/size) or boolean array
        // Ideally we decode RLE to canvas, but for speed we might render a simple overlay
        // if it's already decoded.

        // Simple fallback: If mask is a Polygon (list of points), draw it.
        // If mask is SAM output... SAM returns RLE usually.

        // For now, let's assume the backend passes 'segmentation' which IS the RLE/Mask.
        // Decoding RLE in JS is heavy. Ideally backend sends polygons.
        // BUT: If the mask is coming from 'generate_proposals', it might be RLE.

        // Hack: Visualizing RLE on client without library is hard.
        // We will rely on "polygons" if available.
        // If "masks" is passed, we check if it has a polygon representation?
        // Or we just try to draw it if it's a list of points.
      });

      // Actually, let's use a simpler approach:
      // If we want to visualize generated masks, we should convert them to Polygons on SERVER
      // OR render them as a semitransparent overlay Image if possible.
      // Current 'masks' prop is likely RLE.

      // To fix this quickly without huge dependencies:
      // We will fallback to NOT determining precise shape if RLE.
      // But wait! SAM3 'predict_image' returns 'masks' as RLE? 
      // Let's check model.py... it returns lists (boolean arrays converted to list).

      // If it's a BOOlean array (0/1) list of lists:
      // We can draw it!
      // But it's 2D array. Iterating pixels in JS is slow.

      // Detect nesting level to handle 2D (H,W) or 3D (1,H,W) / (N,H,W)
      let mask2D = masks[0];

      console.log("[AnnotationCanvas] mask2D initial:", Array.isArray(mask2D) ? `Array[${mask2D.length}]` : typeof mask2D);

      // Safety check: deeply nested?
      if (Array.isArray(mask2D) && mask2D.length > 0) {
        console.log("[AnnotationCanvas] mask2D[0] type:", typeof mask2D[0], Array.isArray(mask2D[0]) ? `Array[${mask2D[0].length}]` : "notArray");
        if (Array.isArray(mask2D[0]) && mask2D[0].length > 0) {
          console.log("[AnnotationCanvas] mask2D[0][0] type:", typeof mask2D[0][0], Array.isArray(mask2D[0][0]) ? `Array[${mask2D[0][0].length}]` : "notArray");
          if (Array.isArray(mask2D[0][0])) {
            // It's 3D: [Channel][Row][Col] -> Take first channel
            console.log("[AnnotationCanvas] Detected 3D mask, flattening...");
            mask2D = mask2D[0];
          }
        }
      }

      if (Array.isArray(mask2D) && Array.isArray(mask2D[0])) {
        const mH = mask2D.length;
        const mW = mask2D[0].length;
        console.log("[AnnotationCanvas] Mask dimensions: H=", mH, "W=", mW);

        // Create offscreen canvas to scale mask to image size
        const offCanvas = document.createElement('canvas');
        offCanvas.width = mW;
        offCanvas.height = mH;
        const offCtx = offCanvas.getContext('2d');
        if (offCtx) {
          const imgData = offCtx.createImageData(mW, mH);
          let pixelCount = 0;
          for (let r = 0; r < mH; r++) {
            for (let c = 0; c < mW; c++) {
              // Support boolean (false/true) or number (0/1)
              const val = mask2D[r][c];
              if (val === true || val > 0) { // Thresh
                const idx = (r * mW + c) * 4;
                imgData.data[idx] = 0;     // R
                imgData.data[idx + 1] = 255; // G (Green)
                imgData.data[idx + 2] = 0;   // B
                imgData.data[idx + 3] = 100; // Alpha
                pixelCount++;
              }
            }
          }
          console.log("[AnnotationCanvas] Positive pixels:", pixelCount, "out of", mH * mW);
          offCtx.putImageData(imgData, 0, 0);

          // Draw scaled to fit main canvas
          ctx.drawImage(offCanvas, 0, 0, canvasDim.w, canvasDim.h);
        }
      } else {
        console.log("[AnnotationCanvas] mask2D is not a 2D array, cannot render");
      }
    }

    // Draw Polygons (Existing logic)
    if (polygons) {
      polygons.forEach((objectPolys, objIdx) => {
        const color =
          colors && colors[objIdx]
            ? `rgba(${colors[objIdx][0]}, ${colors[objIdx][1]}, ${colors[objIdx][2]}, 0.4)`
            : `rgba(0, 255, 0, 0.4)`;

        const strokeColor =
          colors && colors[objIdx]
            ? `rgba(${colors[objIdx][0]}, ${colors[objIdx][1]}, ${colors[objIdx][2]}, 1)`
            : `rgba(0, 255, 0, 1)`;

        ctx.fillStyle = color;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;

        objectPolys.forEach((contour) => {
          if (contour.length < 2) return;
          ctx.beginPath();
          // Use canvasDim instead of props for normalization
          ctx.moveTo(contour[0][0] * canvasDim.w, contour[0][1] * canvasDim.h);
          for (let i = 1; i < contour.length; i++) {
            ctx.lineTo(contour[i][0] * canvasDim.w, contour[i][1] * canvasDim.h);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        });
      });
    }

    // Draw Current Box (being drawn)
    if (currentBox) {
      ctx.beginPath();
      ctx.rect(currentBox.x, currentBox.y, currentBox.w, currentBox.h);
      ctx.strokeStyle = "#FFFF00"; // Yellow for drawing
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

  }, [img, points, boxes, currentBox, canvasDim, polygons, colors, masks]); // Added masks to deps

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (interactionMode === "box") {
      const pos = getMousePos(e);
      setIsDrawing(true);
      setStartPos(pos);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (interactionMode === "box" && isDrawing && startPos) {
      const pos = getMousePos(e);
      const w = pos.x - startPos.x;
      const h = pos.y - startPos.y;
      setCurrentBox({
        x: w < 0 ? pos.x : startPos.x,
        y: h < 0 ? pos.y : startPos.y,
        w: Math.abs(w),
        h: Math.abs(h),
        label: 1, // Default positive for now
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (interactionMode === "box" && isDrawing && currentBox) {
      setIsDrawing(false);
      // Add box if it has some size
      if (currentBox.w > 5 && currentBox.h > 5) {
        if (onBoxesChange) onBoxesChange([...boxes, currentBox]);
      }
      setCurrentBox(null);
      setStartPos(null);
    }
  };

  const handleMouseClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (interactionMode === "point") {
      const pos = getMousePos(e);
      // Left click = positive (1), Right click (or Shift+Left) = negative (0)
      const label = e.shiftKey ? 0 : 1;
      const newPoints = [...points, { ...pos, label }];
      if (onPointsChange) onPointsChange(newPoints);
    }
  };

  return (
    <div
      className="relative border border-base-300 rounded-lg overflow-hidden bg-black flex justify-center items-center"
      // Container maintains the MAX size but centers the canvas
      style={{ width: width, height: height, display: 'flex' }}
    >
      <canvas
        ref={canvasRef}
        width={canvasDim.w}
        height={canvasDim.h}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleMouseClick}
        className={`cursor-${interactionMode === 'point' ? 'crosshair' : 'nwse-resize'}`}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="absolute top-2 right-2 flex gap-2">
        <button
          className="btn btn-xs btn-error opacity-80 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            if (onPointsChange) onPointsChange([]);
            if (onBoxesChange) onBoxesChange([]);
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
