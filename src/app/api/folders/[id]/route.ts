import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { moveFolder } from "@/lib/reorder";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  // rename only
  if (body.name !== undefined && body.parentId === undefined && body.index === undefined) {
    const name = (body.name as string).trim();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const folder = await db.folder.update({ where: { id }, data: { name } });
    return NextResponse.json({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
    });
  }

  // move + reorder. parentId may be null (root) or a folder id. index is the
  // desired position among the new siblings; omit to append.
  const parentId =
    body.parentId === null ? null : body.parentId ? (body.parentId as string) : undefined;
  const index =
    body.index === null || body.index === undefined ? null : Number(body.index);

  if (parentId === undefined) {
    return NextResponse.json({ error: "nothing to do" }, { status: 400 });
  }

  const moved = await moveFolder(id, parentId, index);
  if (!moved) {
    return NextResponse.json(
      { error: "invalid move (would create a cycle)" },
      { status: 400 }
    );
  }
  return NextResponse.json({
    id: moved.id,
    name: moved.name,
    parentId: moved.parentId,
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  // cascading delete handles children + files
  await db.folder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
