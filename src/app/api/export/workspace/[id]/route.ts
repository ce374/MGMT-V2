import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectAttachmentIds, parseGrid } from "@/lib/grid-types";
import path from "path";
import { createReadStream, promises as fs } from "fs";
import { createRequire } from "module";

const _require = createRequire(import.meta.url);
// yazl is CommonJS with a clean streaming api. we stream the zip straight to
// the client so very large workspaces (gb of media) never sit in memory.
const yazl = _require("yazl") as typeof import("yazl");

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const ws = await db.workspace.findUnique({
    where: { id },
    include: { folders: true, files: true },
  });
  if (!ws)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  // gather every attachment referenced anywhere (including nested grids)
  const referenced = new Set<string>();
  for (const file of ws.files) {
    const grid = parseGrid(file.data);
    for (const aid of collectAttachmentIds(grid)) referenced.add(aid);
  }
  const attachments = await db.attachment.findMany({
    where: { id: { in: [...referenced] } },
  });

  // the manifest preserves the complete hierarchy, nested grids, cell values,
  // relationships, and layout.
  const manifest = {
    version: 1,
    workspace: {
      id: ws.id,
      name: ws.name,
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt,
    },
    folders: ws.folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
    files: ws.files.map((f) => ({
      id: f.id,
      name: f.name,
      folderId: f.folderId,
      data: f.data,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
    attachments: attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      path: a.path,
    })),
  };

  const zipfile = new yazl.ZipFile();
  zipfile.addBuffer(
    Buffer.from(JSON.stringify(manifest, null, 2)),
    "workspace.json"
  );

  // queue every attachment file. yazl reads each lazily as it streams out.
  for (const att of attachments) {
    const filePath = path.join(UPLOAD_DIR, att.path);
    try {
      await fs.access(filePath);
      zipfile.addReadStream(
        createReadStream(filePath),
        `attachments/${att.path}`
      );
    } catch {
      // skip missing files silently
    }
  }
  zipfile.end();

  const stream = new ReadableStream({
    start(controller) {
      zipfile.outputStream.on("data", (chunk: Buffer) =>
        controller.enqueue(new Uint8Array(chunk))
      );
      zipfile.outputStream.on("end", () => controller.close());
      zipfile.outputStream.on("error", (err: unknown) =>
        controller.error(err)
      );
    },
  });

  const safeName =
    ws.name.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40) || "workspace";
  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(safeName)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
