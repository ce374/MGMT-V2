import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeGrid, parseGrid, serializeGrid } from "@/lib/grid-types";
import { moveFile } from "@/lib/reorder";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const file = await db.file.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    id: file.id,
    name: file.name,
    workspaceId: file.workspaceId,
    folderId: file.folderId,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    data: parseGrid(file.data),
  });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  // auto-save: persist the full grid document
  if (body.data !== undefined) {
    const grid = normalizeGrid(body.data);
    const file = await db.file.update({
      where: { id },
      data: { data: serializeGrid(grid) },
    });
    return NextResponse.json({
      id: file.id,
      updatedAt: file.updatedAt,
    });
  }
  // rename only
  if (body.name !== undefined && body.folderId === undefined && body.index === undefined) {
    const name = (body.name as string).trim();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const file = await db.file.update({ where: { id }, data: { name } });
    return NextResponse.json({
      id: file.id,
      name: file.name,
      folderId: file.folderId,
      updatedAt: file.updatedAt,
    });
  }
  // move + reorder. folderId may be null (root) or a folder id. index is the
  // desired position among the new siblings; omit to append.
  const folderId =
    body.folderId === null ? null : body.folderId ? (body.folderId as string) : undefined;
  const index =
    body.index === null || body.index === undefined ? null : Number(body.index);
  if (folderId === undefined) {
    return NextResponse.json({ error: "nothing to do" }, { status: 400 });
  }
  const moved = await moveFile(id, folderId, index);
  if (!moved) {
    return NextResponse.json({ error: "invalid move" }, { status: 400 });
  }
  return NextResponse.json({
    id: moved.id,
    name: moved.name,
    folderId: moved.folderId,
    updatedAt: moved.updatedAt,
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  await db.file.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
