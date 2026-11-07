"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Play, Pause, Trash2, Plus, Volume2, VolumeX } from "lucide-react";

export function AudioCell({
  attachmentId,
  filename,
  onReplace,
  onRemove,
}: {
  attachmentId: string;
  filename: string;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);

  const url = api.attachmentUrl(attachmentId);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onDur = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration);
    };
    const onEnd = () => setPlaying(false);
    const onCanPlay = () => setReady(true);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onDur);
    a.addEventListener("durationchange", onDur);
    a.addEventListener("ended", onEnd);
    a.addEventListener("canplay", onCanPlay);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onDur);
      a.removeEventListener("durationchange", onDur);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("canplay", onCanPlay);
    };
  }, [attachmentId]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().catch(() => {});
      setPlaying(true);
    }
  };

  const seek = (e: React.PointerEvent) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setCurrent(ratio * duration);
  };

  const setVol = (v: number) => {
    setVolume(v);
    setMuted(v === 0);
    if (audioRef.current) {
      audioRef.current.volume = v;
      audioRef.current.muted = v === 0;
    }
  };

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration ? (current / duration) * 100 : 0;

  return (
    <div className="w-full p-1.5 group/m relative">
      <div className="border rounded-md p-2 bg-background">
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          crossOrigin="anonymous"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            disabled={!ready}
            className="h-7 w-7 shrink-0 grid place-items-center rounded-md bg-foreground text-background btn-quiet disabled:opacity-30"
          >
            {playing ? (
              <Pause className="w-3 h-3" />
            ) : (
              <Play className="w-3 h-3 ml-0.5" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] truncate keep-case mb-1">
              {filename}
            </div>
            {/* progress bar */}
            <div
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                seek(e);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 1) seek(e);
              }}
              className="relative h-1.5 bg-muted rounded-full cursor-pointer"
            >
              <div
                className="absolute inset-y-0 left-0 bg-foreground rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[9px] text-muted-foreground tabular-nums">
                {fmt(current)}
              </span>
              <span className="text-[9px] text-muted-foreground tabular-nums">
                {fmt(duration)}
              </span>
            </div>
          </div>
          {/* volume */}
          <div className="hidden sm:flex items-center gap-1 w-20">
            <button
              onClick={() => {
                const next = !muted;
                setMuted(next);
                if (audioRef.current) audioRef.current.muted = next;
              }}
              className="h-5 w-5 grid place-items-center text-muted-foreground btn-quiet"
            >
              {muted || volume === 0 ? (
                <VolumeX className="w-3 h-3" />
              ) : (
                <Volume2 className="w-3 h-3" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => setVol(parseFloat(e.target.value))}
              className="flex-1 h-1 accent-foreground"
            />
          </div>
        </div>
      </div>

      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover/m:opacity-100 transition-opacity">
        <button
          onClick={onReplace}
          className="h-5 w-5 grid place-items-center rounded bg-background/90 border btn-quiet"
        >
          <Plus className="w-2.5 h-2.5" />
        </button>
        <button
          onClick={onRemove}
          className="h-5 w-5 grid place-items-center rounded bg-background/90 border btn-quiet"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}
