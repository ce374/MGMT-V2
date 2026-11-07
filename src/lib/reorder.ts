import { db } from "@/lib/db";

// reorder helpers for folders and files.
// siblings are items sharing the same parent (folderId/parentId) within a
// workspace. we keep an integer `order` per sibling and renumber 0..n-1 on
// every move so the sequence never drifts.

export type SiblingKind = "folder" | "file";

function clampIndex(n: number, max: number) {
  if (n < 0) return 0;
  if (n > max) return max;
  return Math.floor(n);
}

// move a folder to a new parent (or root) at a given index among its new
// siblings. prevents moving a folder into itself or any of its descendants.
// returns the moved folder or null if the move was rejected.
export async function moveFolder(
  id: string,
  parentId: string | null,
  index: number | null
) {
  const folder = await db.folder.findUnique({ where: { id } });
  if (!folder) return null;

  // reject cycles: target parent must not be the folder itself or one of its
  // descendants. only meaningful when nesting under another folder.
  if (parentId) {
    if (parentId === id) return null;
    // walk up from the target parent; if we ever reach `id`, it's a descendant.
    let cur: string | null = parentId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      if (cur === id) return null;
      seen.add(cur);
      const p = await db.folder.findUnique({ where: { id: cur }, select: { parentId: true } });
      cur = p?.parentId ?? null;
    }
  }

  // siblings under the new parent, excluding the moved folder, in current order.
  const siblings = await db.folder.findMany({
    where: { workspaceId: folder.workspaceId, parentId, NOT: { id } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const at = clampIndex(index ?? siblings.length, siblings.length);
  const ordered = [...siblings.map((s) => s.id)];
  ordered.splice(at, 0, id);

  await db.$transaction(
    ordered.map((sid, i) =>
      db.folder.update({
        where: { id: sid },
        data: { order: i, parentId: sid === id ? parentId : undefined },
      })
    )
  );

  return db.folder.findUnique({ where: { id } });
}

// move a file to a new folder (or root) at a given index among its new siblings.
export async function moveFile(
  id: string,
  folderId: string | null,
  index: number | null
) {
  const file = await db.file.findUnique({ where: { id } });
  if (!file) return null;

  const siblings = await db.file.findMany({
    where: { workspaceId: file.workspaceId, folderId, NOT: { id } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const at = clampIndex(index ?? siblings.length, siblings.length);
  const ordered = [...siblings.map((s) => s.id)];
  ordered.splice(at, 0, id);

  await db.$transaction(
    ordered.map((sid, i) =>
      db.file.update({
        where: { id: sid },
        data: { order: i, folderId: sid === id ? folderId : undefined },
      })
    )
  );

  return db.file.findUnique({ where: { id } });
}
