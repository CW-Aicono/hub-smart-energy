import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SalesLayout } from "@/components/sales/SalesLayout";
import { SalesProjectForm, type SalesProjectFormValues } from "@/components/sales/SalesProjectForm";
import { Skeleton } from "@/components/ui/skeleton";

export default function SalesProjectEdit() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Partial<SalesProjectFormValues> | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("sales_projects")
      .select("kunde_name, kunde_typ, kontakt_name, kontakt_email, kontakt_telefon, adresse, notizen")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setValues({
            kunde_name: data.kunde_name ?? "",
            kunde_typ: data.kunde_typ ?? "standard",
            kontakt_name: data.kontakt_name ?? "",
            kontakt_email: data.kontakt_email ?? "",
            kontakt_telefon: data.kontakt_telefon ?? "",
            adresse: data.adresse ?? "",
            notizen: data.notizen ?? "",
          });
        }
        setLoading(false);
      });
  }, [id]);

  return (
    <SalesLayout title="Projekt bearbeiten" showBack backTo={id ? `/sales/${id}` : "/sales"}>
      {loading || !values ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <SalesProjectForm mode="edit" projectId={id} initialValues={values} />
      )}
    </SalesLayout>
  );
}
