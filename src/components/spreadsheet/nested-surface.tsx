"use client";

import { useEffect, useRef, useState } from "react";
import { type GridData, normalizeGrid } from "@/lib/grid-types";
import { Grid } from "./grid";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;

// a zoomable, scrollable surface that renders a spreadsheet grid with the same
// zoom + navigation experience as the main spreadsheet. used for the fullscreen
// view of a nested spreadsheet. it does not own persistence — the caller passes
// the grid and receives changes via onChange. zoom is gesture-only (no visible
// controls).
export function NestedSurface({
  grid,
  depth,
  onChange,
}: {
  grid: GridData;
  depth: number;
  onChange: (g: GridData) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  // measure the natural (unscaled) surface size so the scroll container shows
  // correct scrollbars at any zoom.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const measure = () => setNatural({ w: el.scrollWidth, h: el.scrollHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [grid]);

  const handleChange = (next: GridData) => onChange(normalizeGrid(next));

  // ctrl/cmd-wheel zoom (desktop + trackpad pinch). plain wheel scrolls.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => clamp(z - e.deltaY * 0.005, MIN_ZOOM, MAX_ZOOM));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // two-finger pinch on touch devices that don't map pinch to ctrl+wheel.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let initialDist = 0;
    let initialZoom = 1;
    const dist = (t1: Touch, t2: Touch) =>
      Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialDist = dist(e.touches[0], e.touches[1]);
        initialZoom = zoom;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDist > 0) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        setZoom(clamp(initialZoom * (d / initialDist), MIN_ZOOM, MAX_ZOOM));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) initialDist = 0;
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [zoom]);

  const nw = natural.w * zoom;
  const nh = natural.h * zoom;

  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      {/* scrollable surface */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto grid-scroll scroll-thin"
        style={{ touchAction: "pan-x pan-y pinch-zoom" }}
      >
        <div style={{ width: nw || "100%", height: nh || "100%", minWidth: "100%" }}>
          <div
            ref={surfaceRef}
            className="grid-surface"
            style={{ transform: `scale(${zoom})` }}
          >
            <Grid data={grid} onChange={handleChange} depth={depth} />
          </div>
        </div>
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
