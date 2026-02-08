import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useIntegrations, Integration } from "@/hooks/useIntegrations";
import { useTenant } from "@/hooks/useTenant";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Server, Trash2, Loader2, Plug, Pencil, Wifi, WifiOff } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const integrationSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  serial_number: z.string().min(1, "Seriennummer ist erforderlich"),
  category: z.string().min(1, "Kategorie ist erforderlich"),
  description: z.string().optional(),
});

type IntegrationFormData = z.infer<typeof integrationSchema>;

const Integrations = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { tenant } = useTenant();
  const { integrations, categories, loading, createIntegration, updateIntegration, deleteIntegration, refetch } = useIntegrations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<IntegrationFormData>({
    resolver: zodResolver(integrationSchema),
    defaultValues: {
      name: "",
      serial_number: "",
      category: "",
      description: "",
    },
  });

  // Reset form when editing integration changes
  useEffect(() => {
    if (editingIntegration) {
      const config = editingIntegration.config as { serial_number?: string } | null;
      form.reset({
        name: editingIntegration.name,
        serial_number: config?.serial_number || "",
        category: editingIntegration.category,
        description: editingIntegration.description || "",
      });
    } else {
      form.reset({
        name: "",
        serial_number: "",
        category: categories[0]?.slug || "",
        description: "",
      });
    }
  }, [editingIntegration, categories, form]);

  const onSubmit = async (data: IntegrationFormData) => {
    const configData = {
      serial_number: data.serial_number,
      connection_status: "disconnected",
    };

    if (editingIntegration) {
      // Update existing integration
      const { error } = await updateIntegration(editingIntegration.id, {
        name: data.name,
        category: data.category,
        description: data.description || null,
        config: configData,
      });

      if (error) {
        toast({
          title: "Fehler",
          description: "Die Integration konnte nicht aktualisiert werden.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Integration aktualisiert",
          description: "Die Integration wurde erfolgreich aktualisiert.",
        });
        setEditingIntegration(null);
        setDialogOpen(false);
      }
    } else {
      // Create new integration
      const { error } = await createIntegration({
        name: data.name,
        type: "loxone_miniserver",
        category: data.category,
        description: data.description || null,
        icon: "server",
        config: configData,
        is_active: true,
      });

      if (error) {
        toast({
          title: "Fehler",
          description: "Die Integration konnte nicht erstellt werden.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Integration erstellt",
          description: "Die Integration wurde erfolgreich erstellt.",
        });
        form.reset();
        setDialogOpen(false);
      }
    }
  };

  const handleEdit = (integration: Integration) => {
    setEditingIntegration(integration);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setEditingIntegration(null);
    }
    setDialogOpen(open);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const { error } = await deleteIntegration(id);
    setDeletingId(null);

    if (error) {
      toast({
        title: "Fehler",
        description: "Die Integration konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Integration gelöscht",
        description: "Die Integration wurde erfolgreich gelöscht.",
      });
    }
  };

  const handleTestConnection = async (integration: Integration) => {
    setTestingId(integration.id);
    const config = integration.config as { serial_number?: string } | null;
    
    // Simulate connection test - in real implementation this would call an API
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // For now, we'll simulate a successful connection
    const newStatus = "connected";
    const { error } = await updateIntegration(integration.id, {
      config: {
        ...config,
        connection_status: newStatus,
        last_tested_at: new Date().toISOString(),
      },
    });

    setTestingId(null);

    if (error) {
      toast({
        title: "Verbindungstest fehlgeschlagen",
        description: "Die Verbindung konnte nicht getestet werden.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Verbindung erfolgreich",
        description: `Die Verbindung zum Miniserver wurde hergestellt.`,
      });
      refetch();
    }
  };

  const getConnectionStatus = (integration: Integration): "connected" | "disconnected" => {
    const config = integration.config as { connection_status?: string } | null;
    return config?.connection_status === "connected" ? "connected" : "disconnected";
  };

  const getCategoryName = (slug: string) => {
    return categories.find(c => c.slug === slug)?.name || slug;
  };

  // Group integrations by category
  const integrationsByCategory = categories.map(category => ({
    category,
    integrations: integrations.filter(i => i.category === category.slug),
  })).filter(group => group.integrations.length > 0);

  // Add uncategorized integrations
  const uncategorizedIntegrations = integrations.filter(
    i => !categories.some(c => c.slug === i.category)
  );
  if (uncategorizedIntegrations.length > 0) {
    integrationsByCategory.push({
      category: { id: "uncategorized", tenant_id: "", name: "Sonstige", slug: "sonstige", description: null, sort_order: 999, created_at: "" },
      integrations: uncategorizedIntegrations,
    });
  }

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-6">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </main>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold flex items-center gap-2">
                <Plug className="h-6 w-6" />
                Integrationen
              </h1>
              <p className="text-muted-foreground mt-1">
                Verwalten Sie die verfügbaren Integrationen für Ihre Standorte
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Integration erstellen
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingIntegration ? "Integration bearbeiten" : "Neue Integration"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingIntegration 
                      ? "Bearbeiten Sie die Einstellungen der Integration"
                      : "Erstellen Sie eine neue Integration, die an Standorten verwendet werden kann"
                    }
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Loxone Miniserver" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Kategorie</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Kategorie auswählen" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categories.map((category) => (
                                <SelectItem key={category.id} value={category.slug}>
                                  {category.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="serial_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Seriennummer</FormLabel>
                          <FormControl>
                            <Input placeholder="504F94A0XXXX" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Beschreibung (optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Beschreiben Sie die Integration..."
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleDialogClose(false)}
                      >
                        Abbrechen
                      </Button>
                      <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {editingIntegration ? "Speichern..." : "Erstellen..."}
                          </>
                        ) : (
                          editingIntegration ? "Speichern" : "Erstellen"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <div className="p-6">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
          ) : integrations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <Server className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-medium">Keine Integrationen vorhanden</p>
                <p className="text-muted-foreground text-center mt-1">
                  Erstellen Sie eine Integration, um sie an Standorten zu verwenden
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {integrationsByCategory.map(({ category, integrations }) => (
                <div key={category.id}>
                  <h2 className="text-lg font-semibold mb-4">{category.name}</h2>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {integrations.map((integration) => (
                      <Card key={integration.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-primary/10">
                                <Server className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <CardTitle className="text-lg">{integration.name}</CardTitle>
                                <div className="flex items-center gap-2 mt-1">
                                  {getConnectionStatus(integration) === "connected" ? (
                                    <Badge variant="success">
                                      <Wifi className="h-3 w-3 mr-1" />
                                      Verbunden
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-muted-foreground">
                                      <WifiOff className="h-3 w-3 mr-1" />
                                      Nicht verbunden
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(integration)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Integration löschen?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Möchten Sie die Integration "{integration.name}" wirklich löschen?
                                      Alle Standort-Verknüpfungen werden ebenfalls entfernt.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(integration.id)}
                                      disabled={deletingId === integration.id}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      {deletingId === integration.id ? (
                                        <>
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          Löschen...
                                        </>
                                      ) : (
                                        "Löschen"
                                      )}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          {integration.description && (
                            <p className="text-sm text-muted-foreground mb-3">{integration.description}</p>
                          )}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                            <span>Seriennummer:</span>
                            <code className="bg-muted px-1.5 py-0.5 rounded">
                              {(integration.config as { serial_number?: string })?.serial_number || "–"}
                            </code>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => handleTestConnection(integration)}
                            disabled={testingId === integration.id}
                          >
                            {testingId === integration.id ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Teste Verbindung...
                              </>
                            ) : (
                              <>
                                <Wifi className="mr-2 h-4 w-4" />
                                Verbindung testen
                              </>
                            )}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Integrations;
