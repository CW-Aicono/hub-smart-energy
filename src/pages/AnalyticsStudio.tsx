import { useState, useCallback, useEffect } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { AnalyticsSidebar } from "@/components/analytics/AnalyticsSidebar";
import { AnalyticsCanvas } from "@/components/analytics/AnalyticsCanvas";
import { TimeRangeToolbar } from "@/components/analytics/TimeRangeToolbar";
import { WorkspaceToolbar } from "@/components/analytics/WorkspaceToolbar";
import { useAnalysisWorkspaces, AnalysisWorkspace, AnalysisBlock, WorkspaceInput } from "@/hooks/useAnalysisWorkspaces";
import { AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { DeviceTreeNode } from "@/hooks/useDeviceTree";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const DEFAULT_BLOCKS: AnalysisBlock[] = [
  {
    id: "welcome",
    type: "kpi",
    title: "Willkommen im Analytics Studio",
    x: 0,
    y: 0,
    w: 12,
    h: 1,
    config: {},
  },
];

export default function AnalyticsStudio() {
  const { user } = useAuth();
  const { workspaces, isLoading, create, update, remove } = useAnalysisWorkspaces();
  const [activeWorkspace, setActiveWorkspace] = useState<AnalysisWorkspace | null>(null);
  const [blocks, setBlocks] = useState<AnalysisBlock[]>([]);
  const [period, setPeriod] = useState<AnalyticsPeriod>("day");
  const [offset, setOffset] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [draggedNode, setDraggedNode] = useState<DeviceTreeNode | null>(null);

  // Load active workspace blocks when selected
  useEffect(() => {
    if (activeWorkspace) {
      setBlocks((activeWorkspace.blocks as AnalysisBlock[]) ?? []);
    } else {
      setBlocks([]);
    }
  }, [activeWorkspace]);

  const currentState: WorkspaceInput = {
    name: activeWorkspace?.name ?? "Neue Analyse",
    description: activeWorkspace?.description ?? undefined,
    layout: activeWorkspace?.layout ?? {},
    blocks,
    is_shared: activeWorkspace?.is_shared ?? false,
  };

  const handleCreate = useCallback(
    async (input: WorkspaceInput) => {
      const created = await create(input);
      setActiveWorkspace(created);
      toast.success("Workspace gespeichert");
    },
    [create]
  );

  const handleUpdate = useCallback(
    async (id: string, input: WorkspaceInput) => {
      const updated = await update({ id, ...input });
      setActiveWorkspace(updated);
      toast.success("Workspace aktualisiert");
    },
    [update]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await remove(id);
      if (activeWorkspace?.id === id) setActiveWorkspace(null);
      toast.success("Workspace gelöscht");
    },
    [remove, activeWorkspace]
  );

  const handleDragStart = useCallback((node: DeviceTreeNode) => {
    setDraggedNode(node);
  }, []);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
        <AnalyticsSidebar onDragStart={handleDragStart} />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <header className="h-14 border-b flex items-center justify-between px-4 bg-card/30 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold">Analytics Studio</h1>
            <TimeRangeToolbar period={period} offset={offset} onPeriodChange={setPeriod} onOffsetChange={setOffset} />
          </div>
          <WorkspaceToolbar
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            onLoad={setActiveWorkspace}
            onSave={handleCreate}
            onSaveExisting={handleUpdate}
            onDelete={handleDelete}
            currentState={currentState}
          />
        </header>
        {isLoading ? (
          <div className="flex-1 p-6 space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-96" />
          </div>
        ) : (
          <AnalyticsCanvas
            blocks={blocks}
            period={period}
            offset={offset}
            editMode={editMode}
            onBlocksChange={setBlocks}
            onEditModeChange={setEditMode}
            pendingNode={draggedNode}
            onNodeAssigned={() => setDraggedNode(null)}
          />
        )}
      </main>
    </div>
  );
}
