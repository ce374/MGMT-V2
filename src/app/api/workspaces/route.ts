import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const workspaces = await db.workspace.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { folders: true, files: true } } },
  });
  return NextResponse.json(
    workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      folderCount: w._count.folders,
      fileCount: w._count.files,
    }))
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "").toString().trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  // create the workspace only — no files, no folders. the user starts empty
  // and adds content from inside the workspace.
  const ws = await db.workspace.create({ data: { name } });
  return NextResponse.json({
    id: ws.id,
    name: ws.name,
    createdAt: ws.createdAt,
    updatedAt: ws.updatedAt,
  });
}
