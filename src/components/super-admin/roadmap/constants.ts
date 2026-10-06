export const STATUS_LABELS: Record<string, string> = {
  backlog: "Ideen / Backlog",
  next: "Als Nächstes",
  in_progress: "In Arbeit",
  waiting: "Wartet auf Nutzer",
  review: "Prüfung",
  done: "Erledigt",
};

export const STATUS_ORDER = ["backlog", "next", "in_progress", "waiting", "review", "done"] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  stability: "Stabilität",
  data_quality: "Datenqualität",
  feature: "Feature",
  tech_debt: "Technische Schuld",
};

export const CATEGORY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  stability: "destructive",
  data_quality: "secondary",
  feature: "default",
  tech_debt: "outline",
};
