import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface EmailTemplate {
  id: string;
  tenant_id: string;
  template_key: string;
  name: string;
  subject: string;
  body_html: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type EmailTemplateInsert = Omit<EmailTemplate, "id" | "created_at" | "updated_at">;

const DEFAULT_TEMPLATES: Omit<EmailTemplateInsert, "tenant_id">[] = [
  {
    template_key: "charging_invoice",
    name: "Ladeabrechnung",
    subject: "Ihre monatliche Ladeabrechnung – {{month}} {{year}}",
    body_html: `<h2>Ihre Ladeabrechnung für {{month}} {{year}}</h2>
<p>Sehr geehrte/r {{user_name}},</p>
<p>anbei erhalten Sie Ihre monatliche Abrechnung für die Nutzung unserer Ladeinfrastruktur.</p>
<table>
  <tr><th>Gesamtenergie</th><td>{{total_energy}} kWh</td></tr>
  <tr><th>Ladevorgänge</th><td>{{session_count}}</td></tr>
  <tr><th>Gesamtbetrag</th><td>{{total_amount}} {{currency}}</td></tr>
</table>
{{sessions_table}}
<p>Mit freundlichen Grüßen,<br/>{{tenant_name}}</p>`,
    description: "Wird monatlich an Ladenutzer mit hinterlegter E-Mail versendet.",
    is_active: true,
  },
  {
    template_key: "user_invitation",
    name: "Benutzereinladung",
    subject: "Einladung zu {{tenant_name}}",
    body_html: `<h2>Sie wurden eingeladen!</h2>
<p>Hallo,</p>
<p>Sie wurden eingeladen, {{tenant_name}} beizutreten. Klicken Sie auf den folgenden Link, um Ihr Konto zu aktivieren:</p>
<p><a href="{{invite_link}}">Einladung annehmen</a></p>
<p>Mit freundlichen Grüßen,<br/>{{tenant_name}}</p>`,
    description: "Wird versendet, wenn ein neuer Benutzer eingeladen wird.",
    is_active: true,
  },
  {
    template_key: "scheduled_report",
    name: "Automatischer Report",
    subject: "Energiebericht – {{report_name}} ({{period}})",
    body_html: `<h2>Energiebericht: {{report_name}}</h2>
<p>Sehr geehrte Damen und Herren,</p>
<p>anbei erhalten Sie den automatisch erstellten Energiebericht für den Zeitraum {{period}}.</p>
{{report_content}}
<p>Mit freundlichen Grüßen,<br/>{{tenant_name}}</p>`,
    description: "Wird für automatische Energieberichte verwendet.",
    is_active: true,
  },
];

export function useEmailTemplates() {
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("template_key");
      if (error) throw error;
      return data as EmailTemplate[];
    },
  });

  const upsertTemplate = useMutation({
    mutationFn: async (tpl: Partial<EmailTemplate> & { tenant_id: string; template_key: string; name: string; subject: string; body_html: string }) => {
      const { data, error } = await supabase
        .from("email_templates")
        .upsert(tpl, { onConflict: "tenant_id,template_key" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ title: "Vorlage gespeichert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ title: "Vorlage gelöscht" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { templates, isLoading, upsertTemplate, deleteTemplate, DEFAULT_TEMPLATES };
}
