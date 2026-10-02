import { AnalyticsPeriod } from "@/hooks/useAnalyticsData";

export interface StoryStep {
  id: string;
  title: string;
  description?: string;
  period: AnalyticsPeriod;
  offset: number;
  focusBlockIds?: string[];
  hiddenBlockIds?: string[];
}

export interface StoryConfig {
  steps: StoryStep[];
}

export function extractStory(layout: Record<string, unknown> | null | undefined): StoryConfig {
  const raw = (layout ?? {}) as Record<string, unknown>;
  const s = raw.story as StoryConfig | undefined;
  return { steps: Array.isArray(s?.steps) ? s!.steps : [] };
}

export function withStory(
  layout: Record<string, unknown> | null | undefined,
  story: StoryConfig,
): Record<string, unknown> {
  return { ...(layout ?? {}), story };
}
