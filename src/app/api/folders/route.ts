import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "").toString().trim();
  const workspaceId = (body.workspaceId ?? "").toString().trim();
  const parentId = body.parentId ? (body.parentId as string) : null;
  if (!name || !workspaceId) {
    return NextResponse.json({ error: "name and workspaceId required" }, { status: 400 });
  }
  // append at the end of the current siblings so a new folder lands last.
  const agg = await db.folder.aggregate({
    where: { workspaceId, parentId },
    _max: { order: true },
  });
  const order = (agg._max.order ?? -1) + 1;
  const folder = await db.folder.create({
    data: { name, workspaceId, parentId, order },
  });
  return NextResponse.json({
    id: folder.id,
    name: folder.name,
    workspaceId: folder.workspaceId,
    parentId: folder.parentId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  });
}
