import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { promises as fs } from "fs";
import path from "path";
import { makeId } from "@/lib/grid-types";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// accept multipart upload of a single file. stored on disk, metadata in db.
// returns the attachment id which the frontend stores inside a cell.
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const id = makeId();
  const ext = path.extname(file.name) || "";
  const storedName = `${id}${ext}`;
  const storedPath = path.join(UPLOAD_DIR, storedName);

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  // stream the file to disk instead of buffering fully into memory
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(storedPath, buf);

  const att = await db.attachment.create({
    data: {
      id,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      path: storedName,
    },
  });
  return NextResponse.json({
    id: att.id,
    filename: att.filename,
    mimeType: att.mimeType,
    size: att.size,
  });
}
