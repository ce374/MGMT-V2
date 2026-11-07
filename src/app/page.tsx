"use client";

import { useCallback, useState } from "react";
import { WorkspaceList } from "@/components/workspace-list";
import { WorkspaceView } from "@/components/workspace-view";

export default function Page() {
  const [view, setView] = useState<
    | { mode: "list" }
    | { mode: "workspace"; id: string }
  >({ mode: "list" });

  // workspace list refresh token — bump to refetch
  const [token, setToken] = useState(0);
  const refresh = useCallback(() => setToken((t) => t + 1), []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 flex flex-col">
        {view.mode === "list" ? (
          <WorkspaceList
            key={token}
            onOpen={(id) => setView({ mode: "workspace", id })}
            onChanged={refresh}
          />
        ) : (
          <WorkspaceView
            workspaceId={view.id}
            onBack={() => {
              setView({ mode: "list" });
              refresh();
            }}
          />
        )}
      </main>
    </div>
  );
}
