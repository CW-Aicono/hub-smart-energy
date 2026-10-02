import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { useTenantModules } from "@/hooks/useTenantModules";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { useDocuments, useDocumentCategories } from "@/hooks/useDocuments";
import { DocumentCard } from "@/components/documents/DocumentCard";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, Upload, Search } from "lucide-react";

export default function Documents() {
  const { user, loading } = useAuth();
  const { tenant } = useTenant();
  const { isModuleEnabled, isLoading: modLoading } = useTenantModules(tenant?.id ?? null);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [tab, setTab] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);

  const scopeFilter = tab === "all" ? undefined
    : tab === "tenant" ? { scope: "tenant" as const, scopeId: null }
    : tab === "location" ? { scope: "location" as const, scopeId: undefined }
    : tab === "invoice" ? { scope: "energy_supplier_invoice" as const, scopeId: undefined }
    : undefined;

  const { data: categories = [] } = useDocumentCategories();
  const { data: docs = [], isLoading } = useDocuments({
    search,
    categoryId: categoryId === "all" ? null : categoryId,
    scope: scopeFilter?.scope,
    // If a scope is chosen without a specific id, we filter after fetching by looking at links
  });

  // For the device tab, filter to docs that have any device-typed link
  const filteredDocs = (() => {
    if (tab === "devices") {
      const deviceScopes = new Set(["meter", "charge_point", "gateway_device", "energy_storage"]);
      return docs.filter((d) => (d.links ?? []).some((l) => deviceScopes.has(l.scope)));
    }
    if (tab === "location") {
      return docs.filter((d) => (d.links ?? []).some((l) => l.scope === "location"));
    }
    return docs;
  })();

  if (loading || modLoading) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Lade…</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isModuleEnabled("documentation")) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-4 md:p-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-display font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" /> Dokumentation
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Projekt-, Standort- und gerätebezogene Dokumente zentral verwalten.
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Neues Dokument
          </Button>
        </header>

        <div className="p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Titel oder Beschreibung suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kategorien</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="all">Alle</TabsTrigger>
              <TabsTrigger value="tenant">Tenant-weit</TabsTrigger>
              <TabsTrigger value="location">Standorte</TabsTrigger>
              <TabsTrigger value="devices">Geräte</TabsTrigger>
              <TabsTrigger value="invoice">Rechnungen</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-4">
              {isLoading && <p className="text-sm text-muted-foreground">Lade Dokumente…</p>}
              {!isLoading && filteredDocs.length === 0 && (
                <div className="border rounded-lg p-10 text-center text-muted-foreground">
                  Keine Dokumente gefunden. Lade ein erstes Dokument hoch.
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredDocs.map((d) => <DocumentCard key={d.id} document={d} />)}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <DocumentUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
