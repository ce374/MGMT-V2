"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  type GridData,
  emptyGrid,
  normalizeGrid,
} from "@/lib/grid-types";
import { Grid } from "./grid";
import { ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { toast } from "sonner";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;

export function Spreadsheet({ fileId }: { fileId: string }) {
  const [grid, setGrid] = useState<GridData>(emptyGrid());
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const naturalSizeRef = useRef({ w: 0, h: 0 });
  const [, forceSize] = useState(0);

  // working copy + save state
  const gridRef = useRef<GridData>(emptyGrid());
  const dirtyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const fileIdRef = useRef(fileId);

  // load
  useEffect(() => {
    let active = true;
    setLoaded(false);
    api
      .getFile(fileId)
      .then((file) => {
        if (!active) return;
        const g = normalizeGrid(file.data);
        setGrid(g);
        gridRef.current = g;
        dirtyRef.current = false;
        setLoaded(true);
      })
      .catch(() => {
        toast.error("could not load file");
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [fileId]);

  // measure the natural (unscaled) surface size, then update the sizing
  // wrapper so the scroll container produces correct scrollbars at any zoom.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.scrollWidth;
      const h = el.scrollHeight;
      naturalSizeRef.current = { w, h };
      forceSize((n) => n + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  // autosave with debounce
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      try {
        await api.saveFile(fileIdRef.current, gridRef.current);
        dirtyRef.current = false;
        setSavedAt(new Date().toLocaleTimeString());
      } catch {
        toast.error("save failed");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    }, 600);
  }, []);

  const handleChange = useCallback(
    (next: GridData) => {
      const g = normalizeGrid(next);
      gridRef.current = g;
      dirtyRef.current = true;
      setGrid(g);
      scheduleSave();
    },
    [scheduleSave]
  );

  // save on unmount / file switch
  useEffect(() => {
    const id = fileId;
    fileIdRef.current = id;
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirtyRef.current) {
        // fire-and-forget final save
        api.saveFile(id, gridRef.current).catch(() => {});
      }
    };
  }, [fileId]);

  // save before unload
  useEffect(() => {
    const handler = () => {
      if (dirtyRef.current && !savingRef.current) {
        navigator.sendBeacon?.(
          `/api/files/${fileId}`,
          new Blob([JSON.stringify({ data: gridRef.current })], {
            type: "application/json",
          })
        );
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [fileId]);

  // ---- zoom ----
  // wheel zoom with ctrl (desktop trackpad gesture) or cmd. plain wheel scrolls.
  // pinch on touch is delivered as ctrl+wheel by most browsers.
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

  // pinch gesture support via touch events for browsers that don't map
  // pinch to ctrl+wheel (some android browsers)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let initialDist = 0;
    let initialZoom = 1;
    const dist = (t1: Touch, t2: Touch) => {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.hypot(dx, dy);
    };
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

  const nw = naturalSizeRef.current.w * zoom;
  const nh = naturalSizeRef.current.h * zoom;

  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      {/* zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 bg-background/90 border rounded-md px-0.5 py-0.5">
        <button
          onClick={() => setZoom((z) => clamp(z - 0.1, MIN_ZOOM, MAX_ZOOM))}
          className="h-6 w-6 grid place-items-center rounded btn-quiet"
        >
          <ZoomOut className="w-3 h-3" />
        </button>
        <span className="text-[10px] tabular-nums w-9 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => clamp(z + 0.1, MIN_ZOOM, MAX_ZOOM))}
          className="h-6 w-6 grid place-items-center rounded btn-quiet"
        >
          <ZoomIn className="w-3 h-3" />
        </button>
        <button
          onClick={() => setZoom(1)}
          className="h-6 w-6 grid place-items-center rounded btn-quiet"
        >
          <Maximize className="w-3 h-3" />
        </button>
      </div>

      {/* save indicator */}
      <div className="absolute bottom-2 left-2 z-10 text-[9px] text-muted-foreground tabular-nums">
        {saving ? "saving…" : savedAt ? `saved ${savedAt}` : ""}
      </div>

      {/* scrollable surface */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto grid-scroll scroll-thin"
        style={{ touchAction: "pan-x pan-y pinch-zoom" }}
      >
        {!loaded ? (
          <div className="w-full h-full grid place-items-center text-xs text-muted-foreground">
            loading…
          </div>
        ) : (
          <div
            style={{
              width: nw || "100%",
              height: nh || "100%",
              minWidth: "100%",
            }}
          >
            <div
              ref={surfaceRef}
              className="grid-surface"
              style={{ transform: `scale(${zoom})` }}
            >
              <Grid data={grid} onChange={handleChange} depth={0} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
