import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Server, Trash2, Loader2, Plug } from "lucide-react";
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
  type: z.string().min(1, "Typ ist erforderlich"),
  description: z.string().optional(),
});

type IntegrationFormData = z.infer<typeof integrationSchema>;

const Integrations = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { tenant } = useTenant();
  const { integrations, loading, createIntegration, deleteIntegration, refetch } = useIntegrations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<IntegrationFormData>({
    resolver: zodResolver(integrationSchema),
    defaultValues: {
      name: "",
      type: "loxone_miniserver",
      description: "",
    },
  });

  const onSubmit = async (data: IntegrationFormData) => {
    const { error } = await createIntegration({
      name: data.name,
      type: data.type,
      description: data.description || null,
      icon: "server",
      config: {},
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

  if (authLoading) {
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
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Integration erstellen
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Neue Integration</DialogTitle>
                  <DialogDescription>
                    Erstellen Sie eine neue Integration, die an Standorten verwendet werden kann
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
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Typ</FormLabel>
                          <FormControl>
                            <Input placeholder="loxone_miniserver" {...field} />
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
                        onClick={() => setDialogOpen(false)}
                      >
                        Abbrechen
                      </Button>
                      <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Erstellen...
                          </>
                        ) : (
                          "Erstellen"
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {integrations.map((integration) => (
                <Card key={integration.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Server className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{integration.name}</CardTitle>
                          <Badge variant="secondary" className="mt-1">
                            {integration.type}
                          </Badge>
                        </div>
                      </div>
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
                  </CardHeader>
                  {integration.description && (
                    <CardContent>
                      <CardDescription>{integration.description}</CardDescription>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Integrations;
