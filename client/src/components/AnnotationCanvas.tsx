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
  width?: number;
  height?: number;
  points?: Point[];
  boxes?: Box[];
}

export function AnnotationCanvas({
  imageUrl,
  polygons,
  colors,
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

  // Load image
  useEffect(() => {
    const image = new Image();
    image.src = imageUrl;
    image.crossOrigin = "anonymous";
    image.onload = () => setImg(image);
  }, [imageUrl]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw Image
    // Maintain aspect ratio or stretch? The parent controls size usually.
    // For simplicity here, we assume the canvas size matches the display size of the image desired.
    // If width/height are fixed, we stretch.
    ctx.drawImage(img, 0, 0, width, height);

    // Draw Points
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = p.label === 1 ? "#00ff00" : "#ff0000"; // Green for pos, Red for neg
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Draw Boxes
    boxes.forEach((b) => {
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = b.label === 1 ? "#00ff00" : "#ff0000";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = b.label === 1 ? "rgba(0, 255, 0, 0.2)" : "rgba(255, 0, 0, 0.2)";
      ctx.fill();
    });

    // Draw Polygons
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
          ctx.moveTo(contour[0][0] * width, contour[0][1] * height);
          for (let i = 1; i < contour.length; i++) {
            ctx.lineTo(contour[i][0] * width, contour[i][1] * height);
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

  }, [img, points, boxes, currentBox, width, height, polygons, colors]);

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
    <div className="relative border border-base-300 rounded-lg overflow-hidden inline-block bg-black">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
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
