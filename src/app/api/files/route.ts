import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeGrid, starterGrid } from "@/lib/grid-types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "untitled").toString().trim() || "untitled";
  const workspaceId = (body.workspaceId ?? "").toString().trim();
  const folderId = body.folderId ? (body.folderId as string) : null;
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }
  // append at the end of the current siblings
  const agg = await db.file.aggregate({
    where: { workspaceId, folderId },
    _max: { order: true },
  });
  const order = (agg._max.order ?? -1) + 1;
  const file = await db.file.create({
    data: {
      name,
      workspaceId,
      folderId,
      // a fresh grid with one text column and one empty row, so the user
      // sees a real spreadsheet immediately instead of a blank void.
      data: serializeGrid(starterGrid()),
      order,
    },
  });
  return NextResponse.json({
    id: file.id,
    name: file.name,
    workspaceId: file.workspaceId,
    folderId: file.folderId,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  });
}
