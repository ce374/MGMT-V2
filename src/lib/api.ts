import type {
  Workspace,
  Folder,
  FileMeta,
  FileRecord,
  GridData,
  AttachmentMeta,
} from "./grid-types";

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg || `request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface WorkspaceSummary extends Workspace {
  folderCount: number;
  fileCount: number;
}

export interface WorkspaceDetail extends Workspace {
  folders: Folder[];
  files: FileMeta[];
}

export const api = {
  // workspaces
  listWorkspaces: () => jfetch<WorkspaceSummary[]>("/api/workspaces"),
  createWorkspace: (name: string) =>
    jfetch<Workspace>("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  getWorkspace: (id: string) => jfetch<WorkspaceDetail>(`/api/workspaces/${id}`),
  renameWorkspace: (id: string, name: string) =>
    jfetch<Workspace>(`/api/workspaces/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  deleteWorkspace: (id: string) =>
    jfetch<{ ok: true }>(`/api/workspaces/${id}`, { method: "DELETE" }),

  // folders
  createFolder: (name: string, workspaceId: string, parentId: string | null) =>
    jfetch<Folder>("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, workspaceId, parentId }),
    }),
  renameFolder: (id: string, name: string) =>
    jfetch<Folder>(`/api/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  // move a folder into another folder (or root) at a given index among its
  // new siblings. omit index to append to the end.
  moveFolder: (id: string, parentId: string | null, index?: number) =>
    jfetch<Folder>(`/api/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId, index: index ?? null }),
    }),
  deleteFolder: (id: string) =>
    jfetch<{ ok: true }>(`/api/folders/${id}`, { method: "DELETE" }),

  // files
  createFile: (name: string, workspaceId: string, folderId: string | null) =>
    jfetch<FileMeta>("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, workspaceId, folderId }),
    }),
  getFile: (id: string) => jfetch<FileRecord>(`/api/files/${id}`),
  saveFile: (id: string, data: GridData) =>
    jfetch<{ id: string; updatedAt: string }>(`/api/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    }),
  renameFile: (id: string, name: string) =>
    jfetch<FileMeta>(`/api/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  // move a file into another folder (or root) at a given index among its new
  // siblings. omit index to append to the end.
  moveFile: (id: string, folderId: string | null, index?: number) =>
    jfetch<FileMeta>(`/api/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId, index: index ?? null }),
    }),
  deleteFile: (id: string) =>
    jfetch<{ ok: true }>(`/api/files/${id}`, { method: "DELETE" }),

  // attachments
  uploadAttachment: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return jfetch<AttachmentMeta>("/api/attachments", {
      method: "POST",
      body: form,
    });
  },
  deleteAttachment: (id: string) =>
    jfetch<{ ok: true }>(`/api/attachments/${id}`, { method: "DELETE" }),
  attachmentUrl: (id: string) => `/api/attachments/${id}`,

  // export / import
  exportUrl: (workspaceId: string) =>
    `/api/export/workspace/${workspaceId}`,
  importWorkspace: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return jfetch<Workspace>("/api/import", { method: "POST", body: form });
  },
};
