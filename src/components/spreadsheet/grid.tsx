"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type CellDef,
  type CellType,
  type ColumnDef,
  type GridData,
  type RowDef,
  CELL_TYPES,
  CELL_TYPE_LABELS,
  MAX_NEST_DEPTH,
  makeCell,
  makeColumn,
  makeRow,
} from "@/lib/grid-types";
import { AudioCell } from "./audio-cell";
import { FilePreview, MarkdownEditor } from "./previews";
import { NestedSurface } from "./nested-surface";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronRight,
  ChevronDown,
  Image as ImageIcon,
  Music,
  FileText,
  Link2,
  Hash,
  Calendar,
  Type,
  AlignLeft,
  Maximize,
  X,
} from "lucide-react";

// default viewport size for a nested spreadsheet, in pixels. large enough to
// read several rows/columns at once.
const DEFAULT_NESTED_W = 480;
const DEFAULT_NESTED_H = 340;
const MIN_NESTED_W = 280;
const MIN_NESTED_H = 180;

// the type icon shown in the column header
function typeIcon(t: CellType) {
  const c = "w-3 h-3 text-muted-foreground";
  switch (t) {
    case "number":
      return <Hash className={c} />;
    case "date":
      return <Calendar className={c} />;
    case "link":
      return <Link2 className={c} />;
    case "image":
      return <ImageIcon className={c} />;
    case "audio":
      return <Music className={c} />;
    case "file":
      return <FileText className={c} />;
    case "longtext":
      return <AlignLeft className={c} />;
    case "markdown":
      return <FileText className={c} />;
    default:
      return <Type className={c} />;
  }
}

interface GridProps {
  data: GridData;
  onChange: (next: GridData) => void;
  // depth of nesting (0 = top). affects styling only.
  depth?: number;
}

export function Grid({ data, onChange, depth = 0 }: GridProps) {
  const { columns, rows } = data;

  // ---- column operations ----
  const updateColumn = (id: string, patch: Partial<ColumnDef>) =>
    onChange({
      ...data,
      columns: columns.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });

  const addColumn = () => {
    const idx = columns.length;
    const col = makeColumn(`field ${idx + 1}`, "text", 180);
    onChange({
      ...data,
      columns: [...columns, col],
      rows: rows.map((r) => ({ ...r, cells: [...r.cells, makeCell()] })),
    });
  };

  const removeColumn = (id: string) => {
    const i = columns.findIndex((c) => c.id === id);
    if (i < 0) return;
    onChange({
      ...data,
      columns: columns.filter((c) => c.id !== id),
      rows: rows.map((r) => ({
        ...r,
        cells: r.cells.filter((_, ci) => ci !== i),
      })),
    });
  };

  const reorderColumn = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const cols = [...columns];
    const [moved] = cols.splice(from, 1);
    cols.splice(to, 0, moved);
    const newRows = rows.map((r) => {
      const cells = [...r.cells];
      const [mc] = cells.splice(from, 1);
      cells.splice(to, 0, mc);
      return { ...r, cells };
    });
    onChange({ ...data, columns: cols, rows: newRows });
  };

  // ---- row operations ----
  const updateRow = (id: string, patch: Partial<RowDef>) =>
    onChange({
      ...data,
      rows: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });

  const addRow = () => {
    const row = makeRow(columns.length, 40);
    onChange({ ...data, rows: [...rows, row] });
  };

  const removeRow = (id: string) =>
    onChange({ ...data, rows: rows.filter((r) => r.id !== id) });

  const reorderRow = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const r = [...rows];
    const [moved] = r.splice(from, 1);
    r.splice(to, 0, moved);
    onChange({ ...data, rows: r });
  };

  // ---- cell operations ----
  const updateCell = (rowId: string, colId: string, patch: Partial<CellDef>) => {
    onChange({
      ...data,
      rows: rows.map((r) =>
        r.id === rowId
          ? {
              ...r,
              cells: r.cells.map((c, ci) => {
                if (columns[ci]?.id !== colId) return c;
                return { ...c, ...patch };
              }),
            }
          : r
      ),
    });
  };

  const setCellValue = (rowId: string, colId: string, value: string | null) =>
    updateCell(rowId, colId, { value });

  const setCellNested = (rowId: string, colId: string, nestedGrid: GridData | null) =>
    updateCell(rowId, colId, { nestedGrid });

  // total width for the sizing wrapper
  const rowHandleWidth = 34;
  const addColBtnWidth = 28;
  const totalWidth =
    rowHandleWidth +
    columns.reduce((s, c) => s + c.width, 0) +
    addColBtnWidth;

  return (
    <div className="inline-block min-w-full" style={{ width: totalWidth }}>
      <div className="flex items-stretch border-b">
        {/* corner */}
        <div
          className="shrink-0 border-r bg-muted/40 grid place-items-center"
          style={{ width: rowHandleWidth }}
        >
          <span className="text-[9px] text-muted-foreground">{rows.length}</span>
        </div>
        {/* column headers */}
        {columns.map((col, i) => (
          <ColumnHeader
            key={col.id}
            col={col}
            index={i}
            onRename={(name) => updateColumn(col.id, { name })}
            onType={(type) => updateColumn(col.id, { type })}
            onWidth={(width) => updateColumn(col.id, { width })}
            onRemove={() => removeColumn(col.id)}
            onReorder={reorderColumn}
          />
        ))}
        {/* add column */}
        <div className="shrink-0 flex" style={{ width: addColBtnWidth }}>
          <button
            onClick={addColumn}
            className="w-full grid place-items-center btn-quiet text-muted-foreground"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* rows */}
      <div>
        {rows.map((row, ri) => (
          <RowView
            key={row.id}
            row={row}
            index={ri}
            columns={columns}
            depth={depth}
            rowHandleWidth={rowHandleWidth}
            onHeight={(height) => updateRow(row.id, { height })}
            onRemove={() => removeRow(row.id)}
            onReorder={reorderRow}
            onCellValue={(colId, value) => setCellValue(row.id, colId, value)}
            onCellAttachment={(colId, attachmentId, filename) =>
              updateCell(row.id, colId, {
                attachmentId,
                value: filename ?? null,
              })
            }
            onCellClearAttachment={(colId) =>
              updateCell(row.id, colId, { attachmentId: null, value: null })
            }
            onCellNested={(colId, nestedGrid) =>
              setCellNested(row.id, colId, nestedGrid)
            }
            onCellNestedView={(colId, nestedView) =>
              updateCell(row.id, colId, { nestedView })
            }
          />
        ))}
        {rows.length === 0 && (
          <div className="h-16 grid place-items-center text-[10px] text-muted-foreground">
            empty
          </div>
        )}
      </div>

      {/* add row */}
      <button
        onClick={addRow}
        className="h-8 w-full flex items-center gap-1.5 px-2 text-[10px] text-muted-foreground btn-quiet border-b"
      >
        <Plus className="w-3 h-3" />
        add row
      </button>
    </div>
  );
}

// ---- column header ----
function ColumnHeader({
  col,
  index,
  onRename,
  onType,
  onWidth,
  onRemove,
  onReorder,
}: {
  col: ColumnDef;
  index: number;
  onRename: (name: string) => void;
  onType: (type: CellType) => void;
  onWidth: (width: number) => void;
  onRemove: () => void;
  onReorder: (from: number, to: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(col.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    const startX = e.clientX;
    const startWidth = col.width;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      onWidth(Math.max(60, startWidth + dx));
    };
    const up = () => {
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      draggable={!editing && !resizing}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/col", String(index));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/col")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const from = Number(e.dataTransfer.getData("text/col"));
        if (!Number.isNaN(from)) onReorder(from, index);
      }}
      className={cn(
        "relative shrink-0 border-r bg-muted/30 flex items-center group select-none",
        dragOver && "bg-accent"
      )}
      style={{ width: col.width }}
    >
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="h-7 px-1.5 flex items-center gap-1 btn-quiet shrink-0"
      >
        {typeIcon(col.type)}
      </button>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
              onRename(val.trim() || "field");
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename(val.trim() || "field");
                setEditing(false);
              }
              if (e.key === "Escape") {
                setVal(col.name);
                setEditing(false);
              }
            }}
            autoFocus
            className="w-full h-7 bg-transparent outline-none text-[11px] px-0.5"
          />
        ) : (
          <button
            onDoubleClick={() => {
              setVal(col.name);
              setEditing(true);
            }}
            className="w-full h-7 text-left text-[11px] px-0.5 truncate"
            title={col.name}
          >
            {col.name}
          </button>
        )}
      </div>

      {/* type + actions menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute top-7 left-0 z-30 w-36 bg-popover border rounded-md shadow-sm py-1"
        >
          <div className="px-2 py-1 text-[9px] text-muted-foreground">type</div>
          {CELL_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => {
                onType(t);
                setMenuOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 text-[11px] btn-quiet text-left",
                col.type === t && "font-medium"
              )}
            >
              {typeIcon(t)}
              {CELL_TYPE_LABELS[t]}
            </button>
          ))}
          <div className="h-px bg-border my-1" />
          <button
            onClick={() => {
              setMenuOpen(false);
              setConfirming(true);
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] btn-quiet text-left"
          >
            <Trash2 className="w-3 h-3" />
            delete column
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={(o) => !o && setConfirming(false)}
        title={`delete column "${col.name}"`}
        description={`this will permanently delete the column "${col.name}" and every cell (including any nested spreadsheets and attachments) in it. this cannot be undone.`}
        onConfirm={() => {
          setConfirming(false);
          onRemove();
        }}
      />

      {/* resize handle */}
      <div
        onPointerDown={startResize}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-foreground/20"
      />
    </div>
  );
}

// ---- row ----
function RowView({
  row,
  index,
  columns,
  depth,
  rowHandleWidth,
  onHeight,
  onRemove,
  onReorder,
  onCellValue,
  onCellAttachment,
  onCellClearAttachment,
  onCellNested,
  onCellNestedView,
}: {
  row: RowDef;
  index: number;
  columns: ColumnDef[];
  depth: number;
  rowHandleWidth: number;
  onHeight: (h: number) => void;
  onRemove: () => void;
  onReorder: (from: number, to: number) => void;
  onCellValue: (colId: string, value: string | null) => void;
  onCellAttachment: (
    colId: string,
    attachmentId: string | null,
    filename: string | null
  ) => void;
  onCellClearAttachment: (colId: string) => void;
  onCellNested: (colId: string, nestedGrid: GridData | null) => void;
  onCellNestedView: (colId: string, nestedView: { w: number; h: number } | null) => void;
}) {
  const [resizing, setResizing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    const startY = e.clientY;
    const startH = row.height;
    const move = (ev: PointerEvent) =>
      onHeight(Math.max(28, startH + (ev.clientY - startY)));
    const up = () => {
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // a row may grow taller than its declared height if its cells contain
  // nested grids or media. we use min-height so content drives the height.
  return (
    <div
      draggable={!resizing}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/row", String(index));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/row")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const from = Number(e.dataTransfer.getData("text/row"));
        if (!Number.isNaN(from)) onReorder(from, index);
      }}
      className={cn(
        "flex items-stretch border-b relative group",
        dragOver && "bg-accent/60"
      )}
    >
      {/* row handle */}
      <div
        className="shrink-0 border-r bg-muted/30 flex flex-col items-center justify-center relative"
        style={{ width: rowHandleWidth, minHeight: row.height }}
      >
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="h-5 w-5 grid place-items-center text-muted-foreground btn-quiet rounded"
        >
          <GripVertical className="w-3 h-3" />
        </button>
        {menuOpen && (
          <div
            ref={menuRef}
            className="absolute top-5 left-0 z-30 w-28 bg-popover border rounded-md shadow-sm py-1"
          >
            <button
              onClick={() => {
                setMenuOpen(false);
                setConfirming(true);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] btn-quiet text-left"
            >
              <Trash2 className="w-3 h-3" />
              delete row
            </button>
          </div>
        )}
      </div>

      {/* cells */}
      {columns.map((col, ci) => {
        const cell = row.cells[ci];
        return (
          <CellView
            key={cell?.id ?? ci}
            cell={cell}
            col={col}
            depth={depth}
            onValue={(v) => onCellValue(col.id, v)}
            onAttachment={(aid, fn) => onCellAttachment(col.id, aid, fn)}
            onClearAttachment={() => onCellClearAttachment(col.id)}
            onNested={(ng) => onCellNested(col.id, ng)}
            onNestedView={(nv) => onCellNestedView(col.id, nv)}
          />
        );
      })}
      <div className="flex-1 border-l-0" />

      {/* row resize handle */}
      <div
        onPointerDown={startResize}
        className="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-foreground/20"
      />

      <ConfirmDialog
        open={confirming}
        onOpenChange={(o) => !o && setConfirming(false)}
        title={`delete row ${index + 1}`}
        description={`this will permanently delete row ${index + 1} and every cell in it, including any nested spreadsheets and attachments. this cannot be undone.`}
        onConfirm={() => {
          setConfirming(false);
          onRemove();
        }}
      />
    </div>
  );
}

// ---- cell ----
function CellView({
  cell,
  col,
  depth,
  onValue,
  onAttachment,
  onClearAttachment,
  onNested,
  onNestedView,
}: {
  cell: CellDef | undefined;
  col: ColumnDef;
  depth: number;
  onValue: (v: string | null) => void;
  onAttachment: (attachmentId: string | null, filename: string | null) => void;
  onClearAttachment: () => void;
  onNested: (nestedGrid: GridData | null) => void;
  onNestedView: (nestedView: { w: number; h: number } | null) => void;
}) {
  // ensure a cell always exists even if row.cells is short
  const c: CellDef = cell ?? makeCell();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(c.value ?? "");
  const [nestedExpanded, setNestedExpanded] = useState<boolean>(
    !!c.nestedGrid
  );
  const [fullscreen, setFullscreen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // a cell may host a nested spreadsheet only up to the max nesting depth.
  // at the deepest level the toggle is hidden so a fourth level can't be made.
  const allowNesting = depth < MAX_NEST_DEPTH;

  const enterEdit = () => {
    setVal(c.value ?? "");
    setEditing(true);
  };

  const hasNested = !!c.nestedGrid;

  const handleUpload = async (file: File) => {
    try {
      const att = await api.uploadAttachment(file);
      onAttachment(att.id, att.filename);
      toast.success("added");
    } catch {
      toast.error("upload failed");
    }
  };

  const toggleNested = () => {
    if (!c.nestedGrid) {
      // create an empty nested grid with one column + one row
      const ng: GridData = {
        columns: [makeColumn("field 1", "text", 160)],
        rows: [makeRow(1, 36)],
      };
      onNested(ng);
      setNestedExpanded(true);
    } else {
      setNestedExpanded((e) => !e);
    }
  };

  const renderContent = () => {
    switch (col.type) {
      case "image":
        return c.attachmentId ? (
          <ImageCell
            attachmentId={c.attachmentId}
            filename={c.value ?? ""}
            onReplace={() => fileRef.current?.click()}
            onRemove={() => onClearAttachment()}
          />
        ) : (
          <EmptyMedia
            icon={<ImageIcon className="w-3 h-3" />}
            onClick={() => fileRef.current?.click()}
          />
        );
      case "audio":
        return c.attachmentId ? (
          <AudioCell
            attachmentId={c.attachmentId}
            filename={c.value ?? ""}
            onReplace={() => fileRef.current?.click()}
            onRemove={() => onClearAttachment()}
          />
        ) : (
          <EmptyMedia
            icon={<Music className="w-3 h-3" />}
            onClick={() => fileRef.current?.click()}
          />
        );
      case "file":
        return c.attachmentId ? (
          <FileCell
            attachmentId={c.attachmentId}
            filename={c.value ?? ""}
            onReplace={() => fileRef.current?.click()}
            onRemove={() => onClearAttachment()}
          />
        ) : (
          <EmptyMedia
            icon={<FileText className="w-3 h-3" />}
            onClick={() => fileRef.current?.click()}
          />
        );
      case "markdown":
        return (
          <MarkdownCell
            value={c.value}
            onChange={(v) => onValue(v)}
          />
        );
      case "longtext":
        return editing ? (
          <textarea
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
              onValue(val);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setVal(c.value ?? "");
                setEditing(false);
              }
            }}
            autoFocus
            rows={4}
            className="w-full h-full min-h-[80px] bg-transparent outline-none text-[11px] p-1.5 resize-y keep-case"
          />
        ) : (
          <button
            onDoubleClick={enterEdit}
            className="w-full h-full text-left text-[11px] p-1.5 whitespace-pre-wrap break-words text-muted-foreground"
          >
            {c.value || "—"}
          </button>
        );
      case "number":
        return editing ? (
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
              onValue(val);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onValue(val);
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
            inputMode="decimal"
            className="w-full h-full bg-transparent outline-none text-[11px] px-1.5 keep-case"
          />
        ) : (
          <button
            onDoubleClick={enterEdit}
            className={cn(
              "w-full h-full text-left text-[11px] px-1.5 truncate",
              !c.value && "text-muted-foreground"
            )}
          >
            {c.value || "—"}
          </button>
        );
      case "date":
        return editing ? (
          <input
            type="date"
            value={c.value ?? ""}
            onChange={(e) => onValue(e.target.value || null)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") setEditing(false);
            }}
            autoFocus
            className="w-full h-full bg-transparent outline-none text-[11px] px-1.5 keep-case"
          />
        ) : (
          <button
            onDoubleClick={enterEdit}
            className={cn(
              "w-full h-full text-left text-[11px] px-1.5 truncate",
              !c.value && "text-muted-foreground"
            )}
          >
            {c.value || "—"}
          </button>
        );
      case "link":
        return c.value && !editing ? (
          <a
            href={c.value.startsWith("http") ? c.value : `https://${c.value}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={enterEdit}
            className="w-full h-full flex items-center px-1.5 text-[11px] truncate underline underline-offset-2"
          >
            {c.value}
          </a>
        ) : editing ? (
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
              onValue(val);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onValue(val);
                setEditing(false);
              }
            }}
            autoFocus
            placeholder="https://"
            className="w-full h-full bg-transparent outline-none text-[11px] px-1.5 keep-case"
          />
        ) : (
          <button
            onDoubleClick={enterEdit}
            className={cn(
              "w-full h-full text-left text-[11px] px-1.5 truncate",
              !c.value && "text-muted-foreground"
            )}
          >
            {c.value || "—"}
          </button>
        );
      default: // text
        return editing ? (
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
              onValue(val);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onValue(val);
                setEditing(false);
              }
              if (e.key === "Escape") {
                setVal(c.value ?? "");
                setEditing(false);
              }
            }}
            autoFocus
            className="w-full h-full bg-transparent outline-none text-[11px] px-1.5 keep-case"
          />
        ) : (
          <button
            onDoubleClick={enterEdit}
            className={cn(
              "w-full h-full text-left text-[11px] px-1.5 truncate",
              !c.value && "text-muted-foreground"
            )}
          >
            {c.value || "—"}
          </button>
        );
    }
  };

  return (
    <div
      className="relative border-r shrink-0 group/cell"
      style={{ width: col.width, minHeight: 40 }}
    >
      <div className="h-full w-full">{renderContent()}</div>

      {/* hidden file input for media uploads */}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = "";
        }}
      />

      {/* nested grid toggle — bottom-right of every cell that may host a
          nested spreadsheet. hidden at the deepest level (no 4th level).
          always visible but subtle so it works on touch devices (no hover). */}
      {allowNesting && (
        <button
          onClick={toggleNested}
          className={cn(
            "absolute bottom-0.5 right-0.5 h-4 w-4 grid place-items-center rounded-sm btn-quiet transition-opacity",
            hasNested
              ? "opacity-90 bg-background border"
              : "opacity-30 hover:opacity-100"
          )}
        >
          {nestedExpanded ? (
            <ChevronDown className="w-2.5 h-2.5" />
          ) : (
            <ChevronRight className="w-2.5 h-2.5" />
          )}
        </button>
      )}

      {/* nested grid panel — an absolutely positioned surface so it can be
          wider/taller than its host cell without disturbing the row layout.
          the same grid renders fullscreen on top when requested, keeping the
          inline instance mounted so scroll state is preserved on exit. */}
      {hasNested && nestedExpanded && c.nestedGrid && (
        <NestedGridPanel
          grid={c.nestedGrid}
          depth={depth}
          viewSize={c.nestedView}
          onChange={(ng) => onNested(ng)}
          onViewSize={(nv) => onNestedView(nv)}
          onRemove={() => {
            onNested(null);
            onNestedView(null);
            setNestedExpanded(false);
          }}
          fullscreen={fullscreen}
          onFullscreen={setFullscreen}
        />
      )}
    </div>
  );
}

// a nested spreadsheet rendered inside a cell. it floats as an absolutely
// positioned surface anchored below the cell so it can be wider/taller than
// its host cell without disturbing the row layout. width and height are
// independently resizable and persisted via onViewSize.
function NestedGridPanel({
  grid,
  depth,
  viewSize,
  onChange,
  onViewSize,
  onRemove,
  fullscreen,
  onFullscreen,
}: {
  grid: GridData;
  depth: number;
  viewSize: { w: number; h: number } | null;
  onChange: (g: GridData) => void;
  onViewSize: (nv: { w: number; h: number } | null) => void;
  onRemove: () => void;
  fullscreen: boolean;
  onFullscreen: (v: boolean) => void;
}) {
  const w = viewSize?.w ?? DEFAULT_NESTED_W;
  const h = viewSize?.h ?? DEFAULT_NESTED_H;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);

  // pointer-based resize for width, height, or both. works with mouse and
  // touch alike.
  const startResize = (e: React.PointerEvent, mode: "w" | "h" | "both") => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = w;
    const startH = h;
    const move = (ev: PointerEvent) => {
      const nextW = mode === "h" ? w : Math.max(MIN_NESTED_W, startW + (ev.clientX - startX));
      const nextH = mode === "w" ? h : Math.max(MIN_NESTED_H, startH + (ev.clientY - startY));
      onViewSize({ w: nextW, h: nextH });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <>
      <div
        className="absolute left-0 top-full z-20 mt-0.5 border rounded-md bg-background shadow-sm flex flex-col"
        style={{ width: w, height: h }}
      >
        {/* header */}
        <div className="flex items-center justify-between px-1.5 h-6 border-b bg-muted/30 shrink-0">
          <span className="text-[9px] text-muted-foreground">
            {grid.rows.length} rows · {grid.columns.length} cols
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onFullscreen(true)}
              className="h-5 w-5 grid place-items-center rounded btn-quiet"
            >
              <Maximize className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="h-5 w-5 grid place-items-center rounded btn-quiet"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>

        {/* grid viewport — scrolls internally so the panel never grows the page.
            established as its own stacking context (relative z-0) so the resize
            handles below always paint above it and stay hit-testable. */}
        <div
          ref={bodyRef}
          className="flex-1 min-h-0 overflow-auto grid-scroll scroll-thin relative z-0"
        >
          <Grid data={grid} onChange={onChange} depth={depth + 1} />
        </div>

        {/* resize handles */}
        <div
          onPointerDown={(e) => startResize(e, "w")}
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-foreground/20 z-20"
        />
        <div
          onPointerDown={(e) => startResize(e, "h")}
          className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-foreground/20 z-20"
        />
        <div
          onPointerDown={(e) => startResize(e, "both")}
          className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize hover:bg-foreground/20 z-20"
        />
      </div>

      {/* fullscreen overlay — the same grid at full workspace size, with zoom
          and navigation. rendered through a portal to document.body so it
          escapes any transformed ancestor (the zoomed grid surface) and truly
          fills the viewport. the inline panel above stays mounted underneath so
          its scroll position is preserved when the user exits fullscreen. */}
      {fullscreen &&
        createPortal(
          <NestedFullscreen
            grid={grid}
            depth={depth}
            onChange={onChange}
            onClose={() => onFullscreen(false)}
          />,
          document.body
        )}

      {/* delete confirmation — identifies the nested spreadsheet by size */}
      <ConfirmDialog
        open={confirming}
        onOpenChange={(o) => !o && setConfirming(false)}
        title="delete nested spreadsheet"
        description={`this will permanently delete this nested spreadsheet (${grid.rows.length} ${grid.rows.length === 1 ? "row" : "rows"} · ${grid.columns.length} ${grid.columns.length === 1 ? "col" : "cols"}) and all cells, deeper nested spreadsheets, and attachments inside it. this cannot be undone.`}
        onConfirm={() => {
          setConfirming(false);
          onRemove();
        }}
      />
    </>
  );
}

// fullscreen view of a nested spreadsheet. occupies the whole application
// workspace and offers the same zoom, scrolling, editing, and nesting as the
// main spreadsheet — operating on the very same grid data (no duplication).
function NestedFullscreen({
  grid,
  depth,
  onChange,
  onClose,
}: {
  grid: GridData;
  depth: number;
  onChange: (g: GridData) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* top bar */}
      <div className="h-10 shrink-0 border-b flex items-center gap-1 px-2">
        <button
          onClick={onClose}
          className="h-7 px-2 text-xs rounded-md bg-foreground text-background btn-quiet flex items-center gap-1.5"
        >
          <X className="w-3 h-3" />
          exit
        </button>
        <span className="text-[10px] text-muted-foreground ml-1">
          nested · level {depth + 1}
        </span>
      </div>
      {/* the zoomable/scrollable spreadsheet surface */}
      <div className="flex-1 min-h-0 relative">
        <NestedSurface grid={grid} depth={depth + 1} onChange={onChange} />
      </div>
    </div>
  );
}

function EmptyMedia({
  icon,
  onClick,
}: {
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full h-full min-h-[40px] grid place-items-center text-muted-foreground btn-quiet"
    >
      {icon}
    </button>
  );
}

// media cells live in separate files for clarity
function ImageCell(props: {
  attachmentId: string;
  filename: string;
  onReplace: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="relative w-full h-full min-h-[40px] p-1 group/m">
      <img
        src={api.attachmentUrl(props.attachmentId)}
        alt={props.filename}
        className="w-full h-full max-h-64 object-contain rounded-sm bg-muted/20"
      />
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover/m:opacity-100 transition-opacity">
        <button
          onClick={props.onReplace}
          className="h-5 w-5 grid place-items-center rounded bg-background/90 border btn-quiet"
        >
          <Plus className="w-2.5 h-2.5" />
        </button>
        <button
          onClick={props.onRemove}
          className="h-5 w-5 grid place-items-center rounded bg-background/90 border btn-quiet"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}

function FileCell(props: {
  attachmentId: string;
  filename: string;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const isPdf = props.filename.toLowerCase().endsWith(".pdf");
  const isMd = /\.(md|markdown|txt)$/i.test(props.filename);
  const [preview, setPreview] = useState(false);
  return (
    <div className="w-full h-full min-h-[40px] p-1 group/m relative">
      <button
        onClick={() => (isPdf || isMd ? setPreview(true) : undefined)}
        className="w-full flex items-center gap-1.5 px-1.5 h-7 rounded border btn-quiet"
      >
        <FileText className="w-3 h-3 shrink-0" />
        <span className="text-[10px] truncate keep-case">{props.filename}</span>
      </button>
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover/m:opacity-100 transition-opacity">
        <button
          onClick={props.onReplace}
          className="h-5 w-5 grid place-items-center rounded bg-background/90 border btn-quiet"
        >
          <Plus className="w-2.5 h-2.5" />
        </button>
        <button
          onClick={props.onRemove}
          className="h-5 w-5 grid place-items-center rounded bg-background/90 border btn-quiet"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
      {preview && (
        <FilePreview
          url={api.attachmentUrl(props.attachmentId)}
          filename={props.filename}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  );
}

// markdown + file preview imported lazily to keep the main bundle small
function MarkdownCell({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <>
      <button
        onDoubleClick={() => setShow(true)}
        className="w-full h-full min-h-[40px] text-left text-[11px] p-1.5 text-muted-foreground truncate"
      >
        {value ? value.slice(0, 40) + (value.length > 40 ? "…" : "") : "md"}
      </button>
      {show && (
        <MarkdownEditor
          value={value ?? ""}
          onChange={(v) => onChange(v)}
          onClose={() => setShow(false)}
        />
      )}
    </>
  );
}
