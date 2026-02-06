"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
    Move, MousePointer, Trash2, ZoomIn, ZoomOut,
    Eye, EyeOff, Save, Minimize2, Undo, Redo, Edit3, Plus,
    CheckSquare, Keyboard, Zap, SkipForward, Check, Magnet
} from "lucide-react";

interface PolygonData {
    id: string;
    points: number[][]; // [[x, y], ...] normalized 0-1
    color: number[];
    visible: boolean;
    proposalId?: number;
}

interface PolygonEditorProps {
    imageUrl: string;
    width?: number;
    height?: number;
    initialPolygons?: number[][][][];
    initialColors?: number[][];
    proposalIds?: number[];
    onSave?: (polygons: PolygonData[]) => void;
    onNext?: () => void;  // NEW: callback for next image
    onSkip?: () => void;  // NEW: callback for skip
    readOnly?: boolean;
    autoSelectAll?: boolean;  // NEW: auto-select all polygons on load
}

type EditorMode = "select" | "pan" | "draw" | "edit";

const COLORS = [
    [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0],
    [0, 255, 255], [255, 0, 255], [128, 0, 0], [0, 128, 0],
];

export function PolygonEditor({
    imageUrl,
    width: propWidth,
    height: propHeight,
    initialPolygons = [],
    initialColors = [],
    proposalIds = [],
    onSave,
    onNext,
    onSkip,
    readOnly = false,
    autoSelectAll = true,  // Default to auto-select for productivity
}: PolygonEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ w: propWidth || 1000, h: propHeight || 650 });
    const width = propWidth || containerSize.w;
    const height = propHeight || containerSize.h;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [polygons, setPolygons] = useState<PolygonData[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [mode, setMode] = useState<EditorMode>("select");
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [imageSize, setImageSize] = useState({ w: 0, h: 0 });
    const [drawingPoints, setDrawingPoints] = useState<number[][]>([]);
    const [showShortcuts, setShowShortcuts] = useState(false);

    // Box Selection State
    const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);

    // Potential Vertex State (ghost vertex on edge)
    const [potentialVertex, setPotentialVertex] = useState<{ index: number, x: number, y: number } | null>(null);

    // History for undo/redo - use refs to avoid stale closures
    const historyRef = useRef<PolygonData[][]>([]);
    const historyIndexRef = useRef(-1);
    const [, forceUpdate] = useState(0); // Trigger re-render when history changes

    // Simplify settings - default lower for faster workflow
    const [simplifyTarget, setSimplifyTarget] = useState(6);
    const [showSimplifyModal, setShowSimplifyModal] = useState(false);

    // Vertex edit state
    const [editingVertexIdx, setEditingVertexIdx] = useState<number | null>(null);
    const [hoveredVertexIdx, setHoveredVertexIdx] = useState<number | null>(null);

    // Pan state
    const isPanning = useRef(false);
    const lastPanPoint = useRef({ x: 0, y: 0 });

    const selectedId = selectedIds.size > 0 ? Array.from(selectedIds)[0] : null;
    const selectedPoly = polygons.find(p => selectedIds.has(p.id));

    // Responsive container
    useEffect(() => {
        if (propWidth && propHeight) return;

        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width: w } = entry.contentRect;
                setContainerSize({ w: Math.max(700, w - 32), h: Math.max(550, Math.min(750, w * 0.65)) });
            }
        });

        if (containerRef.current?.parentElement) {
            observer.observe(containerRef.current.parentElement);
        }

        return () => observer.disconnect();
    }, [propWidth, propHeight]);

    // Save to history - using refs for immediate access
    const saveToHistory = useCallback((newPolygons: PolygonData[]) => {
        const currentIndex = historyIndexRef.current;
        const newHistory = historyRef.current.slice(0, currentIndex + 1);
        newHistory.push(JSON.parse(JSON.stringify(newPolygons)));
        historyRef.current = newHistory;
        historyIndexRef.current = currentIndex + 1;
        forceUpdate(n => n + 1); // Trigger UI update
    }, []);

    // Initialize polygons + AUTO-SELECT ALL
    useEffect(() => {
        const polyData: PolygonData[] = [];
        initialPolygons.forEach((contours, idx) => {
            if (contours && contours.length > 0) {
                contours.forEach((contour, cIdx) => {
                    if (contour && contour.length > 2) {
                        polyData.push({
                            id: `poly-${idx}-${cIdx}-${Date.now()}-${Math.random()}`,
                            points: contour,
                            color: initialColors[idx] || COLORS[idx % COLORS.length],
                            visible: true,
                            proposalId: proposalIds[idx],
                        });
                    }
                });
            }
        });
        setPolygons(polyData);

        // AUTO-SELECT ALL for productivity
        if (autoSelectAll && polyData.length > 0) {
            setSelectedIds(new Set(polyData.map(p => p.id)));
        }

        if (polyData.length > 0) {
            historyRef.current = [JSON.parse(JSON.stringify(polyData))];
            historyIndexRef.current = 0;
        }
    }, [initialPolygons, initialColors, proposalIds, autoSelectAll]);

    // Load image
    useEffect(() => {
        if (!imageUrl) return;
        setIsLoading(true);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            imageRef.current = img;
            setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
            setIsLoading(false);
        };
        img.onerror = () => setIsLoading(false);
        img.src = imageUrl;
    }, [imageUrl]);

    // MOUSE WHEEL ZOOM - touchpad friendly
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();

            if (e.ctrlKey) {
                // Pinch zoom on touchpad
                const delta = -e.deltaY * 0.01;
                setZoom(prev => Math.min(Math.max(prev + delta, 0.5), 4));
            } else {
                // Pan with two-finger scroll
                setPan(prev => ({
                    x: prev.x - e.deltaX,
                    y: prev.y - e.deltaY
                }));
            }
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', handleWheel);
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (readOnly) return;

            const key = e.key.toLowerCase();
            const target = e.target as HTMLElement;

            // Skip if typing in input
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            // Delete selected
            if (key === "delete" || key === "backspace") {
                e.preventDefault();
                if (mode === "edit" && hoveredVertexIdx !== null && selectedId) {
                    handleDeleteVertex(hoveredVertexIdx);
                } else if (selectedIds.size > 0) {
                    handleDeleteSelected();
                }
            }

            // Mode shortcuts
            if (key === "v" || key === "1") { e.preventDefault(); setMode("select"); }
            if (key === "e" || key === "2") { e.preventDefault(); if (selectedId) setMode("edit"); }
            if (key === "h" || key === "3") { e.preventDefault(); setMode("pan"); }
            if (key === "d" || key === "4") { e.preventDefault(); setMode("draw"); }

            // Undo/Redo
            if (e.ctrlKey || e.metaKey) {
                if (key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
                if (key === "z" && e.shiftKey) { e.preventDefault(); handleRedo(); }
                if (key === "y") { e.preventDefault(); handleRedo(); }
                if (key === "s") { e.preventDefault(); handleSave(); }
                if (key === "a") { e.preventDefault(); selectAll(); }
            }

            // Zoom
            if (key === "=" || key === "+") { e.preventDefault(); handleZoom(0.25); }
            if (key === "-") { e.preventDefault(); handleZoom(-0.25); }
            if (key === "0") { e.preventDefault(); resetView(); }

            // PRODUCTIVITY SHORTCUTS
            // Space = Save and proceed to next
            if (key === " ") {
                e.preventDefault();
                handleSaveAndNext();
            }

            // N = Skip to next without saving
            if (key === "n" && !e.ctrlKey) {
                e.preventDefault();
                if (onSkip) onSkip();
            }

            // Q = Quick simplify all (to target)
            if (key === "q") {
                e.preventDefault();
                simplifyAll(simplifyTarget);
            }

            // S = Simplify modal (if selected)
            if (key === "s" && !e.ctrlKey && !e.metaKey && selectedIds.size > 0) {
                e.preventDefault();
                setShowSimplifyModal(true);
            }

            // A = Select all (without Ctrl for quick access)
            if (key === "a" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                selectAll();
            }

            // Escape
            if (key === "escape") {
                setSelectedIds(new Set());
                setMode("select");
                setDrawingPoints([]);
            }

            // Enter to finish drawing
            if (key === "enter" && mode === "draw" && drawingPoints.length >= 3) {
                e.preventDefault();
                finishDrawing();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [mode, selectedId, selectedIds, hoveredVertexIdx, drawingPoints, readOnly, onSkip, simplifyTarget]);

    // Undo - instant with refs
    const handleUndo = useCallback(() => {
        const idx = historyIndexRef.current;
        if (idx > 0) {
            historyIndexRef.current = idx - 1;
            const prevState = historyRef.current[idx - 1];
            if (prevState) {
                setPolygons(JSON.parse(JSON.stringify(prevState)));
                forceUpdate(n => n + 1);
            }
        }
    }, []);

    // Redo - instant with refs
    const handleRedo = useCallback(() => {
        const idx = historyIndexRef.current;
        const len = historyRef.current.length;
        if (idx < len - 1) {
            historyIndexRef.current = idx + 1;
            const nextState = historyRef.current[idx + 1];
            if (nextState) {
                setPolygons(JSON.parse(JSON.stringify(nextState)));
                forceUpdate(n => n + 1);
            }
        }
    }, []);

    // Update polygons with history
    const updatePolygons = useCallback((updater: (prev: PolygonData[]) => PolygonData[]) => {
        setPolygons(prev => {
            const next = updater(prev);
            saveToHistory(next);
            return next;
        });
    }, [saveToHistory]);

    // Delete selected
    const handleDeleteSelected = useCallback(() => {
        if (selectedIds.size === 0) return;
        updatePolygons(prev => prev.filter(p => !selectedIds.has(p.id)));
        setSelectedIds(new Set());
    }, [selectedIds, updatePolygons]);

    // Delete vertex
    const handleDeleteVertex = useCallback((vertexIdx: number) => {
        if (!selectedId) return;
        updatePolygons(prev => prev.map(p => {
            if (p.id !== selectedId) return p;
            if (p.points.length <= 3) return p;
            const newPoints = [...p.points];
            newPoints.splice(vertexIdx, 1);
            return { ...p, points: newPoints };
        }));
        setHoveredVertexIdx(null);
    }, [selectedId, updatePolygons]);

    // Select all
    const selectAll = useCallback(() => {
        setSelectedIds(new Set(polygons.map(p => p.id)));
    }, [polygons]);

    // Toggle visibility
    const toggleVisibility = useCallback((id: string) => {
        setPolygons(prev => prev.map(p => p.id === id ? { ...p, visible: !p.visible } : p));
    }, []);

    // SIMPLIFY ALL - key productivity feature
    const simplifyAll = useCallback((targetVertices: number) => {
        updatePolygons(prev => prev.map(p => {
            if (p.points.length <= targetVertices) return p;

            const ratio = Math.max(1, Math.floor(p.points.length / targetVertices));
            const simplified = p.points.filter((_, i) =>
                i % ratio === 0 || i === 0 || i === p.points.length - 1
            );

            return { ...p, points: simplified.length >= 3 ? simplified : p.points };
        }));
    }, [updatePolygons]);

    // Simplify selected
    const simplifySelected = useCallback((targetVertices: number) => {
        if (selectedIds.size === 0) return;
        updatePolygons(prev => prev.map(p => {
            if (!selectedIds.has(p.id) || p.points.length <= targetVertices) return p;

            const ratio = Math.max(1, Math.floor(p.points.length / targetVertices));
            const simplified = p.points.filter((_, i) =>
                i % ratio === 0 || i === 0 || i === p.points.length - 1
            );

            return { ...p, points: simplified.length >= 3 ? simplified : p.points };
        }));
    }, [selectedIds, updatePolygons]);

    // Get scale
    const getScale = useCallback(() => {
        if (imageSize.w === 0 || imageSize.h === 0) return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

        const scaleX = width / imageSize.w;
        const scaleY = height / imageSize.h;
        const scale = Math.min(scaleX, scaleY);

        const displayW = imageSize.w * scale;
        const displayH = imageSize.h * scale;
        const offsetX = (width - displayW) / 2;
        const offsetY = (height - displayH) / 2;

        return { scaleX: scale, scaleY: scale, offsetX, offsetY, displayW, displayH };
    }, [width, height, imageSize]);

    // Coord converters
    const toCanvas = useCallback((nx: number, ny: number) => {
        const { scaleX, scaleY, offsetX, offsetY } = getScale();
        return {
            x: (nx * imageSize.w * scaleX + offsetX) * zoom + pan.x,
            y: (ny * imageSize.h * scaleY + offsetY) * zoom + pan.y,
        };
    }, [getScale, imageSize, zoom, pan]);

    const toNormalized = useCallback((cx: number, cy: number) => {
        const { scaleX, scaleY, offsetX, offsetY } = getScale();
        const x = (cx - pan.x) / zoom;
        const y = (cy - pan.y) / zoom;
        const nx = (x - offsetX) / (imageSize.w * scaleX);
        const ny = (y - offsetY) / (imageSize.h * scaleY);
        return { nx: Math.max(0, Math.min(1, nx)), ny: Math.max(0, Math.min(1, ny)) };
    }, [getScale, imageSize, zoom, pan]);

    // Calculate Polygon Area (Shoelace Formula) - returns approx pixels area at 100% scale
    const calculatePolygonArea = useCallback((points: number[][]) => {
        if (points.length < 3) return 0;
        let area = 0;
        const { scaleX, scaleY } = getScale();
        // Use normalized coords converted to image pixels for consistent area regardless of zoom
        const pxPoints = points.map(p => ({ x: p[0] * imageSize.w, y: p[1] * imageSize.h }));

        for (let i = 0; i < pxPoints.length; i++) {
            const j = (i + 1) % pxPoints.length;
            area += pxPoints[i].x * pxPoints[j].y;
            area -= pxPoints[j].x * pxPoints[i].y;
        }
        return Math.abs(area) / 2;
    }, [getScale, imageSize]);

    // Auto Clean - Remove small polygons
    const handleAutoClean = useCallback(() => {
        // Threshold: e.g., 20 pixels square
        const AREA_THRESHOLD = 50;
        updatePolygons(prev => prev.filter(p => calculatePolygonArea(p.points) >= AREA_THRESHOLD));
    }, [updatePolygons, calculatePolygonArea]);

    // SNAP ALL - calls backend to snap polygons using Voronoi
    const handleSnap = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            // Group by proposal
            const proposals: { [key: number]: number[][][] } = {};
            polygons.forEach(p => {
                const pid = p.proposalId || 0;
                if (!proposals[pid]) proposals[pid] = [];
                proposals[pid].push(p.points);
            });

            // Use editor session ID or just image URL as ID context
            const res = await fetch("http://localhost:8000/api/data-engine/snap_polygons", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    image_id: imageUrl || "editor_session",
                    proposals: proposals,
                    width: imageSize.w,
                    height: imageSize.h
                })
            });

            if (!res.ok) throw new Error("Snap failed");

            const data = await res.json();

            if (data.proposals) {
                const newPolygons: PolygonData[] = [];

                // Reconstruct polygons preserving color/props
                Object.entries(data.proposals).forEach(([pidStr, polys]) => {
                    const pid = parseInt(pidStr);
                    // Find original color/props for this pid
                    const origPoly = polygons.find(p => p.proposalId === pid);
                    const color = origPoly ? origPoly.color : COLORS[0];

                    (polys as number[][][]).forEach(pts => {
                        newPolygons.push({
                            id: `poly-snap-${pid}-${Math.random()}`,
                            points: pts,
                            color: color,
                            visible: true,
                            proposalId: pid
                        });
                    });
                });

                // If any proposals were missing in response (e.g. empty), they are gone.
                // But we should keep proposals that were NOT in the request (e.g. untracked)?
                // Our request included ALL polygons. So replace all.

                updatePolygons(() => newPolygons);
            }
        } catch (e) {
            console.error("Snap error", e);
            alert("Snap failed. Check console.");
        } finally {
            setIsLoading(false);
        }
    };

    // Mouse handlers
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        if (mode === "pan") {
            isPanning.current = true;
            lastPanPoint.current = { x: e.clientX, y: e.clientY };
            return;
        }

        if (mode === "draw") {
            const { nx, ny } = toNormalized(cx, cy);
            setDrawingPoints(prev => [...prev, [nx, ny]]);
            return;
        }

        if (mode === "edit" && selectedId) {
            if (e.button === 2 && hoveredVertexIdx !== null) {
                e.preventDefault();
                handleDeleteVertex(hoveredVertexIdx);
                return;
            }

            // Check if clicking on potential vertex (ghost vertex)
            if (potentialVertex) {
                const { x, y } = toCanvas(potentialVertex.x, potentialVertex.y);
                const dist = Math.sqrt((cx - x) ** 2 + (cy - y) ** 2);
                if (dist < 12) {
                    // Turn it into a real vertex
                    updatePolygons(prev => prev.map(p => {
                        if (p.id !== selectedId) return p;
                        const newPoints = [...p.points];
                        newPoints.splice(potentialVertex.index, 0, [potentialVertex.x, potentialVertex.y]);
                        return { ...p, points: newPoints };
                    }));
                    setEditingVertexIdx(potentialVertex.index); // Start dragging immediately
                    setPotentialVertex(null);
                    return;
                }
            }

            const poly = polygons.find(p => p.id === selectedId);
            if (poly) {
                for (let i = 0; i < poly.points.length; i++) {
                    const { x, y } = toCanvas(poly.points[i][0], poly.points[i][1]);
                    const dist = Math.sqrt((cx - x) ** 2 + (cy - y) ** 2);
                    if (dist < 12) {
                        setEditingVertexIdx(i);
                        return;
                    }
                }
            }
        }

        if (mode === "select") {
            let hitFound = false;
            for (const poly of polygons) {
                if (!poly.visible) continue;
                const points = poly.points.map(([nx, ny]) => toCanvas(nx, ny));
                if (isPointInPolygon(cx, cy, points)) {
                    hitFound = true;
                    if (e.shiftKey) {
                        setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (next.has(poly.id)) next.delete(poly.id);
                            else next.add(poly.id);
                            return next;
                        });
                    } else {
                        setSelectedIds(new Set([poly.id]));
                    }
                    return;
                }
            }

            // Box Selection Start
            if (!hitFound && !e.shiftKey) {
                setSelectedIds(new Set()); // Deselect all if clicked empty space
            }
            if (!hitFound) {
                setSelectionBox({ startX: cx, startY: cy, endX: cx, endY: cy });
            }
        }
    }, [mode, polygons, selectedId, toCanvas, toNormalized, hoveredVertexIdx, handleDeleteVertex, potentialVertex, updatePolygons, calculatePolygonArea]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        if (mode === "pan" && isPanning.current) {
            const dx = e.clientX - lastPanPoint.current.x;
            const dy = e.clientY - lastPanPoint.current.y;
            setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            lastPanPoint.current = { x: e.clientX, y: e.clientY };
            return;
        }

        // Selection Box Update
        if (mode === "select" && selectionBox) {
            setSelectionBox(prev => prev ? { ...prev, endX: cx, endY: cy } : null);
            return;
        }

        if (mode === "edit" && selectedId) {
            const poly = polygons.find(p => p.id === selectedId);
            if (poly) {
                // Check vertex hover
                let found = -1;
                for (let i = 0; i < poly.points.length; i++) {
                    const { x, y } = toCanvas(poly.points[i][0], poly.points[i][1]);
                    const dist = Math.sqrt((cx - x) ** 2 + (cy - y) ** 2);
                    if (dist < 12) { found = i; break; }
                }
                setHoveredVertexIdx(found >= 0 ? found : null);

                // Check edge hover for "Add Vertex" (if not hovering a vertex)
                if (found === -1 && editingVertexIdx === null) {
                    let bestEdge = null;
                    let minEdgeDist = 10; // 10px tolerance

                    for (let i = 0; i < poly.points.length; i++) {
                        const j = (i + 1) % poly.points.length;
                        const p1 = toCanvas(poly.points[i][0], poly.points[i][1]);
                        const p2 = toCanvas(poly.points[j][0], poly.points[j][1]);

                        // Distance from point to line segment
                        const l2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
                        if (l2 === 0) continue;
                        let t = ((cx - p1.x) * (p2.x - p1.x) + (cy - p1.y) * (p2.y - p1.y)) / l2;
                        t = Math.max(0, Math.min(1, t));
                        const projX = p1.x + t * (p2.x - p1.x);
                        const projY = p1.y + t * (p2.y - p1.y);

                        const dist = Math.sqrt((cx - projX) ** 2 + (cy - projY) ** 2);
                        if (dist < minEdgeDist) {
                            minEdgeDist = dist;
                            const { nx, ny } = toNormalized(projX, projY);
                            bestEdge = { index: j, x: nx, y: ny }; // Insert BEFORE j (so index j) - Wait, insert at j means between i and j? splice(j, 0, item) inserts at j, shifting j and subsequent right.
                            // i is 0, j is 1. We want to insert between 0 and 1. new index is 1. so j is correct.
                        }
                    }
                    setPotentialVertex(bestEdge);
                } else {
                    setPotentialVertex(null);
                }
            }

            if (editingVertexIdx !== null) {
                const { nx, ny } = toNormalized(cx, cy);
                setPolygons(prev => prev.map(p => {
                    if (p.id !== selectedId) return p;
                    const newPoints = [...p.points];
                    newPoints[editingVertexIdx] = [nx, ny];
                    return { ...p, points: newPoints };
                }));
            }
        }
    }, [mode, editingVertexIdx, selectedId, toNormalized, polygons, toCanvas, selectionBox]);

    const handleMouseUp = useCallback(() => {
        if (isPanning.current) isPanning.current = false;

        // Finish Selection Box
        if (mode === "select" && selectionBox) {
            const x1 = Math.min(selectionBox.startX, selectionBox.endX);
            const y1 = Math.min(selectionBox.startY, selectionBox.endY);
            const x2 = Math.max(selectionBox.startX, selectionBox.endX);
            const y2 = Math.max(selectionBox.startY, selectionBox.endY);

            // Allow small drag to be ignored (just click)
            if (Math.abs(x2 - x1) > 5 || Math.abs(y2 - y1) > 5) {
                const newSelection = new Set(selectedIds);
                polygons.forEach(poly => {
                    if (!poly.visible) return;
                    // Check if *any* point is inside the box (simple check) 
                    // OR if the polygon bounding box intersects the selection box (more robust)
                    const points = poly.points.map(([nx, ny]) => toCanvas(nx, ny));
                    const isInside = points.some(p => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2);
                    // Also check if entire polygon is inside
                    // For now, let's use: if bounding box center is inside selection box

                    if (isInside) {
                        newSelection.add(poly.id);
                    }
                });
                setSelectedIds(newSelection);
            }
            setSelectionBox(null);
        }

        if (editingVertexIdx !== null) {
            saveToHistory(polygons);
            setEditingVertexIdx(null);
        }
    }, [editingVertexIdx, polygons, saveToHistory, selectionBox, mode, selectedIds, toCanvas]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        if (mode === "edit") e.preventDefault();
    }, [mode]);

    // Finish drawing
    const finishDrawing = useCallback(() => {
        if (drawingPoints.length >= 3) {
            const newPoly: PolygonData = {
                id: `poly-new-${Date.now()}`,
                points: drawingPoints,
                color: COLORS[polygons.length % COLORS.length],
                visible: true,
            };
            updatePolygons(prev => [...prev, newPoly]);
        }
        setDrawingPoints([]);
        setMode("select");
    }, [drawingPoints, polygons.length, updatePolygons]);

    // Zoom
    const handleZoom = useCallback((delta: number) => {
        setZoom(prev => Math.min(Math.max(prev + delta, 0.5), 4));
    }, []);

    // Reset view
    const resetView = useCallback(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, []);

    // SAVE - calls onSave callback
    const handleSave = useCallback(() => {
        if (onSave) onSave(polygons);
    }, [polygons, onSave]);

    // SAVE AND NEXT - productivity feature
    const handleSaveAndNext = useCallback(() => {
        if (onSave) onSave(polygons);
        if (onNext) onNext();
    }, [polygons, onSave, onNext]);

    // Draw canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);
        ctx.save();

        const img = imageRef.current;
        if (img && imageSize.w > 0) {
            const { scaleX, offsetX, offsetY, displayW, displayH } = getScale();

            ctx.translate(pan.x, pan.y);
            ctx.scale(zoom, zoom);
            ctx.drawImage(img, offsetX, offsetY, displayW!, displayH!);

            // Draw polygons
            polygons.forEach(poly => {
                if (!poly.visible) return;

                ctx.beginPath();
                const fx = (poly.points[0][0] * imageSize.w * scaleX + offsetX);
                const fy = (poly.points[0][1] * imageSize.h * scaleX + offsetY);
                ctx.moveTo(fx, fy);

                poly.points.slice(1).forEach(([nx, ny]) => {
                    const px = nx * imageSize.w * scaleX + offsetX;
                    const py = ny * imageSize.h * scaleX + offsetY;
                    ctx.lineTo(px, py);
                });
                ctx.closePath();

                ctx.fillStyle = `rgba(${poly.color[0]}, ${poly.color[1]}, ${poly.color[2]}, 0.3)`;
                ctx.fill();
                ctx.strokeStyle = `rgb(${poly.color[0]}, ${poly.color[1]}, ${poly.color[2]})`;
                ctx.lineWidth = 2 / zoom;
                ctx.stroke();

                // Highlight selected
                if (selectedIds.has(poly.id)) {
                    ctx.strokeStyle = "#fff";
                    ctx.lineWidth = 3 / zoom;
                    ctx.stroke();

                    if (mode === "edit" && poly.id === selectedId) {
                        poly.points.forEach(([nx, ny], i) => {
                            const px = nx * imageSize.w * scaleX + offsetX;
                            const py = ny * imageSize.h * scaleX + offsetY;
                            ctx.beginPath();
                            ctx.arc(px, py, 6 / zoom, 0, Math.PI * 2);
                            ctx.fillStyle = i === editingVertexIdx ? "#ff0" : i === hoveredVertexIdx ? "#f00" : "#fff";
                            ctx.fill();
                            ctx.strokeStyle = "#000";
                            ctx.lineWidth = 1 / zoom;
                            ctx.stroke();
                        });

                        // Draw Ghost Vertex
                        if (potentialVertex) {
                            const { x, y } = toCanvas(potentialVertex.x, potentialVertex.y);
                            ctx.beginPath();
                            ctx.arc(x, y, 5 / zoom, 0, Math.PI * 2);
                            ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; // Ghost transparency
                            ctx.fill();
                            ctx.strokeStyle = "#fff";
                            ctx.stroke();
                        }
                    }
                }
            });

            // Draw Selection Box
            if (selectionBox) {
                const x = Math.min(selectionBox.startX, selectionBox.endX);
                const y = Math.min(selectionBox.startY, selectionBox.endY);
                const w = Math.abs(selectionBox.endX - selectionBox.startX);
                const h = Math.abs(selectionBox.endY - selectionBox.startY);

                ctx.fillStyle = "rgba(59, 130, 246, 0.2)"; // Primary color transparent
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = "#3b82f6";
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, w, h);
            }

            // Drawing mode
            if (drawingPoints.length > 0) {
                ctx.beginPath();
                const fp = drawingPoints[0];
                ctx.moveTo(fp[0] * imageSize.w * scaleX + offsetX, fp[1] * imageSize.h * scaleX + offsetY);
                drawingPoints.slice(1).forEach(([nx, ny]) => {
                    ctx.lineTo(nx * imageSize.w * scaleX + offsetX, ny * imageSize.h * scaleX + offsetY);
                });
                ctx.strokeStyle = "#0f0";
                ctx.lineWidth = 2 / zoom;
                ctx.stroke();

                drawingPoints.forEach(([nx, ny]) => {
                    const px = nx * imageSize.w * scaleX + offsetX;
                    const py = ny * imageSize.h * scaleX + offsetY;
                    ctx.beginPath();
                    ctx.arc(px, py, 4 / zoom, 0, Math.PI * 2);
                    ctx.fillStyle = "#0f0";
                    ctx.fill();
                });
            }
        }

        ctx.restore();
    }, [polygons, selectedIds, selectedId, mode, zoom, pan, imageSize, width, height, getScale, drawingPoints, editingVertexIdx, hoveredVertexIdx, selectionBox, potentialVertex, toCanvas]);

    function isPointInPolygon(x: number, y: number, points: { x: number; y: number }[]): boolean {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].x, yi = points[i].y;
            const xj = points[j].x, yj = points[j].y;
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    // Stats
    const totalVertices = polygons.reduce((sum, p) => sum + p.points.length, 0);

    return (
        <div className="flex flex-col gap-3" ref={containerRef}>
            {/* QUICK ACTIONS BAR - Most used actions */}
            {!readOnly && (
                <div className="flex gap-2 items-center bg-gradient-to-r from-primary/10 to-success/10 p-3 rounded-lg border border-primary/20">
                    <Zap size={16} className="text-warning" />
                    <span className="font-semibold text-sm">Quick Actions:</span>

                    <button
                        className="btn btn-sm btn-primary gap-1"
                        onClick={handleSaveAndNext}
                        title="Save & Next (Space)"
                    >
                        <Check size={14} /> Accept
                    </button>

                    <button
                        className="btn btn-sm btn-ghost gap-1"
                        onClick={onSkip}
                        title="Skip (N)"
                    >
                        <SkipForward size={14} /> Skip
                    </button>

                    <div className="divider divider-horizontal mx-1"></div>

                    <button
                        className="btn btn-sm btn-warning gap-1"
                        onClick={() => simplifyAll(simplifyTarget)}
                        title="Simplify All (Q)"
                    >
                        <Minimize2 size={14} /> Simplify All → {simplifyTarget}pts
                    </button>

                    <button
                        className="btn btn-sm btn-info gap-1"
                        onClick={handleAutoClean}
                        title="Auto Clean Small Polygons"
                    >
                        <Zap size={14} /> Auto Clean
                    </button>

                    <button
                        className="btn btn-sm btn-accent gap-1"
                        onClick={handleSnap}
                        title="Snap All (Magnet)"
                    >
                        <Magnet size={14} /> Snap All
                    </button>

                    <input
                        type="range"
                        className="range range-xs range-warning w-24"
                        min={3}
                        max={20}
                        value={simplifyTarget}
                        onChange={e => setSimplifyTarget(parseInt(e.target.value))}
                        title="Target vertices"
                    />

                    <button
                        className="btn btn-sm gap-1"
                        onClick={selectAll}
                        title="Select All (A)"
                    >
                        <CheckSquare size={14} /> All
                    </button>

                    <button
                        className="btn btn-sm btn-error gap-1"
                        onClick={handleDeleteSelected}
                        disabled={selectedIds.size === 0}
                        title="Delete Selected (Del)"
                    >
                        <Trash2 size={14} />
                    </button>

                    <div className="flex-1"></div>

                    <span className="text-xs opacity-60">
                        {polygons.length} polygons • {totalVertices} vertices
                    </span>
                </div>
            )}

            {/* Toolbar */}
            {!readOnly && (
                <div className="flex gap-2 flex-wrap items-center bg-base-200 p-2 rounded-lg text-sm">
                    <div className="join">
                        <button className={`btn btn-xs join-item ${mode === "select" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("select")} title="Select (V)">
                            <MousePointer size={14} />
                        </button>
                        <button className={`btn btn-xs join-item ${mode === "edit" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("edit")} title="Edit (E)" disabled={!selectedId}>
                            <Edit3 size={14} />
                        </button>
                        <button className={`btn btn-xs join-item ${mode === "pan" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("pan")} title="Pan (H)">
                            <Move size={14} />
                        </button>
                        <button className={`btn btn-xs join-item ${mode === "draw" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("draw")} title="Draw (D)">
                            <Plus size={14} />
                        </button>
                    </div>

                    <div className="join">
                        <button className="btn btn-xs join-item" onClick={() => handleZoom(0.25)} title="Zoom +"><ZoomIn size={14} /></button>
                        <button className="btn btn-xs join-item" onClick={resetView}>{Math.round(zoom * 100)}%</button>
                        <button className="btn btn-xs join-item" onClick={() => handleZoom(-0.25)} title="Zoom -"><ZoomOut size={14} /></button>
                    </div>

                    <button className="btn btn-xs" onClick={handleUndo} disabled={historyIndexRef.current <= 0} title="Undo (Ctrl+Z)"><Undo size={14} /></button>
                    <button className="btn btn-xs" onClick={handleRedo} disabled={historyIndexRef.current >= historyRef.current.length - 1} title="Redo"><Redo size={14} /></button>

                    {mode === "draw" && drawingPoints.length >= 3 && (
                        <button className="btn btn-xs btn-info" onClick={finishDrawing}>Finish</button>
                    )}

                    <div className="flex-1"></div>

                    <button className="btn btn-xs btn-ghost" onClick={() => setShowShortcuts(s => !s)} title="Shortcuts (?)">
                        <Keyboard size={14} />
                    </button>

                    <button className="btn btn-xs btn-success" onClick={handleSave} title="Save (Ctrl+S)">
                        <Save size={14} />
                    </button>
                </div>
            )}

            {/* Mode hint */}
            <div className="text-xs text-base-content/60 flex justify-between">
                <span>
                    {mode === "select" && "Click to select • Shift+click multi-select • Scroll to pan • Ctrl+scroll to zoom"}
                    {mode === "edit" && "Drag vertices • Right-click/Del to delete"}
                    {mode === "pan" && "Drag to pan"}
                    {mode === "draw" && "Click to add points, Enter to finish"}
                </span>
                {selectedIds.size > 0 && <span className="badge badge-sm badge-primary">{selectedIds.size} selected</span>}
            </div>

            {/* Canvas */}
            <div className="relative bg-base-300 rounded-xl overflow-hidden border border-base-content/10" style={{ width, height }}>
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-base-300/80 z-10">
                        <span className="loading loading-spinner loading-lg"></span>
                    </div>
                )}
                <canvas
                    ref={canvasRef}
                    width={width}
                    height={height}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onContextMenu={handleContextMenu}
                    style={{ cursor: mode === "pan" ? "grab" : mode === "draw" ? "crosshair" : mode === "edit" ? "pointer" : "default" }}
                />
            </div>

            {/* Compact layer list */}
            {!readOnly && polygons.length > 0 && (
                <div className="flex flex-wrap gap-1 items-center text-xs">
                    <span className="opacity-50">Layers:</span>
                    {polygons.map((poly, idx) => (
                        <button
                            key={poly.id}
                            className={`badge gap-1 cursor-pointer ${selectedIds.has(poly.id) ? "badge-primary" : "badge-ghost"}`}
                            onClick={(e) => {
                                if (e.shiftKey) {
                                    setSelectedIds(prev => {
                                        const next = new Set(prev);
                                        if (next.has(poly.id)) next.delete(poly.id);
                                        else next.add(poly.id);
                                        return next;
                                    });
                                } else {
                                    setSelectedIds(new Set([poly.id]));
                                }
                            }}
                        >
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `rgb(${poly.color.join(",")})` }} />
                            {poly.points.length}pts
                            <button
                                className="hover:text-error"
                                onClick={(e) => { e.stopPropagation(); updatePolygons(prev => prev.filter(p => p.id !== poly.id)); }}
                            >×</button>
                        </button>
                    ))}
                </div>
            )}

            {/* Shortcuts Modal */}
            {showShortcuts && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowShortcuts(false)}>
                    <div className="bg-base-100 rounded-lg p-4 min-w-[350px]" onClick={e => e.stopPropagation()}>
                        <h3 className="font-bold mb-3">Keyboard Shortcuts</h3>
                        <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-sm">
                            <div className="col-span-2 font-semibold text-primary mt-2">Quick Actions</div>
                            <kbd className="kbd kbd-sm">Space</kbd><span>Accept & Next</span>
                            <kbd className="kbd kbd-sm">N</kbd><span>Skip to Next</span>
                            <kbd className="kbd kbd-sm">Q</kbd><span>Quick Simplify All</span>
                            <kbd className="kbd kbd-sm">A</kbd><span>Select All</span>

                            <div className="col-span-2 font-semibold text-secondary mt-2">Edit</div>
                            <kbd className="kbd kbd-sm">V</kbd><span>Select mode</span>
                            <kbd className="kbd kbd-sm">E</kbd><span>Edit vertices</span>
                            <kbd className="kbd kbd-sm">Del</kbd><span>Delete</span>
                            <kbd className="kbd kbd-sm">S</kbd><span>Simplify selected</span>

                            <div className="col-span-2 font-semibold text-accent mt-2">View</div>
                            <kbd className="kbd kbd-sm">H</kbd><span>Pan mode</span>
                            <kbd className="kbd kbd-sm">+/-</kbd><span>Zoom</span>
                            <kbd className="kbd kbd-sm">Scroll</kbd><span>Pan (touchpad)</span>
                            <kbd className="kbd kbd-sm">Ctrl+Scroll</kbd><span>Zoom (touchpad)</span>

                            <div className="col-span-2 font-semibold mt-2">Other</div>
                            <kbd className="kbd kbd-sm">Ctrl+Z/Y</kbd><span>Undo/Redo</span>
                            <kbd className="kbd kbd-sm">Ctrl+S</kbd><span>Save</span>
                            <kbd className="kbd kbd-sm">Esc</kbd><span>Deselect</span>
                        </div>
                        <button className="btn btn-sm btn-primary w-full mt-4" onClick={() => setShowShortcuts(false)}>Close</button>
                    </div>
                </div>
            )}

            {/* Simplify Modal */}
            {showSimplifyModal && selectedPoly && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSimplifyModal(false)}>
                    <div className="bg-base-100 rounded-lg p-4 min-w-[300px]" onClick={e => e.stopPropagation()}>
                        <h3 className="font-bold mb-3">Simplify {selectedIds.size > 1 ? `${selectedIds.size} Polygons` : "Polygon"}</h3>
                        <p className="text-sm mb-2">Current: {selectedPoly.points.length} vertices</p>
                        <label className="label">
                            <span className="label-text">Target:</span>
                            <input type="number" className="input input-sm input-bordered w-20" value={simplifyTarget}
                                onChange={e => setSimplifyTarget(Math.max(3, parseInt(e.target.value) || 3))} min={3} />
                        </label>
                        <input type="range" className="range range-sm mt-2" min={3} max={Math.max(selectedPoly.points.length, 10)}
                            value={simplifyTarget} onChange={e => setSimplifyTarget(parseInt(e.target.value))} />
                        <div className="flex justify-end gap-2 mt-4">
                            <button className="btn btn-sm" onClick={() => setShowSimplifyModal(false)}>Cancel</button>
                            <button className="btn btn-sm btn-primary" onClick={() => { simplifySelected(simplifyTarget); setShowSimplifyModal(false); }}>Apply</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
