"use client";

import { useEffect, useRef, useState } from "react";
import { api, type WorkspaceSummary } from "@/lib/api";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import {
  CornerDownLeft,
  Trash2,
  Pencil,
  Download,
  Upload,
  Layers,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function WorkspaceList({
  onOpen,
  onChanged,
}: {
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<WorkspaceSummary[] | null>(null);
  const [name, setName] = useState("");
  // rename flow: pencil → input dialog → confirm dialog → save
  const [renaming, setRenaming] = useState<WorkspaceSummary | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [renameConfirming, setRenameConfirming] = useState(false);
  // export flow: download → confirm dialog → download
  const [exporting, setExporting] = useState<WorkspaceSummary | null>(null);
  const [deleting, setDeleting] = useState<WorkspaceSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    try {
      setItems(await api.listWorkspaces());
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      const ws = await api.createWorkspace(n);
      setName("");
      await load();
      onChanged();
      onOpen(ws.id);
    } catch {
      toast.error("could not create");
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await api.deleteWorkspace(deleting.id);
      setDeleting(null);
      await load();
      onChanged();
      toast.success("deleted");
    } catch {
      toast.error("could not delete");
    }
  };

  // rename: the input dialog "rename" button just moves to the confirm step.
  // the actual api call happens only after the user confirms.
  const doRename = async () => {
    if (!renaming) return;
    const n = renameVal.trim();
    if (!n || n === renaming.name) {
      setRenameConfirming(false);
      setRenaming(null);
      return;
    }
    try {
      await api.renameWorkspace(renaming.id, n);
      setRenameConfirming(false);
      setRenaming(null);
      await load();
      onChanged();
      toast.success("renamed");
    } catch {
      toast.error("could not rename");
    }
  };

  // export: only triggers the download after the user confirms.
  const doExport = () => {
    if (!exporting) return;
    window.location.href = api.exportUrl(exporting.id);
    setExporting(null);
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      await api.importWorkspace(file);
      await load();
      onChanged();
      toast.success("imported");
    } catch {
      toast.error("import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center px-5 py-16 sm:py-24">
      <div className="w-full max-w-xl">
        {/* creation */}
        <div className="flex items-center gap-2 border bg-background h-10 px-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
            placeholder="new workspace"
            className="flex-1 bg-transparent outline-none text-sm px-1"
            autoFocus
          />
          <button
            onClick={create}
            disabled={!name.trim()}
            className="h-7 px-3 text-xs bg-foreground text-background disabled:opacity-30 btn-quiet flex items-center gap-1.5"
          >
            <CornerDownLeft className="w-3 h-3" />
            create
          </button>
        </div>

        {/* list */}
        <div className="mt-8">
          {items === null ? (
            <div className="text-xs text-muted-foreground px-1">loading…</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-muted-foreground px-1 py-12 text-center">
              no workspaces yet
            </div>
          ) : (
            <ul className="divide-y border bg-background">
              {items.map((w) => (
                <li
                  key={w.id}
                  className="group flex items-center gap-2 px-2 h-11 btn-quiet"
                >
                  <button
                    onClick={() => onOpen(w.id)}
                    className="flex-1 flex items-center gap-2.5 min-w-0 text-left"
                  >
                    <Layers className="w-3.5 h-3.5 text-foreground/70 shrink-0" />
                    <span className="text-sm truncate">{w.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {w.fileCount} {w.fileCount === 1 ? "file" : "files"}
                    </span>
                  </button>
                  <div className="flex items-center gap-0.5 text-foreground/70">
                    <button
                      onClick={() => {
                        setRenaming(w);
                        setRenameVal(w.name);
                        setRenameConfirming(false);
                      }}
                      title="rename"
                      className="h-7 w-7 grid place-items-center btn-quiet hover:text-foreground hover:bg-accent"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setExporting(w)}
                      title="export"
                      className="h-7 w-7 grid place-items-center btn-quiet hover:text-foreground hover:bg-accent"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setDeleting(w)}
                      title="delete"
                      className="h-7 w-7 grid place-items-center btn-quiet hover:text-foreground hover:bg-accent"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* import */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="h-8 px-3 text-xs border btn-quiet flex items-center gap-1.5"
          >
            <Upload className="w-3 h-3" />
            {importing ? "importing…" : "import archive"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* rename input dialog → leads to a confirmation */}
      <Dialog
        open={!!renaming && !renameConfirming}
        onOpenChange={(o) => !o && setRenaming(null)}
      >
        <DialogContent className="max-w-sm rounded-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">rename workspace</DialogTitle>
          </DialogHeader>
          <input
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setRenameConfirming(true);
            }}
            autoFocus
            className="w-full h-9 px-2 text-sm bg-transparent border rounded-sm outline-none focus:cell-active"
          />
          <DialogFooter className="gap-2">
            <button
              onClick={() => setRenameConfirming(true)}
              disabled={!renameVal.trim() || renameVal.trim() === renaming?.name}
              className="h-7 px-3 text-xs bg-foreground text-background btn-quiet disabled:opacity-30"
            >
              rename
            </button>
            <button
              onClick={() => setRenaming(null)}
              className="h-7 px-3 text-xs border btn-quiet"
            >
              cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* rename confirmation */}
      <ConfirmDialog
        open={renameConfirming}
        onOpenChange={(o) => !o && setRenameConfirming(false)}
        title="rename workspace"
        description={
          renaming
            ? `rename "${renaming.name}" to "${renameVal.trim()}"? the name will be updated everywhere.`
            : ""
        }
        confirmLabel="rename"
        onConfirm={doRename}
      />

      {/* export (backup) confirmation */}
      <ConfirmDialog
        open={!!exporting}
        onOpenChange={(o) => !o && setExporting(null)}
        title="export workspace"
        description={
          exporting
            ? `export "${exporting.name}" as a zip archive? this downloads a backup of the workspace, its folders, files, nested grids, and attachments.`
            : ""
        }
        confirmLabel="export"
        onConfirm={doExport}
      />

      {/* delete dialog */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="delete workspace"
        description={
          deleting
            ? `this will permanently delete "${deleting.name}" and all of its folders, files, nested grids, cells, attachments, and media. this cannot be undone.`
            : ""
        }
        onConfirm={doDelete}
      />
    </div>
  );
}
