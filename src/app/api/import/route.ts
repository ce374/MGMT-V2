import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  type GridData,
  makeId,
  normalizeGrid,
} from "@/lib/grid-types";
import { promises as fs, createWriteStream } from "fs";
import path from "path";
import os from "os";
import { pipeline } from "stream/promises";
import { createRequire } from "module";

const _require = createRequire(import.meta.url);
const yauzl = _require("yauzl") as typeof import("yauzl");

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

interface Manifest {
  version: number;
  workspace: { id: string; name: string };
  folders: { id: string; name: string; parentId: string | null }[];
  files: {
    id: string;
    name: string;
    folderId: string | null;
    data: string;
  }[];
  attachments: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    path: string;
  }[];
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const tmp = path.join(os.tmpdir(), `import-${Date.now()}.zip`);
  await fs.writeFile(tmp, Buffer.from(await file.arrayBuffer()));
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  // walk the zip. workspace.json is small → buffered. attachments stream to
  // disk under their ORIGINAL name first; we rename after remapping ids.
  const manifest = await new Promise<Manifest>((resolve, reject) => {
    yauzl.open(tmp, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error("zip open failed"));
      let manifestData: Manifest | null = null;

      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }
        if (entry.fileName === "workspace.json") {
          zipfile.openReadStream(entry, (e, rs) => {
            if (e || !rs) return reject(e ?? new Error("read failed"));
            const chunks: Buffer[] = [];
            rs.on("data", (c) => chunks.push(c));
            rs.on("end", () => {
              try {
                manifestData = JSON.parse(
                  Buffer.concat(chunks).toString("utf-8")
                ) as Manifest;
              } catch (pe) {
                return reject(pe);
              }
              zipfile.readEntry();
            });
          });
          return;
        }
        if (entry.fileName.startsWith("attachments/")) {
          const storedName = path.basename(entry.fileName);
          zipfile.openReadStream(entry, async (e, rs) => {
            if (e || !rs) return reject(e ?? new Error("read failed"));
            const dest = path.join(UPLOAD_DIR, storedName);
            try {
              await pipeline(rs, createWriteStream(dest));
            } catch (pe) {
              return reject(pe);
            }
            zipfile.readEntry();
          });
          return;
        }
        zipfile.readEntry();
      });
      zipfile.on("end", () => {
        if (!manifestData)
          return reject(new Error("workspace.json missing"));
        resolve(manifestData);
      });
      zipfile.on("error", reject);
    });
  });

  // remap every id to a fresh one so re-imports never collide.
  const attMap = new Map<string, { newId: string; newPath: string }>();
  const folderMap = new Map<string, string>();
  const fileMap = new Map<string, string>();

  for (const a of manifest.attachments) {
    const newId = makeId();
    const ext = path.extname(a.path) || "";
    const newPath = `${newId}${ext}`;
    attMap.set(a.id, { newId, newPath });
  }
  for (const f of manifest.folders) folderMap.set(f.id, makeId());
  for (const f of manifest.files) fileMap.set(f.id, makeId());

  // rename attachment files on disk to their new ids
  for (const a of manifest.attachments) {
    const m = attMap.get(a.id)!;
    const oldPath = path.join(UPLOAD_DIR, a.path);
    const newPath = path.join(UPLOAD_DIR, m.newPath);
    try {
      await fs.rename(oldPath, newPath);
    } catch {
      // missing file — attachment will be skipped at db create
    }
  }

  // remap attachment ids inside every file's grid (including nested)
  const remapGrid = (data: string): string => {
    try {
      const grid = normalizeGrid(JSON.parse(data) as GridData);
      const walk = (g: GridData) => {
        for (const row of g.rows) {
          for (const cell of row.cells) {
            if (cell.attachmentId) {
              const m = attMap.get(cell.attachmentId);
              cell.attachmentId = m ? m.newId : null;
            }
            if (cell.nestedGrid) walk(cell.nestedGrid);
          }
        }
      };
      walk(grid);
      return JSON.stringify(grid);
    } catch {
      return data;
    }
  };

  const ws = await db.workspace.create({
    data: {
      name: manifest.workspace.name,
      folders: {
        create: manifest.folders.map((f) => ({
          id: folderMap.get(f.id)!,
          name: f.name,
          parentId: f.parentId ? (folderMap.get(f.parentId) ?? null) : null,
        })),
      },
      files: {
        create: manifest.files.map((f) => ({
          id: fileMap.get(f.id)!,
          name: f.name,
          folderId: f.folderId ? (folderMap.get(f.folderId) ?? null) : null,
          data: remapGrid(f.data),
        })),
      },
    },
    include: { folders: true, files: true },
  });

  // attachments
  for (const a of manifest.attachments) {
    const m = attMap.get(a.id)!;
    try {
      await fs.access(path.join(UPLOAD_DIR, m.newPath));
      await db.attachment.create({
        data: {
          id: m.newId,
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
          path: m.newPath,
        },
      });
    } catch {
      // file missing — skip
    }
  }

  fs.unlink(tmp).catch(() => {});

  return NextResponse.json({
    id: ws.id,
    name: ws.name,
    createdAt: ws.createdAt,
    updatedAt: ws.updatedAt,
  });
}
