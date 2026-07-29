import { useState, useCallback, useEffect, useMemo } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { AnalyticsSidebar } from "@/components/analytics/AnalyticsSidebar";
import { AnalyticsCanvas } from "@/components/analytics/AnalyticsCanvas";
import { TimeRangeToolbar } from "@/components/analytics/TimeRangeToolbar";
import { WorkspaceToolbar } from "@/components/analytics/WorkspaceToolbar";
import { StoryManagerDialog } from "@/components/analytics/story/StoryManagerDialog";
import { StoryPresenter } from "@/components/analytics/story/StoryPresenter";
import { extractStory, withStory, StoryStep } from "@/components/analytics/story/storyTypes";
import { useAnalysisWorkspaces, AnalysisWorkspace, AnalysisBlock, WorkspaceInput } from "@/hooks/useAnalysisWorkspaces";
import { AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { DeviceTreeNode } from "@/hooks/useDeviceTree";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Clapperboard, Play } from "lucide-react";
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
  const [layout, setLayout] = useState<Record<string, unknown>>({});
  const [period, setPeriod] = useState<AnalyticsPeriod>("day");
  const [offset, setOffset] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [draggedNode, setDraggedNode] = useState<DeviceTreeNode | null>(null);
  const [storyOpen, setStoryOpen] = useState(false);
  const [presenting, setPresenting] = useState<{ startIndex: number } | null>(null);

  // Load active workspace blocks when selected
  useEffect(() => {
    if (activeWorkspace) {
      setBlocks((activeWorkspace.blocks as AnalysisBlock[]) ?? []);
      setLayout((activeWorkspace.layout as Record<string, unknown>) ?? {});
    } else {
      setBlocks([]);
      setLayout({});
    }
  }, [activeWorkspace]);

  const story = useMemo(() => extractStory(layout), [layout]);

  const setSteps = (steps: StoryStep[]) => {
    setLayout((prev) => withStory(prev, { steps }));
  };

  const currentState: WorkspaceInput = {
    name: activeWorkspace?.name ?? "Neue Analyse",
    description: activeWorkspace?.description ?? undefined,
    layout,
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setStoryOpen(true)}
            >
              <Clapperboard className="h-4 w-4" />
              Story {story.steps.length > 0 && <span className="text-[10px] text-muted-foreground">({story.steps.length})</span>}
            </Button>
            {story.steps.length > 0 && (
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                onClick={() => setPresenting({ startIndex: 0 })}
              >
                <Play className="h-4 w-4" /> Präsentieren
              </Button>
            )}
            <WorkspaceToolbar
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              onLoad={setActiveWorkspace}
              onSave={handleCreate}
              onSaveExisting={handleUpdate}
              onDelete={handleDelete}
              currentState={currentState}
            />
          </div>
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

      <StoryManagerDialog
        open={storyOpen}
        onOpenChange={setStoryOpen}
        steps={story.steps}
        onStepsChange={setSteps}
        currentPeriod={period}
        currentOffset={offset}
        blocks={blocks}
        onPresent={(startIndex) => {
          setStoryOpen(false);
          setPresenting({ startIndex });
        }}
      />

      {presenting && (
        <StoryPresenter
          open
          onClose={() => setPresenting(null)}
          steps={story.steps}
          startIndex={presenting.startIndex}
          blocks={blocks}
        />
      )}
    </div>
  );
}
