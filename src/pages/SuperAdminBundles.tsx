import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useModuleBundles } from "@/hooks/useModuleBundles";
import { useModulePrices } from "@/hooks/useModulePrices";
import { ALL_MODULES } from "@/hooks/useTenantModules";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Package } from "lucide-react";

const editableModules = ALL_MODULES.filter((m) => !("alwaysOn" in m));

interface BundleFormData {
  name: string;
  description: string;
  price_monthly: string;
  module_codes: string[];
}

const emptyForm: BundleFormData = { name: "", description: "", price_monthly: "", module_codes: [] };

const SuperAdminBundles = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { t } = useSATranslation();
  const { bundles, isLoading, createBundle, updateBundle, deleteBundle, getBundleModules } = useModuleBundles();
  const { getPrice } = useModulePrices();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BundleFormData>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (bundleId: string) => {
    const bundle = bundles.find((b) => b.id === bundleId);
    if (!bundle) return;
    const modules = getBundleModules(bundleId).map((i) => i.module_code);
    setEditingId(bundleId);
    setForm({
      name: bundle.name,
      description: bundle.description || "",
      price_monthly: String(bundle.price_monthly),
      module_codes: modules,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const price = parseFloat(form.price_monthly);
    if (!form.name.trim() || isNaN(price)) return;
    const payload = { name: form.name.trim(), description: form.description.trim(), price_monthly: price, module_codes: form.module_codes };
    if (editingId) {
      updateBundle.mutate({ id: editingId, ...payload }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createBundle.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const toggleModule = (code: string) => {
    setForm((prev) => ({
      ...prev,
      module_codes: prev.module_codes.includes(code)
        ? prev.module_codes.filter((c) => c !== code)
        : [...prev.module_codes, code],
    }));
  };

  const getModuleLabel = (code: string) => ALL_MODULES.find((m) => m.code === code)?.label ?? code;

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("bundles.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("bundles.subtitle")}</p>
          </div>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />{t("bundles.create")}</Button>
        </header>

        <div className="p-6 space-y-4">
          {isLoading && <div className="text-muted-foreground animate-pulse">{t("common.loading")}</div>}

          {!isLoading && bundles.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>{t("bundles.empty")}</p>
              </CardContent>
            </Card>
          )}

          {bundles.map((bundle) => {
            const modules = getBundleModules(bundle.id);
            return (
              <Card key={bundle.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                  <div>
                    <CardTitle className="text-lg">{bundle.name}</CardTitle>
                    {bundle.description && <p className="text-sm text-muted-foreground mt-1">{bundle.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">{Number(bundle.price_monthly).toFixed(2)} €/Mo</span>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(bundle.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(bundle.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {modules.map((item) => (
                      <Badge key={item.id} variant="secondary">{getModuleLabel(item.module_code)}</Badge>
                    ))}
                    {modules.length === 0 && <span className="text-sm text-muted-foreground">{t("bundles.no_modules")}</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? t("bundles.edit") : t("bundles.create")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("common.name")}</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <Label>{t("bundles.description")}</Label>
                <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
              </div>
              <div>
                <Label>{t("bundles.price_monthly")}</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} step={0.01} value={form.price_monthly} onChange={(e) => setForm((p) => ({ ...p, price_monthly: e.target.value }))} className="text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  <span className="text-sm text-muted-foreground">€/Mo</span>
                </div>
                {(() => {
                  const regularPrice = form.module_codes.reduce((sum, code) => sum + getPrice(code), 0);
                  const bundlePrice = parseFloat(form.price_monthly) || 0;
                  const discount = regularPrice > 0 ? Math.round((1 - bundlePrice / regularPrice) * 100) : 0;
                  return (
                    <div className="mt-2 text-sm text-muted-foreground flex items-center justify-between">
                      <span>Regulärer Preis: {regularPrice.toFixed(2)} €/Mo</span>
                      {regularPrice > 0 && bundlePrice > 0 && (
                        <span className={discount > 0 ? "text-green-600 font-medium" : "text-destructive font-medium"}>
                          {discount > 0 ? `−${discount}% Rabatt` : discount === 0 ? "Kein Rabatt" : `+${Math.abs(discount)}% Aufschlag`}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div>
                <Label className="mb-2 block">{t("bundles.select_modules")}</Label>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {editableModules.map((mod) => (
                    <div key={mod.code} className="flex items-center gap-2">
                      <Checkbox
                        id={`mod-${mod.code}`}
                        checked={form.module_codes.includes(mod.code)}
                        onCheckedChange={() => toggleModule(mod.code)}
                      />
                      <label htmlFor={`mod-${mod.code}`} className="text-sm cursor-pointer">{mod.label}</label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={handleSave} disabled={createBundle.isPending || updateBundle.isPending}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("bundles.delete_title")}</AlertDialogTitle>
              <AlertDialogDescription>{t("bundles.delete_confirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => { if (deleteId) deleteBundle.mutate(deleteId); setDeleteId(null); }}>
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
};

export default SuperAdminBundles;
