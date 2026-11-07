import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { promises as fs, createReadStream } from "fs";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const att = await db.attachment.findUnique({ where: { id } });
  if (!att) return NextResponse.json({ error: "not found" }, { status: 404 });
  const filePath = path.join(UPLOAD_DIR, att.path);
  try {
    await fs.access(filePath);
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 410 });
  }
  const stat = await fs.stat(filePath);
  // support range requests for audio seeking
  const range = req.headers.get("range");
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      const stream = createReadStream(filePath, { start, end });
      const headers = new Headers({
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": att.mimeType,
        "Cache-Control": "private, max-age=3600",
      });
      return new NextResponse(stream as unknown as ReadableStream, {
        status: 206,
        headers,
      });
    }
  }
  const stream = createReadStream(filePath);
  const headers = new Headers({
    "Content-Type": att.mimeType,
    "Content-Length": String(stat.size),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `inline; filename="${encodeURIComponent(att.filename)}"`,
  });
  return new NextResponse(stream as unknown as ReadableStream, {
    status: 200,
    headers,
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const att = await db.attachment.findUnique({ where: { id } });
  if (att) {
    try {
      await fs.unlink(path.join(UPLOAD_DIR, att.path));
    } catch {
      // file may already be gone
    }
    await db.attachment.delete({ where: { id } });
  }
  return NextResponse.json({ ok: true });
}
