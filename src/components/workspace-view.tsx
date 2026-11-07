"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Folder, FileMeta, WorkspaceDetail } from "@/lib/grid-types";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Spreadsheet } from "@/components/spreadsheet/spreadsheet";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Folder as FolderIcon,
  File as FileIcon,
  ChevronRight,
  ChevronDown,
  Trash2,
  Pencil,
  X,
  Download,
  PanelLeft,
  GripVertical,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// a flat view of the workspace tree, preserving display order (folders then
// files at each level). used for rendering and drag-and-drop hit testing.
interface FlatNode {
  id: string;
  kind: "folder" | "file";
  name: string;
  depth: number;
  parent: string | null; // parentId (folder) / folderId (file)
}

type DropTarget =
  | { kind: "into"; folderId: string }
  | { kind: "before"; nodeId: string }
  | { kind: "after"; nodeId: string }
  | { kind: "root" }
  | null;

export function WorkspaceView({
  workspaceId,
  onBack,
}: {
  workspaceId: string;
  onBack: () => void;
}) {
  const [ws, setWs] = useState<WorkspaceDetail | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renamingWs, setRenamingWs] = useState(false);
  const [wsNameVal, setWsNameVal] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  const [folderNameVal, setFolderNameVal] = useState("");
  const [renamingFile, setRenamingFile] = useState<FileMeta | null>(null);
  const [fileNameVal, setFileNameVal] = useState("");
  const [creatingFolderParent, setCreatingFolderParent] = useState<
    string | "root" | null
  >(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFileParent, setCreatingFileParent] = useState<
    string | "root" | null
  >(null);
  const [newFileName, setNewFileName] = useState("");
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);
  const [deletingFile, setDeletingFile] = useState<FileMeta | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // ---- drag and drop state ----
  const dragRef = useRef<{
    node: FlatNode;
    pointerId: number;
    startX: number;
    startY: number;
    pointerType: string;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    active: boolean;
  } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<DropTarget>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; name: string; kind: string } | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const rootZoneRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const detail = await api.getWorkspace(workspaceId);
    setWs(detail);
    setActiveFileId((cur) => {
      if (cur && detail.files.some((f) => f.id === cur)) return cur;
      return null;
    });
    setExpanded((prev) => {
      const next = { ...prev };
      for (const f of detail.folders) {
        if (!(f.id in next)) next[f.id] = true;
      }
      return next;
    });
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const detail = await api.getWorkspace(workspaceId);
        if (!active) return;
        setWs(detail);
        setActiveFileId(null);
        setExpanded((prev) => {
          const next = { ...prev };
          for (const f of detail.folders) {
            if (!(f.id in next)) next[f.id] = true;
          }
          return next;
        });
      } catch {
        if (active) setWs(null as unknown as WorkspaceDetail);
      }
    })();
    return () => {
      active = false;
    };
  }, [workspaceId]);

  // ---- flat node list for rendering + dnd ----
  const flatNodes = useMemo<FlatNode[]>(() => {
    if (!ws) return [];
    const out: FlatNode[] = [];
    const visit = (parentId: string | null, depth: number) => {
      const childFolders = ws.folders.filter((f) => f.parentId === parentId);
      for (const f of childFolders) {
        out.push({ id: f.id, kind: "folder", name: f.name, depth, parent: parentId });
        if (expanded[f.id] ?? true) visit(f.id, depth + 1);
      }
      const childFiles = ws.files.filter((f) => f.folderId === parentId);
      for (const f of childFiles) {
        out.push({ id: f.id, kind: "file", name: f.name, depth, parent: parentId });
      }
    };
    visit(null, 0);
    return out;
  }, [ws, expanded]);

  // ids that a dragged folder must not be moved into (itself + descendants)
  const forbiddenParents = useMemo<Set<string>>(() => {
    if (!ws || !dragId) return new Set();
    const folder = ws.folders.find((f) => f.id === dragId);
    if (!folder) return new Set();
    const forbidden = new Set<string>([dragId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of ws.folders) {
        if (f.parentId && forbidden.has(f.parentId) && !forbidden.has(f.id)) {
          forbidden.add(f.id);
          changed = true;
        }
      }
    }
    return forbidden;
  }, [ws, dragId]);

  const doRenameWs = async () => {
    if (!ws) return;
    const n = wsNameVal.trim();
    if (!n) return;
    try {
      await api.renameWorkspace(ws.id, n);
      setRenamingWs(false);
      await load();
    } catch {
      toast.error("could not rename");
    }
  };

  const createFolder = async () => {
    if (!ws) return;
    const parentId =
      creatingFolderParent === "root" ? null : creatingFolderParent;
    const n = newFolderName.trim() || "folder";
    try {
      await api.createFolder(n, ws.id, parentId);
      setCreatingFolderParent(null);
      setNewFolderName("");
      await load();
    } catch {
      toast.error("could not create folder");
    }
  };

  const createFile = async () => {
    if (!ws) return;
    const folderId =
      creatingFileParent === "root" ? null : creatingFileParent;
    const n = newFileName.trim() || "untitled";
    try {
      const f = await api.createFile(n, ws.id, folderId);
      setCreatingFileParent(null);
      setNewFileName("");
      await load();
      setActiveFileId(f.id);
      setSidebarOpen(false);
    } catch {
      toast.error("could not create file");
    }
  };

  const doRenameFolder = async () => {
    if (!renamingFolder) return;
    const n = folderNameVal.trim();
    if (!n) return;
    try {
      await api.renameFolder(renamingFolder.id, n);
      setRenamingFolder(null);
      await load();
    } catch {
      toast.error("could not rename");
    }
  };

  const doRenameFile = async () => {
    if (!renamingFile) return;
    const n = fileNameVal.trim();
    if (!n) return;
    try {
      await api.renameFile(renamingFile.id, n);
      setRenamingFile(null);
      await load();
    } catch {
      toast.error("could not rename");
    }
  };

  const doDeleteFolder = async () => {
    if (!deletingFolder) return;
    try {
      await api.deleteFolder(deletingFolder.id);
      setDeletingFolder(null);
      await load();
    } catch {
      toast.error("could not delete");
    }
  };

  const doDeleteFile = async () => {
    if (!deletingFile) return;
    try {
      await api.deleteFile(deletingFile.id);
      if (activeFileId === deletingFile.id) setActiveFileId(null);
      setDeletingFile(null);
      await load();
    } catch {
      toast.error("could not delete");
    }
  };

  // ---- drag and drop logic ----
  // the gesture handlers are attached to `window` for the lifetime of a drag,
  // so they must always read the latest state. we mirror the values they need
  // into refs (synced after every commit) and keep the handlers stable.
  const overRef = useRef<DropTarget>(null);
  const dragIdRef = useRef<string | null>(null);
  const flatRef = useRef<FlatNode[]>(flatNodes);
  const wsRef = useRef<WorkspaceDetail | null>(ws);
  const forbiddenRef = useRef<Set<string>>(forbiddenParents);
  useEffect(() => {
    overRef.current = over;
    dragIdRef.current = dragId;
    flatRef.current = flatNodes;
    wsRef.current = ws;
    forbiddenRef.current = forbiddenParents;
  });

  const suppressNextClick = () => {
    const handler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("click", handler, { capture: true, once: true });
    setTimeout(
      () =>
        window.removeEventListener("click", handler, {
          capture: true,
        } as EventListenerOptions),
      50
    );
  };

  const beginDrag = (node: FlatNode) => {
    const d = dragRef.current;
    if (!d) return;
    d.active = true;
    setDragId(node.id);
    setGhost({ x: d.startX, y: d.startY, name: node.name, kind: node.kind });
    document.body.classList.add("no-select");
    suppressNextClick();
  };

  const computeDrop = (clientX: number, clientY: number): DropTarget => {
    const d = dragRef.current;
    if (!d) return null;
    const flat = flatRef.current;
    const forbidden = forbiddenRef.current;
    const els = document.elementsFromPoint(clientX, clientY);
    const row = els
      .map((e) => (e as HTMLElement).closest?.("[data-row]"))
      .find(Boolean) as HTMLElement | null;
    if (row) {
      const nodeId = row.dataset.nodeId!;
      const nodeKind = row.dataset.nodeKind as "folder" | "file";
      const node = flat.find((n) => n.id === nodeId);
      if (!node) return null;
      const rect = row.getBoundingClientRect();
      const relY = clientY - rect.top;
      const h = rect.height;
      const draggingFolder = d.node.kind === "folder";
      if (nodeKind === "folder") {
        const intoForbidden = draggingFolder && forbidden.has(nodeId);
        // wide middle band = drop into folder; edges = reorder as sibling
        const topBand = h * 0.28;
        const bottomBand = h * 0.72;
        if (relY > topBand && relY < bottomBand && !intoForbidden) {
          return { kind: "into", folderId: nodeId };
        }
        // edge bands: insert before/after as a sibling of this folder.
        // forbidden if the sibling's parent is a descendant of the dragged folder.
        const parentForbidden =
          draggingFolder && node.parent !== null && forbidden.has(node.parent);
        if (parentForbidden) return null;
        return relY <= topBand
          ? { kind: "before", nodeId }
          : { kind: "after", nodeId };
      } else {
        // file row: top half = before, bottom half = after
        const parentForbidden =
          draggingFolder && node.parent !== null && forbidden.has(node.parent);
        if (parentForbidden) return null;
        return relY <= h / 2
          ? { kind: "before", nodeId }
          : { kind: "after", nodeId };
      }
    }
    // over the root zone (empty area of the sidebar) → move to root
    const rootEl = els.find(
      (e) => e === rootZoneRef.current || (e as HTMLElement).closest?.("[data-rootzone]")
    );
    if (rootEl) return { kind: "root" };
    return null;
  };

  const performDrop = async (draggedId: string, target: DropTarget) => {
    const curWs = wsRef.current;
    const flat = flatRef.current;
    if (!curWs) return;
    const isFolder = curWs.folders.some((f) => f.id === draggedId);
    try {
      if (target.kind === "root") {
        if (isFolder) await api.moveFolder(draggedId, null);
        else await api.moveFile(draggedId, null);
      } else if (target.kind === "into") {
        if (isFolder) await api.moveFolder(draggedId, target.folderId);
        else await api.moveFile(draggedId, target.folderId);
      } else {
        // before/after a node → reorder as a sibling in that node's parent
        const node = flat.find((n) => n.id === target.nodeId);
        if (!node) return;
        const parent = node.parent;
        // siblings of the same kind under `parent`, excluding the dragged item
        const siblings = isFolder
          ? curWs.folders.filter((f) => f.parentId === parent && f.id !== draggedId)
          : curWs.files.filter((f) => f.folderId === parent && f.id !== draggedId);
        let idx: number;
        if (node.kind === (isFolder ? "folder" : "file")) {
          const pos = siblings.findIndex((s) => s.id === node.id);
          idx = target.kind === "before" ? pos : pos + 1;
          if (idx < 0) idx = siblings.length;
        } else {
          // cross-kind: move to parent, land at the end of its own group
          idx = siblings.length;
        }
        if (isFolder) await api.moveFolder(draggedId, parent, idx);
        else await api.moveFile(draggedId, parent, idx);
      }
      await load();
    } catch {
      toast.error("could not move");
    }
  };

  const endDrag = async () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.longPressTimer) clearTimeout(d.longPressTimer);
    document.body.classList.remove("no-select");
    const target = overRef.current;
    const draggedId = dragIdRef.current;
    setDragId(null);
    setGhost(null);
    setOver(null);
    if (!d?.active || !target || !draggedId) return;
    await performDrop(draggedId, target);
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.hypot(dx, dy) <= 6) return;
      if (d.pointerType === "touch") {
        // moved before the long-press fired → treat as a scroll, abandon drag
        if (d.longPressTimer) clearTimeout(d.longPressTimer);
        d.longPressTimer = null;
        cleanupListeners();
        dragRef.current = null;
        return;
      }
      beginDrag(d.node);
    }
    if (dragRef.current?.active) {
      setGhost({ x: e.clientX, y: e.clientY, name: d.node.name, kind: d.node.kind });
      setOver(computeDrop(e.clientX, e.clientY));
      // auto-scroll the sidebar when dragging near its edges
      const area = scrollAreaRef.current;
      if (area) {
        const r = area.getBoundingClientRect();
        const margin = 40;
        if (e.clientY < r.top + margin) area.scrollTop -= 8;
        else if (e.clientY > r.bottom - margin) area.scrollTop += 8;
      }
    }
  };

  const onPointerUp = () => {
    cleanupListeners();
    void endDrag();
  };

  const cleanupListeners = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  };

  const onRowPointerDown = (node: FlatNode) => (e: React.PointerEvent) => {
    // don't initiate a drag from interactive controls (chevron, action buttons)
    if ((e.target as HTMLElement).closest("[data-nodrag]")) return;
    if (e.button !== undefined && e.button !== 0) return;
    const longPress = e.pointerType === "touch";
    const timer = longPress ? setTimeout(() => beginDrag(node), 220) : null;
    dragRef.current = {
      node,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      pointerType: e.pointerType,
      longPressTimer: timer,
      active: false,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  useEffect(() => {
    return () => cleanupListeners();
  }, []);

  if (!ws) {
    return (
      <div className="flex-1 grid place-items-center text-xs text-muted-foreground">
        loading…
      </div>
    );
  }

  const activeFile = ws.files.find((f) => f.id === activeFileId) ?? null;

  const toggleExpand = (id: string) =>
    setExpanded((p) => ({ ...p, [id]: !(p[id] ?? true) }));

  // ---- a single row in the flat tree ----
  const renderRow = (node: FlatNode) => {
    const isFolder = node.kind === "folder";
    const isFile = node.kind === "file";
    const isOpen = expanded[node.id] ?? true;
    const childFolders = ws.folders.filter((f) => f.parentId === node.id);
    const childFiles = ws.files.filter((f) => f.folderId === node.id);
    const hasChildren = isFolder && (childFolders.length > 0 || childFiles.length > 0);
    const isDragging = dragId === node.id;
    const intoTarget = over?.kind === "into" && over.folderId === node.id;
    const beforeTarget = over?.kind === "before" && over.nodeId === node.id;
    const afterTarget = over?.kind === "after" && over.nodeId === node.id;

    return (
      <div key={node.id} className="relative">
        {/* insertion line — before */}
        {beforeTarget && (
          <div className="absolute top-0 left-2 right-2 h-px bg-foreground z-10" />
        )}
        <div
          data-row
          data-node-id={node.id}
          data-node-kind={node.kind}
          className={rowClass(
            "group flex items-center gap-1 h-8 pr-1 relative btn-quiet",
            isDragging && "opacity-40",
            intoTarget && "bg-accent",
            intoTarget && "shadow-[inset_0_0_0_1px_var(--foreground)]"
          )}
        >
          {/* drag handle — left edge. press-and-drag to reorder or move. */}
          <div
            onPointerDown={onRowPointerDown(node)}
            className="shrink-0 w-5 h-8 grid place-items-center cursor-grab text-muted-foreground/50 hover:text-foreground active:cursor-grabbing touch-none"
          >
            <GripVertical className="w-3 h-3" />
          </div>
          {/* indentation by depth */}
          <div className="shrink-0" style={{ width: node.depth * 12 }} />
          {isFolder ? (
            <button
              data-nodrag
              onClick={() => toggleExpand(node.id)}
              className="h-6 w-5 grid place-items-center shrink-0"
            >
              {hasChildren ? (
                isOpen ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )
              ) : null}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          {isFolder ? (
            <FolderIcon
              className={`w-3 h-3 shrink-0 ${intoTarget ? "text-foreground" : "text-muted-foreground"}`}
            />
          ) : (
            <FileIcon
              className={`w-3 h-3 shrink-0 ${
                activeFileId === node.id ? "text-foreground" : "text-muted-foreground"
              }`}
            />
          )}
          <button
            onClick={() => {
              if (isFile) {
                setActiveFileId(node.id);
                setSidebarOpen(false);
              } else {
                toggleExpand(node.id);
              }
            }}
            className={`text-xs truncate flex-1 text-left min-w-0 ${
              isFile && activeFileId === node.id ? "font-medium" : ""
            }`}
          >
            {node.name}
          </button>
          <div
            data-nodrag
            className="flex items-center gap-0.5 text-muted-foreground"
          >
            {isFolder && (
              <button
                onClick={() => {
                  setCreatingFolderParent(node.id);
                  setNewFolderName("");
                }}
                className="h-6 w-6 grid place-items-center btn-quiet rounded hover:text-foreground"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={() => {
                if (isFolder) {
                  setRenamingFolder(ws.folders.find((f) => f.id === node.id)!);
                  setFolderNameVal(node.name);
                } else {
                  setRenamingFile(ws.files.find((f) => f.id === node.id)!);
                  setFileNameVal(node.name);
                }
              }}
              className="h-6 w-6 grid place-items-center btn-quiet rounded hover:text-foreground"
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={() => {
                if (isFolder) setDeletingFolder(ws.folders.find((f) => f.id === node.id)!);
                else setDeletingFile(ws.files.find((f) => f.id === node.id)!);
              }}
              className="h-6 w-6 grid place-items-center btn-quiet rounded hover:text-foreground"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
        {/* insertion line — after */}
        {afterTarget && (
          <div className="absolute bottom-0 left-2 right-2 h-px bg-foreground z-10" />
        )}
      </div>
    );
  };

  const sidebarBody = (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-9 shrink-0 border-b flex items-center justify-between px-2">
        <span className="text-[10px] text-muted-foreground">contents</span>
        <div data-nodrag className="flex items-center gap-0.5">
          <button
            onClick={() => {
              setCreatingFolderParent("root");
              setNewFolderName("");
            }}
            className="h-6 w-6 grid place-items-center rounded btn-quiet"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            onClick={() => {
              setCreatingFileParent("root");
              setNewFileName("");
            }}
            className="h-6 w-6 grid place-items-center rounded btn-quiet"
          >
            <FileIcon className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto scroll-thin py-1"
      >
        {flatNodes.length === 0 ? (
          <div className="text-[10px] text-muted-foreground px-2 py-4 text-center">
            empty
          </div>
        ) : (
          <div data-rootzone ref={rootZoneRef} className="min-h-full">
            {flatNodes.map(renderRow)}
            {/* trailing root drop zone — move to root */}
            <div
              className={`h-6 ${over?.kind === "root" ? "bg-accent" : ""}`}
            />
          </div>
        )}
      </div>
      {/* drag ghost */}
      {ghost && (
        <div
          className="fixed z-50 pointer-events-none bg-background border rounded-md px-2 py-1 text-[11px] shadow-sm flex items-center gap-1.5 max-w-[60vw]"
          style={{ left: ghost.x + 12, top: ghost.y + 12 }}
        >
          {ghost.kind === "folder" ? (
            <FolderIcon className="w-3 h-3 shrink-0" />
          ) : (
            <FileIcon className="w-3 h-3 shrink-0" />
          )}
          <span className="truncate">{ghost.name}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* top bar */}
      <header className="h-10 shrink-0 border-b flex items-center gap-1 px-2">
        <button
          onClick={onBack}
          className="h-7 w-7 grid place-items-center rounded-md btn-quiet shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            setRenamingWs(true);
            setWsNameVal(ws.name);
          }}
          className="h-7 px-2 text-xs rounded-md btn-quiet truncate max-w-[35vw]"
        >
          {ws.name}
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <span className="text-xs text-muted-foreground truncate">
          {activeFile ? activeFile.name : "—"}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="h-7 w-7 grid place-items-center rounded-md btn-quiet shrink-0 lg:hidden"
        >
          <PanelLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            window.location.href = api.exportUrl(ws.id);
          }}
          className="h-7 w-7 grid place-items-center rounded-md btn-quiet shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* sidebar — desktop */}
        <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r">
          {sidebarBody}
        </aside>

        {/* sidebar — mobile drawer */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div
              className="absolute inset-0 bg-background/60"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="relative w-72 max-w-[80vw] bg-background border-r flex flex-col">
              <div className="h-9 shrink-0 border-b flex items-center justify-between px-2">
                <span className="text-[10px] text-muted-foreground">
                  contents
                </span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="h-7 w-7 grid place-items-center rounded-md btn-quiet"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {sidebarBody}
            </aside>
          </div>
        )}

        {/* spreadsheet */}
        <main className="flex-1 min-w-0 min-h-0 relative">
          {activeFile ? (
            <Spreadsheet key={activeFile.id} fileId={activeFile.id} />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
              {ws.files.length === 0 && ws.folders.length === 0
                ? "create a file to begin"
                : "no file selected"}
            </div>
          )}
        </main>
      </div>

      {/* dialogs */}
      <Dialog open={renamingWs} onOpenChange={(o) => !o && setRenamingWs(false)}>
        <DialogContent className="max-w-sm rounded-md">
          <DialogHeader>
            <DialogTitle className="text-sm">rename workspace</DialogTitle>
          </DialogHeader>
          <input
            value={wsNameVal}
            onChange={(e) => setWsNameVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doRenameWs()}
            autoFocus
            className="w-full h-9 px-2 text-sm bg-transparent border rounded-md outline-none"
          />
          <DialogFooter className="gap-2">
            <button
              onClick={() => setRenamingWs(false)}
              className="h-7 px-3 text-xs rounded-md border btn-quiet"
            >
              cancel
            </button>
            <button
              onClick={doRenameWs}
              className="h-7 px-3 text-xs rounded-md bg-foreground text-background btn-quiet"
            >
              save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renamingFolder}
        onOpenChange={(o) => !o && setRenamingFolder(null)}
      >
        <DialogContent className="max-w-sm rounded-md">
          <DialogHeader>
            <DialogTitle className="text-sm">rename folder</DialogTitle>
          </DialogHeader>
          <input
            value={folderNameVal}
            onChange={(e) => setFolderNameVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doRenameFolder()}
            autoFocus
            className="w-full h-9 px-2 text-sm bg-transparent border rounded-md outline-none"
          />
          <DialogFooter className="gap-2">
            <button
              onClick={() => setRenamingFolder(null)}
              className="h-7 px-3 text-xs rounded-md border btn-quiet"
            >
              cancel
            </button>
            <button
              onClick={doRenameFolder}
              className="h-7 px-3 text-xs rounded-md bg-foreground text-background btn-quiet"
            >
              save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renamingFile}
        onOpenChange={(o) => !o && setRenamingFile(null)}
      >
        <DialogContent className="max-w-sm rounded-md">
          <DialogHeader>
            <DialogTitle className="text-sm">rename file</DialogTitle>
          </DialogHeader>
          <input
            value={fileNameVal}
            onChange={(e) => setFileNameVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doRenameFile()}
            autoFocus
            className="w-full h-9 px-2 text-sm bg-transparent border rounded-md outline-none"
          />
          <DialogFooter className="gap-2">
            <button
              onClick={() => setRenamingFile(null)}
              className="h-7 px-3 text-xs rounded-md border btn-quiet"
            >
              cancel
            </button>
            <button
              onClick={doRenameFile}
              className="h-7 px-3 text-xs rounded-md bg-foreground text-background btn-quiet"
            >
              save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={creatingFolderParent !== null}
        onOpenChange={(o) => !o && setCreatingFolderParent(null)}
      >
        <DialogContent className="max-w-sm rounded-md">
          <DialogHeader>
            <DialogTitle className="text-sm">new folder</DialogTitle>
          </DialogHeader>
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createFolder()}
            autoFocus
            placeholder="folder"
            className="w-full h-9 px-2 text-sm bg-transparent border rounded-md outline-none"
          />
          <DialogFooter className="gap-2">
            <button
              onClick={() => setCreatingFolderParent(null)}
              className="h-7 px-3 text-xs rounded-md border btn-quiet"
            >
              cancel
            </button>
            <button
              onClick={createFolder}
              className="h-7 px-3 text-xs rounded-md bg-foreground text-background btn-quiet"
            >
              create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={creatingFileParent !== null}
        onOpenChange={(o) => !o && setCreatingFileParent(null)}
      >
        <DialogContent className="max-w-sm rounded-md">
          <DialogHeader>
            <DialogTitle className="text-sm">new file</DialogTitle>
          </DialogHeader>
          <input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createFile()}
            autoFocus
            placeholder="untitled"
            className="w-full h-9 px-2 text-sm bg-transparent border rounded-md outline-none"
          />
          <DialogFooter className="gap-2">
            <button
              onClick={() => setCreatingFileParent(null)}
              className="h-7 px-3 text-xs rounded-md border btn-quiet"
            >
              cancel
            </button>
            <button
              onClick={createFile}
              className="h-7 px-3 text-xs rounded-md bg-foreground text-background btn-quiet"
            >
              create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deletingFolder}
        onOpenChange={(o) => !o && setDeletingFolder(null)}
        title="delete folder"
        description={
          deletingFolder
            ? `this will permanently delete "${deletingFolder.name}" and all folders, files, nested grids, cells, and attachments inside it. this cannot be undone.`
            : ""
        }
        onConfirm={doDeleteFolder}
      />

      <ConfirmDialog
        open={!!deletingFile}
        onOpenChange={(o) => !o && setDeletingFile(null)}
        title="delete file"
        description={
          deletingFile
            ? `this will permanently delete "${deletingFile.name}" and all of its rows, columns, cells, nested grids, and attachments. this cannot be undone.`
            : ""
        }
        onConfirm={doDeleteFile}
      />
    </div>
  );
}

// tiny className joiner (avoids pulling cn into this file's hot path)
function rowClass(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
