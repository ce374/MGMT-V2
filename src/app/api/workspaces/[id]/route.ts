import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const ws = await db.workspace.findUnique({
    where: { id },
    include: {
      folders: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      files: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!ws) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    id: ws.id,
    name: ws.name,
    createdAt: ws.createdAt,
    updatedAt: ws.updatedAt,
    folders: ws.folders.map((f) => ({
      id: f.id,
      name: f.name,
      workspaceId: f.workspaceId,
      parentId: f.parentId,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
    files: ws.files.map((f) => ({
      id: f.id,
      name: f.name,
      workspaceId: f.workspaceId,
      folderId: f.folderId,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
  });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "").toString().trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const ws = await db.workspace.update({ where: { id }, data: { name } });
  return NextResponse.json({ id: ws.id, name: ws.name });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  await db.workspace.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
