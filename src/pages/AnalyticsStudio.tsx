import { useState, useCallback, useEffect, useMemo } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { AnalyticsSidebar } from "@/components/analytics/AnalyticsSidebar";
import { AnalyticsCanvas } from "@/components/analytics/AnalyticsCanvas";
import { TimeRangeToolbar } from "@/components/analytics/TimeRangeToolbar";
import { WorkspaceToolbar } from "@/components/analytics/WorkspaceToolbar";
import { StoryManagerDialog } from "@/components/analytics/story/StoryManagerDialog";
import { StoryPresenter } from "@/components/analytics/story/StoryPresenter";
import { extractStory, withStory, StoryStep } from "@/components/analytics/story/storyTypes";
import { TemplateGalleryDialog } from "@/components/analytics/TemplateGalleryDialog";
import { ShareWorkspaceDialog } from "@/components/analytics/ShareWorkspaceDialog";
import { OnboardingTour } from "@/components/analytics/OnboardingTour";
import { useAnalysisWorkspaces, AnalysisWorkspace, AnalysisBlock, WorkspaceInput } from "@/hooks/useAnalysisWorkspaces";
import { useAnalysisTemplates } from "@/hooks/useAnalysisTemplates";
import { AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { DeviceTreeNode } from "@/hooks/useDeviceTree";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Clapperboard, Play, HelpCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { saveAsTemplate } = useAnalysisTemplates();

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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowOnboarding(true)}
              title="Kurzeinführung erneut anzeigen"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
            <WorkspaceToolbar
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              onLoad={setActiveWorkspace}
              onSave={handleCreate}
              onSaveExisting={handleUpdate}
              onDelete={handleDelete}
              onOpenTemplates={() => setTemplatesOpen(true)}
              onOpenShare={() => setShareOpen(true)}
              onSaveAsTemplate={() => {
                setTemplateName(activeWorkspace?.name ?? "");
                setTemplateDesc(activeWorkspace?.description ?? "");
                setSaveAsTemplateOpen(true);
              }}
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

      <TemplateGalleryDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onSelect={(tpl) => {
          setActiveWorkspace(null);
          setBlocks((tpl.blocks as AnalysisBlock[]) ?? []);
          setLayout((tpl.layout as Record<string, unknown>) ?? {});
          setTemplatesOpen(false);
          toast.success(`Vorlage "${tpl.name}" geladen`);
        }}
      />

      {activeWorkspace && (
        <ShareWorkspaceDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          workspace={activeWorkspace}
          onWorkspaceUpdated={(w) => setActiveWorkspace(w)}
        />
      )}

      <Dialog open={saveAsTemplateOpen} onOpenChange={setSaveAsTemplateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Als Vorlage speichern</DialogTitle>
            <DialogDescription>Die Vorlage wird für alle Nutzer deines Mandanten verfügbar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Beschreibung (optional)</Label>
              <Textarea value={templateDesc} onChange={(e) => setTemplateDesc(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsTemplateOpen(false)}>Abbrechen</Button>
            <Button
              onClick={async () => {
                if (!templateName.trim()) return;
                await saveAsTemplate({
                  name: templateName.trim(),
                  description: templateDesc.trim() || null,
                  layout,
                  blocks,
                });
                setSaveAsTemplateOpen(false);
                toast.success("Vorlage gespeichert");
              }}
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OnboardingTour open={showOnboarding} onOpenChange={setShowOnboarding} />
    </div>
  );
}
