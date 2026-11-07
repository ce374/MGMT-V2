// core grid data model — everything is organized inside cells,
// and cells themselves can contain complete additional spreadsheet structures.

export type CellType =
  | "text"
  | "longtext"
  | "number"
  | "date"
  | "link"
  | "image"
  | "audio"
  | "file"
  | "markdown";

export const CELL_TYPES: CellType[] = [
  "text",
  "longtext",
  "number",
  "date",
  "link",
  "image",
  "audio",
  "file",
  "markdown",
];

export const CELL_TYPE_LABELS: Record<CellType, string> = {
  text: "text",
  longtext: "long text",
  number: "number",
  date: "date",
  link: "link",
  image: "image",
  audio: "audio",
  file: "file",
  markdown: "markdown",
};

export interface ColumnDef {
  id: string;
  name: string;
  type: CellType;
  width: number;
}

export interface CellDef {
  id: string;
  // primitive value stored as string; numeric types parse on read
  value: string | null;
  // reference to an Attachment row for media/file cells
  attachmentId: string | null;
  // a cell may contain an entire nested spreadsheet structure
  nestedGrid: GridData | null;
  // viewport dimensions (px) the user has chosen for the nested spreadsheet
  // embedded in this cell. null = use the default size.
  nestedView: { w: number; h: number } | null;
}

export interface RowDef {
  id: string;
  height: number;
  // cells align to columns by index
  cells: CellDef[];
}

export interface GridData {
  columns: ColumnDef[];
  rows: RowDef[];
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  name: string;
  workspaceId: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  children?: Folder[];
  files?: FileMeta[];
}

export interface FileMeta {
  id: string;
  name: string;
  workspaceId: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileRecord extends FileMeta {
  data: string;
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

// ---- factory helpers ----

export function makeId(): string {
  // compact unique id
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

export function emptyGrid(): GridData {
  return { columns: [], rows: [] };
}

export function makeColumn(name = "field", type: CellType = "text", width = 180): ColumnDef {
  return { id: makeId(), name, type, width };
}

export function makeCell(): CellDef {
  return { id: makeId(), value: null, attachmentId: null, nestedGrid: null, nestedView: null };
}

export function makeRow(columnCount: number, height = 40): RowDef {
  const cells: CellDef[] = [];
  for (let i = 0; i < columnCount; i++) cells.push(makeCell());
  return { id: makeId(), height, cells };
}

// maximum nesting depth of spreadsheets.
//   depth 0 = main spreadsheet (level 1)
//   depth 1 = nested in a cell of the main spreadsheet (level 2)
//   depth 2 = nested in a cell of a level-2 spreadsheet (level 3)
// a fourth level is not permitted.
export const MAX_NEST_DEPTH = 2;

// ensure every row has a cell for every column (and vice versa)
export function normalizeGrid(grid: GridData): GridData {
  const colCount = grid.columns.length;
  const rows = grid.rows.map((r) => {
    const cells = [...r.cells];
    while (cells.length < colCount) cells.push(makeCell());
    while (cells.length > colCount) cells.pop();
    // backfill nestedView for cells loaded from older documents and ensure
    // nested grids are themselves normalized.
    const normed = cells.map((c) => ({
      ...c,
      nestedView: c.nestedView ?? null,
      nestedGrid: c.nestedGrid ? normalizeGrid(c.nestedGrid) : null,
    }));
    return { ...r, cells: normed };
  });
  return { columns: grid.columns, rows };
}

// deep clone a grid (including all nested grids)
export function cloneGrid(grid: GridData): GridData {
  return {
    columns: grid.columns.map((c) => ({ ...c })),
    rows: grid.rows.map((r) => ({
      ...r,
      cells: r.cells.map((c) => ({
        ...c,
        nestedGrid: c.nestedGrid ? cloneGrid(c.nestedGrid) : null,
      })),
    })),
  };
}

// collect all attachment ids referenced anywhere in a grid (including nested)
export function collectAttachmentIds(grid: GridData): string[] {
  const ids: string[] = [];
  const walk = (g: GridData) => {
    for (const row of g.rows) {
      for (const cell of row.cells) {
        if (cell.attachmentId) ids.push(cell.attachmentId);
        if (cell.nestedGrid) walk(cell.nestedGrid);
      }
    }
  };
  walk(grid);
  return ids;
}

export function parseGrid(json: string): GridData {
  try {
    const parsed = JSON.parse(json) as GridData;
    if (!parsed || !Array.isArray(parsed.columns) || !Array.isArray(parsed.rows)) {
      return emptyGrid();
    }
    return normalizeGrid(parsed);
  } catch {
    return emptyGrid();
  }
}

export function serializeGrid(grid: GridData): string {
  return JSON.stringify(grid);
}

// a fresh grid with one text column and one empty row, so the user
// sees a real spreadsheet immediately instead of a blank void.
export function starterGrid(): GridData {
  const col = makeColumn("field 1", "text", 200);
  const row = makeRow(1, 40);
  return { columns: [col], rows: [row] };
}
