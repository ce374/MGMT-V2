"use client";

import { useEffect, useState } from "react";
import React from "react";
import { X, Download } from "lucide-react";
import { cn } from "@/lib/utils";

// full-screen overlay for previewing a file attachment (pdf / text)
export function FilePreview({
  url,
  filename,
  onClose,
}: {
  url: string;
  filename: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isPdf = filename.toLowerCase().endsWith(".pdf");
  const isText = /\.(txt|md|markdown)$/i.test(filename);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col">
      <div className="h-10 shrink-0 border-b flex items-center gap-2 px-2">
        <span className="text-xs truncate flex-1 keep-case">{filename}</span>
        <a
          href={url}
          download={filename}
          className="h-7 w-7 grid place-items-center rounded-md btn-quiet"
        >
          <Download className="w-3.5 h-3.5" />
        </a>
        <button
          onClick={onClose}
          className="h-7 w-7 grid place-items-center rounded-md btn-quiet"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {isPdf ? (
          <iframe src={url} className="w-full h-full border-0" title={filename} />
        ) : isText ? (
          <TextFileView url={url} />
        ) : (
          <div className="w-full h-full grid place-items-center text-xs text-muted-foreground">
            preview not available
          </div>
        )}
      </div>
    </div>
  );
}

function TextFileView({ url }: { url: string }) {
  const [content, setContent] = useState<string>("");
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch(url)
      .then((r) => r.text())
      .then(setContent)
      .catch(() => setErr(true));
  }, [url]);
  if (err)
    return (
      <div className="w-full h-full grid place-items-center text-xs text-muted-foreground">
        could not load
      </div>
    );
  return (
    <pre className="w-full h-full overflow-auto scroll-thin p-4 text-[11px] leading-relaxed whitespace-pre-wrap keep-case">
      {content}
    </pre>
  );
}

// markdown editor overlay with view / edit modes. commits on close.
export function MarkdownEditor({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (draft !== value) onChange(draft);
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [draft, value, onChange, onClose]);

  const close = () => {
    if (draft !== value) onChange(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col">
      <div className="h-10 shrink-0 border-b flex items-center gap-2 px-2">
        <div className="flex border rounded-md">
          <button
            onClick={() => setMode("view")}
            className={cn(
              "h-6 px-2 text-[10px] rounded-md btn-quiet",
              mode === "view" && "bg-foreground text-background"
            )}
          >
            view
          </button>
          <button
            onClick={() => setMode("edit")}
            className={cn(
              "h-6 px-2 text-[10px] rounded-md btn-quiet",
              mode === "edit" && "bg-foreground text-background"
            )}
          >
            edit
          </button>
        </div>
        <div className="flex-1" />
        <button
          onClick={close}
          className="h-7 w-7 grid place-items-center rounded-md btn-quiet"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto scroll-thin">
        {mode === "edit" ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full h-full bg-transparent outline-none p-4 text-[11px] leading-relaxed resize-none keep-case"
            autoFocus
          />
        ) : (
          <MarkdownContent source={draft} />
        )}
      </div>
    </div>
  );
}

function MarkdownContent({ source }: { source: string }) {
  const [node, setNode] = useState<React.ReactNode>(null);
  useEffect(() => {
    let active = true;
    import("react-markdown").then((mod) => {
      if (!active) return;
      const Cmp = mod.default;
      setNode(React.createElement(Cmp, null, source));
    });
    return () => {
      active = false;
    };
  }, [source]);
  return (
    <div className="markdown-body p-4 max-w-3xl text-[12px] leading-relaxed">
      {node ?? <span className="text-xs text-muted-foreground">loading…</span>}
    </div>
  );
}
